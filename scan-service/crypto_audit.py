import time
import socket
import json
import sys
import asyncio
import base64
import requests
import contextlib
import uuid
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import List, Dict, Any, Union, Optional, TypeVar, overload
from enum import Enum
import logging
from logging_config import setup_logging
import httpx

from fastapi import FastAPI, HTTPException, Query, Path, Request, status
from fastapi.responses import StreamingResponse, JSONResponse # Import JSONResponse
from fastapi.exceptions import RequestValidationError # Import RequestValidationError
from pydantic import BaseModel, Field, validator
from fastapi.middleware.cors import CORSMiddleware
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from exceptions import APIError # Import APIError
from progress_tracker import ScanProgressTracker
from scanner_adapter import transform_internal_scan_to_ssllabs_format, extract_additional_metadata
from tls_scanner import scan_domain as internal_scan_domain



import requests
import os

# --- Logging Setup ---
setup_logging("SCAN-SERVICE", logging.DEBUG)
logger = logging.getLogger(__name__)

# --- Remote Scoring Configuration ---
SCORING_SERVICE_URL = os.getenv("SCORING_SERVICE_URL", "http://localhost:9500")

# --- External Scanner Configuration ---
EXTERNAL_TLS_SCANNER_URL = os.getenv("EXTERNAL_TLS_SCANNER_URL", "http://ssl-tls-scanner-new:8010")

# --- PQ Scanner Configuration ---
OQS_PQ_SCANNER_URL = os.getenv("OQS_PQ_SCANNER_URL", "http://oqs-pq-scanner:8011")

# --- Feature Flag for Internal Scanner (default: false) ---
USE_INTERNAL_SCANNER = os.getenv("USE_INTERNAL_SCANNER", "false") == "true"

def extract_algorithms_from_tls_scan(scan_data: Dict) -> List[Dict]:  # noqa: C901
    """Transform TLS scan data into the standard algorithm-scoring payload.

    Key design decisions that fix the original scoring bugs:

    1. **Named/elliptic curves first** — ``supported_elliptic_curves`` holds every
       group the server actively supports (X25519, secp256r1, X25519MLKEM768, …).
       These are added as ``kex`` entries at the best positions so the scorer sees
       the *actual* key-exchange capability, not just the generic "ECDHE" label.

    2. **No duplicate ECDHE kex** — TLS 1.2/1.3 cipher-suite rows whose
       ``key_exchange`` is only "ECDHE" / "ECDH" are skipped for kex scoring
       because the concrete curves are already captured in step 1.  Suites that
       use DHE, FFDHE, or RSA *are* kept because they are distinct from the curves.

    3. **TLS 1.3 symmetric wins priority** — TLS 1.3 cipher suites always use
       AEAD (AES-256-GCM, ChaCha20-Poly1305, …).  They are placed before TLS 1.2
       symmetric entries so the scorer rewards the best available encryption.

    4. **Skip "Unknown" encryption** — cipher suites without a recognised
       encryption mode (e.g. bare RSA or DSS suites) are omitted from the
       symmetric list rather than dragging the average to zero.

    5. **Certificate signatures unchanged** — cert chain is appended last.
    """
    algorithms: List[Dict] = []

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    # Map curve name → typical bit length for context enrichment.
    _CURVE_BITS: Dict[str, int] = {
        "X25519": 256, "X448": 448, "CURVE25519": 256, "CURVE448": 448,
        "SECP224R1": 224, "SECP256R1": 256, "SECP256K1": 256,
        "SECP384R1": 384, "SECP521R1": 521,
        "PRIME256V1": 256, "P-256": 256, "P-384": 384, "P-521": 521,
        "BRAINPOOLP256R1": 256, "BRAINPOOLP384R1": 384, "BRAINPOOLP512R1": 512,
        "FFDHE2048": 2048, "FFDHE3072": 3072, "FFDHE4096": 4096,
        "FFDHE6144": 6144, "FFDHE8192": 8192,
        # PQ-hybrid groups — use classical component size here; the table score
        # already reflects the elevated PQ security.
        "X25519MLKEM768": 256, "X25519-MLKEM768": 256, "X25519MLKEM1024": 256,
        "X25519KYBER768DRAFT00": 256, "X25519KYBER512DRAFT00": 256,
        "P256KYBER512DRAFT00": 256, "P384KYBER768DRAFT00": 384,
        "SECP256R1MLKEM768": 256, "SECP384R1MLKEM1024": 384,
        "SECP256R1KYBER768": 256, "SECP256R1-MLKEM768": 256,
        "MLKEM768": 3168, "MLKEM1024": 6528, "KYBER768": 3168,
    }

    _GENERIC_ECDHE = {"ECDHE", "ECDH", "ECDH-RSA", "ECDH-ECDSA"}

    def _enc_key_size(enc_name: str) -> int:
        """Infer symmetric key length from encryption algorithm name."""
        u = enc_name.upper()
        if "256" in u or "CHACHA20" in u or "XCHACHA20" in u:
            return 256
        if "192" in u:
            return 192
        if "128" in u:
            return 128
        return 128  # safe fallback

    # ------------------------------------------------------------------
    # Step 1 — Supported named/elliptic groups (the real KEX algorithms)
    # ------------------------------------------------------------------
    tls_cfg = scan_data.get("tls_configuration", {})
    supported_curves_data = (
        tls_cfg.get("supported_elliptic_curves", {})
    )
    # Tolerate two common key names: "curves" and "groups"
    curve_list: List[Dict] = (
        supported_curves_data.get("curves")
        or supported_curves_data.get("groups")
        or []
    )
    # Deduplicate while preserving order (server preference order)
    seen_curves: set = set()
    for pos, curve_entry in enumerate(curve_list):
        cname = (
            curve_entry.get("name")
            or curve_entry.get("group")
            or curve_entry.get("id", "")
        )
        if not cname:
            continue
        cname_upper = cname.upper()
        if cname_upper in seen_curves:
            continue
        # Skip inferred PQC groups — they are false positives (TLS 1.3 connectivity
        # does not prove the server negotiates PQC hybrid key exchange).
        if curve_entry.get("type") == "PQC-Hybrid-Inferred":
            continue
        seen_curves.add(cname_upper)
        cbits = (
            curve_entry.get("bits")
            or curve_entry.get("key_size")
            or _CURVE_BITS.get(cname_upper, 0)
        )
        algorithms.append({
            "name": cname,
            "algorithm_type": "kex",
            "curve": cname,
            "curve_bits": cbits,
            "key_size": cbits,
            "position": pos,
            "context": {"source": "supported_groups", "prefer": True},
        })

    # ------------------------------------------------------------------
    # Step 2 — TLS 1.3 symmetric (AEAD only — always strong)
    # ------------------------------------------------------------------
    tls13_suites = tls_cfg.get("tls_1.3_cipher_suites", {}).get("suites", [])
    tls13_sym_offset = 0
    for idx, suite in enumerate(tls13_suites):
        enc = suite.get("encryption", "")
        if not enc or enc.upper() in ("UNKNOWN", "NONE", "NULL", ""):
            continue
        algorithms.append({
            "name": enc,
            "algorithm_type": "symmetric",
            "key_size": _enc_key_size(enc),
            "position": tls13_sym_offset + idx,
            "context": {"protocol": "TLS 1.3", "cipher_suite": suite.get("name", "")},
        })
        tls13_sym_offset += 1  # each accepted entry occupies a slot

    # ------------------------------------------------------------------
    # Step 3 — TLS 1.2 symmetric (skip "Unknown" / NULL entries)
    # ------------------------------------------------------------------
    tls12_suites = tls_cfg.get("tls_1.2_cipher_suites", {}).get("suites", [])
    tls12_sym_base = tls13_sym_offset  # continue after TLS 1.3 entries
    seen_enc: set = set()
    for idx, suite in enumerate(tls12_suites):
        enc = suite.get("encryption", "")
        if not enc or enc.upper() in ("UNKNOWN", "NONE", "NULL", ""):
            continue
        enc_upper = enc.upper()
        if enc_upper in seen_enc:
            continue  # avoid scoring identical encryption modes many times
        seen_enc.add(enc_upper)
        algorithms.append({
            "name": enc,
            "algorithm_type": "symmetric",
            "key_size": _enc_key_size(enc),
            "position": tls12_sym_base + idx,
            "context": {"protocol": "TLS 1.2", "cipher_suite": suite.get("name", "")},
        })

    # ------------------------------------------------------------------
    # Step 4 — TLS 1.2 KEX for *non-ECDHE* types (DHE, FFDHE, RSA, PSK)
    #          ECDHE kex is already covered fully by supported_groups above.
    # ------------------------------------------------------------------
    kex_base = len(seen_curves)  # cursor after the curve entries
    for idx, suite in enumerate(tls12_suites):
        kex_raw = suite.get("key_exchange", "")
        if not kex_raw:
            continue
        kex_upper = kex_raw.upper()
        # Skip generic ECDHE labels — already represented by named groups
        if kex_upper in _GENERIC_ECDHE:
            continue
        # Skip "Unknown" or empty
        if kex_upper in ("UNKNOWN", "NONE", "NULL", ""):
            continue
        # Enrich DHE with bits from cipher name where available
        cbits = suite.get("curve_bits", 0)
        if cbits == 0 and "DHE" in kex_upper:
            # Try to infer from cipher suite name (e.g. "DHE-RSA-AES256-SHA")
            cname_upper = suite.get("name", "").upper()
            for fbits_str in ("8192", "6144", "4096", "3072", "2048"):
                if fbits_str in cname_upper:
                    cbits = int(fbits_str)
                    break
        algorithms.append({
            "name": kex_raw,
            "algorithm_type": "kex",
            "curve": suite.get("curve"),
            "curve_bits": cbits,
            "key_size": cbits,
            "position": kex_base + idx,
            "context": {"protocol": "TLS 1.2", "cipher_suite": suite.get("name", "")},
        })

    # ------------------------------------------------------------------
    # Step 5 — Certificate signatures
    # ------------------------------------------------------------------
    cert_sigs = scan_data.get("signature_algorithms", {}).get("certificate_signatures", [])
    for cert in cert_sigs:
        algorithms.append({
            "name": cert.get("signature_algorithm", "RSA"),
            "algorithm_type": "signature",
            "key_size": cert.get("public_key_size"),
            "position": cert.get("position", 0),
            "context": {"source": "certificate"},
        })

    # ------------------------------------------------------------------
    # Step 6 — Protocol version entries (fills B-grade range; enables
    #           TLS 1.0/1.1 penalty + TLS 1.3 quality bonus in scorer)
    #
    # Protocol scores (from scorer.PROTOCOL_SCORES):
    #   TLS 1.3 → 90, TLS 1.2 → 75, TLS 1.1 → 40, TLS 1.0 → 20
    # These contribute via the 0.10-weight "protocol" component and also
    # power the protocol-aware bonus/penalty in _calculate_overall_score.
    # ------------------------------------------------------------------
    supported_protocols = (
        tls_cfg.get("supported_protocols", [])
        or scan_data.get("protocols", [])
    )
    # Map protocol name → numeric score (mirrors scorer.PROTOCOL_SCORES)
    _PROTO_BASE: Dict[str, int] = {
        "TLS 1.3": 90, "TLS 1.2": 75, "TLS 1.1": 40, "TLS 1.0": 20,
        "SSL 3.0": 0,  "SSL 2.0": 0,
    }
    for pos, proto in enumerate(supported_protocols):
        if proto in _PROTO_BASE:
            algorithms.append({
                "name": proto,
                "algorithm_type": "protocol",
                "position": pos,
                "context": {"source": "protocol_detection"},
            })

    return algorithms

from http_client import call_service

async def score_tls_scan_remote(transformed_result: Dict) -> Dict:
    """Call universal scoring service for TLS scan"""
    algorithms = extract_algorithms_from_tls_scan(transformed_result)
    
    payload = {
        "scoring_type": "tls",
        "algorithms": algorithms,
        "metadata": {
            "source": "internal_scanner",  # ✅ FIXED
            "domain": transformed_result.get("domain"),
            "protocols": transformed_result.get("tls_configuration", {}).get("supported_protocols", [])
        },
        "raw_response": transformed_result
    }
    
    try:
        response = await call_service(
            "POST",
            f"{SCORING_SERVICE_URL}/api/v1/score/tls-scan",
            json=payload,
            timeout=30,
        )
        return response.json()
    except Exception as e:
        logger.error(f"Scoring failed: {e}")
        return {"error": str(e)}

# External/Mock Dependencies (replace with your actual imports if necessary)
# NOTE: Assuming 'tls' and 'db_handler' are available or mocked for execution.
try:
    from db_handler import DatabaseHandler as AsyncDatabaseHandler
except ImportError:
    class MockDatabaseHandler:
        def __init__(self):
            self.enabled = False
            self.db_service_url = "mock_url"
        async def save_failed_scan(self, *args): return True
        async def save_scan_result(self, *args): return True
        async def get_scan_results(self, *args, **kwargs): return []
        async def get_scan_by_url(self, *args): return None
        async def get_scan_by_id(self, *args): return None
        async def search_scans(self, *args, **kwargs): return []
        async def _ensure_connected(self):
            logger.warning("MockDatabaseHandler: _ensure_connected called, mock connection is disabled.")
            self.enabled = False
            return
        async def delete_result_from_db(self, *args): return False
        async def clear_all_from_db(self, *args): return {"deleted_results": 0}
        async def get_statistics(self): return {}

    AsyncDatabaseHandler = MockDatabaseHandler
    logger.warning("Using MockDatabaseHandler. Ensure 'db_handler' module is installed for database functionality.")
# Initialize database handler (add after pqc_analyzer initialization)
db_handler = AsyncDatabaseHandler()

app = FastAPI(title="SSL Labs Scan Service", version="5.0")




from logging_middleware import correlation_middleware
app.middleware("http")(correlation_middleware)

class RateLimitException(Exception):
    """Custom exception for SSL Labs rate limiting."""
    pass

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]  # ✅ Add this
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors consistently"""
    logger.error(f"Validation error: {exc.errors()}")
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": {
                "error": "validation_error",
                "message": "Request validation failed",
                "errors": exc.errors(),
                "timestamp": datetime.now().isoformat()
            }
        }
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Catch-all for unexpected errors"""
    logger.exception(f"Unexpected error: {exc}")
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": {
                "error": "internal_error",
                "message": "An internal server error occurred",
                "timestamp": datetime.now().isoformat()
            }
        }
    )

class ScanStatus(str, Enum):
    PENDING = "pending"
    SCANNING = "scanning"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"

def normalize_domain_input(domain_input: str) -> str:
    """
    Normalize domain input to canonical format: protocol://hostname
    
    Accepts:
    - https://example.com
    - http://example.com  
    - www.example.com
    - example.com
    
    Returns: Canonical format (https:// or http://)
    """
    domain_input = domain_input.strip().lower()
    
    # Already has protocol
    if domain_input.startswith("https://") or domain_input.startswith("http://"):
        return domain_input.rstrip("/")
    
    # Has www prefix but no protocol
    if domain_input.startswith("www."):
        return f"https://{domain_input}".rstrip("/")
    
    # Plain domain - default to https
    return f"https://{domain_input}".rstrip("/")

def extract_hostname(domain: str) -> str:
    """
    Extract clean hostname from normalized domain.
    
    Input: https://www.example.com or http://example.com
    Output: example.com (no protocol, no www)
    """
    parsed = urlparse(domain)
    hostname = parsed.netloc or parsed.path
    
    # Remove www prefix
    if hostname.startswith("www."):
        hostname = hostname[4:]
    
    return hostname

class ScanRequest(BaseModel):
    domain: str
    max_concurrent: int = 5
    save_to_db: bool = True  # option to save to database
    
    @validator('domain')
    def validate_and_parse_domains(cls, v):
        """Parse and normalize comma-separated domains."""
        if ',' in v:
            domains = [d.strip() for d in v.split(',')]
        else:
            domains = [v.strip()]
        
        normalized = []
        for domain in domains:
            if not domain:
                continue
            
            # Normalize to canonical format
            canonical = normalize_domain_input(domain)
            
            # Avoid duplicates
            if canonical not in normalized:
                normalized.append(canonical)
        
        if not normalized:
            raise ValueError("No valid domains provided")
        
        return ','.join(normalized)

# In-memory retry state (no file storage)
class RetryState:
    def __init__(self):
        self.successful_domains: List[Dict[str, Any]] = []
        self.failed_domains: Dict[str, Dict[str, Any]] = {}  # domain -> error info
        self.current_round: int = 0
        self.total_rounds: int = 0
        self.total_processed: int = 0  # ✅ Add this
        
    def add_success(self, result: Dict[str, Any]):
        self.successful_domains.append(result)
    
    def add_failure(self, domain: str, error: str, attempt: int):
        self.failed_domains[domain] = {
            "domain": domain,
            "error": error,
            "last_attempt": attempt,
            "first_failed_at": self.failed_domains.get(domain, {}).get("first_failed_at", datetime.now().isoformat())
        }
    
    def get_failed_domains(self) -> List[str]:
        return list(self.failed_domains.keys())
    
    def remove_success(self, domain: str):
        # NOTE: This method is used incorrectly in the original code (it tries to remove a success from the *failed* list)
        # Assuming the intent was to remove the domain from the *failed_domains* list once successful.
        if domain in self.failed_domains:
            del self.failed_domains[domain]
    
    def clear(self):
        self.successful_domains.clear()
        self.failed_domains.clear()
        self.current_round = 0
        self.total_processed = 0

# Global dictionary to track cancellation requests
scan_cancellations: Dict[str, bool] = {}

def mark_scan_cancelled(request_id: str):
    scan_cancellations[request_id] = True

def is_scan_cancelled(request_id: str) -> bool:
    return scan_cancellations.get(request_id, False)

def clear_cancellation(request_id: str):
    if request_id in scan_cancellations:
        del scan_cancellations[request_id]


def extract_encryption_algorithm(cipher_name: str) -> str:
    """Extract encryption algorithm from cipher suite name.

    Handles both formats produced by the scanner:
      TLS 1.2 (OpenSSL dash format): ECDHE-RSA-AES256-GCM-SHA384
      TLS 1.3 (underscore format):   TLS_AES_256_GCM_SHA384
    """
    upper = cipher_name.upper()

    # ChaCha20 (check first — no ambiguity with AES numbers)
    if "CHACHA20" in upper:
        return "ChaCha20-Poly1305"

    # AES-256 variants
    if "AES256" in upper or "AES_256" in upper or "AES-256" in upper:
        if "GCM" in upper:
            return "AES-256-GCM"
        if "CCM" in upper:
            return "AES-256-CCM"
        if "CBC" in upper:
            return "AES-256-CBC"
        # AES256-SHA*, AES-256-SHA* (no explicit mode → CBC per OpenSSL convention)
        if "SHA" in upper:
            return "AES-256-CBC"
        return "AES-256"

    # AES-128 variants
    if "AES128" in upper or "AES_128" in upper or "AES-128" in upper:
        if "GCM" in upper:
            return "AES-128-GCM"
        if "CCM" in upper:
            return "AES-128-CCM"
        if "CBC" in upper:
            return "AES-128-CBC"
        if "SHA" in upper:
            return "AES-128-CBC"
        return "AES-128"

    # 3DES / DES
    if "3DES" in upper or "DES-CBC3" in upper:
        return "3DES"
    if "DES" in upper:
        return "DES"

    # RC4
    if "RC4" in upper:
        return "RC4"

    return "Unknown"

def extract_key_exchange(cipher_name: str, kx_type: Optional[str] = None) -> str:
    """Extract key exchange algorithm from cipher suite name."""
    upper = cipher_name.upper()
    if "ECDHE" in upper:
        return "ECDHE"
    if "ECDH" in upper or kx_type == "ECDH":
        return "ECDH"
    if "DHE" in upper:
        return "DHE"
    if "DH" in upper and "ECDH" not in upper:
        return "DH"
    if "RSA" in upper:
        return "RSA"
    if kx_type:
        return kx_type
    return "Unknown"

def extract_authentication(cipher_name: str) -> str:
    """Extract authentication algorithm from cipher suite name.
    
    Order matters: ECDSA checked before RSA because a name like
    ECDHE-RSA-AES256-GCM-SHA384 contains RSA (correct auth) while
    ECDHE-ECDSA-AES256-GCM-SHA384 contains both ECDSA and RSA substrings
    in some edge cases — checking ECDSA first avoids false RSA matches.
    """
    if "ECDSA" in cipher_name:
        return "ECDSA"
    if "RSA" in cipher_name:
        return "RSA"
    if "DSS" in cipher_name or "DSA" in cipher_name:
        return "DSS"
    return "Unknown"

def dict_to_tuple(d: Dict[str, Any]) -> tuple:
    """Convert dictionary to tuple for hashable comparison."""
    items = []
    for k, v in sorted(d.items()):
        if isinstance(v, dict):
            items.append((k, dict_to_tuple(v)))
        elif isinstance(v, list):
            items.append((k, tuple(v) if all(isinstance(i, (str, int, float, bool, type(None))) for i in v) else str(v)))
        else:
            items.append((k, v))
    return tuple(items)

T = TypeVar("T")

@overload
def remove_duplicates_from_structure(obj: Dict[str, Any]) -> Dict[str, Any]: ...
@overload
def remove_duplicates_from_structure(obj: List[T]) -> List[T]: ...
@overload
def remove_duplicates_from_structure(obj: T) -> T: ...

def remove_duplicates_from_structure(obj: Any) -> Any:
    """Recursively traverse the entire data structure and remove duplicates from all lists."""
    if isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            result[key] = remove_duplicates_from_structure(value)
        return result
    elif isinstance(obj, list):
        if obj and isinstance(obj[0], dict):
            seen = set()
            unique_items = []
            for item in obj:
                cleaned_item = remove_duplicates_from_structure(item)
                if isinstance(cleaned_item, dict):
                    item_tuple = dict_to_tuple(cleaned_item)
                    if item_tuple not in seen:
                        seen.add(item_tuple)
                        unique_items.append(cleaned_item)
            return unique_items
        elif obj and isinstance(obj[0], (str, int, float)):
            return list(dict.fromkeys(obj))
        else:
            return [remove_duplicates_from_structure(item) for item in obj]
    else:
        return obj

def transform_tls12_cipher_suite(suite: Dict[str, Any], position: int = 0) -> Dict[str, Any]:
    """Transform TLS 1.2 cipher suite to desired format."""
    result = {
        "name": suite.get("name", ""),
        "encryption": extract_encryption_algorithm(suite.get("name", "")),
        "key_exchange": extract_key_exchange(suite.get("name", ""), suite.get("kxType")),
        "authentication": extract_authentication(suite.get("name", ""))
    }
    
    if "namedGroupName" in suite:
        result["curve"] = suite["namedGroupName"]
        result["curve_bits"] = suite.get("namedGroupBits", 0)
    
    return result

def transform_tls13_cipher_suite(suite: Dict[str, Any], position: int = 0) -> Dict[str, Any]:
    """Transform TLS 1.3 cipher suite to desired format."""
    result = {
        "name": suite.get("name", ""),
        "encryption": extract_encryption_algorithm(suite.get("name", "")),
        "key_exchange": suite.get("namedGroupName", ""),
        "curve_bits": suite.get("namedGroupBits", 0)
    }
    return result

def transform_named_group(group: Dict[str, Any], position: int = 0) -> Dict[str, Any]:
    """Transform named group/curve to desired format."""
    curve_name = group.get("name", "")
    curve_bits = group.get("bits", 0)
    
    return {
        "name": curve_name,
        "type": group.get("namedGroupType", ""),
        "bits": curve_bits,
    }

def identify_certificate_role(cert: Dict[str, Any], index: int, total: int) -> str:
    """Identify the role of a certificate in the chain."""
    subject = cert.get("subject", "")
    issuer = cert.get("issuerSubject", "")

    if index == 0:
        return "leaf"
    elif subject == issuer:
        return "root"
    else:
        return "intermediate"

def transform_certificate(cert: Dict[str, Any], role: str, position: int = 0) -> Dict[str, Any]:
    """Transform certificate to desired format based on role."""
    if role == "leaf":
        cn = cert.get("commonNames", [""])[0] if cert.get("commonNames") else ""
        sig_alg = cert.get("sigAlg", "")
        key_alg = cert.get("keyAlg", "")
        key_size = cert.get("keySize", 0)
        
        return {
            "certificate": f"{cn}_{sig_alg.replace('with', '_').replace('RSA', 'RSA')}_{key_size}",
            "subject": cert.get("subject", ""),
            "issuer": cert.get("issuerSubject", ""),
            "valid_from": cert.get("notBefore"),
            "valid_until": cert.get("notAfter"),
            "public_key_algorithm": key_alg or "N/A",
            "public_key_size": key_size or None,
            "subject_alternative_names": cert.get("altNames", []),
            "certificate_transparency": cert.get("sct", False),
        }
    else:
        # For intermediate and root certificates
        return {
            "public_key_algorithm": cert.get("keyAlg") or "N/A",
            "public_key_size": cert.get("keySize", 0),
        }

def safe_get_endpoint(result_data: Dict[str, Any]) -> Dict[str, Any]:
    """Safely extract endpoint data with fallback to empty dict."""
    endpoints = result_data.get("endpoints", [])
    return endpoints[0] if endpoints else {}

def transform_scan_result(data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Transform the entire scan result to the desired structure."""
    if not data or len(data) == 0:
        raise ValueError("No scan data available")
    
    result_data = data[0]
    endpoint = safe_get_endpoint(result_data)  # ✅ Safe extraction
    details = endpoint.get("details", {})
    
    # Keep the original host format for the domain, it will be cleaned later
    domain = result_data.get("host", "").replace("https://", "").replace("http://", "").rstrip("/")
    
    transformed = {
        "domain": domain,
        "server_ip": endpoint.get("ipAddress", ""),
        "port": result_data.get("port", 443),
        "tls_configuration": {}
    }
    
    # If no endpoint details, return minimal structure
    if not details:
        transformed["tls_configuration"]["supported_protocols"] = []
        transformed["tls_configuration"]["tls_1.2_cipher_suites"] = {
            "server_preference": "disabled", 
            "suites": []
        }
        transformed["tls_configuration"]["tls_1.3_cipher_suites"] = {
            "server_preference": "disabled", 
            "suites": []
        }
        transformed["tls_configuration"]["supported_elliptic_curves"] = {
            "server_preference": "disabled", 
            "curves": []
        }
        transformed["certificate_chain"] = {
            "leaf_certificate": {},
            "intermediate_certificates": [],
            "root_certificates": [],
            "alternate_certificates": []
        }
        transformed["signature_algorithms"] = {
            "certificate_signatures": [],
            "handshake_signatures": []
        }
        logger.warning(f"No endpoint details for {domain}, returning minimal data")
        return transformed  # Early return with valid but empty structure
    
    protocols = details.get("protocols", [])
    supported_protocols = [f"TLS {p['version']}" for p in protocols]
    transformed["tls_configuration"]["supported_protocols"] = supported_protocols
    
    suites = details.get("suites", [])
    # Initialize with empty structures
    transformed["tls_configuration"]["tls_1.2_cipher_suites"] = {"server_preference": "disabled", "suites": []}
    transformed["tls_configuration"]["tls_1.3_cipher_suites"] = {"server_preference": "disabled", "suites": []}
    if suites:
        for suite_group in suites:
            protocol_id = suite_group.get("protocol")
            preference = "enabled" if suite_group.get("preference") else "disabled"
            cipher_list = suite_group.get("list", [])
            
            if protocol_id == 771:
                transformed["tls_configuration"]["tls_1.2_cipher_suites"] = {
                    "server_preference": preference,
                    "suites": [transform_tls12_cipher_suite(cs, position=i) for i, cs in enumerate(cipher_list)]
                }
            elif protocol_id == 772:
                transformed["tls_configuration"]["tls_1.3_cipher_suites"] = {
                    "server_preference": preference,
                    "suites": [transform_tls13_cipher_suite(cs, position=i) for i, cs in enumerate(cipher_list)]
                }
    

    
    named_groups = details.get("namedGroups", {})
    transformed["tls_configuration"]["supported_elliptic_curves"] = {"server_preference": "disabled", "curves": []}
    if named_groups:
        transformed["tls_configuration"]["supported_elliptic_curves"] = {
            "server_preference": "enabled" if named_groups.get("preference") else "disabled",
            "curves": [transform_named_group(ng, position=i) for i, ng in enumerate(named_groups.get("list", []))]
        }
    
    certs = result_data.get("certs", [])
    certificate_chain = {
        "leaf_certificate": {},
        "intermediate_certificates": [],
        "root_certificates": [],
        "alternate_certificates": []
    }
    
    if certs:
        if len(certs) > 0:
            certificate_chain["leaf_certificate"] = transform_certificate(certs[0], "leaf", position=0)
        
        for i in range(1, len(certs)):
            cert = certs[i]
            role = identify_certificate_role(cert, i, len(certs))
            transformed_cert = transform_certificate(cert, role, position=i)
            
            if role == "intermediate":
                certificate_chain["intermediate_certificates"].append(transformed_cert)
            elif role == "root":
                certificate_chain["root_certificates"].append(transformed_cert)
            else:
                certificate_chain["alternate_certificates"].append(transformed_cert)
    
    transformed["certificate_chain"] = certificate_chain
    
    # Add the new signature algorithms section
    transformed["signature_algorithms"] = {
        "certificate_signatures": extract_signature_algorithms_from_certs(certs),
        "handshake_signatures": extract_handshake_signature_algorithms(details)
    }
    
    transformed = remove_duplicates_from_structure(transformed)
    
    return transformed

def extract_signature_algorithms_from_certs(certs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Extract signature algorithms from SSL Labs certificate data without PQC scoring."""
    results = []
    
    for i, cert in enumerate(certs):
        try:
            # Try to parse raw certificate first
            raw_cert = cert.get("raw")
            
            if raw_cert:
                try:
                    # Decode base64 certificate
                    der_cert = base64.b64decode(raw_cert)
                    x509_cert = x509.load_der_x509_certificate(der_cert, default_backend())

                    # Extract signature algorithm
                    sig_hash_alg = x509_cert.signature_hash_algorithm
                    pubkey = x509_cert.public_key()

                    # Map cryptography library type names to standard scorer-friendly names.
                    # The type names from .replace('PublicKey', '') would give "EllipticCurve",
                    # "RSA", "Ed25519", etc., which cause fuzzy-lookup misses in the scorer.
                    # Use known IANA/OpenSSL short names instead.
                    raw_type = type(pubkey).__name__
                    if "EllipticCurve" in raw_type or "EC" in raw_type:
                        pubkey_std = "ECDSA"
                    elif "RSA" in raw_type:
                        pubkey_std = "RSA"
                    elif "Ed25519" in raw_type:
                        pubkey_std = "Ed25519"
                    elif "Ed448" in raw_type:
                        pubkey_std = "Ed448"
                    elif "DSA" in raw_type:
                        pubkey_std = "DSS"
                    else:
                        pubkey_std = raw_type.replace("PublicKey", "")

                    if sig_hash_alg:
                        hash_name = sig_hash_alg.name.upper().replace("SHA2-", "SHA-").replace("SHA-256", "SHA256").replace("SHA-384", "SHA384").replace("SHA-512", "SHA512")
                        # Produce "ECDSA-SHA256" style (scorer recognises this form)
                        sig_algorithm = f"{pubkey_std}-{hash_name}"
                    else:
                        sig_algorithm = pubkey_std

                    results.append({
                        "position": i,
                        "certificate_subject": cert.get("subject", "Unknown"),
                        "signature_algorithm": sig_algorithm,
                        "hash_algorithm": sig_hash_alg.name.upper() if sig_hash_alg else "UNKNOWN",
                        "public_key_type": pubkey_std,
                        "public_key_size": cert.get("keySize", 0),
                        "signature_algorithm_oid": x509_cert.signature_algorithm_oid.dotted_string if x509_cert.signature_algorithm_oid else None,
                    })
                    continue
                    
                except Exception as e:
                    logger.warning(f"Failed to parse raw cert at position {i}: {e}")
            
            # Fallback: Use SSL Labs provided data
            sig_alg = cert.get("sigAlg", "Unknown")
            hash_alg = sig_alg.split("with")[0] if "with" in sig_alg else "SHA256"
            
            results.append({
                "position": i,
                "certificate_subject": cert.get("subject", "Unknown"),
                "signature_algorithm": sig_alg,
                "hash_algorithm": hash_alg,
                "public_key_type": cert.get("keyAlg", "Unknown"),
                "public_key_size": cert.get("keySize", 0),
            })
            
        except Exception as e:
            logger.error(f"Error extracting signature from cert {i}: {e}")
            results.append({
                "position": i,
                "error": str(e)
            })
    
    return results


def extract_handshake_signature_algorithms(details: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract supported signature algorithms from SSL Labs scan details without PQC scoring."""
    supported = []
    seen = set()
    
    suites = details.get("suites", [])
    
    # Check TLS 1.2 cipher suites
    for suite_group in suites:
        if suite_group.get("protocol") == 771:  # TLS 1.2
            for cipher in suite_group.get("list", []):
                cipher_name = cipher.get("name", "")
                
                # ECDSA signature algorithms
                if "ECDSA" in cipher_name:
                    if "SHA256" in cipher_name and "ecdsa_sha256_tls12" not in seen:
                        algo_name = "ecdsa_secp256r1_sha256"
                        supported.append({
                            "algorithm": algo_name,
                            "protocol": "TLS 1.2",
                        })
                        seen.add("ecdsa_sha256_tls12")
                    
                    if "SHA384" in cipher_name and "ecdsa_sha384_tls12" not in seen:
                        algo_name = "ecdsa_secp384r1_sha384"
                        supported.append({
                            "algorithm": algo_name,
                            "protocol": "TLS 1.2",
                        })
                        seen.add("ecdsa_sha384_tls12")
                
                # RSA signature algorithms
                if "RSA" in cipher_name and "ECDHE" in cipher_name:
                    if "SHA256" in cipher_name and "rsa_sha256_tls12" not in seen:
                        algo_name = "rsa_pkcs1_sha256"
                        supported.append({
                            "algorithm": algo_name,
                            "protocol": "TLS 1.2",
                        })
                        seen.add("rsa_sha256_tls12")
                    
                    if "SHA384" in cipher_name and "rsa_sha384_tls12" not in seen:
                        algo_name = "rsa_pkcs1_sha384"
                        supported.append({
                            "algorithm": algo_name,
                            "protocol": "TLS 1.2",
                        })
                        seen.add("rsa_sha384_tls12")
    
    # Check TLS 1.3 cipher suites
    for suite_group in suites:
        if suite_group.get("protocol") == 772:  # TLS 1.3
            # TLS 1.3 uses different signature schemes
            if "rsa_pss_sha256" not in seen:
                algo_name = "rsa_pss_rsae_sha256"
                supported.append({
                    "algorithm": algo_name,
                    "protocol": "TLS 1.3",
                })
                seen.add("rsa_pss_sha256")
            
            if "ecdsa_sha256_tls13" not in seen:
                algo_name = "ecdsa_secp256r1_sha256"
                supported.append({
                    "algorithm": algo_name,
                    "protocol": "TLS 1.3",
                })
                seen.add("ecdsa_sha256_tls13")
            
            if "ecdsa_sha384_tls13" not in seen:
                algo_name = "ecdsa_secp384r1_sha384"
                supported.append({
                    "algorithm": algo_name,
                    "protocol": "TLS 1.3",
                })
                seen.add("ecdsa_sha384_tls13")
    
    # If nothing found, provide defaults based on what ciphers exist
    if not supported:
        algo_name = "rsa_pkcs1_sha256"
        supported.append({
            "algorithm": algo_name,
            "protocol": "TLS 1.2",
        })
    
    return supported

def clear_ssllabs_cache():
    """Clear SSL Labs cache by running with --nocache flag."""
    try:
        logger.info("Clearing SSL Labs cache...")
        # Just a marker - actual clearing happens by using fresh scans
        return True
    except Exception as e:
        logger.warning(f"Cache clear warning: {e}")
        return False

def safe_get_first_item(items: List[Any], default: Any = None) -> Any:
    """Safely get first item from list or return default."""
    if default is None:
        default = {}
    return items[0] if items else default

def format_result_for_frontend(transformed_result: Dict[str, Any], request_id: str) -> Dict[str, Any]:
    """
    Format scan result to match frontend AND database expectations.
    
    CRITICAL FIXES:
    1. Extract pqc_overall_score/grade from pqc_analysis for HTTPS scans
    2. Add them to TOP LEVEL (not just in raw_response)
    3. Ensure HTTP-skipped domains have complete structure
    """
    
    # ============================================================ 
    # CASE 1: HTTP/Unreachable Domains (Cannot be scanned)
    # ============================================================ 
    if transformed_result.get("scan_status") == "http_skipped":
        return {
            "request_id": request_id,
            "url": transformed_result.get("domain", ""),
            "status": "completed",  # ✅ CHANGED FROM "failed" TO "completed"
            "scan_status": "http_skipped",  # ✅ This is the key field
            "scan_type": "crypto_audit",
            "error_message": transformed_result.get("error_detail", "HTTP/Unreachable domain cannot be scanned."),
            "requested_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat(),
            "total_urls": 1,
            "execution_time_seconds": 0,
            
            # ✅ CRITICAL: Complete raw_response structure
            "raw_response": {
                "domain": transformed_result.get("domain", ""),
                "scan_status": "http_skipped",
                "error_detail": transformed_result.get("error_detail", ""),
                "scan_metadata": transformed_result.get("scan_metadata", {}),
                
                # Empty but valid structures
                "tls_configuration": {
                    "supported_protocols": [],
                    "tls_1.2_cipher_suites": {"server_preference": "disabled", "suites": []},
                    "tls_1.3_cipher_suites": {"server_preference": "disabled", "suites": []},
                    "supported_elliptic_curves": {"server_preference": "disabled", "curves": []}
                },
                "certificate_chain": {
                    "leaf_certificate": {},
                    "intermediate_certificates": [],
                    "root_certificates": []
                },
                "signature_algorithms": {
                    "certificate_signatures": [],
                    "handshake_signatures": []
                },
                
                # ✅ CRITICAL: Use pqc_analysis structure
                "pqc_analysis": {
                    "overall_score": 0,
                    "overall_grade": "F",
                    "security_level": "None",
                    "quantum_ready": False,
                    "hybrid_ready": False,
                    "components": {}
                }
            },
            
            # ✅ CRITICAL: Add to TOP LEVEL for database
            "pqc_overall_score": 0,
            "pqc_overall_grade": "F",
            "pqc_hybrid_ready": False,
        }
    
    # ============================================================ 
    # CASE 2: Successful HTTPS Scans (rest of the function remains the same)
    # ============================================================ 
    tls_config = transformed_result.get("tls_configuration", {})
    cert_chain = transformed_result.get("certificate_chain", {})
    
    # Safe access to intermediate certificates
    intermediate_cert = safe_get_first_item(
        cert_chain.get("intermediate_certificates", [])
    )
    
    # Safe access to TLS 1.3 cipher suites
    tls13_suites = tls_config.get("tls_1.3_cipher_suites", {}).get("suites", [])
    tls13_first_suite = safe_get_first_item(tls13_suites)
    
    # Safe access to TLS 1.2 cipher suites
    tls12_suites = tls_config.get("tls_1.2_cipher_suites", {}).get("suites", [])
    tls12_first_suite = safe_get_first_item(tls12_suites)

    # 🔧 CRITICAL FIX: Extract PQC scores from pqc_analysis
    pqc_analysis = transformed_result.get("pqc_analysis", {})
    pqc_score = pqc_analysis.get("overall_score", 0) if pqc_analysis else 0
    pqc_grade = pqc_analysis.get("overall_grade", "F") if pqc_analysis else "F"

    return {
        "request_id": request_id,
        "url": transformed_result.get("domain", ""),
        "status": "completed",
        "scan_status": "completed",
        "scan_type": "crypto_audit",
        "requested_at": datetime.now().isoformat(),
        "completed_at": datetime.now().isoformat(),
        "total_urls": 1,
        "tls_version": ", ".join(tls_config.get("supported_protocols", [])),
        "public_key_size_bits": intermediate_cert.get("public_key_size"),
        "cipher_suite_name": tls13_first_suite.get("name") or tls12_first_suite.get("name") or "",
        "cipher_protocol": safe_get_first_item(tls_config.get("supported_protocols", []), ""),
        "cipher_strength_bits": tls13_first_suite.get("curve_bits") or tls12_first_suite.get("curve_bits"),
        "ephemeral_key_exchange": any(
            s.get("key_exchange") == "ECDHE" 
            for s in tls_config.get("tls_1.2_cipher_suites", {}).get("suites", [])
        ),
        "public_key_algorithm": intermediate_cert.get("public_key_algorithm") or "N/A",
        "ct_present": cert_chain.get("leaf_certificate", {}).get("certificate_transparency", False),
        
        # 🔧 CRITICAL FIX: Add pqc_overall_* to TOP LEVEL
        "pqc_overall_score": pqc_score,
        "pqc_overall_grade": pqc_grade,
        
        # ✅ CRITICAL: Store COMPLETE transformed result in raw_response
        "raw_response": transformed_result,
        
        "execution_time_seconds": 0  # Will be set by caller if needed, or default to 0
    }

def handle_scan_with_backoff(
    domain: str,
    use_cache: bool,
    attempt: int,
    timeout: int,
    save_to_db: bool = False,
    progress_tracker=None,
    max_backoff_retries: int = 3
) -> Dict[str, Any]:
    """
    Wrapper that handles rate limiting with exponential backoff.
    This runs in a separate thread, so it needs its own event loop.
    """
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        for retry in range(max_backoff_retries):
            try:
                return loop.run_until_complete(
                    process_single_domain(
                        domain,
                        use_cache,
                        attempt,
                        timeout,
                        save_to_db=save_to_db,
                        progress_tracker=progress_tracker,
                    )
                )
            except RateLimitException:
                if retry < max_backoff_retries - 1:
                    wait_time = (2 ** retry) * 5  # 5s, 10s, 20s
                    logger.info(f"Rate limited on {domain}, waiting {wait_time}s (retry {retry + 1}/{max_backoff_retries})")
                    time.sleep(wait_time)
                    logger.info(f"Retrying {domain} after backoff...")
                else:
                    logger.error(f"Rate limit retries exhausted for {domain}")
                    # Re-raise to be caught by the main loop's exception handler
                    raise APIError(status_code=429, error_code="rate_limit_exceeded", message=f"Rate limit exceeded for {domain}")
            except (APIError, Exception):
                # Re-raise other exceptions to be handled by the main loop
                raise
    finally:
        loop.close()

    # This line should not be reached
    raise APIError(status_code=500, error_code="unexpected_error", message=f"Unexpected error in backoff handler for {domain}")


async def run_internal_scanner(domain: str, timeout: int = 300, progress_tracker=None) -> dict:
    """
    Run internal TLS scanner instead of SSL Labs.
    Drop-in replacement for run_ssllabs_cli_async().
    """
    try:
        # Extract clean hostname (domain is already normalized with protocol)
        hostname = extract_hostname(domain)

        # Preserve original protocol from normalized input
        protocol = detect_protocol(domain)
        url = f"{protocol}://{hostname}"

        logger.info(f"Starting internal scan: {hostname}")

        # Call internal scanner
        scan_result = await internal_scan_domain(url, timeout=timeout, progress_tracker=progress_tracker)

        # Transform to SSL Labs format
        ssllabs_format = transform_internal_scan_to_ssllabs_format(scan_result)

        logger.info(f"Internal scan completed for {hostname}")
        return [ssllabs_format]  # Wrap in list to match SSL Labs format

    except Exception as e:
        logger.error(f"Internal scanner failed for {domain}: {e}")
        raise APIError(
            status_code=500,
            error_code="scan_failed",
            message=f"Internal scan failed for {domain}: {str(e)}"
        )


async def run_external_scanner(domain: str, timeout: int = 300) -> dict:
    """Call the external SSL/TLS scanner service and return SSL Labs format."""
    hostname = extract_hostname(domain)
    payload = {"host": hostname, "port": 443}
    try:
        response = await call_service(
            "POST",
            f"{EXTERNAL_TLS_SCANNER_URL}/scan",
            json=payload,
            timeout=timeout,
        )
        if response.status_code != 200:
            raise APIError(
                status_code=response.status_code,
                error_code="external_scan_failed",
                message=f"External scanner failed for {hostname}",
                details={"status_code": response.status_code, "body": response.text},
            )
        return [response.json()]
    except APIError:
        raise
    except Exception as e:
        logger.error(f"External scanner failed for {hostname}: {e}")
        raise APIError(
            status_code=500,
            error_code="external_scan_failed",
            message=f"External scan failed for {hostname}: {str(e)}",
        )


async def detect_pq_groups(hostname: str, port: int = 443, timeout: int = 30) -> List[Dict]:
    """
    Call OQS PQ scanner to detect ML-KEM/Kyber hybrid groups.
    Returns list of detected PQ groups or empty list if detection fails.
    """
    try:
        logger.info(f"Detecting PQ groups for {hostname} using OQS scanner")
        
        response = await call_service(
            "POST",
            f"{OQS_PQ_SCANNER_URL}/scan-pq",
            json={"host": hostname, "port": port, "timeout": timeout},
            timeout=timeout + 5,
        )
        
        if response.status_code == 200:
            result = response.json()
            pq_groups = result.get("pq_groups", [])
            logger.info(f"PQ detection complete: {len(pq_groups)} groups found")
            return pq_groups
        else:
            logger.warning(f"PQ scanner returned {response.status_code}, skipping PQ detection")
            return []
            
    except Exception as e:
        logger.warning(f"PQ detection failed for {hostname}: {e}, continuing without PQ data")
        return []


def merge_pq_groups_into_scan(scan_result: Dict, pq_groups: List[Dict]) -> None:
    """
    Merge PQ hybrid groups into the scan result namedGroups section.
    Modifies scan_result in place.
    """
    if not pq_groups:
        return
    
    # Navigate to namedGroups in the SSL Labs format
    if isinstance(scan_result, list) and len(scan_result) > 0:
        endpoint = scan_result[0].get("endpoints", [{}])[0]
        details = endpoint.get("details", {})
        named_groups = details.get("namedGroups", {})
        
        if "list" not in named_groups:
            named_groups["list"] = []
        
        existing_ids = {g.get("id") for g in named_groups["list"]}
        
        # Add only CONFIRMED PQ groups (skip "PQC-Hybrid-Inferred" — those are
        # false positives from TLS 1.3 connectivity, not actual PQC negotiation)
        confirmed_added = False
        for pq_group in pq_groups:
            if pq_group.get("type") == "PQC-Hybrid-Inferred":
                logger.debug(f"Skipping inferred PQ group: {pq_group['name']} (not confirmed via OQS probe)")
                continue
            if pq_group.get("id") not in existing_ids:
                named_groups["list"].append({
                    "id": pq_group["id"],
                    "name": pq_group["name"],
                    "bits": pq_group["bits"],
                    "namedGroupType": pq_group["type"]
                })
                logger.info(f"Added confirmed PQ group: {pq_group['name']}")
                confirmed_added = True

        # Remove the stale "does not support PQC" gradeNotice only when we
        # actually confirmed PQ support via the OQS probe.
        if confirmed_added:
            grade_notices = endpoint.get("gradeNotices", [])
            endpoint["gradeNotices"] = [
                n for n in grade_notices
                if "does not support PQC" not in n
            ]


async def run_scanner(domain: str, timeout: int = 300, progress_tracker=None) -> dict:
    """Select internal or external scanner based on configuration."""
    if USE_INTERNAL_SCANNER:
        return await run_internal_scanner(domain, timeout=timeout, progress_tracker=progress_tracker)
    return await run_external_scanner(domain, timeout=timeout)

def detect_protocol(domain: str) -> str:
    """Extract protocol from normalized domain input."""
    if domain.startswith("https://"):
        return "https"
    elif domain.startswith("http://"):
        return "http"
    else:
        # This should never happen after normalization
        raise ValueError(f"Domain not normalized: {domain}")

def quick_domain_check(domain: str, timeout: int = 2) -> tuple[bool, str]:
    """Check if a domain resolves via DNS."""
    try:
        hostname = extract_hostname(domain)
        socket.gethostbyname(hostname)
        return True, ""
    except socket.gaierror:
        return False, f"DNS resolution failed for {domain}"
    except Exception as e:
        return False, f"An unexpected error occurred during DNS check for {domain}: {e}"


def generate_scan_request_id(domain: str) -> str:
    """Generate a stable, unique request_id for one scan lifecycle."""
    try:
        host = extract_hostname(domain).replace(".", "_").replace(":", "_")
    except Exception:
        host = "scan"
    return f"{host}_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:8]}"

async def process_single_domain(
    domain: str, 
    use_cache: bool = True, 
    attempt: int = 1, 
    timeout: int = 300,
    save_to_db: bool = False,
    progress_tracker=None,
    request_id: Optional[str] = None  # Allow caller to supply a pre-created request_id
) -> Dict[str, Any]:
    """Process a single domain scan, with HTTP/HTTPS logic. Each scan is independent."""
    request_id = request_id or generate_scan_request_id(domain)
    
    # Register domain with tracker
    if progress_tracker:
        progress_tracker.register_domain(domain)
        progress_tracker.start_phase(domain, "protocol_check")



    # 1. Protocol Detection
    protocol = detect_protocol(domain)

    if save_to_db:
        try:
            await db_handler.save_pending_scan(domain, request_id)
        except Exception as pending_error:
            logger.warning(f"Failed to create pending scan record for {domain}: {pending_error}")
    
    if progress_tracker:
        progress_tracker.complete_phase(domain, "protocol_check")
    
    if protocol != "https":
        error_message = f"Domain is {protocol.upper()} and cannot be scanned (TLS/SSL only)."
        logger.warning(f"Skipping {domain}: {error_message}")

        transformed_result = {
            "domain": domain,
            "scan_status": "http_skipped",
            "error_detail": error_message,
        }
        result = format_result_for_frontend(transformed_result, request_id)
        if save_to_db:
            try:
                await db_handler.save_scan_result(result)
            except Exception as save_error:
                logger.error(f"Failed to save http_skipped result for {domain}: {save_error}")
        if progress_tracker:
            progress_tracker.mark_domain_completed(domain)
        return result

    # 2. Proceed with HTTPS scan
    scan_start_time = datetime.now()
    try:
        # DNS check
        is_resolvable, error_msg = quick_domain_check(domain, timeout=2)
        
        if not is_resolvable:
            raise APIError(status_code=503, error_code="dns_resolution_failed", message=error_msg)
        
        # Run scanner (external by default)
        raw_result = await run_scanner(domain, timeout=timeout, progress_tracker=progress_tracker)
        
        # ✅ NEW: Detect PQ hybrid groups using OQS scanner
        hostname = extract_hostname(domain)
        pq_groups = await detect_pq_groups(hostname, port=443, timeout=30)
        
        # Merge PQ groups into scanner results
        if pq_groups:
            merge_pq_groups_into_scan(raw_result, pq_groups)
            logger.info(f"Merged {len(pq_groups)} PQ groups into scan results")
        
        # Transform result
        transformed_result = transform_scan_result(raw_result)

        # Preserve original scanner report (SSL Labs format) for UI/debugging
        if isinstance(raw_result, list):
            transformed_result["scanner_report"] = raw_result[0] if len(raw_result) == 1 else raw_result
        else:
            transformed_result["scanner_report"] = raw_result
        
        if progress_tracker:
            progress_tracker.start_phase(domain, "scoring")

        scoring_results = await score_tls_scan_remote(transformed_result)

        if progress_tracker:
            progress_tracker.complete_phase(domain, "scoring")
        
        transformed_result["pqc_analysis"] = scoring_results
        
        # Remove duplicates and finalize
        transformed_result = remove_duplicates_from_structure(transformed_result)
        transformed_result["scan_metadata"] = {
            "attempt": attempt,
            "cached": use_cache,
            "timestamp": datetime.now().isoformat()
        }
        transformed_result["scan_status"] = "completed"
        
        result = format_result_for_frontend(transformed_result, request_id)
        
        # Calculate execution time
        scan_end_time = datetime.now()
        execution_time = (scan_end_time - scan_start_time).total_seconds()
        result["execution_time_seconds"] = round(execution_time, 2)
        
        logger.info(f"⏱️  Scan for {domain} took {execution_time:.2f} seconds")
        
        # Save to database if requested (each scan is independent - no batch required)
        if save_to_db:
            try:
                await db_handler.save_scan_result(result)
                logger.info(f"✅ Saved result for {domain}")
            except Exception as e:
                logger.error(f"Failed to save result for {domain}: {e}")
        
        if progress_tracker:
            progress_tracker.mark_domain_completed(domain)

        return result
    
    except APIError as e:
        if save_to_db:
            try:
                error_message = e.detail.get("message") if isinstance(e.detail, dict) else str(e)
                await db_handler.save_failed_scan(domain, error_message, request_id)
            except Exception as save_error:
                logger.error(f"Failed to save failed scan for {domain}: {save_error}")
        raise
    except Exception as e:
        if save_to_db:
            try:
                await db_handler.save_failed_scan(domain, str(e), request_id)
            except Exception as save_error:
                logger.error(f"Failed to save failed scan for {domain}: {save_error}")
        logger.exception(f"❌ Unexpected error scanning {domain}")
        raise APIError(
            status_code=500, 
            error_code="processing_failed", 
            message=f"Error processing {domain}: {str(e)}",
            details={"domain": domain, "protocol": protocol}
        )
@app.post("/scan")
async def scan_domain(request: ScanRequest):
    """
    Enhanced scan with automatic retry logic.
    - Filters out HTTP domains.
    - Tracks failed domains in memory
    - Retries up to max_retries rounds
    - Returns all results with metadata
    
    ARCHITECTURE: Each URL is an independent scan (no batch grouping).
    """
    logger.info("Entered /scan endpoint")
    try:
        # Use the raw domains from the validated model string
        domains = [d.strip() for d in request.domain.split(',')]
        
        domains_to_scan = domains
        skipped_domains = []
        
        if not domains:
            return {
                "summary": {
                    "total_domains": 0,
                    "successful": 0,
                    "failed": 0,
                    "rounds_completed": 0,
                    "timestamp": datetime.now().isoformat()
                },
                "successful_scans": [],
                "failed_scans": []
            }

        # Single domain: fire-and-forget background task.
        # The scan runs completely independently of this HTTP connection.
        # Saves to DB when done — no risk of pending records stuck forever
        # due to client disconnects or timeouts from callers like onboarding.
        if len(domains_to_scan) == 1:
            domain = domains_to_scan[0]
            req_id = generate_scan_request_id(domain)

            # Save pending record NOW so the caller can track it immediately
            if request.save_to_db:
                try:
                    await db_handler.save_pending_scan(domain, req_id)
                except Exception as _pe:
                    logger.warning(f"Failed to create pending scan record for {domain}: {_pe}")

            # Fire-and-forget: the scan lifecycle is now independent of this request
            async def _run_background_scan(d: str, rid: str, s2db: bool):
                try:
                    await process_single_domain(d, timeout=6000, save_to_db=s2db, request_id=rid)
                except Exception as _bg_exc:
                    logger.exception(f"Background scan failed for {d}: {_bg_exc}")

            asyncio.create_task(_run_background_scan(domain, req_id, request.save_to_db))
            logger.info(f"Background scan task created for {domain} (request_id={req_id})")

            # Return immediately — caller should poll /results for completion
            return {
                "request_id": req_id,
                "url": domain,
                "status": "pending",
                "scan_status": "pending",
                "message": "Scan started in background. Poll /results for updates."
            }
        
        # Multi-domain with retry logic (each domain is independent)
        retry_state = RetryState()
        max_retries = 3
        retry_delay = 30
        clear_cache_between_rounds = False
        retry_state.total_rounds = max_retries
        initial_timeout = 600  # 10 minutes
        timeout_increment = 300  # Increase by 5 minutes each round
        
        for round_num in range(1, max_retries + 1):
            if not domains_to_scan:
                logger.info("No more HTTPS domains to scan, skipping round.")
                break
                
            retry_state.current_round = round_num
            logger.info(f"ROUND {round_num}/{max_retries} - Scanning {len(domains_to_scan)} HTTPS domains")
            
            # Determine cache usage
            use_cache = (round_num == 1)  # Use cache only in first round
            current_timeout = initial_timeout + (timeout_increment * (round_num - 1))
            
            with ThreadPoolExecutor(max_workers=min(request.max_concurrent, len(domains_to_scan))) as executor:
                future_to_domain = {
                    executor.submit(
                        handle_scan_with_backoff,
                        domain,
                        use_cache,
                        round_num,
                        current_timeout,
                        request.save_to_db,
                    ): domain 
                    for domain in domains_to_scan
                }
                
                for future in as_completed(future_to_domain):
                    domain = future_to_domain[future]
                    try:
                        result = future.result()
                        
                        if result.get("scan_status") == "http_skipped":
                            skipped_domains.append(result)
                            retry_state.remove_success(domain)
                            continue
                            
                        retry_state.add_success(result)
                        retry_state.remove_success(domain)
                        logger.info(f"[{round_num}] Success: {domain}")

                        time.sleep(5)  # Delay between scans
                        
                    except HTTPException as e:
                        if e.status_code == 429:
                            logger.warning(f"[{round_num}] Rate Limited: {domain} - will retry with backoff")
                        retry_state.add_failure(domain, e.detail, round_num)
                        logger.error(f"[{round_num}] Failed: {domain} - {e.detail}")
                        
                    except Exception as e:
                        retry_state.add_failure(domain, str(e), round_num)
                        logger.error(f"[{round_num}] Failed: {domain} - {str(e)}")
            
            # Update domains to scan for next round
            domains_to_scan = retry_state.get_failed_domains()
            
            # If no failures, we're done
            if not domains_to_scan:
                logger.info(f"All HTTPS domains successful after round {round_num}!")
                break
            
            # If more rounds remaining, prepare for retry
            if round_num < max_retries:
                logger.info(f"Waiting {retry_delay}s before retry round {round_num + 1}...")
                logger.info(f"Domains to retry: {', '.join(domains_to_scan)}")
                
                if clear_cache_between_rounds:
                    clear_ssllabs_cache()
                
                time.sleep(retry_delay)
        
        final_failed_scans = list(retry_state.failed_domains.values())
        
        # Prepare final response (no batch - individual scans already saved)
        final_response = {
            "summary": {
                "total_domains": len(domains),
                "successful": len(retry_state.successful_domains),
                "failed": len(final_failed_scans),
                "rounds_completed": retry_state.current_round,
                "timestamp": datetime.now().isoformat()
            },
            "successful_scans": retry_state.successful_domains,
            "failed_scans": final_failed_scans
        }
        
        logger.info("Scan completed successfully")
        return final_response
    except Exception as e:
        logger.exception("Scan failed")
        raise APIError(status_code=500, error_code="scan_failed", message=f"Scan failed: {str(e)}")


@app.post("/scan-with-progress")
async def scan_with_progress(request: ScanRequest):
    """Scan domains with live progress updates and retry logic. Each URL is independent."""
    
    async def event_stream():
        request_id = f"scan_{int(datetime.now().timestamp())}_{hash(request.domain) % 10000}"
        domains = [d.strip() for d in request.domain.split(',') if d.strip()]
        
        # INITIALIZE TRACKER (no batch ID needed)
        tracker = ScanProgressTracker(len(domains), request_id)
        
        # Register all domains
        for domain in domains:
            tracker.register_domain(domain)
        
        # Send initial snapshot
        yield f"data: {json.dumps(tracker.get_progress_snapshot())}\n\n"
        
        max_retries = 3
        retry_delay = 30
        initial_timeout = 600
        timeout_increment = 300

        # Work on a mutable copy
        domains_to_scan = domains.copy()
        
        for round_num in range(1, max_retries + 1):
            if not domains_to_scan:
                break
            use_cache = (round_num == 1)
            current_timeout = initial_timeout + (timeout_increment * (round_num - 1))
            
            with ThreadPoolExecutor(max_workers=min(request.max_concurrent, max(1, len(domains_to_scan)))) as executor:
                future_to_domain = {
                    executor.submit(
                        handle_scan_with_backoff,
                        domain,
                        use_cache,
                        round_num,
                        current_timeout,
                        request.save_to_db,
                        tracker
                    ): domain
                    for domain in domains_to_scan
                }
                
                for future in as_completed(future_to_domain):
                    domain = future_to_domain[future]
                    try:
                        result = future.result()

                        # SEND PROGRESS UPDATE
                        yield f"data: {json.dumps(tracker.get_progress_snapshot())}\n\n"
                        
                    except Exception as e:
                        tracker.mark_domain_failed(domain, str(e), round_num)
                        yield f"data: {json.dumps(tracker.get_progress_snapshot())}\n\n"
            
            # Round complete
            yield f"data: {json.dumps(tracker.get_progress_snapshot())}\n\n"

            domains_to_scan = tracker.get_failed_domains()

            if domains_to_scan and round_num < max_retries:
                await asyncio.sleep(retry_delay)
        
        # Final summary
        yield f"data: {json.dumps(tracker.get_final_summary())}\n\n"

    return StreamingResponse(
        event_stream(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.get("/")
def root():
    """API root endpoint with usage information."""
    return {
        "message": "SSL/TLS Scan API - Single Scan Architecture",
        "version": "6.0",
        "description": "Each URL is scanned independently (no batch grouping)",
        "endpoints": {
            "/scan": "POST - Scan URLs with automatic retry (HTTPS only)",
            "/scan-with-progress": "POST - Scan with live SSE updates (HTTPS only)",
            "/results": "GET - Fetch all scan results from database",
            "/results/url/{url}": "GET - Get scan result for specific URL",
            "/results/search": "GET - Search scan results with filters",
            "/scans/result/{result_id}": "DELETE - Delete a single scan result",
            "/scans/clear-all": "DELETE - Delete ALL data (dangerous)",
            "/cancel-scan/{request_id}": "POST - Cancel ongoing scan",
            "/health": "GET - Health check"
        },
        "features": [
            "✅ Single-scan architecture (each URL independent)",
            "✅ Protocol filtering (HTTPS only scans)",
            "✅ Automatic retry for failed scans (up to 3 rounds)",
            "✅ In-memory state management",
            "✅ Live progress updates via SSE",
            "✅ PostgreSQL database integration (optional)",
            "✅ Search and query historical results"
        ],
        "example_request": {
            "domain": "https://example.com, github.com",
            "max_concurrent": 5,
            "save_to_db": True
        }
    }

@app.post("/cancel-scan/{request_id}")
async def cancel_scan(request_id: str):
    """Cancel an ongoing scan."""
    logger.info(f"Entered /cancel-scan/{request_id} endpoint")
    mark_scan_cancelled(request_id)
    return {
        "status": "cancelled",
        "request_id": request_id,
        "message": "Scan cancellation requested"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint for internal scanner mode."""
    logger.info("Health check called")
    try:
        return {
            "status": "healthy",
            "scanner_mode": "internal",
            "ssllabs_cli": "not_required",
            "version": "4.0"
        }
    except Exception as e:
        logger.exception(f"Health check failed: {str(e)}")
        raise APIError(status_code=500, error_code="health_check_failed", message=f"Health check failed: {str(e)}")

# ============================================================ 
# DATABASE QUERY ENDPOINTS (Single-scan architecture)
# ============================================================ 

@app.get("/results")
async def get_scan_results(
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """Fetch all scan results from database."""
    logger.info("Entered /results endpoint")
    try:
        results = await db_handler.get_scan_results(status=status, limit=limit, offset=offset)
        logger.info("Scan results retrieved successfully")
        return results
    except Exception as e:
        logger.exception("Scan results retrieval failed")
        raise APIError(status_code=500, error_code="results_retrieval_failed", message=f"Scan results retrieval failed: {str(e)}")

@app.get("/results/url/{url:path}")
async def get_result_by_url(url: str):
    """Get scan result for a specific URL."""
    logger.info(f"Entered /results/url/{url} endpoint")
    try:
        result = await db_handler.get_scan_by_url(url)
        if not result:
            raise APIError(status_code=404, error_code="result_not_found", message=f"No scan result found for URL: {url}")
        logger.info(f"Result for {url} retrieved successfully")
        return result
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Result retrieval for {url} failed")
        raise APIError(status_code=500, error_code="result_retrieval_failed", message=f"Result retrieval failed: {str(e)}")

@app.get("/results/{result_id}")
async def get_result_by_id(result_id: int):
    """Get a specific scan result by ID."""
    logger.info(f"Entered /results/{result_id} endpoint")
    try:
        result = await db_handler.get_scan_by_id(result_id)
        if not result:
            raise APIError(status_code=404, error_code="result_not_found", message=f"Scan result {result_id} not found")
        logger.info(f"Result {result_id} retrieved successfully")
        return result
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Result {result_id} retrieval failed")
        raise APIError(status_code=500, error_code="result_retrieval_failed", message=f"Result retrieval failed: {str(e)}")

@app.get("/results/search")
async def search_scan_results(
    pqc_grade: Optional[str] = Query(None, description="Filter by PQC grade (A+, A, B, etc.)"),
    quantum_ready: Optional[bool] = Query(None, description="Filter by quantum ready status"),
    tls_version: Optional[str] = Query(None, description="Filter by TLS version"),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(100, ge=1, le=500)
):
    """Search scan results with filters."""
    logger.info("Entered /results/search endpoint")
    try:
        results = await db_handler.search_scans(
            pqc_grade=pqc_grade,
            quantum_ready=quantum_ready,
            tls_version=tls_version,
            status=status,
            limit=limit
        )
        logger.info("Search results retrieved successfully")
        return results
    except Exception as e:
        logger.exception("Search results retrieval failed")
        raise APIError(status_code=500, error_code="results_search_failed", message=f"Search results retrieval failed: {str(e)}")

@app.get("/statistics")
async def get_statistics():
    """Get scan statistics."""
    logger.info("Entered /statistics endpoint")
    try:
        stats = await db_handler.get_statistics()
        logger.info("Statistics retrieved successfully")
        return stats
    except Exception as e:
        logger.exception("Statistics retrieval failed")
        raise APIError(status_code=500, error_code="statistics_failed", message=f"Statistics retrieval failed: {str(e)}")

@app.get("/debug/db-connection")
async def debug_db_connection():
    """Debug endpoint to test database connectivity."""
    await db_handler._ensure_connected()
    can_connect = db_handler.enabled
    return {
        "db_service_url": db_handler.db_service_url,
        "db_enabled": db_handler.enabled,
        "can_connect": can_connect,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/debug/test-save")
async def debug_test_save():
    """Test saving a dummy record to database."""
    
    # Try to save a result (no batch needed)
    test_result = {
        "request_id": f"test_{int(datetime.now().timestamp())}",
        "url": "test.example.com",
        "requested_at": datetime.now().isoformat(),
        "execution_time_seconds": 1.5,
        "tls_version": "TLS 1.3",
        "cipher_suite_name": "TLS_AES_256_GCM_SHA384",
        "pqc_overall_score": 85,
        "pqc_overall_grade": "A",
        "raw_response": {"test": "data"}
    }
    
    result_saved = await db_handler.save_scan_result(test_result)
    
    return {
        "result_saved": result_saved,
        "db_enabled": db_handler.enabled
    }

# ============================================================ 
# DELETE ENDPOINTS (Proxy to DB Service)
# ============================================================ 

@app.delete("/scans/result/{result_id}")
async def delete_scan_result_endpoint(result_id: int = Path(..., description="Result ID to delete")):
    """
    Delete a single scan result.
    This endpoint proxies to the db-service.
    """
    logger.info(f"Entered /scans/result/{result_id} for deletion")
    try:
        success = await db_handler.delete_result_from_db(result_id)
        
        if success:
            logger.info(f"Scan result {result_id} deleted successfully")
            return {
                "message": "Scan result deleted successfully",
                "result_id": result_id,
                "timestamp": datetime.now().isoformat()
            }
        else:
            raise APIError(status_code=404, error_code="result_not_found", message=f"Scan result with ID {result_id} not found or already deleted")
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Error deleting result: {str(e)}")
        raise APIError(status_code=500, error_code="result_deletion_failed", message=f"Error deleting result: {str(e)}")


@app.delete("/scans/clear-all")
async def clear_all_scans_endpoint():
    """
    DANGER: Delete ALL scan results from database.
    This operation cannot be undone.
    This endpoint proxies to the db-service.
    """
    logger.info("Entered /scans/clear-all endpoint")
    try:
        result = await db_handler.clear_all_from_db()
        
        if "error" in result:
            raise APIError(
                status_code=500,
                error_code="clear_all_failed",
                message=result["error"]
            )
        
        logger.info("All data cleared successfully")
        return {
            "message": "All scan results cleared from database",
            "deleted_results": result.get("deleted_results", 0),
            "timestamp": datetime.now().isoformat()
        }
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Error clearing all data: {str(e)}")
        raise APIError(
            status_code=500,
            error_code="clear_all_failed",
            message=f"Error clearing all data: {str(e)}"
        )


# ============================================================ 
# APPLICATION STARTUP
# ============================================================

@app.on_event("startup")
async def startup_event():
    """Startup handler: DB health check."""
    logger.info("🚀 Starting scan-service (single-scan architecture)...")
    logger.info(f"📊 Database URL: {db_handler.db_service_url}")

    await db_handler._ensure_connected()

    if db_handler.enabled:
        logger.info("✅ Database connection established")
    else:
        logger.warning("⚠️ Database connection failed - results will not be saved!")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
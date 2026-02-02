import time
import socket
import json
import sys
import asyncio
import base64
import requests
import subprocess
import contextlib
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

# --- Feature Flag for Internal Scanner ---
USE_INTERNAL_SCANNER = os.getenv("USE_INTERNAL_SCANNER", "true") == "true"

def extract_algorithms_from_tls_scan(scan_data: Dict) -> List[Dict]:
    """Transform SSL Labs data to standard scoring format"""
    algorithms = []
    
    # TLS 1.2 ciphers
    tls12_suites = scan_data.get("tls_configuration", {}).get("tls_1.2_cipher_suites", {}).get("suites", [])
    for idx, suite in enumerate(tls12_suites):
        if suite.get("key_exchange"):
            algorithms.append({
                "name": suite["key_exchange"],
                "algorithm_type": "kex",
                "curve": suite.get("curve"),
                "curve_bits": suite.get("curve_bits"),
                "position": idx,
                "context": {"protocol": "TLS 1.2", "cipher_suite": suite["name"]}
            })
        
        if suite.get("encryption"):
            key_size = 256 if "256" in suite["encryption"] else 128
            algorithms.append({
                "name": suite["encryption"],
                "algorithm_type": "symmetric",
                "key_size": key_size,
                "position": idx,
                "context": {"protocol": "TLS 1.2"}
            })

    # TLS 1.3 ciphers
    tls13_suites = scan_data.get("tls_configuration", {}).get("tls_1.3_cipher_suites", {}).get("suites", [])
    for idx, suite in enumerate(tls13_suites):
        if suite.get("key_exchange"):
            algorithms.append({
                "name": suite["key_exchange"],
                "algorithm_type": "kex",
                "curve": suite.get("key_exchange"),
                "curve_bits": suite.get("curve_bits"),
                "position": idx,
                "context": {"protocol": "TLS 1.3", "cipher_suite": suite["name"]}
            })
        
        if suite.get("encryption"):
            key_size = 256 if "256" in suite["encryption"] else 128
            algorithms.append({
                "name": suite["encryption"],
                "algorithm_type": "symmetric",
                "key_size": key_size,
                "position": idx,
                "context": {"protocol": "TLS 1.3"}
            })

    # Certificate signatures
    cert_sigs = scan_data.get("signature_algorithms", {}).get("certificate_signatures", [])
    for cert in cert_sigs:
        algorithms.append({
            "name": cert.get("signature_algorithm", "RSA"),
            "algorithm_type": "signature",
            "key_size": cert.get("public_key_size"),
            "position": cert.get("position", 0),
            "context": {"source": "certificate"}
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
        async def create_scan_batch(self, *args): return True
        async def save_failed_scan(self, *args): return True
        async def save_scan_result(self, *args): return True
        async def update_batch_status(self, *args): return True
        async def get_scan_results(self, *args, **kwargs): return []
        async def get_batch_info(self, *args): return {}
        async def get_all_batches(self, *args): return []
        async def search_scans(self, *args): return []
        async def _ensure_connected(self): 
            logger.warning("MockDatabaseHandler: _ensure_connected called, mock connection is disabled.")
            self.enabled = False
            return
        async def delete_batch_from_db(self, *args): return False
        async def delete_result_from_db(self, *args): return False
        async def clear_all_from_db(self, *args): return {"deleted_results": 0, "deleted_batches": 0}

    AsyncDatabaseHandler = MockDatabaseHandler
    logger.warning("Using MockDatabaseHandler. Ensure 'db_handler' module is installed for database functionality.")
# Initialize database handler (add after pqc_analyzer initialization)
db_handler = AsyncDatabaseHandler()

app = FastAPI(title="SSL Labs Scan Service", version="5.0")

@app.on_event("startup")
async def startup_event():
    """Verify database connection on startup"""
    logger.info("🚀 Starting scan-service...")
    logger.info(f"📊 Database URL: {db_handler.db_service_url}")
    
    # Test connection
    await db_handler._ensure_connected()
    
    if db_handler.enabled:
        logger.info("✅ Database connection established")
    else:
        logger.warning("⚠️ Database connection failed - results will not be saved!")

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
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"

class ScanRequest(BaseModel):
    domain: str
    max_concurrent: int = 5
    save_to_db: bool = True  # option to save to database
    batch_id: Optional[str] = None  # optional: use existing batch instead of creating new one
    
    @validator('domain')
    def validate_and_parse_domains(cls, v):
        """Parse comma-separated domains and clean them (NO protocol removal here)."""
        if ',' in v:
            domains = [d.strip() for d in v.split(',')]
        else:
            domains = [v.strip()]
        
        cleaned = []
        for domain in domains:
            # Preserve protocol if present, only clean up trailing slash
            domain = domain.lower().rstrip("/")
            if domain and domain not in cleaned:
                cleaned.append(domain)
        
        if not cleaned:
            raise ValueError("No valid domains provided")
        
        return ','.join(cleaned)

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
    """Extract encryption algorithm from cipher suite name."""
    if "AES_128_GCM" in cipher_name:
        return "AES-128-GCM"
    elif "AES_256_GCM" in cipher_name:
        return "AES-256-GCM"
    elif "AES_128_CBC" in cipher_name:
        return "AES-128-CBC"
    elif "AES_256_CBC" in cipher_name:
        return "AES-256-CBC"
    elif "CHACHA20_POLY1305" in cipher_name:
        return "ChaCha20-Poly1305"
    return "Unknown"

def extract_key_exchange(cipher_name: str, kx_type: Optional[str] = None) -> str:
    """Extract key exchange algorithm from cipher suite name."""
    if "ECDHE" in cipher_name:
        return "ECDHE"
    elif kx_type == "ECDH":
        return "ECDH"
    elif "RSA" in cipher_name and "ECDHE" not in cipher_name:
        return "RSA"
    return "Unknown"

def extract_authentication(cipher_name: str) -> str:
    """Extract authentication algorithm from cipher suite name."""
    if "RSA" in cipher_name:
        return "RSA"
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
                    pubkey_type = type(pubkey).__name__.replace('PublicKey', '')
                    
                    if sig_hash_alg:
                        hash_name = sig_hash_alg.name.upper()
                        sig_algorithm = f"{hash_name}with{pubkey_type}"
                    else:
                        sig_algorithm = f"UNKNOWNwith{pubkey_type}"
                    
                    results.append({
                        "position": i,
                        "certificate_subject": cert.get("subject", "Unknown"),
                        "signature_algorithm": sig_algorithm,
                        "hash_algorithm": sig_hash_alg.name.upper() if sig_hash_alg else "UNKNOWN",
                        "public_key_type": pubkey_type,
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

def handle_scan_with_backoff(domain: str, use_cache: bool, attempt: int, timeout: int, max_backoff_retries: int = 3) -> Dict[str, Any]:
    """
    Wrapper that handles rate limiting with exponential backoff.
    This runs in a separate thread, so it needs its own event loop.
    """
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        for retry in range(max_backoff_retries):
            try:
                return loop.run_until_complete(process_single_domain(domain, use_cache, attempt, timeout))
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






async def run_internal_scanner(domain: str, timeout: int = 300) -> dict:
    """
    Run internal TLS scanner instead of SSL Labs.
    Drop-in replacement for run_ssllabs_cli_async().
    """
    try:
        # Prepare domain URL
        parsed_url = urlparse(domain)
        hostname = parsed_url.netloc or parsed_url.path
        if hostname.startswith("www."):
            hostname = hostname[4:]
        
        url = f"https://{hostname}"
        
        logger.info(f"Starting internal scan: {hostname}")
        
        # Call internal scanner
        scan_result = await internal_scan_domain(url)
        
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

def detect_protocol(domain: str) -> str:
    """Detect if a domain is HTTP or HTTPS."""
    if domain.startswith("https://"):
        return "https"
    if domain.startswith("http://"):
        return "http"
    
    # Simple check for port 443 to guess HTTPS
    try:
        with socket.create_connection((domain.split('/')[0], 443), timeout=2):
            return "https"
    except (socket.timeout, socket.gaierror, ConnectionRefusedError, OSError):
        # If 443 fails, assume http or that it's just a domain name
        pass

    # Default to http if no other information
    return "http"

def quick_domain_check(domain: str, timeout: int = 2) -> tuple[bool, str]:
    """Check if a domain resolves via DNS."""
    try:
        hostname = urlparse(f"//{domain}").hostname or domain
        socket.gethostbyname(hostname)
        return True, ""
    except socket.gaierror:
        return False, f"DNS resolution failed for {domain}"
    except Exception as e:
        return False, f"An unexpected error occurred during DNS check for {domain}: {e}"

async def process_single_domain(
    domain: str, 
    use_cache: bool = True, 
    attempt: int = 1, 
    timeout: int = 300,
    batch_id: str = None,
    save_to_db: bool = False
) -> Dict[str, Any]:
    """Process a single domain scan, with HTTP/HTTPS logic."""
    
    # ✅ FIX: Generate batch_id if not provided
    if save_to_db and not batch_id:
        batch_id = f"batch_{int(datetime.now().timestamp())}_{hash(domain) % 10000}"
        await db_handler.create_scan_batch(batch_id, 1, 1)

    # 1. Protocol Detection
    protocol = detect_protocol(domain)
    
    if protocol != "https":
        error_message = f"Domain is {protocol.upper()} and cannot be scanned (TLS/SSL only)."
        logger.warning(f"Skipping {domain}: {error_message}")
        
        request_id = f"{domain}_{int(datetime.now().timestamp())}"
        
        transformed_result = {
            "domain": domain,
            "scan_status": "http_skipped",
            "error_detail": error_message,
        }
        return format_result_for_frontend(transformed_result, request_id)

    # 2. Proceed with HTTPS scan
    scan_start_time = datetime.now()
    try:
        # DNS check
        is_resolvable, error_msg = quick_domain_check(domain, timeout=2)
        
        if not is_resolvable:
            raise APIError(status_code=503, error_code="dns_resolution_failed", message=error_msg)
        
        # Run internal scanner
        raw_result = await run_internal_scanner(domain, timeout=timeout)
        
        # Transform result
        transformed_result = transform_scan_result(raw_result)
        
        # Score via remote service
        scoring_results = await score_tls_scan_remote(transformed_result)
        
        transformed_result["pqc_analysis"] = scoring_results
        
        # Remove duplicates and finalize
        transformed_result = remove_duplicates_from_structure(transformed_result)
        transformed_result["scan_metadata"] = {
            "attempt": attempt,
            "cached": use_cache,
            "timestamp": datetime.now().isoformat()
        }
        transformed_result["scan_status"] = "completed"
        
        request_id = f"{domain}_{int(datetime.now().timestamp())}"
        result = format_result_for_frontend(transformed_result, request_id)
        
        # Calculate execution time
        scan_end_time = datetime.now()
        execution_time = (scan_end_time - scan_start_time).total_seconds()
        result["execution_time_seconds"] = round(execution_time, 2)
        
        logger.info(f"⏱️  Scan for {domain} took {execution_time:.2f} seconds")
        
        # Save to database if requested
        if save_to_db and batch_id:
            try:
                await db_handler.save_scan_result(result, batch_id)
                logger.info(f"✅ Saved result for {domain} to batch {batch_id}")
            except Exception as e:
                logger.error(f"Failed to save result for {domain}: {e}")
        
        return result
    
    except APIError:
        raise
    except Exception as e:
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
    """
    logger.info("Entered /scan endpoint")
    try:
        # ✅ FIX: Generate unique batch_id automatically
        if not request.batch_id or request.batch_id == "string":
            batch_id = f"batch_{int(datetime.now().timestamp())}_{hash(request.domain) % 10000}"
        else:
            batch_id = request.batch_id
        
        # ✅ FIX: Create batch in database FIRST
        if request.save_to_db:
            domains_list = [d.strip() for d in request.domain.split(',')]
            
            # ✅ DO NOT convert to JSON string
            request_payload = {
                "domains": domains_list,
                "domain_string": request.domain,
                "max_concurrent": request.max_concurrent
            }
            
            success = await db_handler.create_scan_batch(
                batch_id=batch_id,
                total_urls=len(domains_list),
                max_concurrent=request.max_concurrent,
                request_payload=request_payload  # ✅ Pass as dict
            )
            if not success:
                logger.error(f"Failed to create batch {batch_id} in database")
                raise APIError(500, "batch_creation_failed", "Failed to create scan batch")
        
        # Use the raw domains from the validated model string
        domains = [d.strip() for d in request.domain.split(',')]
        
        domains_to_scan = domains
        skipped_domains = [] # Initialize as empty, as process_single_domain will handle skips
        
        if not domains: # Check if the original input 'domains' is empty
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

        if len(domains_to_scan) == 1:
            # For a single domain that is HTTPS, use a longer default timeout.
            result = await process_single_domain(
                domains_to_scan[0], 
                timeout=6000, 
                batch_id=batch_id, 
                save_to_db=request.save_to_db
            )
            return result
        
        # Multi-domain with retry logic (HTTPS only)
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
                    executor.submit(handle_scan_with_backoff, domain, use_cache, round_num, current_timeout): domain 
                    for domain in domains_to_scan
                }
                
                for future in as_completed(future_to_domain):
                    domain = future_to_domain[future]
                    try:
                        result = future.result()
                        
                        if result.get("scan_status") == "http_skipped":
                             # This should not happen since we pre-filtered, but handle defensively
                            skipped_domains.append(result)
                            retry_state.remove_success(domain)
                            continue
                            
                        retry_state.add_success(result)
                        retry_state.remove_success(domain) # Remove from failed_domains list
                        logger.info(f"[{round_num}] Success: {domain}")
                        time.sleep(5)  # ✅ Increased to 5 seconds
                        
                    except HTTPException as e:
                        # Distinguish rate limits from other errors
                        if e.status_code == 429:
                            logger.warning(f"[{round_num}] Rate Limited: {domain} - will retry with backoff")
                        retry_state.add_failure(domain, e.detail, round_num)
                        logger.error(f"[{round_num} Failed: {domain} - {e.detail}")
                        
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
        
        # Prepare final response
        final_response = {
            "summary": {
                "total_domains": len(domains),
                "successful": len(retry_state.successful_domains),
                "failed": len(final_failed_scans), # Include original HTTP skips
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
    """
    Scan domains with live progress updates and retry logic.
    Uses Server-Sent Events for real-time updates.
    """
    logger.info("Entered /scan-with-progress endpoint")

    async def event_stream():
        request_id = f"scan_{int(datetime.now().timestamp())}_{hash(request.domain) % 10000}"
        batch_id = request.batch_id if request.batch_id else f"batch_{int(datetime.now().timestamp())}"
        domains = [d.strip() for d in request.domain.split(',') if d.strip()]
        retry_state = RetryState()

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
                        current_timeout
                    ): domain
                    for domain in domains_to_scan
                }

                for future in as_completed(future_to_domain):
                    domain = future_to_domain[future]
                    try:
                        result = future.result()
                        
                        retry_state.add_success(result)
                        retry_state.remove_success(domain)

                        if request.save_to_db:
                            await db_handler.save_scan_result(result, batch_id)

                        progress_data = {
                            'type': 'domain_complete',
                            'domain': domain,
                            'status': 'completed',
                            'round': round_num,
                            'result': result 
                        }
                        yield f"data: {json.dumps(progress_data)}\n\n"

                    except Exception as e:
                        retry_state.add_failure(domain, str(e), round_num)
                        yield f"data: {json.dumps({'type': 'error', 'domain': domain, 'error': str(e)})}\n\n"

            # Prepare for next round
            domains_to_scan = retry_state.get_failed_domains()
            
            round_summary = {
                'type': 'round_complete',
                'round': round_num,
                'successful': len(retry_state.successful_domains),
                'failed': len(retry_state.failed_domains),
                'remaining': len(domains_to_scan)
            }
            yield f"data: {json.dumps(round_summary)}\n\n"


            if domains_to_scan and round_num < max_retries:
                await asyncio.sleep(retry_delay)

        # Final summary
        final_summary_data = {
            'type': 'scan_complete',
            'summary': {
                'total_domains': len(domains),
                'successful': len(retry_state.successful_domains),
                'failed': len(retry_state.failed_domains),
                'rounds_completed': max_retries if domains_to_scan else round_num,
            },
            'successful_scans': retry_state.successful_domains,
            'failed_scans': list(retry_state.failed_domains.values())
        }
        yield f"data: {json.dumps(final_summary_data)}\n\n"

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
        "message": "SSL Labs Scan API with Database Integration and HTTP/HTTPS Filtering",
        "version": "5.0",
        "endpoints": {
            "/scan": "POST - Scan with automatic retry (HTTPS only)",
            "/scan-with-progress": "POST - Scan with live SSE updates and DB storage (HTTPS only)",
            "/results": "GET - Fetch scan results from database",
            "/results/batch/{batch_id}": "GET - Get all results for specific batch",
            "/batches": "GET - Get all scan batches",
            "/results/search": "GET - Search scan results with filters",
            "/scans/batch/{batch_id}": "DELETE - Delete a scan batch and its results",
            "/scans/result/{result_id}": "DELETE - Delete a single scan result",
            "/scans/clear-all": "DELETE - Delete ALL data (dangerous)",
            "/cancel-scan/{request_id}": "POST - Cancel ongoing scan",
            "/health": "GET - Health check"
        },
        "features": [
            "✅ **NEW: Protocol Filtering (HTTPS only scans)**",
            "✅ Automatic retry for failed scans (up to 3 rounds)",
            "✅ In-memory state management (no file storage)",
            "✅ Cache management between rounds",
            "✅ Live progress updates via SSE",
            "✅ PostgreSQL database integration (optional)",
            "✅ Batch tracking with unique IDs",
            "✅ Query and search historical results",
            "✅ Delete individual results or entire batches"
        ],
        "example_request": {
            "domain": "https://example.com, http://google.com, github.com",
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
    """Health check endpoint."""
    logger.info("Health check called")
    try:
        subprocess.run(
            ["ssllabs-scan", "--help"],
            capture_output=True,
            timeout=5
        )
        return {
            "status": "healthy",
            "ssllabs_cli": "available",
            "version": "4.0"
        }
    except (FileNotFoundError, subprocess.TimeoutExpired):
        raise APIError(status_code=503, error_code="cli_not_available", message="ssllabs-scan CLI not available or timed out")
    except Exception as e:
        logger.exception(f"Health check failed: {str(e)}")
        raise APIError(status_code=500, error_code="health_check_failed", message=f"Health check failed: {str(e)}")

# ============================================================
# DATABASE QUERY ENDPOINTS
# ============================================================

@app.get("/results")
async def get_scan_results(
    batch_id: Optional[str] = Query(None, description="Filter by batch ID"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """Fetch scan results from database."""
    logger.info("Entered /results endpoint")
    try:
        results = await db_handler.get_scan_results(batch_id, limit, offset)
        logger.info("Scan results retrieved successfully")
        return results
    except Exception as e:
        logger.exception("Scan results retrieval failed")
        raise APIError(status_code=500, error_code="results_retrieval_failed", message=f"Scan results retrieval failed: {str(e)}")

@app.get("/results/batch/{batch_id}")
async def get_batch_results(batch_id: str):
    """Get all results for a specific batch."""
    logger.info(f"Entered /results/batch/{batch_id} endpoint")
    try:
        results = await db_handler.get_scan_results(batch_id=batch_id, limit=1000)
        batch_info = await db_handler.get_batch_info(batch_id)
        
        logger.info(f"Batch {batch_id} results retrieved successfully")
        return {
            "batch_info": batch_info,
            "results": results
        }
    except Exception as e:
        logger.exception(f"Batch {batch_id} results retrieval failed")
        raise APIError(status_code=500, error_code="batch_results_retrieval_failed", message=f"Batch {batch_id} results retrieval failed: {str(e)}")

@app.get("/batches")
async def get_all_batches(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """Get all scan batches."""
    logger.info("Entered /batches endpoint")
    try:
        results = await db_handler.get_all_batches(limit, offset)
        logger.info("All batches retrieved successfully")
        return results
    except Exception as e:
        logger.exception("All batches retrieval failed")
        raise APIError(status_code=500, error_code="all_batches_retrieval_failed", message=f"All batches retrieval failed: {str(e)}")

@app.get("/results/search")
async def search_scan_results(
    url: Optional[str] = Query(None, description="Search by URL"),
    status: Optional[str] = Query(None, description="Filter by status"),
    from_date: Optional[str] = Query(None, description="From date (ISO format)"),
    to_date: Optional[str] = Query(None, description="To date (ISO format)"),
    limit: int = Query(100, ge=1, le=500)
):
    """Search scan results with filters."""
    logger.info("Entered /results/search endpoint")
    try:
        results = await db_handler.search_scans(url, status, from_date, to_date, limit)
        logger.info("Search results retrieved successfully")
        return results
    except Exception as e:
        logger.exception("Search results retrieval failed")
        raise APIError(status_code=500, error_code="results_search_failed", message=f"Search results retrieval failed: {str(e)}")

@app.get("/debug/db-connection")
async def debug_db_connection():
    """Debug endpoint to test database connectivity."""
    await db_handler._ensure_connected() # Call ensure connected to update db_handler.enabled
    can_connect = db_handler.enabled # Use the updated status
    return {
        "db_service_url": db_handler.db_service_url,
        "db_enabled": db_handler.enabled,
        "can_connect": can_connect,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/debug/test-save")
async def debug_test_save():
    """Test saving a dummy record to database."""
    test_batch_id = f"test_{int(datetime.now().timestamp())}"
    
    # Try to create a batch
    batch_created = await db_handler.create_scan_batch(test_batch_id, 1, 1)
    
    # Try to save a result
    test_result = {
        "request_id": f"test_{int(datetime.now().timestamp())}",
        "url": "test.example.com",
        "requested_at": datetime.now().isoformat(),
        "execution_time_seconds": 1.5,
        "tls_version": "TLS 1.3",
        "cipher_suite_name": "TLS_AES_256_GCM_SHA384",
        "quantum_score": 85,
        "quantum_grade": "A",
        "raw_response": {"test": "data"}
    }
    
    result_saved = await db_handler.save_scan_result(test_result, test_batch_id)
    
    # Try to update batch
    batch_updated = await db_handler.update_batch_status(test_batch_id, "completed", 1, 0)
    
    return {
        "batch_created": batch_created,
        "result_saved": result_saved,
        "batch_updated": batch_updated,
        "test_batch_id": test_batch_id,
        "db_enabled": db_handler.enabled
    }

# ============================================================
# DELETE ENDPOINTS (Proxy to DB Service)
# ============================================================

@app.delete("/scans/batch/{batch_id}")
async def delete_scan_batch_endpoint(batch_id: str = Path(..., description="Batch ID to delete")):
    """
    Delete a scan batch and all its associated results.
    This endpoint proxies to the db-service.
    """
    logger.info(f"Entered /scans/batch/{batch_id} for deletion")
    try:
        success = await db_handler.delete_batch_from_db(batch_id)
        
        if success:
            logger.info(f"Scan batch {batch_id} deleted successfully")
            return {
                "message": "Scan batch and all its results deleted successfully",
                "batch_id": batch_id,
                "timestamp": datetime.now().isoformat()
            }
        else:
            raise APIError(status_code=404, error_code="batch_not_found", message=f"Scan batch '{batch_id}' not found or already deleted")
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Error deleting batch: {str(e)}")
        raise APIError(status_code=500, error_code="batch_deletion_failed", message=f"Error deleting batch: {str(e)}")


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
    DANGER: Delete ALL scan batches and results from database.
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
            "message": "All data cleared successfully from database",
            "deleted_results": result.get("deleted_results", 0),
            "deleted_batches": result.get("deleted_batches", 0),
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
# NEW QUEUE-BASED ARCHITECTURE ENDPOINTS
# ============================================================

@app.post("/create-scan-request")
async def create_scan_request(request: ScanRequest):
    """
    Queue-based scan: Create a pending scan request in database.
    Background worker will pick it up and process asynchronously.
    
    Returns batch_id that client can poll for status.
    """
    logger.info(f"Creating scan request for domains: {request.domain}")
    
    try:
        # Generate IDs
        batch_id = f"batch_{int(datetime.now().timestamp())}_{hash(request.domain) % 10000}"
        domains = [d.strip() for d in request.domain.split(',') if d.strip()]
        
        if not domains:
            raise APIError(400, "invalid_domains", "No valid domains provided")
        
        # Create batch in database with status "pending"
        if request.save_to_db:
            # Store the request payload so background worker can retrieve domains later
            request_payload = {
                "domains": domains,
                "domain_string": request.domain,
                "max_concurrent": request.max_concurrent
            }
            success = await db_handler.create_scan_batch(
                batch_id, 
                len(domains), 
                request.max_concurrent,
                request_payload=request_payload
            )
            if not success:
                logger.error(f"Failed to create batch {batch_id} in database")
                raise APIError(500, "batch_creation_failed", "Failed to create scan batch in database")
        else:
            logger.info(f"Batch {batch_id} created in memory (not saving to DB)")
        
        logger.info(f"✅ Scan request {batch_id} created and queued for processing")
        
        return {
            "batch_id": batch_id,
            "status": "pending",
            "total_domains": len(domains),
            "created_at": datetime.now().isoformat(),
            "message": "Scan request queued. Poll /batch/{batch_id} for updates."
        }
    
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Error creating scan request: {str(e)}")
        raise APIError(500, "request_creation_failed", f"Failed to create scan request: {str(e)}")


async def execute_queued_scan(batch_id: str, domains_str: str, max_concurrent: int):
    """
    Background task to execute a queued scan.
    Runs the existing scan logic and saves results to database.
    """
    logger.info(f"⚙️  Starting execution of queued scan {batch_id}")
    
    try:
        # Update status to processing
        await db_handler.update_batch_status(batch_id, "processing", 0, 0)
        logger.info(f"📝 Batch {batch_id} status updated to processing")
        
        start_time = datetime.now()
        
        # Call the existing scan_domain function
        logger.info(f"🔍 Calling scan_domain for batch {batch_id}")
        result = await scan_domain(ScanRequest(
            domain=domains_str,
            max_concurrent=max_concurrent,
            save_to_db=True
        ))
        
        logger.info(f"📦 Scan result: {result}")
        
        # Extract results from response
        successful_scans = result.get("successful_scans", [])
        failed_scans = result.get("failed_scans", [])
        summary = result.get("summary", {})
        
        successful_count = len(successful_scans)
        failed_count = len(failed_scans)
        
        # Save successful results to database
        for scan_result in successful_scans:
            try:
                result_data = {
                    "url": scan_result.get("url"),
                    "batch_id": batch_id,
                    "scan_status": "success",
                    "status": "completed",
                    "execution_time_seconds": scan_result.get("execution_time_seconds", 0),
                    "raw_response": scan_result,
                    "requested_at": start_time.isoformat(),
                    "tls_version": scan_result.get("tls_version"),
                    "certificate_expiry": scan_result.get("certificate_expiry"),
                    "public_key_size_bits": scan_result.get("public_key_size_bits"),
                    "ephemeral_key_exchange": scan_result.get("ephemeral_key_exchange"),
                    "ct_present": scan_result.get("ct_present"),
                    "pqc_overall_score": scan_result.get("pqc_overall_score", 0),
                    "pqc_overall_grade": scan_result.get("pqc_overall_grade", "F"),
                }
                
                success = await db_handler.save_scan_result(result_data, batch_id)
                if success:
                    logger.info(f"✅ Saved result for {scan_result.get('url')}")
                else:
                    logger.error(f"❌ Failed to save result for {scan_result.get('url')}")
                    
            except Exception as e:
                logger.error(f"❌ Error saving result: {str(e)}")
        
        # Save failed results to database
        for failed_result in failed_scans:
            try:
                result_data = {
                    "url": failed_result.get("url"),
                    "batch_id": batch_id,
                    "scan_status": failed_result.get("scan_status", "failed"),
                    "status": "failed",
                    "error_message": failed_result.get("error_message", "Scan failed"),
                    "execution_time_seconds": failed_result.get("execution_time_seconds", 0),
                    "raw_response": failed_result,
                    "requested_at": start_time.isoformat(),
                }
                
                success = await db_handler.save_scan_result(result_data, batch_id)
                if success:
                    logger.info(f"✅ Saved failed result for {failed_result.get('url')}")
                else:
                    logger.error(f"❌ Failed to save failed result for {failed_result.get('url')}")
                    
            except Exception as e:
                logger.error(f"❌ Error saving failed result: {str(e)}")
        
        # Update final batch status
        execution_time = (datetime.now() - start_time).total_seconds()
        await db_handler.update_batch_status(batch_id, "completed", successful_count, failed_count)
        
        logger.info(f"✅ Batch {batch_id} completed: {successful_count} successful, {failed_count} failed in {execution_time:.1f}s")
        
    except Exception as e:
        logger.exception(f"❌ Error executing queued scan {batch_id}: {str(e)}")
        try:
            await db_handler.update_batch_status(batch_id, "failed", 0, 0)
        except:
            pass


@app.get("/batch/{batch_id}")
async def get_batch_status(batch_id: str):
    """
    Poll to get batch status and results.
    Statuses: pending → processing → completed/failed
    """
    logger.info(f"Polling batch status for: {batch_id}")
    
    try:
        # Get batch from database
        response = await call_service("GET", f"{db_handler.db_service_url}/scans/batch/{batch_id}", timeout=10)
        
        if response.status_code == 404:
            raise APIError(404, "batch_not_found", f"Batch {batch_id} not found")
        
        if response.status_code != 200:
            raise APIError(500, "batch_fetch_failed", f"Failed to fetch batch: {response.status_code}")
        
        batch_data = response.json()
        logger.info(f"Batch {batch_id} status: {batch_data.get('status')}")
        
        return batch_data
    
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Error fetching batch {batch_id}: {str(e)}")
        raise APIError(500, "batch_fetch_error", f"Error fetching batch: {str(e)}")


@app.post("/process-pending-scans")
async def process_pending_scans():
    """
    Background task endpoint: Pick up pending scans and process them.
    This should be called periodically by a scheduler or triggered by worker.
    
    Returns: Number of scans processed
    """
    logger.info("🔄 Processing pending scans from database queue...")
    
    try:
        # Get all pending batches from database
        response = await call_service(
            "GET",
            f"{db_handler.db_service_url}/scans/batch?status=pending",
            timeout=10
        )
        
        if response.status_code != 200:
            logger.error(f"Failed to fetch pending batches: {response.status_code}")
            return {"processed": 0, "error": "Failed to fetch pending batches"}
        
        pending_batches = response.json()
        if not isinstance(pending_batches, list):
            pending_batches = pending_batches.get('batches', [])
        
        logger.info(f"Found {len(pending_batches)} pending batches to process")
        
        processed_count = 0
        for batch in pending_batches:
            batch_id = batch.get('batch_id')
            if not batch_id:
                logger.warning("Batch without batch_id found, skipping")
                continue
            
            try:
                logger.info(f"🚀 Starting background processing for batch {batch_id}")
                # Create background task (don't await, let it run async)
                asyncio.create_task(process_batch_scan(batch_id, batch))
                processed_count += 1
                
            except Exception as e:
                logger.error(f"Error queuing batch {batch_id}: {str(e)}")
                # Mark batch as failed
                try:
                    await db_handler.update_batch_status(batch_id, "failed", 0, 1)
                except:
                    pass
        
        logger.info(f"✅ Queued {processed_count} pending scans for background processing")
        return {
            "processed": processed_count,
            "pending_batches_found": len(pending_batches)
        }
    
    except Exception as e:
        logger.exception(f"Error in process_pending_scans: {str(e)}")
        return {"processed": 0, "error": str(e)}


async def process_batch_scan(batch_id: str, batch_data: dict):
    """
    Background worker task to process a single scan batch.
    Executes the scan and saves results to database.
    """
    logger.info(f"⚙️  Starting processing of batch {batch_id}")
    
    try:
        # Update status to processing
        await db_handler.update_batch_status(batch_id, "processing", 0, 0)
        logger.info(f"📝 Updated batch {batch_id} to processing status")
        
        # Extract domains from request_payload
        request_payload = batch_data.get('request_payload', {})
        domains = request_payload.get('domains', [])
        domain_string = request_payload.get('domain_string', '')
        max_concurrent = request_payload.get('max_concurrent', 5)
        
        if not domains:
            logger.error(f"No domains found in batch {batch_id}")
            await db_handler.update_batch_status(batch_id, "failed", 0, 1)
            return
        
        logger.info(f"📌 Processing {len(domains)} domains: {domains}")
        
        start_time = datetime.now()
        
        # Call the existing scan_domain function with existing batch_id
        logger.info(f"🔍 Calling scan_domain for batch {batch_id}")
        result = await scan_domain(ScanRequest(
            domain=domain_string,
            max_concurrent=max_concurrent,
            save_to_db=True,  # Results saved by scan_domain
            batch_id=batch_id  # Pass existing batch_id to avoid creating duplicate
        ))
        
        logger.info(f"📦 Scan result for {batch_id}: {result}")
        
        # Extract results from response - handle both single domain and multi-domain formats
        if "successful_scans" in result and "failed_scans" in result:
            # Multi-domain format
            successful_scans = result.get("successful_scans", [])
            failed_scans = result.get("failed_scans", [])
        else:
            # Single domain format - result is the scan object itself
            status = result.get("status", "failed")
            if status == "completed":
                successful_scans = [result]
                failed_scans = []
            else:
                successful_scans = []
                failed_scans = [result]
        
        successful_count = len(successful_scans)
        failed_count = len(failed_scans)
        
        logger.info(f"✅ Batch {batch_id} completed: {successful_count} successful, {failed_count} failed")
        
        # Update batch status to completed with counts
        await db_handler.update_batch_status(batch_id, "completed", successful_count, failed_count)
        
    except Exception as e:
        logger.exception(f"❌ Error processing batch {batch_id}: {str(e)}")
        # Mark batch as failed
        try:
            await db_handler.update_batch_status(batch_id, "failed", 0, 1)
        except:
            pass


@app.on_event("startup")
async def startup_event():
    """Start background task to process pending scans every 10 seconds"""
    logger.info("🚀 Starting scan processor background task...")
    
    async def scan_processor():
        while True:
            try:
                await asyncio.sleep(10)  # Check every 10 seconds
                await process_pending_scans()
            except Exception as e:
                logger.error(f"Error in scan processor: {str(e)}")
                await asyncio.sleep(10)
    
    # Start as background task
    asyncio.create_task(scan_processor())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
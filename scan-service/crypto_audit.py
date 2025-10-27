from fastapi import FastAPI, HTTPException, Query, Path
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, validator
import base64
from cryptography import x509
import subprocess
import json, sys
import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Union, Optional
from tls import PQCAnalyzer
from datetime import datetime
from fastapi.middleware.cors import CORSMiddleware
from enum import Enum
import time
import socket
from cryptography.hazmat.backends import default_backend
import requests
from urllib.parse import urlparse
from db_handler import DatabaseHandler

if sys.version_info >= (3, 8):
    from typing import overload, TypeVar
else:
    from typing_extensions import overload, TypeVar

# Initialize PQC Analyzer (reusable instance)
pqc_analyzer = PQCAnalyzer()
# Initialize database handler (add after pqc_analyzer initialization)
db_handler = DatabaseHandler()

app = FastAPI(title="SSL Labs Scan Service", version="5.0")


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

class ScanStatus(str, Enum):
    PENDING = "pending"
    SCANNING = "scanning"
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"

class ScanRequest(BaseModel):
    domain: str
    max_concurrent: int = 5
    save_to_db: bool = True  # ADD THIS LINE - option to save to database
    
    @validator('domain')
    def validate_and_parse_domains(cls, v):
        """Parse comma-separated domains and clean them."""
        if ',' in v:
            domains = [d.strip() for d in v.split(',')]
        else:
            domains = [v.strip()]
        
        cleaned = []
        for domain in domains:
            domain = domain.lower()
            domain = domain.replace("https://", "").replace("http://", "").rstrip("/")
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
    
    # Score this algorithm for PQC
    kex_algo = result.get("key_exchange", "")
    if kex_algo:
        kex_score = pqc_analyzer.score_individual_algorithm(
            kex_algo, "kex", 
            curve_bits=result.get("curve_bits"),
            curve=result.get("curve"),
            position=position
        )
        result["kex_pqc_score"] = kex_score.final_score
        result["kex_pqc_grade"] = kex_score.grade
        result["kex_is_pqc"] = kex_score.is_pqc
        result["kex_is_hybrid"] = kex_score.is_hybrid
        result["kex_quantum_safe"] = kex_score.quantum_safe
    
    # Score encryption algorithm
    encryption = result.get("encryption", "")
    if encryption:
        key_size = 256 if "256" in encryption else (192 if "192" in encryption else 128)
        enc_score = pqc_analyzer.score_individual_algorithm(
            encryption, "symmetric", 
            key_size=key_size,
            position=position
        )
        result["encryption_pqc_score"] = enc_score.final_score
        result["encryption_pqc_grade"] = enc_score.grade
    
    return result

def transform_tls13_cipher_suite(suite: Dict[str, Any], position: int = 0) -> Dict[str, Any]:
    """Transform TLS 1.3 cipher suite to desired format."""
    result = {
        "name": suite.get("name", ""),
        "encryption": extract_encryption_algorithm(suite.get("name", "")),
        "key_exchange": suite.get("namedGroupName", ""),
        "curve_bits": suite.get("namedGroupBits", 0)
    }
    # Score KEX
    kex = result.get("key_exchange", "")
    if kex:
        kex_score = pqc_analyzer.score_individual_algorithm(
            kex, "kex",
            curve_bits=result.get("curve_bits"),
            curve=kex,
            position=position
        )
        result["kex_pqc_score"] = kex_score.final_score
        result["kex_pqc_grade"] = kex_score.grade
        result["kex_is_pqc"] = kex_score.is_pqc
        result["kex_is_hybrid"] = kex_score.is_hybrid
        result["kex_quantum_safe"] = kex_score.quantum_safe
    
    # Score encryption
    encryption = result.get("encryption", "")
    if encryption:
        key_size = 256 if "256" in encryption else (192 if "192" in encryption else 128)
        enc_score = pqc_analyzer.score_individual_algorithm(
            encryption, "symmetric",
            key_size=key_size,
            position=position
        )
        result["encryption_pqc_score"] = enc_score.final_score
        result["encryption_pqc_grade"] = enc_score.grade
    
    return result

def transform_named_group(group: Dict[str, Any], position: int = 0) -> Dict[str, Any]:
    """Transform named group/curve to desired format with PQC scoring."""
    curve_name = group.get("name", "")
    curve_bits = group.get("bits", 0)
    
    # ✅ ADD: Score the curve as a key exchange algorithm
    curve_score = pqc_analyzer.score_individual_algorithm(
        curve_name,
        "kex",
        curve=curve_name,
        curve_bits=curve_bits,
        position=position
    )
    
    return {
        "name": curve_name,
        "type": group.get("namedGroupType", ""),
        "bits": curve_bits,
        # ✅ ADD: PQC fields
        "curve_pqc_score": curve_score.final_score,
        "curve_pqc_grade": curve_score.grade,
        "curve_is_pqc": curve_score.is_pqc,
        "curve_is_hybrid": curve_score.is_hybrid,
        "curve_quantum_safe": curve_score.quantum_safe,
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
    key_alg = cert.get("keyAlg", "")
    key_size = cert.get("keySize", 0)

    # ✅ ADD: Score the public key algorithm
    key_score = pqc_analyzer.score_individual_algorithm(
        pqc_analyzer.parse_signature_algorithm(key_alg) if key_alg else "RSA",
        "signature",
        key_size=key_size,
        position=position
    )

    if role == "leaf":
        cn = cert.get("commonNames", [""])[0] if cert.get("commonNames") else ""
        sig_alg = cert.get("sigAlg", "")
        key_alg = cert.get("keyAlg", "")
        key_size = cert.get("keySize", 0)
        
        return {
            "certificate": f"{cn}_{sig_alg.replace('with', '_').replace('RSA', 'RSA')}_{key_size}",
            "subject_alternative_names": cert.get("altNames", []),
            "certificate_transparency": cert.get("sct", False),
            # ✅ ADD: PQC fields
            "cert_pqc_score": key_score.final_score,
            "cert_pqc_grade": key_score.grade,
            "cert_is_pqc": key_score.is_pqc,
            "cert_is_hybrid": key_score.is_hybrid,
            "cert_quantum_safe": key_score.quantum_safe,
        }
    else:
        # For intermediate and root certificates
        return {
            "public_key_algorithm": cert.get("keyAlg", ""),
            "public_key_size": cert.get("keySize", 0),
            # ✅ ADD: PQC fields
            "cert_pqc_score": key_score.final_score,
            "cert_pqc_grade": key_score.grade,
            "cert_is_pqc": key_score.is_pqc,
            "cert_is_hybrid": key_score.is_hybrid,
            "cert_quantum_safe": key_score.quantum_safe,
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
        print(f"⚠️ Warning: No endpoint details for {domain}, returning minimal data")
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
    
    # Add component-level PQC scores for TLS 1.2
    if transformed["tls_configuration"]["tls_1.2_cipher_suites"]["suites"]:
        tls12_kex_scores = [s.get("kex_pqc_score", 0) for s in 
                            transformed["tls_configuration"]["tls_1.2_cipher_suites"]["suites"] 
                            if "kex_pqc_score" in s]
        if tls12_kex_scores:
            avg_score = sum(tls12_kex_scores) / len(tls12_kex_scores)
            transformed["tls_configuration"]["tls_1.2_cipher_suites"]["component_kex_score"] = round(avg_score, 2)
            transformed["tls_configuration"]["tls_1.2_cipher_suites"]["component_kex_grade"] = pqc_analyzer.score_to_grade(avg_score)
    
    # Add component-level PQC scores for TLS 1.3
    if transformed["tls_configuration"]["tls_1.3_cipher_suites"]["suites"]:
        tls13_kex_scores = [s.get("kex_pqc_score", 0) for s in 
                            transformed["tls_configuration"]["tls_1.3_cipher_suites"]["suites"] 
                            if "kex_pqc_score" in s]
        if tls13_kex_scores:
            avg_score = sum(tls13_kex_scores) / len(tls13_kex_scores)
            transformed["tls_configuration"]["tls_1.3_cipher_suites"]["component_kex_score"] = round(avg_score, 2)
            transformed["tls_configuration"]["tls_1.3_cipher_suites"]["component_kex_grade"] = pqc_analyzer.score_to_grade(avg_score)
    
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
    """Extract signature algorithms from SSL Labs certificate data with PQC scoring."""
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
                    
                    # ✅ ADD: Score the signature algorithm
                    sig_score = pqc_analyzer.score_individual_algorithm(
                        pqc_analyzer.parse_signature_algorithm(sig_algorithm),
                        "signature",
                        key_size=cert.get("keySize", 0),
                        position=i
                    )
                    
                    # ✅ ADD: Score the hash algorithm
                    hash_score = pqc_analyzer.score_individual_algorithm(
                        hash_name if sig_hash_alg else "SHA256",
                        "hash",
                        position=i
                    )
                    
                    results.append({
                        "position": i,
                        "certificate_subject": cert.get("subject", "Unknown"),
                        "signature_algorithm": sig_algorithm,
                        "hash_algorithm": sig_hash_alg.name.upper() if sig_hash_alg else "UNKNOWN",
                        "public_key_type": pubkey_type,
                        "public_key_size": cert.get("keySize", 0),
                        "signature_algorithm_oid": x509_cert.signature_algorithm_oid.dotted_string if x509_cert.signature_algorithm_oid else None,
                        # ✅ ADD: PQC fields for signature
                        "sig_pqc_score": sig_score.final_score,
                        "sig_pqc_grade": sig_score.grade,
                        "sig_is_pqc": sig_score.is_pqc,
                        "sig_is_hybrid": sig_score.is_hybrid,
                        "sig_quantum_safe": sig_score.quantum_safe,
                        # ✅ ADD: PQC fields for hash
                        "hash_pqc_score": hash_score.final_score,
                        "hash_pqc_grade": hash_score.grade,
                    })
                    continue
                    
                except Exception as e:
                    print(f"⚠️ Failed to parse raw cert at position {i}: {e}")
            
            # Fallback: Use SSL Labs provided data
            sig_alg = cert.get("sigAlg", "Unknown")
            hash_alg = sig_alg.split("with")[0] if "with" in sig_alg else "SHA256"
            
            # ✅ ADD: Score with fallback data
            sig_score = pqc_analyzer.score_individual_algorithm(
                pqc_analyzer.parse_signature_algorithm(sig_alg),
                "signature",
                key_size=cert.get("keySize", 0),
                position=i
            )
            
            hash_score = pqc_analyzer.score_individual_algorithm(
                pqc_analyzer.parse_hash_algorithm(hash_alg),
                "hash",
                position=i
            )
            
            results.append({
                "position": i,
                "certificate_subject": cert.get("subject", "Unknown"),
                "signature_algorithm": sig_alg,
                "hash_algorithm": hash_alg,
                "public_key_type": cert.get("keyAlg", "Unknown"),
                "public_key_size": cert.get("keySize", 0),
                # ✅ ADD: PQC fields
                "sig_pqc_score": sig_score.final_score,
                "sig_pqc_grade": sig_score.grade,
                "sig_is_pqc": sig_score.is_pqc,
                "sig_is_hybrid": sig_score.is_hybrid,
                "sig_quantum_safe": sig_score.quantum_safe,
                "hash_pqc_score": hash_score.final_score,
                "hash_pqc_grade": hash_score.grade,
            })
            
        except Exception as e:
            print(f"❌ Error extracting signature from cert {i}: {e}")
            results.append({
                "position": i,
                "error": str(e)
            })
    
    return results


def extract_handshake_signature_algorithms(details: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract supported signature algorithms from SSL Labs scan details with PQC scoring."""
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
                        # ✅ ADD: Score this algorithm
                        sig_score = pqc_analyzer.score_individual_algorithm(
                            pqc_analyzer.parse_signature_algorithm(algo_name),
                            "signature",
                            position=len(supported)
                        )
                        
                        supported.append({
                            "algorithm": algo_name,
                            "protocol": "TLS 1.2",
                            # ✅ ADD: PQC fields
                            "sig_pqc_score": sig_score.final_score,
                            "sig_pqc_grade": sig_score.grade,
                            "sig_is_pqc": sig_score.is_pqc,
                            "sig_is_hybrid": sig_score.is_hybrid,
                            "sig_quantum_safe": sig_score.quantum_safe,
                        })
                        seen.add("ecdsa_sha256_tls12")
                    
                    if "SHA384" in cipher_name and "ecdsa_sha384_tls12" not in seen:
                        algo_name = "ecdsa_secp384r1_sha384"
                        sig_score = pqc_analyzer.score_individual_algorithm(
                            pqc_analyzer.parse_signature_algorithm(algo_name),
                            "signature",
                            position=len(supported)
                        )
                        
                        supported.append({
                            "algorithm": algo_name,
                            "protocol": "TLS 1.2",
                            "sig_pqc_score": sig_score.final_score,
                            "sig_pqc_grade": sig_score.grade,
                            "sig_is_pqc": sig_score.is_pqc,
                            "sig_is_hybrid": sig_score.is_hybrid,
                            "sig_quantum_safe": sig_score.quantum_safe,
                        })
                        seen.add("ecdsa_sha384_tls12")
                
                # RSA signature algorithms
                if "RSA" in cipher_name and "ECDHE" in cipher_name:
                    if "SHA256" in cipher_name and "rsa_sha256_tls12" not in seen:
                        algo_name = "rsa_pkcs1_sha256"
                        sig_score = pqc_analyzer.score_individual_algorithm(
                            pqc_analyzer.parse_signature_algorithm(algo_name),
                            "signature",
                            position=len(supported)
                        )
                        
                        supported.append({
                            "algorithm": algo_name,
                            "protocol": "TLS 1.2",
                            "sig_pqc_score": sig_score.final_score,
                            "sig_pqc_grade": sig_score.grade,
                            "sig_is_pqc": sig_score.is_pqc,
                            "sig_is_hybrid": sig_score.is_hybrid,
                            "sig_quantum_safe": sig_score.quantum_safe,
                        })
                        seen.add("rsa_sha256_tls12")
                    
                    if "SHA384" in cipher_name and "rsa_sha384_tls12" not in seen:
                        algo_name = "rsa_pkcs1_sha384"
                        sig_score = pqc_analyzer.score_individual_algorithm(
                            pqc_analyzer.parse_signature_algorithm(algo_name),
                            "signature",
                            position=len(supported)
                        )
                        
                        supported.append({
                            "algorithm": algo_name,
                            "protocol": "TLS 1.2",
                            "sig_pqc_score": sig_score.final_score,
                            "sig_pqc_grade": sig_score.grade,
                            "sig_is_pqc": sig_score.is_pqc,
                            "sig_is_hybrid": sig_score.is_hybrid,
                            "sig_quantum_safe": sig_score.quantum_safe,
                        })
                        seen.add("rsa_sha384_tls12")
    
    # Check TLS 1.3 cipher suites
    for suite_group in suites:
        if suite_group.get("protocol") == 772:  # TLS 1.3
            # TLS 1.3 uses different signature schemes
            if "rsa_pss_sha256" not in seen:
                algo_name = "rsa_pss_rsae_sha256"
                sig_score = pqc_analyzer.score_individual_algorithm(
                    pqc_analyzer.parse_signature_algorithm(algo_name),
                    "signature",
                    position=len(supported)
                )
                
                supported.append({
                    "algorithm": algo_name,
                    "protocol": "TLS 1.3",
                    "sig_pqc_score": sig_score.final_score,
                    "sig_pqc_grade": sig_score.grade,
                    "sig_is_pqc": sig_score.is_pqc,
                    "sig_is_hybrid": sig_score.is_hybrid,
                    "sig_quantum_safe": sig_score.quantum_safe,
                })
                seen.add("rsa_pss_sha256")
            
            if "ecdsa_sha256_tls13" not in seen:
                algo_name = "ecdsa_secp256r1_sha256"
                sig_score = pqc_analyzer.score_individual_algorithm(
                    pqc_analyzer.parse_signature_algorithm(algo_name),
                    "signature",
                    position=len(supported)
                )
                
                supported.append({
                    "algorithm": algo_name,
                    "protocol": "TLS 1.3",
                    "sig_pqc_score": sig_score.final_score,
                    "sig_pqc_grade": sig_score.grade,
                    "sig_is_pqc": sig_score.is_pqc,
                    "sig_is_hybrid": sig_score.is_hybrid,
                    "sig_quantum_safe": sig_score.quantum_safe,
                })
                seen.add("ecdsa_sha256_tls13")
            
            if "ecdsa_sha384_tls13" not in seen:
                algo_name = "ecdsa_secp384r1_sha384"
                sig_score = pqc_analyzer.score_individual_algorithm(
                    pqc_analyzer.parse_signature_algorithm(algo_name),
                    "signature",
                    position=len(supported)
                )
                
                supported.append({
                    "algorithm": algo_name,
                    "protocol": "TLS 1.3",
                    "sig_pqc_score": sig_score.final_score,
                    "sig_pqc_grade": sig_score.grade,
                    "sig_is_pqc": sig_score.is_pqc,
                    "sig_is_hybrid": sig_score.is_hybrid,
                    "sig_quantum_safe": sig_score.quantum_safe,
                })
                seen.add("ecdsa_sha384_tls13")
    
    # If nothing found, provide defaults based on what ciphers exist
    if not supported:
        algo_name = "rsa_pkcs1_sha256"
        sig_score = pqc_analyzer.score_individual_algorithm(
            pqc_analyzer.parse_signature_algorithm(algo_name),
            "signature",
            position=0
        )
        
        supported.append({
            "algorithm": algo_name,
            "protocol": "TLS 1.2",
            "sig_pqc_score": sig_score.final_score,
            "sig_pqc_grade": sig_score.grade,
            "sig_is_pqc": sig_score.is_pqc,
            "sig_is_hybrid": sig_score.is_hybrid,
            "sig_quantum_safe": sig_score.quantum_safe,
        })
    
    return supported

def transform_scan_result_old(data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Transform the entire scan result to the desired structure."""
    if not data or len(data) == 0:
        raise ValueError("No scan data available")
    
    result_data = data[0]
    endpoint = safe_get_endpoint(result_data)  # ✅ Safe extraction
    details = endpoint.get("details", {})
    
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
        print(f"⚠️ Warning: No endpoint details for {domain}, returning minimal data")
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
                    "suites": [transform_tls12_cipher_suite(cs) for cs in cipher_list]
                }
            elif protocol_id == 772:
                transformed["tls_configuration"]["tls_1.3_cipher_suites"] = {
                    "server_preference": preference,
                    "suites": [transform_tls13_cipher_suite(cs) for cs in cipher_list]
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
    # transformed = remove_duplicates_from_structure(transformed)
    
    return transformed

def clear_ssllabs_cache():
    """Clear SSL Labs cache by running with --nocache flag."""
    try:
        print("🧹 Clearing SSL Labs cache...")
        # Just a marker - actual clearing happens by using fresh scans
        return True
    except Exception as e:
        print(f"⚠️ Cache clear warning: {e}")
        return False

def quick_domain_check(domain: str, timeout: int = 5) -> tuple[bool, str]:
    """
    OPTIONAL: Only check if domain resolves via DNS, don't make HTTP requests.
    This avoids anti-bot protection while catching typos/offline servers.
    """
    try:
        socket.gethostbyname(domain.split('/')[0])  # Just DNS lookup
        return True, ""
    except socket.gaierror:
        return False, f"Domain '{domain}' does not exist (DNS lookup failed)"
    except Exception as e:
        # If DNS works, assume domain is reachable
        return True, ""

def safe_get_first_item(items: List[Any], default: Any = None) -> Any:
    """Safely get first item from list or return default."""
    if default is None:
        default = {}
    return items[0] if items else default

def format_result_for_frontend(transformed_result: Dict[str, Any], request_id: str) -> Dict[str, Any]:
    """Format scan result to match frontend expectations."""
    tls_config = transformed_result.get("tls_configuration", {})
    cert_chain = transformed_result.get("certificate_chain", {})
    
    # ✅ Safe access to intermediate certificates
    intermediate_cert = safe_get_first_item(
        cert_chain.get("intermediate_certificates", [])
    )
    
    # ✅ Safe access to TLS 1.3 cipher suites
    tls13_suites = tls_config.get("tls_1.3_cipher_suites", {}).get("suites", [])
    tls13_first_suite = safe_get_first_item(tls13_suites)
    
    # ✅ Safe access to TLS 1.2 cipher suites
    tls12_suites = tls_config.get("tls_1.2_cipher_suites", {}).get("suites", [])
    tls12_first_suite = safe_get_first_item(tls12_suites)

    # 🔧 FIX: Ensure raw_response contains the FULL transformed result
    return {
        "request_id": request_id,
        "url": transformed_result.get("domain", ""),
        "status": "completed",
        "requested_at": datetime.now().isoformat(),
        "total_urls": 1,
        "scan_status": "success",
        "tls_version": ", ".join(tls_config.get("supported_protocols", [])),
        "public_key_size_bits": intermediate_cert.get("public_key_size"),
        "cipher_suite_name": tls13_first_suite.get("name") or tls12_first_suite.get("name") or "",
        "cipher_protocol": safe_get_first_item(tls_config.get("supported_protocols", []), ""),
        "cipher_strength_bits": tls13_first_suite.get("curve_bits") or tls12_first_suite.get("curve_bits"),
        "ephemeral_key_exchange": any(
            s.get("key_exchange") == "ECDHE" 
            for s in tls_config.get("tls_1.2_cipher_suites", {}).get("suites", [])
        ),
        "public_key_algorithm": intermediate_cert.get("public_key_algorithm"),
        "ct_present": cert_chain.get("leaf_certificate", {}).get("certificate_transparency", False),
        "quantum_score": transformed_result.get("quantum_score"),
        "quantum_grade": transformed_result.get("quantum_grade"),
        # 🔧 CRITICAL FIX: Store the COMPLETE transformed result including PQC analysis
        "raw_response": transformed_result,  # ← This includes everything: tls_config, cert_chain, pqc_analysis, etc.
        "execution_time_seconds": transformed_result.get("scan_metadata", {}).get("timestamp")
    }

def handle_scan_with_backoff(domain: str, use_cache: bool, attempt: int, timeout: int, max_backoff_retries: int = 3) -> Dict[str, Any]:
    """
    Wrapper that handles rate limiting with exponential backoff.
    Retries only for rate limits, not other errors.
    """
    for retry in range(max_backoff_retries):
        try:
            return process_single_domain(domain, use_cache, attempt, timeout)
        except RateLimitException as e:
            if retry < max_backoff_retries - 1:
                wait_time = (2 ** retry) * 5  # 5s, 10s, 20s
                print(f"⏳ Rate limited on {domain}, waiting {wait_time}s (retry {retry + 1}/{max_backoff_retries})")
                time.sleep(wait_time)
                print(f"🔄 Retrying {domain} after backoff...")  # ← ADD THIS
            else:
                print(f"❌ Rate limit retries exhausted for {domain}")
                raise HTTPException(status_code=429, detail=f"Rate limit exceeded for {domain}")
        except HTTPException:
            # Don't retry other HTTP errors (503, 504, 500, etc.)
            raise
        except Exception:
            # Don't retry unexpected errors
            raise
    
    # This line should never be reached, but just in case
    raise HTTPException(status_code=500, detail=f"Unexpected error in backoff handler for {domain}")

def run_ssllabs_cli(domain: str, use_cache: bool = True, timeout: int = 300):
    """Run ssllabs-scan CLI tool and return parsed JSON."""
    try:
        print(f"🔍 Scanning: {domain} (cache: {use_cache})")
        
        cmd = ["ssllabs-scan", "--quiet"]
        if use_cache:
            cmd.append("--usecache")
        cmd.append(domain)
        
        result = subprocess.run(
            cmd,
            capture_output=True, 
            text=True, 
            check=True,
            timeout=timeout
        )
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        print(f"⏱️ Scan timeout for {domain} after {timeout}s - domain may be slow to analyze")
        raise HTTPException(status_code=504, detail=f"Scan timed out for {domain} after {timeout}s")
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr or "Scan failed"
        # More comprehensive rate limit detection
        rate_limit_indicators = [
            "429",
            "rate limit",
            "too many requests",
            "assessment failed: HTTP 429",  # SSL Labs specific
            "service overloaded",
            "throttled",
            "try again later"
        ]
        if any(indicator in error_msg.lower() for indicator in rate_limit_indicators):
            raise RateLimitException(f"Rate limited for {domain}")
        raise HTTPException(status_code=500, detail=f"Scan failed for {domain}: {error_msg}")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Invalid JSON from scan: {str(e)}")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="ssllabs-scan not found")

def process_single_domain(domain: str, use_cache: bool = True, attempt: int = 1, timeout: int = 300) -> Dict[str, Any]:
    """Process a single domain scan."""
    try:
        # Only check DNS, not HTTP connectivity
        is_resolvable, error_msg = quick_domain_check(domain, timeout=2)
        if not is_resolvable:
            raise HTTPException(status_code=503, detail=error_msg)
        
        raw_result = run_ssllabs_cli(domain, use_cache=use_cache, timeout=timeout)
        transformed_result = transform_scan_result(raw_result)
        
        # Get PQC analysis - FIX HERE
        data_for_analysis = {
            "url": transformed_result.get("domain", ""),
            "requested_at": datetime.now().isoformat(),
            "raw_response": transformed_result
        }
        pqc_report = pqc_analyzer.analyze_tls_configuration(data_for_analysis)
        
        # Extract scores from the report
        pqc_analysis = {
            "overall_score": pqc_report.overall_score,
            "overall_grade": pqc_report.overall_grade,
            "security_level": pqc_report.security_level,
            "quantum_ready": pqc_report.quantum_ready,
            "hybrid_ready": pqc_report.hybrid_ready,
            "components": {
                comp_name: {
                    "weighted_average": comp.weighted_average,
                    "grade": comp.grade,
                    "pqc_percentage": comp.pqc_percentage,
                    "quantum_safe_count": comp.quantum_safe_count
                }
                for comp_name, comp in pqc_report.components.items()
            }
        }
        
        # Add overall scores to top level (backward compatibility)
        transformed_result["quantum_score"] = pqc_analysis.get("overall_score", 0)
        transformed_result["quantum_grade"] = pqc_analysis.get("overall_grade", "F")
        
        # Add detailed PQC analysis as separate key
        transformed_result["pqc_analysis"] = pqc_analysis
        
        transformed_result = remove_duplicates_from_structure(transformed_result)
        transformed_result["scan_metadata"] = {
            "attempt": attempt,
            "cached": use_cache,
            "timestamp": datetime.now().isoformat()
        }
        
        # Return formatted result for frontend
        request_id = f"{domain}_{int(datetime.now().timestamp())}"
        return format_result_for_frontend(transformed_result, request_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing {domain}: {str(e)}")

@app.post("/scan")
def scan_domain(request: ScanRequest):
    """
    Enhanced scan with automatic retry logic.
    - Tracks failed domains in memory
    - Retries up to max_retries rounds
    - Clears cache between rounds (optional)
    - Returns all results with metadata
    """
    domains = [d.strip() for d in request.domain.split(',')]
    
    if len(domains) == 1:
        # For a single domain, use a longer default timeout as there are no retries in this path.
        result = process_single_domain(domains[0], timeout=600)
        return result
    
    # Multi-domain with retry logic
    retry_state = RetryState()
    max_retries = 3
    retry_delay = 30
    clear_cache_between_rounds = False
    retry_state.total_rounds = max_retries
    initial_timeout = 600  # 10 minutes
    timeout_increment = 300  # Increase by 5 minutes each round
    
    domains_to_scan = domains.copy()
    # ✅ NEW: Pre-check all domains for connectivity (no retries for offline domains)
    print(f"\n🔍 Pre-checking connectivity for {len(domains_to_scan)} domains...")
    confirmed_online = []
    confirmed_offline = []
    
    for domain in domains_to_scan:
        is_reachable, error_msg = quick_domain_check(domain, timeout=5)
        if is_reachable:
            confirmed_online.append(domain)
            print(f"✅ {domain} - Online")
        else:
            confirmed_offline.append({
                "domain": domain,
                "error": error_msg,
                "last_attempt": 0,
                "first_failed_at": datetime.now().isoformat()
            })
            print(f"❌ {domain} - Offline")
    
    # Add offline domains directly to failed state
    for offline_domain in confirmed_offline:
        retry_state.failed_domains[offline_domain["domain"]] = offline_domain
    
    # Only scan domains that are online
    domains_to_scan = confirmed_online
    
    if not domains_to_scan:
        print("⚠️ No domains are online. Skipping scan.")

    for round_num in range(1, max_retries + 1):
        # ✅ NEW: Skip retry loop if no domains to scan
        if not domains_to_scan:
            print("⏭️ No domains to scan, skipping round.")
            break
        retry_state.current_round = round_num
        print(f"\n{'='*60}")
        print(f"🔄 ROUND {round_num}/{max_retries} - Scanning {len(domains_to_scan)} domains")
        print(f"{'='*60}")
        
        # Determine cache usage
        use_cache = (round_num == 1)  # Use cache only in first round
        current_timeout = initial_timeout + (timeout_increment * (round_num - 1))
        
        round_results = []
        round_failures = []
        
        with ThreadPoolExecutor(max_workers=min(2, len(domains_to_scan))) as executor:
            future_to_domain = {
                executor.submit(handle_scan_with_backoff, domain, use_cache, round_num, current_timeout): domain 
                for domain in domains_to_scan
            }
            
            for future in as_completed(future_to_domain):
                domain = future_to_domain[future]
                try:
                    result = future.result()
                    round_results.append(result)
                    retry_state.add_success(result)
                    retry_state.remove_success(domain)
                    print(f"✅ [{round_num}] Success: {domain}")
                    time.sleep(5)  # ✅ Increase from 3 to 5 seconds
                    
                except HTTPException as e:
                    # Distinguish rate limits from other errors
                    if e.status_code == 429:
                        print(f"🚫 [{round_num}] Rate Limited: {domain} - will retry with backoff")
                    retry_state.add_failure(domain, e.detail, round_num)
                    print(f"❌ [{round_num}] Failed: {domain} - {e.detail}")
                    
                except Exception as e:
                    retry_state.add_failure(domain, str(e), round_num)
                    print(f"❌ [{round_num}] Failed: {domain} - {str(e)}")
        
        # Update domains to scan for next round
        domains_to_scan = retry_state.get_failed_domains()
        
        # If no failures, we're done
        if not domains_to_scan:
            print(f"🎉 All domains successful after round {round_num}!")
            break
        
        # If more rounds remaining, prepare for retry
        if round_num < max_retries:
            print(f"⏳ Waiting {retry_delay}s before retry round {round_num + 1}...")
            print(f"📋 Domains to retry: {', '.join(domains_to_scan)}")
            
            if clear_cache_between_rounds:
                clear_ssllabs_cache()
            
            time.sleep(retry_delay)
    
    # Prepare final response
    final_response = {
        "summary": {
            "total_domains": len(domains),
            "successful": len(retry_state.successful_domains),
            "failed": len(retry_state.failed_domains),
            "rounds_completed": retry_state.current_round,
            "timestamp": datetime.now().isoformat()
        },
        "successful_scans": retry_state.successful_domains,
        "failed_scans": list(retry_state.failed_domains.values()) if retry_state.failed_domains else []
    }
    
    return final_response

@app.post("/scan-with-progress")
async def scan_with_progress(request: ScanRequest):
    """
    Scan domains with live progress updates and retry logic.
    Uses Server-Sent Events for real-time updates.
    """
    
    async def event_stream():
        request_id = f"scan_{int(datetime.now().timestamp())}_{hash(request.domain) % 10000}"
        batch_id = f"batch_{int(datetime.now().timestamp())}"  # ADD THIS
        domains = [d.strip() for d in request.domain.split(',')]
        retry_state = RetryState()
        max_retries = 3
        retry_delay = 30
        clear_cache_between_rounds = False
        retry_state.total_rounds = max_retries
        initial_timeout = 600  # 10 minutes
        timeout_increment = 300  # Increase by 5 minutes each round
        
        start_time = datetime.now()
        
        # Create batch in database if save_to_db is enabled
        if request.save_to_db:
            db_handler.create_scan_batch(batch_id, len(domains), request.max_concurrent)
        
        # Send start event
        start_event = {
            'type': 'start',
            'request_id': request_id,
            'batch_id': batch_id,  # ADD THIS
            'total_domains': len(domains),
            'save_to_db': request.save_to_db,  # ADD THIS
            'max_rounds': max_retries,
            'timestamp': start_time.isoformat()
        }
        yield f"data: {json.dumps(start_event)}\n\n"
        
        domains_to_scan = domains.copy()
        # Pre-check connectivity
        for domain in domains.copy():
            is_reachable, error_msg = quick_domain_check(domain, timeout=5)
            if not is_reachable:
                retry_state.add_failure(domain, error_msg, 0)
                domains_to_scan.remove(domain)
                
                # ADD THIS: Save to database
                if request.save_to_db:
                    db_handler.save_failed_scan(
                        domain, 
                        error_msg, 
                        batch_id, 
                        f"{request_id}_{domain}"
                    )
                
                # Send domain_offline event
                offline_event = {
                    'type': 'domain_offline',
                    'domain': domain,
                    'error': error_msg, # This was missing a comma
                    'timestamp': datetime.now().isoformat()
                }
                yield f"data: {json.dumps(offline_event)}\n\n"
        
        for round_num in range(1, max_retries + 1):
            # Check if scan was cancelled before starting the round
            if is_scan_cancelled(request_id):
                cancel_event = {
                    'type': 'cancelled',
                    'message': 'Scan cancelled before round started',
                    'timestamp': datetime.now().isoformat()
                }
                yield f"data: {json.dumps(cancel_event)}\n\n"
                # Mark all unscanned domains as failed
                for domain in domains_to_scan:
                    retry_state.add_failure(domain, "Scan cancelled by user", round_num)
                break

            retry_state.current_round = round_num
            
            # Send round start event
            round_start_event = {
                'type': 'round_start',
                'round': round_num,
                'domains_in_round': len(domains_to_scan)
            }
            yield f"data: {json.dumps(round_start_event)}\n\n"
            round_start = datetime.now()  # Track when this round starts
            
            use_cache = (round_num == 1)
            current_timeout = initial_timeout + (timeout_increment * (round_num - 1))
            
            domain_start_times = {}  # Track start times for each domain
            with ThreadPoolExecutor(max_workers=min(2, len(domains_to_scan))) as executor:
                future_to_domain = {
                    executor.submit(handle_scan_with_backoff, domain, use_cache, round_num, current_timeout): domain 
                    for domain in domains_to_scan
                }
                # After creating future_to_domain dictionary, send initial events:
                for domain in domains_to_scan:
                    domain_start_times[domain] = datetime.now()  # Store the start time
                    processing_event = {
                        'type': 'domain_processing',
                        'domain': domain,
                        'status': 'processing',
                        'round': round_num,
                        'started_at': domain_start_times[domain].isoformat()
                    }
                    yield f"data: {json.dumps(processing_event)}\n\n"
                
                for future in as_completed(future_to_domain):
                    # CHECK CANCELLATION FIRST - before processing result
                    if is_scan_cancelled(request_id):
                        executor.shutdown(wait=False, cancel_futures=True)
                        break

                    domain = future_to_domain[future]
                    domain_start = domain_start_times[domain]  # Use the correct start time
                    retry_state.total_processed += 1
                    
                    try:
                        result = future.result()
                        
                        domain_end = datetime.now()
                        duration = (domain_end - domain_start).total_seconds()
                        
                        # Overwrite execution_time_seconds with the numeric duration
                        result["execution_time_seconds"] = round(duration, 2)
                        
                        retry_state.add_success(result) # Now saves a result with numeric duration
                        retry_state.remove_success(domain)
                        
                        # ADD THIS: Save to database
                        if request.save_to_db:
                            db_handler.save_scan_result(result, batch_id)
                        
                        progress_data = {
                            'type': 'domain_complete',
                            'domain': domain,
                            'status': 'completed',
                            'round': round_num,
                            'duration': round(duration, 2),
                            'completed': retry_state.total_processed,
                            'total': len(domains),
                            'percentage': round((retry_state.total_processed / len(domains)) * 100, 2),
                            'result': result,
                            'saved_to_db': request.save_to_db,  # ADD THIS
                            'round_start_time': round_start.isoformat(),
                            'domain_start_time': domain_start.isoformat(),
                            'time_in_current_round': round((datetime.now() - round_start).total_seconds(), 2),
                            'summary': {
                                'successful': len(retry_state.successful_domains),
                                'failed': len(retry_state.failed_domains)
                            }
                        }
                        yield f"data: {json.dumps(progress_data)}\n\n"
                        
                        await asyncio.sleep(5)  # ← Use async sleep here
                        
                    except (HTTPException, Exception) as e:
                        error_msg = e.detail if isinstance(e, HTTPException) else str(e)
                        # Distinguish rate limits from other errors
                        if isinstance(e, HTTPException) and e.status_code == 429:
                            print(f"🚫 [{round_num}] Rate Limited: {domain} - will retry with backoff")
                        retry_state.add_failure(domain, error_msg, round_num)
                        
                        domain_end = datetime.now()
                        duration = (domain_end - domain_start).total_seconds()
                        
                        # ADD THIS: Save to database
                        if request.save_to_db:
                            db_handler.save_failed_scan(
                                domain, 
                                error_msg, 
                                batch_id, 
                                f"{request_id}_{domain}")
                        
                        error_data = {
                            'type': 'domain_complete',
                            'domain': domain,
                            'status': 'failed',
                            'round': round_num,
                            'error': error_msg,
                            'completed': retry_state.total_processed,
                            'total': len(domains),
                            'percentage': round((retry_state.total_processed / len(domains)) * 100, 2),
                            'duration': round(duration, 2),
                            'saved_to_db': request.save_to_db,  # ADD THIS
                            'round_start_time': round_start.isoformat(),
                            'domain_start_time': domain_start.isoformat(),
                            'time_in_current_round': round((datetime.now() - round_start).total_seconds(), 2),
                            'summary': {
                                'successful': len(retry_state.successful_domains),
                                'failed': len(retry_state.failed_domains)
                            }
                        }
                        yield f"data: {json.dumps(error_data)}\n\n"
                    
                await asyncio.sleep(0)
            
            # Send round complete event
            round_end = datetime.now()
            round_duration = (round_end - round_start).total_seconds()
            
            round_complete_event = {
                'type': 'round_complete',
                'round': round_num,
                'duration': round(round_duration, 2),
                'domains_processed': len(domains_to_scan)
            }
            yield f"data: {json.dumps(round_complete_event)}\n\n"
            
            # Update domains for next round
            domains_to_scan = retry_state.get_failed_domains()
            
            if not domains_to_scan:
                break
            
            if round_num < max_retries:
                retry_wait_event = {
                    'type': 'retry_wait',
                    'round': round_num,
                    'next_round': round_num + 1,
                    'domains_to_retry': len(domains_to_scan),
                    'delay': retry_delay
                }
                yield f"data: {json.dumps(retry_wait_event)}\n\n"
                
                if clear_cache_between_rounds:
                    clear_ssllabs_cache()
                
                await asyncio.sleep(retry_delay)

        # Send final summary
        end_time = datetime.now()
        # Clean up cancellation state
        clear_cancellation(request_id)

        total_duration = (end_time - start_time).total_seconds()
        round_history_for_summary = []
        
        # Mark remaining unscanned domains as "not_started"
        all_domains_status = {}
        
        # Add successful domains
        for result in retry_state.successful_domains:
            domain = result.get('url', result.get('domain', 'unknown'))
            all_domains_status[domain] = {
                'status': 'completed',
                'duration': result.get('execution_time_seconds'),
                'round': result.get('scan_metadata', {}).get('attempt', 1) if result.get('scan_metadata') else 1,
                'result': result # Include the full result for the domain
            }
        
        # Add failed domains
        for domain, info in retry_state.failed_domains.items():
            all_domains_status[domain] = {
                'status': 'failed',
                'error': info.get('error', 'Unknown error'),
                'round': info.get('last_attempt', 1)
            }

        # Collect round history for the summary
        for i in range(1, retry_state.current_round + 1):
            round_domains = [d for d, s in all_domains_status.items() if s.get('round') == i]
            if round_domains:
                round_history_for_summary.append({
                    'round': i,
                    'domains_processed': len(round_domains),
                    'status': 'completed' # Simplified for summary
                })
        
        final_summary = {
            'type': 'complete',
            'request_id': request_id,
            'batch_id': batch_id,
            'saved_to_db': request.save_to_db,
            'timestamp': end_time.isoformat(),
            'total_duration': round(total_duration, 2),
            'rounds_completed': retry_state.current_round,
            'summary': {
                'total': len(domains),
                'successful': len(retry_state.successful_domains),
                'failed': len(retry_state.failed_domains)
            },
            'successful_domains': [r.get('url', r.get('domain', 'unknown')) for r in retry_state.successful_domains],
            'failed_domains': list(retry_state.failed_domains.keys()),
            'all_domains_status': all_domains_status,  # ← CRITICAL: Include this
            'scanRoundHistory': round_history_for_summary # Add round history to final payload
        }
        
        # ADD THIS: Update final batch status
        if request.save_to_db:
            db_handler.update_batch_status(
                batch_id, 
                "completed",
                len(retry_state.successful_domains),
                len(retry_state.failed_domains)
            )
        
        yield f"data: {json.dumps(final_summary)}\n\n"
    
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
        "message": "SSL Labs Scan API with Database Integration",
        "version": "5.0",
        "endpoints": {
            "/scan": "POST - Scan with automatic retry",
            "/scan-with-progress": "POST - Scan with live SSE updates and DB storage",
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
            "domain": "example.com, google.com, github.com",
            "max_concurrent": 5,
            "save_to_db": True
        }
    }

@app.post("/cancel-scan/{request_id}")
def cancel_scan(request_id: str):
    """Cancel an ongoing scan."""
    mark_scan_cancelled(request_id)
    return {
        "status": "cancelled",
        "request_id": request_id,
        "message": "Scan cancellation requested"
    }


@app.get("/health")
def health_check():
    """Health check endpoint."""
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
        return {
            "status": "unhealthy",
            "ssllabs_cli": "not available"
        }

# ============================================================
# DATABASE QUERY ENDPOINTS
# ============================================================

@app.get("/results")
def get_scan_results(
    batch_id: Optional[str] = Query(None, description="Filter by batch ID"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """Fetch scan results from database."""
    return db_handler.get_scan_results(batch_id, limit, offset)

@app.get("/results/batch/{batch_id}")
def get_batch_results(batch_id: str):
    """Get all results for a specific batch."""
    results = db_handler.get_scan_results(batch_id=batch_id, limit=1000)
    batch_info = db_handler.get_batch_info(batch_id)
    
    return {
        "batch_info": batch_info,
        "results": results
    }

@app.get("/batches")
def get_all_batches(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """Get all scan batches."""
    return db_handler.get_all_batches(limit, offset)

@app.get("/results/search")
def search_scan_results(
    url: Optional[str] = Query(None, description="Search by URL"),
    status: Optional[str] = Query(None, description="Filter by status"),
    from_date: Optional[str] = Query(None, description="From date (ISO format)"),
    to_date: Optional[str] = Query(None, description="To date (ISO format)"),
    limit: int = Query(100, ge=1, le=500)
):
    """Search scan results with filters."""
    return db_handler.search_scans(url, status, from_date, to_date, limit)

@app.get("/debug/db-connection")
def debug_db_connection():
    """Debug endpoint to test database connectivity."""
    return {
        "db_service_url": db_handler.db_service_url,
        "db_enabled": db_handler.enabled,
        "can_connect": db_handler._check_connection(),
        "timestamp": datetime.now().isoformat()
    }

@app.post("/debug/test-save")
def debug_test_save():
    """Test saving a dummy record to database."""
    test_batch_id = f"test_{int(datetime.now().timestamp())}"
    
    # Try to create a batch
    batch_created = db_handler.create_scan_batch(test_batch_id, 1, 1)
    
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
    
    result_saved = db_handler.save_scan_result(test_result, test_batch_id)
    
    # Try to update batch
    batch_updated = db_handler.update_batch_status(test_batch_id, "completed", 1, 0)
    
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
def delete_scan_batch_endpoint(batch_id: str = Path(..., description="Batch ID to delete")):
    """
    Delete a scan batch and all its associated results.
    This endpoint proxies to the db-service.
    """
    try:
        success = db_handler.delete_batch_from_db(batch_id)
        
        if success:
            return {
                "message": "Scan batch and all its results deleted successfully",
                "batch_id": batch_id,
                "timestamp": datetime.now().isoformat()
            }
        else:
            raise HTTPException(
                status_code=404, 
                detail=f"Scan batch '{batch_id}' not found or already deleted"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error deleting batch: {str(e)}"
        )


@app.delete("/scans/result/{result_id}")
def delete_scan_result_endpoint(result_id: int = Path(..., description="Result ID to delete")):
    """
    Delete a single scan result.
    This endpoint proxies to the db-service.
    """
    try:
        success = db_handler.delete_result_from_db(result_id)
        
        if success:
            return {
                "message": "Scan result deleted successfully",
                "result_id": result_id,
                "timestamp": datetime.now().isoformat()
            }
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Scan result with ID {result_id} not found or already deleted"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error deleting result: {str(e)}"
        )


@app.delete("/scans/clear-all")
def clear_all_scans_endpoint():
    """
    DANGER: Delete ALL scan batches and results from database.
    This operation cannot be undone.
    This endpoint proxies to the db-service.
    """
    try:
        result = db_handler.clear_all_from_db()
        
        if "error" in result:
            raise HTTPException(
                status_code=500,
                detail=result["error"]
            )
        
        return {
            "message": "All data cleared successfully from database",
            "deleted_results": result.get("deleted_results", 0),
            "deleted_batches": result.get("deleted_batches", 0),
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error clearing all data: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
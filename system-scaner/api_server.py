from fastapi import FastAPI, HTTPException, Depends, Request, status # Import Request and status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse # Import JSONResponse
from fastapi.exceptions import RequestValidationError # Import RequestValidationError
from pydantic import BaseModel, ValidationError
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, timezone
import uvicorn
import json
import os
from pathlib import Path
import zipfile
import io
from contextlib import contextmanager
from sqlalchemy import create_engine, Column, String, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import sessionmaker, relationship, Session, declarative_base
from sqlalchemy.exc import SQLAlchemyError
import logging
from exceptions import APIError # Import APIError

import requests
from typing import Dict, Any, Optional, List
from datetime import datetime
import os

# --- IST Timezone Configuration ---
IST = timezone(timedelta(hours=5, minutes=30))

def get_ist_now():
    """Get current time in IST timezone"""
    return datetime.now(IST).replace(tzinfo=None)  # Store without timezone info for consistency

# --- Remote Scoring Configuration ---
SCORING_SERVICE_URL = os.getenv("SCORING_SERVICE_URL", "http://localhost:9500")

import httpx

async def score_crypto_audit_remote(audit_results: Dict[str, Any], os_type: str) -> Dict[str, Any]:
    """
    Send audit results to remote scoring service for PQC readiness analysis.
    
    Args:
        audit_results: Raw audit data from agent
        os_type: Operating system type ("Linux" or "Windows")
    
    Returns:
        Dict containing scored results with pqc_score field
    """
    try:
        logger.info(f"Calling remote scoring service at {SCORING_SERVICE_URL}")
        
        # ✅ TRANSFORM audit results into the format expected by scoring service
        algorithms = extract_algorithms_from_audit(audit_results, os_type)
        
        payload = {
            "scoring_type": "agent",  # ✅ Specify agent scoring type
            "algorithms": algorithms,
            "metadata": {
                "os_type": os_type,
                "timestamp": datetime.now().isoformat(),
                "source": "crypto-agent"
            }
        }
        
        # ✅ CORRECT ENDPOINT: /api/v1/score/agent-audit
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{SCORING_SERVICE_URL}/api/v1/score/agent-audit",  # ✅ Fixed endpoint
                json=payload
            )
            
            if response.status_code == 200:
                scored_data = response.json()
                logger.info(f"Scoring successful - Overall score: {scored_data.get('overall_score', 'N/A')}")
                
                # Return original results with scoring added
                return {
                    **audit_results,
                    "pqc_score": scored_data  # ✅ Full scoring response
                }
            else:
                logger.error(f"Scoring service returned {response.status_code}: {response.text}")
                return {
                    **audit_results,
                    "pqc_score": {
                        "error": f"Scoring failed with status {response.status_code}",
                        "overall_score": "N/A"
                    }
                }
                
    except httpx.TimeoutException:
        logger.error(f"Scoring service timeout at {SCORING_SERVICE_URL}")
        return {
            **audit_results,
            "pqc_score": {
                "error": "Scoring service timeout",
                "overall_score": "N/A"
            }
        }
    except Exception as e:
        logger.exception(f"Unexpected error during scoring: {e}")
        return {
            **audit_results,
            "pqc_score": {
                "error": f"Unexpected error: {str(e)}",
                "overall_score": "N/A"
            }
        }


def extract_algorithms_from_audit(audit_results: Dict[str, Any], os_type: str) -> List[Dict]:
    """
    Extract and transform algorithms from audit results into scoring service format.
    
    The scoring service expects:
    {
        "name": "AES-256-GCM",
        "algorithm_type": "symmetric",  # kex, signature, symmetric, hash
        "key_size": 256,
        "position": 0
    }
    """
    algorithms = []
    
    if os_type.lower() == "linux":
        algorithms.extend(_extract_linux_algorithms(audit_results))
    elif os_type.lower() == "windows":
        algorithms.extend(_extract_windows_algorithms(audit_results))
    
    return algorithms


def _extract_linux_algorithms(audit: Dict) -> List[Dict]:
    """Extract algorithms from Linux audit results"""
    algorithms = []
    position = 0
    
    # Extract from with_sudo section (most comprehensive)
    sudo_data = audit.get("with_sudo", {})
    
    # 1. OpenSSL ciphers
    openssl = sudo_data.get("openssl_crypto", {})
    cipher_info = openssl.get("cipher_information", {})
    
    for cipher in cipher_info.get("cipher_details", [])[:10]:  # Top 10 ciphers
        algorithms.append({
            "name": cipher.get("name", "UNKNOWN"),
            "algorithm_type": "symmetric",
            "position": position,
            "context": {"source": "openssl_ciphers"}
        })
        position += 1
    
    # 2. SSH ciphers
    ssh = sudo_data.get("ssh_crypto", {})
    ssh_algos = ssh.get("algorithm_information", {})
    
    for cipher in ssh_algos.get("cipher", {}).get("algorithms", [])[:5]:
        algorithms.append({
            "name": cipher,
            "algorithm_type": "symmetric",
            "position": position,
            "context": {"source": "ssh_ciphers"}
        })
        position += 1
    
    # 3. SSH MACs (hash algorithms)
    for mac in ssh_algos.get("mac", {}).get("algorithms", [])[:5]:
        algorithms.append({
            "name": mac,
            "algorithm_type": "hash",
            "position": position,
            "context": {"source": "ssh_macs"}
        })
        position += 1
    
    # 4. SSH key exchange
    for kex in ssh_algos.get("kex", {}).get("algorithms", [])[:5]:
        algorithms.append({
            "name": kex,
            "algorithm_type": "kex",
            "position": position,
            "context": {"source": "ssh_kex"}
        })
        position += 1
    
    # 5. Certificate signatures
    certs = sudo_data.get("certificates", {})
    for cert in certs.get("certificates", [])[:3]:
        crypto = cert.get("crypto_information", {})
        sig_algo = crypto.get("signature_algorithm")
        if sig_algo:
            algorithms.append({
                "name": sig_algo,
                "algorithm_type": "signature",
                "key_size": crypto.get("key_size", 0),
                "position": position,
                "context": {"source": "certificate"}
            })
            position += 1
    
    return algorithms


def _extract_windows_algorithms(audit: Dict) -> List[Dict]:
    """
    Extract algorithms from Windows audit results.

    Every cipher suite and every certificate is scored individually —
    no deduplication — so the scoring reflects the real distribution
    of strong vs. weak algorithms across the full configuration.

    Per cipher suite:
      - KEX (from key_exchange field, or derived from cipher name)
      - Symmetric cipher
      - Hash / MAC algorithm

    Per certificate (all stores):
      - Signature algorithm (RSA, ECDSA, …)
      - Hash extracted from the signature algorithm name
    """
    algorithms = []
    position = 0

    STORE_INFO = {
        "current_user_root_store": (
            "HKCU\\SOFTWARE\\Microsoft\\SystemCertificates\\Root",
            "Trusted Root Certificates (User)",
            "CurrentUser\\Root",
        ),
        "local_machine_root_store": (
            "HKLM\\SOFTWARE\\Microsoft\\SystemCertificates\\Root",
            "Trusted Root Certificates (Machine)",
            "LocalMachine\\Root",
        ),
        "current_user_ca_store": (
            "HKCU\\SOFTWARE\\Microsoft\\SystemCertificates\\CA",
            "Intermediate CA (User)",
            "CurrentUser\\CA",
        ),
        "local_machine_ca_store": (
            "HKLM\\SOFTWARE\\Microsoft\\SystemCertificates\\CA",
            "Intermediate CA (Machine)",
            "LocalMachine\\CA",
        ),
        "current_user_authroot_store": (
            "HKCU\\SOFTWARE\\Microsoft\\SystemCertificates\\AuthRoot",
            "Third-Party Root (User)",
            "CurrentUser\\AuthRoot",
        ),
        "local_machine_authroot_store": (
            "HKLM\\SOFTWARE\\Microsoft\\SystemCertificates\\AuthRoot",
            "Third-Party Root (Machine)",
            "LocalMachine\\AuthRoot",
        ),
        "current_user_my_store": (
            "HKCU\\SOFTWARE\\Microsoft\\SystemCertificates\\My",
            "Personal Certificates (User)",
            "CurrentUser\\My",
        ),
        "local_machine_my_store": (
            "HKLM\\SOFTWARE\\Microsoft\\SystemCertificates\\My",
            "Personal Certificates (Machine)",
            "LocalMachine\\My",
        ),
    }

    CIPHER_LOCATION = "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Cryptography\\Configuration\\Local\\SSL\\00010002"

    # =========================================================================
    # 1. Parse every TLS cipher suite — one scored entry per component per suite
    # =========================================================================
    tls = audit.get("tls_ssl_configuration", {})
    cipher_suites = tls.get("cipher_suites", {})

    for cipher in cipher_suites.get("cipher_details", []):
        cipher_name = cipher.get("name", "")
        kex_raw     = cipher.get("key_exchange", "")
        hash_algo   = cipher.get("hash_algorithm", "")
        cipher_hex  = cipher.get("cipher_suite_hex", "")
        cipher_type = cipher.get("type", "")

        base_ctx = {
            "cipher_suite": cipher_name,
            "cipher_hex": cipher_hex,
            "location": CIPHER_LOCATION,
        }

        # --- KEX: prefer explicit field, fall back to name-derived value ---
        normalized_kex = None
        if kex_raw:
            normalized_kex = _normalize_kex_algorithm(kex_raw, cipher_name)
        if not normalized_kex:
            normalized_kex = _extract_kex_from_cipher_name(cipher_name)
        if normalized_kex:
            algorithms.append({
                "name": normalized_kex,
                "algorithm_type": "kex",
                "position": position,
                "context": {**base_ctx, "source": "tls_cipher_suite", "source_type": "TLS Cipher Suite"},
            })
            position += 1

        # --- Symmetric cipher ---
        symmetric_algo = _extract_symmetric_from_cipher(cipher_name)
        if symmetric_algo:
            algorithms.append({
                "name": symmetric_algo,
                "algorithm_type": "symmetric",
                "position": position,
                "key_size": _extract_key_size_from_cipher(cipher_name),
                "context": {**base_ctx, "source": "tls_cipher_suite", "source_type": "TLS Cipher Suite",
                            "cipher_type": cipher_type},
            })
            position += 1

        # --- Hash / MAC ---
        if hash_algo:
            normalized_hash = _normalize_hash_algorithm(hash_algo)
            if normalized_hash:
                algorithms.append({
                    "name": normalized_hash,
                    "algorithm_type": "hash",
                    "position": position,
                    "context": {**base_ctx, "source": "tls_cipher_suite", "source_type": "TLS Cipher Suite (MAC)"},
                })
                position += 1

    # =========================================================================
    # 2. Every certificate — signature + hash, one entry each
    # =========================================================================
    cert_stores = audit.get("certificate_stores", {})

    for store_key, store_data in cert_stores.items():
        if not isinstance(store_data, dict):
            continue

        info = STORE_INFO.get(store_key)
        if info:
            registry_path, store_friendly, logical_path = info
        else:
            registry_path  = store_key
            store_friendly = store_data.get("store_name", store_key)
            logical_path   = store_key

        store_base_ctx = {
            "store_path": logical_path,
            "registry_path": registry_path,
            "store_friendly_name": store_friendly,
            "location": registry_path,
        }

        for cert in store_data.get("certificates", []):
            sig_algo   = cert.get("signature_algorithm") or ""
            subject    = cert.get("subject", "")
            thumbprint = cert.get("thumbprint", "")

            cert_ctx = {
                **store_base_ctx,
                "source": f"certificate_{store_key}",
                "certificate_subject": subject[:80] if subject else "Unknown",
                "certificate_thumbprint": thumbprint[:16] + "..." if thumbprint else "",
                "original_algorithm": sig_algo,
                "public_key_algorithm": cert.get("public_key_algorithm", ""),
            }

            # Signature algorithm entry
            if sig_algo:
                normalized_sig = _normalize_signature_algorithm(sig_algo)
                if normalized_sig:
                    algorithms.append({
                        "name": normalized_sig,
                        "algorithm_type": "signature",
                        "key_size": cert.get("public_key_size", 0),
                        "position": position,
                        "context": {**cert_ctx, "source_type": "Windows Certificate Store"},
                    })
                    position += 1

            # Hash algorithm extracted from signature name
            sig_upper = sig_algo.upper()
            if "SHA384" in sig_upper:
                cert_hash = "SHA-384"
            elif "SHA512" in sig_upper:
                cert_hash = "SHA-512"
            elif "SHA256" in sig_upper:
                cert_hash = "SHA-256"
            elif "SHA1" in sig_upper:
                cert_hash = "SHA-1"
            elif "MD5" in sig_upper:
                cert_hash = "MD5"
            else:
                cert_hash = None

            if cert_hash:
                algorithms.append({
                    "name": cert_hash,
                    "algorithm_type": "hash",
                    "position": position,
                    "context": {**cert_ctx, "source_type": "Certificate Signature Hash",
                                "source": "certificate_signature"},
                })
                position += 1

    # =========================================================================
    # 3. CryptoAPI — FIPS mode bonus
    # =========================================================================
    crypto_api = audit.get("cryptoapi_info", {})
    if crypto_api.get("fips_mode_enabled"):
        algorithms.append({
            "name": "FIPS-140-2",
            "algorithm_type": "protocol",
            "position": position,
            "context": {
                "source": "cryptoapi_fips_mode",
                "source_type": "CryptoAPI Configuration",
                "location": "HKLM\\System\\CurrentControlSet\\Control\\Lsa\\FIPSAlgorithmPolicy",
            },
        })
        position += 1

    return algorithms


def _normalize_kex_algorithm(kex: str, cipher_name: str = "") -> str:
    """Normalize key exchange algorithm names to match scoring table."""
    kex_upper = kex.upper().strip()
    
    # Map Windows KEX names to scoring table names
    kex_mapping = {
        "ECDH": "ECDHE",
        "RSA": "RSA",
        "PSK": "PSK",
        "DH": "DHE",
        "DHE": "DHE",
        "ECDHE": "ECDHE",
    }
    
    # Check for modern/PQC KEX in cipher name
    cipher_upper = cipher_name.upper()
    if "X25519" in cipher_upper:
        if "MLKEM" in cipher_upper or "KYBER" in cipher_upper:
            return "X25519MLKEM768"  # Hybrid PQC
        return "X25519"
    if "X448" in cipher_upper:
        return "X448"
    if "MLKEM" in cipher_upper or "KYBER" in cipher_upper:
        return "MLKEM768"
    
    return kex_mapping.get(kex_upper, kex_upper)


def _extract_kex_from_cipher_name(cipher_name: str) -> str:
    """Extract KEX algorithm from full cipher suite name."""
    name_upper = cipher_name.upper()
    
    # Check for PQC hybrid first
    if "X25519MLKEM" in name_upper or "X25519_MLKEM" in name_upper:
        return "X25519MLKEM768"
    if "X25519KYBER" in name_upper or "X25519_KYBER" in name_upper:
        return "X25519KYBER768DRAFT00"
    
    # Check standard patterns
    if "ECDHE_ECDSA" in name_upper or "ECDHE_RSA" in name_upper:
        return "ECDHE"
    if "DHE_RSA" in name_upper or "DHE_DSS" in name_upper:
        return "DHE"
    if name_upper.startswith("TLS_RSA_"):
        return "RSA"
    if name_upper.startswith("TLS_PSK_") or "_PSK_" in name_upper:
        return "PSK"
    if "ECDHE" in name_upper:
        return "ECDHE"
    if "DHE" in name_upper:
        return "DHE"
    
    # TLS 1.3 cipher suites don't include KEX in name
    if name_upper.startswith("TLS_AES_") or name_upper.startswith("TLS_CHACHA"):
        return "ECDHE"  # TLS 1.3 defaults to ECDHE/X25519
    
    return ""


def _extract_symmetric_from_cipher(cipher_name: str) -> str:
    """Extract and normalize symmetric cipher from cipher suite name."""
    name_upper = cipher_name.upper()
    
    # AES-GCM variants (preferred)
    if "AES_256_GCM" in name_upper or "AES-256-GCM" in name_upper:
        return "AES-256-GCM"
    if "AES_128_GCM" in name_upper or "AES-128-GCM" in name_upper:
        return "AES-128-GCM"
    
    # AES-CBC variants
    if "AES_256_CBC" in name_upper or "AES-256-CBC" in name_upper:
        return "AES-256-CBC"
    if "AES_128_CBC" in name_upper or "AES-128-CBC" in name_upper:
        return "AES-128-CBC"
    
    # ChaCha20-Poly1305
    if "CHACHA20" in name_upper:
        return "CHACHA20-POLY1305"
    
    # 3DES (deprecated)
    if "3DES" in name_upper or "DES_CBC3" in name_upper:
        return "3DES"
    
    # RC4 (broken)
    if "RC4" in name_upper:
        return "RC4"
    
    # Generic fallback - try to extract AES pattern
    if "AES" in name_upper:
        if "256" in name_upper:
            if "GCM" in name_upper:
                return "AES-256-GCM"
            return "AES-256-CBC"
        if "128" in name_upper:
            if "GCM" in name_upper:
                return "AES-128-GCM"
            return "AES-128-CBC"
        return "AES-256"  # Default to AES-256
    
    return ""


def _extract_key_size_from_cipher(cipher_name: str) -> int:
    """Extract key size from cipher name."""
    if "256" in cipher_name:
        return 256
    if "128" in cipher_name:
        return 128
    if "192" in cipher_name:
        return 192
    return 0


def _normalize_hash_algorithm(hash_algo: str) -> str:
    """Normalize hash algorithm names."""
    hash_upper = hash_algo.upper().strip()
    
    hash_mapping = {
        "SHA384": "SHA-384",
        "SHA256": "SHA-256",
        "SHA1": "SHA-1",
        "SHA512": "SHA-512",
        "MD5": "MD5",
    }
    
    return hash_mapping.get(hash_upper, hash_upper)


def _normalize_signature_algorithm(sig_algo: str) -> str:
    """Normalize certificate signature algorithm names."""
    sig_upper = sig_algo.upper().strip()
    
    # Map Windows signature algorithm names to scoring table format
    sig_mapping = {
        "SHA256RSA": "RSA-SHA256",
        "SHA384RSA": "RSA-SHA384",
        "SHA512RSA": "RSA-SHA512",
        "SHA1RSA": "RSA",  # Deprecated, maps to base RSA
        "MD5RSA": "RSA",   # Broken, maps to base RSA
        "SHA256ECDSA": "ECDSA-SHA256",
        "SHA384ECDSA": "ECDSA-SHA384",
        "SHA512ECDSA": "ECDSA-SHA512",
        "RSASSA-PSS": "RSA-PSS",
        "ED25519": "ED25519",
        "ED448": "ED448",
    }
    
    # Handle format like "sha256RSA" -> "SHA256RSA"
    normalized = sig_mapping.get(sig_upper)
    if normalized:
        return normalized
    
    # Try partial matching
    if "ECDSA" in sig_upper:
        if "384" in sig_upper:
            return "ECDSA-SHA384"
        if "512" in sig_upper:
            return "ECDSA-SHA512"
        return "ECDSA-SHA256"
    
    if "RSA" in sig_upper:
        if "PSS" in sig_upper:
            return "RSA-PSS"
        if "384" in sig_upper:
            return "RSA-SHA384"
        if "512" in sig_upper:
            return "RSA-SHA512"
        if "256" in sig_upper:
            return "RSA-SHA256"
        return "RSA"
    
    return sig_algo  # Return original if no mapping

from logging_config import setup_logging
# Configure logging
setup_logging("SYSTEM-SCAN", logging.DEBUG)
logger = logging.getLogger(__name__)
from logging_middleware import correlation_middleware
		
app = FastAPI(title="Crypto Audit API Server")
app.middleware("http")(correlation_middleware)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "PUT", "PATCH", "OPTIONS"],
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

# Configuration
AGENT_TIMEOUT_MINUTES = 0.5  # Agent is inactive if no heartbeat for 30+ seconds
AGENT_FOLDERS = {
    "linux": "agents/linux",
    "windows": "agents/windows"
}
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/system_scanner.db")

# --- SQLAlchemy Setup ---
_sqlite_kwargs = {"connect_args": {"check_same_thread": False}} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, **_sqlite_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- SQLAlchemy Models ---
class Agent(Base):
    __tablename__ = "agents"
    agent_id = Column(String, primary_key=True, index=True)
    hostname = Column(String, nullable=False)
    ip_address = Column(String, nullable=False)
    os_info = Column(String, nullable=False)
    registered_at = Column(DateTime, nullable=False)
    last_seen = Column(DateTime, nullable=True)  # NULL for onboarded agents awaiting real agent
    # Organization tracking (populated during onboarding)
    organization_name = Column(String, nullable=True)
    suborganization_name = Column(String, nullable=True)
    application_name = Column(String, nullable=True)
    tasks = relationship("Task", back_populates="agent", cascade="all, delete-orphan")
    results = relationship("Result", back_populates="agent", cascade="all, delete-orphan")

class Task(Base):
    __tablename__ = "tasks"
    task_id = Column(String, primary_key=True, index=True)
    agent_id = Column(String, ForeignKey("agents.agent_id"), nullable=False)
    status = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    agent = relationship("Agent", back_populates="tasks")
    result = relationship("Result", back_populates="task", uselist=False, cascade="all, delete-orphan")

class Result(Base):
    __tablename__ = "results"
    result_id = Column(String, primary_key=True, index=True)
    agent_id = Column(String, ForeignKey("agents.agent_id"), nullable=False)
    task_id = Column(String, ForeignKey("tasks.task_id"), nullable=False, unique=True)
    audit_results = Column(Text, nullable=False)
    received_at = Column(DateTime, nullable=False)
    submitted_at = Column(DateTime, nullable=False)
    agent = relationship("Agent", back_populates="results")
    task = relationship("Task", back_populates="result")

# Create tables
Base.metadata.create_all(bind=engine)# Pydantic Models
class AgentRegistration(BaseModel):
    agent_id: str
    hostname: str
    ip_address: str
    os_info: str
    timestamp: str
    # Optional organization tracking (from onboarding)
    organization_name: Optional[str] = None
    suborganization_name: Optional[str] = None
    application_name: Optional[str] = None

class SystemInfo(BaseModel):
    agent_id: str
    hostname: str
    ip_address: str
    os_info: str
    kernel_version: str
    timestamp: str

class FetchActionResponse(BaseModel):
    scan_flag: bool
    task_id: Optional[str] = None
    message: str

class AuditData(BaseModel):
    agent_id: str
    task_id: str
    audit_results: Dict[str, Any]
    os: str  # "Linux" or "Windows"
    timestamp: str

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Helper Functions
def get_agent_status(agent: Agent) -> str:
    """Determine if agent is active based on last_seen timestamp"""
    if not agent or not agent.last_seen:
        return "unknown"
    
    try:
        time_diff = get_ist_now() - agent.last_seen
        if time_diff > timedelta(minutes=AGENT_TIMEOUT_MINUTES):
            return "inactive"
        return "active"
    except Exception as e:
        logger.error(f"Error calculating status for {agent.agent_id}: {e}")
        return "unknown"

def update_agent_last_seen(db: Session, agent_id: str):
    """Update the last_seen timestamp for an agent using IST"""
    agent = db.query(Agent).filter(Agent.agent_id == agent_id).first()
    if agent:
        agent.last_seen = get_ist_now()
        db.commit()
        logger.debug(f"Updated last_seen for {agent_id} (IST)")

def get_folder_files(folder_name: str):
    """Get list of files in a folder with their sizes"""
    files_list = []
    folder_path = Path(folder_name)
    if not folder_path.exists() or not folder_path.is_dir():
        return files_list
    try:
        for file_path in folder_path.iterdir():
            if file_path.is_file():
                file_stat = file_path.stat()
                files_list.append({
                    "name": file_path.name,
                    "size": file_stat.st_size,
                    "modified": datetime.fromtimestamp(file_stat.st_mtime).isoformat()
                })
    except Exception as e:
        logger.error(f"Error reading folder {folder_name}: {e}")
    return files_list

# Endpoints
@app.post("/api/v1/agent/register")
async def register_agent(registration: AgentRegistration, db: Session = Depends(get_db)):
    """Register a new agent with system information.
    
    If an agent with the same IP address already exists, reuse that agent record
    instead of creating a new one. This handles reinstallation scenarios.
    
    Agents registered via onboarding (agent_id starts with 'onboarded_') will have
    last_seen set to None so they show as inactive until a real agent connects.
    """
    logger.info("Entered /api/v1/agent/register endpoint")
    try:
        # Use IST for all timestamps
        timestamp = get_ist_now()
        
        # Check if this is a pre-registered agent from onboarding (no real agent installed yet)
        is_onboarded_placeholder = registration.agent_id.startswith("onboarded_")
        
        # For onboarded placeholders, set last_seen to None (will show as inactive)
        # For real agents, use the IST timestamp
        effective_last_seen = None if is_onboarded_placeholder else timestamp
        
        # First, check if agent with same agent_id exists
        agent = db.query(Agent).filter(Agent.agent_id == registration.agent_id).first()
        
        if agent:
            # Agent ID matches - update existing agent
            agent.hostname = registration.hostname
            agent.ip_address = registration.ip_address
            agent.os_info = registration.os_info
            # Only update last_seen for real agents, not onboarded placeholders
            if not is_onboarded_placeholder:
                agent.last_seen = timestamp
            # Update org info if provided (from onboarding)
            if registration.organization_name:
                agent.organization_name = registration.organization_name
            if registration.suborganization_name:
                agent.suborganization_name = registration.suborganization_name
            if registration.application_name:
                agent.application_name = registration.application_name
            logger.info(f"Agent updated (same ID): {registration.agent_id} ({registration.hostname})")
        else:
            # Check if there's an existing agent with same IP address
            existing_agent_by_ip = db.query(Agent).filter(
                Agent.ip_address == registration.ip_address
            ).first()
            
            if existing_agent_by_ip:
                # Reuse existing agent record - keep the original agent_id (due to FK constraints)
                logger.info(f"Found existing agent with same IP {registration.ip_address}, reactivating...")
                existing_agent_by_ip.hostname = registration.hostname
                existing_agent_by_ip.os_info = registration.os_info
                # Only update last_seen for real agents
                if not is_onboarded_placeholder:
                    existing_agent_by_ip.last_seen = timestamp
                # Update org info if provided (from onboarding)
                if registration.organization_name:
                    existing_agent_by_ip.organization_name = registration.organization_name
                if registration.suborganization_name:
                    existing_agent_by_ip.suborganization_name = registration.suborganization_name
                if registration.application_name:
                    existing_agent_by_ip.application_name = registration.application_name
                agent = existing_agent_by_ip
                logger.info(f"Agent reactivated (same IP): {existing_agent_by_ip.agent_id} ({registration.hostname})")
            else:
                # New agent - create new record
                agent = Agent(
                    agent_id=registration.agent_id,
                    hostname=registration.hostname,
                    ip_address=registration.ip_address,
                    os_info=registration.os_info,
                    registered_at=timestamp,
                    last_seen=effective_last_seen,  # None for onboarded placeholders
                    organization_name=registration.organization_name,
                    suborganization_name=registration.suborganization_name,
                    application_name=registration.application_name
                )
                db.add(agent)
                logger.info(f"New agent registered: {registration.agent_id} ({registration.hostname}) [placeholder={is_onboarded_placeholder}]")
        
        db.commit()
        return {"success": True, "message": "Agent registered successfully", "agent_id": agent.agent_id}
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("Agent registration failed")
        raise APIError(status_code=500, error_code="registration_failed", message=f"Registration failed: {str(e)}")

@app.post("/api/v1/system/info")
async def receive_system_info(system_info: SystemInfo, db: Session = Depends(get_db)):
    """Receive and store system information from agent (heartbeat)"""
    logger.info("Entered /api/v1/system/info endpoint")
    try:
        update_agent_last_seen(db, system_info.agent_id)
        agent = db.query(Agent).filter(Agent.agent_id == system_info.agent_id).first()
        status = get_agent_status(agent)
        logger.info(f"Heartbeat received from: {system_info.agent_id} ({system_info.hostname}) - Status: {status}")
        return {"success": True, "message": "System information received", "agent_id": system_info.agent_id, "status": status}
    except SQLAlchemyError as e:
        logger.exception("Failed to process system info")
        raise APIError(status_code=500, error_code="system_info_failed", message=f"Failed to process system info: {str(e)}")

@app.delete("/api/v1/agent/{agent_id}")
async def delete_agent(agent_id: str, db: Session = Depends(get_db)):
    """Delete an agent and all its associated tasks and results"""
    logger.info(f"Entered DELETE /api/v1/agent/{agent_id} endpoint")
    try:
        agent = db.query(Agent).filter(Agent.agent_id == agent_id).first()
        if not agent:
            raise APIError(status_code=404, error_code="agent_not_found", message=f"Agent {agent_id} not found")
        
        hostname = agent.hostname
        db.delete(agent)  # Cascade will delete tasks and results
        db.commit()
        
        logger.info(f"Agent deleted: {agent_id} ({hostname})")
        return {"success": True, "message": f"Agent {hostname} deleted successfully", "agent_id": agent_id}
    except APIError:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("Agent deletion failed")
        raise APIError(status_code=500, error_code="delete_failed", message=f"Failed to delete agent: {str(e)}")

@app.get("/api/v1/agent/fetchaction/{agent_id}")
async def fetch_action(agent_id: str, db: Session = Depends(get_db)):
    """Agent polls this endpoint to check if a scan is requested"""
    logger.info(f"Entered /api/v1/agent/fetchaction/{agent_id} endpoint")
    try:
        update_agent_last_seen(db, agent_id)
        task = db.query(Task).filter(Task.agent_id == agent_id, Task.status == 'pending').order_by(Task.created_at).first()
        if task:
            task.status = 'in_progress'
            task.started_at = get_ist_now()
            db.commit()
            logger.info(f"Scan task dispatched to agent: {agent_id}")
            return FetchActionResponse(scan_flag=True, task_id=task.task_id, message="Crypto audit scan requested")
        
        logger.info(f"No pending tasks for agent: {agent_id}")
        return FetchActionResponse(scan_flag=False, message="No pending tasks")
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("Fetch action failed")
        raise APIError(status_code=500, error_code="fetch_action_failed", message=f"Fetch action failed: {str(e)}")

@app.post("/api/v1/audit/result")
async def receive_audit_result(request: Request, db: Session = Depends(get_db)):
    """Receive cryptographic audit results from agent"""
    logger.info("Entered /api/v1/audit/result endpoint")
    try:
        body = await request.json()
        logger.debug(f"Received audit result payload: {body}")
        try:
            audit_data = AuditData.model_validate(body)
        except ValidationError as e:
            logger.error(f"Validation error for audit result: {e.errors()}")
            raise APIError(status_code=422, error_code="validation_failed", message="Audit result validation failed", details=e.errors())

        update_agent_last_seen(db, audit_data.agent_id)
        result_id = f"{audit_data.agent_id}_{audit_data.task_id}"

        # ✨ NEW: Score via remote service
        logger.info(f"Scoring audit results for {audit_data.agent_id}")
        scored_results = await score_crypto_audit_remote(
            audit_results=audit_data.audit_results,
            os_type=audit_data.os
        )
        if 'error' in scored_results.get('pqc_score', {}):
            logger.warning(f"Scoring failed for agent {audit_data.agent_id}: {scored_results['pqc_score']['error']}")

        overall_score = scored_results.get('pqc_score', {}).get('overall_score', 'N/A')
        logger.info(f"Scoring completed. Overall score: {overall_score}")
        
        new_result = Result(
            result_id=result_id,
            agent_id=audit_data.agent_id,
            task_id=audit_data.task_id,
            audit_results=json.dumps(scored_results),  # Store scored results
            received_at=get_ist_now(),
            submitted_at=datetime.fromisoformat(audit_data.timestamp)
        )
        db.add(new_result)
        
        task = db.query(Task).filter(Task.task_id == audit_data.task_id).first()
        if task:
            task.status = 'completed'
            task.completed_at = get_ist_now()
        
        db.commit()
        logger.info(f"Audit results received from: {audit_data.agent_id} (Task: {audit_data.task_id})")
        return {"success": True, "message": "Audit results received and stored", "result_id": result_id}
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("Failed to process audit results")
        raise APIError(status_code=500, error_code="process_audit_failed", message=f"Failed to process audit results: {str(e)}")

@app.post("/api/v1/admin/trigger-scan/{agent_id}")
async def trigger_scan(agent_id: str, db: Session = Depends(get_db)):
    """Admin endpoint to trigger a scan for a specific agent"""
    logger.info(f"Entered /api/v1/admin/trigger-scan/{agent_id} endpoint")
    try:
        agent = db.query(Agent).filter(Agent.agent_id == agent_id).first()
        if not agent:
            raise APIError(status_code=404, error_code="agent_not_found", message=f"Agent {agent_id} not found")
        
        status = get_agent_status(agent)
        if status == "inactive":
            logger.warning(f"Triggering scan for inactive agent: {agent_id}")
        
        task_id = f"task_{get_ist_now().strftime('%Y%m%d_%H%M%S_%f')}"
        new_task = Task(task_id=task_id, agent_id=agent_id, status="pending", created_at=get_ist_now())
        db.add(new_task)
        db.commit()
        
        logger.info(f"Scan triggered for agent: {agent_id} (Task ID: {task_id})")
        return {"success": True, "message": "Scan triggered successfully", "task_id": task_id, "agent_id": agent_id, "agent_status": status}
    except SQLAlchemyError as e:
        db.rollback()
        logger.exception("Failed to trigger scan")
        raise APIError(status_code=500, error_code="trigger_scan_failed", message=f"Failed to trigger scan: {str(e)}")

@app.get("/api/v1/admin/agents")
async def list_agents(db: Session = Depends(get_db)):
    """List all registered agents with current status"""
    logger.info("Entered /api/v1/admin/agents endpoint")
    try:
        agents = db.query(Agent).order_by(Agent.last_seen.desc().nullslast()).all()
        agents_with_status = []
        for agent in agents:
            agent_dict = {c.name: getattr(agent, c.name) for c in agent.__table__.columns}
            agent_dict["status"] = get_agent_status(agent)
            try:
                if agent.last_seen:
                    time_diff = get_ist_now() - agent.last_seen
                    agent_dict["minutes_since_last_seen"] = int(time_diff.total_seconds() / 60)
                else:
                    agent_dict["minutes_since_last_seen"] = 999999  # Never seen (onboarded placeholder)
            except:
                agent_dict["minutes_since_last_seen"] = 999999
            agents_with_status.append(agent_dict)
        
        active_count = sum(1 for a in agents_with_status if a["status"] == "active")
        
        logger.info("Agents listed successfully")
        return {
            "success": True, "count": len(agents_with_status), "active_count": active_count,
            "inactive_count": len(agents_with_status) - active_count,
            "timeout_minutes": AGENT_TIMEOUT_MINUTES, "server_time": get_ist_now().isoformat(),
            "agents": agents_with_status
        }
    except Exception as e:
        logger.exception("Failed to list agents")
        raise APIError(status_code=500, error_code="list_agents_failed", message=f"Failed to list agents: {str(e)}")

@app.get("/api/v1/admin/agent/{agent_id}/results")
async def get_agent_results(agent_id: str, db: Session = Depends(get_db)):
    """Get all results for a specific agent"""
    logger.info(f"Entered /api/v1/admin/agent/{agent_id}/results endpoint")
    try:
        results = db.query(Result).filter(Result.agent_id == agent_id).order_by(Result.received_at.desc()).all()
        results_list = []
        for result in results:
            result_dict = {c.name: getattr(result, c.name) for c in result.__table__.columns}
            result_dict["audit_results"] = json.loads(result_dict["audit_results"])
            results_list.append(result_dict)
        
        logger.info(f"Agent {agent_id} results retrieved successfully")
        return {"success": True, "agent_id": agent_id, "count": len(results_list), "results": results_list}
    except Exception as e:
        logger.exception(f"Failed to get agent {agent_id} results")
        raise APIError(status_code=500, error_code="agent_results_failed", message=f"Failed to get agent {agent_id} results: {str(e)}")

@app.get("/api/v1/admin/tasks")
async def list_tasks(db: Session = Depends(get_db)):
    """List all scan tasks"""
    logger.info("Entered /api/v1/admin/tasks endpoint")
    try:
        tasks = db.query(Task).order_by(Task.created_at.desc()).all()
        logger.info("Tasks listed successfully")
        return {"success": True, "count": len(tasks), "tasks": [dict(row.__dict__) for row in tasks]}
    except Exception as e:
        logger.exception("Failed to list tasks")
        raise APIError(status_code=500, error_code="list_tasks_failed", message=f"Failed to list tasks: {str(e)}")

@app.get("/api/v1/admin/results/{result_id}")
async def get_result_detail(result_id: str, db: Session = Depends(get_db)):
    """Get detailed audit results by result_id"""
    logger.info(f"Entered /api/v1/admin/results/{result_id} endpoint")
    try:
        result = db.query(Result).filter(Result.result_id == result_id).first()
        if result:
            result_dict = {c.name: getattr(result, c.name) for c in result.__table__.columns}
            result_dict["audit_results"] = json.loads(result_dict["audit_results"])
            logger.info(f"Result {result_id} retrieved successfully")
            return {"success": True, "result": result_dict}
        
        logger.warning(f"Result {result_id} not found")
        raise APIError(status_code=404, error_code="result_not_found", message=f"Result {result_id} not found")
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Failed to get result {result_id}")
        raise APIError(status_code=500, error_code="get_result_failed", message=f"Failed to get result {result_id}: {str(e)}")

@app.get("/api/v1/admin/stats")
async def get_stats(db: Session = Depends(get_db)):
    """Get overall statistics"""
    logger.info("Entered /api/v1/admin/stats endpoint")
    try:
        total_agents = db.query(func.count(Agent.agent_id)).scalar()
        # Count active agents: those with last_seen within timeout AND not NULL
        cutoff_time = get_ist_now() - timedelta(minutes=AGENT_TIMEOUT_MINUTES)
        active_agents = db.query(func.count(Agent.agent_id)).filter(
            Agent.last_seen.isnot(None),
            Agent.last_seen > cutoff_time
        ).scalar()
        task_stats = db.query(Task.status, func.count(Task.status)).group_by(Task.status).all()
        result_count = db.query(func.count(Result.result_id)).scalar()
        
        logger.info("Stats retrieved successfully")
        return {
            "success": True, "timestamp": get_ist_now().isoformat(),
            "agents": {"total": total_agents, "active": active_agents, "inactive": total_agents - active_agents},
            "tasks": {"total": sum(c for s, c in task_stats), **{s: c for s, c in task_stats}},
            "results": {"total": result_count}
        }
    except Exception as e:
        logger.exception("Failed to get stats")
        raise APIError(status_code=500, error_code="get_stats_failed", message=f"Failed to get stats: {str(e)}")

@app.get("/api/v1/files/list/{folder_type}")
async def list_files(folder_type: str):
    """List files in Linux Agent or Windows Agent folder"""
    logger.info(f"Entered /api/v1/files/list/{folder_type} endpoint")
    try:
        if folder_type not in AGENT_FOLDERS:
            raise APIError(status_code=400, error_code="invalid_folder_type", message="Invalid folder type")
        folder_name = AGENT_FOLDERS[folder_type]
        files = get_folder_files(folder_name)
        logger.info(f"Files in {folder_type} listed successfully")
        return {"success": True, "folder": folder_name, "folder_type": folder_type, "count": len(files), "files": files}
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Failed to list files in {folder_type}")
        raise APIError(status_code=500, error_code="list_files_failed", message=f"Failed to list files in {folder_type}: {str(e)}")

@app.get("/api/v1/files/download/{folder_type}/{filename}")
async def download_file(folder_type: str, filename: str):
    """Download a specific file from agent folder"""
    logger.info(f"Entered /api/v1/files/download/{folder_type}/{filename} endpoint")
    try:
        if folder_type not in AGENT_FOLDERS:
            raise APIError(status_code=400, error_code="invalid_folder_type", message="Invalid folder type")
        folder_name = AGENT_FOLDERS[folder_type]
        file_path = Path(folder_name) / filename
        if not file_path.resolve().is_relative_to(Path(folder_name).resolve()):
            raise APIError(status_code=403, error_code="access_denied", message="Access denied")
        if not file_path.exists() or not file_path.is_file():
            raise APIError(status_code=404, error_code="file_not_found", message="File not found")
        
        logger.info(f"File {filename} from {folder_type} downloaded successfully")
        return FileResponse(path=str(file_path), filename=filename, media_type='application/octet-stream')
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Failed to download file {filename} from {folder_type}")
        raise APIError(status_code=500, error_code="download_failed", message=f"Failed to download file {filename} from {folder_type}: {str(e)}")

@app.get("/api/v1/files/download-zip/{folder_type}")
async def download_folder_as_zip(folder_type: str):
    """Download all files from a folder as a ZIP archive"""
    logger.info(f"Entered /api/v1/files/download-zip/{folder_type} endpoint")
    try:
        if folder_type not in AGENT_FOLDERS:
            raise APIError(status_code=400, error_code="invalid_folder_type", message="Invalid folder type")
        folder_name = AGENT_FOLDERS[folder_type]
        folder_path = Path(folder_name)
        if not folder_path.exists() or not folder_path.is_dir():
            raise APIError(
                status_code=404,
                error_code="folder_not_found",
                message=f"Folder not found at {folder_path}"
            )
        
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            file_count = 0
            for file_path in folder_path.iterdir():
                if file_path.is_file():
                    zip_file.write(file_path, arcname=file_path.name)
                    file_count += 1
            if file_count == 0:
                raise APIError(status_code=404, error_code="no_files_found", message="No files found in folder")
        
        zip_buffer.seek(0)
        zip_filename = f"{folder_name.replace(' ', '_')}.zip"
        
        logger.info(f"Folder {folder_type} downloaded as zip successfully")
        return StreamingResponse(zip_buffer, media_type="application/zip", headers={"Content-Disposition": f"attachment; filename={zip_filename}"})
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Failed to download folder {folder_type} as zip")
        raise APIError(status_code=500, error_code="download_zip_failed", message=f"Failed to download folder {folder_type} as zip: {str(e)}")

@app.get("/health")
async def health():
    """Health check endpoint."""
    logger.debug("Health check called")
    return {"status": "ok"}

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Starting Crypto Audit API Server v3.2 (PostgreSQL)")
    logger.info("=" * 60)
    logger.info(f"Database URL: {DATABASE_URL}")
    logger.info(f"Agent Timeout: {AGENT_TIMEOUT_MINUTES} minutes")
    logger.info(f"Agent Folders: {AGENT_FOLDERS}")
    logger.info("=" * 60)
    
    uvicorn.run(app, host="0.0.0.0", port=9000)


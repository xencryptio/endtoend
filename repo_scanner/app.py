"""
Enhanced GitHub Repository Cryptographic Algorithm Scanner
With PostgreSQL caching, hash-based deduplication, job queue, and REST API
"""

import logging
import re
import os
import sys
import json
import tempfile
import subprocess
import hashlib
import threading
import shutil
import time
import asyncio
from datetime import datetime
import requests
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple, Set, Optional, Any
from fastapi import FastAPI, HTTPException, status, Request # Import Request and status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError # Import RequestValidationError
from fastapi.responses import JSONResponse # Import JSONResponse
from pydantic import BaseModel, HttpUrl
import uvicorn 
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey, Text, UniqueConstraint, Float, JSON
from sqlalchemy.orm import sessionmaker, relationship, Session
from sqlalchemy.ext.declarative import declarative_base
from contextlib import contextmanager
from logging_config import setup_logging
from exceptions import APIError
from logging_middleware import correlation_middleware
from repo_scoring import RepoScoringEngine

# --- Logging Setup ---
setup_logging("REPO-SCANNER", logging.DEBUG)
logger = logging.getLogger(__name__)

# --- SQLAlchemy Setup ---
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://scanuser:scanpass@localhost:5432/repo_scanner_db")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- SQLAlchemy Models ---
class Repository(Base):
    __tablename__ = "repositories"
    id = Column(Integer, primary_key=True, index=True)
    repo_url = Column(String, index=True, nullable=False)
    repo_hash = Column(String, nullable=False, index=True)
    branch_name = Column(String, default='main', nullable=False)
    platform = Column(String, default='GitHub', nullable=False)
    last_scanned = Column(DateTime, default=datetime.utcnow)
    scan_status = Column(String, default='pending', nullable=False)
    total_files = Column(Integer, default=0)
    total_algorithms = Column(Integer, default=0)
    quantum_safe_count = Column(Integer, default=0)  # ✅ RENAMED from pqc_safe_count
    quantum_vulnerable_count = Column(Integer, default=0)  # ✅ RENAMED from pqc_vulnerable_count
    current_status = Column(String, default='Queued for scanning')
    total_files_to_scan = Column(Integer, default=0)
    overall_security_score = Column(Float, nullable=True)
    overall_grade = Column(String, nullable=True)
    migration_plan = Column(JSON, nullable=True)
    quantum_readiness_detail = Column(JSON, nullable=True)
    critical_vulnerabilities = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    scan_results = relationship("ScanResult", back_populates="repository", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('repo_url', 'repo_hash', 'branch_name', name='uix_repo_url_hash_branch'),
    )


class ScanResult(Base):
    __tablename__ = "scan_results"
    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("repositories.id"), nullable=False)
    algorithm = Column(String, nullable=False)
    algorithm_type = Column(String, nullable=True)
    category = Column(String, nullable=False)
    # ✅ REMOVED: is_quantum_resistant (replaced by quantum_resistance_type)
    is_pqc = Column(Boolean, default=False)  # True ONLY for actual PQC algorithms
    occurrences = Column(Integer, nullable=False)
    files_affected = Column(Integer, nullable=False)
    base_score = Column(Float, nullable=True)
    final_score = Column(Float, nullable=True)
    grade = Column(String, nullable=True)
    security_level = Column(String, nullable=True)
    quantum_safe = Column(Boolean, default=False)  # ✅ PRIMARY field: Is it actually quantum-safe?
    quantum_safety_reason = Column(String, nullable=True)  # ✅ NEW: Why is it safe/unsafe?
    quantum_resistance_type = Column(String, nullable=True)  # ✅ NEW: fully_resistant/grover_resistant/vulnerable/deprecated
    deprecated = Column(Boolean, default=False)
    weighted_score = Column(Float, nullable=True)
    # Comment-aware counts (added by comment-aware scanner)
    commented_occurrences = Column(Integer, nullable=True, default=0)  # occurrences inside comments
    repository = relationship("Repository", back_populates="scan_results")
    findings = relationship("Finding", back_populates="scan_result", cascade="all, delete-orphan")

class Finding(Base):
    __tablename__ = "findings"
    id = Column(Integer, primary_key=True, index=True)
    scan_result_id = Column(Integer, ForeignKey("scan_results.id"), nullable=False)
    file_path = Column(String, nullable=False)
    line_number = Column(Integer, nullable=False)
    context = Column(Text)
    match_text = Column(String)
    scan_result = relationship("ScanResult", back_populates="findings")

class CategoryScore(Base):
    __tablename__ = "category_scores"
    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("repositories.id"), nullable=False)
    category_type = Column(String, nullable=False)  # 'kex', 'signature', 'symmetric', 'hash'
    score = Column(Float, nullable=False)
    grade = Column(String, nullable=False)
    algorithm_count = Column(Integer, nullable=False)
    best_algorithm = Column(String, nullable=True)
    worst_algorithm = Column(String, nullable=True)
    repository = relationship("Repository", backref="category_scores")


# Create tables
Base.metadata.create_all(bind=engine)

@contextmanager
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Remote Scoring Configuration ---
SCORING_SERVICE_URL = os.getenv("SCORING_SERVICE_URL", "http://localhost:9500")

def map_category_to_type(category: str) -> str:
    """Map scanner category to scoring algorithm_type"""
    mapping = {
        "Symmetric Encryption": "symmetric",
        "Authenticated Encryption": "symmetric",
        "Hash Function": "hash",
        "Digital Signature": "signature",
        "Key Exchange": "kex",
        "Asymmetric Encryption": "kex",
        "PQC Key Encapsulation": "kex",
        "PQC Digital Signature": "signature",
    }
    return mapping.get(category, "symmetric")

async def score_repository_remote(algorithms_dict: Dict) -> Dict:
    """Call universal scoring service for repository scan"""
    algorithms = []
    for algo_name, algo_data in algorithms_dict.items():
        algorithms.append({
            "name": algo_name,
            "algorithm_type": map_category_to_type(algo_data["category"]),
            "key_size": algo_data.get("key_size"),
            "position": 0,  # Repos don't have position priority
            "context": {
                "occurrences": algo_data["occurrences"],          # real (non-commented)
                "commented_occurrences": algo_data.get("commented_occurrences", 0),
                "total_occurrences": algo_data.get("total_occurrences", algo_data["occurrences"]),
                "files_affected": len(algo_data["files"]),
                "category": algo_data["category"]
            }
        })
    
    try:
        response = requests.post(
            f"{SCORING_SERVICE_URL}/api/v1/score/repository",
            json={
                "scoring_type": "repository",
                "algorithms": algorithms,
                "metadata": {"source": "repo_scanner"}
            },
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Scoring failed: {e}")
        return {"error": str(e)}

# ═══════════════════════════════════════════════════════════════════════════════
# CRYPTO_PATTERNS — Industry-ready cryptographic algorithm detection
# ═══════════════════════════════════════════════════════════════════════════════
#
# Design principles for FALSE POSITIVE elimination:
# 1. Use \b word boundaries on ALL patterns
# 2. Negative lookaheads to exclude variable names, URLs, CSS classes etc.
# 3. Require cryptographic CONTEXT (API calls, imports, config) not just keywords
# 4. DES pattern excludes DESCRIBE, DESKTOP, DESIGN, DESTROY, etc.
# 5. DH pattern excludes DHCP, DHT (BitTorrent), etc.
# 6. LMS/HQC patterns require uppercase or crypto-context to avoid natural language
# 7. Falcon excludes bird references, SABER excludes "Sabertooth", etc.
#
CRYPTO_PATTERNS = {
    # ── Symmetric Encryption ──────────────────────────────────────────────
    'AES': {
        'patterns': [
            r'\bAES[-_]?(128|192|256)\b',      # AES-256, AES_128, etc.
            r'\bAES[-_]?(GCM|CBC|CTR|CCM|ECB|CFB|OFB|XTS|SIV)\b',  # AES with mode
            r'\bCipher\.AES\b',                  # PyCryptodome
            r'\bEVP_aes_',                        # OpenSSL C API
            r'\bcrypto[./]aes\b',                 # Go/Node crypto packages
            r'\bAES\.new\b',                      # PyCrypto/PyCryptodome
            r'\bjavax\.crypto.*AES\b',            # Java JCA
            r'\bAes\.(Create|Encrypt|Decrypt)\b', # .NET
            r'\bAES\b(?![-_]?[a-z]{3,})',         # Bare AES with negative lookahead for non-crypto words
        ],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 256,
        'category': 'Symmetric Encryption'
    },
    'ChaCha20': {
        'patterns': [
            r'\bChaCha20\b(?![-_]?Poly)',         # ChaCha20 alone (not ChaCha20-Poly1305)
            r'\bchacha20\b(?![-_]?poly)',
            r'\bCHACHA20\b(?![-_]?POLY)',
            r'\bEVP_chacha20\b',
        ],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 256,
        'category': 'Symmetric Encryption'
    },
    'ChaCha20-Poly1305': {
        'patterns': [r'\bChaCha20[-_]?Poly1305\b', r'\bchacha20[-_]?poly1305\b', r'\bCHACHA20[-_]?POLY1305\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 256,
        'category': 'Authenticated Encryption'
    },
    'Salsa20': {
        'patterns': [r'\bSalsa20\b', r'\bsalsa20\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 256,
        'category': 'Symmetric Encryption'
    },
    'Twofish': {
        'patterns': [r'\bTwofish\b', r'\btwofish\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 256,
        'category': 'Symmetric Encryption'
    },
    'Blowfish': {
        'patterns': [r'\bBlowfish\b', r'\bblowfish\b', r'BF_'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 256,
        'category': 'Symmetric Encryption'
    },
    'Camellia': {
        'patterns': [r'\bCamellia\b', r'\bcamellia\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 256,
        'category': 'Symmetric Encryption'
    },
    'ARIA': {
        'patterns': [
            r'\bARIA[-_]?(128|192|256)\b',         # ARIA-128, ARIA-256
            r'\bARIA[-_]?(CBC|GCM|CTR|ECB|CFB)\b', # ARIA with mode
            r'\bARIA\b(?![-_]?[Ll]abel|[-_]?[Hh]idden|[-_]?[Ll]ive|[-_]?[Rr]ole|[-_]?[Dd]escrib)',  # Exclude HTML aria-*
        ],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 256,
        'category': 'Symmetric Encryption'
    },
    '3DES': {
        'patterns': [r'\b3DES\b', r'\bDES3\b', r'\bTripleDES\b', r'DES_EDE', r'EVP_des_ede'],
        'quantum_resistance_type': 'deprecated',  # Weak even classically
        'min_quantum_safe_keysize': None,
        'category': 'Symmetric Encryption (Weak)'
    },
    'DES': {
        'patterns': [
            r'\bDES[-_]encrypt\b',                # OpenSSL API
            r'\bEVP_des_\w+',                      # OpenSSL EVP
            r'\bDES[-_]?(CBC|ECB|CFB|OFB)\b',      # DES with mode
            r'\bDES\.new\b',                       # PyCrypto
            r'\bCipher\.DES\b',                    # PyCryptodome
            r'\bDESKeySpec\b',                     # Java
            r'(?<![A-Za-z])DES(?![A-Za-z]|CRIB|CRIPT|IGN|TINY|TROY|KTOP|K_)',  # Bare DES, excluding DESCRIBE/DESIGN/DESKTOP/DESTROY
        ],
        'quantum_resistance_type': 'deprecated',
        'min_quantum_safe_keysize': None,
        'category': 'Symmetric Encryption (Broken)'
    },
    'RC4': {
        'patterns': [r'\bRC4\b', r'\brc4\b', r'\bARC4\b', r'\bARCFOUR\b'],
        'quantum_resistance_type': 'deprecated',
        'min_quantum_safe_keysize': None,
        'category': 'Stream Cipher (Broken)'
    },
    'GCM': {
        'patterns': [
            r'[-_]GCM\b',                          # AES-GCM, AES_GCM
            r'\bGCM[-_]',                           # GCM-SHA256 etc.
            r'\bGalois[/\s]*Counter[/\s]*Mode\b',
            r'\bmode[=:\s]+["\']?GCM\b',           # mode=GCM, mode: GCM
        ],
        'quantum_resistance_type': 'mode',
        'min_quantum_safe_keysize': None,
        'category': 'Cipher Mode (AEAD)'
    },
    'CBC': {
        'patterns': [
            r'[-_]CBC\b',                           # AES-CBC, DES_CBC
            r'\bCBC[-_]',                           # CBC-MAC etc.
            r'\bmode[=:\s]+["\']?CBC\b',           # mode=CBC
            r'\bCipher[./]Block[./]Chaining\b',
        ],
        'quantum_resistance_type': 'mode',
        'min_quantum_safe_keysize': None,
        'category': 'Cipher Mode'
    },
    'CTR': {
        'patterns': [
            r'[-_]CTR\b',                           # AES-CTR
            r'\bmode[=:\s]+["\']?CTR\b',
            r'\bCounter[/\s]*Mode\b',
        ],
        'quantum_resistance_type': 'mode',
        'min_quantum_safe_keysize': None,
        'category': 'Cipher Mode'
    },
    'CCM': {
        'patterns': [
            r'[-_]CCM\b',                           # AES-CCM
            r'\bmode[=:\s]+["\']?CCM\b',
        ],
        'quantum_resistance_type': 'mode',
        'min_quantum_safe_keysize': None,
        'category': 'Cipher Mode (AEAD)'
    },
    'ECB': {
        'patterns': [
            r'[-_]ECB\b',                           # AES-ECB
            r'\bmode[=:\s]+["\']?ECB\b',
            r'\bElectronic[/\s]*Codebook\b',
        ],
        'quantum_resistance_type': 'mode',
        'min_quantum_safe_keysize': None,
        'category': 'Cipher Mode (Insecure)'
    },
    'SHA-256': {
        'patterns': [r'\bSHA256\b', r'\bsha256\b', r'SHA-256', r'sha_256', r'EVP_sha256'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 384,  # Need 384+ bits output for quantum safety
        'category': 'Hash Function'
    },
    'SHA-384': {
        'patterns': [r'\bSHA384\b', r'\bsha384\b', r'SHA-384', r'EVP_sha384'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 384,
        'category': 'Hash Function'
    },
    'SHA-512': {
        'patterns': [r'\bSHA512\b', r'\bsha512\b', r'SHA-512', r'EVP_sha512'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 384,
        'category': 'Hash Function'
    },
    'SHA-224': {
        'patterns': [r'\bSHA224\b', r'\bsha224\b', r'SHA-224'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 384,
        'category': 'Hash Function'
    },
    'SHA3-256': {
        'patterns': [r'\bSHA3[-_]256\b', r'\bsha3[-_]256\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 384,
        'category': 'Hash Function'
    },
    'SHA3-384': {
        'patterns': [r'\bSHA3[-_]384\b', r'\bsha3[-_]384\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 384,
        'category': 'Hash Function'
    },
    'SHA3-512': {
        'patterns': [r'\bSHA3[-_]512\b', r'\bsha3[-_]512\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 384,
        'category': 'Hash Function'
    },
    'BLAKE2': {
        'patterns': [r'\bBLAKE2\b', r'\bblake2[bs]\b', r'BLAKE2b', r'BLAKE2s'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 384,
        'category': 'Hash Function'
    },
    'BLAKE3': {
        'patterns': [r'\bBLAKE3\b', r'\bblake3\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 384,
        'category': 'Hash Function'
    },
    'Keccak': {
        'patterns': [r'\bKeccak\b', r'\bkeccak\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 384,
        'category': 'Hash Function'
    },
    'RIPEMD-160': {
        'patterns': [r'\bRIPEMD[-_]?160\b', r'\bripemd160\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 384,
        'category': 'Hash Function'
    },
    'Whirlpool': {
        'patterns': [r'\bWhirlpool\b', r'\bwhirlpool\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 384,
        'category': 'Hash Function'
    },
    'MD5': {
        'patterns': [r'\bMD5\b', r'\bmd5\b', r'EVP_md5'],
        'quantum_resistance_type': 'deprecated',
        'min_quantum_safe_keysize': None,
        'category': 'Hash Function (Broken)'
    },
    'MD4': {
        'patterns': [r'\bMD4\b', r'\bmd4\b'],
        'quantum_resistance_type': 'deprecated',
        'min_quantum_safe_keysize': None,
        'category': 'Hash Function (Broken)'
    },
    'SHA-1': {
        'patterns': [r'\bSHA1\b', r'\bsha1\b', r'SHA-1', r'EVP_sha1'],
        'quantum_resistance_type': 'deprecated',
        'min_quantum_safe_keysize': None,
        'category': 'Hash Function (Weak)'
    },
    'HMAC': {
        'patterns': [r'\bHMAC\b', r'\bhmac\b', r'HMAC_'],
        'quantum_resistance_type': 'construction',  # Safety depends on underlying hash
        'min_quantum_safe_keysize': None,
        'category': 'Message Authentication Code'
    },
    'CMAC': {
        'patterns': [r'\bCMAC\b', r'\bcmac\b'],
        'quantum_resistance_type': 'construction',
        'min_quantum_safe_keysize': None,
        'category': 'Message Authentication Code'
    },
    'Poly1305': {
        'patterns': [r'\bPoly1305\b', r'\bpoly1305\b'],
        'quantum_resistance_type': 'construction',
        'min_quantum_safe_keysize': None,
        'category': 'Message Authentication Code'
    },
    'PBKDF2': {
        'patterns': [r'\bPBKDF2\b', r'\bpbkdf2\b'],
        'quantum_resistance_type': 'construction',
        'min_quantum_safe_keysize': None,
        'category': 'Key Derivation Function'
    },
    'scrypt': {
        'patterns': [r'\bscrypt\b', r'\bSCRYPT\b'],
        'quantum_resistance_type': 'construction',
        'min_quantum_safe_keysize': None,
        'category': 'Key Derivation Function'
    },
    'Argon2': {
        'patterns': [r'\bArgon2\b', r'\bargon2[id]?\b'],
        'quantum_resistance_type': 'construction',
        'min_quantum_safe_keysize': None,
        'category': 'Key Derivation Function'
    },
    'bcrypt': {
        'patterns': [r'\bbcrypt\b', r'\bBCRYPT\b'],
        'quantum_resistance_type': 'construction',
        'min_quantum_safe_keysize': None,
        'category': 'Password Hashing'
    },
    'HKDF': {
        'patterns': [r'\bHKDF\b', r'\bhkdf\b'],
        'quantum_resistance_type': 'construction',
        'min_quantum_safe_keysize': None,
        'category': 'Key Derivation Function'
    },
    'RSA': {
        'patterns': [r'\bRSA\b', r'\brsa[-_]?(1024|2048|3072|4096)\b', r'RSA_', r'PKCS1', r'EVP_PKEY_RSA'],
        'quantum_resistance_type': 'vulnerable',  # Broken by Shor's algorithm
        'min_quantum_safe_keysize': None,
        'category': 'Asymmetric Encryption'
    },
    'ECDSA': {
        'patterns': [r'\bECDSA\b', r'\becdsa\b', r'EC_DSA', r'secp256[kr]1', r'prime256v1'],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Digital Signature'
    },
    'ECDH': {
        'patterns': [r'\bECDH\b', r'\becdh\b', r'EC_DH', r'ECDHE'],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Key Exchange'
    },
    'DSA': {
        'patterns': [
            r'\bDSA[-_](sign|verify|key|param)\b',  # Crypto API context
            r'\bDSA\b(?![-_]?[a-z])',                # Bare DSA, not part of ECDSA
            r'\bDigital[\s_]Signature[\s_]Algorithm\b',
            r'\bEVP_PKEY_DSA\b',
        ],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Digital Signature'
    },
    'DH': {
        'patterns': [
            r'\bDiffie[-_]?Hellman\b',
            r'\bDHE[-_]',                            # DHE-RSA, DHE-PSK etc.
            r'\bEVP_PKEY_DH\b',
            r'\bDH[-_](param|key|gen)\b',            # DH API context
            r'\bDH\b(?!CP|T\b|tml|ttp)',             # Bare DH, excluding DHCP, DHT, etc.
        ],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Key Exchange'
    },
    'ElGamal': {
        'patterns': [r'\bElGamal\b', r'\belgamal\b'],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Asymmetric Encryption'
    },
    'Ed25519': {
        'patterns': [r'\bEd25519\b', r'\bed25519\b', r'EdDSA'],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Digital Signature'
    },
    'Ed448': {
        'patterns': [r'\bEd448\b', r'\bed448\b'],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Digital Signature'
    },
    'Curve25519': {
        'patterns': [r'\bCurve25519\b', r'\bcurve25519\b', r'X25519'],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Key Exchange'
    },
    'Curve448': {
        'patterns': [r'\bCurve448\b', r'\bcurve448\b', r'X448'],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Key Exchange'
    },
    'P-256': {
        'patterns': [r'\bP-256\b', r'\bsecp256r1\b', r'prime256v1'],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Elliptic Curve'
    },
    'P-384': {
        'patterns': [r'\bP-384\b', r'\bsecp384r1\b'],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Elliptic Curve'
    },
    'P-521': {
        'patterns': [r'\bP-521\b', r'\bsecp521r1\b'],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Elliptic Curve'
    },
    'secp256k1': {
        'patterns': [r'\bsecp256k1\b'],
        'quantum_resistance_type': 'vulnerable',
        'min_quantum_safe_keysize': None,
        'category': 'Elliptic Curve (Bitcoin)'
    },
    'Kyber': {
        'patterns': [r'\bKyber\b', r'\bkyber\b', r'ML-KEM', r'CRYSTALS-Kyber'],
        'quantum_resistance_type': 'fully_resistant',  # TRUE PQC
        'min_quantum_safe_keysize': None,  # PQC algorithms don't use traditional key sizes
        'category': 'PQC Key Encapsulation',
        'is_pqc': True
    },
    'Dilithium': {
        'patterns': [r'\bDilithium\b', r'\bdilithium\b', r'ML-DSA', r'CRYSTALS-Dilithium'],
        'quantum_resistance_type': 'fully_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'PQC Digital Signature',
        'is_pqc': True
    },
    'SPHINCS+': {
        'patterns': [r'\bSPHINCS\+?\b', r'\bsphincs\b', r'SLH-DSA'],
        'quantum_resistance_type': 'fully_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'PQC Digital Signature',
        'is_pqc': True
    },
    'NTRU': {
        'patterns': [r'\bNTRU\b', r'\bntru\b', r'NTRUEncrypt'],
        'quantum_resistance_type': 'fully_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'PQC Encryption',
        'is_pqc': True
    },
    'Falcon': {
        'patterns': [
            r'\bFalcon[-_]?(512|1024)\b',           # Falcon with parameter
            r'\bFalcon\b(?![-_]?(?:[Bb]ird|[Hh]eavy|[Ss]peed|[Cc]rest|[Ee]ye))',  # Falcon not bird
        ],
        'quantum_resistance_type': 'fully_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'PQC Digital Signature',
        'is_pqc': True
    },
    'SABER': {
        'patterns': [
            r'\bSABER\b(?!tooth)',
            r'\bLightSaber\b(?![-_]?(?:[Ss]word|[Ff]ight))',
            r'\bFireSaber\b',
        ],
        'quantum_resistance_type': 'fully_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'PQC Key Encapsulation',
        'is_pqc': True
    },
    'FrodoKEM': {
        'patterns': [r'\bFrodoKEM\b', r'\bFrodo\b'],
        'quantum_resistance_type': 'fully_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'PQC Key Encapsulation',
        'is_pqc': True
    },
    'BIKE': {
        'patterns': [
            r'\bBIKE[-_]?(L[135])\b',              # BIKE-L1, BIKE-L3, BIKE-L5
            r'\bBIKE\b(?![-_]?(?:[Ss]hare|[Rr]ack|[Ll]ane|[Rr]ide|[Ss]hop))',  # BIKE not bicycle
        ],
        'quantum_resistance_type': 'fully_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'PQC Key Encapsulation',
        'is_pqc': True
    },
    'HQC': {
        'patterns': [
            r'\bHQC[-_]?(128|192|256)\b',           # HQC with parameter
            r'\bHQC\b(?=.*(?:[Kk]EM|[Ee]ncap|[Dd]ecap|[Cc]rypto|[Pp]ost[-_]?[Qq]uantum))',  # HQC in crypto context
        ],
        'quantum_resistance_type': 'fully_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'PQC Key Encapsulation',
        'is_pqc': True
    },
    'Rainbow': {
        'patterns': [r'\bRainbow\b(?!.*color)'],
        'quantum_resistance_type': 'deprecated',  # Broken PQC
        'min_quantum_safe_keysize': None,
        'category': 'PQC Digital Signature (Broken)',
        'is_pqc': True
    },
    'XMSS': {
        'patterns': [r'\bXMSS\b', r'\bxmss\b'],
        'quantum_resistance_type': 'fully_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'PQC Digital Signature',
        'is_pqc': True
    },
    'LMS': {
        'patterns': [
            r'\bLMS[-_]?(sign|verify|key)\b',       # LMS in crypto context
            r'\bHSS[-_]?LMS\b',                     # HSS/LMS hierarchical scheme
            r'\bLMS\b(?=.*(?:[Ss]ignature|[Hh]ash[-_]?[Bb]ased|[Pp]ost[-_]?[Qq]uantum|NIST))',  # LMS with crypto context
        ],
        'quantum_resistance_type': 'fully_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'PQC Digital Signature',
        'is_pqc': True
    },
    # ── Additional PQC & Hybrid algorithms ────────────────────────────────
    'McEliece': {
        'patterns': [r'\bMcEliece\b', r'\bClassic[-_]?McEliece\b', r'\bmceliece\b'],
        'quantum_resistance_type': 'fully_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'PQC Key Encapsulation',
        'is_pqc': True
    },
    'SIKE': {
        'patterns': [r'\bSIKE\b', r'\bSIDH\b'],
        'quantum_resistance_type': 'deprecated',
        'min_quantum_safe_keysize': None,
        'category': 'PQC Key Encapsulation (Broken)',
        'is_pqc': True
    },
    'SHAKE128': {
        'patterns': [r'\bSHAKE[-_]?128\b', r'\bshake128\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'Hash Function (XOF)'
    },
    'SHAKE256': {
        'patterns': [r'\bSHAKE[-_]?256\b', r'\bshake256\b'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': None,
        'category': 'Hash Function (XOF)'
    },
    'Serpent': {
        'patterns': [r'\bSerpent\b(?=.*(?:[Cc]ipher|[Ee]ncrypt|[Dd]ecrypt|[Kk]ey|AES))'],
        'quantum_resistance_type': 'grover_resistant',
        'min_quantum_safe_keysize': 256,
        'category': 'Symmetric Encryption'
    },
    'IDEA': {
        'patterns': [r'\bIDEA\b(?=.*(?:[Cc]ipher|[Ee]ncrypt|[Dd]ecrypt|[Kk]ey|[Cc]rypto))'],
        'quantum_resistance_type': 'deprecated',
        'min_quantum_safe_keysize': None,
        'category': 'Symmetric Encryption (Weak)'
    },
    'CAST5': {
        'patterns': [r'\bCAST5\b', r'\bCAST[-_]128\b'],
        'quantum_resistance_type': 'deprecated',
        'min_quantum_safe_keysize': None,
        'category': 'Symmetric Encryption (Weak)'
    },
    'RC2': {
        'patterns': [r'\bRC2\b(?=.*(?:[Cc]ipher|[Ee]ncrypt|[Dd]ecrypt|[Kk]ey|[Cc]rypto))'],
        'quantum_resistance_type': 'deprecated',
        'min_quantum_safe_keysize': None,
        'category': 'Symmetric Encryption (Broken)'
    },
}

CODE_EXTENSIONS = {
    '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c', '.h', '.hpp', 
    '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.sh', 
    '.bash', '.zsh', '.pl', '.lua', '.r', '.m', '.mm', '.dart', '.groovy',
    '.clj', '.ex', '.exs', '.erl', '.hrl', '.ml', '.fs', '.vb', '.pas',
    '.html', '.htm', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
    '.yaml', '.yml', '.json', '.toml', '.xml', '.ini', '.conf', '.config',
    '.properties', '.env', '.gradle', '.cmake', '.make', '.mk', '.dockerfile', 
    '.md', '.rst', '.txt', '.asciidoc', '.asm', '.s', '.sql', '.proto', 
    '.thrift', '.graphql'
}

# ---------------------------------------------------------------------------
# Comment-aware extraction helpers
# ---------------------------------------------------------------------------

# Language → comment syntax.
# 'single' : list of line-comment prefixes (stripped as soon as found)
# 'blk_s'  : block-comment open token
# 'blk_e'  : block-comment close token
# 'doc'    : True  → documentation file; only scan inside ``` code fences
_LANG = {
    # Python (hash comments; triple-quote docstrings handled separately)
    '.py':    {'single': ['#'],          'blk_s': None,  'blk_e': None},
    # Ruby / Shell / YAML / TOML
    '.rb':    {'single': ['#'],          'blk_s': None,  'blk_e': None},
    '.sh':    {'single': ['#'],          'blk_s': None,  'blk_e': None},
    '.bash':  {'single': ['#'],          'blk_s': None,  'blk_e': None},
    '.zsh':   {'single': ['#'],          'blk_s': None,  'blk_e': None},
    '.pl':    {'single': ['#'],          'blk_s': None,  'blk_e': None},
    '.yaml':  {'single': ['#'],          'blk_s': None,  'blk_e': None},
    '.yml':   {'single': ['#'],          'blk_s': None,  'blk_e': None},
    '.toml':  {'single': ['#'],          'blk_s': None,  'blk_e': None},
    '.r':     {'single': ['#'],          'blk_s': None,  'blk_e': None},
    # C-family / JVM / JS/TS / Go / Rust / Swift / Kotlin / Dart
    '.c':     {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.h':     {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.cpp':   {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.hpp':   {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.java':  {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.js':    {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.ts':    {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.jsx':   {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.tsx':   {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.cs':    {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.go':    {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.rs':    {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.swift': {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.kt':    {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.scala': {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.dart':  {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.php':   {'single': ['//', '#'],    'blk_s': '/*',  'blk_e': '*/'},
    '.m':     {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.mm':    {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.groovy':{'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    # SQL / Lua
    '.sql':   {'single': ['--'],         'blk_s': '/*',  'blk_e': '*/'},
    '.lua':   {'single': ['--'],         'blk_s': '--[[', 'blk_e': ']]'},
    # HTML / CSS – simplified (just skip <!-- --> style)
    '.html':  {'single': [],             'blk_s': '<!--', 'blk_e': '-->'},
    '.htm':   {'single': [],             'blk_s': '<!--', 'blk_e': '-->'},
    '.css':   {'single': [],             'blk_s': '/*',  'blk_e': '*/'},
    '.scss':  {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    '.sass':  {'single': ['//'],         'blk_s': '/*',  'blk_e': '*/'},
    # Documentation files – only scan inside ``` … ``` code fences
    '.md':    {'doc': True},
    '.rst':   {'doc': True},
    '.txt':   {'doc': True},
    '.asciidoc': {'doc': True},
}

def _find_outside_strings(line: str, token: str) -> Optional[int]:
    """
    Return the index of the first occurrence of `token` in `line` that is
    NOT inside a single- or double-quoted string literal.
    Returns None if no such occurrence exists.

    This is a best-effort heuristic (handles \\ escapes and mismatched quotes
    gracefully by falling back to a simple search on error).
    """
    in_single = False
    in_double = False
    i = 0
    tlen = len(token)
    try:
        while i < len(line):
            ch = line[i]
            # Toggle string state (skipping escaped chars)
            if ch == '\\' and (in_single or in_double):
                i += 2
                continue
            if ch == "'" and not in_double:
                in_single = not in_single
            elif ch == '"' and not in_single:
                in_double = not in_double
            elif not in_single and not in_double:
                if line[i:i + tlen] == token:
                    return i
            i += 1
    except Exception:
        # Fall back: plain search
        idx = line.find(token)
        return idx if idx != -1 else None
    return None


def _strip_inline_comment(line: str, single_prefixes: List[str]) -> str:
    """
    Remove the inline comment portion from a line (the part starting at the
    first comment prefix that lies outside string literals).
    """
    best = len(line)
    for prefix in single_prefixes:
        idx = _find_outside_strings(line, prefix)
        if idx is not None and idx < best:
            best = idx
    return line[:best]


def _extract_code_fences(lines: List[str]) -> List[str]:
    """
    For documentation files (.md / .rst / .txt), return ONLY the lines that
    are inside a triple-backtick (```) or triple-tilde (~~~) code fence.
    Lines outside fences are replaced with empty strings so that line numbers
    in findings remain valid.
    """
    result = []
    in_fence = False
    fence_marker = ''
    for line in lines:
        stripped = line.strip()
        if not in_fence:
            if stripped.startswith('```') or stripped.startswith('~~~'):
                in_fence = True
                fence_marker = stripped[:3]
                result.append('')   # fence open line – don't scan it
            else:
                result.append('')   # outside fence – replace with blank
        else:
            if stripped.startswith(fence_marker):
                in_fence = False
                result.append('')   # fence close line
            else:
                result.append(line)
    return result

def extract_key_size(algorithm: str, match_text: str) -> Optional[int]:
    """Extract key size from algorithm name or context"""
    # Try to find numeric key size (128, 192, 256, 2048, 3072, 4096)
    sizes = re.findall(r'\b(128|192|256|384|512|1024|2048|3072|4096|8192)\b', 
                       match_text.upper())
    if sizes:
        return int(sizes[0])
    
    # Default key sizes based on algorithm
    defaults = {
        'AES': 256, 'CHACHA20': 256, 'RSA': 2048,
        'ECDSA': 256, 'SHA256': 256, 'SHA512': 512
    }
    
    for algo, size in defaults.items():
        if algo in algorithm.upper():
            return size
    
    return None

class RepoUrlParser:
    """Parse and identify Git repository URLs from various platforms"""

    @staticmethod
    def detect_platform(repo_url: str) -> str:
        """Detect the Git platform from URL"""
        url_lower = repo_url.lower()

        if 'github.com' in url_lower:
            return 'GitHub'
        elif 'gitlab.com' in url_lower or 'gitlab' in url_lower:
            return 'GitLab'
        elif 'bitbucket.org' in url_lower or 'bitbucket' in url_lower:
            return 'Bitbucket'
        elif 'azure.com' in url_lower or 'visualstudio.com' in url_lower:
            return 'Azure DevOps'
        elif 'gitea' in url_lower:
            return 'Gitea'
        elif 'codeberg.org' in url_lower:
            return 'Codeberg'
        elif 'sourceforge' in url_lower:
            return 'SourceForge'
        else:
            return 'Generic Git'

    @staticmethod
    def normalize_url(repo_url: str) -> str:
        """Normalize Git URL to clone format"""
        from urllib.parse import urlparse  # Import at function level
        import re

        repo_url = repo_url.strip()
        repo_url = repo_url.rstrip('/')

        if repo_url.startswith('http://') or repo_url.startswith('https://'):
            if repo_url.endswith('.git'):
                return repo_url

            parsed = urlparse(repo_url)

            # GitHub URL patterns
            if 'github.com' in parsed.netloc:
                path = re.sub(r'/tree/[^/]+/?.*$', '', parsed.path)
                path = re.sub(r'/blob/[^/]+/?.*$', '', parsed.path)
                return f"https://github.com{path}.git"

            # GitLab URL patterns
            elif 'gitlab' in parsed.netloc:
                path = re.sub(r'/-/tree/[^/]+/?.*$', '', parsed.path)
                path = re.sub(r'/-/blob/[^/]+/?.*$', '', parsed.path)
                if not path.endswith('.git'):
                    path += '.git'
                return f"{parsed.scheme}://{parsed.netloc}{path}"

            # Bitbucket URL patterns
            elif 'bitbucket' in parsed.netloc:
                path = re.sub(r'/src/[^/]+/?.*$', '', parsed.path)
                if not path.endswith('.git'):
                    path += '.git'
                return f"{parsed.scheme}://{parsed.netloc}{path}"

            # Azure DevOps patterns
            elif 'dev.azure.com' in parsed.netloc or 'visualstudio.com' in parsed.netloc:
                if not repo_url.endswith('.git'):
                    return repo_url + '.git'
                return repo_url

            # Generic HTTPS
            else:
                if not repo_url.endswith('.git'):
                    return repo_url + '.git'
                return repo_url

        elif repo_url.startswith('git@'):
            return repo_url
        elif repo_url.startswith('git://'):
            return repo_url
        elif '/' in repo_url and not repo_url.startswith('http'):
            return f"https://github.com/{repo_url}.git"

        return repo_url

    @staticmethod
    def validate_url(repo_url: str) -> Tuple[bool, str]:
        """Validate if URL is a valid Git repository URL"""
        if not repo_url or not repo_url.strip():
            return False, "Repository URL is empty"

        repo_url = repo_url.strip()

        valid_patterns = [r'^https?://', r'^git@', r'^git://', r'^[\w-]+/[\w-]+$']

        if not any(re.match(pattern, repo_url) for pattern in valid_patterns):
            return False, "Invalid repository URL format"

        if ' ' in repo_url:
            return False, "Repository URL contains spaces"

        return True, "Valid URL"

class Database:
    """PostgreSQL database manager for scan results with job queue"""

    def get_cached_scan(self, db: Session, repo_url: str, repo_hash: str, branch_name: str) -> Optional[Dict]:
        """Check if completed scan exists for this repo hash and branch"""
        repo = db.query(Repository).filter(
            Repository.repo_url == repo_url,
            Repository.repo_hash == repo_hash,
            Repository.branch_name == branch_name,
            Repository.scan_status == 'completed'
        ).order_by(Repository.last_scanned.desc()).first()

        if repo:
            return {
                'id': repo.id,
                'repo_url': repo.repo_url,
                'branch_name': repo.branch_name,
                'platform': repo.platform,
                'last_scanned': repo.last_scanned,
                'scan_status': 'cached',
                'total_files': repo.total_files,
                'total_algorithms': repo.total_algorithms,
                'quantum_safe_count': repo.quantum_safe_count,
                'quantum_vulnerable_count': repo.quantum_vulnerable_count,
                'current_status': 'Using cached results',
                'total_files_to_scan': repo.total_files_to_scan,
                'cached': True
            }
        return None

    def create_scan_record(self, db: Session, repo_url: str, repo_hash: str, branch_name: str, platform: str) -> int:
        """Create initial scan record with 'pending' status"""
        repo = db.query(Repository).filter(
            Repository.repo_url == repo_url,
            Repository.branch_name == branch_name
        ).first()

        if repo:
            repo.repo_hash = repo_hash
            repo.platform = platform
            repo.scan_status = 'pending'
            repo.current_status = 'Queued for scanning'
            repo.created_at = datetime.utcnow()
        else:
            repo = Repository(
                repo_url=repo_url,
                repo_hash=repo_hash,
                branch_name=branch_name,
                platform=platform,
                scan_status='pending',
                current_status='Queued for scanning'
            )
            db.add(repo)
        db.commit()
        db.refresh(repo)
        return repo.id

    def get_pending_scans(self, db: Session) -> List[Dict]:
        """Get all pending scans ordered by creation time"""
        scans = db.query(Repository).filter(Repository.scan_status == 'pending').order_by(Repository.created_at.asc()).all()
        return [
            {
                'id': scan.id,
                'repo_url': scan.repo_url,
                'repo_hash': scan.repo_hash,
                'branch_name': scan.branch_name,
                'platform': scan.platform,
                'created_at': scan.created_at
            } for scan in scans
        ]

    def mark_scan_processing(self, db: Session, repo_id: int):
        """Mark scan as currently processing"""
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if repo:
            repo.scan_status = 'in_progress'
            repo.current_status = 'Cloning repository...'
            repo.last_scanned = datetime.utcnow()
            db.commit()

    def update_scan_progress(self, db: Session, repo_id: int, current_scanned: int, total_files_to_scan: int, status_message: str):
        """Update the scan's live progress status"""
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if repo:
            repo.current_status = status_message
            repo.total_files = current_scanned
            repo.total_files_to_scan = total_files_to_scan
            db.commit()

    def save_scan_results(self, db: Session, repo_id: int, scan_data: Dict):
        """Update scan record with complete results"""
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            return

        repo.scan_status = 'completed'
        repo.total_files = scan_data['total_files']
        repo.total_algorithms = scan_data['total_algorithms']
        # ✅ CORRECTED: Use new field names
        repo.quantum_safe_count = scan_data.get('quantum_safe_count', 0)  # Actually quantum-safe
        repo.quantum_vulnerable_count = scan_data.get('quantum_vulnerable_count', 0)  # Actually vulnerable
        repo.last_scanned = datetime.utcnow()
        repo.overall_security_score = scan_data.get('overall_score')
        repo.overall_grade = scan_data.get('overall_grade')
        repo.migration_plan = scan_data.get('migration_plan')
        repo.quantum_readiness_detail = scan_data.get('quantum_readiness_detail')
        repo.critical_vulnerabilities = scan_data.get('critical_vulnerabilities')
        repo.current_status = 'Scan completed successfully'

        # Delete old scan results
        db.query(CategoryScore).filter(CategoryScore.repo_id == repo_id).delete()
        db.query(ScanResult).filter(ScanResult.repo_id == repo_id).delete()

        for algo, data in scan_data['algorithms'].items():
            scan_result = ScanResult(
                repo_id=repo_id,
                algorithm=algo,
                algorithm_type=data.get('algorithm_type'),
                category=data['category'],
                is_pqc=data.get('is_pqc', False),
                occurrences=data['occurrences'],          # real (non-commented) count
                commented_occurrences=data.get('commented_occurrences', 0),
                files_affected=len(data['files']),
                # Scoring data
                base_score=data.get('base_score'),
                final_score=data.get('final_score'),
                grade=data.get('grade'),
                security_level=data.get('security_level'),
                quantum_safe=data.get('quantum_safe', False),
                quantum_safety_reason=data.get('quantum_safety_reason'),
                quantum_resistance_type=data.get('quantum_resistance_type'),
                deprecated=data.get('deprecated', False),
                weighted_score=data.get('weighted_score'),
            )
            db.add(scan_result)
            db.flush()  # To get scan_result.id

            for finding in data['findings'][:100]:
                new_finding = Finding(
                    scan_result_id=scan_result.id,
                    file_path=finding['file'],
                    line_number=finding['line'],
                    context=finding['context'][:200],
                    match_text=finding['match']
                )
                db.add(new_finding)
        
        # NEW: Save category scores
        category_scores = scan_data.get('category_scores', {})
        for cat_type, cat_data in category_scores.items():
            category_score = CategoryScore(
                repo_id=repo_id,
                category_type=cat_type,
                score=cat_data['score'],
                grade=cat_data['grade'],
                algorithm_count=cat_data['algorithm_count'],
                best_algorithm=cat_data.get('best_algorithm'),
                worst_algorithm=cat_data.get('worst_algorithm')
            )
            db.add(category_score)
        db.commit()

    def mark_scan_failed(self, db: Session, repo_id: int, error_message: str = None):
        """Mark a scan as failed"""
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if repo:
            repo.scan_status = 'failed'
            repo.current_status = f"Failed: {error_message}" if error_message else "Scan failed unexpectedly"
            db.commit()

    def get_scan_details(self, db: Session, repo_id: int) -> Dict:
        """Retrieve complete scan details"""
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            raise ValueError(f"Scan ID {repo_id} not found.")

        algorithms = {}
        for sr in repo.scan_results:
            algorithms[sr.algorithm] = {
                'category': sr.category,
                'algorithm_type': sr.algorithm_type,
                'is_pqc': sr.is_pqc,
                'occurrences': sr.occurrences,                  # real (non-commented)
                'commented_occurrences': sr.commented_occurrences or 0,
                'files_affected': sr.files_affected,
                'base_score': sr.base_score,
                'final_score': sr.final_score,
                'grade': sr.grade,
                'deprecated': sr.deprecated,
                'security_level': sr.security_level,
                'quantum_safe': sr.quantum_safe,
                'quantum_safety_reason': sr.quantum_safety_reason,
                'quantum_resistance_type': sr.quantum_resistance_type,
                'weighted_score': sr.weighted_score,
            }

        # ... category scores code (keep as is) ...
        # NEW: Get category scores
        category_scores = {}
        for cs in repo.category_scores:
            category_scores[cs.category_type] = {
                'score': cs.score,
                'grade': cs.grade,
                'algorithm_count': cs.algorithm_count,
                'best_algorithm': cs.best_algorithm,
                'worst_algorithm': cs.worst_algorithm
            }

        # ✅ CORRECTED: Quantum Readiness Calculation
        # Based on OCCURRENCES of quantum-safe algorithms
        total_crypto_occurrences = sum(sr.occurrences for sr in repo.scan_results)
        quantum_safe_occurrences = sum(
            sr.occurrences for sr in repo.scan_results
            if sr.quantum_safe == True  # Already correctly calculated
        )
        quantum_readiness_percentage = (
            (quantum_safe_occurrences / total_crypto_occurrences * 100)
            if total_crypto_occurrences > 0 else 0
        )

        # ✅ CORRECTED: Count by ACTUAL quantum safety
        quantum_safe_count = sum(1 for sr in repo.scan_results if sr.quantum_safe == True)
        quantum_vulnerable_count = sum(1 for sr in repo.scan_results if sr.quantum_safe == False)
        true_pqc_count = sum(1 for sr in repo.scan_results if sr.is_pqc == True)


        return {
            'repo_id': repo.id,
            'repo_url': repo.repo_url,
            'repo_hash': repo.repo_hash,
            'branch_name': repo.branch_name,
            'platform': repo.platform,
            'last_scanned': repo.last_scanned,
            'scan_status': repo.scan_status,
            'total_files': repo.total_files,
            'total_algorithms': len(repo.scan_results),
            # ✅ CORRECTED: Use new field names
            'quantum_safe_count': quantum_safe_count,  # Actually quantum-safe
            'quantum_vulnerable_count': quantum_vulnerable_count,  # Actually vulnerable
            'true_pqc_count': true_pqc_count,
            'current_status': repo.current_status,
            'overall_security_score': repo.overall_security_score,
            'overall_grade': repo.overall_grade,
            # ✓✓✓ THIS IS THE KEY FIX
            'quantum_readiness_percentage': round(quantum_readiness_percentage, 2),
            'total_files_to_scan': repo.total_files_to_scan,
            'algorithms': algorithms,
            'category_scores': category_scores,
            'migration_plan': repo.migration_plan,
            'quantum_readiness_detail': repo.quantum_readiness_detail,
            'critical_vulnerabilities': repo.critical_vulnerabilities,
        }

    def get_all_scans(self, db: Session, limit: int = 100, offset: int = 0) -> List[Dict]:
        """Get list of scans with pagination to avoid large payloads"""
        limit = max(1, min(limit, 500))  # safety bounds
        offset = max(0, offset)
        scans = (
            db.query(Repository)
            .order_by(Repository.last_scanned.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        result = []
        for scan in scans:
            # Calculate quantum readiness percentage for each scan
            total_crypto_occurrences = sum(sr.occurrences for sr in scan.scan_results)
            quantum_safe_occurrences = sum(
                sr.occurrences for sr in scan.scan_results
                if sr.quantum_safe == True
            )
            quantum_readiness_percentage = (
                (quantum_safe_occurrences / total_crypto_occurrences * 100)
                if total_crypto_occurrences > 0 else 0
            )
            
            result.append({
                'id': scan.id,
                'repo_url': scan.repo_url,
                'repo_hash': scan.repo_hash,
                'branch_name': scan.branch_name,
                'platform': scan.platform,
                'last_scanned': scan.last_scanned,
                'scan_status': scan.scan_status,
                'total_files': scan.total_files,
                'quantum_safe_count': scan.quantum_safe_count,
                'quantum_vulnerable_count': scan.quantum_vulnerable_count,
                'current_status': scan.current_status,
                'total_files_to_scan': scan.total_files_to_scan,
                'overall_security_score': scan.overall_security_score,
                'overall_grade': scan.overall_grade,
                'quantum_readiness_percentage': round(quantum_readiness_percentage, 2)
            })
        return result

    def delete_all_scans(self, db: Session) -> Dict[str, int]:
        """Delete all scans and associated data"""
        deleted_findings = db.query(Finding).delete()
        deleted_results = db.query(ScanResult).delete()
        deleted_category_scores = db.query(CategoryScore).delete()
        deleted_repos = db.query(Repository).delete()
        db.commit()
        return {
            "findings": deleted_findings,
            "scan_results": deleted_results,
            "category_scores": deleted_category_scores,
            "repositories": deleted_repos,
        }


class CryptoScanner:
    """Enhanced crypto scanner with hash calculation and file listing"""
    
    def __init__(self, repo_path: str):
        self.repo_path = Path(repo_path)
        self.findings: Dict[str, List[Dict]] = defaultdict(list)
        self.compiled_patterns = self._compile_patterns()
        self.file_count = 0
    
    def _compile_patterns(self) -> Dict[str, List[Tuple[re.Pattern, str]]]:
        """Compile all regex patterns for efficiency"""
        compiled = {}
        for algo, info in CRYPTO_PATTERNS.items():
            compiled[algo] = [
                (re.compile(pattern, re.IGNORECASE), pattern) 
                for pattern in info['patterns']
            ]
        return compiled
    
    def get_repo_hash(self) -> str:
        """Get repository commit hash"""
        try:
            result = subprocess.run(
                ['git', '-C', str(self.repo_path), 'rev-parse', 'HEAD'],
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError:
            return self._hash_directory()
    
    def _hash_directory(self) -> str:
        """Calculate hash of directory contents"""
        hasher = hashlib.sha256()
        
        for file_path in sorted(self.repo_path.rglob('*')):
            if file_path.is_file() and '.git' not in file_path.parts:
                hasher.update(str(file_path.relative_to(self.repo_path)).encode())
                try:
                    with open(file_path, 'rb') as f:
                        hasher.update(f.read())
                except Exception:
                    pass
        
        return hasher.hexdigest()
    
    def get_all_code_files(self) -> List[Path]:
        """Collects all code files to scan"""
        code_files = []
        for file_path in self.repo_path.rglob('*'):
            if file_path.is_file() and '.git' not in file_path.parts:
                if file_path.suffix in CODE_EXTENSIONS or file_path.suffix == '':
                    code_files.append(file_path)
        return code_files

    def scan_file(self, file_path: Path) -> Dict[str, List[Dict]]:
        """Scan a single file for cryptographic algorithms – comment-aware."""
        results = defaultdict(list)
        ext = file_path.suffix.lower()
        lang = _LANG.get(ext, {})

        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            lines = content.split('\n')

            # ── Documentation files: only scan inside ``` code fences ──────────
            if lang.get('doc'):
                lines = _extract_code_fences(lines)

            single_prefixes  = lang.get('single', [])
            blk_s            = lang.get('blk_s')
            blk_e            = lang.get('blk_e')
            is_python        = (ext == '.py')

            in_block_comment = False   # inside /* … */ style block comment
            in_py_docstring  = False   # inside Python """ / ''' docstring
            py_ds_delim      = ''      # which delimiter opened the docstring

            for line_num, raw_line in enumerate(lines, 1):
                line = raw_line

                # ── Python triple-quote docstring tracking ──────────────────
                if is_python:
                    stripped = line.strip()
                    if not in_py_docstring:
                        # Look for opening triple-quote anywhere on the line
                        for delim in ('"""', "'''"):
                            first = line.find(delim)
                            if first != -1:
                                # Check if it also closes on the same line
                                second = line.find(delim, first + 3)
                                if second != -1:
                                    # Inline docstring: strip from first to end of second+3
                                    line = line[:first] + line[second + 3:]
                                else:
                                    # Docstring opens but does not close on this line
                                    line = line[:first]
                                    in_py_docstring = True
                                    py_ds_delim = delim
                                break
                    else:
                        # Inside a Python docstring – skip until closing delimiter
                        close = line.find(py_ds_delim)
                        if close != -1:
                            line = line[close + 3:]   # resume scanning after close
                            in_py_docstring = False
                            py_ds_delim = ''
                        else:
                            line = ''  # Entire line inside docstring

                # ── Block-comment tracking (C-style, SQL, HTML …) ──────────
                if blk_s and blk_e:
                    if in_block_comment:
                        close = line.find(blk_e)
                        if close != -1:
                            line = line[close + len(blk_e):]   # resume after */
                            in_block_comment = False
                        else:
                            line = ''   # whole line is inside block comment
                    # (Re-check on the same line in case block closed above)
                    if not in_block_comment and blk_s in line:
                        open_idx = _find_outside_strings(line, blk_s)
                        if open_idx is not None:
                            # Check whether the block also closes on this line
                            close_idx = line.find(blk_e, open_idx + len(blk_s))
                            if close_idx != -1:
                                # Inline block: /* … */ – strip just that part
                                line = line[:open_idx] + line[close_idx + len(blk_e):]
                            else:
                                line = line[:open_idx]
                                in_block_comment = True

                # ── Strip single-line comment suffix ───────────────────────
                if single_prefixes and line:
                    line = _strip_inline_comment(line, single_prefixes)

                # ── Check if original line was a pure comment line ──────────
                original_stripped = raw_line.strip()
                pure_comment = False
                if single_prefixes:
                    pure_comment = any(original_stripped.startswith(p)
                                       for p in single_prefixes)
                if blk_s and original_stripped.startswith(blk_s):
                    pure_comment = True
                # Python docstring lines
                if is_python and original_stripped.startswith(('"""', "'''")):
                    pure_comment = True

                # ── Run patterns against the scannable portion ──────────────
                if not line.strip():
                    # Line is empty after stripping (pure comment, blank, or fully inside
                    # a block comment).  If it was a pure comment line we still want to
                    # record the matches as `is_commented=True` so that the
                    # `commented_occurrences` counter is accurate.
                    if pure_comment and original_stripped:
                        for algo, patterns in self.compiled_patterns.items():
                            matched_this_line = False
                            for pattern, _ in patterns:
                                if matched_this_line:
                                    break
                                for match in pattern.finditer(original_stripped):
                                    results[algo].append({
                                        'file':         str(file_path.relative_to(self.repo_path)),
                                        'line':         line_num,
                                        'context':      original_stripped,
                                        'match':        match.group(),
                                        'key_size':     extract_key_size(algo, match.group()),
                                        'is_commented': True,
                                    })
                                    matched_this_line = True
                                    break
                    continue  # nothing left to scan for active-code matches

                for algo, patterns in self.compiled_patterns.items():
                    matched_this_line = False
                    for pattern, _ in patterns:
                        if matched_this_line:
                            break  # One match per algorithm per line — no duplicates
                        for match in pattern.finditer(line):
                            results[algo].append({
                                'file':         str(file_path.relative_to(self.repo_path)),
                                'line':         line_num,
                                'context':      raw_line.strip(),   # show full original line
                                'match':        match.group(),
                                'key_size':     extract_key_size(algo, match.group()),
                                'is_commented': pure_comment,       # False for mixed lines
                            })
                            matched_this_line = True
                            break  # Only one match per pattern per line

        except Exception:
            pass

        return results
    
    def get_results(self) -> Dict:
        """Get structured scan results"""
        algorithms_data = {}
        
        for algo in self.findings.keys():
            info = CRYPTO_PATTERNS.get(algo, {})
            occurrences = self.findings[algo]

            # ── Split commented vs. real (active-code) occurrences ──────────
            real_occurrences      = [o for o in occurrences if not o.get('is_commented', False)]
            commented_occurrences = [o for o in occurrences if     o.get('is_commented', False)]

            # Only consider files that contain *real* (non-commented) usages
            unique_files_real = set(occ['file'] for occ in real_occurrences)
            unique_files_all  = set(occ['file'] for occ in occurrences)

            # Skip algorithms that appear ONLY in comments – they are not active usages
            if not real_occurrences:
                logger.debug(f"Skipping '{algo}' – found only in comments ({len(commented_occurrences)} commented occurrence(s))")
                continue

            is_true_pqc = info.get('is_pqc', False)

            # Key-size: derive from real occurrences first, fall back to all
            key_sizes = [o.get('key_size') for o in real_occurrences if o.get('key_size')]
            if not key_sizes:
                key_sizes = [o.get('key_size') for o in occurrences if o.get('key_size')]
            most_common_key_size = (
                max(set(key_sizes), key=key_sizes.count) if key_sizes else None
            )
            
            algo_data = {
                'name': algo,
                'category': info.get('category', 'Unknown'),
                'is_pqc': is_true_pqc,
                # Primary occurrence count = only lines of REAL, active code
                'occurrences': len(real_occurrences),
                # Still expose the full picture for reporting
                'commented_occurrences': len(commented_occurrences),
                'total_occurrences': len(occurrences),
                'files': list(unique_files_real),
                'all_files': list(unique_files_all),
                'findings': real_occurrences,           # only real usages in findings
                'commented_findings': commented_occurrences,
                'key_size': most_common_key_size,
                'quantum_resistance_type': info.get('quantum_resistance_type'),
            }
            
            algorithms_data[algo] = algo_data
            
        return {
            'total_files': self.file_count,
            'total_algorithms': len(algorithms_data),
            'quantum_safe_count': 0,
            'quantum_vulnerable_count': 0,
            'algorithms': algorithms_data
        }


async def process_scan_job(repo_id: int, repo_url: str, branch_name: str):
    """Process a single scan job"""
    temp_dir = None
    
    with get_db() as db:
        try:
            # Mark as processing
            db_manager.mark_scan_processing(db, repo_id)
            
            # Clone repository
            temp_dir = tempfile.mkdtemp()
            subprocess.run(
                ['git', 'clone', '--depth', '1', '--branch', branch_name, repo_url, temp_dir],
                check=True,
                capture_output=True,
                timeout=300 # 5 minute timeout for cloning
            )
            
            # Initialize scanner
            scanner = CryptoScanner(temp_dir)
            
            # Get all files
            all_files_to_scan = scanner.get_all_code_files()
            total_files = len(all_files_to_scan)
            db_manager.update_scan_progress(db, repo_id, 0, total_files, f'Preparing to scan branch {branch_name}...')

            # Perform scan
            scanned_count = 0
            for file_path in all_files_to_scan:
                file_results = scanner.scan_file(file_path)
                for algo, occurrences in file_results.items():
                    scanner.findings[algo].extend(occurrences)
                
                scanned_count += 1
                if scanned_count % 10 == 0 or scanned_count == total_files:
                    db_manager.update_scan_progress(
                        db,
                        repo_id, 
                        scanned_count, 
                        total_files, 
                        f'Scanning files... ({scanned_count}/{total_files})'
                    )
                scanner.file_count = scanned_count
                
            # Get results and score them using local independent scoring engine
            results = scanner.get_results()
            
            scoring_engine = RepoScoringEngine()
            scoring_response = scoring_engine.score_algorithms(results['algorithms'])

            # Merge scored data back — local engine returns algorithm_scores as a dict
            scored_results = {}
            for algo_name, algo_score in scoring_response.get("algorithm_scores", {}).items():
                if algo_name in results['algorithms']:
                    original_data = results['algorithms'][algo_name]
                    scored_results[algo_name] = {**original_data, **algo_score}

            results['algorithms'] = scored_results
            results['overall_score'] = scoring_response.get('overall_score')
            results['overall_grade'] = scoring_response.get('overall_grade')
            results['category_scores'] = scoring_response.get('category_scores')
            results['migration_plan'] = scoring_response.get('migration_plan')
            results['quantum_readiness_detail'] = scoring_response.get('quantum_readiness_detail')
            results['critical_vulnerabilities'] = scoring_response.get('critical_vulnerabilities')
            results['total_files'] = scanned_count
            # Calculate correct counts AFTER scoring
            results['quantum_safe_count'] = scoring_response.get('quantum_safe_count', 0)
            results['quantum_vulnerable_count'] = scoring_response.get('quantum_vulnerable_count', 0)
            
            db_manager.save_scan_results(db, repo_id, results)
            
            logger.info(f"✓ Scan completed for repo ID {repo_id}: {repo_url}")
            
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode() if e.stderr else str(e)
            if 'did not match any remote' in error_msg or 'not found' in error_msg.lower():
                error_msg = f"Branch '{branch_name}' not found in repository"
            else:
                error_msg = f"Failed to clone repository: {error_msg}"
            logger.error(f"✗ Scan failed for ID {repo_id}: {error_msg}")
            db_manager.mark_scan_failed(db, repo_id, error_msg)
        except subprocess.TimeoutExpired:
            error_msg = "Repository clone timed out (exceeded 5 minutes)"
            logger.error(f"✗ Scan failed for ID {repo_id}: {error_msg}")
            db_manager.mark_scan_failed(db, repo_id, error_msg)
        except Exception as e:
            logger.error(f"✗ Scan failed for ID {repo_id}: {e}", exc_info=True)
            db_manager.mark_scan_failed(db, repo_id, str(e))
        finally:
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)


# ===========================================
# 🚀 MULTI-SCAN QUEUE WORKER IMPLEMENTATION
# ===========================================

MAX_CONCURRENT_SCANS = 3   # You can tune this safely
active_scans = set()
lock = threading.Lock()


def process_scan_wrapper(repo_id: int, repo_url: str, branch_name: str):
    """Wrapper to ensure cleanup of active_scans set even on error."""
    try:
        asyncio.run(process_scan_job(repo_id, repo_url, branch_name))
    finally:
        with lock:
            active_scans.discard(repo_id)
        logger.info(f"✅ Completed and released repo ID {repo_id}")


def job_queue_worker():
    """Multi-threaded queue worker for concurrent scans."""
    logger.info(f"🔄 Job queue worker started (max {MAX_CONCURRENT_SCANS} concurrent scans)")

    while True:
        try:
            with get_db() as db:
                pending_scans = db_manager.get_pending_scans(db)

            if not pending_scans:
                time.sleep(3)
                continue

            for scan in pending_scans:
                with lock:
                    if scan['id'] in active_scans:
                        continue
                    if len(active_scans) >= MAX_CONCURRENT_SCANS:
                        break  # Respect concurrency limit
                    active_scans.add(scan['id'])

                logger.info(f"⚙️  Starting scan: {scan['repo_url']} (Branch: {scan['branch_name']}, Platform: {scan['platform']}, ID: {scan['id']})")

                thread = threading.Thread(
                    target=process_scan_wrapper,
                    args=(scan['id'], scan['repo_url'], scan['branch_name']),
                    daemon=True
                )
                thread.start()

            time.sleep(3)

        except Exception as e:
            logger.error(f"❌ Error in job queue worker: {e}", exc_info=True)
            time.sleep(5)


# --- FastAPI Conversion ---

# Pydantic Models for Request/Response Validation
class ScanRequest(BaseModel):
    repo_url: str
    branch_name: Optional[str] = 'main'

class BranchListResponse(BaseModel):
    branches: List[str]
    default_branch: str
    total_count: int
    platform: str
    message: Optional[str] = None

class ScanQueueResponse(BaseModel):
    repo_id: int
    repo_url: str
    repo_hash: str
    branch_name: str
    platform: str
    scan_status: str
    current_status: str
    message: str
    created_at: datetime

class ScanResultItem(BaseModel):
    category: str
    algorithm_type: Optional[str] = None
    is_pqc: bool  # True ONLY for actual PQC algorithms (Kyber, Dilithium, etc.)
    occurrences: int              # real (non-commented) occurrences only
    commented_occurrences: Optional[int] = 0   # occurrences found inside comments
    files_affected: int
    base_score: Optional[float] = None
    final_score: Optional[float] = None
    grade: Optional[str] = None
    deprecated: Optional[bool] = False
    security_level: Optional[str] = None
    quantum_safe: Optional[bool] = None  # ✅ PRIMARY field: Actually quantum-safe?
    quantum_safety_reason: Optional[str] = None  # ✅ NEW: Explanation
    quantum_resistance_type: Optional[str] = None  # ✅ NEW: Classification
    weighted_score: Optional[float] = None

class CategoryScoreItem(BaseModel):
    score: float
    grade: str
    algorithm_count: int
    best_algorithm: Optional[str] = None
    worst_algorithm: Optional[str] = None

class FindingDetail(BaseModel):
    line_number: int
    code_snippet: Optional[str] = None
    match_text: Optional[str] = None

class FileFinding(BaseModel):
    file_path: str
    occurrence_count: int
    directory: str
    findings: List[FindingDetail]
    has_more: bool
    showing: int

class AlgorithmFindingsResponse(BaseModel):
    algorithm: str
    total_occurrences: int
    total_files: int
    total_files_all: int
    files: List[FileFinding]
    directory_summary: Dict[str, int]
    has_more: bool
    current_page: int

class ScanDetailsResponse(BaseModel):
    repo_id: int
    repo_url: str
    repo_hash: str
    branch_name: str
    platform: str
    last_scanned: datetime
    scan_status: str
    total_files: int
    total_algorithms: int
    quantum_safe_count: int  # ✅ RENAMED: Actually quantum-safe
    quantum_vulnerable_count: int  # ✅ RENAMED: Actually vulnerable
    true_pqc_count: int  # Count of actual PQC algorithms
    current_status: str
    total_files_to_scan: int # ✓ THIS IS THE CORRECT PERCENTAGE
    overall_security_score: Optional[float] = None
    overall_grade: Optional[str] = None
    quantum_readiness_percentage: Optional[float] = None
    algorithms: Dict[str, ScanResultItem]
    category_scores: Optional[Dict[str, CategoryScoreItem]] = None
    migration_plan: Optional[Dict[str, Any]] = None
    quantum_readiness_detail: Optional[Dict[str, Any]] = None
    critical_vulnerabilities: Optional[List[str]] = None
    cached: Optional[bool] = None
    message: Optional[str] = None

class AllScansResponse(BaseModel):
    id: int
    repo_url: str
    repo_hash: str
    branch_name: str
    platform: str
    last_scanned: datetime
    scan_status: str
    total_files: int
    quantum_safe_count: int  # ✅ RENAMED
    quantum_vulnerable_count: int  # ✅ RENAMED
    current_status: str
    total_files_to_scan: int
    overall_security_score: Optional[float] = None
    overall_grade: Optional[str] = None
    quantum_readiness_percentage: Optional[float] = None

class QueueStatusResponse(BaseModel):
    pending_count: int
    in_progress_count: int
    completed_count: int
    failed_count: int
    pending_jobs: List[Dict[str, Any]]


# FastAPI App Initialization
app = FastAPI(
    title="Crypto Scanner API",
    description="An API to scan GitHub repositories for cryptographic algorithms.",
    version="1.0.0"
)

# CORS middleware must be added BEFORE routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
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

class GitHubBranchFetcher:
    """Fetch branches from GitHub/GitLab/Bitbucket APIs"""
    
    @staticmethod
    def extract_owner_repo(repo_url: str, platform: str) -> Tuple[Optional[str], Optional[str]]:
        """Extract owner and repo name from URL"""
        import re
        from urllib.parse import urlparse
        
        parsed = urlparse(repo_url)
        path = parsed.path.strip('/')
        
        if platform in ['GitHub', 'GitLab', 'Bitbucket']:
            # Remove .git suffix
            path = re.sub(r'\.git$', '', path)
            parts = path.split('/')
            if len(parts) >= 2:
                # For GitLab, owner can be nested, e.g., group/subgroup/repo
                if platform == 'GitLab':
                    return ('/'.join(parts[:-1]), parts[-1])
                return parts[0], parts[1]
        
        return None, None
    
    @staticmethod
    def fetch_github_branches(owner: str, repo: str) -> Dict:
        """Fetch branches from GitHub API"""
        url = f"https://api.github.com/repos/{owner}/{repo}/branches"
        headers = {}
        
        github_token = os.getenv("GITHUB_TOKEN")
        if github_token:
            headers["Authorization"] = f"token {github_token}"
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 404:
                return {"error": "Repository not found or is private"}
            elif response.status_code == 403:
                return {"error": "API rate limit exceeded. Please try again later."}
            response.raise_for_status()
            
            branches_data = response.json()
            branch_names = [b["name"] for b in branches_data]
            
            repo_url = f"https://api.github.com/repos/{owner}/{repo}"
            repo_response = requests.get(repo_url, headers=headers, timeout=10)
            repo_response.raise_for_status()
            default_branch = repo_response.json().get("default_branch", "main")
            
            return {
                "branches": branch_names,
                "default_branch": default_branch,
                "total_count": len(branch_names)
            }
        except requests.exceptions.RequestException as e:
            return {"error": f"Network error while fetching branches: {e}"}

    @staticmethod
    def fetch_gitlab_branches(owner: str, repo: str) -> Dict:
        """Fetch branches from GitLab API"""
        project_path = f"{owner}/{repo}"
        try:
            # URL-encode the project path
            encoded_project_path = requests.utils.quote(project_path, safe='')
            url = f"https://gitlab.com/api/v4/projects/{encoded_project_path}/repository/branches"
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            
            branches_data = response.json()
            branch_names = [b["name"] for b in branches_data]
            
            repo_url = f"https://gitlab.com/api/v4/projects/{encoded_project_path}"
            repo_response = requests.get(repo_url, timeout=10)
            repo_response.raise_for_status()
            default_branch = repo_response.json().get("default_branch", "main")
            
            return {
                "branches": branch_names,
                "default_branch": default_branch,
                "total_count": len(branch_names)
            }
        except requests.exceptions.RequestException as e:
            return {"error": f"GitLab API error: {e}"}

    @staticmethod
    def fetch_bitbucket_branches(owner: str, repo: str) -> Dict:
        """Fetch branches from Bitbucket API"""
        try:
            url = f"https://api.bitbucket.org/2.0/repositories/{owner}/{repo}/refs/branches"
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            branches_data = response.json()
            branch_names = [b["name"] for b in branches_data.get("values", [])]
            
            repo_url = f"https://api.bitbucket.org/2.0/repositories/{owner}/{repo}"
            repo_response = requests.get(repo_url, timeout=10)
            repo_response.raise_for_status()
            default_branch = repo_response.json().get("mainbranch", {}).get("name", "main")
            return {"branches": branch_names, "default_branch": default_branch, "total_count": len(branch_names)}
        except requests.exceptions.RequestException as e:
            return {"error": f"Bitbucket API error: {e}"}

db_manager = Database()
url_parser = RepoUrlParser()

# Start job queue worker in background thread
worker_thread = threading.Thread(target=job_queue_worker, daemon=True)
worker_thread.start()

@app.post('/api/validate-url', status_code=status.HTTP_200_OK)
async def validate_url_endpoint(scan_request: ScanRequest):
    """Validate and parse repository URL"""
    repo_url = scan_request.repo_url.strip()

    if not repo_url:
        raise APIError(status_code=400, error_code="repo_url_required", message='Repository URL is required')

    is_valid, message = url_parser.validate_url(repo_url)

    if not is_valid:
        raise APIError(status_code=400, error_code="invalid_repo_url", message=message)

    normalized_url = url_parser.normalize_url(repo_url)
    platform = url_parser.detect_platform(normalized_url)

    return {
        'valid': True,
        'normalized_url': normalized_url,
        'platform': platform,
        'message': f'Valid {platform} repository URL'
    }

@app.post('/api/fetch-branches', status_code=status.HTTP_200_OK)
async def fetch_branches_endpoint(scan_request: ScanRequest):
    """Fetch available branches from Git repository"""
    repo_url = scan_request.repo_url.strip()

    if not repo_url:
        raise APIError(status_code=400, error_code="repo_url_required", message='Repository URL is required')

    # Validate URL
    is_valid, validation_msg = url_parser.validate_url(repo_url)
    if not is_valid:
        raise APIError(status_code=400, error_code="invalid_repo_url", message=validation_msg)

    # Normalize URL and detect platform
    normalized_url = url_parser.normalize_url(repo_url)
    platform = url_parser.detect_platform(normalized_url)

    # Extract owner and repo
    fetcher = GitHubBranchFetcher()
    owner, repo = fetcher.extract_owner_repo(normalized_url, platform)

    if not owner or not repo:
        raise APIError(
            status_code=400, 
            error_code="repo_owner_repo_not_extracted",
            message='Could not extract repository owner and name from URL'
        )

    # Fetch branches based on platform
    if platform == 'GitHub':
        result = fetcher.fetch_github_branches(owner, repo)
    elif platform == 'GitLab':
        result = fetcher.fetch_gitlab_branches(owner, repo)
    elif platform == 'Bitbucket':
        result = fetcher.fetch_bitbucket_branches(owner, repo)
    else:
        raise APIError(
            status_code=400, 
            error_code="platform_not_supported",
            message=f'Branch fetching not supported for {platform} yet. Please enter branch name manually.'
        )

    # Check for errors
    if "error" in result:
        raise APIError(status_code=400, error_code="branch_fetch_failed", message=result["error"])

    return BranchListResponse(
        branches=result["branches"],
        default_branch=result["default_branch"],
        total_count=result["total_count"],
        platform=platform,
        message=f'Found {result["total_count"]} branches in {platform} repository'
    )

@app.post('/api/scan', status_code=status.HTTP_200_OK)
async def scan_repository_endpoint(scan_request: ScanRequest):
    """Queue a scan request (checks cache first)"""
    repo_url = scan_request.repo_url
    branch_name = scan_request.branch_name or 'main'  # Default to 'main'
    branch_name = branch_name.strip()

    if not repo_url:
        raise APIError(status_code=400, error_code="repo_url_required", message='repo_url is required')

    # Validate URL
    is_valid, validation_msg = url_parser.validate_url(repo_url)
    if not is_valid:
        raise APIError(status_code=400, error_code="invalid_repo_url", message=validation_msg)

    # Normalize URL and detect platform
    normalized_url = url_parser.normalize_url(repo_url)
    platform = url_parser.detect_platform(normalized_url)

    temp_dir = None

    with get_db() as db:
        try:
            # Quick clone to get hash for cache checking
            temp_dir = tempfile.mkdtemp()
            subprocess.run(
                ['git', 'clone', '--depth', '1', '--branch', branch_name, normalized_url, temp_dir],
                check=True,
                capture_output=True,
                timeout=60
            )

            temp_scanner = CryptoScanner(temp_dir)
            repo_hash = temp_scanner.get_repo_hash()

            # Check cache with branch
            cached = db_manager.get_cached_scan(db, normalized_url, repo_hash, branch_name)
            if cached:
                shutil.rmtree(temp_dir, ignore_errors=True)
                details = db_manager.get_scan_details(db, cached['id'])
                details['cached'] = True
                details['message'] = 'Using cached scan results'
                details['platform'] = platform
                return details

            # Not cached - create pending job
            repo_id = db_manager.create_scan_record(db, normalized_url, repo_hash, branch_name, platform)

            # Clean up temp clone
            shutil.rmtree(temp_dir, ignore_errors=True)

            repo = db.query(Repository).filter(Repository.id == repo_id).first()
            return ScanQueueResponse(
                repo_id=repo.id,
                repo_url=repo.repo_url,
                repo_hash=repo.repo_hash,
                branch_name=repo.branch_name,
                platform=repo.platform,
                scan_status=repo.scan_status,
                current_status=repo.current_status,
                message=f'Scan request queued successfully for {platform} branch "{branch_name}". Worker will process it shortly.',
                created_at=repo.created_at
            )

        except subprocess.CalledProcessError as e:
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)
            error_msg = e.stderr.decode() if e.stderr else 'Failed to clone repository'
            if 'did not match any remote' in error_msg or 'not found' in error_msg.lower():
                error_msg = f"Branch '{branch_name}' not found in {platform} repository"
            raise APIError(status_code=400, error_code="clone_failed", message=f'Failed to clone repository from {platform}. Details: {error_msg}')
        except subprocess.TimeoutExpired:
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)
            raise APIError(status_code=408, error_code="clone_timeout", message='Repository clone timed out. The repository might be too large or the connection is slow.')
        except Exception as e:
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)
            raise APIError(status_code=500, error_code="internal_server_error", message=str(e))


@app.get('/api/scans', response_model=List[AllScansResponse])
async def get_scans(limit: int = 100, offset: int = 0):
    """Get list of scans (paginated)"""
    with get_db() as db:
        scans = db_manager.get_all_scans(db, limit=limit, offset=offset)
        return scans


@app.get('/api/scans/{scan_id}', response_model=ScanDetailsResponse)
async def get_scan_details_endpoint(scan_id: int):
    """Get detailed scan results"""
    with get_db() as db:
        try:
            details = db_manager.get_scan_details(db, scan_id)
            return details
        except ValueError as e:
            raise APIError(status_code=404, error_code="scan_not_found", message=str(e))
        except Exception as e:
            raise APIError(status_code=500, error_code="internal_server_error", message=f'Internal server error: {str(e)}')


@app.get('/api/scans/{scan_id}/algorithm/{algorithm}/findings', response_model=AlgorithmFindingsResponse)
async def get_algorithm_findings(
    scan_id: int, 
    algorithm: str,
    limit_files: int = 20,
    limit_per_file: int = 10,
    offset_files: int = 0,
    sort_by: str = "file_path",  # NEW: file_path, occurrences, directory
    filter_directory: Optional[str] = None  # NEW: Filter by directory
):
    """Get detailed, grouped, and paginated findings for a specific algorithm in a scan."""
    with get_db() as db:
        try:
            scan_result = db.query(ScanResult).filter(
                ScanResult.repo_id == scan_id,
                ScanResult.algorithm == algorithm
            ).first()

            if not scan_result:
                raise APIError(status_code=404, error_code="algorithm_not_found", message='Algorithm not found in this scan')

            findings_query = db.query(Finding).filter(
                Finding.scan_result_id == scan_result.id
            ).order_by(Finding.file_path, Finding.line_number)
            
            all_findings = findings_query.all()
            
            grouped = defaultdict(list)
            for finding in all_findings:
                grouped[finding.file_path].append(finding)

            all_findings_grouped = grouped.copy()
            
            directory_summary = defaultdict(int)
            for file_path, findings_list in grouped.items():
                directory = os.path.dirname(file_path) or "root"
                directory_summary[directory] += len(findings_list)
            
            # NEW: Filter by directory if specified
            if filter_directory:
                grouped = {k: v for k, v in grouped.items() if os.path.dirname(k) == filter_directory}
            
            # NEW: Sort files
            if sort_by == "occurrences":
                sorted_files = sorted(grouped.keys(), key=lambda f: len(grouped[f]), reverse=True)
            elif sort_by == "directory":
                sorted_files = sorted(grouped.keys(), key=lambda f: (os.path.dirname(f), os.path.basename(f)))
            else:
                sorted_files = sorted(grouped.keys())

            files = []
            paginated_files = sorted_files[offset_files : offset_files + limit_files]

            for file_path in paginated_files:
                findings_list = grouped[file_path]
                paginated_findings = findings_list[:limit_per_file]
                
                files.append({
                    "file_path": file_path,
                    "occurrence_count": len(findings_list),
                    "directory": os.path.dirname(file_path) or "root",
                    "findings": [
                        {
                            "line_number": f.line_number,
                            "code_snippet": f.context,
                            "match_text": f.match_text
                        } for f in paginated_findings
                    ],
                    "has_more": len(findings_list) > limit_per_file,
                    "showing": len(paginated_findings)
                })
            
            return {
                "algorithm": algorithm,
                "total_occurrences": scan_result.occurrences,
                "total_files": len(grouped),
                "total_files_all": len(all_findings_grouped),  # NEW: Before filtering
                "files": files,
                "directory_summary": dict(directory_summary),
                "has_more": (offset_files + limit_files) < len(sorted_files),  # NEW
                "current_page": offset_files // limit_files + 1  # NEW
            }
        except Exception as e:
            logger.error(f"Failed to get algorithm findings: {e}", exc_info=True)
            raise APIError(status_code=500, error_code="internal_server_error", message=f'Internal server error: {str(e)}')


@app.get('/api/queue/status', response_model=QueueStatusResponse)
async def get_queue_status():
    """Get current queue status"""
    with get_db() as db:
        try:
            pending = db_manager.get_pending_scans(db)
            in_progress_count = db.query(Repository).filter(Repository.scan_status == 'in_progress').count()
            completed_count = db.query(Repository).filter(Repository.scan_status == 'completed').count()
            failed_count = db.query(Repository).filter(Repository.scan_status == 'failed').count()
            
            return {
                'pending_count': len(pending),
                'in_progress_count': in_progress_count,
                'completed_count': completed_count,
                'failed_count': failed_count,
                'pending_jobs': pending[:5] # Return first 5 pending jobs
            }
        except Exception as e:
            raise APIError(status_code=500, error_code="internal_server_error", message=str(e))


@app.delete('/api/scans/{scan_id}', status_code=status.HTTP_200_OK)
async def delete_scan_endpoint(scan_id: int):
    """Delete a scan and all its associated results from the database"""
    with get_db() as db:
        try:
            repo = db.query(Repository).filter(Repository.id == scan_id).first()
            if not repo:
                raise APIError(status_code=404, error_code="scan_not_found", message=f"Scan ID {scan_id} not found")
            
            repo_url = repo.repo_url
            
            # Delete all associated results
            db.query(Finding).filter(Finding.scan_result_id.in_(
                db.query(ScanResult.id).filter(ScanResult.repo_id == scan_id)
            )).delete()
            db.query(ScanResult).filter(ScanResult.repo_id == scan_id).delete()
            db.query(CategoryScore).filter(CategoryScore.repo_id == scan_id).delete()
            
            # Delete the repository record
            db.delete(repo)
            db.commit()
            
            logger.info(f"✓ Scan {scan_id} ({repo_url}) deleted successfully with all results")
            
            return {
                "message": "Scan and all associated results deleted successfully",
                "scan_id": scan_id,
                "repo_url": repo_url
            }
        except APIError:
            raise
        except Exception as e:
            db.rollback()
            logger.error(f"✗ Error deleting scan {scan_id}: {e}", exc_info=True)
            raise APIError(status_code=500, error_code="delete_failed", message=f"Failed to delete scan: {str(e)}")


@app.delete('/api/scans', status_code=status.HTTP_200_OK)
async def delete_all_scans_endpoint():
    """Delete all scans and associated data"""
    with get_db() as db:
        try:
            result = db_manager.delete_all_scans(db)
            logger.info(f"Deleted all scans: {result}")
            return {"message": "All scans deleted successfully", "deleted": result}
        except Exception as e:
            db.rollback()
            logger.error(f"✗ Error deleting all scans: {e}", exc_info=True)
            raise APIError(status_code=500, error_code="delete_failed", message=f"Failed to delete all scans: {str(e)}")


@app.get("/health")
def health():
    logger.debug("Health check called")
    return {"status": "ok"}


if __name__ == '__main__':
    uvicorn.run(
        "app:app", 
        host='0.0.0.0', 
        port=8001,
        log_level='info',
        reload=True
    )

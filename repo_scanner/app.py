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
from datetime import datetime
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple, Set, Optional, Any
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl
import uvicorn 
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey, Text, UniqueConstraint, Float
from sqlalchemy.orm import sessionmaker, relationship, Session
from sqlalchemy.ext.declarative import declarative_base
from contextlib import contextmanager

# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("repo_scanner.log"),
        logging.StreamHandler(sys.stdout)
    ]
)
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
    pqc_safe_count = Column(Integer, default=0)
    pqc_vulnerable_count = Column(Integer, default=0)
    current_status = Column(String, default='Queued for scanning')
    total_files_to_scan = Column(Integer, default=0)
    overall_security_score = Column(Float, nullable=True)
    overall_grade = Column(String, nullable=True)
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
    is_pqc_safe = Column(Boolean, nullable=False)
    occurrences = Column(Integer, nullable=False)
    files_affected = Column(Integer, nullable=False)
    base_score = Column(Float, nullable=True)
    final_score = Column(Float, nullable=True)
    grade = Column(String, nullable=True)
    security_level = Column(String, nullable=True)
    quantum_safe = Column(Boolean, default=False)
    deprecated = Column(Boolean, default=False)
    weighted_score = Column(Float, nullable=True)
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


# --- PQC Scoring Integration ---
from score import PQCAnalyzer, AlgorithmScore
from dataclasses import asdict

# Complete cryptographic patterns from original script
CRYPTO_PATTERNS = {
    # Symmetric algorithms (PQC Safe)
    'AES': {
        'patterns': [r'\bAES\b', r'\baes[-_]?(128|192|256)\b', r'AES_', r'Cipher\.AES', r'EVP_aes'],
        'pqc_safe': True,
        'category': 'Symmetric Encryption'
    },
    'ChaCha20': {
        'patterns': [r'\bChaCha20\b', r'\bchacha20\b', r'CHACHA20', r'EVP_chacha'],
        'pqc_safe': True,
        'category': 'Symmetric Encryption'
    },
    'ChaCha20-Poly1305': {
        'patterns': [r'\bChaCha20[-_]?Poly1305\b', r'chacha20[-_]poly1305', r'CHACHA20_POLY1305'],
        'pqc_safe': True,
        'category': 'Authenticated Encryption'
    },
    'Salsa20': {
        'patterns': [r'\bSalsa20\b', r'\bsalsa20\b'],
        'pqc_safe': True,
        'category': 'Symmetric Encryption'
    },
    'Twofish': {
        'patterns': [r'\bTwofish\b', r'\btwofish\b'],
        'pqc_safe': True,
        'category': 'Symmetric Encryption'
    },
    'Blowfish': {
        'patterns': [r'\bBlowfish\b', r'\bblowfish\b', r'BF_'],
        'pqc_safe': True,
        'category': 'Symmetric Encryption'
    },
    'Camellia': {
        'patterns': [r'\bCamellia\b', r'\bcamellia\b'],
        'pqc_safe': True,
        'category': 'Symmetric Encryption'
    },
    'ARIA': {
        'patterns': [r'\bARIA\b(?!-)'],
        'pqc_safe': True,
        'category': 'Symmetric Encryption'
    },
    '3DES': {
        'patterns': [r'\b3DES\b', r'\bDES3\b', r'\bTripleDES\b', r'DES_EDE', r'EVP_des_ede'],
        'pqc_safe': True,
        'category': 'Symmetric Encryption (Weak)'
    },
    'DES': {
        'patterns': [r'\bDES\b(?!3|_EDE|C)', r'DES_encrypt', r'EVP_des_'],
        'pqc_safe': True,
        'category': 'Symmetric Encryption (Broken)'
    },
    'RC4': {
        'patterns': [r'\bRC4\b', r'\brc4\b', r'ARC4', r'ARCFOUR'],
        'pqc_safe': True,
        'category': 'Stream Cipher (Broken)'
    },
    
    # Block cipher modes
    'GCM': {
        'patterns': [r'\bGCM\b', r'\bgcm\b', r'Galois.*Counter', r'AES.*GCM'],
        'pqc_safe': True,
        'category': 'Cipher Mode (AEAD)'
    },
    'CBC': {
        'patterns': [r'\bCBC\b', r'\bcbc\b', r'Cipher.*Block.*Chaining'],
        'pqc_safe': True,
        'category': 'Cipher Mode'
    },
    'CTR': {
        'patterns': [r'\bCTR\b(?!L)', r'\bctr\b', r'Counter.*Mode'],
        'pqc_safe': True,
        'category': 'Cipher Mode'
    },
    'CCM': {
        'patterns': [r'\bCCM\b', r'\bccm\b', r'Counter.*CBC.*MAC'],
        'pqc_safe': True,
        'category': 'Cipher Mode (AEAD)'
    },
    'ECB': {
        'patterns': [r'\bECB\b', r'\becb\b', r'Electronic.*Codebook'],
        'pqc_safe': True,
        'category': 'Cipher Mode (Insecure)'
    },
    
    # Hash functions (PQC Safe)
    'SHA-256': {
        'patterns': [r'\bSHA256\b', r'\bsha256\b', r'SHA-256', r'sha_256', r'EVP_sha256'],
        'pqc_safe': True,
        'category': 'Hash Function'
    },
    'SHA-384': {
        'patterns': [r'\bSHA384\b', r'\bsha384\b', r'SHA-384', r'EVP_sha384'],
        'pqc_safe': True,
        'category': 'Hash Function'
    },
    'SHA-512': {
        'patterns': [r'\bSHA512\b', r'\bsha512\b', r'SHA-512', r'EVP_sha512'],
        'pqc_safe': True,
        'category': 'Hash Function'
    },
    'SHA-224': {
        'patterns': [r'\bSHA224\b', r'\bsha224\b', r'SHA-224'],
        'pqc_safe': True,
        'category': 'Hash Function'
    },
    'SHA3-256': {
        'patterns': [r'\bSHA3[-_]256\b', r'\bsha3[-_]256\b'],
        'pqc_safe': True,
        'category': 'Hash Function'
    },
    'SHA3-384': {
        'patterns': [r'\bSHA3[-_]384\b', r'\bsha3[-_]384\b'],
        'pqc_safe': True,
        'category': 'Hash Function'
    },
    'SHA3-512': {
        'patterns': [r'\bSHA3[-_]512\b', r'\bsha3[-_]512\b'],
        'pqc_safe': True,
        'category': 'Hash Function'
    },
    'BLAKE2': {
        'patterns': [r'\bBLAKE2\b', r'\bblake2[bs]\b', r'BLAKE2b', r'BLAKE2s'],
        'pqc_safe': True,
        'category': 'Hash Function'
    },
    'BLAKE3': {
        'patterns': [r'\bBLAKE3\b', r'\bblake3\b'],
        'pqc_safe': True,
        'category': 'Hash Function'
    },
    'Keccak': {
        'patterns': [r'\bKeccak\b', r'\bkeccak\b'],
        'pqc_safe': True,
        'category': 'Hash Function'
    },
    'RIPEMD-160': {
        'patterns': [r'\bRIPEMD[-_]?160\b', r'\bripemd160\b'],
        'pqc_safe': True,
        'category': 'Hash Function'
    },
    'Whirlpool': {
        'patterns': [r'\bWhirlpool\b', r'\bwhirlpool\b'],
        'pqc_safe': True,
        'category': 'Hash Function'
    },
    'MD5': {
        'patterns': [r'\bMD5\b', r'\bmd5\b', r'EVP_md5'],
        'pqc_safe': True,
        'category': 'Hash Function (Broken)'
    },
    'MD4': {
        'patterns': [r'\bMD4\b', r'\bmd4\b'],
        'pqc_safe': True,
        'category': 'Hash Function (Broken)'
    },
    'SHA-1': {
        'patterns': [r'\bSHA1\b', r'\bsha1\b', r'SHA-1', r'EVP_sha1'],
        'pqc_safe': True,
        'category': 'Hash Function (Weak)'
    },
    
    # MAC algorithms
    'HMAC': {
        'patterns': [r'\bHMAC\b', r'\bhmac\b', r'HMAC_'],
        'pqc_safe': True,
        'category': 'Message Authentication Code'
    },
    'CMAC': {
        'patterns': [r'\bCMAC\b', r'\bcmac\b'],
        'pqc_safe': True,
        'category': 'Message Authentication Code'
    },
    'Poly1305': {
        'patterns': [r'\bPoly1305\b', r'\bpoly1305\b'],
        'pqc_safe': True,
        'category': 'Message Authentication Code'
    },
    
    # Key derivation functions
    'PBKDF2': {
        'patterns': [r'\bPBKDF2\b', r'\bpbkdf2\b'],
        'pqc_safe': True,
        'category': 'Key Derivation Function'
    },
    'scrypt': {
        'patterns': [r'\bscrypt\b', r'\bSCRYPT\b'],
        'pqc_safe': True,
        'category': 'Key Derivation Function'
    },
    'Argon2': {
        'patterns': [r'\bArgon2\b', r'\bargon2[id]?\b'],
        'pqc_safe': True,
        'category': 'Key Derivation Function'
    },
    'bcrypt': {
        'patterns': [r'\bbcrypt\b', r'\bBCRYPT\b'],
        'pqc_safe': True,
        'category': 'Password Hashing'
    },
    'HKDF': {
        'patterns': [r'\bHKDF\b', r'\bhkdf\b'],
        'pqc_safe': True,
        'category': 'Key Derivation Function'
    },
    
    # Asymmetric algorithms (NOT PQC Safe)
    'RSA': {
        'patterns': [r'\bRSA\b', r'\brsa[-_]?(1024|2048|3072|4096)\b', r'RSA_', r'PKCS1', r'EVP_PKEY_RSA'],
        'pqc_safe': False,
        'category': 'Asymmetric Encryption'
    },
    'ECDSA': {
        'patterns': [r'\bECDSA\b', r'\becdsa\b', r'EC_DSA', r'secp256[kr]1', r'prime256v1'],
        'pqc_safe': False,
        'category': 'Digital Signature'
    },
    'ECDH': {
        'patterns': [r'\bECDH\b', r'\becdh\b', r'EC_DH', r'ECDHE'],
        'pqc_safe': False,
        'category': 'Key Exchange'
    },
    'DSA': {
        'patterns': [r'\bDSA\b(?!A)', r'DSA_', r'Digital Signature Algorithm'],
        'pqc_safe': False,
        'category': 'Digital Signature'
    },
    'DH': {
        'patterns': [r'\bDiffie[-_]?Hellman\b', r'\bDH\b', r'DHE', r'EVP_PKEY_DH'],
        'pqc_safe': False,
        'category': 'Key Exchange'
    },
    'ElGamal': {
        'patterns': [r'\bElGamal\b', r'\belgamal\b'],
        'pqc_safe': False,
        'category': 'Asymmetric Encryption'
    },
    'Ed25519': {
        'patterns': [r'\bEd25519\b', r'\bed25519\b', r'EdDSA'],
        'pqc_safe': False,
        'category': 'Digital Signature'
    },
    'Ed448': {
        'patterns': [r'\bEd448\b', r'\bed448\b'],
        'pqc_safe': False,
        'category': 'Digital Signature'
    },
    'Curve25519': {
        'patterns': [r'\bCurve25519\b', r'\bcurve25519\b', r'X25519'],
        'pqc_safe': False,
        'category': 'Key Exchange'
    },
    'Curve448': {
        'patterns': [r'\bCurve448\b', r'\bcurve448\b', r'X448'],
        'pqc_safe': False,
        'category': 'Key Exchange'
    },
    'P-256': {
        'patterns': [r'\bP-256\b', r'\bsecp256r1\b', r'prime256v1'],
        'pqc_safe': False,
        'category': 'Elliptic Curve'
    },
    'P-384': {
        'patterns': [r'\bP-384\b', r'\bsecp384r1\b'],
        'pqc_safe': False,
        'category': 'Elliptic Curve'
    },
    'P-521': {
        'patterns': [r'\bP-521\b', r'\bsecp521r1\b'],
        'pqc_safe': False,
        'category': 'Elliptic Curve'
    },
    'secp256k1': {
        'patterns': [r'\bsecp256k1\b'],
        'pqc_safe': False,
        'category': 'Elliptic Curve (Bitcoin)'
    },
    
    # PQC algorithms (PQC Safe)
    'Kyber': {
        'patterns': [r'\bKyber\b', r'\bkyber\b', r'ML-KEM', r'CRYSTALS-Kyber'],
        'pqc_safe': True,
        'category': 'PQC Key Encapsulation'
    },
    'Dilithium': {
        'patterns': [r'\bDilithium\b', r'\bdilithium\b', r'ML-DSA', r'CRYSTALS-Dilithium'],
        'pqc_safe': True,
        'category': 'PQC Digital Signature'
    },
    'SPHINCS+': {
        'patterns': [r'\bSPHINCS\+?\b', r'\bsphincs\b', r'SLH-DSA'],
        'pqc_safe': True,
        'category': 'PQC Digital Signature'
    },
    'NTRU': {
        'patterns': [r'\bNTRU\b', r'\bntru\b', r'NTRUEncrypt'],
        'pqc_safe': True,
        'category': 'PQC Encryption'
    },
    'Falcon': {
        'patterns': [r'\bFalcon\b(?!.*[Bb]ird)', r'\bfalcon\b(?!.*bird)'],
        'pqc_safe': True,
        'category': 'PQC Digital Signature'
    },
    'SABER': {
        'patterns': [r'\bSABER\b', r'\bSaber\b(?!tooth)'],
        'pqc_safe': True,
        'category': 'PQC Key Encapsulation'
    },
    'FrodoKEM': {
        'patterns': [r'\bFrodoKEM\b', r'\bFrodo\b'],
        'pqc_safe': True,
        'category': 'PQC Key Encapsulation'
    },
    'BIKE': {
        'patterns': [r'\bBIKE\b(?!-)'],
        'pqc_safe': True,
        'category': 'PQC Key Encapsulation'
    },
    'HQC': {
        'patterns': [r'\bHQC\b'],
        'pqc_safe': True,
        'category': 'PQC Key Encapsulation'
    },
    'Rainbow': {
        'patterns': [r'\bRainbow\b(?!.*color)'],
        'pqc_safe': True,
        'category': 'PQC Digital Signature (Broken)'
    },
    'XMSS': {
        'patterns': [r'\bXMSS\b', r'\bxmss\b'],
        'pqc_safe': True,
        'category': 'PQC Digital Signature'
    },
    'LMS': {
        'patterns': [r'\bLMS\b(?!-)'],
        'pqc_safe': True,
        'category': 'PQC Digital Signature'
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
                'pqc_safe_count': repo.pqc_safe_count,
                'pqc_vulnerable_count': repo.pqc_vulnerable_count,
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
        repo.pqc_safe_count = scan_data['pqc_safe_count']
        repo.pqc_vulnerable_count = scan_data['pqc_vulnerable_count']
        repo.last_scanned = datetime.utcnow()
        repo.overall_security_score = scan_data.get('overall_score')
        repo.overall_grade = scan_data.get('overall_grade')
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
                is_pqc_safe=data['pqc_safe'],
                occurrences=data['occurrences'],
                files_affected=len(data['files']),
                # Add scoring data
                base_score=data.get('base_score'),
                final_score=data.get('final_score'),
                grade=data.get('grade'),
                security_level=data.get('security_level'),
                quantum_safe=data.get('quantum_safe'),
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
                'pqc_safe': sr.is_pqc_safe,
                'occurrences': sr.occurrences,
                'files_affected': sr.files_affected,
                'base_score': sr.base_score,
                'final_score': sr.final_score,
                'grade': sr.grade,
                'deprecated': sr.deprecated,
                'security_level': sr.security_level,
                'quantum_safe': sr.quantum_safe,
                'weighted_score': sr.weighted_score,
            }

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

        # Calculate quantum readiness percentage
        quantum_safe_algos = sum(1 for sr in repo.scan_results if sr.quantum_safe)
        total_algos = len(repo.scan_results)
        quantum_readiness_percentage = (quantum_safe_algos / total_algos * 100) if total_algos > 0 else 0

        return {
            'repo_id': repo.id,
            'repo_url': repo.repo_url,
            'repo_hash': repo.repo_hash,
            'branch_name': repo.branch_name,
            'platform': repo.platform,
            'last_scanned': repo.last_scanned,
            'scan_status': repo.scan_status,
            'total_files': repo.total_files,
            'total_algorithms': repo.total_algorithms,
            'pqc_safe_count': repo.pqc_safe_count,
            'pqc_vulnerable_count': repo.pqc_vulnerable_count,
            'current_status': repo.current_status,
            'overall_security_score': repo.overall_security_score,
            'overall_grade': repo.overall_grade,
            'quantum_readiness_percentage': round(quantum_readiness_percentage, 2),
            'total_files_to_scan': repo.total_files_to_scan,
            'algorithms': algorithms,
            'category_scores': category_scores
        }

    def get_all_scans(self, db: Session) -> List[Dict]:
        """Get list of all scans"""
        scans = db.query(Repository).order_by(Repository.last_scanned.desc()).all()
        return [
            {
                'id': scan.id,
                'repo_url': scan.repo_url,
                'repo_hash': scan.repo_hash,
                'branch_name': scan.branch_name,
                'platform': scan.platform,
                'last_scanned': scan.last_scanned,
                'scan_status': scan.scan_status,
                'total_files': scan.total_files,
                'pqc_safe_count': scan.pqc_safe_count,
                'pqc_vulnerable_count': scan.pqc_vulnerable_count,
                'current_status': scan.current_status,
                'total_files_to_scan': scan.total_files_to_scan
            } for scan in scans
        ]


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
        """Scan a single file for cryptographic algorithms"""
        results = defaultdict(list)
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                lines = content.split('\n')
                
                for algo, patterns in self.compiled_patterns.items():
                    for pattern, pattern_str in patterns:
                        for line_num, line in enumerate(lines, 1):
                            matches = pattern.finditer(line)
                            for match in matches:
                                results[algo].append({
                                    'file': str(file_path.relative_to(self.repo_path)),
                                    'line': line_num,
                                    'context': line.strip(),
                                    'match': match.group()
                                })
        except Exception:
            pass
        
        return results
    
    def get_results(self) -> Dict:
        """Get structured scan results"""
        pqc_safe = []
        pqc_unsafe = []
        algorithms_data = {}
        
        for algo in self.findings.keys():
            info = CRYPTO_PATTERNS[algo]
            occurrences = self.findings[algo]
            unique_files = set(occ['file'] for occ in occurrences)
            
            algo_data = {
                'name': algo,
                'category': info['category'],
                'pqc_safe': info['pqc_safe'],
                'occurrences': len(occurrences),
                'files': list(unique_files),
                'findings': occurrences
            }
            
            algorithms_data[algo] = algo_data
            
            if info['pqc_safe']:
                pqc_safe.append(algo)
            else:
                pqc_unsafe.append(algo)
        
        return {
            'total_files': self.file_count,
            'total_algorithms': len(self.findings),
            'pqc_safe_count': len(pqc_safe),
            'pqc_vulnerable_count': len(pqc_unsafe),
            'algorithms': algorithms_data
        }


def process_scan_job(repo_id: int, repo_url: str, branch_name: str):
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
                # Update progress every 10 files to reduce DB writes
                if scanned_count % 10 == 0 or scanned_count == total_files:
                    db_manager.update_scan_progress(
                        db,
                        repo_id, 
                        scanned_count, 
                        total_files, 
                        f'Scanning files... ({scanned_count}/{total_files})'
                    )
                scanner.file_count = scanned_count
                
            # Save results
            results = scanner.get_results()
            pqc_analyzer = PQCAnalyzer()

            # Score each algorithm
            scored_results = {}
            for algo_name, algo_data in results['algorithms'].items():
                score = pqc_analyzer.score_repository_algorithm(
                    algorithm=algo_name,
                    category=algo_data['category']
                )
                scored_results[algo_name] = {
                    **algo_data,
                    **asdict(score)
                }
            
            # Replace original algorithms with scored ones and calculate overall score
            # Get comprehensive scoring (overall + categories)
            results['algorithms'] = scored_results
            scoring_results = calculate_repo_overall_score(scored_results)

            results['overall_score'] = scoring_results['overall_score']
            results['overall_grade'] = scoring_results['overall_grade']
            results['category_scores'] = scoring_results['category_scores']
            results['total_files'] = scanned_count
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
            # Enhanced cleanup with retry logic
            if temp_dir:
                MAX_RETRIES = 5
                DELAY_SECONDS = 0.5
                for attempt in range(MAX_RETRIES):
                    try:
                        shutil.rmtree(temp_dir)
                        break
                    except PermissionError:
                        if attempt < MAX_RETRIES - 1:
                            time.sleep(DELAY_SECONDS)
                            DELAY_SECONDS *= 2
                        else:
                            logger.warning(f"⚠ Failed to clean up temp dir {temp_dir} after {MAX_RETRIES} attempts")
                    except Exception as e:
                        logger.warning(f"⚠ Failed to clean up temp dir {temp_dir}: {e}")
                        break


# ===========================================
# 🚀 MULTI-SCAN QUEUE WORKER IMPLEMENTATION
# ===========================================

MAX_CONCURRENT_SCANS = 3   # You can tune this safely
active_scans = set()
lock = threading.Lock()


def process_scan_wrapper(repo_id: int, repo_url: str, branch_name: str):
    """Wrapper to ensure cleanup of active_scans set even on error."""
    try:
        process_scan_job(repo_id, repo_url, branch_name)
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
    pqc_safe: bool
    occurrences: int
    files_affected: int
    base_score: Optional[float] = None
    final_score: Optional[float] = None
    grade: Optional[str] = None
    deprecated: Optional[bool] = False
    security_level: Optional[str] = None
    quantum_safe: Optional[bool] = None
    weighted_score: Optional[float] = None

class CategoryScoreItem(BaseModel):
    score: float
    grade: str
    algorithm_count: int
    best_algorithm: Optional[str] = None
    worst_algorithm: Optional[str] = None

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
    pqc_safe_count: int
    pqc_vulnerable_count: int
    current_status: str
    total_files_to_scan: int
    overall_security_score: Optional[float] = None
    overall_grade: Optional[str] = None
    quantum_readiness_percentage: Optional[float] = None
    algorithms: Dict[str, ScanResultItem]
    category_scores: Optional[Dict[str, CategoryScoreItem]] = None
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
    pqc_safe_count: int
    pqc_vulnerable_count: int
    current_status: str
    total_files_to_scan: int

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

def calculate_repo_overall_score(scored_algorithms: Dict) -> Dict:
    """
    Calculate weighted overall score AND category-wise scores for a repository.
    Returns dict with overall score, grade, and category breakdowns.
    """
    if not scored_algorithms:
        return {
            'overall_score': 0.0,
            'overall_grade': 'F',
            'category_scores': {}
        }
    
    # Group algorithms by their algorithm_type (kex, signature, symmetric, hash)
    categories = {}
    for algo_name, data in scored_algorithms.items():
        algo_type = data.get('algorithm_type', 'unknown')
        
        if algo_type not in categories:
            categories[algo_type] = {
                'algorithms': [],
                'total_weighted_score': 0,
                'total_weight': 0
            }
        
        occurrences = data['occurrences']
        occurrence_weight = min(occurrences, 50)
        
        # Higher weight for critical security categories
        category = data['category']
        category_weight = 2.0 if category in [
            'Asymmetric Encryption', 'Digital Signature', 'Key Exchange',
            'PQC Digital Signature', 'PQC Key Encapsulation', 'PQC Encryption'
        ] else 1.0
        
        weight = occurrence_weight * category_weight
        
        categories[algo_type]['algorithms'].append({
            'name': algo_name,
            'final_score': data['final_score'],
            'grade': data['grade'],
            'weight': weight
        })
        categories[algo_type]['total_weighted_score'] += data['final_score'] * weight
        categories[algo_type]['total_weight'] += weight
    
    # Calculate category scores
    pqc_analyzer = PQCAnalyzer()
    category_scores = {}
    
    for cat_type, cat_data in categories.items():
        if cat_data['total_weight'] > 0:
            avg_score = cat_data['total_weighted_score'] / cat_data['total_weight']
            category_scores[cat_type] = {
                'score': round(avg_score, 2),
                'grade': pqc_analyzer.score_to_grade(avg_score),
                'algorithm_count': len(cat_data['algorithms']),
                'best_algorithm': max(cat_data['algorithms'], key=lambda x: x['final_score'])['name'],
                'worst_algorithm': min(cat_data['algorithms'], key=lambda x: x['final_score'])['name'],
            }
    
    # Calculate overall score from category scores
    # Weight categories by importance
    CATEGORY_WEIGHTS = {
        'kex': 0.35, 'signature': 0.30, 'symmetric': 0.20, 'hash': 0.15
    }
    
    total_weighted_score = 0
    total_weight = 0
    
    for cat_type, cat_score_data in category_scores.items():
        weight = CATEGORY_WEIGHTS.get(cat_type, 0.1)
        total_weighted_score += cat_score_data['score'] * weight
        total_weight += weight
    
    overall_score = total_weighted_score / total_weight if total_weight > 0 else 0.0
    
    return {
        'overall_score': round(overall_score, 2),
        'overall_grade': pqc_analyzer.score_to_grade(overall_score),
        'category_scores': category_scores
    }


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
        raise HTTPException(status_code=400, detail='Repository URL is required')

    is_valid, message = url_parser.validate_url(repo_url)

    if not is_valid:
        raise HTTPException(status_code=400, detail=message)

    normalized_url = url_parser.normalize_url(repo_url)
    platform = url_parser.detect_platform(normalized_url)

    return {
        'valid': True,
        'normalized_url': normalized_url,
        'platform': platform,
        'message': f'Valid {platform} repository URL'
    }

@app.post('/api/scan', status_code=status.HTTP_200_OK)
async def scan_repository_endpoint(scan_request: ScanRequest):
    """Queue a scan request (checks cache first)"""
    repo_url = scan_request.repo_url
    branch_name = scan_request.branch_name or 'main'  # Default to 'main'
    branch_name = branch_name.strip()

    if not repo_url:
        raise HTTPException(status_code=400, detail='repo_url is required')

    # Validate URL
    is_valid, validation_msg = url_parser.validate_url(repo_url)
    if not is_valid:
        raise HTTPException(status_code=400, detail=validation_msg)

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
            raise HTTPException(status_code=400, detail=f'Failed to clone repository from {platform}. Details: {error_msg}')
        except subprocess.TimeoutExpired:
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)
            raise HTTPException(status_code=408, detail='Repository clone timed out. The repository might be too large or the connection is slow.')
        except Exception as e:
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)
            raise HTTPException(status_code=500, detail=str(e))


@app.get('/api/scans', response_model=List[AllScansResponse])
async def get_scans():
    """Get list of all scans"""
    with get_db() as db:
        scans = db_manager.get_all_scans(db)
        return scans


@app.get('/api/scans/{scan_id}', response_model=ScanDetailsResponse)
async def get_scan_details_endpoint(scan_id: int):
    """Get detailed scan results"""
    with get_db() as db:
        try:
            details = db_manager.get_scan_details(db, scan_id)
            return details
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Internal server error: {str(e)}')


@app.get('/api/scans/{scan_id}/algorithm/{algorithm}/findings')
async def get_algorithm_findings(scan_id: int, algorithm: str):
    """Get detailed findings for a specific algorithm in a scan"""
    with get_db() as db:
        try:
            # Get scan result for this algorithm
            scan_result = db.query(ScanResult).filter(
                ScanResult.repo_id == scan_id,
                ScanResult.algorithm == algorithm
            ).first()

            if not scan_result:
                raise HTTPException(status_code=404, detail='Algorithm not found in this scan')

            # Get all findings for this scan result
            findings = db.query(Finding).filter(
                Finding.scan_result_id == scan_result.id
            ).order_by(Finding.file_path, Finding.line_number).all()

            return [
                {
                    'file_path': finding.file_path,
                    'line_number': finding.line_number,
                    'context': finding.context,
                    'match_text': finding.match_text
                } for finding in findings
            ]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Internal server error: {str(e)}')


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
            raise HTTPException(status_code=500, detail=str(e))


if __name__ == '__main__':
    uvicorn.run(
        "app:app", 
        host='0.0.0.0', 
        port=8001,
        log_level='info',
        reload=True
    )

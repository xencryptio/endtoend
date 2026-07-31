"""
Enhanced GitHub Repository Cryptographic Algorithm Scanner
Elasticsearch-backed: no SQLite dependency. Active scans tracked in-memory;
completed scans persisted to Elasticsearch via elk-indexer.
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
from fastapi import FastAPI, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl
import uvicorn
from logging_config import setup_logging
from exceptions import APIError
from logging_middleware import correlation_middleware
from repo_scoring import RepoScoringEngine
from crypto_patterns_loader import get_crypto_patterns, verify_patterns_in_es, refresh_patterns_cache

# --- Logging Setup ---
setup_logging("REPO-SCANNER", logging.DEBUG)
logger = logging.getLogger(__name__)

# --- Elasticsearch / ELK service URLs ---
ELK_INDEXER_URL = os.getenv("ELK_INDEXER_URL", "http://elk-indexer:9100")
ELK_QUERY_API_URL = os.getenv("ELK_QUERY_API_URL", "http://elk-query-api:9101")

# ---------------------------------------------------------------------------
# In-memory active scan store
# Active scans (pending / in_progress / recently failed) live here.
# Completed scans are persisted to Elasticsearch and removed from this dict.
# ---------------------------------------------------------------------------
_active_scans: Dict[int, dict] = {}   # scan_id → scan_record
_active_scan_lock = threading.Lock()

# Monotonically-increasing ID generator seeded from current time so that IDs
# remain unique across service restarts.
_scan_id_counter: int = int(time.time())
_scan_id_counter_lock = threading.Lock()

def _new_scan_id() -> int:
    global _scan_id_counter
    with _scan_id_counter_lock:
        _scan_id_counter += 1
        return _scan_id_counter

# ---------------------------------------------------------------------------
# Elasticsearch helpers
# ---------------------------------------------------------------------------

def _post_completed_to_elk(scan_id: int, repo_url: str, branch_name: str, scan_data: dict) -> dict:
    """POST a completed (or failed) repo scan to elk-indexer for persistence."""
    payload = {
        "repo_url": repo_url,
        "branch_name": branch_name,
        "organization_id": "default",
        "scan_data": {**scan_data, "id": scan_id},
    }
    resp = requests.post(f"{ELK_INDEXER_URL}/index/repo", json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _get_completed_scans_from_es(size: int = 500) -> List[dict]:
    """Return all completed repo scan documents from elk-query-api."""
    try:
        resp = requests.get(
            f"{ELK_QUERY_API_URL}/api/elk/results/all?type=repo&size={size}",
            timeout=15,
        )
        if resp.ok:
            return resp.json().get("results", [])
    except Exception as exc:
        logger.warning(f"ES read failed (elk-query-api): {exc}")
    return []


def _get_es_scan_by_source_id(source_id: int) -> Optional[dict]:
    """Find a single completed scan in ES by its integer source_id."""
    results = _get_completed_scans_from_es(size=1000)
    target = str(source_id)
    for r in results:
        if str(r.get("source_id", "")) == target:
            return r
    return None


def _check_es_cache(repo_url: str, branch_name: str, repo_hash: str) -> Optional[dict]:
    """Return a cached ES doc if an identical scan already exists, else None."""
    results = _get_completed_scans_from_es(size=1000)
    for r in results:
        if (r.get("repo_url") == repo_url
                and r.get("branch_name") == branch_name
                and r.get("repo_hash") == repo_hash):
            return r
    return None


def _delete_from_elk(source_id: int) -> bool:
    """Delete a scan from Elasticsearch by source_id via elk-indexer."""
    try:
        resp = requests.delete(f"{ELK_INDEXER_URL}/index/repo/{source_id}", timeout=15)
        return resp.ok
    except Exception as exc:
        logger.warning(f"ES delete failed for source_id={source_id}: {exc}")
        return False


def _delete_all_from_elk() -> int:
    """Delete all repo scans from Elasticsearch."""
    try:
        resp = requests.delete(f"{ELK_INDEXER_URL}/index/repo", timeout=15)
        if resp.ok:
            return resp.json().get("deleted", 0)
    except Exception as exc:
        logger.warning(f"ES delete-all failed: {exc}")
    return 0


def _es_to_list_item(r: dict) -> dict:
    """Convert an ES document (from elk-query-api) to AllScansResponse format."""
    raw = r.get("raw") or {}
    try:
        scan_id = int(r.get("source_id", 0))
    except (TypeError, ValueError):
        scan_id = 0
    return {
        "id": scan_id,
        "repo_url": r.get("repo_url", ""),
        "repo_hash": r.get("repo_hash") or raw.get("repo_hash", ""),
        "branch_name": r.get("branch_name", ""),
        "platform": r.get("platform") or raw.get("platform", ""),
        "last_scanned": r.get("last_scanned") or r.get("scanned_at"),
        "scan_status": r.get("scan_status", "completed"),
        "total_files": r.get("total_files") or raw.get("total_files", 0),
        "total_algorithms": r.get("total_algorithms") or raw.get("total_algorithms", 0),
        "quantum_safe_count": r.get("quantum_safe_count", 0),
        "quantum_vulnerable_count": r.get("quantum_vulnerable_count", 0),
        "current_status": r.get("current_status") or raw.get("current_status", "Scan completed"),
        "total_files_to_scan": r.get("total_files_to_scan") or raw.get("total_files_to_scan", 0),
        "overall_security_score": r.get("overall_security_score") or r.get("overall_score"),
        "overall_grade": r.get("overall_grade"),
        "quantum_readiness_percentage": r.get("quantum_readiness_percentage", 0.0),
        "error_detail": None,
    }


def _es_to_detail(r: dict, source_id: int) -> dict:
    """Convert an ES document to ScanDetailsResponse format."""
    raw = r.get("raw") or {}
    return {
        "repo_id": source_id,
        "repo_url": r.get("repo_url", ""),
        "repo_hash": r.get("repo_hash") or raw.get("repo_hash", ""),
        "branch_name": r.get("branch_name", ""),
        "platform": r.get("platform") or raw.get("platform", ""),
        "last_scanned": r.get("last_scanned") or r.get("scanned_at") or datetime.utcnow().isoformat(),
        "scan_status": r.get("scan_status", "completed"),
        "total_files": r.get("total_files") or raw.get("total_files", 0),
        "total_algorithms": r.get("total_algorithms", 0),
        "quantum_safe_count": r.get("quantum_safe_count", 0),
        "quantum_vulnerable_count": r.get("quantum_vulnerable_count", 0),
        "true_pqc_count": raw.get("true_pqc_count", 0),
        "current_status": r.get("current_status") or raw.get("current_status", "Scan completed"),
        "total_files_to_scan": r.get("total_files_to_scan") or raw.get("total_files_to_scan", 0),
        "overall_security_score": r.get("overall_security_score") or r.get("overall_score") or raw.get("overall_score"),
        "overall_grade": r.get("overall_grade") or raw.get("overall_grade"),
        "quantum_readiness_percentage": r.get("quantum_readiness_percentage", 0.0),
        "algorithms": raw.get("algorithms", {}),
        "category_scores": raw.get("category_scores"),
        "migration_plan": raw.get("migration_plan"),
        "quantum_readiness_detail": raw.get("quantum_readiness_detail"),
        "critical_vulnerabilities": raw.get("critical_vulnerabilities"),
    }


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
# CRYPTO_PATTERNS — Loaded from Elasticsearch (Single Source of Truth)
# ═══════════════════════════════════════════════════════════════════════════════
#
# IMPORTANT: Algorithm detection patterns are now loaded from Elasticsearch
# at startup, shared with domain scanning service. This ensures:
#
# 1. Single source of truth - admins manage patterns in ELK Algorithm Scorer UI
# 2. No code deployment needed to add/update algorithms
# 3. Case-insensitive matching to prevent false negatives
# 4. Real-time pattern updates across all scanners
#
# Loading strategy:
# 1. Try to load from ES index: crypto-algorithm-scores
# 2. Fall back to minimal hardcoded patterns if ES unavailable
# 3. Cache patterns for 10 minutes for performance
# 4. Support case-insensitive matching on algorithm names

def _load_crypto_patterns() -> Dict[str, Dict]:
    """Load cryptographic algorithm patterns from Elasticsearch."""
    logger.info("Loading cryptographic algorithm patterns from Elasticsearch...")
    patterns = get_crypto_patterns(use_cache=True)
    
    # Verify we have patterns
    if not patterns:
        logger.warning("No patterns loaded from ES, this may indicate ES is unavailable or unconfigured")
    else:
        logger.info(f"✅ Successfully loaded {len(patterns)} algorithm patterns from ES")
    
    return patterns


# Initialize CRYPTO_PATTERNS at startup
# This will be populated from ES on first use
_CRYPTO_PATTERNS_CACHE: Optional[Dict[str, Dict]] = None


def get_cached_crypto_patterns() -> Dict[str, Dict]:
    """Get cached crypto patterns, loading from ES if needed."""
    global _CRYPTO_PATTERNS_CACHE
    if _CRYPTO_PATTERNS_CACHE is None:
        _CRYPTO_PATTERNS_CACHE = _load_crypto_patterns()
    return _CRYPTO_PATTERNS_CACHE


# ══════════════════════════════════════════════════════════════════════════════
# FILE TYPE CLASSIFICATION - Prevents False Positives
# ══════════════════════════════════════════════════════════════════════════════

# ACTUAL CODE FILES - These are scanned for real crypto implementations
CODE_EXTENSIONS = {
    '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c', '.h', '.hpp', 
    '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.sh', 
    '.bash', '.zsh', '.pl', '.lua', '.r', '.m', '.mm', '.dart', '.groovy',
    '.clj', '.ex', '.exs', '.erl', '.hrl', '.ml', '.fs', '.vb', '.pas',
    '.html', '.htm', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
    '.asm', '.s', '.sql', '.proto', '.thrift', '.graphql'
}

# DOCUMENTATION/SCHEMA FILES - These often contain algorithm names in descriptions
# Findings from these files are marked as 'documentation_reference' and excluded from scoring
DOCUMENTATION_EXTENSIONS = {
    '.json', '.yaml', '.yml', '.xml', '.toml', '.ini', '.conf', '.config',
    '.properties', '.md', '.rst', '.txt', '.asciidoc', '.env'
}

# BUILD/PACKAGE FILES - Lock files, build configs (usually contain hashes for integrity)
BUILD_EXTENSIONS = {
    '.gradle', '.cmake', '.make', '.mk', '.dockerfile', 'package-lock.json',
    'yarn.lock', 'composer.lock', 'Gemfile.lock', 'Pipfile.lock', 'poetry.lock'
}

# DIRECTORIES TO SKIP - Test data, examples, and vendor code
SKIP_DIRECTORIES = {
    'test', 'tests', '__tests__', 'testdata', 'test_data', 'testcase', 'testcases',
    'mock', 'mocks', '__mocks__', 'fixtures',
    'example', 'examples', 'sample', 'samples', 'demo', 'demos',
    'vendor', 'node_modules', 'dist', 'build', '.git', '.github',
    'docs', 'documentation', 'spec', 'specs',
    'vectors', 'vector',  # Crypto test-vector directories (e.g. pyca/cryptography)
}

# ══════════════════════════════════════════════════════════════════════════════
# FALSE POSITIVE FILTERS - Exclude non-crypto artifacts
# ══════════════════════════════════════════════════════════════════════════════

def is_false_positive(algorithm: str, context: str, match_text: str) -> bool:
    """
    Detects false positives - algorithm names that are NOT actual crypto code.
    Returns True if this is a false positive (should be excluded).
    
    Common false positives:
    - SSH keys (ssh-rsa, ssh-dss, etc.)
    - API endpoint URLs containing hash names  
    - Description/documentation strings
    - AWS signature algorithm parameters
    - File paths and URLs
    """
    context_lower = context.lower()
    match_lower = match_text.lower()
    
    # ── RSA False Positives ────────────────────────────────────────────────
    if algorithm == 'RSA':
        # SSH public/private keys (ssh-rsa, ssh-dss)
        if 'ssh-rsa' in context_lower or 'ssh-dss' in context_lower:
            logger.debug(f"FP: RSA match in SSH key context: {context[:80]}")
            return True
        
        # PEM certificate headers
        if '-----begin' in context_lower or '-----end' in context_lower:
            logger.debug(f"FP: RSA match in certificate context: {context[:80]}")
            return True
    
    # ── MD5 False Positives ────────────────────────────────────────────────
    if algorithm in ['MD5', 'SHA-1', 'SHA-256', 'SHA-512', 'SHA-384']:
        # AWS signature algorithms in URLs
        if 'x-amz-algorithm=aws4-hmac-' in context_lower:
            logger.debug(f"FP: {algorithm} in AWS signature URL: {context[:80]}")
            return True
        
        # Content-MD5 HTTP headers in examples/docs
        if 'content-md5' in context_lower and ('"' in context or "'" in context):
            logger.debug(f"FP: {algorithm} in HTTP header example: {context[:80]}")
            return True
        
        # File integrity checksums in documentation
        if any(keyword in context_lower for keyword in ['checksum', 'hash of the', 'digest of the', 'integrity check']):
            logger.debug(f"FP: {algorithm} in checksum documentation: {context[:80]}")
            return True
    
    # ── General Documentation Patterns ─────────────────────────────────────
    # JSON/YAML description fields
    if '"description"' in context_lower or "'description'" in context_lower:
        logger.debug(f"FP: {algorithm} in description field: {context[:80]}")
        return True
    
    # Algorithm names in URLs/endpoints
    if context.startswith('http://') or context.startswith('https://') or '://' in context:
        logger.debug(f"FP: {algorithm} in URL: {context[:80]}")
        return True
    
    # File paths or base64 data (long alphanumeric strings)
    if len(match_text) > 20 and match_text.replace('/', '').replace('+', '').replace('=', '').isalnum():
        logger.debug(f"FP: {algorithm} match looks like base64/hash data: {match_text[:40]}")
        return True

    # ── Assembly Register Alias False Positives ────────────────────────────
    # ARM/x86 assembly: variable names like 'des .req x11' or '.unreq des'
    # Pattern: word used as register alias, not as crypto algorithm
    if algorithm in ['DES', '3DES', 'AES', 'RSA', 'RC4']:
        if '.req ' in context or 'unreq ' in context or 'unreq\t' in context:
            logger.debug(f"FP: {algorithm} match in assembly register alias: {context[:80]}")
            return True
        # Assembly instruction operand: 'add des, x4, #0' or 'st1 ...[des]...'
        if '[' + match_lower + ']' in context_lower or (', ' + match_lower + ',' in context_lower and '#' in context):
            logger.debug(f"FP: {algorithm} match as assembly instruction operand: {context[:80]}")
            return True

    # ── NTT Butterfly False Positives (Blowfish) ───────────────────────────
    # NTT butterfly functions: ctbf_*, tbf_* — nothing to do with Blowfish cipher
    # (caught by \bBF_ pattern fix above, but extra safety)
    if algorithm == 'Blowfish' and match_lower in ('bf_',):
        if any(k in context_lower for k in ['ctbf_', 'tbf_', 'gsbi_', 'butterfly', 'ntt']):
            logger.debug(f"FP: Blowfish match in NTT butterfly context: {context[:80]}")
            return True

    return False

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


class CryptoScanner:
    """Enhanced crypto scanner with hash calculation and file listing"""
    
    def __init__(self, repo_path: str):
        self.repo_path = Path(repo_path)
        self.findings: Dict[str, List[Dict]] = defaultdict(list)
        self.compiled_patterns = self._compile_patterns()
        self.file_count = 0
    
    def _compile_patterns(self) -> Dict[str, List[Tuple[re.Pattern, str]]]:
        """Compile all regex patterns from ES for efficiency with case-insensitive matching"""
        compiled = {}
        
        # Load patterns from Elasticsearch (single source of truth)
        try:
            crypto_patterns = get_cached_crypto_patterns()
            logger.info(f"[CryptoScanner] Loaded {len(crypto_patterns)} algorithms from ES for pattern compilation")
        except Exception as e:
            logger.error(f"[CryptoScanner] Failed to load patterns from ES: {e}. Patterns will be empty.")
            crypto_patterns = {}
        
        for algo, info in crypto_patterns.items():
            # Get patterns list - handle both 'patterns' array and 'pattern' single string
            patterns_list = info.get('patterns', [])
            if isinstance(patterns_list, str):
                patterns_list = [patterns_list]
            
            if not patterns_list:
                logger.warning(f"Algorithm {algo} has no patterns defined")
                continue
            
            compiled[algo] = []
            for pattern in patterns_list:
                try:
                    # IMPORTANT: Use re.IGNORECASE to match across case variations
                    # This prevents missing matches like 'aes', 'AES', 'Aes', 'aeS'
                    compiled_pattern = re.compile(pattern, re.IGNORECASE)
                    compiled[algo].append((compiled_pattern, pattern))
                except re.error as e:
                    logger.warning(f"Invalid regex pattern for {algo}: {pattern} - {e}")
                    continue
        
        logger.info(f"[CryptoScanner] Compiled {len(compiled)} algorithms with {sum(len(v) for v in compiled.values())} total regex patterns")
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
        """
        Collects all CODE files to scan (excludes documentation/schema/test files)
        This prevents false positives from JSON schemas, YAML configs, test data, etc.
        """
        code_files = []
        for file_path in self.repo_path.rglob('*'):
            if not file_path.is_file():
                continue
            
            # Skip files in excluded directories (tests, examples, node_modules, etc.)
            if any(skip_dir in file_path.parts for skip_dir in SKIP_DIRECTORIES):
                continue
            
            # Skip .git directory
            if '.git' in file_path.parts:
                continue
            
            # Skip documentation/schema/config files (these cause false positives)
            ext = file_path.suffix.lower()
            if ext in DOCUMENTATION_EXTENSIONS or ext in BUILD_EXTENSIONS:
                logger.debug(f"Skipping documentation/config file: {file_path.name}")
                continue
            
            # Only include actual code files
            # Files with no extension are often scripts (entrypoints, shell scripts, etc.) — scan them
            if ext in CODE_EXTENSIONS or ext == '':
                code_files.append(file_path)
        
        logger.info(f"Collected {len(code_files)} code files for scanning (excluded docs/configs/tests)")
        return code_files

    def scan_file(self, file_path: Path) -> Dict[str, List[Dict]]:
        """Scan a single file for cryptographic algorithms – comment-aware."""
        results = defaultdict(list)
        ext = file_path.suffix.lower()
        lang = _LANG.get(ext, {})

        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            # Strip NUL bytes — they survive utf-8 with errors='ignore' but break
            # Postgres text inserts and confuse regex/line-splitting on binaries.
            if '\x00' in content:
                content = content.replace('\x00', '')
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
                                    # Filter out false positives before recording
                                    if is_false_positive(algo, original_stripped, match.group()):
                                        continue
                                    
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
                            # Filter out false positives before recording
                            if is_false_positive(algo, raw_line.strip(), match.group()):
                                continue
                            
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
        
        # Load algorithm metadata from ES (same source as pattern compilation)
        crypto_patterns = get_cached_crypto_patterns()
        
        for algo in self.findings.keys():
            # Use uppercase key for lookup (algorithm names stored uppercase in ES)
            algo_upper = algo.upper()
            info = crypto_patterns.get(algo_upper, crypto_patterns.get(algo, {}))
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
    """Process a single scan job — saves results to Elasticsearch via elk-indexer."""
    print(f"[PROCESS_SCAN_JOB] Starting for repo_id={repo_id}, url={repo_url}, branch={branch_name}")
    temp_dir = None
    try:
        # Mark as in_progress
        with _active_scan_lock:
            if repo_id in _active_scans:
                _active_scans[repo_id]["scan_status"] = "in_progress"
                _active_scans[repo_id]["current_status"] = "Cloning repository..."
                _active_scans[repo_id]["last_scanned"] = datetime.utcnow().isoformat()

        # Clone repository
        temp_dir = tempfile.mkdtemp()
        subprocess.run(
            ['git', 'clone', '--depth', '1', '--branch', branch_name, repo_url, temp_dir],
            check=True,
            capture_output=True,
            timeout=300,
        )

        scanner = CryptoScanner(temp_dir)
        all_files_to_scan = scanner.get_all_code_files()
        total_files = len(all_files_to_scan)

        with _active_scan_lock:
            if repo_id in _active_scans:
                _active_scans[repo_id]["current_status"] = f"Preparing to scan branch {branch_name}..."
                _active_scans[repo_id]["total_files_to_scan"] = total_files

        scanned_count = 0
        for file_path in all_files_to_scan:
            file_results = scanner.scan_file(file_path)
            for algo, occurrences in file_results.items():
                scanner.findings[algo].extend(occurrences)
            scanned_count += 1
            if scanned_count % 10 == 0 or scanned_count == total_files:
                with _active_scan_lock:
                    if repo_id in _active_scans:
                        _active_scans[repo_id]["current_status"] = f"Scanning files... ({scanned_count}/{total_files})"
                        _active_scans[repo_id]["total_files"] = scanned_count
            scanner.file_count = scanned_count

        results = scanner.get_results()

        try:
            print("[APP] Creating RepoScoringEngine...")
            scoring_engine = RepoScoringEngine()
            print("[APP] RepoScoringEngine created successfully")
            scoring_response = scoring_engine.score_algorithms(results['algorithms'])
        except Exception as e:
            print(f"[APP] ERROR creating/using RepoScoringEngine: {e}")
            import traceback
            traceback.print_exc()
            scoring_response = {"algorithm_scores": {}}

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
        results['quantum_safe_count'] = scoring_response.get('quantum_safe_count', 0)
        results['quantum_vulnerable_count'] = scoring_response.get('quantum_vulnerable_count', 0)

        # Get platform from active_scans record
        platform = "GitHub"
        with _active_scan_lock:
            if repo_id in _active_scans:
                platform = _active_scans[repo_id].get("platform", "GitHub")

        repo_hash = scanner.get_repo_hash()

        # Compute quantum readiness percentage
        algorithms = results['algorithms']
        total_occ = sum(a.get('occurrences', 0) for a in algorithms.values())
        safe_occ = sum(a.get('occurrences', 0) for a in algorithms.values() if a.get('quantum_safe', False))
        qr_pct = round((safe_occ / total_occ * 100) if total_occ > 0 else 0, 2)
        true_pqc_count = sum(1 for a in algorithms.values() if a.get('is_pqc', False))

        scan_data = {
            "id": repo_id,
            "repo_url": repo_url,
            "repo_hash": repo_hash,
            "branch_name": branch_name,
            "platform": platform,
            "scan_status": "completed",
            "current_status": "Scan completed successfully",
            "total_files": scanned_count,
            "total_files_to_scan": total_files,
            "total_algorithms": len(algorithms),
            "quantum_safe_count": results.get('quantum_safe_count', 0),
            "quantum_vulnerable_count": results.get('quantum_vulnerable_count', 0),
            "true_pqc_count": true_pqc_count,
            "overall_security_score": results.get('overall_score'),
            "overall_grade": results.get('overall_grade'),
            "quantum_readiness_percentage": qr_pct,
            "last_scanned": datetime.utcnow().isoformat(),
            "algorithms": algorithms,
            "category_scores": results.get('category_scores'),
            "migration_plan": results.get('migration_plan'),
            "quantum_readiness_detail": results.get('quantum_readiness_detail'),
            "critical_vulnerabilities": results.get('critical_vulnerabilities'),
        }

        # Persist to Elasticsearch
        _post_completed_to_elk(repo_id, repo_url, branch_name, scan_data)

        # Remove from active_scans — it's now in ES
        with _active_scan_lock:
            _active_scans.pop(repo_id, None)

        logger.info(f"✓ Scan completed and indexed to ES: {repo_url} (ID: {repo_id})")

    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.decode(errors='replace') if e.stderr else str(e)
        if 'did not match any remote' in error_msg or 'not found' in error_msg.lower():
            error_msg = f"Branch '{branch_name}' not found in repository"
        else:
            error_msg = f"Failed to clone repository: {error_msg[:300]}"
        logger.error(f"✗ Scan failed (ID {repo_id}): {error_msg}")
        with _active_scan_lock:
            if repo_id in _active_scans:
                _active_scans[repo_id]["scan_status"] = "failed"
                _active_scans[repo_id]["current_status"] = error_msg
                _active_scans[repo_id]["error_detail"] = error_msg

    except subprocess.TimeoutExpired:
        error_msg = "Repository clone timed out (exceeded 5 minutes)"
        logger.error(f"✗ Scan timed out (ID {repo_id})")
        with _active_scan_lock:
            if repo_id in _active_scans:
                _active_scans[repo_id]["scan_status"] = "failed"
                _active_scans[repo_id]["current_status"] = error_msg
                _active_scans[repo_id]["error_detail"] = error_msg

    except Exception as e:
        logger.error(f"✗ Scan error (ID {repo_id}): {e}", exc_info=True)
        with _active_scan_lock:
            if repo_id in _active_scans:
                _active_scans[repo_id]["scan_status"] = "failed"
                _active_scans[repo_id]["current_status"] = f"Failed: {str(e)[:200]}"
                _active_scans[repo_id]["error_detail"] = str(e)

    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)


# ===========================================
# 🚀 MULTI-SCAN QUEUE WORKER IMPLEMENTATION
# ===========================================

MAX_CONCURRENT_SCANS = 3
_processing_ids: set = set()
_processing_lock = threading.Lock()


def process_scan_wrapper(repo_id: int, repo_url: str, branch_name: str):
    """Wrapper to ensure cleanup of _processing_ids set even on error."""
    try:
        asyncio.run(process_scan_job(repo_id, repo_url, branch_name))
    finally:
        with _processing_lock:
            _processing_ids.discard(repo_id)
        logger.info(f"✅ Completed and released scan ID {repo_id}")


def job_queue_worker():
    """Multi-threaded queue worker — polls in-memory active_scans for pending jobs."""
    logger.info(f"🔄 Job queue worker started (max {MAX_CONCURRENT_SCANS} concurrent scans)")

    while True:
        try:
            with _active_scan_lock:
                pending = [(sid, s) for sid, s in _active_scans.items() if s["scan_status"] == "pending"]

            for scan_id, scan in pending:
                with _processing_lock:
                    if scan_id in _processing_ids:
                        continue
                    if len(_processing_ids) >= MAX_CONCURRENT_SCANS:
                        break
                    _processing_ids.add(scan_id)

                logger.info(f"⚙️  Starting scan: {scan['repo_url']} (Branch: {scan['branch_name']}, ID: {scan_id})")

                thread = threading.Thread(
                    target=process_scan_wrapper,
                    args=(scan_id, scan['repo_url'], scan['branch_name']),
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
    last_scanned: Optional[datetime] = None  # null for failed scans that never started
    scan_status: str
    total_files: Optional[int] = 0
    total_algorithms: Optional[int] = 0
    quantum_safe_count: Optional[int] = 0
    quantum_vulnerable_count: Optional[int] = 0
    current_status: Optional[str] = None
    total_files_to_scan: Optional[int] = 0
    overall_security_score: Optional[float] = None
    overall_grade: Optional[str] = None
    quantum_readiness_percentage: Optional[float] = None
    error_detail: Optional[str] = None  # human-readable failure reason

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

@app.on_event("startup")
async def startup_event():
    """Verify patterns are loaded from Elasticsearch on startup"""
    logger.info("=" * 80)
    logger.info("🚀 REPO SCANNER STARTUP - Verifying Cryptographic Algorithm Patterns")
    logger.info("=" * 80)
    
    # Verify patterns are in ES
    success, message = verify_patterns_in_es()
    logger.info(message)
    
    if not success:
        logger.warning("⚠️  No algorithm patterns found in Elasticsearch!")
        logger.warning("   Admin must add algorithms via ELK Algorithm Scorer UI at: /elk/scorer")
        logger.warning("   Repo scanner will use fallback patterns (limited functionality)")
    
    # Pre-load patterns into cache
    try:
        patterns = get_cached_crypto_patterns()
        logger.info(f"✅ Pre-loaded {len(patterns)} algorithms into memory cache")
    except Exception as e:
        logger.error(f"Failed to pre-load patterns: {e}")
    
    logger.info("=" * 80)

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

def _process_pending_scans_worker():
    """Background worker: processes pending scans (clone → hash → cache check → queue)."""
    import time as time_module
    while True:
        try:
            time_module.sleep(0.5)  # Poll every 500ms
            
            with _active_scan_lock:
                pending_ids = [sid for sid, s in _active_scans.items() if s.get('scan_status') == 'cloning']
            
            for pending_id in pending_ids:
                with _active_scan_lock:
                    if pending_id not in _active_scans or _active_scans[pending_id].get('scan_status') != 'cloning':
                        continue
                    rec = _active_scans[pending_id]
                
                normalized_url = rec['repo_url']
                branch_name = rec['branch_name']
                temp_dir = None
                
                try:
                    # Clone to get hash
                    temp_dir = tempfile.mkdtemp()
                    subprocess.run(
                        ['git', 'clone', '--depth', '1', '--branch', branch_name, normalized_url, temp_dir],
                        check=True, capture_output=True, timeout=300,
                    )
                    temp_scanner = CryptoScanner(temp_dir)
                    repo_hash = temp_scanner.get_repo_hash()
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    temp_dir = None
                    
                    # Update record with hash
                    with _active_scan_lock:
                        if pending_id in _active_scans:
                            _active_scans[pending_id]['repo_hash'] = repo_hash
                    
                    # Check ES cache
                    cached = _check_es_cache(normalized_url, branch_name, repo_hash)
                    if cached:
                        # Cache hit: move to 'cached' and return cached data
                        with _active_scan_lock:
                            if pending_id in _active_scans:
                                try:
                                    source_id = int(cached.get("source_id", 0))
                                except (TypeError, ValueError):
                                    source_id = 0
                                details = _es_to_detail(cached, source_id)
                                _active_scans[pending_id]['scan_status'] = 'completed'
                                _active_scans[pending_id]['current_status'] = 'Scan completed (from cache)'
                                # Merge cached data into record
                                _active_scans[pending_id].update(details)
                        continue
                    
                    # Check for active duplicate by hash
                    with _active_scan_lock:
                        dup_found = False
                        for sid, s in _active_scans.items():
                            if sid != pending_id and s['repo_url'] == normalized_url and s['branch_name'] == branch_name and s.get('repo_hash') == repo_hash:
                                dup_found = True
                                break
                        
                        if not dup_found and pending_id in _active_scans:
                            # Move to 'pending' queue for job worker to pick up
                            _active_scans[pending_id]['scan_status'] = 'pending'
                            _active_scans[pending_id]['current_status'] = 'Queued for scanning'
                
                except subprocess.CalledProcessError as e:
                    if temp_dir:
                        shutil.rmtree(temp_dir, ignore_errors=True)
                    raw = e.stderr.decode(errors='replace') if e.stderr else ''
                    if 'did not match any remote' in raw or ('not found' in raw.lower() and 'branch' in raw.lower()):
                        error_msg = f"Branch '{branch_name}' not found in repository"
                    elif 'repository' in raw.lower() and ('not found' in raw.lower() or '404' in raw):
                        error_msg = f"Repository not found"
                    elif 'could not read username' in raw.lower() or 'authentication failed' in raw.lower():
                        error_msg = f"Repository not found or is private"
                    else:
                        error_msg = raw.strip()[:200] if raw.strip() else "Clone failed"
                    
                    with _active_scan_lock:
                        if pending_id in _active_scans:
                            _active_scans[pending_id]['scan_status'] = 'failed'
                            _active_scans[pending_id]['current_status'] = error_msg
                            _active_scans[pending_id]['error_detail'] = error_msg
                
                except Exception as ex:
                    logger.error(f"Pending scan worker error (ID {pending_id}): {ex}")
                    with _active_scan_lock:
                        if pending_id in _active_scans:
                            _active_scans[pending_id]['scan_status'] = 'failed'
                            _active_scans[pending_id]['current_status'] = str(ex)[:200]
        
        except Exception as ex:
            logger.error(f"Pending scans worker crashed: {ex}", exc_info=True)


# Start pending scans worker thread (after function definition)
pending_worker_thread = threading.Thread(target=_process_pending_scans_worker, daemon=True)
pending_worker_thread.start()


@app.post('/api/scan', status_code=status.HTTP_200_OK)
async def scan_repository_endpoint(scan_request: ScanRequest):
    """Queue a scan request — return IMMEDIATELY, cloning happens async in background."""
    repo_url = scan_request.repo_url
    branch_name = (scan_request.branch_name or 'main').strip()

    if not repo_url:
        raise APIError(status_code=400, error_code="repo_url_required", message='repo_url is required')

    is_valid, validation_msg = url_parser.validate_url(repo_url)
    if not is_valid:
        raise APIError(status_code=400, error_code="invalid_repo_url", message=validation_msg)

    normalized_url = url_parser.normalize_url(repo_url)
    platform = url_parser.detect_platform(normalized_url)

    # Create scan record in 'cloning' state — worker will do the actual clone
    scan_id = _new_scan_id()
    now = datetime.utcnow()
    scan_record = {
        "id": scan_id,
        "repo_url": normalized_url,
        "repo_hash": "",  # Will be populated by worker
        "branch_name": branch_name,
        "platform": platform,
        "scan_status": "cloning",  # Special state: clone/hash in progress
        "current_status": "Determining repository state...",
        "total_files": 0,
        "total_files_to_scan": 0,
        "quantum_safe_count": 0,
        "quantum_vulnerable_count": 0,
        "overall_security_score": None,
        "overall_grade": None,
        "quantum_readiness_percentage": 0.0,
        "last_scanned": None,
        "created_at": now.isoformat(),
        "error_detail": None,
    }
    with _active_scan_lock:
        _active_scans[scan_id] = scan_record

    # Return IMMEDIATELY — let background worker do clone/cache check
    return ScanQueueResponse(
        repo_id=scan_id,
        repo_url=normalized_url,
        repo_hash="",
        branch_name=branch_name,
        platform=platform,
        scan_status='cloning',
        current_status='Determining repository state...',
        message=f'Scan request accepted. Analyzing repository...',
        created_at=now,
    )


@app.get('/api/scans', response_model=List[AllScansResponse])
async def get_scans(limit: int = 100, offset: int = 0):
    """Get list of scans — merges active (in-memory) + completed (Elasticsearch)."""
    # Fetch completed scans from ES
    es_results = _get_completed_scans_from_es(size=min(limit + 200, 1000))
    completed = [_es_to_list_item(r) for r in es_results]
    completed_ids = {item['id'] for item in completed}

    # Fetch active scans (pending / in_progress / failed) from memory
    with _active_scan_lock:
        active = list(_active_scans.values())

    # Filter out active scans whose completed version is already in ES
    active_filtered = [s for s in active if s['id'] not in completed_ids]

    # Merge and sort by most-recent activity
    all_scans = active_filtered + completed

    def _sort_key(s):
        return str(s.get('last_scanned') or s.get('created_at') or '')

    all_scans.sort(key=_sort_key, reverse=True)
    return all_scans[offset: offset + limit]


@app.get('/api/scans/{scan_id}', response_model=ScanDetailsResponse)
async def get_scan_details_endpoint(scan_id: int):
    """Get detailed scan results — checks memory first, then Elasticsearch."""
    # Check active scans
    with _active_scan_lock:
        active = _active_scans.get(scan_id)

    if active:
        last_scanned_dt = None
        if active.get("last_scanned"):
            try:
                last_scanned_dt = datetime.fromisoformat(active["last_scanned"])
            except ValueError:
                pass
        return {
            "repo_id": active["id"],
            "repo_url": active["repo_url"],
            "repo_hash": active.get("repo_hash", ""),
            "branch_name": active["branch_name"],
            "platform": active.get("platform", ""),
            "last_scanned": last_scanned_dt or datetime.utcnow(),
            "scan_status": active["scan_status"],
            "total_files": active.get("total_files", 0),
            "total_algorithms": 0,
            "quantum_safe_count": active.get("quantum_safe_count", 0),
            "quantum_vulnerable_count": active.get("quantum_vulnerable_count", 0),
            "true_pqc_count": 0,
            "current_status": active.get("current_status", ""),
            "total_files_to_scan": active.get("total_files_to_scan", 0),
            "overall_security_score": None,
            "overall_grade": None,
            "quantum_readiness_percentage": 0.0,
            "algorithms": {},
            "category_scores": None,
            "migration_plan": None,
            "quantum_readiness_detail": None,
            "critical_vulnerabilities": None,
        }

    # Check Elasticsearch
    es_result = _get_es_scan_by_source_id(scan_id)
    if es_result:
        return _es_to_detail(es_result, scan_id)

    raise APIError(status_code=404, error_code="scan_not_found", message=f"Scan ID {scan_id} not found")


@app.get('/api/scans/{scan_id}/algorithm/{algorithm}/findings', response_model=AlgorithmFindingsResponse)
async def get_algorithm_findings(
    scan_id: int,
    algorithm: str,
    limit_files: int = 20,
    limit_per_file: int = 10,
    offset_files: int = 0,
    sort_by: str = "file_path",
    filter_directory: Optional[str] = None
):
    """Get detailed, grouped, and paginated findings for a specific algorithm — reads from Elasticsearch."""
    try:
        es_result = _get_es_scan_by_source_id(scan_id)
        if not es_result:
            raise APIError(status_code=404, error_code="scan_not_found", message=f"Scan ID {scan_id} not found")

        raw = es_result.get("raw") or {}
        algorithms = raw.get("algorithms") or {}
        algo_data = algorithms.get(algorithm)
        if not algo_data:
            raise APIError(status_code=404, error_code="algorithm_not_found", message='Algorithm not found in this scan')

        findings_list = algo_data.get("findings", [])
        occurrences = algo_data.get("occurrences", len(findings_list))

        # Group by file path
        grouped: Dict[str, list] = defaultdict(list)
        for finding in findings_list:
            fp = finding.get('file', '') or finding.get('file_path', '')
            grouped[fp].append(finding)

        all_grouped = dict(grouped)

        directory_summary: Dict[str, int] = defaultdict(int)
        for fp, flist in grouped.items():
            directory = os.path.dirname(fp) or "root"
            directory_summary[directory] += len(flist)

        if filter_directory:
            grouped = {k: v for k, v in grouped.items() if os.path.dirname(k) == filter_directory}

        if sort_by == "occurrences":
            sorted_files = sorted(grouped.keys(), key=lambda f: len(grouped[f]), reverse=True)
        elif sort_by == "directory":
            sorted_files = sorted(grouped.keys(), key=lambda f: (os.path.dirname(f), os.path.basename(f)))
        else:
            sorted_files = sorted(grouped.keys())

        paginated_files = sorted_files[offset_files: offset_files + limit_files]
        files = []
        for fp in paginated_files:
            flist = grouped[fp]
            paginated = flist[:limit_per_file]
            files.append({
                "file_path": fp,
                "occurrence_count": len(flist),
                "directory": os.path.dirname(fp) or "root",
                "findings": [
                    {
                        "line_number": f.get('line') or f.get('line_number') or 0,
                        "code_snippet": (f.get('context') or f.get('code_snippet') or '')[:200],
                        "match_text": f.get('match') or f.get('match_text') or '',
                    }
                    for f in paginated
                ],
                "has_more": len(flist) > limit_per_file,
                "showing": len(paginated),
            })

        return {
            "algorithm": algorithm,
            "total_occurrences": occurrences,
            "total_files": len(grouped),
            "total_files_all": len(all_grouped),
            "files": files,
            "directory_summary": dict(directory_summary),
            "has_more": (offset_files + limit_files) < len(sorted_files),
            "current_page": offset_files // limit_files + 1,
        }
    except APIError:
        raise
    except Exception as e:
        logger.error(f"Failed to get algorithm findings: {e}", exc_info=True)
        raise APIError(status_code=500, error_code="internal_server_error", message=f'Internal server error: {str(e)}')


@app.get('/api/queue/status', response_model=QueueStatusResponse)
async def get_queue_status():
    """Get current queue status from in-memory active scans + ES completed count."""
    with _active_scan_lock:
        active = list(_active_scans.values())

    pending = [s for s in active if s['scan_status'] == 'pending']
    in_progress = [s for s in active if s['scan_status'] == 'in_progress']
    failed_active = [s for s in active if s['scan_status'] == 'failed']

    try:
        resp = requests.get(f"{ELK_QUERY_API_URL}/api/elk/results/all?type=repo&size=1", timeout=5)
        completed_count = resp.json().get("total", 0) if resp.ok else 0
    except Exception:
        completed_count = 0

    return {
        'pending_count': len(pending),
        'in_progress_count': len(in_progress),
        'completed_count': completed_count,
        'failed_count': len(failed_active),
        'pending_jobs': [
            {'id': s['id'], 'repo_url': s['repo_url'], 'branch_name': s['branch_name']}
            for s in pending[:5]
        ],
    }


@app.delete('/api/scans/{scan_id}', status_code=status.HTTP_200_OK)
async def delete_scan_endpoint(scan_id: int):
    """Delete a scan from memory and/or Elasticsearch."""
    repo_url = None

    # Remove from active scans if present
    with _active_scan_lock:
        active = _active_scans.pop(scan_id, None)
    if active:
        repo_url = active.get('repo_url')

    # Delete from Elasticsearch (may not exist if still pending/failed)
    deleted_from_es = _delete_from_elk(scan_id)

    if active is None and not deleted_from_es:
        raise APIError(status_code=404, error_code="scan_not_found", message=f"Scan ID {scan_id} not found")

    logger.info(f"✓ Scan {scan_id} deleted (active={active is not None}, es={deleted_from_es})")
    return {
        "message": "Scan deleted successfully",
        "scan_id": scan_id,
        "repo_url": repo_url or f"scan_{scan_id}",
    }


@app.delete('/api/scans', status_code=status.HTTP_200_OK)
async def delete_all_scans_endpoint():
    """Delete all scans from memory and Elasticsearch."""
    with _active_scan_lock:
        count_active = len(_active_scans)
        _active_scans.clear()

    es_deleted = _delete_all_from_elk()
    logger.info(f"Deleted all scans: {count_active} active + {es_deleted} from ES")
    return {
        "message": "All scans deleted successfully",
        "active_cleared": count_active,
        "es_deleted": es_deleted,
    }


@app.get("/health")
def health():
    logger.debug("Health check called")
    return {"status": "ok"}


@app.get("/patterns/status")
def patterns_status():
    """Check status of cryptographic algorithm patterns from Elasticsearch"""
    try:
        patterns = get_cached_crypto_patterns()
        success, message = verify_patterns_in_es()
        
        return {
            "status": "ok" if success else "warning",
            "patterns_loaded": len(patterns),
            "es_message": message,
            "es_index": "crypto-algorithm-scores",
            "shared_with": "domain-scanner, tls-scanner",
            "cache_ttl_seconds": 600,
            "note": "Patterns are loaded from Elasticsearch (single source of truth)"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "es_index": "crypto-algorithm-scores"
        }


@app.post("/patterns/refresh")
def refresh_patterns():
    """Force refresh algorithm patterns from Elasticsearch"""
    try:
        refresh_patterns_cache()
        patterns = get_cached_crypto_patterns()
        return {
            "status": "ok",
            "message": f"Refreshed {len(patterns)} algorithms from Elasticsearch",
            "patterns_count": len(patterns)
        }
    except Exception as e:
        logger.error(f"Failed to refresh patterns: {e}")
        return {
            "status": "error",
            "message": f"Failed to refresh patterns: {e}"
        }


if __name__ == '__main__':
    uvicorn.run(
        "app:app",
        host='0.0.0.0',
        port=8001,
        log_level='info',
        reload=True
    )

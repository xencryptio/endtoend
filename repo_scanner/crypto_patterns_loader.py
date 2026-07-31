"""
Repo Pattern Loader — loads regex detection patterns from Elasticsearch.

Index: crypto-repo-patterns  (dedicated to repo scanner, managed via ELK Scorer Repo UI)
"""

import logging
import os
import time
import threading
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
REPO_PATTERNS_INDEX = "crypto-repo-patterns"
CACHE_TTL = 600  # 10 minutes

_cache: Optional[Dict] = None
_cache_ts: float = 0.0
_lock = threading.Lock()


def _es_client():
    from elasticsearch import Elasticsearch
    return Elasticsearch([ELASTICSEARCH_URL], request_timeout=10)


def _load_from_es() -> Dict[str, Dict]:
    es = _es_client()
    result = es.search(
        index=REPO_PATTERNS_INDEX,
        query={"term": {"active": True}},
        size=10000,
    )
    hits = result.get("hits", {}).get("hits", [])
    logger.info(f"[PATTERNS_LOADER] Loaded {len(hits)} patterns from {REPO_PATTERNS_INDEX}")

    out = {}
    for hit in hits:
        src = hit["_source"]
        name = src.get("algorithm", "").upper()
        if not name:
            continue
        patterns = src.get("patterns", [])
        if isinstance(patterns, str):
            patterns = [patterns]
        if not patterns:
            continue
        out[name] = {
            "patterns": patterns,
            "category": src.get("category", "Unknown"),
            "quantum_resistance_type": src.get("quantum_resistance_type", "unknown"),
            "quantum_safe": bool(src.get("quantum_safe", False)),
            "is_pqc": bool(src.get("is_pqc", False)),
        }
    return out


def get_crypto_patterns(use_cache: bool = True) -> Dict[str, Dict]:
    global _cache, _cache_ts
    with _lock:
        if use_cache and _cache is not None and (time.time() - _cache_ts) < CACHE_TTL:
            return _cache
        try:
            _cache = _load_from_es()
            _cache_ts = time.time()
        except Exception as e:
            if _cache is not None:
                logger.warning(f"[PATTERNS_LOADER] ES refresh failed ({e}), using stale cache")
                return _cache
            raise RuntimeError(
                f"[PATTERNS_LOADER] Cannot load patterns from Elasticsearch: {e}. "
                f"Ensure the '{REPO_PATTERNS_INDEX}' index is seeded via the ELK Scorer Repo UI."
            )
        return _cache


def verify_patterns_in_es() -> Tuple[bool, str]:
    try:
        es = _es_client()
        count = es.count(index=REPO_PATTERNS_INDEX, query={"term": {"active": True}}).get("count", 0)
        if count > 0:
            return True, f"✅ {count} repo patterns loaded from Elasticsearch"
        return False, f"❌ Index '{REPO_PATTERNS_INDEX}' is empty — seed it via ELK Scorer Repo UI"
    except Exception as e:
        return False, f"❌ Cannot reach Elasticsearch: {e}"


def refresh_patterns_cache() -> None:
    global _cache, _cache_ts
    with _lock:
        _cache = _load_from_es()
        _cache_ts = time.time()
        logger.info(f"[PATTERNS_LOADER] Cache refreshed: {len(_cache)} patterns")

# core/algorithms.py
"""
Algorithm score tables -- loaded dynamically from Elasticsearch.

All algorithm base scores, quantum-safety flags and membership sets
are stored in the crypto-algorithm-scores index and fetched at runtime.
Use the ELK Algorithm Scorer UI at /elk/scorer to add or update any entry.

This module exposes the same public names that scorer.py imports:
  PQ_RESISTANCE_TABLE   -- {component_type: {ALGO_NAME: float}}
  PQC_ALGORITHMS        -- set of PQC name fragments (substring match)
  DEPRECATED_ALGORITHMS -- set of deprecated/broken algorithm names
  HYBRID_ALGORITHMS     -- set of hybrid KEX / hybrid-signature names
"""

import os
import logging
import time
from typing import Dict, Set

logger = logging.getLogger(__name__)

ES_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
ALGO_INDEX = "crypto-algorithm-scores"
CACHE_TTL_SECONDS = 300  # safety-net: force reload every 5 min even without a version bump
CACHE_VERSION_INDEX = "crypto-config"
CACHE_VERSION_DOC_ID = "algorithm-scores-version"

_last_loaded: float = 0.0  # unix timestamp of last successful ES load


def _build_tables_from_es() -> tuple:
    """
    Query Elasticsearch and return (resistance_table, pqc_set, deprecated_set, hybrid_set).
    Raises on failure — caller decides what to do.
    """
    try:
        from elasticsearch import Elasticsearch
        es = Elasticsearch([ES_URL], request_timeout=5)
        result = es.search(
            index=ALGO_INDEX,
            query={"term": {"active": True}},
            size=10000,
        )
        hits = result.get("hits", {}).get("hits", [])

        resistance_table: Dict[str, Dict[str, float]] = {
            "kex": {}, "signature": {}, "symmetric": {}, "hash": {}, "protocol": {}
        }
        pqc_set: Set[str] = set()
        deprecated_set: Set[str] = set()
        hybrid_set: Set[str] = set()

        for hit in hits:
            src = hit["_source"]
            name = src.get("algorithm", "").upper()
            comp = src.get("component_type", "").lower()
            score = float(src.get("base_score", 0))
            tags = src.get("tags", [])

            if comp in resistance_table:
                resistance_table[comp][name] = score

            if "pqc_nist" in tags or "pqc" in tags:
                pqc_set.add(name)
            if "deprecated" in tags or src.get("resistance") == "deprecated":
                deprecated_set.add(name)
            if "hybrid" in tags:
                hybrid_set.add(name)

        loaded = sum(len(v) for v in resistance_table.values())
        logger.info(
            "Loaded %d algorithm scores from ES (%d PQC, %d deprecated, %d hybrid)",
            loaded, len(pqc_set), len(deprecated_set), len(hybrid_set)
        )
        return resistance_table, pqc_set, deprecated_set, hybrid_set

    except Exception as e:
        logger.error("Failed to load algorithm scores from ES: %s", e)
        raise


# ── Module-level tables (mutable in-place so all existing references stay valid) ──
PQ_RESISTANCE_TABLE: Dict[str, Dict[str, float]] = {
    "kex": {}, "signature": {}, "symmetric": {}, "hash": {}, "protocol": {}
}
PQC_ALGORITHMS: Set[str] = set()
DEPRECATED_ALGORITHMS: Set[str] = set()
HYBRID_ALGORITHMS: Set[str] = set()


def _apply(rt, pqc, dep, hyb) -> None:
    """Update module-level tables IN PLACE so all existing references see new data."""
    global _last_loaded
    for k in list(PQ_RESISTANCE_TABLE.keys()):
        PQ_RESISTANCE_TABLE[k].clear()
    for comp, algos in rt.items():
        PQ_RESISTANCE_TABLE.setdefault(comp, {}).update(algos)
    PQC_ALGORITHMS.clear()
    PQC_ALGORITHMS.update(pqc)
    DEPRECATED_ALGORITHMS.clear()
    DEPRECATED_ALGORITHMS.update(dep)
    HYBRID_ALGORITHMS.clear()
    HYBRID_ALGORITHMS.update(hyb)
    _last_loaded = time.time()


def _maybe_reload() -> None:
    """
    Check the ES version marker before every scan.
    - If the marker's last_modified is newer than our last load → reload immediately.
    - If the cache is older than CACHE_TTL_SECONDS (safety net) → reload regardless.
    This means UI edits propagate to the very next scan, with no wait.
    """
    try:
        from elasticsearch import Elasticsearch
        es = Elasticsearch([ES_URL], request_timeout=3)
        doc = es.get(index=CACHE_VERSION_INDEX, id=CACHE_VERSION_DOC_ID)
        es_version: float = float(doc["_source"].get("last_modified", 0.0))
        scores_changed = es_version > _last_loaded
    except Exception:
        es_version = 0.0
        scores_changed = False

    cache_stale = time.time() - _last_loaded >= CACHE_TTL_SECONDS

    if not (scores_changed or cache_stale):
        return

    reason = "scores changed via UI" if scores_changed else "TTL safety-net"
    try:
        _apply(*_build_tables_from_es())
        logger.info("Algorithm cache refreshed (%s)", reason)
    except Exception as exc:
        logger.warning("Cache refresh failed (%s) — keeping existing cache", exc)


def reload_tables() -> None:
    """Force an immediate reload from ES (called by /api/algorithms/_reload-cache)."""
    _apply(*_build_tables_from_es())


# ── Initial load at import time ───────────────────────────────────────────────
try:
    _apply(*_build_tables_from_es())
except Exception as exc:
    logger.error(
        "CRITICAL: Could not load algorithm scores from ES at startup: %s. "
        "Scoring tables are EMPTY — start ES and restart this service.", exc
    )

"""
ELK Handler for Crypto Scanner
================================
Replaces db-service (SQLite) for domain scan storage.
All domain scan states are pushed directly to Elasticsearch
via the elk-indexer service.  Same request_id = same ES doc ID,
so each status update simply overwrites the previous record
(submitted -> in_progress -> completed / failed).

Status flow:
  submitted   - scan was triggered (pre-DNS)
  in_progress - scanner is actively running (post-DNS, pre-result)
  completed   - scan finished with full result
  failed      - scan encountered an unrecoverable error
"""
import os
import logging
import time
from datetime import datetime
from typing import Dict, Any, Optional, List

import httpx

logger = logging.getLogger(__name__)


class ElkHandler:
    """Direct Elasticsearch storage for domain scans via elk-indexer/elk-query-api."""

    def __init__(self):
        self.indexer_url = os.getenv("ELK_INDEXER_URL", "http://elk-indexer:9100")
        self.query_url   = os.getenv("ELK_QUERY_URL",   "http://elk-query-api:9101")
        self.enabled     = False
        self._last_check: float = 0.0
        self._retry_interval   = 30.0

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #
    async def _ensure_connected(self) -> bool:
        """Lazy health-check with 30-second cooldown on failures."""
        if self.enabled:
            return True
        now = time.monotonic()
        if now - self._last_check < self._retry_interval:
            return False
        self._last_check = now
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                r = await c.get(f"{self.indexer_url}/health")
                if r.status_code == 200:
                    self.enabled = True
                    logger.info("✅ elk-indexer is available")
                    return True
        except Exception as e:
            logger.warning(f"elk-indexer health-check failed: {e}")
        self.enabled = False
        return False

    @staticmethod
    def _normalize_url(url: str) -> str:
        """Strip protocol prefix so facebook.com and https://facebook.com hash to the SAME doc key."""
        return url.replace("https://", "").replace("http://", "").rstrip("/").lower()

    async def _index(self, url: str, scan_data: Dict[str, Any]) -> bool:
        """POST to elk-indexer /index/domain (upserts via stable scan_id)."""
        # Normalize to bare hostname — ensures submitted/in_progress/completed all
        # hit the SAME Elasticsearch document regardless of whether the URL has a
        # protocol prefix or not.
        normalized_url = self._normalize_url(url)
        if not await self._ensure_connected():
            logger.warning(f"elk-indexer unavailable, skipping index for {url}")
            return False
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.post(
                    f"{self.indexer_url}/index/domain",
                    json={"url": normalized_url, "scan_data": scan_data},
                )
                if r.status_code == 200:
                    return True
                logger.warning(f"elk-indexer {r.status_code}: {r.text[:200]}")
        except Exception as e:
            logger.warning(f"elk-indexer POST failed: {e}")
            self.enabled = False
        return False

    # ------------------------------------------------------------------ #
    # Public API — status lifecycle methods
    # ------------------------------------------------------------------ #
    async def save_submitted(self, domain: str, request_id: str) -> bool:
        """Write 'submitted' record immediately when a scan is triggered."""
        return await self._index(domain, {
            "request_id":   request_id,
            "url":          domain,
            "status":       "submitted",
            "scan_status":  "submitted",
            "scan_type":    "crypto_audit",
            "requested_at": datetime.now().isoformat(),
            "raw_response": {"domain": domain, "scan_status": "submitted"},
        })

    async def save_in_progress(self, domain: str, request_id: str, requested_at: str) -> bool:
        """Write 'in_progress' record when the TLS scanner starts."""
        return await self._index(domain, {
            "request_id":   request_id,
            "url":          domain,
            "status":       "in_progress",
            "scan_status":  "in_progress",
            "scan_type":    "crypto_audit",
            "requested_at": requested_at,
            "raw_response": {"domain": domain, "scan_status": "in_progress"},
        })

    async def save_completed(self, result: Dict[str, Any]) -> bool:
        """Write the full completed scan result."""
        domain = result.get("url", "")
        return await self._index(domain, {
            "request_id":             result.get("request_id"),
            "url":                    domain,
            "status":                 "completed",
            "scan_status":            "completed",
            "scan_type":              "crypto_audit",
            "requested_at":           result.get("requested_at"),
            "completed_at":           result.get("completed_at") or datetime.now().isoformat(),
            "execution_time_seconds": result.get("execution_time_seconds", 0),
            "pqc_overall_score":      result.get("pqc_overall_score", 0),
            "pqc_overall_grade":      result.get("pqc_overall_grade", "F"),
            "pqc_quantum_ready":      result.get("pqc_quantum_ready", False),
            "pqc_hybrid_ready":       result.get("pqc_hybrid_ready", False),
            "pqc_security_level":     result.get("pqc_security_level"),
            "tls_version":            result.get("tls_version"),
            "error_message":          result.get("error_message"),
            "raw_response":           result.get("raw_response", {}),
        })

    async def save_failed(self, domain: str, error_message: str, request_id: str) -> bool:
        """Write 'failed' record."""
        return await self._index(domain, {
            "request_id":    request_id,
            "url":           domain,
            "status":        "failed",
            "scan_status":   "failed",
            "scan_type":     "crypto_audit",
            "requested_at":  datetime.now().isoformat(),
            "error_message": error_message,
            "raw_response":  {"domain": domain, "scan_status": "failed", "error": error_message},
        })

    # Legacy alias used in existing code paths
    async def save_failed_scan(self, domain: str, error_message: str, request_id: str) -> bool:
        return await self.save_failed(domain, error_message, request_id)

    # Legacy alias for pending (used by some callers)
    async def save_pending_scan(self, domain: str, request_id: str) -> bool:
        return await self.save_submitted(domain, request_id)

    # ------------------------------------------------------------------ #
    # Read API — queries elk-query-api
    # ------------------------------------------------------------------ #
    async def get_results(
        self,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict]:
        """Fetch domain scan results from elk-query-api."""
        try:
            size = min(limit + offset, 1000)
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.get(
                    f"{self.query_url}/api/elk/results/all",
                    params={"type": "domain", "size": size},
                )
                if r.status_code == 200:
                    data = r.json()
                    results = data.get("results", [])
                    if status:
                        results = [
                            x for x in results
                            if (x.get("scan_status") or x.get("status") or "").lower() == status.lower()
                        ]
                    return [_elk_to_api(x) for x in results[offset: offset + limit]]
        except Exception as e:
            logger.warning(f"elk-query-api get_results failed: {e}")
        return []

    async def get_scan_by_url(self, url: str) -> Optional[Dict]:
        """Get latest scan for a URL from elk-query-api."""
        try:
            asset_id = f"domain:{url}"
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(f"{self.query_url}/api/elk/asset/{asset_id}")
                if r.status_code == 200:
                    return _elk_to_api(r.json())
        except Exception as e:
            logger.warning(f"elk get_scan_by_url failed: {e}")
        return None

    async def get_scan_by_id(self, *args) -> Optional[Dict]:
        """Stub — numeric IDs are no longer used."""
        return None

    async def search_scans(self, **kwargs) -> List[Dict]:
        """Delegate to get_results with optional filters."""
        return await self.get_results(
            status=kwargs.get("status"),
            limit=kwargs.get("limit", 100),
        )

    # Stubs to satisfy legacy delete/clear endpoints
    async def delete_result_from_db(self, *args) -> bool:
        return False

    async def clear_all_from_db(self, *args) -> Dict:
        return {"deleted_results": 0}

    async def get_statistics(self) -> Dict:
        return {}


# ---------------------------------------------------------------------------
# Helper: map an ELK document back to the legacy "database row" shape that
# the existing REST endpoints and frontend converters expect.
# ---------------------------------------------------------------------------
def _elk_to_api(doc: Dict[str, Any]) -> Dict[str, Any]:
    # doc["raw"] = the full scan_data dict sent to elk-indexer
    # doc["raw"]["raw_response"] = the actual nested data (tls_configuration, pqc_analysis, etc.)
    # We need the INNER raw_response, not the outer scan_data dict.
    raw_outer = doc.get("raw") or {}
    inner_raw = raw_outer.get("raw_response") if isinstance(raw_outer, dict) else None
    # Fall back to doc["raw_response"] if already normalized (e.g. by _normalize_scan_result)
    raw = inner_raw or doc.get("raw_response") or raw_outer or {}
    return {
        "request_id":             doc.get("request_id"),
        "id":                     None,  # no numeric ID for ELK scans
        "url":                    doc.get("url") or doc.get("asset_label"),
        "status":                 doc.get("scan_status") or doc.get("status"),
        "scan_status":            doc.get("scan_status") or doc.get("status"),
        "scan_type":              doc.get("scan_type", "crypto_audit"),
        "requested_at":           doc.get("requested_at") or doc.get("scanned_at"),
        "completed_at":           doc.get("completed_at"),
        "created_at":             doc.get("requested_at") or doc.get("scanned_at"),
        "execution_time_seconds": doc.get("execution_time_seconds"),
        "pqc_overall_score":      doc.get("pqc_overall_score"),
        "pqc_overall_grade":      doc.get("pqc_overall_grade"),
        "error_message":          doc.get("error_message"),
        "raw_response":           raw,
        # Flatten common TLS fields for legacy consumers
        "tls_version":            raw.get("tls_version"),
        "public_key_size_bits":   raw.get("public_key_size_bits"),
        "public_key_algorithm":   raw.get("public_key_algorithm"),
        "cert_subject":           raw.get("cert_subject"),
        "cert_issuer":            raw.get("cert_issuer"),
        "pqc_analysis":           raw.get("pqc_analysis"),
    }

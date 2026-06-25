"""
ELK Indexer Service
====================
Writes scan results (domain / repo / asset) into Elasticsearch as immutable
documents for audit trail and trend analytics.

Indices:
  - crypto-scans-domain   (TLS / domain scan results)
  - crypto-scans-repo     (repository scan results)
  - crypto-scans-asset    (system / agent scan results)

Each document is APPEND-ONLY. Every rescan = new document.
Stable `asset_id` allows grouping for trend lines.
"""
import os
import logging
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from elasticsearch import Elasticsearch, NotFoundError

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("elk-indexer")

ES_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
es = Elasticsearch(ES_URL, request_timeout=30)

app = FastAPI(title="ELK Indexer Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Index names + mappings
# ---------------------------------------------------------------------------
INDEX_DOMAIN = "crypto-scans-domain"
INDEX_REPO = "crypto-scans-repo"
INDEX_ASSET = "crypto-scans-asset"

COMMON_MAPPING_PROPS = {
    "scan_id": {"type": "keyword"},
    "asset_id": {"type": "keyword"},
    "asset_type": {"type": "keyword"},          # "domain" | "repo" | "asset"
    "asset_label": {"type": "keyword"},         # human-readable name
    "organization_id": {"type": "keyword"},
    "scanned_at": {"type": "date"},
    "ingested_at": {"type": "date"},
    "quantum_ready": {"type": "boolean"},
    "quantum_readiness_percentage": {"type": "float"},
    "overall_grade": {"type": "keyword"},
    "overall_score": {"type": "float"},
    "vulnerabilities_count": {"type": "integer"},
    "raw": {"type": "object", "enabled": True},  # full source JSON
}

INDEX_MAPPINGS = {
    INDEX_DOMAIN: {
        "mappings": {
            "properties": {
                **COMMON_MAPPING_PROPS,
                "url": {"type": "keyword"},
                "status": {"type": "keyword"},
                "pqc_overall_grade": {"type": "keyword"},
                "pqc_overall_score": {"type": "float"},
            }
        }
    },
    INDEX_REPO: {
        "mappings": {
            "properties": {
                **COMMON_MAPPING_PROPS,
                "repo_url": {"type": "keyword"},
                "branch_name": {"type": "keyword"},
                "quantum_safe_count": {"type": "integer"},
                "quantum_vulnerable_count": {"type": "integer"},
            }
        }
    },
    INDEX_ASSET: {
        "mappings": {
            "properties": {
                **COMMON_MAPPING_PROPS,
                "agent_id": {"type": "keyword"},
                "task_id": {"type": "keyword"},
                "os_info": {"type": "keyword"},
                "computer_name": {"type": "keyword"},
                "fips_mode_enabled": {"type": "boolean"},
            }
        }
    },
}


def ensure_indices():
    """Create indices with mappings if they don't exist."""
    for index_name, body in INDEX_MAPPINGS.items():
        try:
            if not es.indices.exists(index=index_name):
                es.indices.create(index=index_name, body=body)
                logger.info(f"Created index: {index_name}")
            else:
                logger.info(f"Index already exists: {index_name}")
        except Exception as e:
            logger.error(f"Failed to ensure index {index_name}: {e}")


@app.on_event("startup")
async def startup():
    """Wait for ES and create indices."""
    import time
    for attempt in range(30):
        try:
            if es.ping():
                logger.info(f"Connected to Elasticsearch at {ES_URL}")
                ensure_indices()
                return
        except Exception as e:
            logger.warning(f"ES not ready (attempt {attempt+1}/30): {e}")
        time.sleep(2)
    logger.error("Could not connect to Elasticsearch after 60s")


# ---------------------------------------------------------------------------
# Request models (flexible — accept the raw scan JSON)
# ---------------------------------------------------------------------------
class DomainScanIngest(BaseModel):
    """Domain / TLS scan result."""
    url: str
    organization_id: Optional[str] = "default"
    scan_data: Dict[str, Any] = Field(default_factory=dict)


class RepoScanIngest(BaseModel):
    """Repository scan result."""
    repo_url: str
    branch_name: Optional[str] = "main"
    organization_id: Optional[str] = "default"
    scan_data: Dict[str, Any] = Field(default_factory=dict)


class AssetScanIngest(BaseModel):
    """Asset / system scan result."""
    agent_id: str
    task_id: str
    organization_id: Optional[str] = "default"
    scan_data: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def make_scan_id(asset_id: str, scanned_at: datetime) -> str:
    """Deterministic id: same asset+timestamp => same doc (idempotent)."""
    payload = f"{asset_id}|{scanned_at.isoformat()}"
    return hashlib.sha256(payload.encode()).hexdigest()[:24]


def _extract_audit_vulns(audit_results: Dict[str, Any]) -> int:
    """Count weaknesses from a Windows/Linux audit_results dict."""
    if not isinstance(audit_results, dict):
        return 0
    count = 0
    try:
        # Weak crypto providers
        providers = audit_results.get("cryptoapi_info", {}).get("cryptographic_providers", {}).get("providers", [])
        for p in providers if isinstance(providers, list) else []:
            name = (p if isinstance(p, str) else p.get("provider_name", "")) or ""
            if any(w in name for w in ("RSA", "MD5", "SHA1")) and "RSA-PSS" not in name:
                count += 1
        # Weak ciphers
        ciphers = audit_results.get("tls_ssl_configuration", {}).get("cipher_suites", {}).get("cipher_details", [])
        for c in ciphers if isinstance(ciphers, list) else []:
            name = (c.get("name") if isinstance(c, dict) else c) or ""
            if any(w in name for w in ("DES", "RC4", "NULL", "EXPORT")):
                count += 1
        # FIPS check
        if not audit_results.get("cryptoapi_info", {}).get("fips_mode_enabled", True):
            count += 1
    except Exception as e:
        logger.warning(f"Could not extract vulns: {e}")
    return count


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    try:
        return {"status": "ok", "elasticsearch": es.ping()}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}


@app.post("/index/domain")
def index_domain(payload: DomainScanIngest):
    """Index a domain/TLS scan result."""
    try:
        scan = payload.scan_data
        now = datetime.now(timezone.utc)
        asset_id = f"domain:{payload.url}"
        scan_id = make_scan_id(asset_id, now)

        doc = {
            "scan_id": scan_id,
            "asset_id": asset_id,
            "asset_type": "domain",
            "asset_label": payload.url,
            "organization_id": payload.organization_id,
            "scanned_at": scan.get("scanned_at") or now.isoformat(),
            "ingested_at": now.isoformat(),
            "url": payload.url,
            "status": scan.get("status", "unknown"),
            "pqc_overall_grade": scan.get("pqc_overall_grade"),
            "pqc_overall_score": scan.get("pqc_overall_score"),
            "overall_grade": scan.get("pqc_overall_grade"),
            "overall_score": scan.get("pqc_overall_score"),
            "quantum_ready": bool(scan.get("quantum_ready", False)),
            "quantum_readiness_percentage": float(scan.get("pqc_overall_score") or 0),
            "vulnerabilities_count": 1 if not scan.get("quantum_ready") else 0,
            "raw": scan,
        }
        es.index(index=INDEX_DOMAIN, id=scan_id, document=doc)
        logger.info(f"Indexed domain scan: {payload.url} → {scan_id}")
        return {"success": True, "scan_id": scan_id, "asset_id": asset_id}
    except Exception as e:
        logger.exception("Failed to index domain scan")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/index/repo")
def index_repo(payload: RepoScanIngest):
    """Index a repository scan result."""
    try:
        scan = payload.scan_data
        now = datetime.now(timezone.utc)
        asset_id = f"repo:{payload.repo_url}"
        scan_id = make_scan_id(asset_id, now)

        readiness = float(scan.get("quantum_readiness_percentage") or 0)
        doc = {
            "scan_id": scan_id,
            "asset_id": asset_id,
            "asset_type": "repo",
            "asset_label": payload.repo_url.rsplit("/", 1)[-1],
            "organization_id": payload.organization_id,
            "scanned_at": scan.get("scanned_at") or now.isoformat(),
            "ingested_at": now.isoformat(),
            "repo_url": payload.repo_url,
            "branch_name": payload.branch_name,
            "overall_grade": scan.get("overall_grade"),
            "overall_score": scan.get("overall_security_score"),
            "quantum_ready": readiness >= 80,
            "quantum_readiness_percentage": readiness,
            "quantum_safe_count": int(scan.get("quantum_safe_count") or 0),
            "quantum_vulnerable_count": int(scan.get("quantum_vulnerable_count") or 0),
            "vulnerabilities_count": int(scan.get("quantum_vulnerable_count") or 0),
            "raw": scan,
        }
        es.index(index=INDEX_REPO, id=scan_id, document=doc)
        logger.info(f"Indexed repo scan: {payload.repo_url} → {scan_id}")
        return {"success": True, "scan_id": scan_id, "asset_id": asset_id}
    except Exception as e:
        logger.exception("Failed to index repo scan")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/index/asset")
def index_asset(payload: AssetScanIngest):
    """Index a system / asset scan result."""
    try:
        scan = payload.scan_data
        now = datetime.now(timezone.utc)
        asset_id = f"asset:{payload.agent_id}"
        scan_id = make_scan_id(asset_id, now)

        audit = scan.get("audit_results") or scan
        sys_ctx = audit.get("system_context", {}) if isinstance(audit, dict) else {}
        crypto_api = audit.get("cryptoapi_info", {}) if isinstance(audit, dict) else {}

        vulns = _extract_audit_vulns(audit if isinstance(audit, dict) else {})
        pqc_score_raw = audit.get("pqc_score", {}).get("overall_score") if isinstance(audit, dict) else None
        try:
            pqc_score = float(pqc_score_raw) if pqc_score_raw not in (None, "N/A") else 0.0
        except (TypeError, ValueError):
            pqc_score = 0.0

        doc = {
            "scan_id": scan_id,
            "asset_id": asset_id,
            "asset_type": "asset",
            "asset_label": sys_ctx.get("computer_name") or payload.agent_id[:8],
            "organization_id": payload.organization_id,
            "scanned_at": scan.get("scanned_at") or now.isoformat(),
            "ingested_at": now.isoformat(),
            "agent_id": payload.agent_id,
            "task_id": payload.task_id,
            "os_info": sys_ctx.get("os_info"),
            "computer_name": sys_ctx.get("computer_name"),
            "fips_mode_enabled": bool(crypto_api.get("fips_mode_enabled", False)),
            "overall_score": pqc_score,
            "quantum_readiness_percentage": pqc_score,
            "quantum_ready": pqc_score >= 80,
            "vulnerabilities_count": vulns,
            "raw": scan,
        }
        es.index(index=INDEX_ASSET, id=scan_id, document=doc)
        logger.info(f"Indexed asset scan: {payload.agent_id} → {scan_id}")
        return {"success": True, "scan_id": scan_id, "asset_id": asset_id}
    except Exception as e:
        logger.exception("Failed to index asset scan")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/reindex-indices")
def reindex_indices():
    """Drop & recreate indices (DESTRUCTIVE — use only in dev)."""
    for index_name in INDEX_MAPPINGS:
        try:
            es.indices.delete(index=index_name)
        except NotFoundError:
            pass
    ensure_indices()
    return {"success": True, "message": "Indices recreated"}

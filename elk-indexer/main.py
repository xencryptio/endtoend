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
import json as _json
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from elasticsearch import Elasticsearch, NotFoundError

# ---------------------------------------------------------------------------
# Timezone: ALL timestamps stored in ELK are normalised to IST (UTC+05:30).
# This matches the rest of the platform (system-scanner already uses IST).
# ---------------------------------------------------------------------------
IST = timezone(timedelta(hours=5, minutes=30))


def ist_now() -> datetime:
    return datetime.now(IST)


def to_ist_iso(value: Any) -> Optional[str]:
    """Normalise any incoming timestamp to an IST ISO-8601 string.

    Accepts datetime objects, ISO strings (with or without tz), or None.
    Naive timestamps are assumed to already be in IST (matches our sources).
    """
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            # Handle trailing Z
            v = value.replace("Z", "+00:00")
            dt = datetime.fromisoformat(v)
        except ValueError:
            return value  # opaque — store as-is
    else:
        return str(value)

    if dt.tzinfo is None:
        # Naive datetimes from our Postgres sources are wall-clock IST
        dt = dt.replace(tzinfo=IST)
    else:
        dt = dt.astimezone(IST)
    return dt.isoformat()

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
    "source_id": {"type": "keyword"},           # stable id from source DB (Postgres row)
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
    # `raw` holds the full original scan JSON. We disable indexing on it so
    # huge / dynamic payloads (e.g. repo scans with hundreds of algorithm keys)
    # don't blow past Elasticsearch's 1000-field mapping limit. The data is
    # still stored and returned in _source — only field-level search inside
    # `raw` is disabled. Top-level fields above remain fully searchable.
    "raw": {"type": "object", "enabled": False},
}

# Per-index settings: lift dynamic-field cap as a safety net even though `raw`
# is now non-indexed. This protects us if a future mapping change adds depth.
DEFAULT_INDEX_SETTINGS = {
    "settings": {
        "index.mapping.total_fields.limit": 5000,
    }
}

INDEX_MAPPINGS = {
    INDEX_DOMAIN: {
        **DEFAULT_INDEX_SETTINGS,
        "mappings": {
            "properties": {
                **COMMON_MAPPING_PROPS,
                # Identity & request
                "url": {"type": "keyword"},
                "request_id": {"type": "keyword"},
                "status": {"type": "keyword"},
                "scan_status": {"type": "keyword"},
                "scan_type": {"type": "keyword"},
                # Timing
                "requested_at": {"type": "date"},
                "completed_at": {"type": "date"},
                "execution_time_seconds": {"type": "float"},
                # PQC scoring
                "pqc_overall_grade": {"type": "keyword"},
                "pqc_overall_score": {"type": "float"},
                "pqc_security_level": {"type": "keyword"},
                "pqc_quantum_ready": {"type": "boolean"},
                "pqc_hybrid_ready": {"type": "boolean"},
                "original_pqc_score": {"type": "float"},
                "original_pqc_grade": {"type": "keyword"},
                # TLS
                "tls_version": {"type": "keyword"},
                "supported_protocols": {"type": "keyword"},
                "deprecated_protocols": {"type": "keyword"},
                "primary_cipher_suite": {"type": "keyword"},
                "kex_score": {"type": "float"},
                "kex_grade": {"type": "keyword"},
                "kex_best_algorithm": {"type": "keyword"},
                "kex_pqc_percentage": {"type": "float"},
                "symmetric_score": {"type": "float"},
                "symmetric_grade": {"type": "keyword"},
                "signature_score": {"type": "float"},
                "signature_grade": {"type": "keyword"},
                "hash_score": {"type": "float"},
                "hash_grade": {"type": "keyword"},
                # Certificate
                "cert_pqc_score": {"type": "float"},
                "cert_pqc_grade": {"type": "keyword"},
                "cert_is_pqc": {"type": "boolean"},
                "cert_transparency": {"type": "boolean"},
                "cert_subject": {"type": "keyword"},
                "cert_issuer": {"type": "keyword"},
                "cert_serial_number": {"type": "keyword"},
                "cert_not_before": {"type": "date"},
                "cert_not_after": {"type": "date"},
                "primary_signature_algorithm": {"type": "keyword"},
                "primary_hash_algorithm": {"type": "keyword"},
                "public_key_algorithm": {"type": "keyword"},
                "public_key_size_bits": {"type": "integer"},
                # Server hygiene
                "ephemeral_key_exchange": {"type": "boolean"},
                "hsts_enabled": {"type": "boolean"},
                "hsts_max_age": {"type": "integer"},
                "ocsp_stapling_active": {"type": "boolean"},
                "ct_present": {"type": "boolean"},
                "error_message": {"type": "text"},
                # Searchable algorithm lists + per-algorithm rollup for
                # occurrence-weighted / category / deprecated aggregations.
                "algorithm_names": {"type": "keyword"},
                "vulnerable_algorithms": {"type": "keyword"},
                "vulnerabilities_count": {"type": "integer"},
                "algorithm_stats": {
                    "type": "nested",
                    "properties": {
                        "name": {"type": "keyword"},
                        "category": {"type": "keyword"},
                        "algorithm_type": {"type": "keyword"},
                        "quantum_resistance_type": {"type": "keyword"},
                        "source_type": {"type": "keyword"},
                        "security_level": {"type": "keyword"},
                        "occurrences": {"type": "integer"},
                        "quantum_safe": {"type": "boolean"},
                        "is_pqc": {"type": "boolean"},
                        "is_hybrid": {"type": "boolean"},
                        "deprecated": {"type": "boolean"},
                        "grade": {"type": "keyword"},
                        "avg_score": {"type": "float"},
                    },
                },
            }
        }
    },
    INDEX_REPO: {
        **DEFAULT_INDEX_SETTINGS,
        "mappings": {
            "properties": {
                **COMMON_MAPPING_PROPS,
                # Identity
                "repo_url": {"type": "keyword"},
                "repo_hash": {"type": "keyword"},
                "branch_name": {"type": "keyword"},
                "platform": {"type": "keyword"},
                # Status
                "scan_status": {"type": "keyword"},
                "current_status": {"type": "keyword"},
                "last_scanned": {"type": "date"},
                # Counts
                "total_files": {"type": "integer"},
                "total_files_to_scan": {"type": "integer"},
                "total_algorithms": {"type": "integer"},
                "quantum_safe_count": {"type": "integer"},
                "quantum_vulnerable_count": {"type": "integer"},
                "true_pqc_count": {"type": "integer"},
                # Scoring
                "overall_security_score": {"type": "float"},
                # Searchable list of algorithm names (e.g. for KQL: algorithm_names: "RSA")
                "algorithm_names": {"type": "keyword"},
                "vulnerable_algorithms": {"type": "keyword"},
                "findings_count": {"type": "integer"},
                "files_with_findings": {"type": "keyword"},
                # Per-algorithm rollup for occurrence-weighted aggregations
                "algorithm_stats": {
                    "type": "nested",
                    "properties": {
                        "name": {"type": "keyword"},
                        "category": {"type": "keyword"},
                        "quantum_resistance_type": {"type": "keyword"},
                        "occurrences": {"type": "integer"},
                        "findings": {"type": "integer"},
                        "quantum_safe": {"type": "boolean"},
                        "is_pqc": {"type": "boolean"},
                        "deprecated": {"type": "boolean"},
                        "grade": {"type": "keyword"},
                    },
                },
            }
        }
    },
    INDEX_ASSET: {
        **DEFAULT_INDEX_SETTINGS,
        "mappings": {
            "properties": {
                **COMMON_MAPPING_PROPS,
                # Result identity
                "agent_id": {"type": "keyword"},
                "task_id": {"type": "keyword"},
                "result_id": {"type": "keyword"},
                # Agent metadata (from agents table)
                "hostname": {"type": "keyword"},
                "ip_address": {"type": "keyword"},
                "os_info": {"type": "keyword"},
                "organization_name": {"type": "keyword"},
                "suborganization_name": {"type": "keyword"},
                "application_name": {"type": "keyword"},
                "agent_registered_at": {"type": "date"},
                "agent_last_seen": {"type": "date"},
                # Task lifecycle
                "task_status": {"type": "keyword"},
                "task_created_at": {"type": "date"},
                "task_started_at": {"type": "date"},
                "task_completed_at": {"type": "date"},
                # Result envelope
                "received_at": {"type": "date"},
                "submitted_at": {"type": "date"},
                # Audit summary (extracted from audit_results)
                "computer_name": {"type": "keyword"},
                "os_version": {"type": "keyword"},
                "build_number": {"type": "keyword"},
                "architecture": {"type": "keyword"},
                "fips_mode_enabled": {"type": "boolean"},
                "weak_providers_count": {"type": "integer"},
                "weak_ciphers_count": {"type": "integer"},
                "strong_ciphers_count": {"type": "integer"},
                "cipher_suites_total": {"type": "integer"},
                "tls_protocols_enabled": {"type": "keyword"},
                "installed_crypto_software": {"type": "keyword"},
                "installed_crypto_software_count": {"type": "integer"},
                "certificate_stores_count": {"type": "integer"},
                # Full crypto inventory captured from the agent audit
                "crypto_providers": {"type": "keyword"},
                "crypto_providers_count": {"type": "integer"},
                "cipher_hash_algorithms": {"type": "keyword"},
                "cipher_key_exchanges": {"type": "keyword"},
                "registered_oid_algorithms_count": {"type": "integer"},
                # Per-algorithm scoring breakdown (from pqc_score.algorithms),
                # mirrors the repo index so the dashboard can do occurrence-weighted,
                # category and deprecated aggregations for endpoints too.
                "algorithm_stats": {
                    "type": "nested",
                    "properties": {
                        "name": {"type": "keyword"},
                        "category": {"type": "keyword"},
                        "algorithm_type": {"type": "keyword"},
                        "quantum_resistance_type": {"type": "keyword"},
                        "source_type": {"type": "keyword"},
                        "security_level": {"type": "keyword"},
                        "occurrences": {"type": "integer"},
                        "quantum_safe": {"type": "boolean"},
                        "is_pqc": {"type": "boolean"},
                        "deprecated": {"type": "boolean"},
                        "grade": {"type": "keyword"},
                        "avg_score": {"type": "float"},
                    },
                },
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
def make_scan_id(asset_id: str, source_id: Any) -> str:
    """Deterministic id: same asset+source_row => same doc (idempotent).

    `source_id` should be the stable primary key from the source database
    (e.g. Postgres row id, task_id, result_id). This way re-syncing the same
    row always produces the same ES doc id — guaranteeing NO duplicates.
    """
    payload = f"{asset_id}|{source_id}"
    return hashlib.sha256(payload.encode()).hexdigest()[:24]


def _parse_dt(value: Any) -> Optional[str]:
    """Backwards-compat alias — normalise to IST."""
    return to_ist_iso(value)


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


def _kv_field(text: Any, key: str) -> Optional[str]:
    """Extract a value from PowerShell-hashtable-style strings the TLS scanner
    emits, e.g. "@{name=TLS_AES_256_GCM_SHA384; encryption=AES-256-GCM; ...}".
    Returns the value for ``key`` (case-insensitive) or None."""
    if not isinstance(text, str):
        return None
    import re
    m = re.search(rf"{re.escape(key)}\s*=\s*([^;}}]+)", text, re.IGNORECASE)
    return m.group(1).strip() if m else None


def _dn_org(dn: Any) -> Optional[str]:
    """Pull a human-friendly issuer/subject name out of a distinguished name.
    Prefers the O= (organization); falls back to CN=; else the raw string.
    e.g. "CN=WR2,O=Google Trust Services,C=US" -> "Google Trust Services"."""
    if not isinstance(dn, str) or not dn.strip():
        return None
    org = _kv_field(dn.replace(",", ";"), "O")
    if org:
        return org
    cn = _kv_field(dn.replace(",", ";"), "CN")
    return cn or dn.strip()


def _best_tls_version(protocols: Any) -> Optional[str]:
    """Given a list of supported protocols, return the strongest one."""
    order = ["TLS 1.3", "TLS 1.2", "TLS 1.1", "TLS 1.0", "SSL 3.0", "SSL 2.0"]
    if not isinstance(protocols, list):
        return None
    present = {str(p).strip() for p in protocols}
    for v in order:
        if v in present:
            return v
    return next(iter(present), None) if present else None


def _first_cipher_name(tls_cfg: Dict[str, Any]) -> Optional[str]:
    """Return the primary cipher-suite name, preferring TLS 1.3 then TLS 1.2."""
    if not isinstance(tls_cfg, dict):
        return None
    for key in ("tls_1.3_cipher_suites", "tls_1.2_cipher_suites"):
        block = tls_cfg.get(key)
        suites = (block or {}).get("suites") if isinstance(block, dict) else None
        if isinstance(suites, list) and suites:
            first = suites[0]
            name = _kv_field(first, "name") if isinstance(first, str) else (
                first.get("name") if isinstance(first, dict) else None
            )
            if name:
                return name
    return None


def _extract_hsts_ocsp(rr: Dict[str, Any]):
    """HSTS + OCSP-stapling are collected by the scanner but land in
    ``scanner_report.endpoints[].details`` (SSL-Labs shape), not in the
    ``security_features`` block the scorer reads — so they always defaulted to
    False. Pull the real signals straight from the scanner report.
    Returns (hsts_enabled, hsts_max_age, ocsp_stapling_active)."""
    report = rr.get("scanner_report") if isinstance(rr.get("scanner_report"), dict) else {}
    endpoints = report.get("endpoints") if isinstance(report.get("endpoints"), list) else []
    hsts_enabled = None
    hsts_max_age = None
    ocsp = None
    for ep in endpoints:
        details = (ep or {}).get("details") if isinstance(ep, dict) else None
        if not isinstance(details, dict):
            continue
        policy = details.get("hstsPolicy") if isinstance(details.get("hstsPolicy"), dict) else {}
        status = policy.get("status")
        if status is not None and hsts_enabled is None:
            hsts_enabled = str(status).lower().startswith("present")
            hsts_max_age = policy.get("maxAge")
        if "ocspStapling" in details and ocsp is None:
            ocsp = bool(details.get("ocspStapling"))
        if hsts_enabled is not None and ocsp is not None:
            break
    return hsts_enabled, hsts_max_age, ocsp


def _build_domain_algorithm_stats(algorithm_scores: Any) -> List[Dict[str, Any]]:
    """Aggregate pqc_analysis.algorithm_scores (flat list with repeats) into a
    nested per-algorithm rollup, mirroring the repo/asset indices so the
    dashboard can do occurrence-weighted / category / deprecated aggregations."""
    agg: Dict[str, Dict[str, Any]] = {}
    if not isinstance(algorithm_scores, list):
        return []
    for a in algorithm_scores:
        if not isinstance(a, dict):
            continue
        aname = (a.get("algorithm") or a.get("name") or "").strip()
        if not aname:
            continue
        ctx = a.get("context") if isinstance(a.get("context"), dict) else {}
        entry = agg.get(aname)
        if entry is None:
            entry = {
                "name": aname,
                "category": a.get("category") or a.get("algorithm_type"),
                "algorithm_type": a.get("algorithm_type"),
                "quantum_resistance_type": a.get("quantum_safety_reason") or a.get("resistance"),
                "source_type": ctx.get("source"),
                "security_level": a.get("security_level"),
                "occurrences": 0,
                "quantum_safe": bool(a.get("quantum_safe", False)),
                "is_pqc": bool(a.get("is_pqc", False)),
                "is_hybrid": bool(a.get("is_hybrid", False)),
                "deprecated": bool(a.get("deprecated", False)),
                "grade": a.get("grade"),
                "_score_sum": 0.0,
            }
            agg[aname] = entry
        entry["occurrences"] += 1
        try:
            entry["_score_sum"] += float(a.get("final_score") or 0.0)
        except (TypeError, ValueError):
            pass
        entry["deprecated"] = entry["deprecated"] or bool(a.get("deprecated", False))
        entry["is_pqc"] = entry["is_pqc"] or bool(a.get("is_pqc", False))
    out: List[Dict[str, Any]] = []
    for entry in agg.values():
        occ = entry.pop("occurrences")
        score_sum = entry.pop("_score_sum")
        entry["occurrences"] = occ
        entry["avg_score"] = round(score_sum / occ, 2) if occ else 0.0
        out.append(entry)
    return out


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
    """Index a domain/TLS scan result with FULL field parity to Postgres."""
    try:
        scan = payload.scan_data
        now_ist = ist_now()
        asset_id = f"domain:{payload.url}"

        # Stable source identity — Postgres row id from scan-service
        source_id = scan.get("id") or scan.get("request_id") or scan.get("scan_id")
        if not source_id:
            logger.warning(f"Skipping domain scan for {payload.url}: no stable source id")
            return {"success": False, "reason": "missing source id"}

        scan_id = make_scan_id(asset_id, source_id)

        scanned_at = (
            to_ist_iso(scan.get("completed_at"))
            or to_ist_iso(scan.get("requested_at"))
            or to_ist_iso(scan.get("created_at"))
            or to_ist_iso(scan.get("scanned_at"))
            or now_ist.isoformat()
        )

        pqc_score = float(scan.get("pqc_overall_score") or 0)
        quantum_ready = bool(scan.get("pqc_quantum_ready") or scan.get("quantum_ready") or False)

        # ---- Deep extraction from raw_response ---------------------------------
        # The scan-service produces a rich `raw_response`, but the top-level
        # shortcut fields (primary_cipher_suite, cert_issuer, public_key_algorithm,
        # hsts_enabled, ...) come through empty. Pull the real values from the
        # nested payload so the domain dashboard has data to aggregate.
        rr = scan.get("raw_response") if isinstance(scan.get("raw_response"), dict) else {}
        tls_cfg = rr.get("tls_configuration") if isinstance(rr.get("tls_configuration"), dict) else {}
        cert_chain = rr.get("certificate_chain") if isinstance(rr.get("certificate_chain"), dict) else {}
        leaf = cert_chain.get("leaf_certificate") if isinstance(cert_chain.get("leaf_certificate"), dict) else {}
        pa = rr.get("pqc_analysis") if isinstance(rr.get("pqc_analysis"), dict) else {}
        sec = pa.get("security_features") if isinstance(pa.get("security_features"), dict) else {}
        proto = pa.get("protocol_analysis") if isinstance(pa.get("protocol_analysis"), dict) else {}
        comps = pa.get("components") if isinstance(pa.get("components"), dict) else {}

        supported_protocols = (
            tls_cfg.get("supported_protocols")
            or proto.get("supported_versions")
            or scan.get("supported_protocols")
        )
        deprecated_protocols = proto.get("deprecated_versions") or []
        tls_version = scan.get("tls_version") or _best_tls_version(supported_protocols)
        primary_cipher_suite = scan.get("primary_cipher_suite") or _first_cipher_name(tls_cfg)
        cert_issuer = _dn_org(leaf.get("issuer")) or scan.get("cert_issuer")
        cert_subject = leaf.get("subject") or scan.get("cert_subject")
        public_key_algorithm = leaf.get("public_key_algorithm") or scan.get("public_key_algorithm")
        public_key_size_bits = leaf.get("public_key_size") or scan.get("public_key_size_bits")
        ct_present = leaf.get("certificate_transparency")
        if ct_present is None:
            ct_present = scan.get("ct_present")
        pfs = sec.get("pfs_supported")
        if pfs is None:
            pfs = scan.get("ephemeral_key_exchange")
        # HSTS + OCSP live in scanner_report.endpoints[].details (SSL-Labs shape),
        # not in security_features — the scorer misses them, so read them here.
        hsts_from_report, hsts_max_age, ocsp_from_report = _extract_hsts_ocsp(rr)
        hsts_enabled = hsts_from_report
        if hsts_enabled is None:
            hsts_enabled = sec.get("hsts_enabled")
        if hsts_enabled is None:
            hsts_enabled = scan.get("hsts_enabled")
        ocsp_stapling_active = ocsp_from_report
        if ocsp_stapling_active is None:
            ocsp_stapling_active = scan.get("ocsp_stapling_active")

        def _comp(name: str, key: str, default=None):
            c = comps.get(name) if isinstance(comps.get(name), dict) else {}
            return c.get(key, default)

        algorithm_stats = _build_domain_algorithm_stats(pa.get("algorithm_scores"))
        pqc_algorithm_names = sorted({s["name"] for s in algorithm_stats})
        vulnerable_algorithms = sorted({
            s["name"] for s in algorithm_stats if s.get("deprecated") or (s.get("avg_score") or 0) < 40
        })

        doc = {
            # Common
            "scan_id": scan_id,
            "asset_id": asset_id,
            "asset_type": "domain",
            "asset_label": payload.url,
            "organization_id": payload.organization_id,
            "source_id": str(source_id),
            "scanned_at": scanned_at,
            "ingested_at": now_ist.isoformat(),
            # Identity & request
            "url": payload.url,
            "request_id": scan.get("request_id"),
            "status": scan.get("status"),
            "scan_status": scan.get("scan_status"),
            "scan_type": scan.get("scan_type"),
            # Timing
            "requested_at": to_ist_iso(scan.get("requested_at")),
            "completed_at": to_ist_iso(scan.get("completed_at")),
            "execution_time_seconds": scan.get("execution_time_seconds"),
            # PQC scoring
            "pqc_overall_grade": scan.get("pqc_overall_grade") or pa.get("overall_grade"),
            "pqc_overall_score": scan.get("pqc_overall_score") if scan.get("pqc_overall_score") is not None else pa.get("overall_score"),
            "pqc_security_level": scan.get("pqc_security_level") or pa.get("security_level"),
            "pqc_quantum_ready": scan.get("pqc_quantum_ready") if scan.get("pqc_quantum_ready") is not None else pa.get("quantum_ready"),
            "pqc_hybrid_ready": scan.get("pqc_hybrid_ready") if scan.get("pqc_hybrid_ready") is not None else pa.get("hybrid_ready"),
            "original_pqc_score": scan.get("original_pqc_score"),
            "original_pqc_grade": scan.get("original_pqc_grade"),
            "overall_grade": scan.get("pqc_overall_grade") or pa.get("overall_grade"),
            "overall_score": pqc_score or float(pa.get("overall_score") or 0),
            "quantum_ready": quantum_ready or bool(pa.get("quantum_ready") or False),
            "quantum_readiness_percentage": pqc_score or float(pa.get("overall_score") or 0),
            # TLS
            "tls_version": tls_version,
            "supported_protocols": supported_protocols,
            "deprecated_protocols": deprecated_protocols,
            "primary_cipher_suite": primary_cipher_suite,
            "kex_score": scan.get("kex_score") if scan.get("kex_score") is not None else _comp("kex", "score"),
            "kex_grade": scan.get("kex_grade") or _comp("kex", "grade"),
            "kex_best_algorithm": _comp("kex", "best_algorithm"),
            "kex_pqc_percentage": _comp("kex", "pqc_percentage"),
            "symmetric_score": _comp("symmetric", "score"),
            "symmetric_grade": _comp("symmetric", "grade"),
            "signature_score": _comp("signature", "score"),
            "signature_grade": _comp("signature", "grade"),
            "hash_score": _comp("hash", "score"),
            "hash_grade": _comp("hash", "grade"),
            # Certificate
            "cert_pqc_score": scan.get("cert_pqc_score"),
            "cert_pqc_grade": scan.get("cert_pqc_grade"),
            "cert_is_pqc": scan.get("cert_is_pqc"),
            "cert_transparency": ct_present,
            "cert_subject": cert_subject,
            "cert_issuer": cert_issuer,
            "cert_serial_number": scan.get("cert_serial_number"),
            "cert_not_before": to_ist_iso(leaf.get("valid_from") or scan.get("cert_not_before")),
            "cert_not_after": to_ist_iso(leaf.get("valid_until") or scan.get("cert_not_after")),
            "primary_signature_algorithm": scan.get("primary_signature_algorithm") or _comp("signature", "best_algorithm"),
            "primary_hash_algorithm": scan.get("primary_hash_algorithm") or _comp("hash", "best_algorithm"),
            "public_key_algorithm": public_key_algorithm,
            "public_key_size_bits": public_key_size_bits,
            # Server hygiene
            "ephemeral_key_exchange": pfs,
            "hsts_enabled": hsts_enabled,
            "hsts_max_age": hsts_max_age,
            "ocsp_stapling_active": ocsp_stapling_active,
            "ct_present": ct_present,
            # Per-algorithm rollup for occurrence-weighted dashboards
            "algorithm_stats": algorithm_stats,
            "algorithm_names": pqc_algorithm_names,
            "vulnerable_algorithms": vulnerable_algorithms,
            # Errors
            "error_message": scan.get("error_message"),
            # Vuln tally (deprecated protocols + weak/deprecated algorithms)
            "vulnerabilities_count": len(deprecated_protocols) + len(vulnerable_algorithms),
            # Full source
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
    """Index a repository scan result with FULL parity to Postgres.
    Includes all algorithm rows, every finding, and category scores."""
    try:
        scan = payload.scan_data
        now_ist = ist_now()
        asset_id = f"repo:{payload.repo_url}"

        source_id = scan.get("id") or scan.get("scan_id") or scan.get("repo_id")
        if not source_id:
            logger.warning(f"Skipping repo scan for {payload.repo_url}: no stable source id")
            return {"success": False, "reason": "missing source id"}

        scan_id = make_scan_id(asset_id, source_id)

        scanned_at = (
            to_ist_iso(scan.get("last_scanned"))
            or to_ist_iso(scan.get("completed_at"))
            or to_ist_iso(scan.get("created_at"))
            or now_ist.isoformat()
        )

        readiness = float(scan.get("quantum_readiness_percentage") or 0)

        # Aggregate algorithm-level + finding-level data for searchability
        algorithms = scan.get("algorithms") or {}
        algorithm_names: List[str] = []
        vulnerable_algorithms: List[str] = []
        algorithm_stats: List[Dict[str, Any]] = []
        findings_count = 0
        files_set = set()
        for algo_name, algo_data in (algorithms.items() if isinstance(algorithms, dict) else []):
            if not isinstance(algo_data, dict):
                continue
            algorithm_names.append(algo_name)
            quantum_safe = bool(algo_data.get("quantum_safe", False))
            if not quantum_safe:
                vulnerable_algorithms.append(algo_name)
            algo_findings = algo_data.get("findings") or []
            findings_count += len(algo_findings)
            for f in algo_findings:
                fp = (f.get("file_path") or f.get("file")) if isinstance(f, dict) else None
                if fp:
                    files_set.add(fp)
            occ = int(algo_data.get("occurrences") or len(algo_findings) or 0)
            resistance = algo_data.get("quantum_resistance_type") or algo_data.get("resistance")
            algorithm_stats.append({
                "name": algo_name,
                "category": algo_data.get("category"),
                "quantum_resistance_type": resistance,
                "occurrences": occ,
                "findings": len(algo_findings),
                "quantum_safe": quantum_safe,
                "is_pqc": bool(algo_data.get("is_pqc", False)),
                "deprecated": bool(algo_data.get("deprecated", False)) or resistance == "deprecated",
                "grade": algo_data.get("grade"),
            })

        doc = {
            # Common
            "scan_id": scan_id,
            "asset_id": asset_id,
            "asset_type": "repo",
            "asset_label": payload.repo_url.rsplit("/", 1)[-1],
            "organization_id": payload.organization_id,
            "source_id": str(source_id),
            "scanned_at": scanned_at,
            "ingested_at": now_ist.isoformat(),
            # Identity
            "repo_url": payload.repo_url,
            "repo_hash": scan.get("repo_hash"),
            "branch_name": payload.branch_name or scan.get("branch_name"),
            "platform": scan.get("platform"),
            # Status
            "scan_status": scan.get("scan_status"),
            "current_status": scan.get("current_status"),
            "last_scanned": to_ist_iso(scan.get("last_scanned")),
            # Counts
            "total_files": scan.get("total_files"),
            "total_files_to_scan": scan.get("total_files_to_scan"),
            "total_algorithms": scan.get("total_algorithms") or len(algorithm_names),
            "quantum_safe_count": int(scan.get("quantum_safe_count") or 0),
            "quantum_vulnerable_count": int(scan.get("quantum_vulnerable_count") or 0),
            "true_pqc_count": scan.get("true_pqc_count"),
            # Scoring
            "overall_grade": scan.get("overall_grade"),
            "overall_score": scan.get("overall_security_score"),
            "overall_security_score": scan.get("overall_security_score"),
            "quantum_ready": readiness >= 80,
            "quantum_readiness_percentage": readiness,
            # Aggregates for KQL / Kibana visualisations
            "algorithm_names": algorithm_names,
            "vulnerable_algorithms": vulnerable_algorithms,
            "algorithm_stats": algorithm_stats,
            "findings_count": findings_count,
            "files_with_findings": sorted(files_set)[:500],  # cap to avoid huge keyword arrays
            "vulnerabilities_count": int(scan.get("quantum_vulnerable_count") or len(vulnerable_algorithms)),
            # Full source (algorithms, category_scores, migration_plan, findings, etc.)
            "raw": scan,
        }
        es.index(index=INDEX_REPO, id=scan_id, document=doc)
        logger.info(f"Indexed repo scan: {payload.repo_url} → {scan_id} ({len(algorithm_names)} algos, {findings_count} findings)")
        return {"success": True, "scan_id": scan_id, "asset_id": asset_id}
    except Exception as e:
        logger.exception("Failed to index repo scan")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/index/repo/{source_id}")
def delete_repo_scan(source_id: str):
    """Delete a repo scan from Elasticsearch by source_id."""
    try:
        result = es.delete_by_query(
            index=INDEX_REPO,
            body={"query": {"term": {"source_id": source_id}}},
            refresh=True,
        )
        deleted = result.get("deleted", 0)
        logger.info(f"Deleted repo scan with source_id={source_id}: {deleted} docs removed")
        return {"success": True, "deleted": deleted, "source_id": source_id}
    except Exception as e:
        logger.exception(f"Failed to delete repo scan source_id={source_id}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/index/repo")
def delete_all_repo_scans():
    """Delete all repo scan documents from Elasticsearch."""
    try:
        result = es.delete_by_query(
            index=INDEX_REPO,
            body={"query": {"match_all": {}}},
            refresh=True,
        )
        deleted = result.get("deleted", 0)
        logger.info(f"Deleted all repo scans: {deleted} docs removed")
        return {"success": True, "deleted": deleted}
    except Exception as e:
        logger.exception("Failed to delete all repo scans")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/index/asset")
def index_asset(payload: AssetScanIngest):
    """Index a system/asset scan result with FULL parity to Postgres.
    scan_data may contain: audit_results, task (from tasks table), result (envelope),
    agent (from agents table)."""
    try:
        scan = payload.scan_data
        now_ist = ist_now()
        asset_id = f"asset:{payload.agent_id}"

        source_id = payload.task_id or scan.get("result_id") or scan.get("id")
        if not source_id:
            logger.warning(f"Skipping asset scan for {payload.agent_id}: no stable source id")
            return {"success": False, "reason": "missing source id"}

        scan_id = make_scan_id(asset_id, source_id)

        # Sub-objects passed from elk-sync
        audit = scan.get("audit_results") or {}
        task = scan.get("task") or {}
        agent = scan.get("agent") or {}
        result_envelope = scan.get("result") or {}

        if not isinstance(audit, dict):
            audit = {}

        sys_ctx = audit.get("system_context", {}) if isinstance(audit.get("system_context"), dict) else {}
        crypto_api = audit.get("cryptoapi_info", {}) if isinstance(audit.get("cryptoapi_info"), dict) else {}
        tls_cfg = audit.get("tls_ssl_configuration", {}) if isinstance(audit.get("tls_ssl_configuration"), dict) else {}
        cert_stores = audit.get("certificate_stores", {}) if isinstance(audit.get("certificate_stores"), dict) else {}
        installed = audit.get("installed_crypto_software", {}) if isinstance(audit.get("installed_crypto_software"), dict) else {}

        vulns = _extract_audit_vulns(audit)

        # Weak providers / ciphers counts
        weak_providers = 0
        provider_names = []
        try:
            providers = (crypto_api.get("cryptographic_providers", {}) or {}).get("providers", []) or []
            for p in providers if isinstance(providers, list) else []:
                name = (p if isinstance(p, str) else p.get("provider_name", "")) or ""
                if not name:
                    continue
                provider_names.append(name)
                if any(w in name for w in ("RSA", "MD5", "SHA1")) and "RSA-PSS" not in name:
                    weak_providers += 1
        except Exception:
            pass

        weak_ciphers = 0
        strong_ciphers = 0
        cipher_hash_algos = set()
        cipher_kex = set()
        tls_protocols = []
        try:
            ciphers = (tls_cfg.get("cipher_suites", {}) or {}).get("cipher_details", []) or []
            for c in ciphers if isinstance(ciphers, list) else []:
                cname = (c.get("name") if isinstance(c, dict) else c) or ""
                if isinstance(c, dict):
                    if c.get("hash_algorithm"):
                        cipher_hash_algos.add(c.get("hash_algorithm"))
                    if c.get("key_exchange"):
                        cipher_kex.add(c.get("key_exchange"))
                if any(w in cname.upper() for w in ("DES", "RC4", "NULL", "EXPORT", "ANON", "MD5")):
                    weak_ciphers += 1
                elif cname:
                    strong_ciphers += 1
            schannel = tls_cfg.get("schannel", {}) or {}
            for proto, settings in (schannel.items() if isinstance(schannel, dict) else []):
                if isinstance(settings, dict) and settings.get("enabled"):
                    tls_protocols.append(proto)
            # Also derive enabled protocols from protocol_configurations
            for pc in (tls_cfg.get("protocol_configurations", []) or []):
                if not isinstance(pc, dict):
                    continue
                proto = pc.get("protocol")
                client = str(pc.get("client_status", "")) or ""
                server = str(pc.get("server_status", "")) or ""
                if proto and (client.startswith("1") or server.startswith("1")):
                    tls_protocols.append(proto)
        except Exception:
            pass

        installed_names = []
        try:
            # The audit section is double-nested: installed_crypto_software.installed_crypto_software.software
            inner = installed.get("installed_crypto_software", installed) if isinstance(installed, dict) else {}
            if not isinstance(inner, dict):
                inner = {}
            items = (
                inner.get("software")
                or inner.get("products")
                or inner.get("items")
                or []
            )
            for item in items:
                if isinstance(item, dict):
                    installed_names.append(item.get("name") or item.get("product_name") or item.get("DisplayName"))
                elif isinstance(item, str):
                    installed_names.append(item)
        except Exception:
            pass

        cert_stores_count = 0
        try:
            if isinstance(cert_stores, dict):
                cert_stores_count = sum(
                    len(v) if isinstance(v, list) else 1
                    for v in cert_stores.values()
                )
        except Exception:
            pass

        oid_algo_count = 0
        try:
            oid_algo_count = int((crypto_api.get("registered_oid_algorithms", {}) or {}).get("count", 0) or 0)
        except Exception:
            pass

        # Per-algorithm scoring breakdown from pqc_score.algorithms (flat list with
        # repeats) — aggregate by algorithm name into nested algorithm_stats.
        algorithm_stats = []
        try:
            pqc = audit.get("pqc_score") if isinstance(audit.get("pqc_score"), dict) else {}
            scored_algos = pqc.get("algorithm_scores") or pqc.get("algorithms") or []
            agg: Dict[str, Dict[str, Any]] = {}
            for a in scored_algos if isinstance(scored_algos, list) else []:
                if not isinstance(a, dict):
                    continue
                aname = (a.get("algorithm") or a.get("name") or "").strip()
                if not aname:
                    continue
                ctx = a.get("context") if isinstance(a.get("context"), dict) else {}
                entry = agg.get(aname)
                if entry is None:
                    entry = {
                        "name": aname,
                        "category": a.get("category"),
                        "algorithm_type": a.get("algorithm_type"),
                        "quantum_resistance_type": a.get("quantum_resistance_type") or a.get("resistance"),
                        "source_type": ctx.get("source_type"),
                        "security_level": a.get("security_level"),
                        "occurrences": 0,
                        "quantum_safe": bool(a.get("quantum_safe", False)),
                        "is_pqc": bool(a.get("is_pqc", False)),
                        "deprecated": bool(a.get("deprecated", False)),
                        "grade": a.get("grade"),
                        "_score_sum": 0.0,
                    }
                    agg[aname] = entry
                entry["occurrences"] += 1
                try:
                    entry["_score_sum"] += float(a.get("final_score") or 0.0)
                except (TypeError, ValueError):
                    pass
                entry["deprecated"] = entry["deprecated"] or bool(a.get("deprecated", False))
            for entry in agg.values():
                occ = entry.pop("occurrences")
                score_sum = entry.pop("_score_sum")
                entry["occurrences"] = occ
                entry["avg_score"] = round(score_sum / occ, 2) if occ else 0.0
                algorithm_stats.append(entry)
        except Exception:
            logger.exception("Failed to build endpoint algorithm_stats")

        pqc_score_raw = (audit.get("pqc_score") or {}).get("overall_score") if isinstance(audit.get("pqc_score"), dict) else None
        try:
            pqc_score = float(pqc_score_raw) if pqc_score_raw not in (None, "N/A") else 0.0
        except (TypeError, ValueError):
            pqc_score = 0.0

        scanned_at = (
            to_ist_iso(task.get("completed_at"))
            or to_ist_iso(result_envelope.get("received_at"))
            or to_ist_iso(scan.get("completed_at"))
            or to_ist_iso(scan.get("scanned_at"))
            or now_ist.isoformat()
        )

        doc = {
            # Common
            "scan_id": scan_id,
            "asset_id": asset_id,
            "asset_type": "asset",
            "asset_label": sys_ctx.get("computer_name") or agent.get("hostname") or payload.agent_id[:8],
            "organization_id": payload.organization_id,
            "source_id": str(source_id),
            "scanned_at": scanned_at,
            "ingested_at": now_ist.isoformat(),
            # Result identity
            "agent_id": payload.agent_id,
            "task_id": payload.task_id,
            "result_id": result_envelope.get("result_id") or scan.get("result_id"),
            # Agent metadata
            "hostname": agent.get("hostname"),
            "ip_address": agent.get("ip_address"),
            "os_info": agent.get("os_info") or sys_ctx.get("os_info"),
            "organization_name": agent.get("organization_name"),
            "suborganization_name": agent.get("suborganization_name"),
            "application_name": agent.get("application_name"),
            "agent_registered_at": to_ist_iso(agent.get("registered_at")),
            "agent_last_seen": to_ist_iso(agent.get("last_seen")),
            # Task lifecycle
            "task_status": task.get("status"),
            "task_created_at": to_ist_iso(task.get("created_at")),
            "task_started_at": to_ist_iso(task.get("started_at")),
            "task_completed_at": to_ist_iso(task.get("completed_at")),
            # Result envelope
            "received_at": to_ist_iso(result_envelope.get("received_at")),
            "submitted_at": to_ist_iso(result_envelope.get("submitted_at")),
            # Audit summary
            "computer_name": sys_ctx.get("computer_name"),
            "os_version": sys_ctx.get("os_version"),
            "build_number": sys_ctx.get("build_number"),
            "architecture": sys_ctx.get("architecture"),
            "fips_mode_enabled": bool(crypto_api.get("fips_mode_enabled", False)),
            "weak_providers_count": weak_providers,
            "weak_ciphers_count": weak_ciphers,
            "strong_ciphers_count": strong_ciphers,
            "cipher_suites_total": weak_ciphers + strong_ciphers,
            "tls_protocols_enabled": sorted({p for p in tls_protocols if p}),
            "installed_crypto_software": [n for n in installed_names if n][:200],
            "installed_crypto_software_count": len([n for n in installed_names if n]),
            "certificate_stores_count": cert_stores_count,
            # Full crypto inventory
            "crypto_providers": [n for n in provider_names if n][:200],
            "crypto_providers_count": len([n for n in provider_names if n]),
            "cipher_hash_algorithms": sorted({h for h in cipher_hash_algos if h}),
            "cipher_key_exchanges": sorted({k for k in cipher_kex if k}),
            "registered_oid_algorithms_count": oid_algo_count,
            "algorithm_stats": algorithm_stats,
            # Scoring
            "overall_score": pqc_score,
            "quantum_readiness_percentage": pqc_score,
            "quantum_ready": pqc_score >= 80,
            "overall_grade": (audit.get("pqc_score") or {}).get("overall_grade") if isinstance(audit.get("pqc_score"), dict) else None,
            "vulnerabilities_count": vulns,
            # Full source (audit_results + task + agent + result envelope)
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

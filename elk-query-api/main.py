"""
ELK Query API
==============
Read-only API consumed by React. Queries Elasticsearch (never exposed to browser).

Endpoints:
  GET /api/elk/dashboard               -> aggregate stats for the main ELK dashboard
  GET /api/elk/results?type=domain     -> latest doc per asset (one per asset_id)
  GET /api/elk/results/all?type=domain -> ALL historical docs (full audit trail)
  GET /api/elk/history/{asset_id}      -> trend timeline for a specific asset
  GET /api/elk/timeline                -> aggregated readiness over time (all assets)
  GET /api/elk/asset/{asset_id}        -> latest doc for an asset
  GET /api/elk/scans                   -> paginated scan history (all types)
  GET /api/elk/analyst?interval=day    -> analyst dashboard with all aggregations
  
Algorithm Management:
  GET /api/algorithms                  -> list all algorithms with filters
  GET /api/algorithms/{name}           -> get specific algorithm
  POST /api/algorithms                 -> create new algorithm
  PUT /api/algorithms/{name}           -> update algorithm score/properties
  DELETE /api/algorithms/{name}        -> mark algorithm as inactive
  POST /api/algorithms/_reload-cache   -> trigger cache reload for scoring engines
"""
import os
import time
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from elasticsearch import Elasticsearch

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("elk-query-api")

ES_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
es = Elasticsearch(ES_URL, request_timeout=30)

app = FastAPI(title="ELK Query API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

INDEX_DOMAIN = "crypto-scans-domain"
INDEX_REPO = "crypto-scans-repo"
INDEX_ASSET = "crypto-scans-asset"
ALL_INDICES = f"{INDEX_DOMAIN},{INDEX_REPO},{INDEX_ASSET}"

TYPE_TO_INDEX = {
    "domain": INDEX_DOMAIN,
    "repo": INDEX_REPO,
    "asset": INDEX_ASSET,
    "all": ALL_INDICES,
}


def _safe_search(index: str, body: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return es.search(index=index, body=body)
    except Exception as e:
        logger.warning(f"ES search failed on {index}: {e}")
        return {"hits": {"hits": [], "total": {"value": 0}}, "aggregations": {}}


@app.get("/health")
def health():
    try:
        return {"status": "ok", "elasticsearch": es.ping()}
    except Exception:
        return {"status": "degraded", "elasticsearch": False}


# ---------------------------------------------------------------------------
# /api/elk/dashboard — aggregate stats for the dashboard summary cards
# ---------------------------------------------------------------------------
@app.get("/api/elk/dashboard")
def dashboard():
    """
    Returns counts + averages across LATEST scan per asset.
    This is what the dashboard's summary cards use.
    """
    try:
        # We want only the latest doc per asset_id — use a collapse query
        body = {
            "size": 1000,
            "sort": [{"scanned_at": {"order": "desc"}}],
            "collapse": {"field": "asset_id"},
        }
        result = _safe_search(ALL_INDICES, body)
        latest_docs = [h["_source"] for h in result["hits"]["hits"]]

        domains = [d for d in latest_docs if d.get("asset_type") == "domain"]
        repos = [d for d in latest_docs if d.get("asset_type") == "repo"]
        assets = [d for d in latest_docs if d.get("asset_type") == "asset"]

        total_assets = len(domains) + len(repos) + len(assets)
        quantum_ready = sum(1 for d in latest_docs if d.get("quantum_ready"))
        total_vulns = sum((d.get("vulnerabilities_count") or 0) for d in latest_docs)

        readiness_scores = [d.get("quantum_readiness_percentage") or 0 for d in latest_docs]
        avg_readiness = sum(readiness_scores) / len(readiness_scores) if readiness_scores else 0

        return {
            "summary": {
                "total_assets": total_assets,
                "domains_count": len(domains),
                "repos_count": len(repos),
                "assets_count": len(assets),
                "quantum_ready_count": quantum_ready,
                "quantum_ready_domains": sum(1 for d in domains if d.get("quantum_ready")),
                "quantum_ready_repos": sum(1 for d in repos if d.get("quantum_ready")),
                "quantum_ready_assets": sum(1 for d in assets if d.get("quantum_ready")),
                "total_vulnerabilities": total_vulns,
                "avg_quantum_readiness": round(avg_readiness, 1),
            },
            "latest_scans": {
                "domains": domains,
                "repos": repos,
                "assets": assets,
            },
        }
    except Exception as e:
        logger.exception("dashboard error")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# /api/elk/results — latest result per asset (current state)
# ---------------------------------------------------------------------------
@app.get("/api/elk/results")
def latest_results(
    type: str = Query("all", description="domain | repo | asset | all"),
    size: int = Query(100, ge=1, le=1000),
):
    index = TYPE_TO_INDEX.get(type)
    if not index:
        raise HTTPException(status_code=400, detail=f"Invalid type: {type}")

    body = {
        "size": size,
        "sort": [{"scanned_at": {"order": "desc"}}],
        "collapse": {"field": "asset_id"},
    }
    result = _safe_search(index, body)
    return {
        "type": type,
        "count": len(result["hits"]["hits"]),
        "results": [h["_source"] for h in result["hits"]["hits"]],
    }


# ---------------------------------------------------------------------------
# /api/elk/results/all — full history (every scan ever, audit trail)
# ---------------------------------------------------------------------------
@app.get("/api/elk/results/all")
def all_results(
    type: str = Query("all"),
    size: int = Query(200, ge=1, le=1000),
    asset_id: Optional[str] = None,
):
    index = TYPE_TO_INDEX.get(type)
    if not index:
        raise HTTPException(status_code=400, detail=f"Invalid type: {type}")

    body: Dict[str, Any] = {
        "size": size,
        "sort": [{"scanned_at": {"order": "desc"}}],
    }
    if asset_id:
        body["query"] = {"term": {"asset_id": asset_id}}

    result = _safe_search(index, body)
    return {
        "type": type,
        "total": result["hits"]["total"]["value"],
        "count": len(result["hits"]["hits"]),
        "results": [h["_source"] for h in result["hits"]["hits"]],
    }


# ---------------------------------------------------------------------------
# /api/elk/history/{asset_id} — timeline for a SPECIFIC asset
# ---------------------------------------------------------------------------
@app.get("/api/elk/history/{asset_id:path}")
def asset_history(asset_id: str, size: int = Query(100, ge=1, le=500)):
    body = {
        "size": size,
        "sort": [{"scanned_at": {"order": "asc"}}],
        "query": {"term": {"asset_id": asset_id}},
    }
    result = _safe_search(ALL_INDICES, body)
    hits = [h["_source"] for h in result["hits"]["hits"]]

    return {
        "asset_id": asset_id,
        "scan_count": len(hits),
        "first_scan": hits[0]["scanned_at"] if hits else None,
        "latest_scan": hits[-1]["scanned_at"] if hits else None,
        "timeline": [
            {
                "scanned_at": d.get("scanned_at"),
                "scan_id": d.get("scan_id"),
                "overall_grade": d.get("overall_grade"),
                "overall_score": d.get("overall_score"),
                "quantum_readiness_percentage": d.get("quantum_readiness_percentage"),
                "quantum_ready": d.get("quantum_ready"),
                "vulnerabilities_count": d.get("vulnerabilities_count"),
            }
            for d in hits
        ],
        "full_history": hits,
    }


# ---------------------------------------------------------------------------
# /api/elk/timeline — global readiness trend across all assets over time
# ---------------------------------------------------------------------------
@app.get("/api/elk/timeline")
def global_timeline(interval: str = Query("day", description="hour|day|week|month")):
    body = {
        "size": 0,
        "aggs": {
            "over_time": {
                "date_histogram": {
                    "field": "scanned_at",
                    "calendar_interval": interval,
                },
                "aggs": {
                    "avg_readiness": {"avg": {"field": "quantum_readiness_percentage"}},
                    "total_vulns": {"sum": {"field": "vulnerabilities_count"}},
                    "by_type": {
                        "terms": {"field": "asset_type"},
                        "aggs": {
                            "avg_readiness": {"avg": {"field": "quantum_readiness_percentage"}},
                        },
                    },
                },
            }
        },
    }
    result = _safe_search(ALL_INDICES, body)
    buckets = result.get("aggregations", {}).get("over_time", {}).get("buckets", [])
    return {
        "interval": interval,
        "timeline": [
            {
                "timestamp": b["key_as_string"],
                "scan_count": b["doc_count"],
                "avg_readiness": round(b["avg_readiness"]["value"] or 0, 1),
                "total_vulnerabilities": int(b["total_vulns"]["value"] or 0),
                "by_type": [
                    {
                        "type": x["key"],
                        "scan_count": x["doc_count"],
                        "avg_readiness": round(x["avg_readiness"]["value"] or 0, 1),
                    }
                    for x in b.get("by_type", {}).get("buckets", [])
                ],
            }
            for b in buckets
        ],
    }


# ---------------------------------------------------------------------------
# /api/elk/asset/{asset_id} — latest doc + summary for an asset
# ---------------------------------------------------------------------------
@app.get("/api/elk/asset/{asset_id:path}")
def get_asset(asset_id: str):
    body = {
        "size": 1,
        "sort": [{"scanned_at": {"order": "desc"}}],
        "query": {"term": {"asset_id": asset_id}},
    }
    result = _safe_search(ALL_INDICES, body)
    hits = result["hits"]["hits"]
    if not hits:
        raise HTTPException(status_code=404, detail="Asset not found")
    return hits[0]["_source"]


# ---------------------------------------------------------------------------
# /api/elk/scans — paginated all scans (audit log style)
# ---------------------------------------------------------------------------
@app.get("/api/elk/scans")
def list_scans(
    type: str = Query("all"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    index = TYPE_TO_INDEX.get(type)
    if not index:
        raise HTTPException(status_code=400, detail=f"Invalid type: {type}")

    body = {
        "from": (page - 1) * page_size,
        "size": page_size,
        "sort": [{"scanned_at": {"order": "desc"}}],
    }
    result = _safe_search(index, body)
    return {
        "page": page,
        "page_size": page_size,
        "total": result["hits"]["total"]["value"],
        "scans": [h["_source"] for h in result["hits"]["hits"]],
    }


# ---------------------------------------------------------------------------
# /api/elk/stats — quick counts (used for health badges)
# ---------------------------------------------------------------------------
@app.get("/api/elk/stats")
def stats():
    try:
        out = {}
        for name, idx in [("domain", INDEX_DOMAIN), ("repo", INDEX_REPO), ("asset", INDEX_ASSET)]:
            try:
                cnt = es.count(index=idx)["count"]
            except Exception:
                cnt = 0
            out[name] = cnt
        out["total"] = sum(out.values())
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# /api/elk/analyst — analyst-grade dashboard payload, all aggregations
# ---------------------------------------------------------------------------
def _terms_list(agg, key="key") -> List[Dict[str, Any]]:
    if not agg:
        return []
    return [
        {"key": b[key], "count": b["doc_count"]}
        for b in agg.get("buckets", [])
    ]


def _top_bucket_key(agg) -> Optional[Any]:
    buckets = (agg or {}).get("buckets", []) if agg else []
    return buckets[0]["key"] if buckets else None


@app.get("/api/elk/analyst")
def analyst_dashboard(
    interval: str = Query("day", description="hour|day|week|month"),
):
    """
    One-call payload powering the in-app PQC Analyst dashboard.
    Pure Elasticsearch aggregations — no Kibana involved.
    """
    body: Dict[str, Any] = {
        "size": 0,
        "track_total_hits": True,
        "aggs": {
            "unique_assets":     {"cardinality": {"field": "asset_id"}},
            "avg_score":         {"avg":   {"field": "overall_score"}},
            "avg_readiness":     {"avg":   {"field": "quantum_readiness_percentage"}},
            "total_vulns":       {"sum":   {"field": "vulnerabilities_count"}},
            "total_findings":    {"sum":   {"field": "findings_count"}},
            "quantum_ready":     {"terms": {"field": "quantum_ready", "size": 2}},
            "by_asset_type":     {"terms": {"field": "asset_type", "size": 10}},
            "by_grade":          {"terms": {"field": "overall_grade", "size": 15}},
            "score_by_type": {
                "terms": {"field": "asset_type", "size": 10},
                "aggs": {
                    "avg_score":     {"avg": {"field": "overall_score"}},
                    "avg_readiness": {"avg": {"field": "quantum_readiness_percentage"}},
                    "total_vulns":   {"sum": {"field": "vulnerabilities_count"}},
                },
            },
            "qr_trend": {
                "date_histogram": {
                    "field": "scanned_at",
                    "calendar_interval": interval,
                    "min_doc_count": 0,
                },
                "aggs": {
                    "avg_readiness": {"avg": {"field": "quantum_readiness_percentage"}},
                    "total_vulns":   {"sum": {"field": "vulnerabilities_count"}},
                    "by_type": {
                        "terms": {"field": "asset_type", "size": 5},
                        "aggs": {
                            "avg_readiness": {"avg": {"field": "quantum_readiness_percentage"}},
                            "total_vulns":   {"sum": {"field": "vulnerabilities_count"}},
                        },
                    },
                },
            },
            "domains": {
                "filter": {"term": {"asset_type": "domain"}},
                "aggs": {
                    "cipher_suites":   {"terms": {"field": "primary_cipher_suite", "size": 10}},
                    "public_key_algos": {"terms": {"field": "public_key_algorithm", "size": 10}},
                    "issuers":         {"terms": {"field": "cert_issuer", "size": 10}},
                    "hsts":            {"terms": {"field": "hsts_enabled", "size": 2}},
                    "ocsp":            {"terms": {"field": "ocsp_stapling_active", "size": 2}},
                    "ct_present":      {"terms": {"field": "ct_present", "size": 2}},
                    "pfs":             {"terms": {"field": "ephemeral_key_exchange", "size": 2}},
                    "tls_versions":    {"terms": {"field": "tls_version", "size": 10}},
                },
            },
            "repos": {
                "filter": {"term": {"asset_type": "repo"}},
                "aggs": {
                    "vulnerable_algorithms": {"terms": {"field": "vulnerable_algorithms", "size": 20}},
                    "algorithm_names":       {"terms": {"field": "algorithm_names", "size": 20}},
                    "platforms":             {"terms": {"field": "platform", "size": 10}},
                    "findings_by_repo": {
                        "terms": {"field": "asset_label", "size": 15, "order": {"findings": "desc"}},
                        "aggs": {
                            "findings":          {"sum": {"field": "findings_count"}},
                            "total_files":       {"sum": {"field": "total_files"}},
                            "total_algorithms":  {"sum": {"field": "total_algorithms"}},
                        },
                    },
                    "sum_true_pqc":            {"sum": {"field": "true_pqc_count"}},
                    "sum_quantum_safe":        {"sum": {"field": "quantum_safe_count"}},
                    "sum_quantum_vulnerable":  {"sum": {"field": "quantum_vulnerable_count"}},
                },
            },
            "endpoints": {
                "filter": {"term": {"asset_type": "asset"}},
                "aggs": {
                    "fips":            {"terms": {"field": "fips_mode_enabled", "size": 2}},
                    "os":              {"terms": {"field": "os_info", "size": 10}},
                    "architectures":   {"terms": {"field": "architecture", "size": 10}},
                    "weak_prov_by_host": {
                        "terms": {"field": "hostname", "size": 15, "order": {"sum_w": "desc"}},
                        "aggs": {"sum_w": {"sum": {"field": "weak_providers_count"}}},
                    },
                    "weak_cph_by_host": {
                        "terms": {"field": "hostname", "size": 15, "order": {"sum_c": "desc"}},
                        "aggs": {"sum_c": {"sum": {"field": "weak_ciphers_count"}}},
                    },
                    "cert_stores":     {"sum": {"field": "certificate_stores_count"}},
                    "total_weak_prov": {"sum": {"field": "weak_providers_count"}},
                    "total_weak_cph":  {"sum": {"field": "weak_ciphers_count"}},
                },
            },
            "at_risk": {
                "terms": {
                    "field": "asset_label",
                    "size": 25,
                    "order": {"avg_score": "asc"},
                },
                "aggs": {
                    "avg_score":     {"avg": {"field": "overall_score"}},
                    "avg_readiness": {"avg": {"field": "quantum_readiness_percentage"}},
                    "total_vulns":   {"sum": {"field": "vulnerabilities_count"}},
                    "top_type":      {"terms": {"field": "asset_type", "size": 1}},
                    "top_grade":     {"terms": {"field": "overall_grade", "size": 1}},
                },
            },
        },
    }

    try:
        result = es.search(index=ALL_INDICES, body=body)
    except Exception as e:
        logger.exception("analyst aggregation failed")
        raise HTTPException(status_code=500, detail=str(e))

    aggs = result.get("aggregations", {}) or {}
    total_scans = result.get("hits", {}).get("total", {}).get("value", 0)

    def num(path: Dict[str, Any], default: float = 0) -> float:
        val = (path or {}).get("value")
        return round(val, 1) if isinstance(val, (int, float)) else default

    # KPI
    kpi = {
        "total_scans": total_scans,
        "unique_assets": int(num(aggs.get("unique_assets"))),
        "avg_score": num(aggs.get("avg_score")),
        "avg_readiness": num(aggs.get("avg_readiness")),
        "total_vulnerabilities": int(num(aggs.get("total_vulns"))),
        "total_findings": int(num(aggs.get("total_findings"))),
        "quantum_ready_count": next(
            (b["doc_count"] for b in aggs.get("quantum_ready", {}).get("buckets", [])
             if b["key_as_string"] == "true" or b["key"] is True or b["key"] == 1),
            0,
        ),
    }

    # Distributions
    by_asset_type = _terms_list(aggs.get("by_asset_type"))
    by_grade = _terms_list(aggs.get("by_grade"))

    score_by_type = [
        {
            "type": b["key"],
            "scans": b["doc_count"],
            "avg_score": num(b.get("avg_score")),
            "avg_readiness": num(b.get("avg_readiness")),
            "total_vulnerabilities": int(num(b.get("total_vulns"))),
        }
        for b in aggs.get("score_by_type", {}).get("buckets", [])
    ]

    # Time series
    qr_trend = [
        {
            "timestamp": b["key_as_string"],
            "scans": b["doc_count"],
            "avg_readiness": num(b.get("avg_readiness")),
            "total_vulnerabilities": int(num(b.get("total_vulns"))),
            "by_type": [
                {
                    "type": t["key"],
                    "scans": t["doc_count"],
                    "avg_readiness": num(t.get("avg_readiness")),
                    "total_vulnerabilities": int(num(t.get("total_vulns"))),
                }
                for t in b.get("by_type", {}).get("buckets", [])
            ],
        }
        for b in aggs.get("qr_trend", {}).get("buckets", [])
    ]

    # Domain
    dom = aggs.get("domains", {}) or {}
    domains = {
        "cipher_suites":          _terms_list(dom.get("cipher_suites")),
        "public_key_algorithms":  _terms_list(dom.get("public_key_algos")),
        "issuers":                _terms_list(dom.get("issuers")),
        "tls_versions":           _terms_list(dom.get("tls_versions")),
        "hsts":                   _terms_list(dom.get("hsts")),
        "ocsp_stapling":          _terms_list(dom.get("ocsp")),
        "ct_present":             _terms_list(dom.get("ct_present")),
        "ephemeral_key_exchange": _terms_list(dom.get("pfs")),
    }

    # Repos
    rep = aggs.get("repos", {}) or {}
    repos = {
        "vulnerable_algorithms": _terms_list(rep.get("vulnerable_algorithms")),
        "algorithm_names":       _terms_list(rep.get("algorithm_names")),
        "platforms":             _terms_list(rep.get("platforms")),
        "findings_by_repo": [
            {
                "repo": b["key"],
                "scans": b["doc_count"],
                "findings": int(num(b.get("findings"))),
                "total_files": int(num(b.get("total_files"))),
                "total_algorithms": int(num(b.get("total_algorithms"))),
            }
            for b in rep.get("findings_by_repo", {}).get("buckets", [])
        ],
        "composition": {
            "true_pqc": int(num(rep.get("sum_true_pqc"))),
            "quantum_safe": int(num(rep.get("sum_quantum_safe"))),
            "quantum_vulnerable": int(num(rep.get("sum_quantum_vulnerable"))),
        },
    }

    # Endpoints
    ep = aggs.get("endpoints", {}) or {}
    endpoints = {
        "fips":           _terms_list(ep.get("fips")),
        "os":             _terms_list(ep.get("os")),
        "architectures":  _terms_list(ep.get("architectures")),
        "weak_providers_by_host": [
            {"host": b["key"], "scans": b["doc_count"],
             "weak_providers": int(num(b.get("sum_w")))}
            for b in ep.get("weak_prov_by_host", {}).get("buckets", [])
        ],
        "weak_ciphers_by_host": [
            {"host": b["key"], "scans": b["doc_count"],
             "weak_ciphers": int(num(b.get("sum_c")))}
            for b in ep.get("weak_cph_by_host", {}).get("buckets", [])
        ],
        "total_certificate_stores": int(num(ep.get("cert_stores"))),
        "total_weak_providers":     int(num(ep.get("total_weak_prov"))),
        "total_weak_ciphers":       int(num(ep.get("total_weak_cph"))),
    }

    # At-risk table
    at_risk = [
        {
            "label": b["key"],
            "type": _top_bucket_key(b.get("top_type")),
            "grade": _top_bucket_key(b.get("top_grade")),
            "scans": b["doc_count"],
            "avg_score": num(b.get("avg_score")),
            "avg_readiness": num(b.get("avg_readiness")),
            "total_vulnerabilities": int(num(b.get("total_vulns"))),
        }
        for b in aggs.get("at_risk", {}).get("buckets", [])
    ]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "interval": interval,
        "kpi": kpi,
        "by_asset_type": by_asset_type,
        "by_grade": by_grade,
        "score_by_type": score_by_type,
        "qr_trend": qr_trend,
        "domains": domains,
        "repos": repos,
        "endpoints": endpoints,
        "at_risk": at_risk,
    }


# ===========================================================================
# /api/algorithms/* — Algorithm score management (read/write)
# ===========================================================================
ALGO_INDEX = "crypto-algorithm-scores"
CACHE_VERSION_INDEX = "crypto-config"


# ---------------------------------------------------------------------------
# /api/elk/vulnerabilities — algorithms found in scans whose score < threshold
# ---------------------------------------------------------------------------
def _load_algorithm_scores() -> Dict[str, Dict[str, Any]]:
    """Fetch all active algorithm score rows from ES, indexed by upper-case name."""
    out: Dict[str, Dict[str, Any]] = {}
    try:
        body = {
            "size": 2000,
            "query": {"term": {"active": True}},
        }
        result = es.search(index=ALGO_INDEX, body=body)
        for hit in result.get("hits", {}).get("hits", []):
            src = hit.get("_source", {}) or {}
            name = (src.get("algorithm") or "").strip().upper()
            if name:
                out[name] = src
    except Exception as e:
        logger.warning(f"Could not load algorithm scores: {e}")
    return out


def _lookup_algo_meta(
    name: Optional[str], algo_scores: Dict[str, Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """Find a score row for a raw algorithm/cipher/provider string.

    First tries exact match, then substring matches (e.g. a cipher-suite
    string `TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384` will match a known
    `AES_256_GCM` or `RSA` row).
    """
    if not name:
        return None
    up = str(name).strip().upper()
    if not up:
        return None
    if up in algo_scores:
        return algo_scores[up]
    # Substring: scored name appears inside the candidate string
    best: Optional[Dict[str, Any]] = None
    best_len = 0
    for k, v in algo_scores.items():
        if len(k) < 3:
            continue
        if k in up and len(k) > best_len:
            best = v
            best_len = len(k)
    return best


@app.get("/api/elk/vulnerabilities")
def elk_vulnerabilities(
    threshold: float = Query(70, ge=0, le=100, description="Algorithms with score below this are listed"),
    type: str = Query("all", description="domain | repo | asset | all"),
    size: int = Query(500, ge=1, le=2000),
):
    """Flatten every algorithm occurrence across the latest scan of each asset,
    join with the score in crypto-algorithm-scores, and return those that fall
    below `threshold`.

    Returns a summary (asset / algorithm coverage stats), a histogram for
    charting, and a detailed list of findings with per-asset context.
    """
    index = TYPE_TO_INDEX.get(type)
    if not index:
        raise HTTPException(status_code=400, detail=f"Invalid type: {type}")

    algo_scores = _load_algorithm_scores()

    # Latest scan per asset, with raw payload for repo algorithms / asset audit
    body = {
        "size": size,
        "sort": [{"scanned_at": {"order": "desc"}}],
        "collapse": {"field": "asset_id"},
        "_source": True,
    }
    result = _safe_search(index, body)
    scans = [h["_source"] for h in result["hits"]["hits"]]

    findings: List[Dict[str, Any]] = []
    seen_algos: set = set()
    below_threshold_algos: set = set()
    assets_with_vulns: set = set()

    def _record(
        raw_name: str,
        meta: Optional[Dict[str, Any]],
        explicit_score: Optional[float],
        explicit_quantum_safe: Optional[bool],
        scan: Dict[str, Any],
        role: str,
        evidence: Dict[str, Any],
    ):
        if not raw_name:
            return
        up = str(raw_name).strip().upper()
        if not up:
            return
        score = explicit_score
        if score is None and meta:
            try:
                score = float(meta.get("base_score"))
            except (TypeError, ValueError):
                score = None
        if score is None:
            return  # unscored — cannot judge
        seen_algos.add(up)
        if score >= threshold:
            return
        below_threshold_algos.add(up)
        qsafe = explicit_quantum_safe
        if qsafe is None and meta:
            qsafe = meta.get("quantum_safe")
        findings.append({
            "algorithm": raw_name,
            "score": round(float(score), 1),
            "quantum_safe": bool(qsafe) if qsafe is not None else False,
            "component_type": (meta or {}).get("component_type"),
            "resistance": (meta or {}).get("resistance"),
            "reason": (meta or {}).get("reason"),
            "migration": (meta or {}).get("migration"),
            "source_type": scan.get("asset_type"),
            "asset_id": scan.get("asset_id"),
            "asset_label": scan.get("asset_label") or scan.get("asset_id"),
            "scan_id": scan.get("scan_id"),
            "scanned_at": scan.get("scanned_at"),
            "role": role,
            "evidence": evidence,
        })
        assets_with_vulns.add(scan.get("asset_id"))

    for s in scans:
        atype = s.get("asset_type")
        raw = s.get("raw") or {}

        if atype == "domain":
            candidates = [
                ("public_key_algorithm", s.get("public_key_algorithm")),
                ("signature_algorithm", s.get("primary_signature_algorithm")),
                ("hash_algorithm", s.get("primary_hash_algorithm")),
                ("cipher_suite", s.get("primary_cipher_suite")),
            ]
            base_evidence = {
                "url": s.get("url"),
                "tls_version": s.get("tls_version"),
                "cert_issuer": s.get("cert_issuer"),
                "cert_subject": s.get("cert_subject"),
                "cipher_suite": s.get("primary_cipher_suite"),
                "public_key_size_bits": s.get("public_key_size_bits"),
                "hsts_enabled": s.get("hsts_enabled"),
                "ocsp_stapling_active": s.get("ocsp_stapling_active"),
                "ct_present": s.get("ct_present"),
            }
            for role, algo_name in candidates:
                if not algo_name:
                    continue
                meta = _lookup_algo_meta(algo_name, algo_scores)
                _record(algo_name, meta, None, None, s, role, base_evidence)

        elif atype == "repo":
            algorithms = raw.get("algorithms") if isinstance(raw, dict) else None
            if not isinstance(algorithms, dict):
                # Fallback: at least surface the algorithm_names keyword list
                for algo_name in (s.get("algorithm_names") or []):
                    meta = _lookup_algo_meta(algo_name, algo_scores)
                    _record(algo_name, meta, None, None, s, "algorithm",
                            {"repo_url": s.get("repo_url"), "branch_name": s.get("branch_name")})
                continue

            for algo_name, algo_data in algorithms.items():
                if not isinstance(algo_data, dict):
                    continue
                meta = _lookup_algo_meta(algo_name, algo_scores)

                # Prefer scorer's explicit per-scan score, fall back to ES score
                explicit_score = None
                for key in ("score", "base_score", "weighted_score", "algorithm_score"):
                    v = algo_data.get(key)
                    if isinstance(v, (int, float)):
                        explicit_score = float(v)
                        break

                quantum_safe = algo_data.get("quantum_safe")

                algo_findings = algo_data.get("findings") or []
                files_seen: List[str] = []
                samples: List[Dict[str, Any]] = []
                for f in algo_findings:
                    if not isinstance(f, dict):
                        continue
                    fp = f.get("file_path")
                    if fp and fp not in files_seen:
                        files_seen.append(fp)
                    if len(samples) < 10:
                        samples.append({
                            "file_path": fp,
                            "line_number": f.get("line_number"),
                            "code_snippet": (f.get("code_snippet") or "")[:240],
                            "match_text": f.get("match_text"),
                        })

                evidence = {
                    "repo_url": s.get("repo_url"),
                    "branch_name": s.get("branch_name"),
                    "platform": s.get("platform"),
                    "findings_count": len(algo_findings) if isinstance(algo_findings, list) else 0,
                    "files": files_seen[:25],
                    "samples": samples,
                    "category": algo_data.get("category"),
                }
                _record(algo_name, meta, explicit_score, quantum_safe, s,
                        "code-finding", evidence)

        elif atype == "asset":
            audit = raw.get("audit_results") if isinstance(raw, dict) else None
            audit = audit if isinstance(audit, dict) else {}

            providers = (((audit.get("cryptoapi_info") or {}).get("cryptographic_providers")) or {}).get("providers", []) or []
            cipher_details = (((audit.get("tls_ssl_configuration") or {}).get("cipher_suites")) or {}).get("cipher_details", []) or []

            base_evidence = {
                "hostname": s.get("hostname"),
                "computer_name": s.get("computer_name"),
                "ip_address": s.get("ip_address"),
                "os_info": s.get("os_info"),
                "fips_mode_enabled": s.get("fips_mode_enabled"),
                "organization_name": s.get("organization_name"),
                "suborganization_name": s.get("suborganization_name"),
                "application_name": s.get("application_name"),
            }

            for p in providers if isinstance(providers, list) else []:
                name = p if isinstance(p, str) else (p.get("provider_name") if isinstance(p, dict) else None)
                meta = _lookup_algo_meta(name, algo_scores)
                if meta:
                    _record(name, meta, None, None, s, "crypto-provider",
                            {**base_evidence, "provider": p if isinstance(p, dict) else {"provider_name": p}})

            for c in cipher_details if isinstance(cipher_details, list) else []:
                name = c if isinstance(c, str) else (c.get("name") if isinstance(c, dict) else None)
                meta = _lookup_algo_meta(name, algo_scores)
                if meta:
                    _record(name, meta, None, None, s, "tls-cipher",
                            {**base_evidence, "cipher": c if isinstance(c, dict) else {"name": c}})

    # ---- Aggregate per-algorithm rollup for charting ----
    per_algo: Dict[str, Dict[str, Any]] = {}
    for f in findings:
        k = f["algorithm"].strip().upper()
        rec = per_algo.setdefault(k, {
            "algorithm": f["algorithm"],
            "score": f["score"],
            "quantum_safe": f["quantum_safe"],
            "component_type": f["component_type"],
            "occurrences": 0,
            "_assets": set(),
            "by_type": {"domain": 0, "repo": 0, "asset": 0},
        })
        rec["occurrences"] += 1
        rec["_assets"].add(f["asset_id"])
        st = f.get("source_type")
        if st in rec["by_type"]:
            rec["by_type"][st] += 1

    histogram = []
    for v in per_algo.values():
        histogram.append({
            "algorithm": v["algorithm"],
            "score": v["score"],
            "quantum_safe": v["quantum_safe"],
            "component_type": v["component_type"],
            "occurrences": v["occurrences"],
            "assets_affected": len(v["_assets"]),
            "by_type": v["by_type"],
        })
    histogram.sort(key=lambda x: (x["score"], -x["occurrences"]))

    total_assets = len(scans)
    pct_assets_affected = round((len(assets_with_vulns) / total_assets * 100), 1) if total_assets else 0.0
    pct_algos_below = round((len(below_threshold_algos) / len(seen_algos) * 100), 1) if seen_algos else 0.0

    return {
        "threshold": threshold,
        "type": type,
        "summary": {
            "total_assets_scanned": total_assets,
            "assets_with_vulnerabilities": len(assets_with_vulns),
            "assets_with_vulnerabilities_pct": pct_assets_affected,
            "unique_algorithms_found": len(seen_algos),
            "algorithms_below_threshold": len(below_threshold_algos),
            "algorithms_below_threshold_pct": pct_algos_below,
            "total_findings": len(findings),
        },
        "histogram": histogram,
        "findings": findings,
    }



CACHE_VERSION_DOC_ID = "algorithm-scores-version"


def _touch_scores_version() -> None:
    """
    Write a version timestamp to ES whenever algorithm scores are changed.
    Scoring engines do a cheap GET of this doc at the start of each scan and
    reload their cache immediately if the timestamp is newer than their last load.
    """
    try:
        es.index(
            index=CACHE_VERSION_INDEX,
            id=CACHE_VERSION_DOC_ID,
            document={
                "last_modified": time.time(),
                "updated_at": datetime.now(timezone.utc).isoformat() + "Z",
            },
        )
    except Exception as exc:
        logger.warning("Could not update scores version marker: %s", exc)


@app.get("/api/algorithms")
def list_algorithms(
    component_type: Optional[str] = Query(None),
    quantum_safe: Optional[bool] = Query(None),
    active: bool = Query(True),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    """
    List all algorithms with optional filters.
    
    Args:
        component_type: Filter by 'kex', 'signature', 'symmetric', 'hash', 'protocol'
        quantum_safe: Filter by quantum_safe true/false
        active: Filter by active status (default: True = only active)
        page: Page number (1-indexed)
        page_size: Results per page
    """
    filters = [{"term": {"active": active}}]
    if component_type:
        filters.append({"term": {"component_type": component_type}})
    if quantum_safe is not None:
        filters.append({"term": {"quantum_safe": quantum_safe}})
    
    body = {
        "query": {"bool": {"must": filters}},
        "size": page_size,
        "from": (page - 1) * page_size,
        "sort": [{"algorithm": {"order": "asc"}}],
    }
    
    result = _safe_search(ALGO_INDEX, body)
    total = result["hits"]["total"]["value"]
    algorithms = [
        {
            "id": hit["_id"],
            **hit["_source"]
        }
        for hit in result["hits"]["hits"]
    ]
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "algorithms": algorithms,
    }


@app.get("/api/algorithms/{name}")
def get_algorithm(name: str):
    """Get a specific algorithm by name."""
    body = {"query": {"term": {"algorithm": {"value": name}}}}
    result = _safe_search(ALGO_INDEX, body)
    
    if result["hits"]["total"]["value"] == 0:
        raise HTTPException(status_code=404, detail=f"Algorithm '{name}' not found")
    
    hit = result["hits"]["hits"][0]
    return {
        "id": hit["_id"],
        **hit["_source"]
    }


@app.post("/api/algorithms")
def create_algorithm(body: Dict[str, Any]):
    """
    Create a new algorithm score entry.
    
    Required fields:
      - algorithm: str (name)
      - component_type: str (kex, signature, symmetric, hash, protocol)
      - base_score: float (0-100)
      - quantum_safe: bool
      - resistance: str (vulnerable, deprecated, grover_resistant, etc)
    
    Optional fields:
      - reason: str
      - migration: str
      - variants: dict
      - category: str
      - tags: list[str]
    """
    algo_name = body.get("algorithm", "").upper()
    
    if not algo_name:
        raise HTTPException(status_code=400, detail="'algorithm' field is required")
    
    if not isinstance(body.get("base_score"), (int, float)):
        raise HTTPException(status_code=400, detail="'base_score' must be a number")
    
    # Check if already exists
    existing = _safe_search(ALGO_INDEX, {"query": {"term": {"algorithm": {"value": algo_name}}}})
    if existing["hits"]["total"]["value"] > 0:
        raise HTTPException(status_code=409, detail=f"Algorithm '{algo_name}' already exists")
    
    # Prepare document
    now = datetime.now(timezone.utc).isoformat() + "Z"
    doc = {
        "algorithm": algo_name,
        "component_type": body.get("component_type", "unknown"),
        "base_score": float(body.get("base_score", 0)),
        "quantum_safe": bool(body.get("quantum_safe", False)),
        "resistance": body.get("resistance", "unknown"),
        "category": body.get("category", "unknown"),
        "reason": body.get("reason", ""),
        "migration": body.get("migration", ""),
        "active": True,
        "created_at": now,
        "last_updated": now,
        "tags": body.get("tags", []),
    }
    
    if "variants" in body:
        doc["variants"] = body["variants"]
    
    # Insert
    result = es.index(index=ALGO_INDEX, document=doc)
    _touch_scores_version()
    return {
        "id": result["_id"],
        "algorithm": algo_name,
        "status": "created",
        "message": f"Algorithm '{algo_name}' created successfully",
    }


@app.put("/api/algorithms/{name}")
def update_algorithm(name: str, body: Dict[str, Any]):
    """
    Update an algorithm score entry.
    
    Updatable fields:
      - base_score, quantum_safe, resistance, category, reason, migration, variants, tags, active
    """
    # Get existing doc
    existing_result = _safe_search(ALGO_INDEX, {"query": {"term": {"algorithm": {"value": name.upper()}}}})
    
    if existing_result["hits"]["total"]["value"] == 0:
        raise HTTPException(status_code=404, detail=f"Algorithm '{name}' not found")
    
    hit = existing_result["hits"]["hits"][0]
    doc_id = hit["_id"]
    doc = hit["_source"]
    
    # Update allowed fields
    updatable_fields = [
        "base_score", "quantum_safe", "resistance", "category",
        "reason", "migration", "variants", "tags", "active"
    ]
    
    for field in updatable_fields:
        if field in body:
            doc[field] = body[field]
    
    doc["last_updated"] = datetime.now(timezone.utc).isoformat() + "Z"
    
    # Save
    es.index(index=ALGO_INDEX, id=doc_id, document=doc)
    _touch_scores_version()
    return {
        "algorithm": name,
        "status": "updated",
        "message": f"Algorithm '{name}' updated successfully",
    }


@app.delete("/api/algorithms/{name}")
def delete_algorithm(name: str):
    """Mark an algorithm as inactive (soft delete)."""
    # Get existing doc
    existing_result = _safe_search(ALGO_INDEX, {"query": {"term": {"algorithm": {"value": name.upper()}}}})
    
    if existing_result["hits"]["total"]["value"] == 0:
        raise HTTPException(status_code=404, detail=f"Algorithm '{name}' not found")
    
    hit = existing_result["hits"]["hits"][0]
    doc_id = hit["_id"]
    doc = hit["_source"]
    
    # Mark as inactive instead of hard delete
    doc["active"] = False
    doc["last_updated"] = datetime.now(timezone.utc).isoformat() + "Z"
    
    es.index(index=ALGO_INDEX, id=doc_id, document=doc)
    _touch_scores_version()
    return {
        "algorithm": name,
        "status": "deactivated",
        "message": f"Algorithm '{name}' marked as inactive",
    }


@app.post("/api/algorithms/_reload-cache")
def reload_cache():
    """
    Notify scoring engines to reload algorithm cache from ES.
    Returns stats about the current cache.
    """
    result = _safe_search(ALGO_INDEX, {
        "query": {"term": {"active": True}},
        "size": 10000,
    })
    
    total_active = result["hits"]["total"]["value"]
    algorithms = [hit["_source"]["algorithm"] for hit in result["hits"]["hits"]]
    
    return {
        "status": "cache_reload_triggered",
        "message": "Scoring engines should reload their algorithm cache from Elasticsearch",
        "total_active_algorithms": total_active,
        "sample_algorithms": algorithms[:10],
    }

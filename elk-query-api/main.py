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
"""
import os
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

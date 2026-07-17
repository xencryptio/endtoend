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
import json
import logging
import uuid
import csv
import io
import re
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk as es_bulk
import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("elk-query-api")

ES_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
es = Elasticsearch(ES_URL, request_timeout=30)

# Downstream scanner endpoints (used for ELK-direct onboarding scan triggering).
# Container-network defaults — overridable via env.
TLS_SCANNER_URL = os.getenv("TLS_SCANNER_URL", "http://crypto-scanner:8000")
REPO_SCANNER_URL = os.getenv("REPO_SCANNER_URL", "http://repo-scanner:8001")
SYSTEM_SCAN_URL = os.getenv("SYSTEM_SCAN_URL", "http://system-scan:9000")

app = FastAPI(title="ELK Query API", version="1.1.0")
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

# ELK-direct onboarding / application indices
ONBOARDING_ORGS_INDEX = "onboarding-orgs"
ONBOARDING_BATCHES_INDEX = "onboarding-batches"

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
    _auto_snapshot_after_write()
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
    _auto_snapshot_after_write()
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
    _auto_snapshot_after_write()
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


# ===========================================================================
# /api/algorithms/_backup{,s}, /_restore, /_restore_baseline
# ---------------------------------------------------------------------------
# The algorithm-scores index is critical and has been wiped before by accident
# (`docker compose down -v`). Three layers of defence:
#   1. algo-backups/baseline.json  — immutable golden snapshot (git-tracked)
#   2. algo-backups/snapshot-*.json — user-triggered backups via the UI
#   3. algo-backups/auto-last.json — rolling snapshot written by every write
# All three live on the host (mounted into the container) so even a full
# Elasticsearch volume wipe cannot lose them.
# ===========================================================================
ALGO_BACKUPS_DIR = Path(os.getenv("ALGO_BACKUPS_DIR", "/app/backups"))
BASELINE_NAME = "baseline.json"
AUTO_LAST_NAME = "auto-last.json"
_SAFE_BACKUP_NAME = re.compile(r"^[A-Za-z0-9._-]+\.json$")


def _ensure_backups_dir() -> Path:
    try:
        ALGO_BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        logger.warning("Could not create backups dir %s: %s", ALGO_BACKUPS_DIR, exc)
    return ALGO_BACKUPS_DIR


def _snapshot_index_to_dict() -> Dict[str, Any]:
    """Read every doc in ALGO_INDEX (active+inactive) and return a backup payload."""
    docs: List[Dict[str, Any]] = []
    try:
        # Use scroll so we never silently drop docs past the default 10k window.
        resp = es.search(
            index=ALGO_INDEX,
            scroll="2m",
            size=1000,
            body={"query": {"match_all": {}}},
        )
        scroll_id = resp.get("_scroll_id")
        hits = resp["hits"]["hits"]
        while hits:
            for h in hits:
                docs.append({"_id": h["_id"], "_source": h.get("_source", {})})
            if not scroll_id:
                break
            resp = es.scroll(scroll_id=scroll_id, scroll="2m")
            scroll_id = resp.get("_scroll_id")
            hits = resp["hits"]["hits"]
    except Exception as exc:
        logger.warning("Snapshot read failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Could not read index: {exc}")

    return {
        "kind": "crypto-algorithm-scores-backup",
        "version": 1,
        "index": ALGO_INDEX,
        "created_at": datetime.now(timezone.utc).isoformat() + "Z",
        "count": len(docs),
        "docs": docs,
    }


def _write_backup_file(path: Path, payload: Dict[str, Any]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    tmp.replace(path)


def _auto_snapshot_after_write() -> None:
    """Best-effort rolling backup written after every create/update/delete."""
    try:
        _ensure_backups_dir()
        payload = _snapshot_index_to_dict()
        _write_backup_file(ALGO_BACKUPS_DIR / AUTO_LAST_NAME, payload)
    except Exception as exc:
        logger.warning("auto-last snapshot failed: %s", exc)


def _restore_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Wipe ALGO_INDEX and bulk-reindex every doc from the backup payload."""
    docs = payload.get("docs") or []
    if not isinstance(docs, list) or not docs:
        raise HTTPException(status_code=400, detail="Backup contains no docs")

    # Before destructive restore, drop a "pre-restore" snapshot of current state
    # so the user can always undo a restore.
    try:
        _ensure_backups_dir()
        current = _snapshot_index_to_dict()
        if current.get("count"):
            stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
            _write_backup_file(
                ALGO_BACKUPS_DIR / f"pre-restore-{stamp}.json", current
            )
    except Exception as exc:
        logger.warning("Could not write pre-restore snapshot: %s", exc)

    # Delete and recreate index. Mapping is recreated permissively — the
    # docs already carry their own field types; explicit mapping isn't needed
    # for a restore since the source-of-truth seed creates it on first run.
    try:
        if es.indices.exists(index=ALGO_INDEX):
            es.indices.delete(index=ALGO_INDEX)
        es.indices.create(
            index=ALGO_INDEX,
            mappings={
                "properties": {
                    "algorithm": {"type": "keyword"},
                    "component_type": {"type": "keyword"},
                    "base_score": {"type": "float"},
                    "quantum_safe": {"type": "boolean"},
                    "resistance": {"type": "keyword"},
                    "category": {"type": "keyword"},
                    "reason": {"type": "text"},
                    "migration": {"type": "text"},
                    "variants": {"type": "object", "enabled": True},
                    "active": {"type": "boolean"},
                    "created_at": {"type": "date"},
                    "last_updated": {"type": "date"},
                    "tags": {"type": "keyword"},
                }
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not recreate index: {exc}")

    actions = []
    for d in docs:
        src = d.get("_source") or {}
        if not src:
            continue
        action = {"_op_type": "index", "_index": ALGO_INDEX, "_source": src}
        if d.get("_id"):
            action["_id"] = d["_id"]
        actions.append(action)

    success, errors = es_bulk(es, actions, raise_on_error=False, stats_only=False)
    try:
        es.indices.refresh(index=ALGO_INDEX)
    except Exception:
        pass

    _touch_scores_version()

    return {
        "status": "restored",
        "restored": success,
        "errors": len(errors) if isinstance(errors, list) else 0,
        "source_count": len(docs),
    }


@app.get("/api/algorithm-backups")
def list_backups():
    """List available backup files on disk."""
    _ensure_backups_dir()
    items: List[Dict[str, Any]] = []
    if ALGO_BACKUPS_DIR.exists():
        for p in sorted(ALGO_BACKUPS_DIR.iterdir(), reverse=True):
            if not p.is_file() or not p.name.endswith(".json"):
                continue
            stat = p.stat()
            count = None
            created_at = None
            try:
                # Cheap header peek: read first 4 KB only.
                with p.open("r", encoding="utf-8") as f:
                    head = f.read(4096)
                m = re.search(r'"count"\s*:\s*(\d+)', head)
                if m:
                    count = int(m.group(1))
                m2 = re.search(r'"created_at"\s*:\s*"([^"]+)"', head)
                if m2:
                    created_at = m2.group(1)
            except Exception:
                pass
            items.append({
                "name": p.name,
                "size_bytes": stat.st_size,
                "modified_at": datetime.fromtimestamp(
                    stat.st_mtime, tz=timezone.utc
                ).isoformat(),
                "created_at": created_at,
                "count": count,
                "is_baseline": p.name == BASELINE_NAME,
                "is_auto": p.name == AUTO_LAST_NAME,
            })
    return {"total": len(items), "backups": items}


@app.post("/api/algorithm-backups")
def create_backup(body: Optional[Dict[str, Any]] = None):
    """
    Create a new on-disk snapshot of the current algorithm-scores index.

    Optional body: {"label": "before-tuning"} → filename becomes
    snapshot-YYYYMMDD-HHMMSS-before-tuning.json. Otherwise just the timestamp.
    """
    _ensure_backups_dir()
    payload = _snapshot_index_to_dict()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    label = ""
    if body and isinstance(body.get("label"), str):
        clean = re.sub(r"[^A-Za-z0-9._-]+", "-", body["label"].strip()).strip("-")
        if clean:
            label = "-" + clean[:40]
    name = f"snapshot-{stamp}{label}.json"
    _write_backup_file(ALGO_BACKUPS_DIR / name, payload)
    return {
        "status": "created",
        "name": name,
        "count": payload["count"],
        "created_at": payload["created_at"],
    }


@app.post("/api/algorithm-backups/_restore")
def restore_backup(body: Dict[str, Any]):
    """
    Restore the algorithm-scores index from a named backup file.
    Body: {"name": "snapshot-20260630-181500.json"}
    """
    name = (body or {}).get("name")
    if not isinstance(name, str) or not _SAFE_BACKUP_NAME.match(name):
        raise HTTPException(status_code=400, detail="Invalid backup name")
    path = ALGO_BACKUPS_DIR / name
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail=f"Backup not found: {name}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Bad backup file: {exc}")
    if payload.get("kind") != "crypto-algorithm-scores-backup":
        raise HTTPException(status_code=400, detail="Not an algorithm-scores backup")
    result = _restore_from_payload(payload)
    result["from"] = name
    return result


@app.post("/api/algorithm-backups/_restore_baseline")
def restore_baseline():
    """Restore from the immutable golden baseline.json bundled with the app."""
    path = ALGO_BACKUPS_DIR / BASELINE_NAME
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"baseline.json not found at {path}. "
                   "Check that ./algo-backups is mounted into the container.",
        )
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Bad baseline file: {exc}")
    result = _restore_from_payload(payload)
    result["from"] = BASELINE_NAME
    return result


@app.delete("/api/algorithm-backups/{name}")
def delete_backup(name: str):
    """Delete an on-disk snapshot. The immutable baseline cannot be deleted."""
    if not _SAFE_BACKUP_NAME.match(name):
        raise HTTPException(status_code=400, detail="Invalid backup name")
    if name == BASELINE_NAME:
        raise HTTPException(status_code=403, detail="The baseline backup is protected")
    path = ALGO_BACKUPS_DIR / name
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Backup not found: {name}")
    path.unlink()
    return {"status": "deleted", "name": name}


# ===========================================================================
# ELK-DIRECT ONBOARDING & APPLICATIONS
# ===========================================================================
# Self-contained onboarding pipeline that:
#   1. Stores the org -> suborg -> app hierarchy in `onboarding-orgs`
#   2. Tracks the submission in `onboarding-batches`
#   3. Fires scan-triggers directly at crypto-scanner / repo-scanner
#   4. Lets the Applications page join the hierarchy with crypto-scans-* docs
# ---------------------------------------------------------------------------

# ----- Pydantic input shapes -----
class _RepoIn(BaseModel):
    repo_url: str
    repo_name: Optional[str] = None
    branch_to_scan: Optional[str] = "main"


class _DomainIn(BaseModel):
    domain: str


class _ServerIn(BaseModel):
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    operating_system: Optional[str] = "Linux"


class _AppIn(BaseModel):
    application_name: str
    repositories: List[_RepoIn] = Field(default_factory=list)
    domains: List[_DomainIn] = Field(default_factory=list)
    servers: List[_ServerIn] = Field(default_factory=list)


class _SubOrgIn(BaseModel):
    suborganization_name: str
    applications: List[_AppIn] = Field(default_factory=list)


class _OrgIn(BaseModel):
    organization_name: str
    organization_email: Optional[str] = None


class OnboardingELKPayload(BaseModel):
    organization: _OrgIn
    created_by: Optional[str] = None
    trigger_scans: bool = True
    suborganizations: List[_SubOrgIn] = Field(default_factory=list)
    # Flat top-level resources (rare, but accepted for parity with legacy)
    repositories: List[_RepoIn] = Field(default_factory=list)
    domains: List[_DomainIn] = Field(default_factory=list)
    servers: List[_ServerIn] = Field(default_factory=list)


# ----- Helpers -----
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _domain_asset_id(domain: str) -> str:
    d = (domain or "").strip().lower()
    # Strip protocol if user pasted full URL
    if "://" in d:
        d = d.split("://", 1)[1]
    # Strip trailing path
    d = d.split("/", 1)[0]
    # Match scanner convention: drop leading www.
    if d.startswith("www."):
        d = d[4:]
    return f"domain:{d}"


def _repo_asset_id(repo_url: str) -> str:
    u = (repo_url or "").strip().rstrip("/")
    # Normalise so both "...repo" and "...repo.git" collapse to the same id
    if u.endswith(".git"):
        u = u[:-4]
    # Match scanner convention: stored asset_id ends with ".git"
    return f"repo:{u}.git"


def _asset_asset_id(agent_id: str) -> str:
    return f"asset:{agent_id}"


def _ensure_onboarding_indices() -> None:
    """Create lightweight indices if they don't exist (dynamic mapping)."""
    for idx in (ONBOARDING_ORGS_INDEX, ONBOARDING_BATCHES_INDEX):
        try:
            if not es.indices.exists(index=idx):
                es.indices.create(
                    index=idx,
                    body={
                        "settings": {"number_of_shards": 1, "number_of_replicas": 0},
                        "mappings": {"dynamic": "true"},
                    },
                )
                logger.info(f"Created index {idx}")
        except Exception as e:
            logger.warning(f"Could not ensure index {idx}: {e}")


async def _trigger_domain_scan(client: httpx.AsyncClient, domain: str) -> Dict[str, Any]:
    try:
        r = await client.post(
            f"{TLS_SCANNER_URL}/scan",
            json={"domain": domain, "save_to_db": True},
            timeout=10.0,
        )
        return {"domain": domain, "ok": r.status_code < 400, "status_code": r.status_code}
    except Exception as e:
        return {"domain": domain, "ok": False, "error": str(e)}


async def _trigger_repo_scan(client: httpx.AsyncClient, repo_url: str, branch: str) -> Dict[str, Any]:
    try:
        r = await client.post(
            f"{REPO_SCANNER_URL}/api/scan",
            json={"repo_url": repo_url, "branch_name": branch or "main"},
            timeout=10.0,
        )
        return {"repo_url": repo_url, "branch": branch, "ok": r.status_code < 400, "status_code": r.status_code}
    except Exception as e:
        return {"repo_url": repo_url, "branch": branch, "ok": False, "error": str(e)}


async def _fire_scans(
    repos: List[Dict[str, Any]],
    domains: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Fire scan triggers in parallel and return the outcome of each call."""
    out = {"repos": [], "domains": []}
    async with httpx.AsyncClient() as client:
        tasks = []
        for r in repos:
            url = r.get("repo_url")
            if not url:
                continue
            tasks.append(("repo", _trigger_repo_scan(client, url, r.get("branch_to_scan") or "main")))
        for d in domains:
            dom = d.get("domain")
            if not dom:
                continue
            tasks.append(("domain", _trigger_domain_scan(client, dom)))

        if not tasks:
            return out

        results = await asyncio.gather(*[t[1] for t in tasks], return_exceptions=True)
        for (kind, _), res in zip(tasks, results):
            if isinstance(res, Exception):
                out[("repos" if kind == "repo" else "domains")].append({"ok": False, "error": str(res)})
            else:
                out[("repos" if kind == "repo" else "domains")].append(res)
    return out


def _normalise_payload(payload: OnboardingELKPayload) -> Dict[str, Any]:
    """Build the canonical org-hierarchy document that goes into ES."""
    now = _now_iso()
    org_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, payload.organization.organization_name.strip().lower()))

    # Top-level flat resources -> attach to a virtual "Default" suborg/app if present
    suborgs: List[Dict[str, Any]] = []

    if payload.repositories or payload.domains or payload.servers:
        default_app = {
            "app_id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{org_id}|default|default")),
            "application_name": "Default",
            "repositories": [
                {
                    "repo_url": r.repo_url,
                    "repo_name": r.repo_name or r.repo_url.rsplit("/", 1)[-1],
                    "branch_to_scan": r.branch_to_scan or "main",
                    "asset_id": _repo_asset_id(r.repo_url),
                }
                for r in payload.repositories
            ],
            "domains": [
                {"domain": d.domain, "asset_id": _domain_asset_id(d.domain)}
                for d in payload.domains
            ],
            "servers": [s.model_dump() for s in payload.servers],
        }
        suborgs.append(
            {
                "suborg_id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{org_id}|default")),
                "suborganization_name": "Default",
                "applications": [default_app],
            }
        )

    for so in payload.suborganizations:
        so_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{org_id}|{so.suborganization_name.strip().lower()}"))
        apps = []
        for app in so.applications:
            app_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{so_id}|{app.application_name.strip().lower()}"))
            apps.append(
                {
                    "app_id": app_id,
                    "application_name": app.application_name,
                    "repositories": [
                        {
                            "repo_url": r.repo_url,
                            "repo_name": r.repo_name or r.repo_url.rsplit("/", 1)[-1],
                            "branch_to_scan": r.branch_to_scan or "main",
                            "asset_id": _repo_asset_id(r.repo_url),
                        }
                        for r in app.repositories
                    ],
                    "domains": [
                        {"domain": d.domain, "asset_id": _domain_asset_id(d.domain)}
                        for d in app.domains
                    ],
                    "servers": [s.model_dump() for s in app.servers],
                }
            )
        suborgs.append(
            {
                "suborg_id": so_id,
                "suborganization_name": so.suborganization_name,
                "applications": apps,
            }
        )

    # Counters
    total_repos = sum(len(a.get("repositories", [])) for so in suborgs for a in so.get("applications", []))
    total_domains = sum(len(a.get("domains", [])) for so in suborgs for a in so.get("applications", []))
    total_servers = sum(len(a.get("servers", [])) for so in suborgs for a in so.get("applications", []))
    total_apps = sum(len(so.get("applications", [])) for so in suborgs)

    doc = {
        "org_id": org_id,
        "organization_name": payload.organization.organization_name,
        "organization_email": payload.organization.organization_email,
        "created_by": payload.created_by,
        "created_at": now,
        "updated_at": now,
        "suborganizations": suborgs,
        "totals": {
            "suborganizations": len(suborgs),
            "applications": total_apps,
            "repositories": total_repos,
            "domains": total_domains,
            "servers": total_servers,
        },
    }
    return doc


def _merge_existing_org(new_doc: Dict[str, Any]) -> Dict[str, Any]:
    """If the org doc already exists, merge new resources into it (idempotent re-onboarding)."""
    try:
        existing = es.get(index=ONBOARDING_ORGS_INDEX, id=new_doc["org_id"], ignore=[404])
        if not existing or not existing.get("found"):
            return new_doc
        old = existing["_source"]
    except Exception:
        return new_doc

    old_suborgs = {so["suborg_id"]: so for so in (old.get("suborganizations") or [])}
    for so in new_doc["suborganizations"]:
        if so["suborg_id"] not in old_suborgs:
            old_suborgs[so["suborg_id"]] = so
            continue
        existing_so = old_suborgs[so["suborg_id"]]
        old_apps = {a["app_id"]: a for a in (existing_so.get("applications") or [])}
        for app in so.get("applications", []):
            if app["app_id"] not in old_apps:
                old_apps[app["app_id"]] = app
                continue
            existing_app = old_apps[app["app_id"]]
            # Merge resources by their natural keys
            existing_app["repositories"] = list({r["repo_url"]: r for r in (existing_app.get("repositories") or []) + app.get("repositories", [])}.values())
            existing_app["domains"] = list({d["domain"]: d for d in (existing_app.get("domains") or []) + app.get("domains", [])}.values())
            # Servers keyed by hostname|ip
            seen = {}
            for s in (existing_app.get("servers") or []) + app.get("servers", []):
                k = f"{s.get('hostname') or ''}|{s.get('ip_address') or ''}"
                seen[k] = s
            existing_app["servers"] = list(seen.values())
            old_apps[app["app_id"]] = existing_app
        existing_so["applications"] = list(old_apps.values())
        old_suborgs[so["suborg_id"]] = existing_so

    merged = old
    merged["suborganizations"] = list(old_suborgs.values())
    merged["updated_at"] = _now_iso()
    # Recompute totals
    merged["totals"] = {
        "suborganizations": len(merged["suborganizations"]),
        "applications": sum(len(so.get("applications", [])) for so in merged["suborganizations"]),
        "repositories": sum(len(a.get("repositories", [])) for so in merged["suborganizations"] for a in so.get("applications", [])),
        "domains": sum(len(a.get("domains", [])) for so in merged["suborganizations"] for a in so.get("applications", [])),
        "servers": sum(len(a.get("servers", [])) for so in merged["suborganizations"] for a in so.get("applications", [])),
    }
    return merged


def _collect_scan_targets(doc: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    """Walk the org doc and return flat lists of every repo and domain."""
    repos: List[Dict[str, Any]] = []
    domains: List[Dict[str, Any]] = []
    for so in doc.get("suborganizations", []):
        for app in so.get("applications", []):
            for r in app.get("repositories", []) or []:
                repos.append(r)
            for d in app.get("domains", []) or []:
                domains.append(d)
    return {"repositories": repos, "domains": domains}


# ----- CSV template / parser -----
CSV_HEADERS = [
    "organization_name",
    "organization_email",
    "suborganization_name",
    "application_name",
    "repo_url",
    "repo_name",
    "branch_to_scan",
    "domain",
    "hostname",
    "ip_address",
    "operating_system",
]

CSV_EXAMPLE_ROWS = [
    ["Acme Corp", "security@acme.com", "Cloud", "Web App", "https://github.com/acme/webapp", "webapp", "main", "www.acme.com", "web-1", "192.168.1.10", "Linux"],
    ["Acme Corp", "security@acme.com", "Cloud", "Web App", "https://github.com/acme/api", "api", "develop", "api.acme.com", "", "", ""],
    ["Acme Corp", "security@acme.com", "Mobile", "Android App", "", "", "", "m.acme.com", "android-build-1", "192.168.2.10", "Linux"],
]


def _csv_to_payload(content: bytes, created_by: Optional[str], trigger_scans: bool) -> OnboardingELKPayload:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    # First non-empty org_name wins
    org_name = None
    org_email = None
    for r in rows:
        v = (r.get("organization_name") or "").strip()
        if v:
            org_name = v
            org_email = (r.get("organization_email") or "").strip() or None
            break
    if not org_name:
        raise HTTPException(status_code=400, detail="CSV must include at least one organization_name value")

    # Group: suborg -> app -> {repos, domains, servers}
    tree: Dict[str, Dict[str, Dict[str, List[Any]]]] = {}
    for r in rows:
        so = (r.get("suborganization_name") or "").strip()
        ap = (r.get("application_name") or "").strip()
        if not so or not ap:
            continue
        so_bucket = tree.setdefault(so, {})
        app_bucket = so_bucket.setdefault(ap, {"repositories": [], "domains": [], "servers": []})

        repo_url = (r.get("repo_url") or "").strip()
        if repo_url and not any(x["repo_url"] == repo_url for x in app_bucket["repositories"]):
            app_bucket["repositories"].append(
                {
                    "repo_url": repo_url,
                    "repo_name": (r.get("repo_name") or repo_url.rsplit("/", 1)[-1]).strip(),
                    "branch_to_scan": (r.get("branch_to_scan") or "main").strip() or "main",
                }
            )

        dom = (r.get("domain") or "").strip()
        if dom and not any(x["domain"] == dom for x in app_bucket["domains"]):
            app_bucket["domains"].append({"domain": dom})

        host = (r.get("hostname") or "").strip()
        ip = (r.get("ip_address") or "").strip()
        if host or ip:
            key = (host, ip)
            if not any((s.get("hostname"), s.get("ip_address")) == key for s in app_bucket["servers"]):
                app_bucket["servers"].append(
                    {
                        "hostname": host or None,
                        "ip_address": ip or None,
                        "operating_system": (r.get("operating_system") or "Linux").strip() or "Linux",
                    }
                )

    suborgs: List[_SubOrgIn] = []
    for so_name, apps in tree.items():
        applications: List[_AppIn] = []
        for ap_name, res in apps.items():
            applications.append(
                _AppIn(
                    application_name=ap_name,
                    repositories=[_RepoIn(**x) for x in res["repositories"]],
                    domains=[_DomainIn(**x) for x in res["domains"]],
                    servers=[_ServerIn(**x) for x in res["servers"]],
                )
            )
        suborgs.append(_SubOrgIn(suborganization_name=so_name, applications=applications))

    return OnboardingELKPayload(
        organization=_OrgIn(organization_name=org_name, organization_email=org_email),
        created_by=created_by,
        trigger_scans=trigger_scans,
        suborganizations=suborgs,
    )


# ---------------------------------------------------------------------------
# Onboarding endpoints
# ---------------------------------------------------------------------------
@app.post("/api/elk/onboarding")
async def elk_onboarding_json(payload: OnboardingELKPayload):
    """Onboard an organization directly into Elasticsearch and optionally
    trigger scans for every domain and repository in the hierarchy."""
    _ensure_onboarding_indices()
    doc = _normalise_payload(payload)
    merged = _merge_existing_org(doc)

    try:
        es.index(index=ONBOARDING_ORGS_INDEX, id=merged["org_id"], document=merged, refresh="wait_for")
    except Exception as e:
        logger.exception("Failed to write org doc")
        raise HTTPException(status_code=500, detail=f"Could not index org: {e}")

    targets = _collect_scan_targets(doc)  # only NEW ones from this submission
    triggered = {"repos": [], "domains": []}
    if payload.trigger_scans:
        triggered = await _fire_scans(targets["repositories"], targets["domains"])

    batch_id = str(uuid.uuid4())
    batch_doc = {
        "batch_id": batch_id,
        "org_id": merged["org_id"],
        "organization_name": merged["organization_name"],
        "created_by": payload.created_by,
        "submitted_at": _now_iso(),
        "source": "json",
        "trigger_scans": payload.trigger_scans,
        "totals": {
            "repositories": len(targets["repositories"]),
            "domains": len(targets["domains"]),
            "servers": sum(len(a.get("servers", [])) for so in doc["suborganizations"] for a in so.get("applications", [])),
        },
        "triggered": {
            "repos_ok": sum(1 for r in triggered["repos"] if r.get("ok")),
            "repos_failed": sum(1 for r in triggered["repos"] if not r.get("ok")),
            "domains_ok": sum(1 for d in triggered["domains"] if d.get("ok")),
            "domains_failed": sum(1 for d in triggered["domains"] if not d.get("ok")),
            "details": triggered,
        },
    }
    try:
        es.index(index=ONBOARDING_BATCHES_INDEX, id=batch_id, document=batch_doc, refresh="wait_for")
    except Exception as e:
        logger.warning(f"Could not index batch doc: {e}")

    return {
        "ok": True,
        "org_id": merged["org_id"],
        "batch_id": batch_id,
        "totals": merged["totals"],
        "triggered": batch_doc["triggered"],
    }


@app.post("/api/elk/onboarding/csv")
async def elk_onboarding_csv(
    file: UploadFile = File(...),
    created_by: Optional[str] = Form(None),
    trigger_scans: bool = Form(True),
):
    """CSV onboarding — same outcome as JSON onboarding."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty CSV file")
    payload = _csv_to_payload(content, created_by, trigger_scans)
    return await elk_onboarding_json(payload)


@app.get("/api/elk/onboarding/csv-template")
def elk_onboarding_csv_template():
    """Download a CSV template with example rows."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_HEADERS)
    for row in CSV_EXAMPLE_ROWS:
        writer.writerow(row)
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=onboarding_template_elk.csv"},
    )


@app.get("/api/elk/onboarding/batches")
def elk_onboarding_batches(size: int = Query(100, ge=1, le=500)):
    _ensure_onboarding_indices()
    body = {
        "size": size,
        "sort": [{"submitted_at": {"order": "desc"}}],
    }
    res = _safe_search(ONBOARDING_BATCHES_INDEX, body)
    return {
        "total": res["hits"]["total"]["value"] if isinstance(res["hits"]["total"], dict) else res["hits"]["total"],
        "batches": [h["_source"] for h in res["hits"]["hits"]],
    }


@app.delete("/api/elk/onboarding/batches/{batch_id}")
def elk_onboarding_batch_delete(batch_id: str):
    try:
        es.delete(index=ONBOARDING_BATCHES_INDEX, id=batch_id)
        return {"deleted": True, "batch_id": batch_id}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Batch not found: {e}")


@app.get("/api/elk/onboarding/organizations")
def elk_onboarding_organizations(size: int = Query(200, ge=1, le=1000)):
    """List all onboarded organizations with totals (no full hierarchy)."""
    _ensure_onboarding_indices()
    body = {
        "size": size,
        "sort": [{"updated_at": {"order": "desc"}}],
        "_source": ["org_id", "organization_name", "organization_email", "created_by", "created_at", "updated_at", "totals"],
    }
    res = _safe_search(ONBOARDING_ORGS_INDEX, body)
    return {
        "total": res["hits"]["total"]["value"] if isinstance(res["hits"]["total"], dict) else res["hits"]["total"],
        "organizations": [h["_source"] for h in res["hits"]["hits"]],
    }


@app.get("/api/elk/onboarding/organizations/{org_id}")
def elk_onboarding_organization_detail(org_id: str):
    """Full hierarchy for one organization."""
    try:
        doc = es.get(index=ONBOARDING_ORGS_INDEX, id=org_id)
        return doc["_source"]
    except Exception:
        raise HTTPException(status_code=404, detail="Organization not found")


@app.delete("/api/elk/onboarding/organizations/{org_id}")
def elk_onboarding_organization_delete(org_id: str):
    try:
        es.delete(index=ONBOARDING_ORGS_INDEX, id=org_id)
        return {"deleted": True, "org_id": org_id}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Organization not found: {e}")


# ---------------------------------------------------------------------------
# Applications dashboard — joins onboarding hierarchy with scan results
# ---------------------------------------------------------------------------
def _fetch_latest_scans_for_assets(asset_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """Return {asset_id: latest_scan_doc} via collapse query."""
    out: Dict[str, Dict[str, Any]] = {}
    if not asset_ids:
        return out
    # Chunk to avoid overly long terms queries
    CHUNK = 200
    for i in range(0, len(asset_ids), CHUNK):
        ids = asset_ids[i : i + CHUNK]
        body = {
            "size": len(ids),
            "query": {"terms": {"asset_id": ids}},
            "sort": [{"scanned_at": {"order": "desc"}}],
            "collapse": {"field": "asset_id"},
        }
        res = _safe_search(ALL_INDICES, body)
        for h in res.get("hits", {}).get("hits", []):
            src = h.get("_source", {})
            aid = src.get("asset_id")
            if aid:
                out[aid] = src
    return out


def _scan_count_for_assets(asset_ids: List[str]) -> Dict[str, int]:
    """Return {asset_id: scan_count}."""
    out = {aid: 0 for aid in asset_ids}
    if not asset_ids:
        return out
    body = {
        "size": 0,
        "query": {"terms": {"asset_id": asset_ids}},
        "aggs": {
            "by_asset": {"terms": {"field": "asset_id", "size": len(asset_ids)}}
        },
    }
    try:
        res = es.search(index=ALL_INDICES, body=body)
        for b in res.get("aggregations", {}).get("by_asset", {}).get("buckets", []):
            out[b["key"]] = b["doc_count"]
    except Exception as e:
        logger.warning(f"scan-count agg failed: {e}")
    return out


def _aggregate_resources(
    resources: List[Dict[str, Any]],
    latest_by_asset: Dict[str, Dict[str, Any]],
    counts_by_asset: Dict[str, int],
) -> Dict[str, Any]:
    """Roll up scan stats for a list of resources (repos OR domains OR servers)."""
    scanned = 0
    total_vulns = 0
    readiness_vals: List[float] = []
    score_vals: List[float] = []
    quantum_ready = 0
    enriched = []
    for r in resources:
        aid = r.get("asset_id")
        scan = latest_by_asset.get(aid) if aid else None
        if scan:
            scanned += 1
            v = scan.get("vulnerabilities_count") or 0
            total_vulns += int(v)
            qr_pct = scan.get("quantum_readiness_percentage")
            if isinstance(qr_pct, (int, float)):
                readiness_vals.append(float(qr_pct))
            sc = scan.get("overall_score")
            if isinstance(sc, (int, float)):
                score_vals.append(float(sc))
            if scan.get("quantum_ready"):
                quantum_ready += 1
        enriched.append(
            {
                **r,
                "scan_count": counts_by_asset.get(aid, 0) if aid else 0,
                "latest_scan": {
                    "scan_id": scan.get("scan_id") if scan else None,
                    "scanned_at": scan.get("scanned_at") if scan else None,
                    "overall_grade": scan.get("overall_grade") if scan else None,
                    "overall_score": scan.get("overall_score") if scan else None,
                    "quantum_readiness_percentage": scan.get("quantum_readiness_percentage") if scan else None,
                    "quantum_ready": scan.get("quantum_ready") if scan else None,
                    "vulnerabilities_count": scan.get("vulnerabilities_count") if scan else None,
                    "asset_type": scan.get("asset_type") if scan else None,
                } if scan else None,
            }
        )
    return {
        "items": enriched,
        "total": len(resources),
        "scanned": scanned,
        "unscanned": len(resources) - scanned,
        "quantum_ready": quantum_ready,
        "total_vulnerabilities": total_vulns,
        "avg_readiness": round(sum(readiness_vals) / len(readiness_vals), 1) if readiness_vals else None,
        "avg_score": round(sum(score_vals) / len(score_vals), 1) if score_vals else None,
    }


def _enrich_app(app: Dict[str, Any], latest: Dict[str, Dict[str, Any]], counts: Dict[str, int]) -> Dict[str, Any]:
    repos = _aggregate_resources(app.get("repositories") or [], latest, counts)
    domains = _aggregate_resources(app.get("domains") or [], latest, counts)
    # Servers: try asset_id from agent_id if any; otherwise just list them
    servers = []
    server_scanned = 0
    server_vulns = 0
    for s in app.get("servers") or []:
        aid = s.get("asset_id")
        scan = latest.get(aid) if aid else None
        if scan:
            server_scanned += 1
            server_vulns += int(scan.get("vulnerabilities_count") or 0)
        servers.append({**s, "latest_scan": scan and {
            "scan_id": scan.get("scan_id"),
            "scanned_at": scan.get("scanned_at"),
            "overall_grade": scan.get("overall_grade"),
            "quantum_readiness_percentage": scan.get("quantum_readiness_percentage"),
            "vulnerabilities_count": scan.get("vulnerabilities_count"),
        }})

    # Roll up app-level KPIs
    all_readiness = []
    if repos["avg_readiness"] is not None:
        all_readiness.append(repos["avg_readiness"])
    if domains["avg_readiness"] is not None:
        all_readiness.append(domains["avg_readiness"])

    return {
        "app_id": app["app_id"],
        "application_name": app["application_name"],
        "repositories": repos,
        "domains": domains,
        "servers": {"items": servers, "total": len(servers), "scanned": server_scanned, "total_vulnerabilities": server_vulns},
        "stats": {
            "resources_total": repos["total"] + domains["total"] + len(servers),
            "scanned": repos["scanned"] + domains["scanned"] + server_scanned,
            "total_vulnerabilities": repos["total_vulnerabilities"] + domains["total_vulnerabilities"] + server_vulns,
            "avg_readiness": round(sum(all_readiness) / len(all_readiness), 1) if all_readiness else None,
            "quantum_ready_resources": repos["quantum_ready"] + domains["quantum_ready"],
        },
    }


def _collect_all_asset_ids(doc: Dict[str, Any]) -> List[str]:
    ids: List[str] = []
    for so in doc.get("suborganizations", []) or []:
        for app in so.get("applications", []) or []:
            for r in app.get("repositories", []) or []:
                if r.get("asset_id"):
                    ids.append(r["asset_id"])
            for d in app.get("domains", []) or []:
                if d.get("asset_id"):
                    ids.append(d["asset_id"])
            for s in app.get("servers", []) or []:
                if s.get("asset_id"):
                    ids.append(s["asset_id"])
    return ids


@app.get("/api/elk/applications")
def elk_applications(size: int = Query(500, ge=1, le=2000)):
    """List every application across every onboarded org, with rolled-up scan stats."""
    _ensure_onboarding_indices()
    body = {"size": size, "sort": [{"updated_at": {"order": "desc"}}]}
    res = _safe_search(ONBOARDING_ORGS_INDEX, body)
    orgs = [h["_source"] for h in res["hits"]["hits"]]

    # Gather every asset_id once and do bulk ES lookups for efficiency
    all_ids: List[str] = []
    for o in orgs:
        all_ids.extend(_collect_all_asset_ids(o))
    all_ids = list({a for a in all_ids if a})
    latest = _fetch_latest_scans_for_assets(all_ids)
    counts = _scan_count_for_assets(all_ids)

    org_views = []
    grand_apps = 0
    grand_scans = 0
    grand_vulns = 0
    grand_readiness: List[float] = []

    for o in orgs:
        suborg_views = []
        for so in o.get("suborganizations", []) or []:
            apps_view = []
            for app in so.get("applications", []) or []:
                apps_view.append(_enrich_app(app, latest, counts))
            # Suborg roll-up
            so_total = sum(a["stats"]["resources_total"] for a in apps_view)
            so_scanned = sum(a["stats"]["scanned"] for a in apps_view)
            so_vulns = sum(a["stats"]["total_vulnerabilities"] for a in apps_view)
            so_readiness = [a["stats"]["avg_readiness"] for a in apps_view if a["stats"]["avg_readiness"] is not None]
            suborg_views.append({
                "suborg_id": so["suborg_id"],
                "suborganization_name": so["suborganization_name"],
                "applications": apps_view,
                "stats": {
                    "applications": len(apps_view),
                    "resources_total": so_total,
                    "scanned": so_scanned,
                    "total_vulnerabilities": so_vulns,
                    "avg_readiness": round(sum(so_readiness) / len(so_readiness), 1) if so_readiness else None,
                },
            })

        # Org roll-up
        all_apps = [a for so in suborg_views for a in so["applications"]]
        org_apps_count = len(all_apps)
        org_scanned = sum(a["stats"]["scanned"] for a in all_apps)
        org_vulns = sum(a["stats"]["total_vulnerabilities"] for a in all_apps)
        org_readiness_vals = [a["stats"]["avg_readiness"] for a in all_apps if a["stats"]["avg_readiness"] is not None]
        org_views.append({
            "org_id": o["org_id"],
            "organization_name": o["organization_name"],
            "organization_email": o.get("organization_email"),
            "created_by": o.get("created_by"),
            "updated_at": o.get("updated_at"),
            "totals": o.get("totals", {}),
            "suborganizations": suborg_views,
            "stats": {
                "applications": org_apps_count,
                "scanned": org_scanned,
                "total_vulnerabilities": org_vulns,
                "avg_readiness": round(sum(org_readiness_vals) / len(org_readiness_vals), 1) if org_readiness_vals else None,
            },
        })
        grand_apps += org_apps_count
        grand_scans += org_scanned
        grand_vulns += org_vulns
        grand_readiness.extend(org_readiness_vals)

    return {
        "summary": {
            "organizations": len(org_views),
            "applications": grand_apps,
            "scanned_resources": grand_scans,
            "total_vulnerabilities": grand_vulns,
            "avg_readiness": round(sum(grand_readiness) / len(grand_readiness), 1) if grand_readiness else None,
        },
        "organizations": org_views,
    }


@app.get("/api/elk/applications/{app_id}")
def elk_application_detail(app_id: str):
    """Find one application across all org docs and return its enriched view."""
    _ensure_onboarding_indices()
    body = {
        "size": 100,
        "query": {
            "nested_or_simple": True
        }
    }
    # ES doesn't have a nested_or_simple query; use a simple match by app_id at any nested level
    body = {
        "size": 100,
        "query": {"match": {"suborganizations.applications.app_id": app_id}},
    }
    res = _safe_search(ONBOARDING_ORGS_INDEX, body)
    orgs = [h["_source"] for h in res["hits"]["hits"]]
    target_app = None
    target_org = None
    target_so = None
    for o in orgs:
        for so in o.get("suborganizations", []) or []:
            for app in so.get("applications", []) or []:
                if app.get("app_id") == app_id:
                    target_app = app
                    target_org = o
                    target_so = so
                    break
            if target_app:
                break
        if target_app:
            break

    if not target_app:
        raise HTTPException(status_code=404, detail="Application not found")

    ids = []
    for r in target_app.get("repositories", []) or []:
        if r.get("asset_id"):
            ids.append(r["asset_id"])
    for d in target_app.get("domains", []) or []:
        if d.get("asset_id"):
            ids.append(d["asset_id"])
    latest = _fetch_latest_scans_for_assets(ids)
    counts = _scan_count_for_assets(ids)
    enriched = _enrich_app(target_app, latest, counts)
    return {
        "organization": {"org_id": target_org["org_id"], "organization_name": target_org["organization_name"]},
        "suborganization": {"suborg_id": target_so["suborg_id"], "suborganization_name": target_so["suborganization_name"]},
        "application": enriched,
    }


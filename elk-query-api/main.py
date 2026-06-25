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

"""
ELK Sync Service
================
Periodically polls the existing Postgres-backed APIs and pushes new scan
results into Elasticsearch (via elk-indexer). This is a SAFE additive layer —
no existing service code is modified.

Architecture:
   crypto-scanner (8000) ─┐
   repo-scanner (8003)   ─┼──poll──► elk-sync ──POST──► elk-indexer ──► Elasticsearch
   system-scan (9000)    ─┘

Idempotency:
   The indexer uses `make_scan_id(asset_id, scanned_at)` — same asset+timestamp
   produces the same ES doc id, so re-syncing is safe.
"""
import os
import time
import logging
import requests
from typing import Dict, Any, List

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("elk-sync")

SCAN_API = os.getenv("SCAN_API_URL", "http://crypto-scanner:8000")
REPO_API = os.getenv("REPO_API_URL", "http://repo-scanner:8001")
SYSTEM_API = os.getenv("SYSTEM_API_URL", "http://system-scan:9000")
INDEXER = os.getenv("ELK_INDEXER_URL", "http://elk-indexer:9100")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))


def _post(path: str, payload: Dict[str, Any]) -> bool:
    try:
        r = requests.post(f"{INDEXER}{path}", json=payload, timeout=20)
        if r.status_code == 200:
            return True
        logger.warning(f"Index failed {path}: {r.status_code} {r.text[:200]}")
    except Exception as e:
        logger.warning(f"Index POST {path} failed: {e}")
    return False


def sync_domains():
    try:
        r = requests.get(f"{SCAN_API}/results", timeout=15)
        if r.status_code != 200:
            return 0
        items = r.json() or []
        ok = 0
        for item in items:
            url = item.get("url")
            if not url:
                continue
            if _post("/index/domain", {"url": url, "scan_data": item}):
                ok += 1
        logger.info(f"Domain sync: indexed {ok}/{len(items)}")
        return ok
    except Exception as e:
        logger.warning(f"Domain sync error: {e}")
        return 0


def sync_repos():
    try:
        r = requests.get(f"{REPO_API}/api/scans", timeout=15)
        if r.status_code != 200:
            return 0
        items = r.json() or []
        ok = 0
        for item in items:
            repo_url = item.get("repo_url")
            if not repo_url:
                continue
            payload = {
                "repo_url": repo_url,
                "branch_name": item.get("branch_name", "main"),
                "scan_data": item,
            }
            if _post("/index/repo", payload):
                ok += 1
        logger.info(f"Repo sync: indexed {ok}/{len(items)}")
        return ok
    except Exception as e:
        logger.warning(f"Repo sync error: {e}")
        return 0


def sync_assets():
    """Sync system/asset scan results — needs to drill into full audit_results."""
    try:
        tasks_r = requests.get(f"{SYSTEM_API}/api/v1/admin/tasks", timeout=15)
        if tasks_r.status_code != 200:
            return 0
        tasks: List[Dict[str, Any]] = (tasks_r.json() or {}).get("tasks", [])
        ok = 0
        for task in tasks:
            agent_id = task.get("agent_id")
            task_id = task.get("task_id")
            if not (agent_id and task_id):
                continue
            try:
                ar = requests.get(f"{SYSTEM_API}/api/v1/admin/agent/{agent_id}/results", timeout=15)
                if ar.status_code != 200:
                    continue
                ar_data = ar.json() or {}
                results = ar_data.get("results") or []
                target = next((r for r in results if r.get("task_id") == task_id), None) or (results[0] if results else None)
                if not target:
                    continue
                result_id = target.get("result_id")
                full_r = requests.get(f"{SYSTEM_API}/api/v1/admin/results/{result_id}", timeout=15)
                if full_r.status_code != 200:
                    continue
                full = (full_r.json() or {}).get("result", {})
                payload = {
                    "agent_id": agent_id,
                    "task_id": task_id,
                    "scan_data": {
                        "scanned_at": task.get("completed_at"),
                        "audit_results": full.get("audit_results"),
                        "task": task,
                    },
                }
                if _post("/index/asset", payload):
                    ok += 1
            except Exception as e:
                logger.warning(f"Asset task {task_id} sync failed: {e}")
        logger.info(f"Asset sync: indexed {ok}/{len(tasks)}")
        return ok
    except Exception as e:
        logger.warning(f"Asset sync error: {e}")
        return 0


def main():
    logger.info(f"ELK-Sync started. Poll every {POLL_INTERVAL}s.")
    logger.info(f"  Indexer:   {INDEXER}")
    logger.info(f"  Scan API:  {SCAN_API}")
    logger.info(f"  Repo API:  {REPO_API}")
    logger.info(f"  System API:{SYSTEM_API}")

    # Wait for indexer to be ready
    for _ in range(30):
        try:
            if requests.get(f"{INDEXER}/health", timeout=5).status_code == 200:
                logger.info("Indexer is reachable.")
                break
        except Exception:
            pass
        time.sleep(2)

    while True:
        try:
            sync_domains()
            sync_repos()
            sync_assets()
        except Exception as e:
            logger.exception(f"Sync round failed: {e}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()

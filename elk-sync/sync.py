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
        # Paginate through ALL domain scan results (old and new).
        PAGE_SIZE = 500
        items: List[Dict[str, Any]] = []
        offset = 0
        while True:
            r = requests.get(
                f"{SCAN_API}/results",
                params={"limit": PAGE_SIZE, "offset": offset},
                timeout=30,
            )
            if r.status_code != 200:
                break
            page = r.json() or []
            if not page:
                break
            items.extend(page)
            if len(page) < PAGE_SIZE:
                break  # last page
            offset += PAGE_SIZE

        COMPLETED_STATUSES = {"completed", "success", "done", "finished"}
        ok = 0
        skipped_incomplete = 0
        for item in items:
            url = item.get("url")
            if not url:
                continue
            # Skip scans that haven't finished yet
            status = (item.get("status") or item.get("scan_status") or "").lower()
            if status and status not in COMPLETED_STATUSES:
                skipped_incomplete += 1
                continue
            if _post("/index/domain", {"url": url, "scan_data": item}):
                ok += 1
        completed_count = len(items) - skipped_incomplete
        logger.info(f"Domain sync: indexed {ok}/{completed_count} completed scans (skipped {skipped_incomplete} in-progress)")
        return ok
    except Exception as e:
        logger.warning(f"Domain sync error: {e}")
        return 0


def sync_repos():
    try:
        # Paginate through ALL scans so we never miss old or new ones.
        # The repo API caps at 500 per page; we walk pages until empty.
        PAGE_SIZE = 500
        items: List[Dict[str, Any]] = []
        offset = 0
        while True:
            r = requests.get(
                f"{REPO_API}/api/scans",
                params={"limit": PAGE_SIZE, "offset": offset},
                timeout=30,
            )
            if r.status_code != 200:
                break
            page = r.json() or []
            if not page:
                break
            items.extend(page)
            if len(page) < PAGE_SIZE:
                break  # last page
            offset += PAGE_SIZE

        COMPLETED_STATUSES = {"completed", "success", "done", "finished"}
        ok = 0
        skipped_incomplete = 0
        for item in items:
            repo_url = item.get("repo_url")
            scan_id = item.get("id")
            if not repo_url or not scan_id:
                continue

            # Skip scans that haven't finished yet — indexing in_progress scans
            # creates ghost docs if the scan is later deleted or reset.
            status = (item.get("scan_status") or "").lower()
            if status and status not in COMPLETED_STATUSES:
                skipped_incomplete += 1
                continue

            # Fetch FULL scan details (algorithms, category_scores, migration_plan, etc.)
            # The list endpoint /api/scans only returns lightweight summary.
            full_scan = dict(item)
            try:
                dr = requests.get(f"{REPO_API}/api/scans/{scan_id}", timeout=20)
                if dr.status_code == 200:
                    details = dr.json() or {}
                    details["id"] = scan_id
                    full_scan = details
                else:
                    logger.warning(f"Repo details fetch failed for scan {scan_id}: HTTP {dr.status_code}")
            except Exception as de:
                logger.warning(f"Repo details fetch error for scan {scan_id}: {de}")

            # Per-algorithm findings are served by a separate endpoint. Pull them
            # in and merge into algorithms[<algo>].findings so the ELK doc carries
            # the full audit-trail evidence (line numbers, code snippets, files).
            try:
                algorithms = full_scan.get("algorithms") or {}
                for algo_name in list(algorithms.keys()):
                    try:
                        fr = requests.get(
                            f"{REPO_API}/api/scans/{scan_id}/algorithm/{algo_name}/findings",
                            params={"limit_files": 200, "limit_per_file": 50},
                            timeout=20,
                        )
                        if fr.status_code == 200:
                            fdata = fr.json() or {}
                            # Flatten to a single list of findings for storage
                            flat_findings = []
                            for f_entry in fdata.get("files", []):
                                file_path = f_entry.get("file_path")
                                for fi in f_entry.get("findings", []):
                                    flat_findings.append({
                                        "file_path": file_path,
                                        "line_number": fi.get("line_number"),
                                        "code_snippet": fi.get("code_snippet"),
                                        "match_text": fi.get("match_text"),
                                    })
                            algorithms[algo_name]["findings"] = flat_findings
                            algorithms[algo_name]["findings_total"] = fdata.get("total_occurrences")
                            algorithms[algo_name]["findings_files_total"] = fdata.get("total_files")
                    except Exception as fe:
                        logger.debug(f"Findings fetch failed for {algo_name} on scan {scan_id}: {fe}")
                full_scan["algorithms"] = algorithms
            except Exception as e:
                logger.warning(f"Findings enrichment failed for scan {scan_id}: {e}")

            payload = {
                "repo_url": repo_url,
                "branch_name": full_scan.get("branch_name") or item.get("branch_name", "main"),
                "scan_data": full_scan,
            }
            if _post("/index/repo", payload):
                ok += 1
        completed_count = len(items) - skipped_incomplete
        logger.info(f"Repo sync: indexed {ok}/{completed_count} completed scans (skipped {skipped_incomplete} in-progress)")
        return ok
    except Exception as e:
        logger.warning(f"Repo sync error: {e}")
        return 0


def sync_assets():
    """Sync system/asset scan results — needs to drill into full audit_results.
    Also enriches each scan with full agent metadata (hostname, ip, org, etc.)
    so ELK has complete parity with Postgres."""
    try:
        tasks_r = requests.get(f"{SYSTEM_API}/api/v1/admin/tasks", timeout=15)
        if tasks_r.status_code != 200:
            return 0
        tasks: List[Dict[str, Any]] = (tasks_r.json() or {}).get("tasks", [])

        # Build {agent_id -> agent_dict} lookup once per cycle
        agents_map: Dict[str, Dict[str, Any]] = {}
        try:
            ag_r = requests.get(f"{SYSTEM_API}/api/v1/admin/agents", timeout=15)
            if ag_r.status_code == 200:
                for a in (ag_r.json() or {}).get("agents", []) or []:
                    aid = a.get("agent_id")
                    if aid:
                        agents_map[aid] = a
        except Exception as _e:
            logger.debug(f"Could not fetch agents map: {_e}")

        ok = 0
        skipped = 0
        for task in tasks:
            agent_id = task.get("agent_id")
            task_id = task.get("task_id")
            if not (agent_id and task_id):
                continue
            # Only sync completed tasks (in-progress have no usable result)
            status = (task.get("status") or "").lower()
            if status not in ("completed", "success", "done", "finished"):
                skipped += 1
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
                audit_results = full.get("audit_results")
                if not audit_results:
                    logger.debug(f"Task {task_id} has no audit_results yet, skipping")
                    skipped += 1
                    continue
                payload = {
                    "agent_id": agent_id,
                    "task_id": task_id,
                    "scan_data": {
                        "id": result_id,                     # stable Postgres row id
                        "result_id": result_id,
                        "completed_at": task.get("completed_at"),
                        "scanned_at": task.get("completed_at"),
                        "audit_results": audit_results,
                        "task": task,
                        # Agent metadata (hostname / ip / org / app / last_seen)
                        "agent": agents_map.get(agent_id, {}),
                        # Result envelope timing (received_at / submitted_at)
                        "result": {
                            "result_id": result_id,
                            "received_at": target.get("received_at") or full.get("received_at"),
                            "submitted_at": target.get("submitted_at") or full.get("submitted_at"),
                        },
                    },
                }
                if _post("/index/asset", payload):
                    ok += 1
            except Exception as e:
                logger.warning(f"Asset task {task_id} sync failed: {e}")
        logger.info(f"Asset sync: indexed {ok}, skipped {skipped} (of {len(tasks)} tasks)")
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

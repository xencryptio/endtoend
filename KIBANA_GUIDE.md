# 🔍 ELK + Kibana Integration Guide

This document explains the **ELK (Elasticsearch + Kibana) audit-trail layer** added to
the Quantum Shield platform, how it relates to the existing Postgres-based stack, and
how to operate it day-to-day.

---

## 1. Why ELK?

| Capability                          | Postgres (legacy) | Elasticsearch (new) |
|-------------------------------------|-------------------|---------------------|
| Operational data (tasks/agents)     | ✅                | —                   |
| Heterogeneous JSON storage          | ⚠️ manual         | ✅ native           |
| Full audit trail (every scan kept)  | ❌                | ✅ append-only       |
| Trend / time-series queries         | ⚠️ slow            | ✅ fast              |
| Kibana visualisations               | —                  | ✅                   |
| Customer-facing "before/after" view | ❌                | ✅                   |

Both stacks **run in parallel**. The customer-facing React app currently reads from both;
once you trust ELK, you can retire the Postgres read-path.

---

## 2. New services in `docker-compose.yml`

| Service          | Port (host) | Purpose                                                |
|------------------|-------------|--------------------------------------------------------|
| `elasticsearch`  | `9201`      | Document store (data lives here)                       |
| `kibana`         | `5601`      | Web UI for exploring ES                                |
| `elk-indexer`    | `9100`      | Writes scan results into ES (idempotent, audit-friendly)|
| `elk-query-api`  | `9101`      | Read API consumed by React (never expose ES to browser)|
| `elk-sync`       | —           | Polls existing scan APIs every 60 s, pushes to indexer |

Postgres-backed services (`crypto-scanner`, `repo-scanner`, `system-scan`,
`db-service`) are **unchanged**.

---

## 3. Indices & mappings

Three time-series indices, one per scan type:

* `crypto-scans-domain`  → TLS/domain scans
* `crypto-scans-repo`    → repository scans
* `crypto-scans-asset`   → system/agent scans

Every document carries the common fields used for filtering and aggregation:

```
asset_id        keyword   stable identity (e.g. "domain:quickheal.com")
asset_type      keyword   "domain" | "repo" | "asset"
asset_label     keyword   human-readable name
scanned_at      date      time of scan
ingested_at     date      time pushed into ES
quantum_ready   boolean
quantum_readiness_percentage  float
overall_grade   keyword   "A"/"B"/"C"/...
overall_score   float
vulnerabilities_count integer
raw             object    the entire original scan JSON
```

`asset_id` is the **trend key** — group/collapse on it to get the history of a
single asset (e.g. `domain:quickheal.com`).

`scan_id` is deterministic = `sha256(asset_id|scanned_at)[:24]`, so re-syncing
the same scan is safe (idempotent — same doc id ⇒ overwrite, not duplicate).

---

## 4. Bring it up

```powershell
# From the repo root
docker compose up -d --build elasticsearch kibana elk-indexer elk-query-api elk-sync
```

Wait ~60 seconds for ES to be healthy and Kibana to start. Then:

```powershell
# Sanity-check ES
curl http://localhost:9201/_cluster/health

# Sanity-check the indexer
curl http://localhost:9100/health

# Sanity-check the query API
curl http://localhost:9101/health
curl http://localhost:9101/api/elk/stats
```

If you already have scan data in Postgres, `elk-sync` will start back-filling
within one poll cycle (≤ 60 s).

---

## 5. Open Kibana

Visit **http://localhost:5601**.

### 5.1 First-time setup — import the prebuilt dashboard

1. In Kibana: **☰ menu → Stack Management → Saved Objects**
2. Click **Import**
3. Choose the file: [elk-indexer/kibana-objects.ndjson](../elk-indexer/kibana-objects.ndjson)
4. Pick **"Request action on conflict"** → confirm
5. Done — open **☰ menu → Dashboards → PQC Audit Trail Dashboard**

You now have:
* Total assets metric
* Quantum-ready distribution pie
* Readiness trend line chart
* Scans by asset type donut
* Vulnerabilities over time bar chart
* Plus four index patterns (`crypto-scans-domain`, `-repo`, `-asset`, `crypto-scans-*`)

### 5.2 Browse raw documents

* **☰ menu → Discover**
* Top-left selector → choose any of the index patterns
* Use the time picker (top-right) and KQL search bar — e.g.
  `asset_type : "domain" and quantum_ready : false`

### 5.3 Build your own visualisation

* **☰ menu → Visualize Library → Create visualisation**
* Pick *Lens*, choose `crypto-scans-*`, then drag fields onto the canvas.

---

## 6. Customer-facing React pages

The Postgres-backed pages remain; **new ELK-backed twins** live under `/elk/*`:

| Route               | Component             | What it shows                                  |
|---------------------|-----------------------|------------------------------------------------|
| `/elk/dashboard`    | `DashboardELK`        | KPI summary + global timeline + latest scans   |
| `/elk/results`      | `ResultsELK`          | Filterable browser; toggle latest vs full hist |
| `/elk/history`      | `ScanHistoryELK`      | Asset picker → drill-down trend timeline       |
| `/elk/history?asset_id=…` | `ScanHistoryELK`| Direct deep-link to one asset's history        |

All three pages read **only** from `elk-query-api` (port 9101).

---

## 7. The "before / after" customer story

This is the audit-trail value proposition:

1. Customer onboards → first scan stored in ES.
2. They follow the migration guidance.
3. Re-scan → second doc appended (NOT overwritten).
4. Open **/elk/history**, pick the asset → they see:
   * First scan: **F** grade · 22 % readiness
   * Latest scan: **A** grade · 88 % readiness
   * Change: **+66 %** improvement 🎉

Visually proven, immutable, exportable.

---

## 8. Endpoint reference

### Indexer (`http://localhost:9100`)
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/index/domain` | Index a domain scan (`{url, scan_data}`) |
| `POST` | `/index/repo`   | Index a repo scan (`{repo_url, branch_name, scan_data}`) |
| `POST` | `/index/asset`  | Index an asset scan (`{agent_id, task_id, scan_data}`) |
| `POST` | `/admin/reindex-indices` | Drop & recreate indices (dev only) |

### Query API (`http://localhost:9101`)
| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/elk/dashboard` | Aggregate summary for dashboard cards |
| `GET`  | `/api/elk/stats` | Quick counts per index |
| `GET`  | `/api/elk/results?type=…` | Latest doc per asset |
| `GET`  | `/api/elk/results/all?type=…` | All historical docs |
| `GET`  | `/api/elk/history/{asset_id}` | Timeline for one asset |
| `GET`  | `/api/elk/timeline?interval=day` | Global readiness trend |
| `GET`  | `/api/elk/asset/{asset_id}` | Latest doc for an asset |
| `GET`  | `/api/elk/scans?type=…&page=1` | Paginated audit log |

---

## 9. Operating tips

* **Resetting the data** (dev):
  ```powershell
  curl -X POST http://localhost:9100/admin/reindex-indices
  ```
  Then `elk-sync` will re-populate from Postgres on its next cycle.

* **Forcing a sync immediately**:
  ```powershell
  docker compose restart elk-sync
  ```

* **Disk usage**: ES holds the full raw JSON. For production, attach an
  Index Lifecycle Management (ILM) policy that rolls indices monthly and
  deletes after `N` months — easy to add later via Kibana → Stack Management → ILM.

* **Security**: `elk-query-api` is currently CORS-open and unauthenticated
  (matches the rest of the platform). Before production, put it behind the same
  auth layer you use for the other services.

---

## 10. Migration plan (when you're ready to retire Postgres reads)

1. Run both stacks in parallel (today).
2. Spot-check `/elk/dashboard` vs `/pqc-dashboard` for a few weeks — agree the
   numbers match.
3. Update the legacy sidebar entries to point to `/elk/*`.
4. Remove `/pqc-dashboard` from the sidebar (keep route for fallback).
5. Eventually disable Postgres write-paths for scan results; keep Postgres for
   auth, tasks, agent registration.

---

## 11. Quick smoke-test

```powershell
# Run a fresh domain scan via the existing API (Postgres path).
curl -X POST http://localhost:8000/scan -H "Content-Type: application/json" `
     -d '{"url":"google.com"}'

# Wait up to 60 s for elk-sync to pick it up, then:
curl http://localhost:9101/api/elk/stats
# → expect {"domain": >=1, ...}

# Open the new dashboards
start http://localhost:3000/elk/dashboard
start http://localhost:5601           # Kibana
```

Happy auditing! 🛡️

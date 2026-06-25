# 🧹 Clear All Scans Scripts

Two standalone scripts to completely wipe all scan records from both **Elasticsearch (ELK)** and **PostgreSQL** databases.

## 📋 What They Do

Both scripts perform the same operations:

1. **Stop elk-sync** (prevents data re-population during cleanup)
2. **Reset ELK indices** (drop crypto-scans-domain, -repo, -asset)
3. **Delete from PostgreSQL:**
   - `scandb.scan_results` (domain/crypto scans)
   - `repo_scanner_db.scan_results` + `repo_scanner_db.findings` (repo scans)
   - `system_scanner_db.results` (asset/system scans)
4. **Verify cleanup** (confirm ELK is empty)
5. **Restart elk-sync** (resume monitoring for new scans)

## 🚀 Usage

### Option 1: PowerShell Script (Recommended)
```powershell
# From repo root, run:
.\clear-all-scans.ps1
```

**Features:**
- Color-coded output (green = success, red = error, yellow = warning)
- Step-by-step progress tracking
- Error handling and validation
- Detailed logging

### Option 2: Batch File (Simple Double-Click)
```
Double-click: clear-all-scans.bat
```

**Features:**
- No command needed — just double-click the file
- Simple output
- Automatically pauses at the end so you can see results

## ⚠️ IMPORTANT

- **This is DESTRUCTIVE** — all scan history will be permanently deleted
- No undo option — backup your data if needed
- Docker must be running
- PostgreSQL container must be active
- ELK services must be healthy

## ✅ Requirements

- Docker running
- Services: `postgres`, `elk-indexer`, `elk-sync`
- Database credentials: `user=scanuser`, `password=scanpass`

## 🔍 What Gets Deleted

| Database | Table(s) | Records Deleted |
|----------|----------|-----------------|
| `scandb` | `scan_results` | Domain/crypto scans |
| `repo_scanner_db` | `scan_results`, `findings` | Repository scans + findings |
| `system_scanner_db` | `results` | System/asset scans |
| `Elasticsearch` | `crypto-scans-*` | All indices recreated (empty) |

## 🎯 After Running

- ✅ All historical scan data is gone
- ✅ ELK is empty (0 documents)
- ✅ PostgreSQL is clean
- ✅ elk-sync is running and ready for NEW scans
- ✅ React pages (`/elk/dashboard`, `/elk/history`, etc.) will show empty state

## 📝 Example Output

```
========================================
CLEARING ALL SCAN RECORDS
========================================

[1/6] Verifying services...
✓ PostgreSQL found: postgres
✓ ELK Indexer is healthy

[2/6] Stopping elk-sync...
✓ elk-sync stopped

[3/6] Resetting ELK indices...
✓ ELK indices recreated

[4/6] Clearing PostgreSQL databases...
  → Clearing scandb.scan_results...
    ✓ scandb cleaned
  → Clearing repo_scanner_db...
    ✓ repo_scanner_db cleaned (findings + scan_results)
  → Clearing system_scanner_db.results...
    ✓ system_scanner_db cleaned

[5/6] Verifying cleanup...
✓ ELK verified empty: {"domain":0,"repo":0,"asset":0,"total":0}

[6/6] Restarting elk-sync...
✓ elk-sync restarted

========================================
✓ CLEANUP COMPLETE!
========================================

All scan records have been deleted from:
  • Elasticsearch (ELK)
  • PostgreSQL (scandb, repo_scanner_db, system_scanner_db)

Ready for fresh scans!
```

## 🆘 Troubleshooting

**"Docker not found"**
- Ensure Docker Desktop is running

**"PostgreSQL container not found"**
- Check container name: `docker ps | grep postgres`
- Ensure postgres is running in docker-compose

**"ELK Indexer not reachable"**
- Verify ELK stack is up: `docker compose ps | grep elk`
- Check port 9100 is accessible: `curl http://localhost:9100/health`

**"psql: error: password authentication failed"**
- Verify credentials in docker-compose.yml: `POSTGRES_USER=scanuser`, `POSTGRES_PASSWORD=scanpass`

## 💡 Pro Tips

- Run this script **before starting a fresh round of testing**
- Keep a backup if you need historical data
- You can modify the script to skip certain databases (edit the delete commands)
- For production environments, consider archiving data before running this

---

**Created:** 2026-06-26  
**Tested with:** Docker Compose, Elasticsearch 8.13.4, PostgreSQL 15

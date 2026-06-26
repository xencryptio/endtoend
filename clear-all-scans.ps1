#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Clear All Scan Records - ELK + PostgreSQL (FULL CLEANUP)
.DESCRIPTION
    Wipes ALL scan-related records from:
    - Elasticsearch (crypto-scans-* indices)
    - PostgreSQL:
        scandb            : scan_results
        repo_scanner_db   : findings, category_scores, scan_results, repositories
        system_scanner_db : results, tasks
    Stops elk-sync during cleanup so it does not re-populate.
#>

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CLEARING ALL SCAN RECORDS" -ForegroundColor Red -BackgroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify services
Write-Host "[1/6] Verifying services..." -ForegroundColor Yellow
try {
    $psql_check = docker ps --filter "name=postgres" --format "{{.Names}}" 2>$null
    if (-not $psql_check) { Write-Host "ERROR: PostgreSQL container not found" -ForegroundColor Red; exit 1 }
    Write-Host "  OK PostgreSQL: $psql_check" -ForegroundColor Green
} catch { Write-Host "ERROR: docker unavailable: $_" -ForegroundColor Red; exit 1 }

try {
    Invoke-WebRequest -Uri "http://localhost:9100/health" -UseBasicParsing -ErrorAction Stop | Out-Null
    Write-Host "  OK ELK Indexer reachable" -ForegroundColor Green
} catch { Write-Host "ERROR: ELK Indexer not on :9100" -ForegroundColor Red; exit 1 }
Write-Host ""

# 2. Stop elk-sync (critical: keeps sync from re-indexing during cleanup)
Write-Host "[2/6] Stopping elk-sync..." -ForegroundColor Yellow
docker compose stop elk-sync 2>$null | Out-Null
Start-Sleep -Seconds 2
Write-Host "  OK elk-sync stopped" -ForegroundColor Green
Write-Host ""

# 3. Clear PostgreSQL (parent tables included so APIs return empty)
Write-Host "[3/6] Clearing PostgreSQL..." -ForegroundColor Yellow

Write-Host "  -> scandb..." -ForegroundColor Cyan
docker exec postgres psql -U scanuser -d scandb `
    -c "DELETE FROM scan_results;" 2>&1 | Out-Null
Write-Host "     OK scandb cleaned" -ForegroundColor Green

Write-Host "  -> repo_scanner_db (findings, category_scores, scan_results, repositories)..." -ForegroundColor Cyan
docker exec postgres psql -U scanuser -d repo_scanner_db `
    -c "DELETE FROM findings; DELETE FROM category_scores; DELETE FROM scan_results; DELETE FROM repositories;" 2>&1 | Out-Null
Write-Host "     OK repo_scanner_db fully cleaned" -ForegroundColor Green

Write-Host "  -> system_scanner_db (results, tasks)..." -ForegroundColor Cyan
docker exec postgres psql -U scanuser -d system_scanner_db `
    -c "DELETE FROM results; DELETE FROM tasks;" 2>&1 | Out-Null
Write-Host "     OK system_scanner_db cleaned" -ForegroundColor Green
Write-Host ""

# 4. Reset ELK indices (AFTER Postgres is empty so sync can't re-populate)
Write-Host "[4/6] Resetting ELK indices..." -ForegroundColor Yellow
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:9100/admin/reindex-indices" `
        -Method POST -UseBasicParsing -ErrorAction Stop
    Write-Host "  OK $($resp.Content)" -ForegroundColor Green
} catch { Write-Host "ERROR: ELK reset failed: $_" -ForegroundColor Red; exit 1 }
Write-Host ""

# 5. Verify
Write-Host "[5/6] Verifying..." -ForegroundColor Yellow
try {
    $stats = Invoke-WebRequest -Uri "http://localhost:9101/api/elk/stats" `
        -UseBasicParsing -ErrorAction Stop | ConvertFrom-Json
    if ($stats.total -eq 0) {
        Write-Host "  OK ELK empty: $($stats | ConvertTo-Json -Compress)" -ForegroundColor Green
    } else {
        Write-Host "  WARN ELK still has $($stats.total) docs" -ForegroundColor Yellow
    }
} catch { Write-Host "  WARN Could not verify ELK: $_" -ForegroundColor Yellow }
Write-Host ""

# 6. Restart elk-sync
Write-Host "[6/6] Restarting elk-sync..." -ForegroundColor Yellow
docker compose start elk-sync 2>$null | Out-Null
Start-Sleep -Seconds 2
Write-Host "  OK elk-sync restarted" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CLEANUP COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "All scan records deleted from:" -ForegroundColor Green
Write-Host "  - Elasticsearch (3 indices)" -ForegroundColor Green
Write-Host "  - scandb.scan_results" -ForegroundColor Green
Write-Host "  - repo_scanner_db.{findings, category_scores, scan_results, repositories}" -ForegroundColor Green
Write-Host "  - system_scanner_db.{results, tasks}" -ForegroundColor Green
Write-Host ""
Write-Host "Refresh your UI - all scan history should now be empty." -ForegroundColor Cyan
Write-Host ""

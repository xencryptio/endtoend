#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Clear All Scan Records - ELK + PostgreSQL
    
.DESCRIPTION
    This script removes ALL scan records from:
    - Elasticsearch (ELK indices: crypto-scans-domain, crypto-scans-repo, crypto-scans-asset)
    - PostgreSQL (scandb, repo_scanner_db, system_scanner_db)
    
    The script:
    1. Stops elk-sync to prevent re-population during cleanup
    2. Resets all ELK indices
    3. Deletes scan records from all PostgreSQL databases
    4. Restarts elk-sync
    
.USAGE
    .\clear-all-scans.ps1
    
.NOTES
    - Requires Docker running with containers: postgres, elk-indexer, elk-sync
    - This is DESTRUCTIVE - all scan history will be permanently deleted
    - PostgreSQL credentials: user=scanuser, password=scanpass
    
.AUTHOR
    Automated Cleanup Script
#>

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CLEARING ALL SCAN RECORDS" -ForegroundColor Red -BackgroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verify services are running
Write-Host "[1/6] Verifying services..." -ForegroundColor Yellow

try {
    $psql_check = docker ps --filter "name=postgres" --format "{{.Names}}" 2>$null
    if (-not $psql_check) {
        Write-Host "❌ ERROR: PostgreSQL container not found" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ PostgreSQL found: $psql_check" -ForegroundColor Green
} catch {
    Write-Host "❌ ERROR: Cannot communicate with Docker: $_" -ForegroundColor Red
    exit 1
}

try {
    $indexer_check = Invoke-WebRequest -Uri "http://localhost:9100/health" -UseBasicParsing -ErrorAction Stop
    Write-Host "✓ ELK Indexer is healthy" -ForegroundColor Green
} catch {
    Write-Host "❌ ERROR: ELK Indexer not reachable on http://localhost:9100" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 1: Stop elk-sync
Write-Host "[2/6] Stopping elk-sync..." -ForegroundColor Yellow
try {
    docker compose stop elk-sync 2>$null | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "✓ elk-sync stopped" -ForegroundColor Green
} catch {
    Write-Host "⚠ Warning: Could not stop elk-sync: $_" -ForegroundColor Yellow
}

Write-Host ""

# Step 2: Reset ELK indices
Write-Host "[3/6] Resetting ELK indices..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:9100/admin/reindex-indices" `
        -Method POST -UseBasicParsing -ErrorAction Stop
    $result = $response.Content | ConvertFrom-Json
    if ($result.success) {
        Write-Host "✓ ELK indices recreated" -ForegroundColor Green
    } else {
        Write-Host "❌ ERROR: Failed to reset indices: $($result.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ ERROR: Failed to reset ELK indices: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 3: Clear PostgreSQL - scandb.scan_results
Write-Host "[4/6] Clearing PostgreSQL databases..." -ForegroundColor Yellow

# scandb
Write-Host "  → Clearing scandb.scan_results..." -ForegroundColor Cyan
try {
    $result = docker exec postgres psql -U scanuser -d scandb `
        -c "DELETE FROM scan_results; SELECT COUNT(*) as count FROM scan_results;" 2>&1
    Write-Host "    ✓ scandb cleaned" -ForegroundColor Green
} catch {
    Write-Host "    ⚠ Warning: scandb cleanup encountered: $_" -ForegroundColor Yellow
}

# repo_scanner_db (needs findings deleted first due to FK constraint)
Write-Host "  → Clearing repo_scanner_db..." -ForegroundColor Cyan
try {
    $result = docker exec postgres psql -U scanuser -d repo_scanner_db `
        -c "DELETE FROM findings; DELETE FROM scan_results; SELECT COUNT(*) as count FROM scan_results;" 2>&1
    Write-Host "    ✓ repo_scanner_db cleaned (findings + scan_results)" -ForegroundColor Green
} catch {
    Write-Host "    ⚠ Warning: repo_scanner_db cleanup encountered: $_" -ForegroundColor Yellow
}

# system_scanner_db
Write-Host "  → Clearing system_scanner_db.results..." -ForegroundColor Cyan
try {
    $result = docker exec postgres psql -U scanuser -d system_scanner_db `
        -c "DELETE FROM results; SELECT COUNT(*) as count FROM results;" 2>&1
    Write-Host "    ✓ system_scanner_db cleaned" -ForegroundColor Green
} catch {
    Write-Host "    ⚠ Warning: system_scanner_db cleanup encountered: $_" -ForegroundColor Yellow
}

Write-Host ""

# Step 4: Verify ELK is empty
Write-Host "[5/6] Verifying cleanup..." -ForegroundColor Yellow
try {
    $stats = Invoke-WebRequest -Uri "http://localhost:9101/api/elk/stats" `
        -UseBasicParsing -ErrorAction Stop | ConvertFrom-Json
    
    if ($stats.total -eq 0) {
        Write-Host "✓ ELK verified empty: $($stats | ConvertTo-Json -Compress)" -ForegroundColor Green
    } else {
        Write-Host "⚠ Warning: ELK still has $($stats.total) documents" -ForegroundColor Yellow
        Write-Host "  $($stats | ConvertTo-Json -Compress)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠ Warning: Could not verify ELK stats: $_" -ForegroundColor Yellow
}

Write-Host ""

# Step 5: Restart elk-sync
Write-Host "[6/6] Restarting elk-sync..." -ForegroundColor Yellow
try {
    docker compose start elk-sync 2>$null | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "✓ elk-sync restarted" -ForegroundColor Green
} catch {
    Write-Host "⚠ Warning: Could not restart elk-sync: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✓ CLEANUP COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "All scan records have been deleted from:" -ForegroundColor Green
Write-Host "  • Elasticsearch (ELK)" -ForegroundColor Green
Write-Host "  • PostgreSQL (scandb, repo_scanner_db, system_scanner_db)" -ForegroundColor Green
Write-Host ""
Write-Host "Ready for fresh scans!" -ForegroundColor Cyan
Write-Host ""

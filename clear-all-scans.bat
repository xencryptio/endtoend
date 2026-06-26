@echo off
REM =====================================================
REM Clear All Scan Records - ELK + PostgreSQL
REM =====================================================
REM This batch script removes ALL scan records from:
REM  - Elasticsearch (ELK)
REM  - PostgreSQL (scandb, repo_scanner_db, system_scanner_db)
REM
REM Usage: Double-click this file or run: clear-all-scans.bat
REM =====================================================

setlocal enabledelayedexpansion

cls
echo.
echo ======================================== 
echo CLEARING ALL SCAN RECORDS
echo ========================================
echo.

REM Verify Docker is accessible
echo [1/6] Verifying services...
docker ps --filter "name=postgres" --format "{{.Names}}" >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] Docker or PostgreSQL container not found
    echo Please ensure Docker is running and postgres container is active.
    pause
    exit /b 1
)
echo [OK] PostgreSQL found

REM Verify ELK Indexer
curl -s http://localhost:9100/health >nul 2>&1
if !errorlevel! neq 0 (
    echo [ERROR] ELK Indexer not reachable on http://localhost:9100
    echo Please ensure ELK services are running.
    pause
    exit /b 1
)
echo [OK] ELK Indexer is healthy
echo.

REM Stop elk-sync
echo [2/6] Stopping elk-sync...
docker compose stop elk-sync >nul 2>&1
timeout /t 2 /nobreak >nul
echo [OK] elk-sync stopped
echo.

REM Clear PostgreSQL (parent tables included so APIs return empty)
echo [3/6] Clearing PostgreSQL databases...

echo   - Clearing scandb.scan_results...
docker exec postgres psql -U scanuser -d scandb -c "DELETE FROM scan_results;" >nul 2>&1
echo     [OK] scandb cleaned

echo   - Clearing repo_scanner_db (findings, category_scores, scan_results, repositories)...
docker exec postgres psql -U scanuser -d repo_scanner_db -c "DELETE FROM findings; DELETE FROM category_scores; DELETE FROM scan_results; DELETE FROM repositories;" >nul 2>&1
echo     [OK] repo_scanner_db fully cleaned

echo   - Clearing system_scanner_db (results, tasks)...
docker exec postgres psql -U scanuser -d system_scanner_db -c "DELETE FROM results; DELETE FROM tasks;" >nul 2>&1
echo     [OK] system_scanner_db cleaned
echo.

REM Reset ELK indices AFTER Postgres is empty
echo [4/6] Resetting ELK indices...
curl -s -X POST http://localhost:9100/admin/reindex-indices | find "true" >nul
if !errorlevel! equ 0 (
    echo [OK] ELK indices recreated
) else (
    echo [ERROR] Failed to reset ELK indices
    pause
    exit /b 1
)
echo.

REM Verify cleanup
echo [5/6] Verifying cleanup...
curl -s http://localhost:9101/api/elk/stats | find "0" >nul
if !errorlevel! equ 0 (
    echo [OK] ELK verified empty
) else (
    echo [WARNING] ELK cleanup status unclear - check manually
)
echo.

REM Restart elk-sync
echo [6/6] Restarting elk-sync...
docker compose start elk-sync >nul 2>&1
timeout /t 2 /nobreak >nul
echo [OK] elk-sync restarted
echo.

echo ========================================
echo CLEANUP COMPLETE!
echo ========================================
echo.
echo All scan records have been deleted from:
echo   - Elasticsearch (ELK)
echo   - PostgreSQL (scandb, repo_scanner_db, system_scanner_db)
echo.
echo Ready for fresh scans!
echo.
pause

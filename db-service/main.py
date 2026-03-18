from datetime import datetime
from typing import List, Optional
import logging
import io
import zipfile

from fastapi import FastAPI, HTTPException, Depends, Body, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session
from sqlalchemy import text

import crud
import models
import onboarding_crud
import schemas
import schemas_onboarding as onboard_schemas
from database import engine, get_db
from exceptions import APIError
from logging_config import setup_logging
from logging_middleware import correlation_middleware
from dashboard.router import router as dashboard_router
from export.router import router as export_router
from vulnerabilities.router import router as vulnerabilities_router
from applications.router import router as applications_router # NEW IMPORT

from database import get_scandb_session, get_repo_scanner_session, get_system_scanner_session


setup_logging("DB-SERVICE", logging.DEBUG)
log = logging.getLogger(__name__)

app = FastAPI(title="Scan Storage Service", version="1.0")
app.middleware("http")(correlation_middleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard_router)
app.include_router(export_router)
app.include_router(vulnerabilities_router)
app.include_router(applications_router)



@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint for Docker and service monitoring.
    Returns 200 OK if service is up.
    """
    try:
        # Test database connection with a simple query
        result = db.execute(text("SELECT 1"))
        db.commit()
        log.info("Database connected")
        log.info("Service ready")
        
        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        log.error(f"Health check error: {str(e)}")
        raise APIError(
            status_code=503, 
            error_code="db_connection_failed",
            message=f"Database connection failed: {str(e)}"
        )

# List domains by application
@app.get("/applications/{app_id}/domains", response_model=List[onboard_schemas.Domain])
def list_domains_by_app_endpoint(app_id: str, db: Session = Depends(get_db)):
    try:
        domains = onboarding_crud.list_domains_by_app(db, app_id)
        return [onboard_schemas.Domain.from_orm(d) for d in domains]
    except Exception as e:
        log.exception("List domains by app failed")
        raise APIError(status_code=500, error_code="domain_list_failed", message=str(e))

# List domains by suborganization
@app.get("/suborganizations/{suborg_id}/domains", response_model=List[onboard_schemas.Domain])
def list_domains_by_suborg_endpoint(suborg_id: str, db: Session = Depends(get_db)):
    try:
        domains = onboarding_crud.list_domains_by_suborg(db, suborg_id)
        return [onboard_schemas.Domain.from_orm(d) for d in domains]
    except Exception as e:
        log.exception("List domains by suborg failed")
        raise APIError(status_code=500, error_code="domain_list_failed", message=str(e))

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors consistently"""
    log.error(f"Validation error: {exc.errors()}")
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": {
                "error": "validation_error",
                "message": "Request validation failed",
                "errors": exc.errors(),
                "timestamp": datetime.now().isoformat()
            }
        }
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Catch-all for unexpected errors"""
    log.exception(f"Unexpected error: {exc}")
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": {
                "error": "internal_error",
                "message": "An internal server error occurred",
                "timestamp": datetime.now().isoformat()
            }
        }
    )

# ============================================================
# SCAN RESULT ENDPOINTS (Each scan is independent - no batches)
# ============================================================

@app.post("/scans/result", response_model=schemas.ScanResult)
def create_scan_result(
    scan: schemas.ScanResultCreate, 
    db: Session = Depends(get_db)
):
    """
    Store a single scan result (standalone - no batch).
    """
    log.info(f"📥 Creating scan result for URL: {scan.url}")
    try:
        result = crud.create_scan_result(db, scan)
        log.info(f"✅ Scan result created with ID: {result.id}")
        return result
    except Exception as e:
        log.exception("❌ Scan result creation failed")
        raise APIError(status_code=500, error_code="result_creation_failed", 
                      message=f"Scan result creation failed: {str(e)}")

@app.get("/scans", response_model=List[schemas.ScanResultWithNormalized])
def get_all_scan_results(
    status: Optional[str] = None,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    """
    Get all scan results with optional status filter.
    Returns individual scan results (not grouped by batch).
    """
    log.info(f"Entered /scans endpoint (status filter: {status})")
    try:
        results = crud.get_scan_results(db, status=status, skip=skip, limit=limit)
        log.info(f"Scan results retrieved successfully (count: {len(results)})")
        return [schemas.ScanResultWithNormalized.from_orm(r) for r in results]
    except Exception as e:
        log.exception("Scan results retrieval failed")
        raise APIError(status_code=500, error_code="results_retrieval_failed", message=f"Scan results retrieval failed: {str(e)}")

@app.get("/scans/results", response_model=List[schemas.ScanResultWithNormalized])
def get_scan_results_alt(
    status: Optional[str] = None,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    """
    Alias for /scans - Get all scan results.
    Kept for backward compatibility.
    """
    log.info("Entered /scans/results endpoint")
    try:
        results = crud.get_scan_results(db, status=status, skip=skip, limit=limit)
        log.info("Scan results retrieved successfully")
        return [schemas.ScanResultWithNormalized.from_orm(r) for r in results]
    except Exception as e:
        log.exception("Scan results retrieval failed")
        raise APIError(status_code=500, error_code="results_retrieval_failed", message=f"Scan results retrieval failed: {str(e)}")

@app.get("/scans/result/{result_id}", response_model=schemas.ScanResultWithNormalized)
def get_scan_result_by_id(result_id: int, db: Session = Depends(get_db)):
    """
    Get a specific scan result by its ID.
    """
    log.info(f"Entered /scans/result/{result_id} endpoint")
    try:
        result = crud.get_scan_result(db, result_id)
        if not result:
            raise APIError(status_code=404, error_code="result_not_found", message=f"Scan result {result_id} not found")
        
        log.info(f"Scan result {result_id} retrieved successfully")
        return schemas.ScanResultWithNormalized.from_orm(result)
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Scan result {result_id} retrieval failed")
        raise APIError(status_code=500, error_code="result_retrieval_failed", message=f"Scan result {result_id} retrieval failed: {str(e)}")

@app.get("/scans/url/{url:path}", response_model=schemas.ScanResultWithNormalized)
def get_scan_result_by_url(url: str, db: Session = Depends(get_db)):
    """
    Get the most recent scan result for a specific URL.
    """
    log.info(f"Entered /scans/url/{url} endpoint")
    try:
        result = crud.get_scan_result_by_url(db, url)
        if not result:
            raise APIError(status_code=404, error_code="result_not_found", message=f"No scan result found for URL: {url}")
        
        log.info(f"Scan result for {url} retrieved successfully")
        return schemas.ScanResultWithNormalized.from_orm(result)
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Scan result for {url} retrieval failed")
        raise APIError(status_code=500, error_code="result_retrieval_failed", message=f"Scan result retrieval failed: {str(e)}")

@app.delete("/scans/result/{result_id}")
def delete_scan_result_endpoint(result_id: int, db: Session = Depends(get_db)):
    """
    Delete a single scan result.
    """
    log.info(f"Entered /scans/result/{result_id} endpoint for deletion")
    try:
        success = crud.delete_single_scan_result(db, result_id)
        if not success:
            raise APIError(status_code=404, error_code="result_not_found", message=f"Scan result {result_id} not found or already deleted")
        
        log.info(f"Scan result {result_id} deleted successfully")
        return {
            "message": "Scan result deleted successfully",
            "result_id": result_id,
            "timestamp": datetime.now().isoformat()
        }
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Scan result {result_id} deletion failed")
        raise APIError(status_code=500, error_code="result_deletion_failed", message=f"Scan result {result_id} deletion failed: {str(e)}")

@app.delete("/scans/clear-all")
def clear_all_scans_endpoint(db: Session = Depends(get_db)):
    """
    DANGER: Delete ALL scan results from database.
    """
    log.info("Entered /scans/clear-all endpoint")
    try:
        deleted_count = crud.delete_all_scans(db)
        log.info(f"All scans cleared: {deleted_count} results deleted")
        return {
            "message": "All scan results deleted successfully",
            "deleted_results": deleted_count,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        log.exception("Clear all scans failed")
        raise APIError(status_code=500, error_code="clear_all_failed", message=f"Clear all scans failed: {str(e)}")

@app.get("/scans/search", response_model=List[schemas.ScanResultWithNormalized])
def search_scan_results(
    pqc_grade: Optional[str] = None,
    quantum_ready: Optional[bool] = None,
    tls_version: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Search scan results using normalized fields.
    """
    log.info("Entered /scans/search endpoint")
    try:
        query = db.query(models.ScanResult)
        
        if pqc_grade:
            query = query.filter(models.ScanResult.pqc_overall_grade == pqc_grade)
        
        if quantum_ready is not None:
            query = query.filter(models.ScanResult.pqc_quantum_ready == quantum_ready)
        
        if tls_version:
            query = query.filter(models.ScanResult.tls_version.ilike(f"%{tls_version}%"))
        
        if status:
            query = query.filter(models.ScanResult.status == status)
        
        results = query.order_by(
            models.ScanResult.created_at.desc().nulls_last()
        ).limit(limit).all()
        
        log.info("Scan results searched successfully")
        return [schemas.ScanResultWithNormalized.from_orm(r) for r in results]
    except Exception as e:
        log.exception("Scan results search failed")
        raise APIError(status_code=500, error_code="results_search_failed", message=f"Scan results search failed: {str(e)}")

@app.get("/scans/statistics", response_model=schemas.ScanStatistics)
def get_scan_statistics_endpoint(db: Session = Depends(get_db)):
    """
    Get scan statistics.
    """
    log.info("Entered /scans/statistics endpoint")
    try:
        stats = crud.get_scan_statistics(db)
        log.info("Scan statistics retrieved successfully")
        return stats
    except Exception as e:
        log.exception("Scan statistics retrieval failed")
        raise APIError(status_code=500, error_code="statistics_failed", message=f"Scan statistics retrieval failed: {str(e)}")


# ============================================================
# BULK OPERATIONS
# ============================================================

# =================== ONBOARDING ENDPOINTS ===================

@app.post("/organizations", response_model=onboard_schemas.Organization)
def create_organization_endpoint(org: dict, db: Session = Depends(get_db)):
    """Create a single organization"""
    try:
        created = onboarding_crud.create_organization(db, org)
        return onboard_schemas.Organization.from_orm(created)
    except Exception as e:
        log.exception("Organization creation failed")
        raise APIError(status_code=500, error_code="org_create_failed", message=str(e))


@app.post("/organizations/{org_id}/repositories/bulk", response_model=List[onboard_schemas.Repository])
def bulk_repositories_endpoint(org_id: str, repos: List[dict], db: Session = Depends(get_db)):
    try:
        created = onboarding_crud.bulk_create_repositories(db, org_id, repos)
        return [onboard_schemas.Repository.from_orm(r) for r in created]
    except Exception as e:
        log.exception("Bulk repo creation failed")
        raise APIError(status_code=500, error_code="repo_bulk_create_failed", message=str(e))


@app.post("/organizations/{org_id}/suborganizations", response_model=onboard_schemas.SubOrganization)
def create_suborganization_endpoint(org_id: str, suborg: dict, db: Session = Depends(get_db)):
    try:
        created = onboarding_crud.create_suborganization(db, org_id, suborg)
        return onboard_schemas.SubOrganization.from_orm(created)
    except Exception as e:
        log.exception("Create suborganization failed")
        raise APIError(status_code=500, error_code="suborg_create_failed", message=str(e))


@app.get("/organizations/{org_id}/suborganizations", response_model=List[onboard_schemas.SubOrganization])
def list_suborganizations_endpoint(org_id: str, db: Session = Depends(get_db)):
    try:
        items = onboarding_crud.list_suborganizations_by_org(db, org_id)
        return [onboard_schemas.SubOrganization.from_orm(i) for i in items]
    except Exception as e:
        log.exception("List suborganizations failed")
        raise APIError(status_code=500, error_code="suborg_list_failed", message=str(e))


@app.post("/suborganizations/{suborg_id}/applications", response_model=onboard_schemas.Application)
def create_application_endpoint(suborg_id: str, app: dict, db: Session = Depends(get_db)):
    try:
        created = onboarding_crud.create_application(db, suborg_id, app)
        return onboard_schemas.Application.from_orm(created)
    except Exception as e:
        log.exception("Create application failed")
        raise APIError(status_code=500, error_code="app_create_failed", message=str(e))


@app.get("/suborganizations/{suborg_id}/applications", response_model=List[onboard_schemas.Application])
def list_applications_endpoint(suborg_id: str, db: Session = Depends(get_db)):
    try:
        items = onboarding_crud.list_applications_by_suborg(db, suborg_id)
        return [onboard_schemas.Application.from_orm(i) for i in items]
    except Exception as e:
        log.exception("List applications failed")
        raise APIError(status_code=500, error_code="app_list_failed", message=str(e))


@app.post("/organizations/{org_id}/servers/bulk", response_model=List[onboard_schemas.Server])
def bulk_servers_endpoint(org_id: str, servers: List[dict], db: Session = Depends(get_db)):
    try:
        created = onboarding_crud.bulk_create_servers(db, org_id, servers)
        return [onboard_schemas.Server.from_orm(s) for s in created]
    except Exception as e:
        log.exception("Bulk server creation failed")
        raise APIError(status_code=500, error_code="server_bulk_create_failed", message=str(e))


@app.post("/organizations/{org_id}/domains/bulk", response_model=List[onboard_schemas.Domain])
def bulk_domains_endpoint(org_id: str, domains: List[dict], db: Session = Depends(get_db)):
    try:
        created = onboarding_crud.bulk_create_domains(db, org_id, domains)
        return [onboard_schemas.Domain.from_orm(d) for d in created]
    except Exception as e:
        log.exception("Bulk domain creation failed")
        raise APIError(status_code=500, error_code="domain_bulk_create_failed", message=str(e))


@app.get("/organizations/{org_id}", response_model=onboard_schemas.Organization)
def get_organization_endpoint(org_id: str, db: Session = Depends(get_db)):
    try:
        org = onboarding_crud.get_organization(db, org_id)
        if not org:
            raise APIError(status_code=404, error_code="org_not_found", message=f"Organization {org_id} not found")
        return onboard_schemas.Organization.from_orm(org)
    except APIError:
        raise
    except Exception as e:
        log.exception("Get organization failed")
        raise APIError(status_code=500, error_code="org_get_failed", message=str(e))


@app.get("/organizations", response_model=List[onboard_schemas.Organization])
def list_organizations_endpoint(db: Session = Depends(get_db)):
    try:
        orgs = onboarding_crud.list_organizations(db)
        return [onboard_schemas.Organization.from_orm(o) for o in orgs]
    except Exception as e:
        log.exception("List organizations failed")
        raise APIError(status_code=500, error_code="org_list_failed", message=str(e))


@app.get("/organizations/{org_id}/repositories", response_model=List[onboard_schemas.Repository])
def list_repositories_endpoint(org_id: str, db: Session = Depends(get_db)):
    try:
        repos = onboarding_crud.list_repositories_by_org(db, org_id)
        return [onboard_schemas.Repository.from_orm(r) for r in repos]
    except Exception as e:
        log.exception("List repositories failed")
        raise APIError(status_code=500, error_code="repo_list_failed", message=str(e))


@app.get("/suborganizations/{suborg_id}/repositories", response_model=List[onboard_schemas.Repository])
def list_repositories_by_suborg_endpoint(suborg_id: str, db: Session = Depends(get_db)):
    try:
        repos = onboarding_crud.list_repositories_by_suborg(db, suborg_id)
        return [onboard_schemas.Repository.from_orm(r) for r in repos]
    except Exception as e:
        log.exception("List repositories by suborg failed")
        raise APIError(status_code=500, error_code="repo_list_failed", message=str(e))


@app.get("/applications/{app_id}/repositories", response_model=List[onboard_schemas.Repository])
def list_repositories_by_app_endpoint(app_id: str, db: Session = Depends(get_db)):
    try:
        repos = onboarding_crud.list_repositories_by_app(db, app_id)
        return [onboard_schemas.Repository.from_orm(r) for r in repos]
    except Exception as e:
        log.exception("List repositories by app failed")
        raise APIError(status_code=500, error_code="repo_list_failed", message=str(e))


@app.get("/organizations/{org_id}/servers", response_model=List[onboard_schemas.Server])
def list_servers_endpoint(org_id: str, db: Session = Depends(get_db)):
    try:
        servers = onboarding_crud.list_servers_by_org(db, org_id)
        return [onboard_schemas.Server.from_orm(s) for s in servers]
    except Exception as e:
        log.exception("List servers failed")
        raise APIError(status_code=500, error_code="server_list_failed", message=str(e))


@app.get("/organizations/{org_id}/domains", response_model=List[onboard_schemas.Domain])
def list_domains_endpoint(org_id: str, db: Session = Depends(get_db)):
    try:
        domains = onboarding_crud.list_domains_by_org(db, org_id)
        return [onboard_schemas.Domain.from_orm(d) for d in domains]
    except Exception as e:
        log.exception("List domains failed")
        raise APIError(status_code=500, error_code="domain_list_failed", message=str(e))


@app.delete("/organizations/{org_id}")
def delete_organization_endpoint(org_id: str, db: Session = Depends(get_db)):
    """Delete an organization and all related onboarding data"""
    try:
        ok = onboarding_crud.delete_organization(db, org_id)
        if not ok:
            raise APIError(status_code=404, error_code="org_not_found", message=f"Organization {org_id} not found")
        return {"message": "Organization deleted successfully", "organization_id": org_id}
    except APIError:
        raise
    except Exception as e:
        log.exception("Delete organization failed")
        raise APIError(status_code=500, error_code="org_delete_failed", message=str(e))


@app.post("/organizations/{org_id}/scan-jobs", response_model=onboard_schemas.ScanJob)
def create_scan_jobs_endpoint(org_id: str, job: dict, db: Session = Depends(get_db)):
    """Create a scan job for the organization (used by onboarding to register scans)"""
    try:
        job['organization_id'] = org_id
        created = onboarding_crud.create_scan_job(db, job)
        return onboard_schemas.ScanJob.from_orm(created)
    except Exception as e:
        log.exception("Create scan job failed")
        raise APIError(status_code=500, error_code="scan_job_create_failed", message=str(e))


@app.post("/onboarding/jobs", response_model=onboard_schemas.OnboardingJob)
def create_onboarding_job_endpoint(job: dict, db: Session = Depends(get_db)):
    """Create an onboarding job record"""
    try:
        created = onboarding_crud.create_onboarding_job(db, job)
        return onboard_schemas.OnboardingJob.from_orm(created)
    except Exception as e:
        log.exception("Onboarding job create failed")
        raise APIError(status_code=500, error_code="onboarding_job_create_failed", message=str(e))

# ============================================================
# ONBOARDING BATCH ENDPOINTS
# ============================================================

@app.post("/onboarding-batches")
def create_onboarding_batch_endpoint(
    batch_data: dict = Body(...),
    db: Session = Depends(get_db)
):
    """
    Create a new onboarding batch record.
    Records which organization was onboarded and which scans were triggered.
    """
    log.info(f"Creating onboarding batch for org {batch_data.get('organization_name')}")
    try:
        batch = onboarding_crud.create_onboarding_batch(db, batch_data)
        return {
            "id": batch.id,
            "organization_id": batch.organization_id,
            "organization_name": batch.organization_name,
            "created_at": batch.created_at.isoformat() if batch.created_at else None
        }
    except Exception as e:
        log.exception("Create onboarding batch failed")
        raise APIError(status_code=500, error_code="onboarding_batch_create_failed", message=str(e))


@app.get("/onboarding-batches")
def list_onboarding_batches_endpoint(
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    List all onboarding batches, most recent first.
    Shows which organizations were onboarded and which scans were triggered.
    """
    log.info("Fetching onboarding batches")
    try:
        batches = onboarding_crud.list_onboarding_batches(db, limit=limit)
        return [{
            "id": b.id,
            "organization_id": b.organization_id,
            "organization_name": b.organization_name,
            "created_by": b.created_by,
            "repo_scan_job_id": b.repo_scan_job_id,
            "tls_scan_batch_id": b.tls_scan_batch_id,
            "total_repos": b.total_repos,
            "total_domains": b.total_domains,
            "total_servers": b.total_servers,
            "created_at": b.created_at.isoformat() if b.created_at else None
        } for b in batches]
    except Exception as e:
        log.exception("List onboarding batches failed")
        raise APIError(status_code=500, error_code="onboarding_batch_list_failed", message=str(e))


@app.get("/onboarding-batches/{batch_id}")
def get_onboarding_batch_endpoint(
    batch_id: str,
    db: Session = Depends(get_db)
):
    """
    Get details of a specific onboarding batch.
    """
    log.info(f"Fetching onboarding batch {batch_id}")
    try:
        batch = onboarding_crud.get_onboarding_batch(db, batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Onboarding batch not found")
        
        return {
            "id": batch.id,
            "organization_id": batch.organization_id,
            "organization_name": batch.organization_name,
            "created_by": batch.created_by,
            "repo_scan_job_id": batch.repo_scan_job_id,
            "tls_scan_batch_id": batch.tls_scan_batch_id,
            "total_repos": batch.total_repos,
            "total_domains": batch.total_domains,
            "total_servers": batch.total_servers,
            "created_at": batch.created_at.isoformat() if batch.created_at else None
        }
    except HTTPException:
        raise
    except Exception as e:
        log.exception("Get onboarding batch failed")
        raise APIError(status_code=500, error_code="onboarding_batch_get_failed", message=str(e))


@app.put("/onboarding-batches/{batch_id}/scan-ids")
def update_onboarding_batch_scan_ids_endpoint(
    batch_id: str,
    scan_ids: dict = Body(...),
    db: Session = Depends(get_db)
):
    """
    Update the scan job IDs for an onboarding batch.
    Called by onboarding service after triggering scans.
    """
    log.info(f"Updating scan IDs for onboarding batch {batch_id}")
    try:
        batch = onboarding_crud.update_onboarding_batch_scan_ids(
            db,
            batch_id,
            repo_scan_job_id=scan_ids.get('repo_scan_job_id'),
            tls_scan_batch_id=scan_ids.get('tls_scan_batch_id')
        )
        if not batch:
            raise HTTPException(status_code=404, detail="Onboarding batch not found")
        
        return {"success": True, "batch_id": batch.id}
    except HTTPException:
        raise
    except Exception as e:
        log.exception("Update onboarding batch scan IDs failed")
        raise APIError(status_code=500, error_code="onboarding_batch_update_failed", message=str(e))


@app.delete("/onboarding-batches/{batch_id}")
def delete_onboarding_batch_endpoint(
    batch_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete an onboarding batch record.
    Note: This does NOT delete the actual organization or scans,
    only the tracking record.
    """
    log.info(f"Deleting onboarding batch {batch_id}")
    try:
        success = onboarding_crud.delete_onboarding_batch(db, batch_id)
        if not success:
            raise HTTPException(status_code=404, detail="Onboarding batch not found")
        
        return {"success": True, "message": "Onboarding batch deleted"}
    except HTTPException:
        raise
    except Exception as e:
        log.exception("Delete onboarding batch failed")
        raise APIError(status_code=500, error_code="onboarding_batch_delete_failed", message=str(e))




@app.get("/")
def root():
    """
    API root endpoint with documentation.
    """
    return {
        "service": "Scan Storage Service",
        "version": "2.0",
        "description": "Persistent storage for crypto scan results (single-scan architecture)",
        "endpoints": {
            "POST /scans/result": "Store a single scan result",
            "GET /scans": "Get all scan results (filter by status)",
            "GET /scans/results": "Alias for /scans",
            "GET /scans/result/{result_id}": "Get specific scan result by ID",
            "GET /scans/url/{url}": "Get scan result by URL",
            "GET /scans/search": "Search results by normalized fields (pqc_grade, etc.)",
            "GET /scans/statistics": "Get scan statistics",
            "DELETE /scans/result/{result_id}": "Delete a scan result",
            "DELETE /scans/clear-all": "Clear ALL data (dangerous)",
            "GET /health": "Health check",
            "Mount /export": "Export endpoints (see /export/docs)"
        }
    }
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
from dashboard import dashboarder, dashboard_service
from database import engine, get_db
from exceptions import APIError
from logging_config import setup_logging
from logging_middleware import correlation_middleware

setup_logging("DB-SERVICE", logging.DEBUG)
log = logging.getLogger(__name__)

app = FastAPI(title="Scan Storage Service", version="1.0")
app.middleware("http")(correlation_middleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    """
    Health check endpoint for Docker and service monitoring.
    Returns 200 OK if service is up.
    """
    return {"status": "ok"}

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
# SCAN BATCH ENDPOINTS (Multiple URLs in one scan request)
# ============================================================

@app.post("/scans/batch", response_model=schemas.ScanBatch)
def create_scan_batch(
    batch: schemas.ScanBatchCreate, 
    db: Session = Depends(get_db)
):
    """
    Create a new scan batch (represents one scan request with multiple URLs).
    Returns the created batch with a unique batch_id.
    """
    log.info(f"📥 Creating batch: {batch.batch_id} with {batch.total_urls} URLs")
    try:
        result = crud.create_scan_batch(db, batch)
        log.info(f"✅ Batch created: {result.batch_id}")
        return result
    except Exception as e:
        log.exception("❌ Scan batch creation failed")
        raise APIError(status_code=500, error_code="batch_creation_failed", 
                      message=f"Scan batch creation failed: {str(e)}")

@app.get("/scans/batch", response_model=List[schemas.ScanBatch])
def get_all_scan_batches(
    skip: int = 0, 
    limit: int = 100,
    status: str = None,  # NEW: Filter by status
    db: Session = Depends(get_db)
):
    """
    Get all scan batches with pagination and optional status filter.
    Status values: 'pending', 'processing', 'completed', 'failed'
    """
    log.info(f"Entered /scans/batch endpoint (status filter: {status})")
    try:
        result = crud.get_scan_batches(db, skip=skip, limit=limit, status=status)
        log.info(f"Scan batches retrieved successfully (count: {len(result)})")
        return result
    except Exception as e:
        log.exception("Scan batches retrieval failed")
        raise APIError(status_code=500, error_code="batch_retrieval_failed", message=f"Scan batches retrieval failed: {str(e)}")

@app.get("/scans/batch/{batch_id}", response_model=schemas.ScanBatchWithNormalizedResults)
def get_scan_batch_by_id(batch_id: str, db: Session = Depends(get_db)):
    """
    Get a specific scan batch with all its scan results.
    
    Each result includes:
    - Normalized fields for fast filtering/display
    - raw_response for complete technical details
    """
    log.info(f"Entered /scans/batch/{batch_id} endpoint")
    try:
        batch = crud.get_scan_batch(db, batch_id)
        if not batch:
            raise APIError(status_code=404, error_code="batch_not_found", message=f"Scan batch {batch_id} not found")
        
        # This endpoint is intended to return normalized results.
        # We can directly use the ScanBatchWithNormalizedResults schema which will handle
        # the conversion of each `scan_result` in the batch.
        # The commented-out code seems to be an incomplete attempt at filtering,
        # which is not required by the current logic of this endpoint.
        
        # The `from_orm` method will create the Pydantic model from the SQLAlchemy model.
        # It will automatically convert the `scan_results` list as well.
        batch_with_filtered_results = schemas.ScanBatchWithNormalizedResults.from_orm(batch)
        
        log.info(f"Scan batch {batch_id} retrieved successfully")
        return batch_with_filtered_results
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Scan batch {batch_id} retrieval failed")
        raise APIError(status_code=500, error_code="batch_retrieval_failed", message=f"Scan batch {batch_id} retrieval failed: {str(e)}")

@app.delete("/scans/batch/{batch_id}")
def delete_scan_batch_endpoint(batch_id: str, db: Session = Depends(get_db)):
    """
    Delete a scan batch and all its associated scan results.
    """
    log.info(f"Entered /scans/batch/{batch_id} endpoint for deletion")
    try:
        success = crud.delete_scan_batch_completely(db, batch_id)
        if not success:
            raise APIError(status_code=404, error_code="batch_not_found", message=f"Scan batch {batch_id} not found or already deleted")
        
        log.info(f"Scan batch {batch_id} deleted successfully")
        return {
            "message": "Scan batch and all its results deleted successfully",
            "batch_id": batch_id
        }
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Scan batch {batch_id} deletion failed")
        raise APIError(status_code=500, error_code="batch_deletion_failed", message=f"Scan batch {batch_id} deletion failed: {str(e)}")

@app.put("/scans/batch/{batch_id}", response_model=schemas.ScanBatch)
def update_scan_batch(
    batch_id: str,
    batch: schemas.ScanBatchUpdate,
    db: Session = Depends(get_db)
):
    """
    Update a scan batch's status and counts.
    """
    log.info(f"Entered /scans/batch/{batch_id} endpoint for update")
    try:
        updated_batch = crud.update_scan_batch_status(
            db,
            batch_id=batch_id,
            status=batch.status,
            successful_count=batch.successful_count,
            failed_count=batch.failed_count
        )
        if not updated_batch:
            raise APIError(status_code=404, error_code="batch_not_found", message=f"Scan batch {batch_id} not found")
        
        log.info(f"Scan batch {batch_id} updated successfully")
        return updated_batch
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Scan batch {batch_id} update failed")
        raise APIError(status_code=500, error_code="batch_update_failed", message=f"Scan batch {batch_id} update failed: {str(e)}")

# ============================================================
# INDIVIDUAL SCAN RESULT ENDPOINTS
# ============================================================

@app.post("/scans/result", response_model=schemas.ScanResult)
def create_scan_result(
    scan: schemas.ScanResultCreate, 
    db: Session = Depends(get_db)
):
    """
    Store a single scan result (linked to a batch_id).
    """
    log.info("Entered /scans/result endpoint")
    try:
        result = crud.create_scan_result(db, scan)
        log.info("Scan result created successfully")
        return result
    except Exception as e:
        log.exception("Scan result creation failed")
        raise APIError(status_code=500, error_code="result_creation_failed", message=f"Scan result creation failed: {str(e)}")

@app.get("/scans/results", response_model=List[schemas.ScanResultWithNormalized])
def get_all_scan_results(
    batch_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    """
    Get all scan results with optional filtering.
    
    Query by normalized fields:
    - ?status=completed
    - ?batch_id=batch_123
    
    Returns normalized fields + raw_response for each result.
    """
    log.info("Entered /scans/results endpoint")
    try:
        results = crud.get_scan_results(db, batch_id=batch_id, status=status, skip=skip, limit=limit)
        log.info("Scan results retrieved successfully")
        return [schemas.ScanResultWithNormalized.from_orm(r) for r in results]
    except Exception as e:
        log.exception("Scan results retrieval failed")
        raise APIError(status_code=500, error_code="results_retrieval_failed", message=f"Scan results retrieval failed: {str(e)}")

@app.get("/scans/result/{result_id}", response_model=schemas.ScanResultWithNormalized)
def get_scan_result_by_id(result_id: int, db: Session = Depends(get_db)):
    """
    Get a specific scan result by its ID.
    
    Returns:
    - Normalized queryable fields (pqc_grade, kex_score, tls_version, etc.)
    - raw_response: Complete JSON audit trail
    
    Frontend receives BOTH - uses normalized fields for display,
    raw_response for drill-down and detailed analysis.
    """
    log.info(f"Entered /scans/result/{result_id} endpoint")
    try:
        result = crud.get_scan_result(db, result_id)
        if not result:
            raise APIError(status_code=404, error_code="result_not_found", message=f"Scan result {result_id} not found")
        
        log.info(f"Scan result {result_id} retrieved successfully")
        return result
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Scan result {result_id} retrieval failed")
        raise APIError(status_code=500, error_code="result_retrieval_failed", message=f"Scan result {result_id} retrieval failed: {str(e)}")

@app.delete("/scans/result/{result_id}")
def delete_individual_scan_result(result_id: int, db: Session = Depends(get_db)):
    """
    Delete a single scan result.
    The batch counts will be automatically updated.
    """
    log.info(f"Entered /scans/result/{result_id} endpoint for deletion")
    try:
        success = crud.delete_single_scan_result(db, result_id)
        if not success:
            raise APIError(status_code=404, error_code="result_not_found", message=f"Scan result {result_id} not found or already deleted")
        
        log.info(f"Scan result {result_id} deleted successfully")
        return {
            "message": "Scan result deleted successfully",
            "result_id": result_id
        }
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Scan result {result_id} deletion failed")
        raise APIError(status_code=500, error_code="result_deletion_failed", message=f"Scan result {result_id} deletion failed: {str(e)}")

@app.get("/scans/search", response_model=List[schemas.ScanResultWithNormalized])
def search_scan_results(
    pqc_grade: Optional[str] = None,  # Filter by PQC grade: A+, A, B, etc.
    quantum_ready: Optional[bool] = None,  # Only quantum-ready scans
    tls_version: Optional[str] = None,  # Filter by TLS version: TLS 1.3
    status: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Search scan results using normalized fields.
    
    Examples:
    - /scans/search?pqc_grade=A&quantum_ready=true
    - /scans/search?tls_version=TLS%201.3
    - /scans/search?status=completed
    
    Uses normalized DB columns for efficient queries.
    Returns results with both normalized fields AND raw_response.
    """
    log.info("Entered /scans/search endpoint")
    try:
        query = db.query(models.ScanResult)
        
        # Filter by normalized fields
        if pqc_grade:
            query = query.filter(models.ScanResult.pqc_overall_grade == pqc_grade)
        
        if quantum_ready is not None:
            query = query.filter(models.ScanResult.pqc_quantum_ready == quantum_ready)
        
        if tls_version:
            # Use contains for flexible matching (e.g., "TLS 1.3" in "TLS 1.2, TLS 1.3")
            query = query.filter(models.ScanResult.tls_version.ilike(f"%{tls_version}%"))
        
        if status:
            query = query.filter(models.ScanResult.status == status)
        
        results = query.order_by(
            models.ScanResult.completed_at.desc().nulls_last()
        ).limit(limit).all()
        
        log.info("Scan results searched successfully")
        # Use from_orm to convert each SQLAlchemy model instance to a Pydantic model
        return [schemas.ScanResultWithNormalized.from_orm(r) for r in results]
    except Exception as e:
        log.exception("Scan results search failed")
        raise APIError(status_code=500, error_code="results_search_failed", message=f"Scan results search failed: {str(e)}")


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

@app.delete("/scans/clear-all")
def clear_all_data(db: Session = Depends(get_db)):
    """
    DANGER: Delete ALL scan batches and results from database.
    This operation cannot be undone.
    """
    log.info("Entered /scans/clear-all endpoint")
    try:
        # Delete in correct order: results first, then batches
        deleted_results = db.query(models.ScanResult).delete()
        deleted_batches = db.query(models.ScanBatch).delete()
        
        db.commit()
        
        log.info("All data cleared successfully")
        return {
            "message": "All data cleared successfully from database",
            "deleted_results": deleted_results,
            "deleted_batches": deleted_batches,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        db.rollback()
        log.exception("Error clearing all data")
        raise APIError(status_code=500, error_code="clear_all_failed", message=f"Error clearing data: {str(e)}")

@app.get("/scans/stats")
def get_scan_statistics(db: Session = Depends(get_db)):
    """
    Get database statistics using normalized fields.
    
    Efficiently queries normalized columns (no JSON parsing needed).
    """
    log.info("Entered /scans/stats endpoint")
    try:
        stats = crud.get_scan_statistics(db)
        log.info("Scan statistics retrieved successfully")
        return stats
    except Exception as e:
        log.exception("Scan statistics retrieval failed")
        raise APIError(status_code=500, error_code="stats_retrieval_failed", message=f"Scan statistics retrieval failed: {str(e)}")

# Optional: Add endpoint to get batch with all its results (useful for detail views)

@app.get("/scans/batch/{batch_id}/with-results")
def get_batch_with_results(batch_id: str, db: Session = Depends(get_db)):
    """
    Get a batch with all its associated results.
    Useful for detail pages.
    """
    log.info(f"Entered /scans/batch/{batch_id}/with-results endpoint")
    try:
        # TODO: Implement actual batch and results retrieval logic
        # Placeholder response to fix syntax error
        return {"batch_id": batch_id, "results": []}
    except Exception as e:
        log.exception("Batch with results retrieval failed")
        raise APIError(status_code=500, error_code="batch_results_retrieval_failed", message=f"Batch {batch_id} with results retrieval failed: {str(e)}")
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

# ============================================================
# CSV EXPORT ENDPOINTS
# ============================================================

@app.get("/export/summary")
def get_export_summary():
    """
    Get summary of all tables across all databases.
    Shows table names, row counts, and column names.
    """
    log.info("📊 Generating export summary")
    try:
        summary = dashboarder.get_export_summary()
        return summary
    except Exception as e:
        log.exception("Export summary failed")
        raise APIError(
            status_code=500,
            error_code="export_summary_failed",
            message=f"Failed to generate export summary: {str(e)}"
        )


@app.get("/export/table/{db_name}/{table_name}")
def export_single_table_csv(db_name: str, table_name: str):
    """
    Export a single table as CSV.
    
    Parameters:
    - db_name: scandb, repo_scanner_db, or system_scanner_db
    - table_name: Name of the table to export
    
    Returns CSV file for download.
    """
    log.info(f"📥 Exporting {db_name}.{table_name}")
    
    # Validate database name
    valid_dbs = ['scandb', 'repo_scanner_db', 'system_scanner_db']
    if db_name not in valid_dbs:
        raise APIError(
            status_code=400,
            error_code="invalid_database",
            message=f"Database must be one of: {', '.join(valid_dbs)}"
        )
    
    try:
        csv_content = dashboarder.export_table_to_csv(db_name, table_name)
        
        if not csv_content:
            raise APIError(
                status_code=404,
                error_code="table_not_found",
                message=f"Table {table_name} not found in {db_name} or has no data"
            )
        
        # Return as downloadable CSV
        return StreamingResponse(
            io.StringIO(csv_content),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={db_name}_{table_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Export failed for {db_name}.{table_name}")
        raise APIError(
            status_code=500,
            error_code="export_failed",
            message=f"Failed to export table: {str(e)}"
        )


@app.get("/export/database/{db_name}")
def export_database_zip(db_name: str):
    """
    Export all tables from a specific database as a ZIP file containing CSV files.
    
    Parameters:
    - db_name: scandb, repo_scanner_db, or system_scanner_db
    
    Returns ZIP file with all tables as CSV files.
    """
    log.info(f"📦 Exporting entire database: {db_name}")
    
    # Validate database name
    valid_dbs = ['scandb', 'repo_scanner_db', 'system_scanner_db']
    if db_name not in valid_dbs:
        raise APIError(
            status_code=400,
            error_code="invalid_database",
            message=f"Database must be one of: {', '.join(valid_dbs)}"
        )
    
    try:
        # Get all tables
        tables = dashboarder.get_table_names(db_name)
        
        if not tables:
            raise APIError(
                status_code=404,
                error_code="no_tables_found",
                message=f"No tables found in {db_name}"
            )
        
        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for table_name in tables:
                csv_content = dashboarder.export_table_to_csv(db_name, table_name)
                if csv_content:
                    zip_file.writestr(f"{table_name}.csv", csv_content)
        
        zip_buffer.seek(0)
        
        # Return as downloadable ZIP
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={db_name}_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
            }
        )
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Database export failed for {db_name}")
        raise APIError(
            status_code=500,
            error_code="database_export_failed",
            message=f"Failed to export database: {str(e)}"
        )


@app.get("/export/all")
def export_all_databases_zip():
    """
    Export ALL tables from ALL databases as a single ZIP file.
    
    The ZIP structure:
    - scandb/
      - table1.csv
      - table2.csv
    - repo_scanner_db/
      - table1.csv
    - system_scanner_db/
      - table1.csv
    
    Returns ZIP file with complete database export.
    """
    log.info("📦 Exporting ALL databases")
    
    try:
        # Export all tables from all databases
        all_exports = dashboarder.export_all_tables()
        
        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for db_name, tables in all_exports.items():
                for table_name, csv_content in tables.items():
                    # Create folder structure in ZIP
                    zip_file.writestr(f"{db_name}/{table_name}.csv", csv_content)
        
        zip_buffer.seek(0)
        
        # Return as downloadable ZIP
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename=complete_database_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
            }
        )
    except Exception as e:
        log.exception("Complete export failed")
        raise APIError(
            status_code=500,
            error_code="complete_export_failed",
            message=f"Failed to export all databases: {str(e)}"
        )


@app.get("/export/all-with-summary")
def export_all_with_summary():
    """
    Get complete database export with summary and actual data.
    
    Returns comprehensive JSON with:
    1. Summary: Table counts, row counts, column names
    2. Data: Complete data from all tables in all databases
    
    Structure:
    {
        "timestamp": "2026-01-07T10:30:00",
        "summary": {
            "total_databases": 3,
            "total_tables": 21,
            "total_rows": 1500,
            "databases": {
                "scandb": {
                    "table_count": 13,
                    "total_rows": 1000,
                    "tables": {
                        "organizations": {
                            "row_count": 50,
                            "columns": ["id", "name", ...],
                            "has_data": true
                        }
                    }
                }
            }
        },
        "data": {
            "scandb": {
                "organizations": [
                    {"id": "uuid-1", "organization_name": "Acme Corp", ...},
                    {"id": "uuid-2", "organization_name": "Tech Inc", ...}
                ],
                "scan_results": [...]
            },
            "repo_scanner_db": {...},
            "system_scanner_db": {...}
        }
    }
    
    ⚠️ WARNING: This can be a very large response if you have lots of data.
    Use pagination or specific table exports for production systems.
    """
    log.info("📊 Generating complete export with summary and data")
    
    try:
        complete_export = dashboarder.get_complete_export_with_summary()
        
        # Log the size
        import json
        export_size_mb = len(json.dumps(complete_export, default=str)) / (1024 * 1024)
        log.info(f"📦 Export size: {export_size_mb:.2f} MB")
        
        if export_size_mb > 100:
            log.warning(f"⚠️  Large export detected: {export_size_mb:.2f} MB")
        
        return complete_export
        
    except Exception as e:
        log.exception("Complete export with summary failed")
        raise APIError(
            status_code=500,
            error_code="complete_export_failed",
            message=f"Failed to generate complete export: {str(e)}"
        )


@app.get("/export/all-with-summary/download")
def download_all_with_summary():
    """
    Download complete database export as JSON file.
    Same as /export/all-with-summary but as downloadable file.
    """
    log.info("📥 Generating downloadable complete export")
    
    try:
        complete_export = dashboarder.get_complete_export_with_summary()
        
        # Convert to JSON string
        import json
        json_content = json.dumps(complete_export, indent=2, default=str)
        
        # Return as downloadable file
        return StreamingResponse(
            io.StringIO(json_content),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=complete_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            }
        )
        
    except Exception as e:
        log.exception("Download export failed")
        raise APIError(
            status_code=500,
            error_code="download_export_failed",
            message=f"Failed to generate download: {str(e)}"
        )


@app.get("/export/all-with-summary/database/{db_name}")
def export_single_database_with_summary(db_name: str):
    """
    Get complete export for a single database with summary.
    
    Parameters:
    - db_name: scandb, repo_scanner_db, or system_scanner_db
    
    Returns JSON with summary and data for specified database only.
    """
    log.info(f"📊 Generating complete export for {db_name}")
    
    # Validate database name
    valid_dbs = ['scandb', 'repo_scanner_db', 'system_scanner_db']
    if db_name not in valid_dbs:
        raise APIError(
            status_code=400,
            error_code="invalid_database",
            message=f"Database must be one of: {', '.join(valid_dbs)}"
        )
    
    try:
        # Get full export
        complete_export = dashboarder.get_complete_export_with_summary()
        
        # Extract only requested database
        result = {
            "timestamp": complete_export["timestamp"],
            "database": db_name,
            "summary": complete_export["summary"]["databases"].get(db_name, {}),
            "data": complete_export["data"].get(db_name, {})
        }
        
        return result
        
    except Exception as e:
        log.exception(f"Export failed for {db_name}")
        raise APIError(
            status_code=500,
            error_code="database_export_failed",
            message=f"Failed to export {db_name}: {str(e)}"
        )


@app.get("/export/all-with-summary/table/{db_name}/{table_name}")
def export_single_table_with_summary(db_name: str, table_name: str):
    """
    Get complete export for a single table with summary.
    
    Parameters:
    - db_name: scandb, repo_scanner_db, or system_scanner_db
    - table_name: Name of the table
    
    Returns JSON with summary and data for specified table only.
    """
    log.info(f"📊 Generating complete export for {db_name}.{table_name}")
    
    # Validate database name
    valid_dbs = ['scandb', 'repo_scanner_db', 'system_scanner_db']
    if db_name not in valid_dbs:
        raise APIError(
            status_code=400,
            error_code="invalid_database",
            message=f"Database must be one of: {', '.join(valid_dbs)}"
        )
    
    try:
        # Get table data
        table_data = dashboarder.get_table_data(db_name, table_name)
        
        # Build response
        result = {
            "timestamp": datetime.now().isoformat(),
            "database": db_name,
            "table": table_name,
            "summary": {
                "row_count": len(table_data),
                "columns": list(table_data[0].keys()) if table_data else [],
                "has_data": len(table_data) > 0
            },
            "data": table_data
        }
        
        return result
        
    except Exception as e:
        log.exception(f"Export failed for {db_name}.{table_name}")
        raise APIError(
            status_code=500,
            error_code="table_export_failed",
            message=f"Failed to export {db_name}.{table_name}: {str(e)}"
        )


@app.get("/export/tables")
def list_all_tables():
    """
    List all available tables across all databases.
    Useful for knowing what can be exported.
    """
    log.info("📋 Listing all tables")
    
    try:
        result = {}
        
        for db_name in ['scandb', 'repo_scanner_db', 'system_scanner_db']:
            tables = dashboarder.get_table_names(db_name)
            result[db_name] = tables
        
        return result
    except Exception as e:
        log.exception("Failed to list tables")
        raise APIError(
            status_code=500,
            error_code="list_tables_failed",
            message=f"Failed to list tables: {str(e)}"
        )

# ============================================================
# DASHBOARD ENDPOINTS
# ============================================================

@app.get("/dashboard")
def get_dashboard_data(db: Session = Depends(get_db)):
    """
    Get complete dashboard data in Document 1 format.
    
    Returns application-centric view with:
    - Organizational hierarchy
    - PQC readiness metrics
    - Migration status
    - Vulnerability counts
    - Algorithm and certificate analysis
    
    Structure:
    [
        {
            "Organisation": "Cleveland Labs",
            "Org ID": "uuid",
            "Sub Org": "EHR Systems",
            "Sub Org ID": "uuid",
            "Org Target Migration Data": "Q4 2026",
            "application": "Epic EHR Backend",
            "Application ID": "uuid",
            "pqc_ready": 85.5,
            "risk_level": "Low",
            "status": "In Progress",
            "alg_changes": 3,
            "cert_changes": 2,
            "total_algorithms": 15,
            "total_certificates": 8,
            "total_pqc_vulnerable_certificates": 2,
            "total_pqc_vulnerable_algorithms": 3,
            "vulnerabilities": 5,
            "time_complexity": "Medium",
            "current_date": "01-07-2026",
            "App Category": "Application",
            "algorithms_used": ["AES-256", "RSA-2048", ...]
        },
        ...
    ]
    """
    log.info("📊 Dashboard endpoint called")
    
    try:
        dashboard_data = dashboard_service.get_dashboard_data(db)
        
        return dashboard_data
        
    except Exception as e:
        log.exception("Dashboard generation failed")
        raise APIError(
            status_code=500,
            error_code="dashboard_generation_failed",
            message=f"Failed to generate dashboard: {str(e)}"
        )


@app.get("/dashboard/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    """
    Get dashboard summary statistics.
    
    Returns aggregated metrics across all applications:
    - Total applications
    - Risk level distribution
    - Migration status distribution
    - Average PQC readiness score
    - Total vulnerabilities
    """
    log.info("📈 Dashboard summary endpoint called")
    
    try:
        dashboard_data = dashboard_service.get_dashboard_data(db)
        
        # Calculate summary statistics
        total_apps = len(dashboard_data)
        
        # Risk level distribution
        risk_distribution = {
            "Low": 0,
            "Medium": 0,
            "High": 0,
            "Very High": 0
        }
        
        # Status distribution
        status_distribution = {}
        
        # PQC scores
        pqc_scores = []
        total_vulnerabilities = 0
        total_alg_changes = 0
        total_cert_changes = 0
        
        for app in dashboard_data:
            # Risk levels
            risk = app.get("risk_level", "Very High")
            risk_distribution[risk] = risk_distribution.get(risk, 0) + 1
            
            # Status
            status = app.get("status", "Not Started")
            status_distribution[status] = status_distribution.get(status, 0) + 1
            
            # Metrics
            pqc_scores.append(app.get("pqc_ready", 0))
            total_vulnerabilities += app.get("vulnerabilities", 0)
            total_alg_changes += app.get("alg_changes", 0)
            total_cert_changes += app.get("cert_changes", 0)
        
        avg_pqc_score = sum(pqc_scores) / len(pqc_scores) if pqc_scores else 0
        
        summary = {
            "timestamp": datetime.now().isoformat(),
            "overview": {
                "total_applications": total_apps,
                "average_pqc_readiness": round(avg_pqc_score, 2),
                "total_vulnerabilities": total_vulnerabilities,
                "total_algorithm_changes_needed": total_alg_changes,
                "total_certificate_changes_needed": total_cert_changes
            },
            "risk_distribution": risk_distribution,
            "status_distribution": status_distribution,
            "risk_percentage": {
                risk: round((count / total_apps * 100), 1) if total_apps > 0 else 0
                for risk, count in risk_distribution.items()
            }
        }
        
        return summary
        
    except Exception as e:
        log.exception("Dashboard summary failed")
        raise APIError(
            status_code=500,
            error_code="dashboard_summary_failed",
            message=f"Failed to generate dashboard summary: {str(e)}"
        )


@app.get("/dashboard/organization/{org_id}")
def get_dashboard_by_organization(org_id: str, db: Session = Depends(get_db)):
    """
    Get dashboard data filtered by organization.
    
    Returns all applications under the specified organization.
    """
    log.info(f"📊 Dashboard endpoint called for org: {org_id}")
    
    try:
        dashboard_data = dashboard_service.get_dashboard_data(db)
        
        # Filter by organization
        org_data = [
            app for app in dashboard_data 
            if app.get("Org ID") == org_id
        ]
        
        if not org_data:
            raise APIError(
                status_code=404,
                error_code="organization_not_found",
                message=f"No applications found for organization {org_id}"
            )
        
        return {
            "success": True,
            "timestamp": datetime.now().isoformat(),
            "organization_id": org_id,
            "organization_name": org_data[0].get("Organisation", ""),
            "total_applications": len(org_data),
            "data": org_data
        }
        
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Dashboard generation failed for org {org_id}")
        raise APIError(
            status_code=500,
            error_code="dashboard_generation_failed",
            message=f"Failed to generate dashboard: {str(e)}"
        )


@app.get("/dashboard/suborganization/{suborg_id}")
def get_dashboard_by_suborganization(suborg_id: str, db: Session = Depends(get_db)):
    """
    Get dashboard data filtered by sub-organization.
    
    Returns all applications under the specified sub-organization.
    """
    log.info(f"📊 Dashboard endpoint called for suborg: {suborg_id}")
    
    try:
        dashboard_data = dashboard_service.get_dashboard_data(db)
        
        # Filter by sub-organization
        suborg_data = [
            app for app in dashboard_data 
            if app.get("Sub Org ID") == suborg_id
        ]
        
        if not suborg_data:
            raise APIError(
                status_code=404,
                error_code="suborganization_not_found",
                message=f"No applications found for sub-organization {suborg_id}"
            )
        
        return {
            "success": True,
            "timestamp": datetime.now().isoformat(),
            "suborganization_id": suborg_id,
            "suborganization_name": suborg_data[0].get("Sub Org", ""),
            "total_applications": len(suborg_data),
            "data": suborg_data
        }
        
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Dashboard generation failed for suborg {suborg_id}")
        raise APIError(
            status_code=500,
            error_code="dashboard_generation_failed",
            message=f"Failed to generate dashboard: {str(e)}"
        )


@app.get("/dashboard/application/{app_id}")
def get_dashboard_application_detail(app_id: str, db: Session = Depends(get_db)):
    """
    Get detailed dashboard data for a single application.
    
    Returns complete metrics for the specified application.
    """
    log.info(f"📊 Dashboard detail endpoint called for app: {app_id}")
    
    try:
        dashboard_data = dashboard_service.get_dashboard_data(db)
        
        # Find specific application
        app_data = next(
            (app for app in dashboard_data if app.get("Application ID") == app_id),
            None
        )
        
        if not app_data:
            raise APIError(
                status_code=404,
                error_code="application_not_found",
                message=f"Application {app_id} not found"
            )
        
        return {
            "success": True,
            "timestamp": datetime.now().isoformat(),
            "application_id": app_id,
            "data": app_data
        }
        
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Dashboard detail failed for app {app_id}")
        raise APIError(
            status_code=500,
            error_code="dashboard_detail_failed",
            message=f"Failed to get application detail: {str(e)}"
        )


@app.get("/dashboard/export/csv")
def export_dashboard_csv(db: Session = Depends(get_db)):
    """
    Export dashboard data as CSV file.
    
    Downloads the complete dashboard as a CSV file.
    """
    log.info("📥 Dashboard CSV export called")
    
    try:
        dashboard_data = dashboard_service.get_dashboard_data(db)
        
        if not dashboard_data:
            raise APIError(
                status_code=404,
                error_code="no_data",
                message="No dashboard data available"
            )
        
        # Create CSV
        output = io.StringIO()
        fieldnames = list(dashboard_data[0].keys())
        
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        
        for row in dashboard_data:
            # Convert arrays to strings for CSV
            csv_row = row.copy()
            csv_row['algorithms_used'] = ', '.join(row.get('algorithms_used', []))
            writer.writerow(csv_row)
        
        csv_content = output.getvalue()
        output.close()
        
        # Return as downloadable file
        return StreamingResponse(
            io.StringIO(csv_content),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=dashboard_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )
        
    except APIError:
        raise
    except Exception as e:
        log.exception("Dashboard CSV export failed")
        raise APIError(
            status_code=500,
            error_code="csv_export_failed",
            message=f"Failed to export CSV: {str(e)}"
        )


@app.get("/dashboard/export/json")
def export_dashboard_json(db: Session = Depends(get_db)):
    """
    Export dashboard data as JSON file.
    
    Downloads the complete dashboard as a JSON file.
    """
    log.info("📥 Dashboard JSON export called")
    
    try:
        dashboard_data = dashboard_service.get_dashboard_data(db)
        
        export_data = {
            "timestamp": datetime.now().isoformat(),
            "total_applications": len(dashboard_data),
            "data": dashboard_data
        }
        
        json_content = json.dumps(export_data, indent=2, default=str)
        
        # Return as downloadable file
        return StreamingResponse(
            io.StringIO(json_content),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=dashboard_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            }
        )
        
    except Exception as e:
        log.exception("Dashboard JSON export failed")
        raise APIError(
            status_code=500,
            error_code="json_export_failed",
            message=f"Failed to export JSON: {str(e)}"
        )

@app.get("/")
def root():
    """
    API root endpoint with documentation.
    """
    return {
        "service": "Scan Storage Service",
        "version": "1.0",
        "description": "Persistent storage for crypto scan results",
        "endpoints": {
            "POST /scans/batch": "Create a new scan batch",
            "GET /scans/batch": "Get all scan batches",
            "GET /scans/batch/{batch_id}": "Get specific batch with results",
            "DELETE /scans/batch/{batch_id}": "Delete a batch and its results",
            "POST /scans/result": "Store a single scan result",
            "GET /scans/result": "Get all scan results (filter by batch_id/status)",
            "GET /scans/search": "Search results by normalized fields (pqc_grade, etc.)",
            "GET /scans/result/{result_id}": "Get specific scan result",
            "DELETE /scans/result/{result_id}": "Delete a scan result",
            "DELETE /scans/clear-all": "Clear ALL data (dangerous)",
            "GET /scans/stats": "Get database statistics",
            "GET /health": "Health check",
            # Export Endpoints
            "GET /export/summary": "Get summary of all tables",
            "GET /export/tables": "List all tables",
            "GET /export/table/{db_name}/{table_name}": "Export single table as CSV",
            "GET /export/database/{db_name}": "Export database as ZIP",
            "GET /export/all": "Export all databases as ZIP",
            "GET /export/all-with-summary": "Get complete export (JSON) with summary",
            "GET /export/all-with-summary/download": "Download complete export (JSON)",
            # Dashboard Endpoints
            "GET /dashboard": "Get complete dashboard data (Document 1 format)",
            "GET /dashboard/summary": "Get dashboard summary statistics",
            "GET /dashboard/organization/{org_id}": "Get dashboard filtered by organization",
            "GET /dashboard/suborganization/{suborg_id}": "Get dashboard filtered by sub-organization",
            "GET /dashboard/application/{app_id}": "Get detailed dashboard for single application",
            "GET /dashboard/export/csv": "Export dashboard as CSV file",
            "GET /dashboard/export/json": "Export dashboard as JSON file"
        }
    }
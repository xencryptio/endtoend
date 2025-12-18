from fastapi import FastAPI, HTTPException, Depends, Body, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse # Import JSONResponse
from fastapi.exceptions import RequestValidationError # Import RequestValidationError
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from datetime import datetime
import models
import schemas
import crud
from database import engine, get_db
from logging_config import setup_logging
import logging
from logging_middleware import correlation_middleware
from exceptions import APIError # Import APIError

# Create database tables on startup
setup_logging("DB-SERVICE", logging.DEBUG)
log = logging.getLogger(__name__)


app = FastAPI(title="Scan Storage Service", version="1.0")
app.middleware("http")(correlation_middleware)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    db: Session = Depends(get_db)
):
    """
    Get all scan batches with pagination.
    """
    log.info("Entered /scans/batch endpoint")
    try:
        result = crud.get_scan_batches(db, skip=skip, limit=limit)
        log.info("Scan batches retrieved successfully")
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
        batch = crud.get_scan_batch(db, batch_id)
        if not batch:
            raise APIError(status_code=404, error_code="batch_not_found", message=f"Batch {batch_id} not found")
        
        log.info(f"Batch {batch_id} with results retrieved successfully")
        return {
            "batch": batch,
            "results": batch.scan_results if batch.scan_results else []
        }
    except APIError:
        raise
    except Exception as e:
        log.exception(f"Batch {batch_id} with results retrieval failed")
        raise APIError(status_code=500, error_code="batch_results_retrieval_failed", message=f"Batch {batch_id} with results retrieval failed: {str(e)}")

# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    """
    Check if service and database are healthy.
    """
    log.info("Health check called")
    try:
        # Create all tables first (idempotent operation)
        log.info("Starting service...")
        log.info("Connecting to database...")
        models.Base.metadata.create_all(bind=engine)
        
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
            "GET /health": "Health check"
        }
    }
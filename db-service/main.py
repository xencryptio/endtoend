from fastapi import FastAPI, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from datetime import datetime
import models
import schemas
import crud
from database import engine, get_db

# Create database tables on startup
try:
    models.Base.metadata.create_all(bind=engine)
    print("✅ Database tables created/verified")
except Exception as e:
    print(f"⚠️ Error creating tables: {e}")


app = FastAPI(title="Scan Storage Service", version="1.0")

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    return crud.create_scan_batch(db, batch)

@app.get("/scans/batch", response_model=List[schemas.ScanBatch])
def get_all_scan_batches(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    """
    Get all scan batches with pagination.
    """
    return crud.get_scan_batches(db, skip=skip, limit=limit)

@app.get("/scans/batch/{batch_id}", response_model=schemas.ScanBatchWithNormalizedResults)
def get_scan_batch_by_id(batch_id: str, db: Session = Depends(get_db)):
    """
    Get a specific scan batch with all its scan results.
    
    Each result includes:
    - Normalized fields for fast filtering/display
    - raw_response for complete technical details
    """
    batch = crud.get_scan_batch(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Scan batch not found")
    
    # Convert results to normalized schema
    normalized_results = [
        schemas.ScanResultWithNormalized.from_orm(r) 
        for r in batch.scan_results
    ]
    
    return schemas.ScanBatchWithNormalizedResults.from_orm(batch)

@app.delete("/scans/batch/{batch_id}")
def delete_scan_batch_endpoint(batch_id: str, db: Session = Depends(get_db)):
    """
    Delete a scan batch and all its associated scan results.
    """
    success = crud.delete_scan_batch_completely(db, batch_id)
    if not success:
        raise HTTPException(status_code=404, detail="Scan batch not found or already deleted")
    return {
        "message": "Scan batch and all its results deleted successfully",
        "batch_id": batch_id
    }

@app.put("/scans/batch/{batch_id}", response_model=schemas.ScanBatch)
def update_scan_batch(
    batch_id: str,
    batch: schemas.ScanBatchUpdate,
    db: Session = Depends(get_db)
):
    """
    Update a scan batch's status and counts.
    """
    updated_batch = crud.update_scan_batch_status(
        db,
        batch_id=batch_id,
        status=batch.status,
        successful_count=batch.successful_count,
        failed_count=batch.failed_count
    )
    if not updated_batch:
        raise HTTPException(status_code=404, detail="Scan batch not found")
    return updated_batch

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
    return crud.create_scan_result(db, scan)

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
    results = crud.get_scan_results(db, batch_id=batch_id, status=status, skip=skip, limit=limit)
    return [schemas.ScanResultWithNormalized.from_orm(r) for r in results]

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
    result = crud.get_scan_result(db, result_id)
    if not result:
        raise HTTPException(status_code=404, detail="Scan result not found")
    return result

@app.delete("/scans/result/{result_id}")
def delete_individual_scan_result(result_id: int, db: Session = Depends(get_db)):
    """
    Delete a single scan result.
    The batch counts will be automatically updated.
    """
    success = crud.delete_single_scan_result(db, result_id)
    if not success:
        raise HTTPException(status_code=404, detail="Scan result not found or already deleted")
    return {
        "message": "Scan result deleted successfully",
        "result_id": result_id
    }

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
    
    # Use from_orm to convert each SQLAlchemy model instance to a Pydantic model
    return [schemas.ScanResultWithNormalized.from_orm(r) for r in results]


# ============================================================
# BULK OPERATIONS
# ============================================================

@app.delete("/scans/clear-all")
def clear_all_data(db: Session = Depends(get_db)):
    """
    DANGER: Delete ALL scan batches and results from database.
    This operation cannot be undone.
    """
    try:
        # Delete in correct order: results first, then batches
        deleted_results = db.query(models.ScanResult).delete()
        deleted_batches = db.query(models.ScanBatch).delete()
        
        db.commit()
        
        return {
            "message": "All data cleared successfully from database",
            "deleted_results": deleted_results,
            "deleted_batches": deleted_batches,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, 
            detail=f"Error clearing data: {str(e)}"
        )

@app.get("/scans/stats")
def get_scan_statistics(db: Session = Depends(get_db)):
    """
    Get database statistics using normalized fields.
    
    Efficiently queries normalized columns (no JSON parsing needed).
    """
    total_batches = db.query(models.ScanBatch).count()
    total_results = db.query(models.ScanResult).count()
    
    # Query normalized fields efficiently
    successful = db.query(models.ScanResult).filter(
        models.ScanResult.status == "completed"
    ).count()
    
    failed = db.query(models.ScanResult).filter(
        models.ScanResult.status == "failed"
    ).count()
    
    pending = db.query(models.ScanResult).filter(
        models.ScanResult.status == "pending"
    ).count()
    
    # Quantum ready statistics
    quantum_ready = db.query(models.ScanResult).filter(
        models.ScanResult.pqc_quantum_ready == True
    ).count()
    
    # Average scores using normalized fields
    from sqlalchemy import func
    avg_pqc = db.query(func.avg(models.ScanResult.pqc_overall_score)).filter(
        models.ScanResult.pqc_overall_score.isnot(None)
    ).scalar()
    
    avg_execution = db.query(func.avg(models.ScanResult.execution_time_seconds)).filter(
        models.ScanResult.execution_time_seconds.isnot(None)
    ).scalar()
    
    return crud.get_scan_statistics(db)

# Optional: Add endpoint to get batch with all its results (useful for detail views)

@app.get("/scans/batch/{batch_id}/with-results")
def get_batch_with_results(batch_id: str, db: Session = Depends(get_db)):
    """
    Get a batch with all its associated results.
    Useful for detail pages.
    """
    batch = crud.get_scan_batch(db, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    return {
        "batch": batch,
        "results": batch.scan_results if batch.scan_results else []
    }

# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    """
    Check if service and database are healthy.
    """
    try:
        # Create all tables first (idempotent operation)
        models.Base.metadata.create_all(bind=engine)
        
        # Test database connection with a simple query
        result = db.execute(text("SELECT 1"))
        db.commit()
        
        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"Health check error: {str(e)}")
        raise HTTPException(
            status_code=503, 
            detail=f"Database connection failed: {str(e)}"
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
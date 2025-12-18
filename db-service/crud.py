from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Tuple
import models
import schemas
from data_extractor import extract_all_normalized_fields
import logging


# ============================================================
# SCAN BATCH OPERATIONS
# ============================================================

def create_scan_batch(db: Session, batch: schemas.ScanBatchCreate) -> models.ScanBatch:
    """Create a new scan batch."""
    db_batch = models.ScanBatch(**batch.model_dump())
    db.add(db_batch)
    db.commit()
    db.refresh(db_batch)
    return db_batch


def get_scan_batch(db: Session, batch_id: str) -> Optional[models.ScanBatch]:
    """Get a scan batch by its batch_id."""
    return db.query(models.ScanBatch).filter(
        models.ScanBatch.batch_id == batch_id
    ).first()


def get_scan_batches(
    db: Session,
    skip: int = 0,
    limit: int = 100
) -> List[models.ScanBatch]:
    """Get all scan batches with pagination."""
    return db.query(models.ScanBatch).order_by(
        models.ScanBatch.created_at.desc()
    ).offset(skip).limit(limit).all()


def update_scan_batch_status(
    db: Session,
    batch_id: str,
    status: str,
    successful_count: int = None,
    failed_count: int = None
) -> Optional[models.ScanBatch]:
    """Update scan batch status and counts."""
    batch = get_scan_batch(db, batch_id)
    if batch:
        batch.status = status
        if successful_count is not None:
            batch.successful_count = successful_count
        if failed_count is not None:
            batch.failed_count = failed_count
        db.commit()
        db.refresh(batch)
    return batch


def delete_scan_batch_completely(db: Session, batch_id: str) -> bool:
    """Delete a scan batch and ALL its associated results from database."""
    try:
        batch_to_delete = db.query(models.ScanBatch).filter(
            models.ScanBatch.batch_id == batch_id
        ).first()
        if not batch_to_delete:
            return False

        db.delete(batch_to_delete)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        print(f"Error deleting batch {batch_id}: {e}")
        return False


# ============================================================
# SCAN RESULT OPERATIONS
# ============================================================

def create_scan_result(
    db: Session,
    scan: schemas.ScanResultCreate
) -> models.ScanResult:
    """Create a new scan result and extract normalized fields."""
    scan_data = scan.model_dump()
    log = logging.getLogger(__name__)

    log.info(f"Creating scan result for URL: {scan_data.get('url')}, Status: {scan_data.get('status')}")

    raw_response = scan_data.get("raw_response")
    if raw_response:
        log.info("Extracting normalized fields...")
        try:
            normalized_fields = extract_all_normalized_fields(raw_response)
            log.info(f"Extracted {len(normalized_fields)} normalized fields. PQC Score: {normalized_fields.get('pqc_overall_score')}, PQC Grade: {normalized_fields.get('pqc_overall_grade')}")

            # Update scan_data with normalized fields
            scan_data.update(normalized_fields)

            # Set scan_status from raw_response if available
            scan_data['scan_status'] = raw_response.get('scan_status', scan.scan_status)
            
            # Ensure status and scan_status are aligned for completed scans
            if scan_data['status'] == 'completed' and 'scan_status' not in raw_response:
                 scan_data['scan_status'] = 'completed'
        except Exception as e:
            log.warning(f"Error extracting normalized fields: {e}")
    else:
        log.warning("No raw_response provided!")

    # Remove deprecated fields
    if 'quantum_score' in scan_data:
        log.info("Removing quantum_score (replaced with pqc_overall_score)")
        del scan_data['quantum_score']
    if 'quantum_grade' in scan_data:
        log.info("Removing quantum_grade (replaced with pqc_overall_grade)")
        del scan_data['quantum_grade']

    try:
        db_scan = models.ScanResult(**scan_data)
        db.add(db_scan)
        db.commit()
        db.refresh(db_scan)

        log.info(f"Saved to database with ID: {db_scan.id}. Stored PQC Score: {db_scan.pqc_overall_score}, Stored PQC Grade: {db_scan.pqc_overall_grade}")

        update_batch_counts(db, scan.batch_id)
        return db_scan

    except Exception as e:
        log.exception("Error creating database record")
        db.rollback()
        raise


def get_scan_result(db: Session, result_id: int) -> Optional[models.ScanResult]:
    """Get a scan result by its ID."""
    return db.query(models.ScanResult).filter(
        models.ScanResult.id == result_id
    ).first()


def get_scan_results(
    db: Session,
    batch_id: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> List[models.ScanResult]:
    """Get scan results with optional filtering."""
    query = db.query(models.ScanResult)
    if batch_id:
        query = query.filter(models.ScanResult.batch_id == batch_id)
    if status:
        query = query.filter(models.ScanResult.status == status)

    return query.order_by(
        models.ScanResult.requested_at.desc()
    ).offset(skip).limit(limit).all()


def update_scan_result(
    db: Session,
    result_id: int,
    **kwargs
) -> Optional[models.ScanResult]:
    """Update scan result (re-extract normalized fields if raw_response provided)."""
    result = get_scan_result(db, result_id)
    if not result:
        return None

    # If raw_response updated → extract new normalized fields
    if "raw_response" in kwargs and kwargs["raw_response"]:
        try:
            normalized = extract_all_normalized_fields(kwargs["raw_response"])
            for key, value in normalized.items():
                if hasattr(result, key):
                    setattr(result, key, value)
        except Exception as e:
            print(f"⚠️ Error extracting normalized fields during update: {e}")

    # Remove deprecated fields
    if 'quantum_score' in kwargs:
        del kwargs['quantum_score']
    if 'quantum_grade' in kwargs:
        del kwargs['quantum_grade']

    # Apply field updates
    for key, value in kwargs.items():
        if hasattr(result, key):
            setattr(result, key, value)

    db.commit()
    db.refresh(result)
    update_batch_counts(db, result.batch_id)
    return result


def delete_single_scan_result(db: Session, result_id: int) -> bool:
    """Delete a single scan result and update batch counts."""
    try:
        result = db.query(models.ScanResult).filter(
            models.ScanResult.id == result_id
        ).first()
        if not result:
            return False

        batch_id = result.batch_id
        db.delete(result)
        db.commit()
        update_batch_counts(db, batch_id)
        return True
    except Exception as e:
        db.rollback()
        print(f"Error deleting result {result_id}: {e}")
        return False


# ============================================================
# BULK OPERATIONS
# ============================================================

def delete_all_scans(db: Session) -> Tuple[int, int]:
    """Delete all scan results and batches. Returns (results_deleted, batches_deleted)."""
    results_deleted = db.query(models.ScanResult).delete()
    batches_deleted = db.query(models.ScanBatch).delete()
    db.commit()
    return results_deleted, batches_deleted


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def update_batch_counts(db: Session, batch_id: str):
    """Recalculate and update batch success/failure counts."""
    batch = get_scan_batch(db, batch_id)
    if batch:
        successful = db.query(models.ScanResult).filter(
            models.ScanResult.batch_id == batch_id,
            models.ScanResult.status == "completed"
        ).count()

        failed = db.query(models.ScanResult).filter(
            models.ScanResult.batch_id == batch_id,
            models.ScanResult.status == "failed"
        ).count()

        http_skipped = db.query(models.ScanResult).filter(
            models.ScanResult.scan_status == "http_skipped"
        ).count()

        batch.successful_count = successful
        # Failed count should include both actual failures and skipped domains
        batch.failed_count = failed + http_skipped
        
        total = batch.total_urls
        if successful + failed + http_skipped >= total:
            batch.status = "completed"
        elif failed == total:
            batch.status = "failed"
        else:
            batch.status = "in_progress"

        db.commit()


def get_scan_statistics(db: Session) -> dict:
    """Get database statistics."""
    total_batches = db.query(models.ScanBatch).count()
    total_results = db.query(models.ScanResult).count()

    successful = db.query(models.ScanResult).filter(
        models.ScanResult.status == "completed"
    ).count()

    failed = db.query(models.ScanResult).filter(
        models.ScanResult.status == "failed"
    ).count()

    pending = db.query(models.ScanResult).filter(
        models.ScanResult.status == "pending"
    ).count()

    http_skipped = db.query(models.ScanResult).filter(
        models.ScanResult.scan_status == "http_skipped"
    ).count()

    avg_time = db.query(
        func.avg(models.ScanResult.execution_time_seconds)
    ).filter(
        models.ScanResult.execution_time_seconds.isnot(None)
    ).scalar()

    return {
        "total_batches": total_batches,
        "total_results": total_results,
        "successful_scans": successful,
        "failed_scans": failed,
        "pending_scans": pending,
        "http_skipped_scans": http_skipped,
        "avg_execution_time": round(float(avg_time), 2) if avg_time else None
    }

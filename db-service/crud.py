from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Tuple
import models
import schemas
from data_extractor import extract_all_normalized_fields


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

    print(f"\n{'='*60}")
    print(f"📥 DB-SERVICE: Creating scan result")
    print(f"   URL: {scan_data.get('url')}")
    print(f"   Status: {scan_data.get('status')}")
    print(f"   Has raw_response: {bool(scan_data.get('raw_response'))}")

    raw_response = scan_data.get("raw_response")
    if raw_response:
        print(f"   🔍 Extracting normalized fields...")
        print(f"   Raw response keys: {list(raw_response.keys())}")
        try:
            normalized_fields = extract_all_normalized_fields(raw_response)
            print(f"   ✅ Extracted {len(normalized_fields)} normalized fields")
            print(f"   PQC Score: {normalized_fields.get('pqc_overall_score')}")
            print(f"   PQC Grade: {normalized_fields.get('pqc_overall_grade')}")

            # Update scan_data with normalized fields
            scan_data.update(normalized_fields)
        except Exception as e:
            print(f"   ⚠️ Error extracting normalized fields: {e}")
    else:
        print(f"   ⚠️ No raw_response provided!")

    # Remove deprecated fields
    if 'quantum_score' in scan_data:
        print(f"   🗑️ Removing quantum_score (replaced with pqc_overall_score)")
        del scan_data['quantum_score']
    if 'quantum_grade' in scan_data:
        print(f"   🗑️ Removing quantum_grade (replaced with pqc_overall_grade)")
        del scan_data['quantum_grade']

    try:
        db_scan = models.ScanResult(**scan_data)
        db.add(db_scan)
        db.commit()
        db.refresh(db_scan)

        print(f"   ✅ Saved to database with ID: {db_scan.id}")
        print(f"   Stored PQC Score: {db_scan.pqc_overall_score}")
        print(f"   Stored PQC Grade: {db_scan.pqc_overall_grade}")
        print(f"{'='*60}\n")

        update_batch_counts(db, scan.batch_id)
        return db_scan

    except Exception as e:
        print(f"   ❌ Error creating database record: {e}")
        print(f"{'='*60}\n")
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

        batch.successful_count = successful
        batch.failed_count = failed

        total = batch.total_urls
        if successful + failed == total:
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
        "avg_execution_time": round(float(avg_time), 2) if avg_time else None
    }

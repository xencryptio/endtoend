from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Tuple
import models
import schemas
from data_extractor import extract_all_normalized_fields
import logging


# ============================================================
# SCAN RESULT OPERATIONS (No Batch - Each Scan is Independent)
# ============================================================

def create_scan_result(
    db: Session,
    scan: schemas.ScanResultCreate
) -> models.ScanResult:
    """Create a new scan result (standalone - no batch)."""
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


def get_scan_result_by_request_id(db: Session, request_id: str) -> Optional[models.ScanResult]:
    """Get a scan result by its request_id."""
    return db.query(models.ScanResult).filter(
        models.ScanResult.request_id == request_id
    ).first()


def get_scan_result_by_url(db: Session, url: str) -> Optional[models.ScanResult]:
    """Get the most recent scan result for a URL."""
    return db.query(models.ScanResult).filter(
        models.ScanResult.url == url
    ).order_by(models.ScanResult.id.desc()).first()


def get_scan_results(
    db: Session,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> List[models.ScanResult]:
    """Get scan results with optional filtering."""
    query = db.query(models.ScanResult)
    if status:
        query = query.filter(models.ScanResult.status == status)

    return query.order_by(
        models.ScanResult.id.desc()
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
    return result


def delete_single_scan_result(db: Session, result_id: int) -> bool:
    """Delete a single scan result."""
    try:
        result = db.query(models.ScanResult).filter(
            models.ScanResult.id == result_id
        ).first()
        if not result:
            return False

        db.delete(result)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        print(f"Error deleting result {result_id}: {e}")
        return False


# ============================================================
# BULK OPERATIONS
# ============================================================

def delete_all_scans(db: Session) -> int:
    """Delete all scan results. Returns count of deleted results."""
    results_deleted = db.query(models.ScanResult).delete()
    db.commit()
    return results_deleted


# ============================================================
# STATISTICS
# ============================================================

def get_scan_statistics(db: Session) -> dict:
    """Get database statistics."""
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
        "total_results": total_results,
        "successful_scans": successful,
        "failed_scans": failed,
        "pending_scans": pending,
        "http_skipped_scans": http_skipped,
        "avg_execution_time": round(float(avg_time), 2) if avg_time else None
    }

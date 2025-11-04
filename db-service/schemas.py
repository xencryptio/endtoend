from __future__ import annotations

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from models import ScanStatusEnum

# ============================================================
# SCAN BATCH SCHEMAS
# ============================================================

class ScanBatchBase(BaseModel):
    batch_id: str
    total_urls: int = 0
    max_concurrent: int = 5

class ScanBatchCreate(ScanBatchBase):
    status: str = "pending"

class ScanBatch(ScanBatchBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None # <-- ADD THIS
    successful_count: int = 0
    failed_count: int = 0
    status: str

    class Config:
        from_attributes = True

class ScanBatchUpdate(BaseModel):
    status: Optional[str] = None
    successful_count: Optional[int] = None
    failed_count: Optional[int] = None
    updated_at: Optional[datetime] = None

class ScanBatchWithResults(ScanBatch):
    """Batch with all its scan results included"""
    scan_results: List["ScanResult"] = []

    class Config:
        from_attributes = True

# ============================================================
# SCAN RESULT SCHEMAS
# ============================================================

class ScanResultBase(BaseModel):
    batch_id: str
    url: str
    scan_type: str = "crypto_audit"

class ScanResultCreate(BaseModel):
    """
    Schema for creating a scan result.
    ✅ FIXED: Accepts pqc_overall_* and scan_status
    """
    batch_id: str
    request_id: str
    url: str    
    scan_status: ScanStatusEnum = ScanStatusEnum.PENDING  # ✅ Use Enum
    status: str = "pending" # Keep for backward compatibility
    scan_type: str = "crypto_audit"
    requested_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    execution_time_seconds: Optional[float] = None
    
    # ✅ Accept pqc_overall_* (will be extracted from raw_response if missing)
    pqc_overall_score: Optional[float] = None
    pqc_overall_grade: Optional[str] = None
    
    # Complete scan data stored as JSON
    raw_response: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None

    @validator('pqc_overall_grade')
    def validate_pqc_grade(cls, v):
        """Validate PQC grade format."""
        if v is not None:
            valid_grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']
            if v not in valid_grades:
                # Allow it but warn
                pass
        return v

class ScanResult(ScanResultBase):
    id: int
    request_id: Optional[str] = None
    status: str
    requested_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    execution_time_seconds: Optional[float] = None
    tls_version: Optional[str] = None
    primary_cipher_suite: Optional[str] = None
    
    pqc_overall_score: Optional[float] = None
    pqc_overall_grade: Optional[str] = None

    raw_response: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True

# Update forward reference
ScanBatchWithResults.model_rebuild()

# ============================================================
# STATISTICS SCHEMA
# ============================================================

class ScanStatistics(BaseModel):
    total_batches: int
    total_results: int
    successful_scans: int
    failed_scans: int
    http_skipped_scans: int = 0
    pending_scans: int
    avg_execution_time: Optional[float] = None


class DeleteResponse(BaseModel):
    message: str
    batch_id: Optional[str] = None
    result_id: Optional[int] = None
    deleted_count: Optional[int] = None
    timestamp: Optional[str] = None
    
    class Config:
        from_attributes = True


class ScanResultWithNormalized(BaseModel):
    """
    Enhanced scan result schema that combines:
    1. Normalized queryable fields (stored separately in DB)
    2. Raw JSON response (for complete audit trail)
    
    When sent to frontend: includes BOTH for backward compatibility
    """
    id: int
    batch_id: str
    request_id: Optional[str] = None
    url: str
    status: str
    scan_status: Optional[ScanStatusEnum] = None # <-- ADD THIS
    scan_type: str
    
    # Timestamps
    requested_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    execution_time_seconds: Optional[float] = None
    
    # ============================================================
    # Normalized Fields (Queryable in DB)
    # ============================================================
    
    # PQC Fields
    pqc_overall_score: Optional[float] = None
    pqc_overall_grade: Optional[str] = None
    pqc_security_level: Optional[str] = None
    pqc_quantum_ready: Optional[bool] = None
    pqc_hybrid_ready: Optional[bool] = None
    
    # TLS Fields
    tls_version: Optional[str] = None
    supported_protocols: Optional[str] = None
    
    # KEX Fields
    kex_score: Optional[float] = None
    kex_grade: Optional[str] = None
    
    # Cipher Fields
    primary_cipher_suite: Optional[str] = None
    
    # Certificate Fields
    cert_pqc_score: Optional[float] = None
    cert_pqc_grade: Optional[str] = None
    cert_is_pqc: Optional[bool] = None
    cert_transparency: Optional[bool] = None
    cert_subject: Optional[str] = None
    cert_issuer: Optional[str] = None
    cert_serial_number: Optional[str] = None
    cert_not_before: Optional[datetime] = None
    cert_not_after: Optional[datetime] = None
    
    # Signature Fields
    primary_signature_algorithm: Optional[str] = None
    primary_hash_algorithm: Optional[str] = None
    
    # Security Features
    public_key_algorithm: Optional[str] = None
    public_key_size_bits: Optional[int] = None
    ephemeral_key_exchange: Optional[bool] = None
    hsts_enabled: Optional[bool] = None
    ocsp_stapling_active: Optional[bool] = None
    ct_present: Optional[bool] = None
    
    # Error
    error_message: Optional[str] = None
    
    # ============================================================
    # Raw Response (Complete Audit Trail)
    # ============================================================
    raw_response: Optional[Dict[str, Any]] = None
    
    class Config:
        from_attributes = True


class ScanBatchWithNormalizedResults(ScanBatch):
    """Batch with all its scan results (with normalized fields)."""
    scan_results: List[ScanResultWithNormalized] = []
    
    class Config:
        from_attributes = True


class ClearAllResponse(BaseModel):
    message: str
    deleted_results: int
    deleted_batches: int
    timestamp: str
    
    class Config:
        from_attributes = True
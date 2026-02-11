from __future__ import annotations

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from models import ScanStatusEnum

# ============================================================
# SCAN RESULT SCHEMAS (No Batch - Each Scan is Independent)
# ============================================================

class ScanResultBase(BaseModel):
    url: str
    scan_type: str = "crypto_audit"

class ScanResultCreate(BaseModel):
    """
    Schema for creating a scan result.
    Each scan is independent - no batch grouping required.
    """
    request_id: str
    url: str    
    scan_status: ScanStatusEnum = ScanStatusEnum.PENDING
    status: str = "pending"  # Keep for backward compatibility
    scan_type: str = "crypto_audit"
    requested_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    execution_time_seconds: Optional[float] = None
    
    # PQC scores
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
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ============================================================
# STATISTICS SCHEMA
# ============================================================

class ScanStatistics(BaseModel):
    total_results: int
    successful_scans: int
    failed_scans: int
    http_skipped_scans: int = 0
    pending_scans: int
    avg_execution_time: Optional[float] = None


class DeleteResponse(BaseModel):
    message: str
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
    request_id: Optional[str] = None
    url: str
    status: str
    scan_status: Optional[ScanStatusEnum] = None
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
    
    # Timestamps
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ClearAllResponse(BaseModel):
    message: str
    deleted_results: int
    timestamp: str
    
    class Config:
        from_attributes = True
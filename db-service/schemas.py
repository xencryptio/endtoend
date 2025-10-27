from __future__ import annotations

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime

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

class ScanResultCreate(ScanResultBase):
    request_id: Optional[str] = None
    status: str = "pending"
    requested_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    execution_time_seconds: Optional[float] = None
    tls_version: Optional[str] = None
    primary_cipher_suite: Optional[str] = None
    quantum_score: Optional[float] = None
    quantum_grade: Optional[str] = None
    raw_response: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None

    # 🔧 FIX: Validator to ensure raw_response is always present and contains pqc_analysis
    @validator('raw_response', always=True)
    def validate_raw_response(cls, v, values):
        """Ensure we have minimum data to store."""
        if not v:
            # If no raw_response, create a minimal structure from available fields
            url = values.get("url", "")
            quantum_score = values.get("quantum_score")
            quantum_grade = values.get("quantum_grade")
            tls_version = values.get("tls_version")

            return {
                "domain": url,
                "quantum_score": quantum_score,
                "quantum_grade": quantum_grade,
                "tls_configuration": {
                    "supported_protocols": [tls_version] if tls_version else []
                },
                # 🔧 ADD: Include pqc_analysis structure
                "pqc_analysis": {
                    "overall_score": quantum_score,
                    "overall_grade": quantum_grade,
                    "security_level": "unknown",
                    "quantum_ready": False,
                    "hybrid_ready": False
                } if quantum_score is not None else {}
            }

        # 🔧 FIX: Ensure pqc_analysis exists in raw_response
        if isinstance(v, dict) and "pqc_analysis" not in v:
            quantum_score = v.get("quantum_score") or values.get("quantum_score")
            quantum_grade = v.get("quantum_grade") or values.get("quantum_grade")
            if quantum_score is not None:
                v["pqc_analysis"] = {
                    "overall_score": quantum_score,
                    "overall_grade": quantum_grade,
                    "security_level": "unknown",
                    "quantum_ready": False,
                    "hybrid_ready": False
                }
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
    quantum_score: Optional[float] = None
    quantum_grade: Optional[str] = None
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
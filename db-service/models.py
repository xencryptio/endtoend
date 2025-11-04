from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON, Float, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from database import Base


class ScanStatusEnum(str, enum.Enum):
    """Enum for scan statuses"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    HTTP_SKIPPED = "http_skipped"
    IN_PROGRESS = "in_progress"
class ScanBatch(Base):
    """
    Represents a single scan request (can contain multiple URLs).
    Each batch has a unique batch_id.
    """
    __tablename__ = "scan_batches"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String, unique=True, index=True, nullable=False)
    total_urls = Column(Integer, nullable=False)
    successful_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    max_concurrent = Column(Integer, default=5)
    status = Column(SQLEnum(ScanStatusEnum), default=ScanStatusEnum.PENDING, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship to scan results
    scan_results = relationship("ScanResult", back_populates="batch", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ScanBatch(batch_id={self.batch_id}, total_urls={self.total_urls}, status={self.status})>"


class ScanResult(Base):
    """
    Represents a single URL scan result with normalized structured fields.
    """
    __tablename__ = "scan_results"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String, ForeignKey("scan_batches.batch_id", ondelete="CASCADE"), nullable=False, index=True)
    request_id = Column(String, unique=True, index=True, nullable=False)
    url = Column(String, nullable=False, index=True)
    
    scan_status = Column(
        SQLEnum(ScanStatusEnum, name="scan_status_enum", create_type=False), 
        default=ScanStatusEnum.PENDING,
        nullable=False
    )
    status = Column(String, index=True, nullable=False)  # Keep for backward compatibility
    scan_type = Column(String, default="crypto_audit")
    
    # Timestamps
    requested_at = Column(DateTime(timezone=True), nullable=True, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    execution_time_seconds = Column(Float, nullable=True)
    
    pqc_quantum_ready = Column(Boolean, default=False, nullable=True, index=True)
    pqc_hybrid_ready = Column(Boolean, default=False, nullable=True)
    
    # ✅ FIX: TLS Configuration (ALL NULLABLE)
    tls_version = Column(String, nullable=True, index=True)
    supported_protocols = Column(String, nullable=True)
    primary_cipher_suite = Column(String, nullable=True)
    
    # ✅ FIX: Key Exchange Fields (ALL NULLABLE)
    kex_score = Column(Float, nullable=True)
    kex_grade = Column(String(5), nullable=True)
    
    # ✅ FIX: Certificate Fields (ALL NULLABLE)
    cert_pqc_score = Column(Float, nullable=True)
    cert_pqc_grade = Column(String(5), nullable=True)
    cert_is_pqc = Column(Boolean, default=False, nullable=True)
    cert_transparency = Column(Boolean, default=False, nullable=True)
    cert_subject = Column(String(255), nullable=True)
    cert_issuer = Column(String(255), nullable=True)
    cert_serial_number = Column(String(255), nullable=True)
    cert_not_before = Column(DateTime, nullable=True)
    cert_not_after = Column(DateTime, nullable=True)
    
    # ✅ FIX: Signature Algorithm Fields (ALL NULLABLE)
    primary_signature_algorithm = Column(String, nullable=True)
    primary_hash_algorithm = Column(String, nullable=True)
    
    # ✅ FIX: Security Features (ALL NULLABLE)
    public_key_algorithm = Column(String(100), nullable=True)
    public_key_size_bits = Column(Integer, nullable=True)
    ephemeral_key_exchange = Column(Boolean, default=False, nullable=True)
    hsts_enabled = Column(Boolean, default=False, nullable=True)
    ocsp_stapling_active = Column(Boolean, default=False, nullable=True)
    ct_present = Column(Boolean, default=False, nullable=True)
    
    # Error information
    error_message = Column(Text, nullable=True)
    
    # ✅ CRITICAL: Raw response stored as JSONB for full audit trail
    raw_response = Column(JSON, nullable=True)
    
    # ✅ FIX: PQC/Quantum Fields (ALL NULLABLE for http_skipped/failed scans)
    pqc_overall_score = Column(Float, nullable=True, index=True)
    pqc_overall_grade = Column(String(5), nullable=True, index=True)
    pqc_security_level = Column(String(50), nullable=True)
    
    # Relationship to batch
    batch = relationship("ScanBatch", back_populates="scan_results")

    def __repr__(self):
        return f"<ScanResult(id={self.id}, url={self.url}, status={self.scan_status}, pqc_grade={self.pqc_overall_grade})>"


# ✅ Add indexes for common query patterns
from sqlalchemy import Index

# Composite indexes for fast filtering
Index('idx_scan_results_status_pqc', ScanResult.scan_status, ScanResult.pqc_overall_grade)
Index('idx_scan_results_batch_status', ScanResult.batch_id, ScanResult.scan_status)
Index('idx_scan_results_quantum_ready', ScanResult.pqc_quantum_ready, ScanResult.pqc_overall_score)
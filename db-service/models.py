from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON, Float, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class ScanBatch(Base):
    """
    Represents a single scan request (can contain multiple URLs).
    Each batch has a unique batch_id.
    """
    __tablename__ = "scan_batches"

    id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(String(100), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    total_urls = Column(Integer, default=0)
    successful_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    status = Column(String(50), default="pending")
    max_concurrent = Column(Integer, default=5)
    
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
    batch_id = Column(String(100), ForeignKey("scan_batches.batch_id"), nullable=False, index=True)
    request_id = Column(String(100), unique=True, index=True)
    url = Column(Text, nullable=False, index=True)
    status = Column(String(50), default="pending")
    scan_type = Column(String(100), default="crypto_audit")
    
    # Timestamps
    requested_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    execution_time_seconds = Column(Float)
    
    # ============================================================
    # PQC/Quantum Fields (Structured - Queryable)
    # ============================================================
    pqc_overall_score = Column(Float)
    pqc_overall_grade = Column(String(5))
    pqc_security_level = Column(String(50))
    pqc_quantum_ready = Column(Boolean, default=False)
    pqc_hybrid_ready = Column(Boolean, default=False)
    
    # ============================================================
    # TLS Configuration Fields (Structured - Queryable)
    # ============================================================
    tls_version = Column(String(200))
    supported_protocols = Column(String(500))
    primary_cipher_suite = Column(String(255))
    
    # ============================================================
    # Key Exchange Fields (Structured - Queryable)
    # ============================================================
    kex_score = Column(Float)
    kex_grade = Column(String(5))
    
    # ============================================================
    # Certificate Fields (Structured - Queryable)
    # ============================================================
    cert_pqc_score = Column(Float)
    cert_pqc_grade = Column(String(5))
    cert_is_pqc = Column(Boolean, default=False)
    cert_transparency = Column(Boolean, default=False)
    cert_subject = Column(String(255))
    cert_issuer = Column(String(255))
    cert_serial_number = Column(String(255))
    cert_not_before = Column(DateTime)
    cert_not_after = Column(DateTime)
    
    # ============================================================
    # Signature Algorithm Fields (Structured - Queryable)
    # ============================================================
    primary_signature_algorithm = Column(String(100))
    primary_hash_algorithm = Column(String(100))
    
    # ============================================================
    # Security Features (Structured - Queryable)
    # ============================================================
    public_key_algorithm = Column(String(100))
    public_key_size_bits = Column(Integer)
    ephemeral_key_exchange = Column(Boolean, default=False)
    hsts_enabled = Column(Boolean, default=False)
    ocsp_stapling_active = Column(Boolean, default=False)
    ct_present = Column(Boolean, default=False)
    
    # Error information
    error_message = Column(Text)
    
    # Full raw response (JSON backup - NOT for queries, only for audit/reference)
    raw_response = Column(JSON)
    
    # Relationship to batch
    batch = relationship("ScanBatch", back_populates="scan_results")

    def __repr__(self):
        return f"<ScanResult(url={self.url}, status={self.status}, pqc_grade={self.pqc_overall_grade})>"
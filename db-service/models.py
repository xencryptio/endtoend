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


class ScanResult(Base):
    """
    Represents a single URL scan result with normalized structured fields.
    Each scan is independent - no batch grouping.
    """
    __tablename__ = "scan_results"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(String, unique=True, index=True, nullable=False)
    url = Column(String, nullable=False, index=True)

    # Store as plain String(50) — avoids PostgreSQL ENUM type dependency.
    # Python-level validation is handled by ScanStatusEnum in Pydantic schemas.
    scan_status = Column(String(50), default="pending", nullable=False)
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

    def __repr__(self):
        return f"<ScanResult(id={self.id}, url={self.url}, status={self.scan_status}, pqc_grade={self.pqc_overall_grade})>"


# ✅ Add indexes for common query patterns
from sqlalchemy import Index

# Composite indexes for fast filtering
Index('idx_scan_results_status_pqc', ScanResult.scan_status, ScanResult.pqc_overall_grade)
Index('idx_scan_results_quantum_ready', ScanResult.pqc_quantum_ready, ScanResult.pqc_overall_score)

# ===================== ONBOARDING MODELS =====================
import uuid
from sqlalchemy import Boolean, Column, String, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_name = Column(String(255), nullable=False, index=True)
    organization_type = Column(String(100), nullable=True)
    industry = Column(String(100), nullable=True)
    organization_email = Column(String(255), nullable=True)
    contact_person = Column(String(255), nullable=True)
    onboarding_date = Column(DateTime, nullable=True)
    status = Column(String(50), default="pending", nullable=False)

    total_repositories = Column(Integer, default=0)
    total_servers = Column(Integer, default=0)
    total_windows_servers = Column(Integer, default=0)
    total_linux_servers = Column(Integer, default=0)
    total_domains = Column(Integer, default=0)
    total_active_agents = Column(Integer, default=0)
    last_calculated_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    repositories = relationship("Repository", back_populates="organization", cascade="all, delete-orphan")
    servers = relationship("Server", back_populates="organization", cascade="all, delete-orphan")
    domains = relationship("Domain", back_populates="organization", cascade="all, delete-orphan")
    onboarding_jobs = relationship("OnboardingJob", back_populates="organization", cascade="all, delete-orphan")
    suborganizations = relationship("SubOrganization", back_populates="organization", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Organization(id={self.id}, name={self.organization_name})>"


class SubOrganization(Base):
    __tablename__ = "suborganizations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    suborganization_name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    metadata_json = Column('metadata_json', JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization", back_populates="suborganizations")
    applications = relationship("Application", back_populates="suborganization", cascade="all, delete-orphan")
    repositories = relationship("Repository", back_populates="suborganization", cascade="all, delete-orphan")
    servers = relationship("Server", back_populates="suborganization", cascade="all, delete-orphan")
    domains = relationship("Domain", back_populates="suborganization", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<SubOrganization(id={self.id}, name={self.suborganization_name})>"


class Application(Base):
    __tablename__ = "applications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    suborganization_id = Column(String(36), ForeignKey("suborganizations.id", ondelete="CASCADE"), nullable=False, index=True)
    application_name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    metadata_json = Column('metadata_json', JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    suborganization = relationship("SubOrganization", back_populates="applications")

    # Resources scoped to an application
    repositories = relationship("Repository", back_populates="application", cascade="all, delete-orphan")
    servers = relationship("Server", back_populates="application", cascade="all, delete-orphan")
    domains = relationship("Domain", back_populates="application", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Application(id={self.id}, name={self.application_name})>"


class Repository(Base):
    __tablename__ = "repositories"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    suborganization_id = Column(String(36), ForeignKey("suborganizations.id", ondelete="SET NULL"), nullable=True, index=True)
    application_id = Column(String(36), ForeignKey("applications.id", ondelete="SET NULL"), nullable=True, index=True)
    project_name = Column(String(255), nullable=True)
    repo_name = Column(String(255), nullable=True)
    repo_url = Column(String(1024), nullable=False, index=True)
    branch_to_scan = Column(String(255), default="main")
    scan_frequency = Column(String(50), nullable=True)
    last_scan_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization", back_populates="repositories")
    suborganization = relationship("SubOrganization", back_populates="repositories")
    application = relationship("Application", back_populates="repositories")

    def __repr__(self):
        return f"<Repository(id={self.id}, url={self.repo_url})>"


class Server(Base):
    __tablename__ = "servers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    suborganization_id = Column(String(36), ForeignKey("suborganizations.id", ondelete="SET NULL"), nullable=True, index=True)
    application_id = Column(String(36), ForeignKey("applications.id", ondelete="SET NULL"), nullable=True, index=True)
    server_name = Column(String(255), nullable=True)
    operating_system = Column(String(50), nullable=True)
    hostname = Column(String(255), nullable=True)
    ip_address = Column(String(100), nullable=True)
    mac_address = Column(String(100), nullable=True)
    agent_status = Column(String(50), default="not_installed")
    last_heartbeat = Column(DateTime, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization", back_populates="servers")
    suborganization = relationship("SubOrganization", back_populates="servers")
    application = relationship("Application", back_populates="servers")
    credentials = relationship("ServerCredential", back_populates="server", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Server(id={self.id}, hostname={self.hostname})>"


class ServerCredential(Base):
    __tablename__ = "server_credentials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    server_id = Column(String(36), ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, index=True)
    cred_type = Column(String(50), nullable=False)
    username = Column(String(255), nullable=True)
    secret_encrypted = Column(Text, nullable=True)
    # Use a non-reserved attribute name to avoid clashes with SQLAlchemy's Declarative API
    metadata_json = Column('metadata_json', JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    server = relationship("Server", back_populates="credentials")

    def __repr__(self):
        return f"<ServerCredential(id={self.id}, type={self.cred_type})>"


class Domain(Base):
    __tablename__ = "domains"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    suborganization_id = Column(String(36), ForeignKey("suborganizations.id", ondelete="SET NULL"), nullable=True, index=True)
    application_id = Column(String(36), ForeignKey("applications.id", ondelete="SET NULL"), nullable=True, index=True)
    domain = Column(String(255), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization", back_populates="domains")
    suborganization = relationship("SubOrganization", back_populates="domains")
    application = relationship("Application", back_populates="domains")

    def __repr__(self):
        return f"<Domain(id={self.id}, domain={self.domain})>"


class OnboardingJob(Base):
    __tablename__ = "onboarding_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String(36), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    job_type = Column(String(50), nullable=False)
    status = Column(String(50), default="queued")
    rows_processed = Column(Integer, default=0)
    errors = Column(JSON, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    organization = relationship("Organization", back_populates="onboarding_jobs")


class OnboardingBatch(Base):
    """
    Tracks all scans triggered from an onboarding operation.
    Links organization with triggered repo and TLS scan batches.
    """
    __tablename__ = "onboarding_batches"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_name = Column(String(255), nullable=False)
    created_by = Column(String(255), nullable=True)
    
    # Track triggered scan jobs
    repo_scan_job_id = Column(String(36), nullable=True, index=True)
    tls_scan_batch_id = Column(String, nullable=True, index=True)  # Links to scan_batches.batch_id
    
    # Summary counts
    total_repos = Column(Integer, default=0)
    total_domains = Column(Integer, default=0)
    total_servers = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    organization = relationship("Organization")

    def __repr__(self):
        return f"<OnboardingBatch(id={self.id}, org={self.organization_name}, repos={self.total_repos}, domains={self.total_domains})>"


class ScanJob(Base):
    __tablename__ = "scan_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    suborganization_id = Column(String(36), ForeignKey("suborganizations.id", ondelete="SET NULL"), nullable=True, index=True)
    application_id = Column(String(36), ForeignKey("applications.id", ondelete="SET NULL"), nullable=True, index=True)

    target_type = Column(String(50), nullable=False)
    target_id = Column(String(36), nullable=True)
    scan_type = Column(String(50), nullable=False)
    status = Column(String(50), default="queued")
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization")
    suborganization = relationship("SubOrganization")
    application = relationship("Application")
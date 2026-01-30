from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey, Text, UniqueConstraint, Float
from sqlalchemy.orm import sessionmaker, relationship, Session
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class Repository(Base):
    __tablename__ = "repositories"
    id = Column(Integer, primary_key=True, index=True)
    repo_url = Column(String, index=True, nullable=False)
    repo_hash = Column(String, nullable=False, index=True)
    branch_name = Column(String, default='main', nullable=False)
    platform = Column(String, default='GitHub', nullable=False)
    last_scanned = Column(DateTime, default=datetime.utcnow)
    scan_status = Column(String, default='pending', nullable=False)
    total_files = Column(Integer, default=0)
    total_algorithms = Column(Integer, default=0)
    quantum_safe_count = Column(Integer, default=0)
    quantum_vulnerable_count = Column(Integer, default=0)
    current_status = Column(String, default='Queued for scanning')
    total_files_to_scan = Column(Integer, default=0)
    overall_security_score = Column(Float, nullable=True)
    overall_grade = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    scan_results = relationship("RepoScannerScanResult", back_populates="repository", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('repo_url', 'repo_hash', 'branch_name', name='uix_repo_url_hash_branch'),
    )


class RepoScannerScanResult(Base):
    __tablename__ = "scan_results"
    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("repositories.id"), nullable=False)
    algorithm = Column(String, nullable=False)
    algorithm_type = Column(String, nullable=True)
    category = Column(String, nullable=False)
    is_pqc = Column(Boolean, default=False)
    occurrences = Column(Integer, nullable=False)
    files_affected = Column(Integer, nullable=False)
    base_score = Column(Float, nullable=True)
    final_score = Column(Float, nullable=True)
    grade = Column(String, nullable=True)
    security_level = Column(String, nullable=True)
    quantum_safe = Column(Boolean, default=False)
    quantum_safety_reason = Column(String, nullable=True)
    quantum_resistance_type = Column(String, nullable=True)
    deprecated = Column(Boolean, default=False)
    weighted_score = Column(Float, nullable=True)
    repository = relationship("Repository", back_populates="scan_results")
    findings = relationship("Finding", back_populates="scan_result", cascade="all, delete-orphan")

class Finding(Base):
    __tablename__ = "findings"
    id = Column(Integer, primary_key=True, index=True)
    scan_result_id = Column(Integer, ForeignKey("scan_results.id"), nullable=False)
    file_path = Column(String, nullable=False)
    line_number = Column(Integer, nullable=False)
    context = Column(Text)
    match_text = Column(String)
    scan_result = relationship("RepoScannerScanResult", back_populates="findings")

class CategoryScore(Base):
    __tablename__ = "category_scores"
    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("repositories.id"), nullable=False)
    category_type = Column(String, nullable=False)
    score = Column(Float, nullable=False)
    grade = Column(String, nullable=False)
    algorithm_count = Column(Integer, nullable=False)
    best_algorithm = Column(String, nullable=True)
    worst_algorithm = Column(String, nullable=True)
    repository = relationship("Repository", backref="category_scores")

class Agent(Base):
    __tablename__ = "agents"
    agent_id = Column(String, primary_key=True, index=True)
    hostname = Column(String, nullable=False)
    ip_address = Column(String, nullable=False)
    os_info = Column(String, nullable=False)
    registered_at = Column(DateTime, nullable=False)
    last_seen = Column(DateTime, nullable=False)
    tasks = relationship("Task", back_populates="agent", cascade="all, delete-orphan")
    results = relationship("SystemScannerResult", back_populates="agent", cascade="all, delete-orphan")

class Task(Base):
    __tablename__ = "tasks"
    task_id = Column(String, primary_key=True, index=True)
    agent_id = Column(String, ForeignKey("agents.agent_id"), nullable=False)
    status = Column(String, nullable=False, index=True)
    created_at = Column(DateTime, nullable=False)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    agent = relationship("Agent", back_populates="tasks")
    result = relationship("SystemScannerResult", back_populates="task", uselist=False, cascade="all, delete-orphan")

# A model for the system_scanner_db
# This is a placeholder, as I don't have the schema for this database.
# I will assume it has an 'id' field for now.
class SystemScannerResult(Base):
    __tablename__ = 'results'
    result_id = Column(String, primary_key=True, index=True)
    agent_id = Column(String, ForeignKey("agents.agent_id"), nullable=False)
    task_id = Column(String, ForeignKey("tasks.task_id"), nullable=False, unique=True)
    audit_results = Column(Text, nullable=False)
    received_at = Column(DateTime, nullable=False)
    submitted_at = Column(DateTime, nullable=False)
    agent = relationship("Agent", back_populates="results")
    task = relationship("Task", back_populates="result")


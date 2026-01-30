from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Get database URL from environment variable
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://scanuser:scanpass@postgres:5432/scandb"
)

print(f"📡 Using database URL: {DATABASE_URL}")  # Add this debug line

# Create SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # Verify connections before using
    pool_size=10,
    max_overflow=20
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

# Dependency for FastAPI routes
def get_db():
    """
    Database session dependency.
    Yields a database session and closes it after use.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Additional Database Connections ---

REPO_SCANNER_DB_URL = os.getenv("REPO_SCANNER_DB_URL", "postgresql://scanuser:scanpass@postgres:5432/repo_scanner_db")
SYSTEM_SCANNER_DB_URL = os.getenv("SYSTEM_SCANNER_DB_URL", "postgresql://scanuser:scanpass@postgres:5432/system_scanner_db")

repo_scanner_engine = create_engine(REPO_SCANNER_DB_URL)
system_scanner_engine = create_engine(SYSTEM_SCANNER_DB_URL)

RepoScannerSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=repo_scanner_engine)
SystemScannerSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=system_scanner_engine)

def get_scandb_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_repo_scanner_session():
    db = RepoScannerSessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_system_scanner_session():
    db = SystemScannerSessionLocal()
    try:
        yield db
    finally:
        db.close()
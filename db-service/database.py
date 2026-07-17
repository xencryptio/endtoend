from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Get database URL from environment variable
# Default: file-based SQLite stored on the shared `scanner-data` volume.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:////data/scandb.db",
)

print(f"📡 Using database URL: {DATABASE_URL}")  # Add this debug line


def _engine_kwargs(url: str):
    """SQLite requires `check_same_thread=False` for FastAPI's threaded use."""
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20}


# Create SQLAlchemy engine
engine = create_engine(DATABASE_URL, **_engine_kwargs(DATABASE_URL))

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

REPO_SCANNER_DB_URL = os.getenv("REPO_SCANNER_DB_URL", "sqlite:////data/repo_scanner.db")
SYSTEM_SCANNER_DB_URL = os.getenv("SYSTEM_SCANNER_DB_URL", "sqlite:////data/system_scanner.db")

repo_scanner_engine = create_engine(REPO_SCANNER_DB_URL, **_engine_kwargs(REPO_SCANNER_DB_URL))
system_scanner_engine = create_engine(SYSTEM_SCANNER_DB_URL, **_engine_kwargs(SYSTEM_SCANNER_DB_URL))

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
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_scandb_session, get_repo_scanner_session, get_system_scanner_session
from . import schemas
from .data_aggregator import (
    get_unified_vulnerability_report,
    get_network_vulnerabilities,  # NEW
    get_code_vulnerabilities,     # NEW
    get_system_vulnerabilities    # NEW
)
from typing import List # NEW

router = APIRouter(prefix="/vulnerabilities", tags=["vulnerabilities"])

@router.get("/", response_model=schemas.UnifiedVulnerabilityReport)
def get_vulnerabilities_report(
    scandb: Session = Depends(get_scandb_session),
    repo_scanner_db: Session = Depends(get_repo_scanner_session),
    system_scanner_db: Session = Depends(get_system_scanner_session),
):
    """
    This endpoint provides a unified vulnerability report by aggregating data
    from three different databases: scandb, repo_scanner_db, and system_scanner_db.
    """
    report = get_unified_vulnerability_report(
        scandb, repo_scanner_db, system_scanner_db
    )
    return report

# NEW ENDPOINT: Network Vulnerabilities
@router.get("/network", response_model=List[schemas.NetworkVulnerability])
def get_network_vulnerabilities_endpoint(
    scandb: Session = Depends(get_scandb_session)
):
    """
    This endpoint provides detailed network (TLS/Web) vulnerabilities
    by querying the scandb database.
    """
    return get_network_vulnerabilities(scandb)

# NEW ENDPOINT: Code Vulnerabilities
@router.get("/code", response_model=List[schemas.CodeVulnerability])
def get_code_vulnerabilities_endpoint(
    repo_scanner_db: Session = Depends(get_repo_scanner_session)
):
    """
    This endpoint provides detailed source code cryptography vulnerabilities
    by querying the repo_scanner_db database.
    """
    return get_code_vulnerabilities(repo_scanner_db)

# NEW ENDPOINT: System Vulnerabilities
@router.get("/system", response_model=List[schemas.SystemVulnerability])
def get_system_vulnerabilities_endpoint(
    system_scanner_db: Session = Depends(get_system_scanner_session)
):
    """
    This endpoint provides detailed system/OS cryptography vulnerabilities
    by querying the system_scanner_db database.
    """
    return get_system_vulnerabilities(system_scanner_db)
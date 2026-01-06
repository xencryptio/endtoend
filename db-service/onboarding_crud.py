
from sqlalchemy.orm import Session
from typing import List, Optional
import models
import schemas
import logging

def list_domains_by_app(db: Session, app_id: str) -> List[models.Domain]:
    return db.query(models.Domain).filter(models.Domain.application_id == app_id).order_by(models.Domain.created_at.desc()).all()

log = logging.getLogger(__name__)

# Organization CRUD

def create_organization(db: Session, org: dict) -> models.Organization:
    db_org = models.Organization(**org)
    db.add(db_org)
    db.commit()
    db.refresh(db_org)
    return db_org


def get_organization(db: Session, org_id: str) -> Optional[models.Organization]:
    return db.query(models.Organization).filter(models.Organization.id == org_id).first()


# Repositories

def bulk_create_repositories(db: Session, org_id: str, repos: List[dict]) -> List[models.Repository]:
    created = []
    for r in repos:
        r['organization_id'] = org_id
        db_repo = models.Repository(**r)
        db.add(db_repo)
        created.append(db_repo)
    db.commit()
    for r in created:
        db.refresh(r)
    # Update counts
    db.query(models.Organization).filter(models.Organization.id == org_id).update({models.Organization.total_repositories: models.Organization.total_repositories + len(created)})
    db.commit()
    return created


# Servers

def bulk_create_servers(db: Session, org_id: str, servers: List[dict]) -> List[models.Server]:
    created = []
    linux_count = 0
    windows_count = 0
    for s in servers:
        s['organization_id'] = org_id
        db_server = models.Server(**s)
        db.add(db_server)
        created.append(db_server)
        os_str = (s.get('operating_system') or '').lower()
        if 'windows' in os_str:
            windows_count += 1
        elif 'linux' in os_str:
            linux_count += 1
    db.commit()
    for s in created:
        db.refresh(s)
    # Update counts
    org = db.query(models.Organization).filter(models.Organization.id == org_id).first()
    if org:
        org.total_servers = org.total_servers + len(created)
        org.total_linux_servers = org.total_linux_servers + linux_count
        org.total_windows_servers = org.total_windows_servers + windows_count
        db.commit()
    return created


# Domains

def bulk_create_domains(db: Session, org_id: str, domains: List[dict]) -> List[models.Domain]:
    created = []
    for d in domains:
        d['organization_id'] = org_id
        db_domain = models.Domain(**d)
        db.add(db_domain)
        created.append(db_domain)
    db.commit()
    for d in created:
        db.refresh(d)
    db.query(models.Organization).filter(models.Organization.id == org_id).update({models.Organization.total_domains: models.Organization.total_domains + len(created)})
    db.commit()
    return created


# Onboarding Job

def create_onboarding_job(db: Session, job: dict) -> models.OnboardingJob:
    db_job = models.OnboardingJob(**job)
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job


# Sub-organization / Application helpers

def create_suborganization(db: Session, org_id: str, suborg: dict) -> models.SubOrganization:
    suborg['organization_id'] = org_id
    db_suborg = models.SubOrganization(**suborg)
    db.add(db_suborg)
    db.commit()
    db.refresh(db_suborg)
    return db_suborg


def list_suborganizations_by_org(db: Session, org_id: str) -> List[models.SubOrganization]:
    return db.query(models.SubOrganization).filter(models.SubOrganization.organization_id == org_id).order_by(models.SubOrganization.created_at.desc()).all()


def create_application(db: Session, suborg_id: str, app: dict) -> models.Application:
    app['suborganization_id'] = suborg_id
    db_app = models.Application(**app)
    db.add(db_app)
    db.commit()
    db.refresh(db_app)
    return db_app


def list_applications_by_suborg(db: Session, suborg_id: str) -> List[models.Application]:
    return db.query(models.Application).filter(models.Application.suborganization_id == suborg_id).order_by(models.Application.created_at.desc()).all()


# Scan job

def create_scan_job(db: Session, job: dict) -> models.ScanJob:
    db_job = models.ScanJob(**job)
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job

# ---------------------- Read helpers ----------------------

def list_organizations(db: Session) -> List[models.Organization]:
    return db.query(models.Organization).order_by(models.Organization.created_at.desc()).all()


def list_repositories_by_org(db: Session, org_id: str) -> List[models.Repository]:
    return db.query(models.Repository).filter(models.Repository.organization_id == org_id).order_by(models.Repository.created_at.desc()).all()


def list_repositories_by_suborg(db: Session, suborg_id: str) -> List[models.Repository]:
    return (
        db.query(models.Repository)
        .filter(models.Repository.suborganization_id == suborg_id)
        .order_by(models.Repository.created_at.desc())
        .all()
    )


def list_repositories_by_app(db: Session, app_id: str) -> List[models.Repository]:
    return (
        db.query(models.Repository)
        .filter(models.Repository.application_id == app_id)
        .order_by(models.Repository.created_at.desc())
        .all()
    )


def list_servers_by_org(db: Session, org_id: str) -> List[models.Server]:
    return db.query(models.Server).filter(models.Server.organization_id == org_id).order_by(models.Server.created_at.desc()).all()


def list_domains_by_org(db: Session, org_id: str) -> List[models.Domain]:
    return db.query(models.Domain).filter(models.Domain.organization_id == org_id).order_by(models.Domain.created_at.desc()).all()

# List domains by suborganization
def list_domains_by_suborg(db: Session, suborg_id: str) -> List[models.Domain]:
    return db.query(models.Domain).filter(models.Domain.suborganization_id == suborg_id).order_by(models.Domain.created_at.desc()).all()


def delete_organization(db: Session, org_id: str) -> bool:
    org = db.query(models.Organization).filter(models.Organization.id == org_id).first()
    if not org:
        return False
    db.delete(org)
    db.commit()
    return True


# Onboarding Batch CRUD

def create_onboarding_batch(db: Session, batch_data: dict) -> models.OnboardingBatch:
    """Create a new onboarding batch record"""
    db_batch = models.OnboardingBatch(**batch_data)
    db.add(db_batch)
    db.commit()
    db.refresh(db_batch)
    return db_batch


def get_onboarding_batch(db: Session, batch_id: str) -> Optional[models.OnboardingBatch]:
    """Get a specific onboarding batch by ID"""
    return db.query(models.OnboardingBatch).filter(models.OnboardingBatch.id == batch_id).first()


def list_onboarding_batches(db: Session, limit: int = 100) -> List[models.OnboardingBatch]:
    """List all onboarding batches, most recent first"""
    return (
        db.query(models.OnboardingBatch)
        .order_by(models.OnboardingBatch.created_at.desc())
        .limit(limit)
        .all()
    )


def update_onboarding_batch_scan_ids(
    db: Session,
    batch_id: str,
    repo_scan_job_id: Optional[str] = None,
    tls_scan_batch_id: Optional[str] = None
) -> Optional[models.OnboardingBatch]:
    """Update scan job IDs for an onboarding batch"""
    batch = db.query(models.OnboardingBatch).filter(models.OnboardingBatch.id == batch_id).first()
    if not batch:
        return None
    
    if repo_scan_job_id is not None:
        batch.repo_scan_job_id = repo_scan_job_id
    if tls_scan_batch_id is not None:
        batch.tls_scan_batch_id = tls_scan_batch_id
    
    db.commit()
    db.refresh(batch)
    return batch


def delete_onboarding_batch(db: Session, batch_id: str) -> bool:
    """Delete an onboarding batch record"""
    batch = db.query(models.OnboardingBatch).filter(models.OnboardingBatch.id == batch_id).first()
    if not batch:
        return False
    db.delete(batch)
    db.commit()
    return True

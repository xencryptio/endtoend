from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class OrganizationBase(BaseModel):
    organization_name: str
    organization_type: Optional[str] = None
    industry: Optional[str] = None
    organization_email: Optional[str] = None
    contact_person: Optional[str] = None
    onboarding_date: Optional[datetime] = None
    status: Optional[str] = "pending"

class OrganizationCreate(OrganizationBase):
    pass

class Organization(OrganizationBase):
    id: str
    total_repositories: int = 0
    total_servers: int = 0
    total_windows_servers: int = 0
    total_linux_servers: int = 0
    total_domains: int = 0
    total_active_agents: int = 0
    last_calculated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SubOrganizationBase(BaseModel):
    suborganization_name: str
    description: Optional[str] = None
    metadata_json: Optional[dict] = None

class SubOrganizationCreate(SubOrganizationBase):
    organization_id: str

class SubOrganization(SubOrganizationBase):
    id: str
    organization_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ApplicationBase(BaseModel):
    application_name: str
    description: Optional[str] = None
    metadata_json: Optional[dict] = None

class ApplicationCreate(ApplicationBase):
    suborganization_id: str

class Application(ApplicationBase):
    id: str
    suborganization_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RepositoryBase(BaseModel):
    project_name: Optional[str] = None
    repo_name: Optional[str] = None
    repo_url: str
    branch_to_scan: Optional[str] = "main"
    scan_frequency: Optional[str] = None

class RepositoryCreate(RepositoryBase):
    organization_id: str
    suborganization_id: Optional[str] = None
    application_id: Optional[str] = None

class Repository(RepositoryBase):
    id: str
    organization_id: str
    suborganization_id: Optional[str] = None
    application_id: Optional[str] = None
    last_scan_time: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ServerBase(BaseModel):
    server_name: Optional[str] = None
    operating_system: Optional[str] = None
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None

class ServerCreate(ServerBase):
    organization_id: str
    suborganization_id: Optional[str] = None
    application_id: Optional[str] = None

class Server(ServerBase):
    id: str
    organization_id: str
    suborganization_id: Optional[str] = None
    application_id: Optional[str] = None
    agent_status: Optional[str] = "not_installed"
    last_heartbeat: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DomainBase(BaseModel):
    domain: str

class DomainCreate(DomainBase):
    organization_id: str
    suborganization_id: Optional[str] = None
    application_id: Optional[str] = None

class Domain(DomainBase):
    id: str
    organization_id: str
    suborganization_id: Optional[str] = None
    application_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OnboardingJobBase(BaseModel):
    job_type: str
    created_by: Optional[str] = None

class OnboardingJobCreate(OnboardingJobBase):
    organization_id: Optional[str] = None

class OnboardingJob(OnboardingJobBase):
    id: str
    organization_id: Optional[str] = None
    status: str
    rows_processed: int
    errors: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ScanJobBase(BaseModel):
    target_type: str
    scan_type: str
    target_id: Optional[str] = None

class ScanJobCreate(ScanJobBase):
    organization_id: str
    suborganization_id: Optional[str] = None
    application_id: Optional[str] = None

class ScanJob(ScanJobBase):
    id: str
    organization_id: str
    suborganization_id: Optional[str] = None
    application_id: Optional[str] = None
    status: str
    scheduled_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

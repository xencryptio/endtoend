from pydantic import BaseModel, Field, UUID4
from typing import List, Optional, Any, Dict
from datetime import datetime


# ============================================================================
# apps RESPONSE MODELS
# ============================================================================

class appsApplicationResponse(BaseModel):
    """
    Complete apps response model for a single application.
    Matches the JSON structure from the API specification.
    """
    Organisation: str = Field(..., description="Organization name")
    Org_ID: str = Field(..., alias="Org ID", description="Organization UUID")
    Sub_Org: str = Field(..., alias="Sub Org", description="Sub-organization name")
    Sub_Org_ID: str = Field(..., alias="Sub Org ID", description="Sub-organization UUID")
    Org_Target_Migration_Data: str = Field(
        ..., 
        alias="Org Target Migration Data",
        description="Target migration quarter (e.g., 'Q3 2026')"
    )
    application: str = Field(..., description="Application name")
    Application_ID: str = Field(..., alias="Application ID", description="Application UUID")
    status: str = Field(..., description="Migration status (same as Org Target Migration Data)")
    alg_changes: int = Field(default=0, description="Algorithm changes count")
    cert_changes: int = Field(default=0, description="Certificate changes count")
    pqc_ready: float = Field(..., ge=0, le=100, description="PQC readiness score (0-100)")
    risk_level: str = Field(..., description="Risk level: Low, Medium, High, or Very High")
    total_algorithms: int = Field(..., ge=0, description="Total algorithms count")
    total_certificates: int = Field(..., ge=0, description="Total certificates count")
    total_pqc_vulnerable_certificates: int = Field(
        ..., 
        ge=0, 
        description="Total PQC vulnerable certificates"
    )
    total_pqc_vulnerable_algorithms: int = Field(
        ..., 
        ge=0, 
        description="Total PQC vulnerable algorithms"
    )
    vulnerabilities: int = Field(..., ge=0, le=10, description="Total vulnerabilities (capped at 10)")
    time_complexity: str = Field(..., description="Migration time complexity: Low, Medium, or High")
    current_date: str = Field(..., description="Current date (MM-DD-YYYY)")
    App_Category: str = Field(
        ..., 
        alias="App Category", 
        description="Application category from metadata"
    )
    algorithms_used: List[str] = Field(
        default_factory=list, 
        description="List of all algorithms used"
    )

    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "Organisation": "Tech Corp",
                "Org ID": "123e4567-e89b-12d3-a456-426614174000",
                "Sub Org": "Engineering",
                "Sub Org ID": "123e4567-e89b-12d3-a456-426614174001",
                "Org Target Migration Data": "Q3 2026",
                "application": "Payment Gateway",
                "Application ID": "550001001",
                "status": "Q3 2026",
                "alg_changes": 0,
                "cert_changes": 0,
                "pqc_ready": 66.7,
                "risk_level": "Medium",
                "total_algorithms": 15,
                "total_certificates": 8,
                "total_pqc_vulnerable_certificates": 5,
                "total_pqc_vulnerable_algorithms": 10,
                "vulnerabilities": 3,
                "time_complexity": "Medium",
                "current_date": "02-09-2026",
                "App Category": "Server",
                "algorithms_used": ["RSA-2048", "SHA-256", "ECDSA", "AES-256"]
            }
        }


# ============================================================================
# HIERARCHY MODELS
# ============================================================================

class ApplicationInfo(BaseModel):
    """Application basic information"""
    id: str
    application_name: str
    metadata_json: Optional[Dict[str, Any]] = None


class SuborganizationInfo(BaseModel):
    """Sub-organization basic information"""
    id: str
    suborganization_name: str


class OrganizationInfo(BaseModel):
    """Organization basic information"""
    id: str
    organization_name: str


class ApplicationWithHierarchy(BaseModel):
    """Application with full organizational hierarchy"""
    application: ApplicationInfo
    suborganization: SuborganizationInfo
    organization: OrganizationInfo

    class Config:
        json_schema_extra = {
            "example": {
                "application": {
                    "id": "550001001",
                    "application_name": "Payment Gateway",
                    "metadata_json": {"category": "Server", "environment": "production"}
                },
                "suborganization": {
                    "id": "123e4567-e89b-12d3-a456-426614174001",
                    "suborganization_name": "Engineering"
                },
                "organization": {
                    "id": "123e4567-e89b-12d3-a456-426614174000",
                    "organization_name": "Tech Corp"
                }
            }
        }


# ============================================================================
# REPOSITORY & DOMAIN MODELS
# ============================================================================

class RepositoryResponse(BaseModel):
    """Repository information"""
    id: Optional[str] = None
    application_id: Optional[str] = None
    suborganization_id: Optional[str] = None
    organization_id: Optional[str] = None
    repo_url: Optional[str] = None
    repo_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DomainResponse(BaseModel):
    """Domain information"""
    id: Optional[str] = None
    application_id: Optional[str] = None
    suborganization_id: Optional[str] = None
    organization_id: Optional[str] = None
    domain: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================================
# REPOSITORY SCAN MODELS
# ============================================================================

class LatestRepoScan(BaseModel):
    """Latest repository scan from repo_scanner_db"""
    id: int
    quantum_safe_count: Optional[int] = 0
    quantum_vulnerable_count: Optional[int] = 0
    overall_security_score: Optional[float] = 0.0

    class Config:
        json_schema_extra = {
            "example": {
                "id": 12345,
                "quantum_safe_count": 5,
                "quantum_vulnerable_count": 3,
                "overall_security_score": 75.5
            }
        }


class RepoAlgorithm(BaseModel):
    """Algorithm found in repository scan"""
    algorithm: str

    class Config:
        json_schema_extra = {
            "example": {
                "algorithm": "RSA-2048"
            }
        }


class CategoryScore(BaseModel):
    """Category score for repository"""
    category_type: str
    score: Optional[float] = None
    grade: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "category_type": "Encryption",
                "score": 85.0,
                "grade": "B"
            }
        }


# ============================================================================
# QUERY PARAMETER MODELS
# ============================================================================

class appsQueryParams(BaseModel):
    """Query parameters for apps endpoint"""
    organization_id: Optional[str] = Field(None, description="Filter by organization ID")
    suborganization_id: Optional[str] = Field(None, description="Filter by sub-organization ID")
    application_id: Optional[str] = Field(None, description="Filter by application ID")
    limit: int = Field(100, ge=1, le=1000, description="Maximum number of results")


class HierarchyQueryParams(BaseModel):
    """Query parameters for hierarchy endpoint"""
    organization_id: Optional[str] = Field(None, description="Filter by organization ID")
    suborganization_id: Optional[str] = Field(None, description="Filter by sub-organization ID")
    limit: int = Field(100, ge=1, le=1000, description="Maximum number of results")


# ============================================================================
# INTERNAL DATA MODELS (for intermediate calculations)
# ============================================================================

class DomainAggregations(BaseModel):
    """Internal model for domain data aggregations"""
    total_certificates: int = 0
    vulnerable_certificates: int = 0
    avg_pqc_score: float = 0.0
    domain_vulnerabilities: int = 0
    domain_algorithms: List[str] = Field(default_factory=list)


class RepoAggregations(BaseModel):
    """Internal model for repository data aggregations"""
    total_algorithms: int = 0
    vulnerable_algorithms: int = 0
    avg_repo_score: float = 0.0
    repo_vulnerabilities: int = 0
    repo_algorithms: List[str] = Field(default_factory=list)


class SystemAggregations(BaseModel):
    """Internal model for system data aggregations"""
    system_vulnerabilities: int = 0


class RepoMetrics(BaseModel):
    """Repository metrics from repo_scanner_db"""
    security_score: float = 0.0
    quantum_safe_count: int = 0
    quantum_vulnerable_count: int = 0
    total_algorithms: int = 0
    vulnerable_algorithms: int = 0
    algorithms: List[str] = Field(default_factory=list)


class SystemMetrics(BaseModel):
    """System metrics from system_scanner_db"""
    vulnerability_count: int = 0
    audit_results: Optional[Dict[str, Any]] = None
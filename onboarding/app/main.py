"""
Excel Batch Scanner for TLS/SSL and Repository Scanning
Supports Excel file uploads with SSE for real-time progress
"""

import os
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Request, status # Import Request and status
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError # Import RequestValidationError
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import pandas as pd
import httpx
import asyncio
from datetime import datetime, timedelta, timezone
import io
import uuid
from enum import Enum
import json
import re
import logging # Import logging
from logging_config import setup_logging # Import setup_logging
from http_client import call_service # Import call_service
from logging_middleware import correlation_middleware # Import correlation_middleware
from exceptions import APIError # Import APIError

# Setup unified logging
setup_logging("ONBOARDING-SERVICE", logging.INFO)
logger = logging.getLogger(__name__)

# --- IST Timezone Configuration ---
IST = timezone(timedelta(hours=5, minutes=30))

def get_ist_now():
    """Get current time in IST timezone"""
    return datetime.now(IST).replace(tzinfo=None)  # Store without timezone info for consistency

app = FastAPI(title="Excel Batch Scanner API", version="1.0.0")
app.middleware("http")(correlation_middleware) # Add correlation middleware


# ==================== CORS CONFIGURATION ====================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (for development)
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, DELETE, etc.)
    allow_headers=["*"],  # Allow all headers
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors consistently"""
    logger.error(f"Validation error: {exc.errors()}")
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": {
                "error": "validation_error",
                "message": "Request validation failed",
                "errors": exc.errors(),
                "timestamp": datetime.now().isoformat()
            }
        }
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Catch-all for unexpected errors"""
    logger.exception(f"Unexpected error: {exc}")
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": {
                "error": "internal_error",
                "message": "An internal server error occurred",
                "timestamp": datetime.now().isoformat()
            }
        }
    )

# Configuration - READ FROM ENVIRONMENT VARIABLES
TLS_SCANNER_URL = os.getenv("TLS_SCANNER_URL", "http://localhost:8000")
REPO_SCANNER_URL = os.getenv("REPO_SCANNER_URL", "http://localhost:8003")
MAX_CONCURRENT_SCANS = int(os.getenv("MAX_CONCURRENT_SCANS", "5"))
DB_SERVICE_URL = os.getenv("DB_SERVICE_URL", "http://db-service:8001")
SYSTEM_SCAN_URL = os.getenv("SYSTEM_SCAN_URL", "http://system-scan:9000")

# Add debug logging
logger.info(f"Configuration loaded:")
logger.info(f"   TLS_SCANNER_URL: {TLS_SCANNER_URL}")
logger.info(f"   REPO_SCANNER_URL: {REPO_SCANNER_URL}")
logger.info(f"   DB_SERVICE_URL: {DB_SERVICE_URL}")
logger.info(f"   SYSTEM_SCAN_URL: {SYSTEM_SCAN_URL}")
logger.info(f"   MAX_CONCURRENT_SCANS: {MAX_CONCURRENT_SCANS}")

# GitHub API Configuration
GITHUB_API_BASE = "https://api.github.com"
GITHUB_API_TIMEOUT = 30.0

class ScanType(str, Enum):
    TLS = "tls"
    REPOSITORY = "repository"


class ScanStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


# ==================== BACKGROUND TASK WRAPPER ====================
# Wrapper to handle exceptions in background tasks safely
async def safe_background_task_wrapper(func, job_id: str, *args, **kwargs):
    """
    Safely execute async background tasks with proper exception handling.
    This ensures FastAPI doesn't silently swallow exceptions.
    """
    try:
        logger.info(f"[{job_id}] Starting background task: {func.__name__}")
        result = await func(job_id, *args, **kwargs)
        logger.info(f"[{job_id}] Background task {func.__name__} completed successfully")
        return result
    except Exception as e:
        logger.exception(f"[{job_id}] CRITICAL ERROR in background task {func.__name__}: {type(e).__name__} - {e}")
        # Re-raise to ensure it's not silently swallowed
        raise
    except BaseException as e:
        logger.exception(f"[{job_id}] FATAL ERROR in background task {func.__name__}: {type(e).__name__} - {e}")
        raise


class ScanResult(BaseModel):
    """Simple scan result"""
    domain_or_repo: str
    status: str  # "completed" or "failed"
    error: Optional[str] = None
    timestamp: datetime


class BatchScanJob(BaseModel):
    job_id: str
    scan_type: ScanType
    total_items: int
    completed_items: int = 0
    failed_items: int = 0
    status: ScanStatus = ScanStatus.PENDING
    results: List[ScanResult] = []
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# In-memory storage for jobs
batch_jobs: Dict[str, BatchScanJob] = {}
# Store SSE queues for active connections
sse_queues: Dict[str, asyncio.Queue] = {}
# Track running async tasks to avoid GC and capture failures
running_tasks: Dict[str, asyncio.Task] = {}

# ==================== GITHUB INTEGRATION MODELS ====================

class GitHubRepo(BaseModel):
    name: str
    full_name: str
    clone_url: str
    default_branch: str
    private: bool
    description: Optional[str] = None
    branches: List[str] = []

class GitHubDiscoveryRequest(BaseModel):
    github_url: str  # e.g., "https://github.com/torvalds"

class GitHubDiscoveryResponse(BaseModel):
    username: str
    total_public_repos: int
    repositories: List[GitHubRepo]

class BatchGitHubScanRequest(BaseModel):
    repos: List[Dict[str, str]]  # e.g., [{"repo_url": "...", "branch_name": "..."}]


# =================== ONBOARDING MODELS ===================
class OnboardingOrganization(BaseModel):
    organization_name: str
    organization_type: Optional[str] = None
    industry: Optional[str] = None
    organization_email: Optional[str] = None
    contact_person: Optional[str] = None
    onboarding_date: Optional[datetime] = None

class OnboardingRepository(BaseModel):
    project_name: Optional[str] = None
    repo_name: Optional[str] = None
    repo_url: str
    branch_to_scan: Optional[str] = "main"
    scan_frequency: Optional[str] = None

class OnboardingServer(BaseModel):
    server_name: Optional[str] = None
    operating_system: Optional[str] = None
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None

class OnboardingDomain(BaseModel):
    domain: str

class ApplicationPayload(BaseModel):
    application_name: str
    repositories: Optional[List[OnboardingRepository]] = []
    servers: Optional[List[OnboardingServer]] = []
    domains: Optional[List[OnboardingDomain]] = []

class SubOrganizationPayload(BaseModel):
    suborganization_name: str
    applications: Optional[List[ApplicationPayload]] = []

class OnboardingPayload(BaseModel):
    organization: OnboardingOrganization
    repositories: Optional[List[OnboardingRepository]] = []
    servers: Optional[List[OnboardingServer]] = []
    domains: Optional[List[OnboardingDomain]] = []
    suborganizations: Optional[List[SubOrganizationPayload]] = []
    created_by: Optional[str] = None
    trigger_scans: bool = True


# ==================== AGENT REGISTRATION HELPER ====================

async def register_server_as_agent(server: dict, org_context: dict = None) -> dict:
    """
    Register a server as an agent in the system-scan service.
    This pre-registers the agent so when the actual agent is installed, 
    it will match by IP and become active.
    
    Args:
        server: Server dict with ip_address, hostname, server_name, operating_system
        org_context: Dict with organization_name, suborganization_name, application_name
        
    Returns:
        dict with registration result
    """
    ip_address = server.get("ip_address")
    if not ip_address:
        logger.warning(f"Server {server.get('server_name', 'unknown')} has no IP address, skipping agent registration")
        return {"success": False, "reason": "no_ip_address"}
    
    # Generate a placeholder agent_id (will be replaced when real agent connects)
    agent_id = f"onboarded_{uuid.uuid4()}"
    hostname = server.get("hostname") or server.get("server_name") or f"server-{ip_address}"
    os_info = server.get("operating_system") or "Unknown OS (Pending Agent Installation)"
    
    # Extract organization context
    org_context = org_context or {}
    
    registration_payload = {
        "agent_id": agent_id,
        "hostname": hostname,
        "ip_address": ip_address,
        "os_info": os_info,
        "timestamp": get_ist_now().isoformat(),  # Use IST
        # Organization tracking
        "organization_name": org_context.get("organization_name"),
        "suborganization_name": org_context.get("suborganization_name") or server.get("suborganization_name"),
        "application_name": org_context.get("application_name") or server.get("application_name")
    }
    
    try:
        response = await call_service(
            "POST", 
            f"{SYSTEM_SCAN_URL}/api/v1/agent/register", 
            json=registration_payload,
            timeout=10.0
        )
        result = response.json()
        registered_agent_id = result.get("agent_id", agent_id)
        logger.info(f"Registered server {hostname} ({ip_address}) as agent {registered_agent_id} [Org: {org_context.get('organization_name')}, SubOrg: {org_context.get('suborganization_name')}]")
        
        # Trigger a pending scan for this agent (will execute when agent becomes active)
        try:
            scan_response = await call_service(
                "POST",
                f"{SYSTEM_SCAN_URL}/api/v1/admin/trigger-scan/{registered_agent_id}",
                timeout=10.0
            )
            scan_result = scan_response.json()
            logger.info(f"Pre-created scan task for agent {registered_agent_id}: {scan_result.get('task_id', 'unknown')}")
        except Exception as scan_err:
            logger.warning(f"Could not pre-create scan task for {registered_agent_id}: {scan_err}")
        
        return {"success": True, "agent_id": registered_agent_id, "ip_address": ip_address}
    except Exception as e:
        logger.exception(f"Failed to register server {hostname} ({ip_address}) as agent: {e}")
        return {"success": False, "reason": str(e), "ip_address": ip_address}


async def register_servers_as_agents(servers: list, org_context: dict = None) -> list:
    """
    Register multiple servers as agents in parallel.
    
    Args:
        servers: List of server dicts
        org_context: Dict with organization_name, suborganization_name, application_name
        
    Returns:
        List of registration results
    """
    if not servers:
        return []
    
    tasks = [register_server_as_agent(server, org_context) for server in servers]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    successful = sum(1 for r in results if isinstance(r, dict) and r.get("success"))
    logger.info(f"Registered {successful}/{len(servers)} servers as agents")
    
    return results


# ==================== GITHUB INTEGRATION HELPERS AND ENDPOINTS ====================

async def fetch_repo_branches(owner: str, repo_name: str) -> List[str]:
    """Fetch all branch names for a given repository."""
    try:
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo_name}/branches"
        response = await call_service("GET", url, timeout=GITHUB_API_TIMEOUT)
        return [branch['name'] for branch in response.json()]
    except (httpx.HTTPError, json.JSONDecodeError) as e:
        logger.warning(f"Could not fetch branches for {owner}/{repo_name}: {e}")
        return []

@app.post("/api/github/discover",
          summary="Discover public repositories from a GitHub account",
          response_model=GitHubDiscoveryResponse)
async def discover_github_repos(request: GitHubDiscoveryRequest):
    """
    Discovers all public repositories from a GitHub account URL.
    Also fetches available branches for each repository.
    """
    logger.info(f"Discovering GitHub repos for: {request.github_url}")
    github_username_match = re.search(r"github\.com/([^/]+)", request.github_url)
    if not github_username_match:
        logger.error("Invalid GitHub URL format provided")
        raise APIError(status_code=400, error_code="invalid_github_url", message="Invalid GitHub URL format. Expected 'https://github.com/username'.")
    
    username = github_username_match.group(1)
    
    try:
        # Fetch repositories for the user
        repos_url = f"{GITHUB_API_BASE}/users/{username}/repos?type=public&per_page=100"
        repos_response = await call_service("GET", repos_url, timeout=GITHUB_API_TIMEOUT)
        repos_data = repos_response.json()
        
        public_repos = [repo for repo in repos_data if not repo.get('fork', False)]

        discovered_repos = []
        for repo in public_repos:
            owner = repo['owner']['login']
            repo_name = repo['name']
            
            # Fetch branches for this repo
            branches = await fetch_repo_branches(owner, repo_name)
            
            repo_model = GitHubRepo(
                name=repo['name'],
                full_name=repo['full_name'],
                clone_url=repo['clone_url'],
                default_branch=repo['default_branch'],
                private=repo['private'],
                description=repo.get('description'),
                branches=branches
            )
            discovered_repos.append(repo_model)

        logger.info(f"Discovered {len(discovered_repos)} repositories for {username}")
        return GitHubDiscoveryResponse(
            username=username,
            total_public_repos=len(discovered_repos),
            repositories=discovered_repos
        )

    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            logger.warning(f"GitHub user '{username}' not found.")
            raise APIError(status_code=404, error_code="github_user_not_found", message=f"GitHub user '{username}' not found.")
        logger.error(f"Failed to fetch data from GitHub: {e}")
        raise APIError(status_code=500, error_code="github_api_failed", message=f"Failed to fetch data from GitHub: {e}")
    except Exception as e:
        logger.exception(f"An unexpected error occurred during GitHub discovery: {e}")
        raise APIError(status_code=500, error_code="unexpected_error", message=f"An unexpected error occurred: {e}")

@app.post("/api/repo-scan/batch-from-github",
          summary="Batch scan selected GitHub repositories")
async def batch_repo_scan_from_github(
    background_tasks: BackgroundTasks,
    request: BatchGitHubScanRequest
):
    """
    Scans multiple repositories selected from GitHub discovery.
    Uses the same processing pipeline as Excel-based batch scan.
    """
    if not request.repos:
        raise APIError(status_code=400, error_code="no_repos_provided", detail="No repositories provided to scan.")
        
    # Convert input to the format process_repo_batch expects
    repositories_to_scan = [
        RepoScanRow(repo_url=item['repo_url'], branch_name=item['branch_name'])
        for item in request.repos
    ]
    
    # Create batch job
    # job_id = str(uuid.uuid4()) # This was the line causing the crash
    job_id = str(uuid.uuid4())
    job = BatchScanJob(
        job_id=job_id,
        scan_type=ScanType.REPOSITORY,
        total_items=len(repositories_to_scan)
    )
    batch_jobs[job_id] = job
    
    # Start background processing using the existing function
    background_tasks.add_task(process_repo_batch, job_id, repositories_to_scan)
    
    return {
        "job_id": job_id,
        "message": f"Batch repository scan started for {len(repositories_to_scan)} repositories",
        "total_repositories": len(repositories_to_scan),
        "status": "pending",
        "sse_url": f"/api/batch-jobs/{job_id}/stream",
        "poll_url": f"/api/batch-jobs/{job_id}"
    }

# ==================== TLS/SSL SCANNING ====================

class TLSScanRow(BaseModel):
    """Simplified structure for TLS scan Excel rows"""
    domain: str


async def scan_single_tls_domain(domain: str) -> ScanResult:
    """Scan a single domain using TLS scanner with direct API call."""
    logger.info(f"🔍 Initiating TLS scan for domain: {domain}")
    # TLS scans via SSL Labs can take 3-10 minutes per domain.
    # Must be long enough that we never drop the connection before scan-service
    # calls save_scan_result — if we disconnect, FastAPI cancels the coroutine
    # and the pending record is never updated to completed.
    _SCAN_TIMEOUT = 660.0  # 11 minutes — matches scan-service's own 6000s limit
    try:
        # Use direct /scan endpoint for single-scan architecture
        async with httpx.AsyncClient(timeout=_SCAN_TIMEOUT) as client:
            response = await client.post(
                f"{TLS_SCANNER_URL}/scan",
                json={
                    "domain": domain,
                    "max_concurrent": 1,
                    "save_to_db": True
                },
                timeout=_SCAN_TIMEOUT
            )
            response.raise_for_status()
            scan_data = response.json()
            
            # The /scan endpoint returns the result directly (not in a results array)
            # Check for scan_status in the response
            status = scan_data.get('scan_status', 'unknown')
            
            if status == 'completed':
                logger.info(f"✅ TLS scan completed successfully for {domain}")
                return ScanResult(
                    domain_or_repo=domain,
                    status="completed",
                    timestamp=datetime.utcnow()
                )
            elif status == 'http_skipped':
                logger.warning(f"⚠️ TLS scan skipped for {domain} - HTTP only")
                return ScanResult(
                    domain_or_repo=domain,
                    status="http_skipped",
                    error="Domain uses HTTP only, no TLS",
                    timestamp=datetime.utcnow()
                )
            else:
                error_msg = scan_data.get('error_message', 'Unknown error')
                logger.error(f"❌ TLS scan failed for {domain}: {error_msg}")
                return ScanResult(
                    domain_or_repo=domain,
                    status="failed",
                    error=error_msg,
                    timestamp=datetime.utcnow()
                )

    except httpx.TimeoutException:
        logger.error(f"⏱️ TLS scan request for {domain} timed out after 11 minutes.")
        return ScanResult(
            domain_or_repo=domain,
            status="failed",
            error="Request timeout (scan exceeded 11 minutes)",
            timestamp=datetime.utcnow()
        )
    except httpx.HTTPError as e:
        logger.error(f"TLS scan for {domain} failed with HTTP error: {e}")
        return ScanResult(
            domain_or_repo=domain,
            status="failed",
            error=f"HTTP Error: {str(e)}",
            timestamp=datetime.utcnow()
        )
    except Exception as e:
        logger.exception(f"Unexpected error during TLS scan for {domain}: {e}")
        return ScanResult(
            domain_or_repo=domain,
            status="failed",
            error=f"Unexpected error: {str(e)}",
            timestamp=datetime.utcnow()
        )


async def process_tls_batch(job_id: str, domains: List[TLSScanRow]):
    """Process TLS batch scan in background with SSE updates"""
    try:
        logger.info(f"Starting TLS batch job {job_id} with {len(domains)} domains")
        
        if job_id not in batch_jobs:
            logger.error(f"Job {job_id} not found in batch_jobs dictionary!")
            return
        
        job = batch_jobs[job_id]
        job.status = ScanStatus.IN_PROGRESS
        job.started_at = datetime.utcnow()
        
        logger.info(f"Processing domains: {[d.domain for d in domains]}")
        
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_SCANS)
        
        async def scan_with_semaphore(row: TLSScanRow):
            async with semaphore:
                try:
                    logger.info(f"🔍 Starting scan for domain: {row.domain}")
                    result = await scan_single_tls_domain(row.domain)
                    logger.info(f"Scan completed for {row.domain}: status={result.status}")
                    
                    if result.status == "failed":
                        job.failed_items += 1
                    else:
                        job.completed_items += 1
                    
                    job.results.append(result)
                    
                    # Send SSE update
                    if job_id in sse_queues:
                        await sse_queues[job_id].put({
                            "type": "progress",
                            "data": {
                                "domain": result.domain_or_repo,
                                "status": result.status,
                                "error": result.error,
                                "completed": job.completed_items,
                                "failed": job.failed_items,
                                "total": job.total_items,
                                "percentage": round((job.completed_items + job.failed_items) / job.total_items * 100, 2)
                            }
                        })
                    
                    return result
                except Exception as e:
                    logger.exception(f"Error scanning domain {row.domain}: {e}")
                    job.failed_items += 1
                    return ScanResult(
                        domain_or_repo=row.domain,
                        status="failed",
                        error=str(e),
                        timestamp=datetime.utcnow()
                    )
        
        tasks = [scan_with_semaphore(row) for row in domains]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        logger.info(f"TLS batch scan completed: {job.completed_items} successful, {job.failed_items} failed")
        
        job.status = ScanStatus.COMPLETED
        job.completed_at = datetime.utcnow()
        logger.info(f"TLS batch job {job_id} completed successfully")
        
        # Send completion event
        if job_id in sse_queues:
            await sse_queues[job_id].put({
                "type": "complete",
                "data": {
                    "total": job.total_items,
                    "completed": job.completed_items,
                    "failed": job.failed_items,
                    "completed_at": job.completed_at.isoformat()
                }
            })
        
    except Exception as e:
        logger.exception(f"Fatal error in TLS batch job {job_id}: {e}")
        if job_id in batch_jobs:
            batch_jobs[job_id].status = ScanStatus.FAILED


@app.post("/api/tls-scan/batch", 
          summary="Batch TLS/SSL scan from Excel",
          description="""
          Upload Excel file with single column:
          - domain (required): Domain to scan (e.g., example.com)
          
          Default settings: max_concurrent=5, save_to_db=True
          """)
async def batch_tls_scan(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Excel file (.xlsx or .xls)")
):
    """(existing implementation)"""


@app.post("/api/tls-scan", summary="Trigger TLS scans for a list of domains (JSON)")
async def tls_scan_json(background_tasks: BackgroundTasks, payload: dict):
    """Accepts JSON payload: {"domains": ["example.com", ...]} and starts TLS scans"""
    domains_list = payload.get('domains') if isinstance(payload, dict) else None
    if not domains_list or not isinstance(domains_list, list):
        raise APIError(status_code=400, error_code="invalid_payload", message="Expected JSON with 'domains' list")

    rows = []
    for d in domains_list:
        if not isinstance(d, str) or not d.strip():
            continue
        rows.append(TLSScanRow(domain=d.strip()))

    if not rows:
        raise APIError(status_code=400, error_code="no_domains", message="No valid domains provided")

    job_id = str(uuid.uuid4())
    job = BatchScanJob(job_id=job_id, scan_type=ScanType.TLS, total_items=len(rows))
    batch_jobs[job_id] = job
    background_tasks.add_task(process_tls_batch, job_id, rows)

    return {
        "job_id": job_id,
        "message": f"Batch TLS scan started for {len(rows)} domains",
        "total_domains": len(rows),
        "status": "pending",
        "sse_url": f"/api/batch-jobs/{job_id}/stream",
        "poll_url": f"/api/batch-jobs/{job_id}"
    }
    """
    Batch scan multiple domains from Excel file.
    
    Excel Structure (simplified):
    | domain          |
    |-----------------|
    | example.com     |
    | google.com      |
    | github.com      |
    """
    
    # Validate file type
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise APIError(status_code=400, error_code="invalid_file_type", message="Only Excel files (.xlsx, .xls) are supported")
    
    try:
        # Read Excel file
        content = await file.read()
        
        # Try reading with openpyxl engine explicitly for .xlsx
        df = pd.read_excel(io.BytesIO(content), engine='openpyxl' if file.filename.endswith('.xlsx') else None)
        
        # Validate required columns (case-insensitive)
        df.columns = df.columns.str.lower().str.strip()
        
        if 'domain' not in df.columns:
            raise APIError(
                status_code=400, 
                error_code="missing_column",
                message=f"Excel file must contain 'domain' column. Found columns: {df.columns.tolist()}"
            )
        
        # Convert to list of TLSScanRow objects
        domains = []
        for idx, row in df.iterrows():
            if pd.notna(row['domain']):  # Skip empty rows
                domain_value = str(row['domain']).strip()
                if domain_value:  # Skip empty strings
                    domains.append(TLSScanRow(domain=domain_value))
        
        if not domains:
            raise APIError(status_code=400, error_code="no_domains_found", message="No valid domains found in Excel file")
        
        # Create batch job
        job_id = str(uuid.uuid4())
        job = BatchScanJob(
            job_id=job_id,
            scan_type=ScanType.TLS,
            total_items=len(domains)
        )
        batch_jobs[job_id] = job
        
        # Start background processing
        background_tasks.add_task(process_tls_batch, job_id, domains)
        
        return {
            "job_id": job_id,
            "message": f"Batch TLS scan started for {len(domains)} domains",
            "total_domains": len(domains),
            "status": "pending",
            "sse_url": f"/api/batch-jobs/{job_id}/stream",
            "poll_url": f"/api/batch-jobs/{job_id}"
        }
        
    except pd.errors.EmptyDataError:
        raise APIError(status_code=400, error_code="empty_file", message="Excel file is empty")
    except APIError:
        raise
    except Exception as e:
        import traceback
        logger.exception(f"Error processing Excel file: {traceback.format_exc()}")  # Full error trace for debugging
        raise APIError(status_code=500, error_code="excel_processing_failed", message=f"Error processing Excel file: {str(e)}")


# ==================== REPOSITORY SCANNING ====================

class RepoScanRow(BaseModel):
    """Expected structure for repository scan Excel rows"""
    repo_url: str
    branch_name: str = "main"


async def scan_single_repository(repo_url: str, branch_name: str) -> ScanResult:
    """
    Scan a single repository with a resilient mechanism.
    It tries to submit the scan, and if the initial request fails,
    it attempts to find the job in case it was created before the error.
    """
    logger.info(f"Initiating repository scan for repo: {repo_url}, branch: {branch_name}")
    repo_id = None
    initial_error = None

    # 1. Attempt to submit the scan job
    try:
        response = await call_service(
            "POST",
            f"{REPO_SCANNER_URL}/api/scan",
            json={"repo_url": repo_url, "branch_name": branch_name},
            timeout=90.0 # Use longer timeout for repo scans
        )
        scan_result = response.json()

        # If the result is from cache, it's already complete.
        if scan_result.get("cached"):
            logger.info(f"Repository scan for {repo_url} (branch: {branch_name}) served from cache.")
            return ScanResult(
                domain_or_repo=repo_url,
                status="completed",
                timestamp=datetime.utcnow()
            )
        
        repo_id = scan_result.get("repo_id")
        logger.info(f"Repository scan job submitted for {repo_url} (ID: {repo_id})")

    except (httpx.RequestError, httpx.HTTPStatusError) as e:
        initial_error = str(e)
        logger.warning(f"Initial submission of repository scan for {repo_url} failed: {initial_error}. Attempting to recover...")
        # 2. If submission failed, try to recover by finding the job ID
        await asyncio.sleep(3)  # Give the server a moment
        try:
            scans_response = await call_service("GET", f"{REPO_SCANNER_URL}/api/scans")
            if scans_response.status_code == 200:
                all_scans = scans_response.json()
                # Find the most recent, non-finished scan for this repo/branch
                our_scan = next((s for s in sorted(all_scans, key=lambda x: x.get('id', 0), reverse=True)
                                 if s.get('repo_url') == repo_url and s.get('branch_name') == branch_name
                                 and s.get('scan_status') in ['pending', 'in_progress']), None)
                if our_scan:
                    repo_id = our_scan.get('id')
                    initial_error = None  # We recovered, so clear the initial error
                    logger.info(f"Recovered repository scan job for {repo_url} (ID: {repo_id})")
        except (httpx.RequestError, httpx.HTTPStatusError):
            logger.warning(f"Recovery attempt for {repo_url} also failed.")
            pass # If recovery also fails, we'll proceed to the final failure case
    
    # 3. If we have a repo_id, poll for its final status
    if repo_id:
        max_attempts = 600  # Poll for up to 30 minutes (3 seconds * 600 attempts = 1800 seconds = 30 minutes)
        logger.info(f"Polling for status of repository scan ID: {repo_id} for {repo_url}")
        for i in range(max_attempts):
            await asyncio.sleep(3)
            try:
                status_response = await call_service("GET", f"{REPO_SCANNER_URL}/api/scans/{repo_id}")
                status = status_response.json()

                if status.get("scan_status") == "completed":
                    logger.info(f"Repository scan completed successfully for {repo_url} (ID: {repo_id})")
                    return ScanResult(
                        domain_or_repo=repo_url,
                        status="completed",
                        timestamp=datetime.utcnow()
                    )
                
                if status.get("scan_status") == "failed":
                    error_msg = status.get("current_status", "Scan failed in worker")
                    logger.error(f"Repository scan for {repo_url} (ID: {repo_id}) failed: {error_msg}")
                    return ScanResult(
                        domain_or_repo=repo_url,
                        status="failed",
                        error=error_msg,
                        timestamp=datetime.utcnow()
                    )
            except (httpx.RequestError, httpx.HTTPStatusError) as poll_e:
                logger.warning(f"Polling attempt {i+1} for {repo_url} (ID: {repo_id}) failed: {poll_e}")
                # If polling fails on the last attempt, we exit and report failure
                # Otherwise, we just continue to the next polling attempt
                if i == max_attempts - 1:
                    logger.error(f"Polling for {repo_url} (ID: {repo_id}) failed after multiple attempts.")
                    return ScanResult(
                        domain_or_repo=repo_url,
                        status="failed",
                        error=f"Polling failed after multiple attempts: {poll_e}",
                        timestamp=datetime.utcnow()
                    )

        # If polling loop finishes, it means timeout
        logger.error(f"Repository scan for {repo_url} (ID: {repo_id}) timed out during polling.")
        return ScanResult(
            domain_or_repo=repo_url,
            status="failed",
            error="Scan timeout (30 minutes exceeded during polling)",
            timestamp=datetime.utcnow()
        )

    # 4. If we never managed to get a repo_id, the scan truly failed to start
    logger.error(f"Failed to initiate or find the repository scan job for {repo_url}. Error: {initial_error or 'Unknown'}")
    return ScanResult(
        domain_or_repo=repo_url,
        status="failed",
        error=initial_error or "Failed to initiate or find the scan job.",
        timestamp=datetime.utcnow()
    )


async def process_repo_batch(job_id: str, repositories: List[RepoScanRow]):
    """Process repository batch scan in background with SSE updates"""
    try:
        logger.info(f"Starting repository batch job {job_id} with {len(repositories)} repositories")
        
        if job_id not in batch_jobs:
            logger.error(f"Job {job_id} not found in batch_jobs dictionary!")
            return
        
        job = batch_jobs[job_id]
        job.status = ScanStatus.IN_PROGRESS
        job.started_at = datetime.utcnow()
        
        logger.info(f"Processing repositories: {[r.repo_url for r in repositories]}")
        
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_SCANS)
        
        async def scan_with_semaphore(row: RepoScanRow):
            async with semaphore:
                try:
                    logger.info(f"🔍 Starting scan for repository: {row.repo_url}")
                    result = await scan_single_repository(row.repo_url, row.branch_name)
                    logger.info(f"Scan completed for {row.repo_url}: status={result.status}")
                    
                    if result.status == "failed":
                        job.failed_items += 1
                    else:
                        job.completed_items += 1
                    
                    job.results.append(result)
                    
                    # Send SSE update
                    if job_id in sse_queues:
                        await sse_queues[job_id].put({
                            "type": "progress",
                            "data": {
                                "repo_url": result.domain_or_repo,
                                "status": result.status,
                                "error": result.error,
                                "completed": job.completed_items,
                                "failed": job.failed_items,
                                "total": job.total_items,
                                "percentage": round((job.completed_items + job.failed_items) / job.total_items * 100, 2)
                            }
                        })
                    
                    return result
                except Exception as e:
                    logger.exception(f"Error scanning repository {row.repo_url}: {e}")
                    job.failed_items += 1
                    return ScanResult(
                        domain_or_repo=row.repo_url,
                        status="failed",
                        error=str(e),
                        timestamp=datetime.utcnow()
                    )
        
        tasks = [scan_with_semaphore(row) for row in repositories]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        logger.info(f"Repository batch scan completed: {job.completed_items} successful, {job.failed_items} failed")
        
        job.status = ScanStatus.COMPLETED
        job.completed_at = datetime.utcnow()
        logger.info(f"Repository batch job {job_id} completed successfully")
        
    except Exception as e:
        logger.exception(f"Fatal error in repository batch job {job_id}: {e}")
        if job_id in batch_jobs:
            batch_jobs[job_id].status = ScanStatus.FAILED
    
    # Send completion event
    if job_id in sse_queues:
        await sse_queues[job_id].put({
            "type": "complete",
            "data": {
                "total": job.total_items,
                "completed": job.completed_items,
                "failed": job.failed_items,
                "completed_at": job.completed_at.isoformat()
            }
        })


# ==================== MASTER SCAN / SELECTED SCAN ====================

class SelectedScanPayload(BaseModel):
    repos: Optional[List[dict]] = []   # [{repo_url: str, branch_name: str}]
    domains: Optional[List[str]] = []  # ["example.com", ...]
    agent_ids: Optional[List[str]] = []  # system-scan agent_ids to trigger


@app.post("/api/master-scan", summary="Trigger scan for all onboarded organizations")
async def master_scan():
    """Fetch all organizations' repositories and domains then trigger scans for all."""
    try:
        orgs_resp = await call_service("GET", f"{DB_SERVICE_URL}/organizations")
        orgs = orgs_resp.json()
    except Exception as e:
        raise APIError(status_code=500, error_code="fetch_orgs_failed", message=f"Failed to fetch organizations: {str(e)}")

    if not orgs:
        return {"message": "No organizations found to scan", "total_organizations": 0,
                "total_repos": 0, "total_domains": 0, "triggered_scans": {}}

    all_repo_rows: List[RepoScanRow] = []
    all_domain_rows: List[TLSScanRow] = []

    for org in orgs:
        org_id = org["id"]
        try:
            repos_resp = await call_service("GET", f"{DB_SERVICE_URL}/organizations/{org_id}/repositories")
            for r in repos_resp.json():
                if r.get("repo_url"):
                    all_repo_rows.append(RepoScanRow(repo_url=r["repo_url"], branch_name=r.get("branch_to_scan", "main")))
        except Exception:
            pass
        try:
            domains_resp = await call_service("GET", f"{DB_SERVICE_URL}/organizations/{org_id}/domains")
            for d in domains_resp.json():
                if d.get("domain"):
                    all_domain_rows.append(TLSScanRow(domain=d["domain"]))
        except Exception:
            pass

    triggered = {}

    if all_repo_rows:
        job_id = str(uuid.uuid4())
        job = BatchScanJob(job_id=job_id, scan_type=ScanType.REPOSITORY, total_items=len(all_repo_rows))
        batch_jobs[job_id] = job
        task = asyncio.create_task(safe_background_task_wrapper(process_repo_batch, job_id, all_repo_rows))
        running_tasks[job_id] = task
        triggered["repo_scan_job_id"] = job_id
        logger.info(f"Master scan: triggered repo job {job_id} for {len(all_repo_rows)} repos")

    if all_domain_rows:
        job_id = str(uuid.uuid4())
        job = BatchScanJob(job_id=job_id, scan_type=ScanType.TLS, total_items=len(all_domain_rows))
        batch_jobs[job_id] = job
        task = asyncio.create_task(safe_background_task_wrapper(process_tls_batch, job_id, all_domain_rows))
        running_tasks[job_id] = task
        triggered["tls_scan_job_id"] = job_id
        logger.info(f"Master scan: triggered TLS job {job_id} for {len(all_domain_rows)} domains")

    return {
        "message": "Master scan triggered",
        "total_organizations": len(orgs),
        "total_repos": len(all_repo_rows),
        "total_domains": len(all_domain_rows),
        "triggered_scans": triggered,
    }


@app.post("/api/selected-scan", summary="Trigger scan for a user-selected set of repos and domains")
async def selected_scan(payload: SelectedScanPayload):
    """Trigger scans only for the repos and domains explicitly provided."""
    triggered = {}

    repo_rows = [
        RepoScanRow(repo_url=r["repo_url"], branch_name=r.get("branch_name", "main"))
        for r in (payload.repos or []) if r.get("repo_url")
    ]
    if repo_rows:
        job_id = str(uuid.uuid4())
        job = BatchScanJob(job_id=job_id, scan_type=ScanType.REPOSITORY, total_items=len(repo_rows))
        batch_jobs[job_id] = job
        task = asyncio.create_task(safe_background_task_wrapper(process_repo_batch, job_id, repo_rows))
        running_tasks[job_id] = task
        triggered["repo_scan_job_id"] = job_id

    domain_rows = [TLSScanRow(domain=d) for d in (payload.domains or []) if d]
    if domain_rows:
        job_id = str(uuid.uuid4())
        job = BatchScanJob(job_id=job_id, scan_type=ScanType.TLS, total_items=len(domain_rows))
        batch_jobs[job_id] = job
        task = asyncio.create_task(safe_background_task_wrapper(process_tls_batch, job_id, domain_rows))
        running_tasks[job_id] = task
        triggered["tls_scan_job_id"] = job_id

    if not triggered and not (payload.agent_ids or []):
        raise APIError(status_code=400, error_code="nothing_selected",
                       message="No repos, domains or agents were provided to scan")

    # Trigger asset scans via system-scan service
    triggered_agents = []
    failed_agents = []
    for agent_id in (payload.agent_ids or []):
        try:
            resp = await call_service("POST", f"{SYSTEM_SCAN_URL}/api/v1/admin/trigger-scan/{agent_id}")
            triggered_agents.append(agent_id)
            logger.info(f"Selected scan: triggered asset scan for agent {agent_id}")
        except Exception as e:
            failed_agents.append(agent_id)
            logger.warning(f"Selected scan: failed to trigger scan for agent {agent_id}: {e}")

    return {
        "message": "Selected scan triggered",
        "total_repos": len(repo_rows),
        "total_domains": len(domain_rows),
        "total_agents": len(triggered_agents),
        "failed_agents": len(failed_agents),
        "triggered_scans": triggered,
    }


@app.post("/api/repo-scan/batch",
          summary="Batch repository scan from Excel",
          description="""
          Upload Excel file with columns:
          - repo_url (required): Git repository URL
          - branch_name (optional): Branch to scan (default: main)
          """)


@app.post("/api/onboarding",
          summary="Onboard organization via JSON payload",
          description="""
          Accepts JSON payload with organization, repositories, servers and domains.
          This will create DB records and trigger repository/domain scans in background.
          """)
async def api_onboarding(
    background_tasks: BackgroundTasks,
    payload: OnboardingPayload
):
    """Create organization and related resources, then trigger scans"""
    # 1) Create organization in DB
    try:
        org_resp = await call_service("POST", f"{DB_SERVICE_URL}/organizations", json=payload.organization.model_dump())
        org_data = org_resp.json()
        org_id = org_data['id']
        logger.info(f"Created organization {org_id} in DB")
    except Exception as e:
        logger.exception(f"Failed to create organization in DB: {e}")
        raise APIError(status_code=500, error_code="org_create_failed", message=str(e))

    # 2) Create bulk repositories
    created_repos = []
    if payload.repositories:
        try:
            repos_payload = [r.model_dump() for r in payload.repositories]
            repo_resp = await call_service("POST", f"{DB_SERVICE_URL}/organizations/{org_id}/repositories/bulk", json=repos_payload)
            created_repos = repo_resp.json()
            logger.info(f"Created {len(created_repos)} repositories for org {org_id}")
        except Exception as e:
            logger.exception(f"Failed to create repositories: {e}")

    # 3) Create bulk servers
    created_servers = []
    all_servers_for_agent_registration = []  # Collect all servers for agent registration
    if payload.servers:
        try:
            servers_payload = [s.model_dump() for s in payload.servers]
            svr_resp = await call_service("POST", f"{DB_SERVICE_URL}/organizations/{org_id}/servers/bulk", json=servers_payload)
            created_servers = svr_resp.json()
            # Add organization name for agent registration
            servers_for_agents = [{**s.model_dump(), "organization_name": payload.organization.organization_name} for s in payload.servers]
            all_servers_for_agent_registration.extend(servers_for_agents)
            logger.info(f"Created {len(created_servers)} servers for org {org_id}")
        except Exception as e:
            logger.exception(f"Failed to create servers: {e}")

    # 4) Create bulk domains
    created_domains = []
    if payload.domains:
        try:
            domains_payload = [d.model_dump() for d in payload.domains]
            dom_resp = await call_service("POST", f"{DB_SERVICE_URL}/organizations/{org_id}/domains/bulk", json=domains_payload)
            created_domains = dom_resp.json()
            logger.info(f"Created {len(created_domains)} domains for org {org_id}")
        except Exception as e:
            logger.exception(f"Failed to create domains: {e}")

    # 4b) Create suborganizations and applications (hierarchical payload)
    created_suborgs = []
    created_apps = []
    if payload.suborganizations:
        for so in payload.suborganizations:
            try:
                suborg_payload = {"suborganization_name": so.suborganization_name}
                suborg_resp = await call_service("POST", f"{DB_SERVICE_URL}/organizations/{org_id}/suborganizations", json=suborg_payload)
                suborg_data = suborg_resp.json()
                suborg_id = suborg_data['id']
                created_suborgs.append(suborg_data)
                logger.info(f"Created suborganization {suborg_id} for org {org_id}")

                # For each application, create app and then bulk create resources under it
                for app_payload in so.applications or []:
                    app_create = {"application_name": app_payload.application_name}
                    app_resp = await call_service("POST", f"{DB_SERVICE_URL}/suborganizations/{suborg_id}/applications", json=app_create)
                    app_data = app_resp.json()
                    app_id = app_data['id']
                    created_apps.append(app_data)
                    logger.info(f"Created application {app_id} under suborg {suborg_id}")

                    # Prepare and POST repositories for this app
                    if app_payload.repositories:
                        repos_payload = []
                        for r in app_payload.repositories:
                            rd = {**r.model_dump(), "organization_id": org_id, "suborganization_id": suborg_id, "application_id": app_id}
                            repos_payload.append(rd)
                        try:
                            repo_resp = await call_service("POST", f"{DB_SERVICE_URL}/organizations/{org_id}/repositories/bulk", json=repos_payload)
                            app_created_repos = repo_resp.json()
                            created_repos.extend(app_created_repos)  # Add to scan trigger list
                            logger.info(f"Created {len(repos_payload)} repositories for app {app_id}")
                        except Exception as e:
                            logger.exception(f"Failed to create app repositories for app {app_id}: {e}")

                    # Servers
                    if app_payload.servers:
                        servers_db_payload = []  # For db-service (clean, no extra fields)
                        servers_agent_payload = []  # For agent registration (with org names)
                        for s in app_payload.servers:
                            # Clean payload for db-service
                            sd_db = {
                                **s.model_dump(), 
                                "organization_id": org_id, 
                                "suborganization_id": suborg_id, 
                                "application_id": app_id
                            }
                            servers_db_payload.append(sd_db)
                            
                            # Full payload for agent registration (includes names)
                            sd_agent = {
                                **s.model_dump(),
                                "organization_id": org_id, 
                                "suborganization_id": suborg_id, 
                                "application_id": app_id,
                                "organization_name": payload.organization.organization_name,
                                "suborganization_name": so.suborganization_name,
                                "application_name": app_payload.application_name
                            }
                            servers_agent_payload.append(sd_agent)
                        try:
                            svr_resp = await call_service("POST", f"{DB_SERVICE_URL}/organizations/{org_id}/servers/bulk", json=servers_db_payload)
                            all_servers_for_agent_registration.extend(servers_agent_payload)  # Add to agent registration list
                            logger.info(f"Created {len(servers_db_payload)} servers for app {app_id}")
                        except Exception as e:
                            logger.exception(f"Failed to create app servers for app {app_id}: {e}")

                    # Domains
                    if app_payload.domains:
                        domains_payload = []
                        for d in app_payload.domains:
                            dd = {**d.model_dump(), "organization_id": org_id, "suborganization_id": suborg_id, "application_id": app_id}
                            domains_payload.append(dd)
                        try:
                            dom_resp = await call_service("POST", f"{DB_SERVICE_URL}/organizations/{org_id}/domains/bulk", json=domains_payload)
                            app_created_domains = dom_resp.json()
                            created_domains.extend(app_created_domains)  # Add to scan trigger list
                            logger.info(f"Created {len(domains_payload)} domains for app {app_id}")
                        except Exception as e:
                            logger.exception(f"Failed to create app domains for app {app_id}: {e}")

            except Exception as e:
                logger.exception(f"Failed to create suborganization or apps: {e}")

    # 5) Record onboarding job
    try:
        job = {
            "organization_id": org_id,
            "job_type": "csv_or_api_onboarding",
            "status": "queued",
            "rows_processed": len(created_repos) + len(created_servers) + len(created_domains),
            "created_by": payload.created_by
        }
        job_resp = await call_service("POST", f"{DB_SERVICE_URL}/onboarding/jobs", json=job)
        job_data = job_resp.json()
        logger.info(f"Onboarding job recorded: {job_data.get('id')}")
    except Exception as e:
        logger.exception(f"Failed to record onboarding job: {e}")

    # 6) Trigger scans in background
    repo_scan_rows = [RepoScanRow(repo_url=r['repo_url'], branch_name=r.get('branch_to_scan', 'main')) for r in created_repos]
    domain_rows = [TLSScanRow(domain=d['domain']) for d in created_domains]

    triggered_scans = {}

    if repo_scan_rows and payload.trigger_scans:
        scan_job_id = str(uuid.uuid4())
        # Create BatchScanJob and add to batch_jobs dictionary
        job = BatchScanJob(
            job_id=scan_job_id,
            scan_type=ScanType.REPOSITORY,
            total_items=len(repo_scan_rows)
        )
        batch_jobs[scan_job_id] = job
        
        # Create scan job entry in DB
        try:
            await call_service("POST", f"{DB_SERVICE_URL}/organizations/{org_id}/scan-jobs", json={"target_type": "repo", "scan_type": "repository", "target_id": None})
        except Exception:
            logger.warning("Failed to create scan_job record in DB (non-blocking)")
        
        # Run repo batch in its own task so TLS batch can run concurrently
        try:
            repo_task = asyncio.create_task(safe_background_task_wrapper(process_repo_batch, scan_job_id, repo_scan_rows))
            running_tasks[scan_job_id] = repo_task
            repo_task.add_done_callback(lambda t, job_id=scan_job_id: logger.error(f"Background repo task {job_id} failed: {t.exception()}") if t.exception() else logger.info(f"Background repo task {job_id} completed"))
            triggered_scans['repo_scan_job_id'] = scan_job_id
            logger.info(f"Triggered repository scan job {scan_job_id} for {len(repo_scan_rows)} repositories")
        except Exception as e:
            logger.exception(f"Failed to schedule repository scan job {scan_job_id}: {e}")

    if domain_rows and payload.trigger_scans:
        scan_job_id = str(uuid.uuid4())
        # Create BatchScanJob and add to batch_jobs dictionary
        job = BatchScanJob(
            job_id=scan_job_id,
            scan_type=ScanType.TLS,
            total_items=len(domain_rows)
        )
        batch_jobs[scan_job_id] = job
        
        try:
            await call_service("POST", f"{DB_SERVICE_URL}/organizations/{org_id}/scan-jobs", json={"target_type": "domain", "scan_type": "tls", "target_id": None})
        except Exception:
            logger.warning("Failed to create scan_job record in DB (non-blocking)")
        
        # Run TLS batch concurrently (do not queue behind repo batch)
        try:
            tls_task = asyncio.create_task(safe_background_task_wrapper(process_tls_batch, scan_job_id, domain_rows))
            running_tasks[scan_job_id] = tls_task
            tls_task.add_done_callback(lambda t, job_id=scan_job_id: logger.error(f"Background TLS task {job_id} failed: {t.exception()}") if t.exception() else logger.info(f"Background TLS task {job_id} completed"))
            triggered_scans['domain_scan_job_id'] = scan_job_id
            logger.info(f"Triggered TLS/domain scan job {scan_job_id} for {len(domain_rows)} domains")
        except Exception as e:
            logger.exception(f"Failed to schedule TLS/domain scan job {scan_job_id}: {e}")

    # 6b) Register servers as agents in system-scan service (for Crypto Inventory)
    registered_agents = []
    if all_servers_for_agent_registration:
        try:
            logger.info(f"Registering {len(all_servers_for_agent_registration)} servers as agents for Crypto Inventory...")
            # Pass organization context for tracking
            org_context = {
                "organization_name": payload.organization.organization_name
            }
            registered_agents = await register_servers_as_agents(all_servers_for_agent_registration, org_context)
            successful_registrations = sum(1 for r in registered_agents if isinstance(r, dict) and r.get("success"))
            logger.info(f"Successfully registered {successful_registrations}/{len(all_servers_for_agent_registration)} servers as agents")
        except Exception as e:
            logger.exception(f"Failed to register servers as agents (non-blocking): {e}")

    # 7) Create onboarding batch tracking record
    onboarding_batch_id = None
    try:
        onboarding_batch_data = {
            "organization_id": org_id,
            "organization_name": payload.organization.organization_name,
            "created_by": payload.created_by,
            "repo_scan_job_id": triggered_scans.get('repo_scan_job_id'),
            "tls_scan_batch_id": triggered_scans.get('domain_scan_job_id'),
            "total_repos": len(created_repos),
            "total_domains": len(created_domains),
            "total_servers": len(created_servers)
        }
        batch_resp = await call_service("POST", f"{DB_SERVICE_URL}/onboarding-batches", json=onboarding_batch_data)
        batch_data = batch_resp.json()
        onboarding_batch_id = batch_data.get('id')
        logger.info(f"Created onboarding batch tracking record {onboarding_batch_id}")
    except Exception as e:
        logger.exception(f"Failed to create onboarding batch record (non-blocking): {e}")

    return {
        "organization_id": org_id,
        "org": org_data,
        "onboarding_batch_id": onboarding_batch_id,
        "created_repositories": len(created_repos),
        "created_servers": len(created_servers),
        "created_domains": len(created_domains),
        "registered_agents": len([r for r in registered_agents if isinstance(r, dict) and r.get("success")]),
        "onboarding_job": job_data if 'job_data' in locals() else None,
        "triggered_scans": triggered_scans,
        "message": "Onboarding accepted; scans queued (if any). Servers registered as agents in Crypto Inventory."
    }


@app.post("/api/onboarding/upload-csv",
          summary="Upload onboarding CSVs (repositories, servers, domains)")
async def onboarding_upload_csv(
    background_tasks: BackgroundTasks,
    repositories_file: Optional[UploadFile] = File(None, description="repositories.csv"),
    servers_file: Optional[UploadFile] = File(None, description="servers.csv"),
    domains_file: Optional[UploadFile] = File(None, description="domains.csv"),
    organization_name: Optional[str] = None,
    created_by: Optional[str] = None
):
    """Accepts multiple CSV files (repos, servers, domains) and creates DB records."""
    # Simple CSV parser using pandas
    org_payload = None
    if organization_name:
        org_payload = {"organization_name": organization_name}

    repos = []
    if repositories_file:
        try:
            content = await repositories_file.read()
            df = pd.read_csv(io.BytesIO(content))
            df.columns = df.columns.str.lower().str.strip()
            for _, row in df.iterrows():
                if pd.notna(row.get('repo_url')):
                    repos.append({
                        'repo_url': str(row['repo_url']).strip(),
                        'branch_to_scan': str(row.get('branch_name', 'main')).strip()
                    })
        except Exception as e:
            logger.exception(f"Failed to parse repositories CSV: {e}")
            raise APIError(status_code=400, error_code="invalid_repositories_csv", message=str(e))

    servers = []
    if servers_file:
        try:
            content = await servers_file.read()
            df = pd.read_csv(io.BytesIO(content))
            df.columns = df.columns.str.lower().str.strip()
            for _, row in df.iterrows():
                if pd.notna(row.get('ip_address')) or pd.notna(row.get('hostname')):
                    servers.append({
                        'server_name': row.get('server_name'),
                        'operating_system': row.get('operating_system'),
                        'hostname': row.get('hostname'),
                        'ip_address': row.get('ip_address'),
                        'mac_address': row.get('mac_address')
                    })
        except Exception as e:
            logger.exception(f"Failed to parse servers CSV: {e}")
            raise APIError(status_code=400, error_code="invalid_servers_csv", message=str(e))

    domains = []
    if domains_file:
        try:
            content = await domains_file.read()
            df = pd.read_csv(io.BytesIO(content))
            df.columns = df.columns.str.lower().str.strip()
            for _, row in df.iterrows():
                if pd.notna(row.get('domain')):
                    domains.append({'domain': str(row['domain']).strip()})
        except Exception as e:
            logger.exception(f"Failed to parse domains CSV: {e}")
            raise APIError(status_code=400, error_code="invalid_domains_csv", message=str(e))

    # Build payload
    payload = {
        'organization': org_payload or { 'organization_name': organization_name or 'Unnamed Org' },
        'repositories': repos,
        'servers': servers,
        'domains': domains,
        'created_by': created_by
    }

    # Reuse the JSON onboarding flow by calling the JSON endpoint internally
    # Simpler to call the API endpoint via call_service
    try:
        # Call the JSON onboarding flow directly (avoid extra HTTP hop)
        payload_model = OnboardingPayload.parse_obj(payload)
        return await api_onboarding(background_tasks, payload_model)
    except APIError:
        raise
    except Exception as e:
        logger.exception(f"Failed to process onboarding payload: {e}")
        raise APIError(status_code=500, error_code="onboarding_failed", message=str(e))

async def batch_repo_scan(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="Excel file (.xlsx or .xls)")
):
    """
    Batch scan multiple repositories from Excel file.
    
    Excel Structure:
    | repo_url                              | branch_name |
    |---------------------------------------|-------------|
    | https://github.com/user/repo1        | main        |
    | https://github.com/user/repo2        | develop     |
    """
    
    # Validate file type
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise APIError(status_code=400, error_code="invalid_file_type", message="Only Excel files (.xlsx, .xls) are supported")
    
    try:
        # Read Excel file
        content = await file.read()
        
        # Try reading with openpyxl engine explicitly for .xlsx
        df = pd.read_excel(io.BytesIO(content), engine='openpyxl' if file.filename.endswith('.xlsx') else None)
        
        # Validate required columns (case-insensitive)
        df.columns = df.columns.str.lower().str.strip()
        
        if 'repo_url' not in df.columns:
            raise APIError(
                status_code=400,
                error_code="missing_column",
                message=f"Excel file must contain 'repo_url' column. Found columns: {df.columns.tolist()}"
            )
        
        # Fill optional columns with defaults
        if 'branch_name' not in df.columns:
            df['branch_name'] = 'main'
        else:
            # Ensure branch_name column is treated as string to avoid issues with NaN
            df['branch_name'] = df['branch_name'].astype(str)
        
        # Convert to list of RepoScanRow objects
        repositories = []
        for idx, row in df.iterrows():
            if pd.notna(row['repo_url']):
                repo_url_value = str(row['repo_url']).strip()
                branch_value = str(row.get('branch_name', 'main')).strip()
                if branch_value.lower() in ['nan', 'nat', '']:
                    branch_value = 'main'
                
                if repo_url_value:  # Skip empty strings
                    repositories.append(RepoScanRow(repo_url=repo_url_value, branch_name=branch_value))
        
        if not repositories:
            raise APIError(status_code=400, error_code="no_repositories_found", message="No valid repositories found in Excel file")
        
        # Create batch job
        job_id = str(uuid.uuid4())
        job = BatchScanJob(
            job_id=job_id,
            scan_type=ScanType.REPOSITORY,
            total_items=len(repositories)
        )
        batch_jobs[job_id] = job
        
        # Start background processing
        background_tasks.add_task(process_repo_batch, job_id, repositories)
        
        return {
            "job_id": job_id,
            "message": f"Batch repository scan started for {len(repositories)} repositories",
            "total_repositories": len(repositories),
            "status": "pending",
            "sse_url": f"/api/batch-jobs/{job_id}/stream",
            "poll_url": f"/api/batch-jobs/{job_id}"
        }
        
    except pd.errors.EmptyDataError:
        raise APIError(status_code=400, error_code="empty_file", message="Excel file is empty")
    except APIError:
        raise
    except Exception as e:
        import traceback
        logger.exception(f"Error processing Excel file: {traceback.format_exc()}") # Full error trace for debugging
        raise APIError(status_code=500, error_code="excel_processing_failed", message=f"Error processing Excel file: {str(e)}")


# ==================== SERVER-SENT EVENTS (SSE) ====================

@app.get("/api/batch-jobs/{job_id}/stream",
         summary="Stream batch job progress via SSE",
         description="Real-time updates for batch scan progress")
async def stream_batch_job_progress(job_id: str):
    """Stream real-time progress updates using Server-Sent Events"""
    if job_id not in batch_jobs:
        raise APIError(status_code=404, error_code="job_not_found", message=f"Job {job_id} not found")
    
    # Create queue for this SSE connection
    queue = asyncio.Queue()
    sse_queues[job_id] = queue
    
    async def event_generator():
        try:
            # Send initial status
            job = batch_jobs[job_id]
            initial_data = {
                "type": "start",
                "data": {
                    "job_id": job_id,
                    "scan_type": job.scan_type,
                    "total": job.total_items,
                    "status": job.status
                }
            }
            yield f"data: {json.dumps(initial_data)}\n\n"
            
            # Stream updates
            while True:
                try:
                    # Wait for next update with timeout
                    update = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(update)}\n\n"
                    
                    # If job is complete, break
                    if update.get("type") == "complete":
                        break
                        
                except asyncio.TimeoutError:
                    # Send keepalive ping
                    yield f": keepalive\n\n"
                    
        except asyncio.CancelledError:
            pass
        finally:
            # Clean up queue
            if job_id in sse_queues:
                del sse_queues[job_id]
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ==================== JOB STATUS & RESULTS ====================

@app.get("/api/batch-jobs/{job_id}",
         summary="Get batch job status",
         description="Get current status and simplified results")
async def get_batch_job_status(job_id: str):
    """Get the status of a batch scan job"""
    if job_id not in batch_jobs:
        raise APIError(status_code=404, error_code="job_not_found", message=f"Job {job_id} not found")
    
    job = batch_jobs[job_id]
    
    return {
        "job_id": job.job_id,
        "scan_type": job.scan_type,
        "status": job.status,
        "total_items": job.total_items,
        "completed_items": job.completed_items,
        "failed_items": job.failed_items,
        "progress_percentage": round((job.completed_items + job.failed_items) / job.total_items * 100, 2) 
                               if job.total_items > 0 else 0,
        "started_at": job.started_at,
        "completed_at": job.completed_at,
        "results": [
            {
                "domain_or_repo": r.domain_or_repo,
                "status": r.status,
                "error": r.error
            }
            for r in job.results
        ] if job.status == ScanStatus.COMPLETED else []
    }


@app.get("/api/batch-jobs/{job_id}/export",
         summary="Export batch job results as Excel",
         description="Download scan results as Excel file with status only")
async def export_batch_job_results(job_id: str):
    """Export batch job results to Excel file"""
    if job_id not in batch_jobs:
        raise APIError(status_code=404, error_code="job_not_found", message=f"Job {job_id} not found")
    
    job = batch_jobs[job_id]
    
    if job.status != ScanStatus.COMPLETED:
        raise APIError(status_code=400, error_code="job_not_completed", message="Job is not completed yet")
    
    # Convert results to simple DataFrame
    results_data = []
    for result in job.results:
        results_data.append({
            'Domain/Repository': result.domain_or_repo,
            'Status': result.status,
            'Error': result.error if result.error else '',
            'Timestamp': result.timestamp.strftime('%Y-%m-%d %H:%M:%S')
        })
    
    df = pd.DataFrame(results_data)
    
    # Create Excel file in memory
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Results')
        
        # Add summary sheet
        summary_data = {
            'Metric': ['Total Items', 'Completed', 'Failed', 'Success Rate'],
            'Value': [
                job.total_items,
                job.completed_items,
                job.failed_items,
                f"{(job.completed_items / job.total_items * 100):.2f}%" if job.total_items > 0 else "0%"
            ]
        }
        summary_df = pd.DataFrame(summary_data)
        summary_df.to_excel(writer, index=False, sheet_name='Summary')
    
    output.seek(0)
    
    filename = f"batch_scan_results_{job_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@app.get("/api/batch-jobs",
         summary="List all batch jobs")
async def list_batch_jobs():
    """List all batch jobs"""
    return [
        {
            "job_id": job.job_id,
            "scan_type": job.scan_type,
            "status": job.status,
            "total_items": job.total_items,
            "completed_items": job.completed_items,
            "failed_items": job.failed_items,
            "started_at": job.started_at,
            "completed_at": job.completed_at
        }
        for job in batch_jobs.values()
    ]


@app.delete("/api/batch-jobs/{job_id}",
            summary="Delete batch job")
async def delete_batch_job(job_id: str):
    """Delete a batch job"""
    if job_id not in batch_jobs:
        raise APIError(status_code=404, error_code="job_not_found", message=f"Job {job_id} not found")
    
    del batch_jobs[job_id]
    if job_id in sse_queues:
        del sse_queues[job_id]
    
    return {"message": "Job deleted successfully"}


# ==================== CSV TEMPLATE & UNIFIED CSV ONBOARDING ====================

CSV_TEMPLATE_HEADER = [
    "organization_name",
    "organization_email",
    "suborganization_name",
    "application_name",
    "repo_url",
    "repo_name",
    "branch_to_scan",
    "domain",
    "hostname",
    "ip_address",
    "operating_system"
]

CSV_TEMPLATE_EXAMPLE_ROWS = [
    ["Acme Corp", "security@acme.com", "Cloud Division", "Web App", "https://github.com/acme/webapp", "webapp", "main", "www.acme.com", "web-server-1", "192.168.1.10", "Linux"],
    ["Acme Corp", "security@acme.com", "Cloud Division", "Web App", "https://github.com/acme/api", "api", "develop", "api.acme.com", "", "", ""],
    ["Acme Corp", "security@acme.com", "Cloud Division", "Mobile App", "", "", "", "mobile.acme.com", "mobile-server-1", "192.168.1.20", "Linux"],
    ["Acme Corp", "security@acme.com", "Enterprise Division", "ERP System", "https://github.com/acme/erp", "erp", "main", "erp.acme.com", "erp-server-1", "192.168.2.10", "Windows"],
]


@app.get("/api/onboarding/csv-template",
         summary="Download CSV template for onboarding",
         description="Returns a CSV template file that can be filled out and uploaded for onboarding.")
async def download_csv_template():
    """Generate and return a CSV template file for onboarding."""
    import csv
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow(CSV_TEMPLATE_HEADER)
    
    # Write example rows
    for row in CSV_TEMPLATE_EXAMPLE_ROWS:
        writer.writerow(row)
    
    # Prepare response
    output.seek(0)
    content = output.getvalue()
    
    return StreamingResponse(
        io.BytesIO(content.encode('utf-8')),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=onboarding_template.csv"
        }
    )


def parse_csv_to_json_payload(df: pd.DataFrame, created_by: Optional[str] = None) -> dict:
    """
    Convert a flat CSV DataFrame to hierarchical JSON payload for onboarding.
    
    CSV columns:
    - organization_name, organization_email
    - suborganization_name, application_name
    - repo_url, repo_name, branch_to_scan
    - domain
    - hostname, ip_address, operating_system
    
    Each row represents one resource (repo, domain, or server) within an app/suborg/org hierarchy.
    """
    # Normalize column names
    df.columns = df.columns.str.lower().str.strip().str.replace(' ', '_')
    
    # Get organization info from first non-null row
    org_name = None
    org_email = None
    for _, row in df.iterrows():
        if pd.notna(row.get('organization_name')):
            org_name = str(row['organization_name']).strip()
            org_email = str(row.get('organization_email', '')).strip() if pd.notna(row.get('organization_email')) else None
            break
    
    if not org_name:
        raise ValueError("organization_name is required in CSV")
    
    # Build hierarchical structure
    # Structure: org -> suborgs -> apps -> (repos, domains, servers)
    suborgs_map = {}  # suborg_name -> {apps: {app_name -> {repos, domains, servers}}}
    
    for _, row in df.iterrows():
        suborg_name = str(row.get('suborganization_name', '')).strip() if pd.notna(row.get('suborganization_name')) else None
        app_name = str(row.get('application_name', '')).strip() if pd.notna(row.get('application_name')) else None
        
        # Skip rows without suborg or app
        if not suborg_name or not app_name:
            continue
        
        # Initialize suborg if not exists
        if suborg_name not in suborgs_map:
            suborgs_map[suborg_name] = {"apps": {}}
        
        # Initialize app if not exists
        if app_name not in suborgs_map[suborg_name]["apps"]:
            suborgs_map[suborg_name]["apps"][app_name] = {
                "repositories": [],
                "domains": [],
                "servers": []
            }
        
        app_data = suborgs_map[suborg_name]["apps"][app_name]
        
        # Add repository if present
        repo_url = str(row.get('repo_url', '')).strip() if pd.notna(row.get('repo_url')) else None
        if repo_url:
            repo_name = str(row.get('repo_name', '')).strip() if pd.notna(row.get('repo_name')) else repo_url.split('/')[-1]
            branch = str(row.get('branch_to_scan', 'main')).strip() if pd.notna(row.get('branch_to_scan')) else 'main'
            # Avoid duplicates
            if not any(r['repo_url'] == repo_url for r in app_data["repositories"]):
                app_data["repositories"].append({
                    "repo_url": repo_url,
                    "repo_name": repo_name,
                    "branch_to_scan": branch
                })
        
        # Add domain if present
        domain = str(row.get('domain', '')).strip() if pd.notna(row.get('domain')) else None
        if domain:
            # Avoid duplicates
            if not any(d['domain'] == domain for d in app_data["domains"]):
                app_data["domains"].append({"domain": domain})
        
        # Add server if present
        hostname = str(row.get('hostname', '')).strip() if pd.notna(row.get('hostname')) else None
        ip_address = str(row.get('ip_address', '')).strip() if pd.notna(row.get('ip_address')) else None
        if hostname or ip_address:
            os_type = str(row.get('operating_system', 'Linux')).strip() if pd.notna(row.get('operating_system')) else 'Linux'
            # Avoid duplicates
            server_key = (hostname, ip_address)
            if not any((s.get('hostname'), s.get('ip_address')) == server_key for s in app_data["servers"]):
                app_data["servers"].append({
                    "hostname": hostname,
                    "ip_address": ip_address,
                    "operating_system": os_type
                })
    
    # Convert to JSON payload format
    suborganizations = []
    for suborg_name, suborg_data in suborgs_map.items():
        applications = []
        for app_name, app_resources in suborg_data["apps"].items():
            applications.append({
                "application_name": app_name,
                "repositories": app_resources["repositories"],
                "domains": app_resources["domains"],
                "servers": app_resources["servers"]
            })
        suborganizations.append({
            "suborganization_name": suborg_name,
            "applications": applications
        })
    
    payload = {
        "organization": {
            "organization_name": org_name,
            "organization_email": org_email
        },
        "suborganizations": suborganizations,
        "created_by": created_by
    }
    
    return payload


@app.post("/api/onboarding/csv",
          summary="Onboard organization via unified CSV file",
          description="""
          Accepts a single CSV file with all organization data in a flat format.
          The CSV is converted to JSON and processed the same way as JSON onboarding.
          
          CSV Columns:
          - organization_name, organization_email (required for at least one row)
          - suborganization_name, application_name (required to group resources)
          - repo_url, repo_name, branch_to_scan (optional - for repositories)
          - domain (optional - for TLS scanning)
          - hostname, ip_address, operating_system (optional - for servers)
          
          Download the template from /api/onboarding/csv-template
          """)
async def onboarding_csv_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="CSV file with organization data"),
    created_by: Optional[str] = None,
    trigger_scans: bool = True
):
    """Process unified CSV file and onboard organization."""
    logger.info(f"Received CSV onboarding upload: {file.filename}")
    
    # Validate file type
    if not file.filename.endswith('.csv'):
        raise APIError(
            status_code=400, 
            error_code="invalid_file_type", 
            message="File must be a CSV file (.csv)"
        )
    
    try:
        # Read and parse CSV
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        if df.empty:
            raise APIError(
                status_code=400, 
                error_code="empty_csv", 
                message="CSV file is empty"
            )
        
        logger.info(f"Parsed CSV with {len(df)} rows and columns: {list(df.columns)}")
        
        # Convert CSV to JSON payload
        payload_dict = parse_csv_to_json_payload(df, created_by)
        payload_dict['trigger_scans'] = trigger_scans
        
        logger.info(f"Converted CSV to payload: org={payload_dict['organization']['organization_name']}, "
                   f"suborgs={len(payload_dict.get('suborganizations', []))}, trigger_scans={trigger_scans}")
        
        # Parse into Pydantic model
        payload = OnboardingPayload.parse_obj(payload_dict)
        
        # Reuse the JSON onboarding flow
        return await api_onboarding(background_tasks, payload)
        
    except ValueError as e:
        logger.error(f"CSV validation error: {e}")
        raise APIError(status_code=400, error_code="csv_validation_error", message=str(e))
    except pd.errors.EmptyDataError:
        raise APIError(status_code=400, error_code="empty_csv", message="CSV file is empty or invalid")
    except Exception as e:
        logger.exception(f"Failed to process CSV onboarding: {e}")
        raise APIError(status_code=500, error_code="csv_processing_failed", message=str(e))


# ==================== HEALTH CHECK ====================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    logger.info("Health check called")
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "active_jobs": len(batch_jobs),
        "active_sse_connections": len(sse_queues),
        "tls_scanner_url": TLS_SCANNER_URL,
        "repo_scanner_url": REPO_SCANNER_URL
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8008)

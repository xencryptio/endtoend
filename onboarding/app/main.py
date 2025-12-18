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
from datetime import datetime
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

# Add debug logging
logger.info(f"Configuration loaded:")
logger.info(f"   TLS_SCANNER_URL: {TLS_SCANNER_URL}")
logger.info(f"   REPO_SCANNER_URL: {REPO_SCANNER_URL}")
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
    """Scan a single domain using TLS scanner and wait for completion via SSE."""
    logger.info(f"Initiating TLS scan for domain: {domain}")
    try:
        # Use a streaming POST request to the SSE endpoint
        # We need to use httpx.AsyncClient directly to handle streaming
        async with httpx.AsyncClient(timeout=630.0) as client:
            response = await client.post(
                f"{TLS_SCANNER_URL}/scan-with-progress",
                json={
                    "domain": domain,
                    "max_concurrent": 5,
                    "save_to_db": True
                },
                headers={"Accept": "text/event-stream"},
                timeout=630.0  # 10.5 minutes timeout for the entire scan
            )
            response.raise_for_status() # Raise for bad status codes

            # Process SSE stream
            async for line in response.aiter_lines():
                if line.startswith('data:'):
                    try:
                        data_str = line[len('data:'):].strip()
                        event_data = json.loads(data_str)
                        
                        # The 'complete' event signifies the end of the scan
                        if event_data.get('type') == 'complete':
                            # Check the summary to see if this specific domain succeeded
                            summary = event_data.get('summary', {})
                            if summary.get('successful', 0) > 0:
                                logger.info(f"TLS scan completed successfully for {domain}")
                                return ScanResult(
                                    domain_or_repo=domain,
                                    status="completed",
                                    timestamp=datetime.utcnow()
                                )
                            else:
                                # Find the specific error for this domain if available
                                error_msg = "Scan failed for an unknown reason."
                                if event_data.get('all_domains_status'):
                                    domain_status = event_data['all_domains_status'].get(domain)
                                    if domain_status and domain_status.get('error'):
                                        error_msg = domain_status['error']
                                logger.error(f"TLS scan failed for {domain}: {error_msg}")
                                return ScanResult(
                                    domain_or_repo=domain,
                                    status="failed",
                                    error=error_msg,
                                    timestamp=datetime.utcnow()
                                )
                    except json.JSONDecodeError:
                        logger.warning(f"Failed to decode JSON from SSE line: {line}")
                        continue
            
            # If the stream ends without a 'complete' event, it's an unexpected failure
            logger.error(f"TLS scan stream ended unexpectedly for {domain}")
            return ScanResult(
                domain_or_repo=domain,
                status="failed",
                error="Stream ended unexpectedly without a 'complete' event.",
                timestamp=datetime.utcnow()
            )

    except httpx.TimeoutException:
        logger.error(f"TLS scan for {domain} timed out.")
        return ScanResult(
            domain_or_repo=domain,
            status="failed",
            error="Scan timeout (10.5 minutes exceeded)",
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
        logger.exception(f"An unexpected error occurred during TLS scan for {domain}: {e}")
        return ScanResult(
            domain_or_repo=domain,
            status="failed",
            error=f"An unexpected error occurred: {str(e)}",
            timestamp=datetime.utcnow()
        )


async def process_tls_batch(job_id: str, domains: List[TLSScanRow]):
    """Process TLS batch scan in background with SSE updates"""
    job = batch_jobs[job_id]
    job.status = ScanStatus.IN_PROGRESS
    job.started_at = datetime.utcnow()
    
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_SCANS)
    
    async def scan_with_semaphore(row: TLSScanRow):
        async with semaphore:
            result = await scan_single_tls_domain(row.domain)
            
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
    
    tasks = [scan_with_semaphore(row) for row in domains]
    await asyncio.gather(*tasks, return_exceptions=True)
    
    job.status = ScanStatus.COMPLETED
    job.completed_at = datetime.utcnow()
    
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
    job = batch_jobs[job_id]
    job.status = ScanStatus.IN_PROGRESS
    job.started_at = datetime.utcnow()
    
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_SCANS)
    
    async def scan_with_semaphore(row: RepoScanRow):
        async with semaphore:
            result = await scan_single_repository(row.repo_url, row.branch_name)
            
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
    
    tasks = [scan_with_semaphore(row) for row in repositories]
    await asyncio.gather(*tasks, return_exceptions=True)
    
    job.status = ScanStatus.COMPLETED
    job.completed_at = datetime.utcnow()
    
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


@app.post("/api/repo-scan/batch",
          summary="Batch repository scan from Excel",
          description="""
          Upload Excel file with columns:
          - repo_url (required): Git repository URL
          - branch_name (optional): Branch to scan (default: main)
          """)
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

from fastapi import APIRouter, Query, Depends, HTTPException
from typing import Optional, List, Dict, Any
import logging
from sqlalchemy.orm import Session
from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta
import math
import os

# Database connection - assuming get_db is available from the main db-service application
from database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/applications", tags=["applications"])

# Auxiliary database URLs (should be in environment variables)
REPO_SCANNER_DB_URL = os.getenv(
    "REPO_SCANNER_DB_URL",
    "postgresql://scanuser:scanpass@postgres:5432/repo_scanner_db"
)
SYSTEM_SCANNER_DB_URL = os.getenv(
    "SYSTEM_SCANNER_DB_URL",
    "postgresql://scanuser:scanpass@postgres:5432/system_scanner_db"
)


# ============================================================================
# NORMALIZATION FUNCTIONS
# ============================================================================

def normalize_repo_url(url: str) -> str:
    """
    Normalize repository URLs for cross-database matching.
    
    Examples:
        https://github.com/org/repo.git → https://github.com/org/repo
        git@github.com:org/repo.git → https://github.com/org/repo
        HTTPS://GITHUB.COM/ORG/REPO → https://github.com/org/repo
    """
    if not url:
        return ""
    
    # Remove .git suffix
    url = url.rstrip('.git')
    
    # Convert SSH to HTTPS
    if url.startswith('git@'):
        url = url.replace('git@', 'https://').replace(':', '/', 1)
    
    # Lowercase and strip
    url = url.lower().strip().rstrip('/')
    
    return url


def normalize_hostname(hostname: str) -> str:
    """
    Normalize server hostnames for cross-database matching.
    
    Examples:
        SERVER.EXAMPLE.COM → server.example.com
        server.example.com:8080 → server.example.com
        192.168.1.10 → 192.168.1.10
    """
    if not hostname:
        return ""
    
    # Remove port
    hostname = hostname.split(':')[0]
    
    # Lowercase and strip
    hostname = hostname.lower().strip()
    
    return hostname


# ============================================================================
# AUXILIARY DATABASE FETCH FUNCTIONS
# ============================================================================

def fetch_repo_metrics() -> Dict[str, Dict[str, Any]]:
    """
    Fetch repository metrics from repo_scanner_db.
    Returns dictionary keyed by normalized repo_url.
    """
    logger.info("Fetching repository metrics from repo_scanner_db")
    repo_scanner_engine = create_engine(REPO_SCANNER_DB_URL)
    repo_session = sessionmaker(bind=repo_scanner_engine)()
    
    try:
        query = text("""
            WITH latest_repos AS (
                SELECT DISTINCT ON (repo_url)
                    id,
                    repo_url,
                    overall_security_score,
                    quantum_safe_count,
                    quantum_vulnerable_count
                FROM repositories
                WHERE scan_status = 'completed'
                ORDER BY repo_url, id DESC
            )
            SELECT
                lr.repo_url,
                lr.overall_security_score,
                lr.quantum_safe_count,
                lr.quantum_vulnerable_count,
                COUNT(DISTINCT sr.algorithm) AS total_algorithms,
                COUNT(DISTINCT CASE WHEN sr.quantum_safe = false THEN sr.algorithm END) AS vulnerable_algorithms,
                ARRAY_AGG(DISTINCT sr.algorithm) FILTER (WHERE sr.algorithm IS NOT NULL) AS algorithms
            FROM latest_repos lr
            LEFT JOIN scan_results sr ON lr.id = sr.repo_id
            GROUP BY lr.repo_url, lr.overall_security_score, lr.quantum_safe_count, lr.quantum_vulnerable_count
        """)
        
        results = repo_session.execute(query).fetchall()
        
        # Return as dictionary keyed by normalized URL
        metrics_dict = {}
        for row in results:
            normalized_url = normalize_repo_url(row.repo_url)
            metrics_dict[normalized_url] = {
                'security_score': row.overall_security_score or 0,
                'quantum_safe_count': row.quantum_safe_count or 0,
                'quantum_vulnerable_count': row.quantum_vulnerable_count or 0,
                'total_algorithms': row.total_algorithms or 0,
                'vulnerable_algorithms': row.vulnerable_algorithms or 0,
                'algorithms': row.algorithms or []
            }
        
        logger.info(f"Fetched metrics for {len(metrics_dict)} repositories")
        return metrics_dict
        
    except Exception as e:
        logger.error(f"Error fetching repo metrics: {e}")
        return {}
        
    finally:
        repo_session.close()
        repo_scanner_engine.dispose()


def fetch_system_metrics() -> Dict[str, Dict[str, Any]]:
    """
    Fetch system/agent metrics from system_scanner_db.
    Returns dictionary keyed by normalized hostname.
    """
    logger.info("Fetching system metrics from system_scanner_db")
    system_scanner_engine = create_engine(SYSTEM_SCANNER_DB_URL)
    system_session = sessionmaker(bind=system_scanner_engine)()
    
    try:
        query = text("""
            WITH latest_results AS (
                SELECT DISTINCT ON (agent_id)
                    agent_id,
                    audit_results
                FROM results
                ORDER BY agent_id, submitted_at DESC
            )
            SELECT
                a.hostname,
                lr.audit_results,
                a.agent_id
            FROM agents a
            LEFT JOIN latest_results lr ON a.agent_id = lr.agent_id
        """)
        
        results = system_session.execute(query).fetchall()
        
        # Return as dictionary keyed by normalized hostname
        metrics_dict = {}
        for row in results:
            normalized_hostname = normalize_hostname(row.hostname)
            
            # Parse audit_results JSON to extract vulnerability count
            vulnerability_count = 0
            if row.audit_results:
                # Assuming audit_results contains vulnerability information
                # Adjust based on actual JSON structure
                vulnerability_count = len(row.audit_results.get('vulnerabilities', []))
            
            metrics_dict[normalized_hostname] = {
                'vulnerability_count': vulnerability_count,
                'audit_results': row.audit_results
            }
        
        logger.info(f"Fetched metrics for {len(metrics_dict)} systems")
        return metrics_dict
        
    except Exception as e:
        logger.error(f"Error fetching system metrics: {e}")
        return {}
        
    finally:
        system_session.close()
        system_scanner_engine.dispose()


# ============================================================================
# CALCULATION FUNCTIONS
# ============================================================================

def calculate_quarter(date: datetime) -> str:
    """
    Calculate quarter notation from date.
    Example: 2026-08-09 → "Q3 2026"
    """
    quarter = (date.month - 1) // 3 + 1
    return f"Q{quarter} {date.year}"


def fetch_domain_aggregations(db: Session, app_id: str) -> Dict[str, Any]:
    """
    Fetch all domain-related aggregations from scandb.
    """
    logger.info(f"Fetching domain aggregations for app: {app_id}")
    
    # Certificate counts and PQC scores
    query = text("""
        WITH latest_scans AS (
            SELECT DISTINCT ON (sr.url)
                sr.url,
                sr.cert_serial_number,
                sr.cert_is_pqc,
                sr.pqc_overall_score,
                sr.pqc_overall_grade,
                sr.kex_grade,
                sr.cert_pqc_grade,
                sr.primary_signature_algorithm,
                sr.primary_hash_algorithm,
                sr.public_key_algorithm,
                sr.supported_protocols
            FROM scan_results sr
            WHERE sr.scan_status = 'completed'
            ORDER BY sr.url, sr.completed_at DESC
        )
        SELECT
            COUNT(DISTINCT ls.cert_serial_number) AS total_certificates,
            COUNT(DISTINCT CASE WHEN ls.cert_is_pqc = false THEN ls.cert_serial_number END) AS vulnerable_certificates,
            AVG(ls.pqc_overall_score) AS avg_pqc_score,
            SUM(
                CASE WHEN ls.pqc_overall_grade IN ('F', 'D') THEN 1 ELSE 0 END +
                CASE WHEN ls.kex_grade IN ('F', 'D') THEN 1 ELSE 0 END +
                CASE WHEN ls.cert_pqc_grade IN ('F', 'D') OR ls.cert_is_pqc = false THEN 1 ELSE 0 END
            ) AS domain_vulnerabilities,
            ARRAY_AGG(DISTINCT ls.primary_signature_algorithm) FILTER (WHERE ls.primary_signature_algorithm IS NOT NULL) AS sig_algorithms,
            ARRAY_AGG(DISTINCT ls.primary_hash_algorithm) FILTER (WHERE ls.primary_hash_algorithm IS NOT NULL) AS hash_algorithms,
            ARRAY_AGG(DISTINCT ls.public_key_algorithm) FILTER (WHERE ls.public_key_algorithm IS NOT NULL) AS pubkey_algorithms,
            STRING_AGG(DISTINCT ls.supported_protocols, ',') AS protocols
        FROM domains d
        LEFT JOIN latest_scans ls ON LOWER(ls.url) LIKE '%' || LOWER(d.domain) || '%'
        WHERE d.application_id = :app_id
    """)
    
    result = db.execute(query, {"app_id": app_id}).fetchone()
    
    # Parse protocols
    protocols = []
    if result.protocols:
        protocols = [p.strip() for p in result.protocols.split(',') if p.strip()]
    
    # Combine all domain algorithms
    domain_algorithms = set()
    if result.sig_algorithms:
        domain_algorithms.update(result.sig_algorithms)
    if result.hash_algorithms:
        domain_algorithms.update(result.hash_algorithms)
    if result.pubkey_algorithms:
        domain_algorithms.update(result.pubkey_algorithms)
    domain_algorithms.update(protocols)
    
    return {
        'total_certificates': result.total_certificates or 0,
        'vulnerable_certificates': result.vulnerable_certificates or 0,
        'avg_pqc_score': float(result.avg_pqc_score or 0),
        'domain_vulnerabilities': int(result.domain_vulnerabilities or 0),
        'domain_algorithms': list(domain_algorithms)
    }


def merge_repo_aggregations(db: Session, repo_metrics: Dict[str, Dict], app_id: str) -> Dict[str, Any]:
    """
    Merge repository data from scandb with pre-fetched repo_metrics.
    """
    logger.info(f"Merging repo aggregations for app: {app_id}")
    
    # Get repo URLs from scandb
    repo_query = text("SELECT repo_url FROM repositories WHERE application_id = :app_id")
    repo_urls = db.execute(repo_query, {"app_id": app_id}).fetchall()
    
    total_algorithms = 0
    vulnerable_algorithms = 0
    repo_scores = []
    all_algorithms = set()
    
    for row in repo_urls:
        normalized_url = normalize_repo_url(row.repo_url)
        if normalized_url in repo_metrics:
            metrics = repo_metrics[normalized_url]
            total_algorithms += metrics.get('total_algorithms', 0)
            vulnerable_algorithms += metrics.get('vulnerable_algorithms', 0)
            repo_scores.append(metrics.get('security_score', 0))
            
            # Add algorithms
            repo_algs = metrics.get('algorithms', [])
            if repo_algs:
                all_algorithms.update(repo_algs)
    
    avg_repo_score = sum(repo_scores) / len(repo_scores) if repo_scores else 0
    
    # Calculate repo vulnerabilities
    repo_vulnerabilities = 0
    for score in repo_scores:
        if score < 60:
            repo_vulnerabilities += 2
    
    for row in repo_urls:
        normalized_url = normalize_repo_url(row.repo_url)
        if normalized_url in repo_metrics:
            if repo_metrics[normalized_url].get('quantum_vulnerable_count', 0) > 0:
                repo_vulnerabilities += 1
    
    return {
        'total_algorithms': total_algorithms,
        'vulnerable_algorithms': vulnerable_algorithms,
        'avg_repo_score': avg_repo_score,
        'repo_vulnerabilities': repo_vulnerabilities,
        'repo_algorithms': list(all_algorithms)
    }


def merge_system_aggregations(db: Session, system_metrics: Dict[str, Dict], app_id: str) -> Dict[str, Any]:
    """
    Merge system/server data from scandb with pre-fetched system_metrics.
    """
    logger.info(f"Merging system aggregations for app: {app_id}")
    
    # Get server hostnames from scandb
    server_query = text("SELECT hostname FROM servers WHERE application_id = :app_id")
    hostnames = db.execute(server_query, {"app_id": app_id}).fetchall()
    
    system_vulnerabilities = 0
    
    for row in hostnames:
        normalized_hostname = normalize_hostname(row.hostname)
        if normalized_hostname in system_metrics:
            sys_data = system_metrics[normalized_hostname]
            system_vulnerabilities += sys_data.get('vulnerability_count', 0)
    
    return {
        'system_vulnerabilities': system_vulnerabilities
    }


def calculate_pqc_ready(domain_data: Dict, repo_data: Dict) -> float:
    """
    Calculate PQC readiness as weighted average of domain and repo scores.
    """
    avg_domain_score = domain_data.get('avg_pqc_score', 0)
    avg_repo_score = repo_data.get('avg_repo_score', 0)
    
    pqc_ready = (avg_domain_score * 0.5 + avg_repo_score * 0.5)
    return round(pqc_ready, 1)


def calculate_risk_level(pqc_ready: float) -> str:
    """
    Calculate risk level based on PQC readiness score.
    """
    if pqc_ready >= 80:
        return "Low"
    elif pqc_ready >= 60:
        return "Medium"
    elif pqc_ready >= 40:
        return "High"
    else:
        return "Very High"


def calculate_vulnerabilities(domain_data: Dict, repo_data: Dict) -> int:
    """
    Calculate total vulnerabilities from domain and repo data.
    """
    domain_vulns = domain_data.get('domain_vulnerabilities', 0)
    repo_vulns = repo_data.get('repo_vulnerabilities', 0)
    
    total_vulns = int(math.ceil(domain_vulns + repo_vulns))
    return min(total_vulns, 10)  # Cap at 10


def calculate_time_complexity(pqc_ready: float, vulnerabilities: int) -> str:
    """
    Calculate migration time complexity.
    """
    if pqc_ready >= 75 and vulnerabilities <= 2:
        return "Low"
    elif vulnerabilities >= 4 or pqc_ready < 33:
        return "High"
    else:
        return "Medium"


def fetch_algorithms_used(domain_data: Dict, repo_data: Dict) -> List[str]:
    """
    Combine and return sorted list of all algorithms used.
    """
    all_algorithms = set()
    
    # Add domain algorithms
    all_algorithms.update(domain_data.get('domain_algorithms', []))
    
    # Add repo algorithms
    all_algorithms.update(repo_data.get('repo_algorithms', []))
    
    # Remove None/empty values
    all_algorithms.discard(None)
    all_algorithms.discard('')
    
    return sorted(list(all_algorithms))


# ============================================================================
# MAIN apps ENDPOINT
# ============================================================================

@router.get("/apps")
def get_full_apps(
    organization_id: Optional[str] = Query(None),
    suborganization_id: Optional[str] = Query(None),
    application_id: Optional[str] = Query(None),
    limit: int = Query(100),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get complete apps view with data from all three databases.
    
    Returns application data with:
    - Organizational hierarchy
    - PQC readiness metrics
    - Algorithm/certificate counts
    - Vulnerability assessments
    - Migration timeline data
    """
    logger.info(f"Building full apps view for org: {organization_id}, suborg: {suborganization_id}, app: {application_id}")
    
    try:
        # Step 1: Fetch auxiliary database data (separate connections)
        repo_metrics = fetch_repo_metrics()
        system_metrics = fetch_system_metrics()
        
        # Step 2: Base application query (using injected scandb session)
        base_query = """
            SELECT 
                o.organization_name AS organisation,
                o.id AS org_id,
                s.suborganization_name AS sub_org,
                s.id AS sub_org_id,
                a.application_name AS application,
                a.id AS application_id,
                a.metadata_json->>'category' AS app_category
            FROM applications a
            INNER JOIN suborganizations s ON a.suborganization_id = s.id
            INNER JOIN organizations o ON s.organization_id = o.id
            WHERE 1=1
        """
        
        params = {}
        
        if application_id:
            base_query += " AND a.id = :app_id"
            params["app_id"] = application_id
        elif suborganization_id:
            base_query += " AND s.id = :suborg_id"
            params["suborg_id"] = suborganization_id
        elif organization_id:
            base_query += " AND o.id = :org_id"
            params["org_id"] = organization_id
        
        base_query += " LIMIT :limit_val"
        params["limit_val"] = limit
        
        all_applications = db.execute(text(base_query), params).fetchall()
        
        # Step 3: For each application, aggregate cross-database data
        response_data = []
        
        for app_row in all_applications:
            app_id = str(app_row.application_id)
            
            # Domain aggregations (scandb)
            domain_data = fetch_domain_aggregations(db, app_id)
            
            # Repository aggregations (merge with repo_metrics)
            repo_data = merge_repo_aggregations(db, repo_metrics, app_id)
            
            # System aggregations (merge with system_metrics)
            system_data = merge_system_aggregations(db, system_metrics, app_id)
            
            # Calculate derived metrics
            pqc_ready = calculate_pqc_ready(domain_data, repo_data)
            risk_level = calculate_risk_level(pqc_ready)
            vulnerabilities = calculate_vulnerabilities(domain_data, repo_data)
            time_complexity = calculate_time_complexity(pqc_ready, vulnerabilities)
            
            # Current date and migration quarter
            current_date = datetime.now().strftime("%m-%d-%Y")
            migration_date = datetime.now() + timedelta(days=180)
            migration_quarter = calculate_quarter(migration_date)
            
            # Fetch algorithms used
            algorithms_used = fetch_algorithms_used(domain_data, repo_data)
            
            # Build response object
            app_response = {
                "Organisation": app_row.organisation,
                "Org ID": str(app_row.org_id),
                "Sub Org": app_row.sub_org,
                "Sub Org ID": str(app_row.sub_org_id),
                "Org Target Migration Data": migration_quarter,
                "application": app_row.application,
                "Application ID": str(app_row.application_id),
                "status": migration_quarter,
                "alg_changes": 0,
                "cert_changes": 0,
                "pqc_ready": pqc_ready,
                "risk_level": risk_level,
                "total_algorithms": repo_data['total_algorithms'],
                "total_certificates": domain_data['total_certificates'],
                "total_pqc_vulnerable_certificates": domain_data['vulnerable_certificates'],
                "total_pqc_vulnerable_algorithms": repo_data['vulnerable_algorithms'],
                "vulnerabilities": vulnerabilities,
                "time_complexity": time_complexity,
                "current_date": current_date,
                "App Category": app_row.app_category or "",
                "algorithms_used": algorithms_used
            }
            
            response_data.append(app_response)
        
        logger.info(f"Successfully built apps with {len(response_data)} applications")
        return response_data
        
    except Exception as e:
        logger.error(f"Error building apps: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error building apps: {str(e)}")


# ============================================================================
# LEGACY ENDPOINTS (maintained for backward compatibility)
# ============================================================================

@router.get("/with-hierarchy")
def get_applications_with_hierarchy(
    organization_id: Optional[str] = Query(None),
    suborganization_id: Optional[str] = Query(None),
    limit: int = Query(100),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    Get applications with full organizational hierarchy.
    Returns: [{application, suborganization, organization}]
    """
    logger.info(f"Fetching applications with hierarchy for org: {organization_id}, suborg: {suborganization_id}")
    query = """
        SELECT
            a.id as app_id,
            a.application_name,
            a.metadata_json,
            so.id as suborg_id,
            so.suborganization_name,
            o.id as org_id,
            o.organization_name
        FROM applications a
        INNER JOIN suborganizations so ON a.suborganization_id = so.id
        INNER JOIN organizations o ON so.organization_id = o.id
    """
    
    conditions = []
    params = {}
    
    if organization_id:
        conditions.append("o.id = :org_id")
        params["org_id"] = organization_id
    
    if suborganization_id:
        conditions.append("so.id = :suborg_id")
        params["suborg_id"] = suborganization_id
    
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    
    query += " LIMIT :limit_val"
    params["limit_val"] = limit
    
    rows = db.execute(text(query), params).fetchall()
    
    results = []
    for row in rows:
        results.append({
            "application": {
                "id": str(row.app_id),
                "application_name": row.application_name,
                "metadata_json": row.metadata_json
            },
            "suborganization": {
                "id": str(row.suborg_id),
                "suborganization_name": row.suborganization_name
            },
            "organization": {
                "id": str(row.org_id),
                "organization_name": row.organization_name
            }
        })
    
    return results


@router.get("/repositories")
def get_repositories(
    application_id: Optional[str] = Query(None),
    suborganization_id: Optional[str] = Query(None),
    organization_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """Get repositories filtered by organizational hierarchy"""
    logger.info(f"Fetching repositories for app: {application_id}, suborg: {suborganization_id}, org: {organization_id}")
    query = "SELECT * FROM repositories WHERE 1=1"
    params = {}
    
    if application_id:
        query += " AND application_id = :app_id"
        params["app_id"] = application_id
    elif suborganization_id:
        query += " AND suborganization_id = :suborg_id"
        params["suborg_id"] = suborganization_id
    elif organization_id:
        query += " AND organization_id = :org_id"
        params["org_id"] = organization_id
    
    rows = db.execute(text(query), params).fetchall()
    return [dict(row._mapping) for row in rows]


@router.get("/domains")
def get_domains(
    application_id: Optional[str] = Query(None),
    suborganization_id: Optional[str] = Query(None),
    organization_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """Get domains filtered by organizational hierarchy"""
    logger.info(f"Fetching domains for app: {application_id}, suborg: {suborganization_id}, org: {organization_id}")
    query = "SELECT * FROM domains WHERE 1=1"
    params = {}
    
    if application_id:
        query += " AND application_id = :app_id"
        params["app_id"] = application_id
    elif suborganization_id:
        query += " AND suborganization_id = :suborg_id"
        params["suborg_id"] = suborganization_id
    elif organization_id:
        query += " AND organization_id = :org_id"
        params["org_id"] = organization_id
    
    rows = db.execute(text(query), params).fetchall()
    return [dict(row._mapping) for row in rows]


@router.get("/repo-scans/latest")
def get_latest_repo_scan(repo_url: str, db: Session = Depends(get_db)) -> Optional[Dict[str, Any]]:
    """
    Get latest repository scan from repo_scanner_db.
    Match via normalized repo_url.
    """
    logger.info(f"Fetching latest repo scan for URL: {repo_url}")
    
    # Fetch from repo_scanner_db
    repo_scanner_engine = create_engine(REPO_SCANNER_DB_URL)
    repo_session = sessionmaker(bind=repo_scanner_engine)()
    
    try:
        normalized_url = normalize_repo_url(repo_url)
        
        query = text("""
            SELECT
                r.id,
                r.quantum_safe_count,
                r.quantum_vulnerable_count,
                r.overall_security_score
            FROM repositories r
            WHERE LOWER(TRIM(r.repo_url)) = LOWER(TRIM(:repo_url))
            ORDER BY r.id DESC
            LIMIT 1
        """)
        
        row = repo_session.execute(query, {"repo_url": normalized_url}).fetchone()
        return dict(row._mapping) if row else None
        
    finally:
        repo_session.close()
        repo_scanner_engine.dispose()


@router.get("/repo-scans/algorithms")
def get_repo_algorithms(repo_url: str, db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """
    Get algorithm list from repo_scanner_db.scan_results.
    """
    logger.info(f"Fetching repo algorithms for URL: {repo_url}")
    
    # Fetch from repo_scanner_db
    repo_scanner_engine = create_engine(REPO_SCANNER_DB_URL)
    repo_session = sessionmaker(bind=repo_scanner_engine)()
    
    try:
        normalized_url = normalize_repo_url(repo_url)
        
        query = text("""
            SELECT DISTINCT sr.algorithm
            FROM scan_results sr
            INNER JOIN repositories r ON sr.repo_id = r.id
            WHERE LOWER(TRIM(r.repo_url)) = LOWER(TRIM(:repo_url))
        """)
        
        rows = repo_session.execute(query, {"repo_url": normalized_url}).fetchall()
        return [{"algorithm": row.algorithm} for row in rows]
        
    finally:
        repo_session.close()
        repo_scanner_engine.dispose()


@router.get("/repo-scans/category-scores")
def get_category_scores(repo_url: str, db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """Get category scores for a repository"""
    logger.info(f"Fetching category scores for URL: {repo_url}")
    
    # Fetch from repo_scanner_db
    repo_scanner_engine = create_engine(REPO_SCANNER_DB_URL)
    repo_session = sessionmaker(bind=repo_scanner_engine)()
    
    try:
        normalized_url = normalize_repo_url(repo_url)
        
        query = text("""
            SELECT cs.category_type, cs.score, cs.grade
            FROM category_scores cs
            INNER JOIN repositories r ON cs.repo_id = r.id
            WHERE LOWER(TRIM(r.repo_url)) = LOWER(TRIM(:repo_url))
        """)
        
        rows = repo_session.execute(query, {"repo_url": normalized_url}).fetchall()
        return [dict(row._mapping) for row in rows]
        
    finally:
        repo_session.close()
        repo_scanner_engine.dispose()
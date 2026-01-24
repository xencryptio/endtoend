import logging
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from datetime import datetime

from dashboard.data_access.scandb import fetch_dashboard_raw_data
from dashboard.data_access.repo_scanner_db import fetch_repo_metrics
from dashboard.data_access.system_scanner_db import fetch_system_metrics
from dashboard.data_access._utils import normalize_repo_url
from dashboard.risk_engine.scoring import (
    calculate_combined_pqc_score, 
    get_time_complexity, 
    get_migration_status,
    determine_app_category
)
# from ..schemas import DashboardApplication # Uncomment when needed

log = logging.getLogger(__name__)

def build_application_view(app_id: str, db: Session) -> Dict[str, Any]:
    """
    Builds the dashboard view for a given application.
    This orchestrates fetching data, calculating scores, and structuring the response.
    """
    log.info(f"Building application dashboard view for App ID: {app_id}")

    # 1. Fetch all necessary raw data
    all_raw_app_data = fetch_dashboard_raw_data(db)
    repo_metrics = fetch_repo_metrics()
    system_metrics = fetch_system_metrics()

    # Filter for the specific application
    app_data = next(
        (app_rec for app_rec in all_raw_app_data if app_rec.get("Application_ID") == app_id),
        None
    )

    if not app_data:
        log.warning(f"No data found for application {app_id}")
        return {
            "view": "application",
            "application_id": app_id,
            "message": f"No data found for application {app_id}"
        }

    # Extract common data
    application_name = app_data.get("application", "Unknown Application")

    # Aggregate Repository Algorithms
    app_repo_urls = app_data.get("repo_urls") or []
    
    total_repo_algorithms = 0
    total_vulnerable_repo_algs = 0
    safe_repo_algs = 0
    all_repo_algorithms = []
    vulnerable_repo_algorithms = []
    repo_security_scores = []
    
    for repo_url in app_repo_urls:
        normalized_url = normalize_repo_url(repo_url)
        if normalized_url in repo_metrics:
            metrics = repo_metrics[normalized_url]
            total_repo_algorithms += metrics['total_algorithms']
            total_vulnerable_repo_algs += metrics['vulnerable_algorithms']
            safe_repo_algs += metrics['safe_algorithms']
            all_repo_algorithms.extend(metrics['algorithms_used'])
            vulnerable_repo_algorithms.extend(metrics['vulnerable_list'])
            if metrics['security_score'] > 0:
                repo_security_scores.append(metrics['security_score'])
    
    avg_repo_security = (
        sum(repo_security_scores) / len(repo_security_scores)
        if repo_security_scores else 0.0
    )
    
    # Aggregate System/Server Vulnerabilities
    server_hostnames = app_data.get("server_hostnames") or []
    
    system_vulnerabilities = []
    total_system_vulns = 0
    
    for hostname in server_hostnames:
        matched = False
        if hostname in system_metrics:
            sys_data = system_metrics[hostname]
            matched = True
        else:
            hostname_lower = hostname.lower() if hostname else ''
            for sys_hostname in system_metrics.keys():
                sys_hostname_lower = sys_hostname.lower() if sys_hostname else ''
                if (hostname_lower and sys_hostname_lower and
                    (hostname_lower in sys_hostname_lower or sys_hostname_lower in hostname_lower)):
                    sys_data = system_metrics[sys_hostname]
                    matched = True
                    break
        
        if matched:
            system_vulnerabilities.extend(sys_data['vulnerabilities'])
            total_system_vulns += sys_data['vulnerability_count']
    
    # Combine All Algorithms
    unique_repo_algorithms = list(set(all_repo_algorithms))
    domain_algorithms = (list(app_data.get("cipher_suites") or []) + 
                       list(app_data.get("signature_algorithms") or []) + 
                       list(app_data.get("hash_algorithms") or []))
    
    combined_algorithms = list(set(unique_repo_algorithms + domain_algorithms))
    
    # Calculate Total Vulnerabilities
    cert_vulnerabilities = int(app_data.get("total_pqc_vulnerable_certificates") or 0)
    cipher_vulnerabilities = int(app_data.get("vulnerable_cipher_suites") or 0)
    
    total_vulnerabilities = (
        total_vulnerable_repo_algs +  # From code
        cert_vulnerabilities +         # From TLS certs
        cipher_vulnerabilities +       # From cipher suites
        total_system_vulns            # From system agents
    )

    # Calculate Combined PQC Score and Risk Level
    domain_pqc = float(app_data.get("pqc_ready")) if app_data.get("pqc_ready") is not None else 0.0
    server_count_val = app_data.get("server_count", 0)

    pqc_score_result = calculate_combined_pqc_score(
        domain_pqc,
        avg_repo_security,
        server_count_val,
        total_system_vulns
    )
    combined_pqc_score = pqc_score_result["combined_score"]
    risk_level = pqc_score_result["risk_level"]
    
    # Calculate Time Complexity
    time_complexity = get_time_complexity(total_vulnerabilities)

    # Determine Migration Status
    migration_status = get_migration_status(
        app_data.get("quantum_ready_count", 0),
        app_data.get("total_scans", 0),
        app_data.get("latest_scan_date", datetime.now()),
        app_data.get("completed_jobs", 0),
        app_data.get("total_scan_jobs", 0)
    )

    # Determine App Category
    app_category = determine_app_category(
        app_data.get("server_count", 0), 
        app_data.get("repo_count", 0), 
        bool(app_data.get("domain", None))
    )
    
    # Build the application record
    application_view = {
        "view": "application_detail",
        "Organisation": app_data.get("Organisation", ""),
        "Org ID": app_data.get("Org_ID", ""),
        "Sub Org": app_data.get("Sub_Org", ""),
        "Sub Org ID": app_data.get("Sub_Org_ID", ""),
        "Org Target Migration Data": app_data.get("Org_Target_Migration_Data", "Q4 2026"),
        "application": application_name,
        "Application ID": app_id,
        "pqc_ready": combined_pqc_score,
        "risk_level": risk_level,
        "status": migration_status,
        "alg_changes": total_vulnerable_repo_algs,
        "cert_changes": cert_vulnerabilities,
        "total_algorithms": len(combined_algorithms),
        "total_certificates": int(app_data.get("total_certificates", 0)),
        "total_pqc_vulnerable_algorithms": total_vulnerable_repo_algs,
        "total_pqc_vulnerable_certificates": cert_vulnerabilities,
        "vulnerabilities": total_vulnerabilities,
        "time_complexity": time_complexity,
        "current_date": app_data.get("current_date", datetime.now().strftime('%m-%d-%Y')),
        "App Category": app_category,
        "algorithms_used": combined_algorithms,
        "repo_urls": app_data.get("repo_urls", []),
        "repo_names": app_data.get("repo_names", []),
        "repo_count": app_data.get("repo_count", 0),
        "server_hostnames": app_data.get("server_hostnames", []),
        "server_count": app_data.get("server_count", 0),
        "active_agent_count": app_data.get("active_agent_count", 0)
    }

    log.info(f"Successfully built application view for App ID: {app_id}")
    return application_view

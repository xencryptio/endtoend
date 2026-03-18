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

def build_suborg_view(suborg_id: str, db: Session) -> Dict[str, Any]:
    """
    Builds the dashboard view for a given suborganization.
    This orchestrates fetching data, calculating scores, and structuring the response.
    """
    log.info(f"Building suborganization dashboard view for SubOrg ID: {suborg_id}")

    # 1. Fetch all necessary raw data
    all_raw_app_data = fetch_dashboard_raw_data(db)
    repo_metrics = fetch_repo_metrics()
    system_metrics = fetch_system_metrics()

    # Filter for the specific suborganization
    suborg_applications_data = [
        app_data for app_data in all_raw_app_data 
        if app_data.get("Sub_Org_ID") == suborg_id
    ]

    if not suborg_applications_data:
        log.warning(f"No applications found for suborganization {suborg_id}")
        return {
            "view": "suborganization",
            "suborganization_id": suborg_id,
            "suborganization_name": "",
            "summary": {
                "total_applications": 0,
                "pqc_readiness_percent": 0.0,
                "secure_applications": 0,
                "total_vulnerabilities": 0
            },
            "risk_distribution": {},
            "applications": []
        }

    processed_applications = []
    total_suborg_vulnerabilities = 0
    pqc_scores = []
    risk_distribution_counts = {"Low": 0, "Medium": 0, "High": 0, "Very High": 0, "Unknown": 0}
    secure_apps_count = 0

    for row in suborg_applications_data:
        app_id = row.get("Application_ID")
        application_name = row.get("application", "Unknown Application")

        # Aggregate Repository Algorithms
        app_repo_urls = row.get("repo_urls") or []
        
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
        server_hostnames = row.get("server_hostnames") or []
        
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
        domain_algorithms = (list(row.get("cipher_suites") or []) + 
                           list(row.get("signature_algorithms") or []) + 
                           list(row.get("hash_algorithms") or []))
        
        combined_algorithms = list(set(unique_repo_algorithms + domain_algorithms))
        
        # Calculate Total Vulnerabilities
        cert_vulnerabilities = int(row.get("total_pqc_vulnerable_certificates") or 0)
        cipher_vulnerabilities = int(row.get("vulnerable_cipher_suites") or 0)
        
        total_vulnerabilities = (
            total_vulnerable_repo_algs +  # From code
            cert_vulnerabilities +         # From TLS certs
            cipher_vulnerabilities +       # From cipher suites
            total_system_vulns            # From system agents
        )
        total_suborg_vulnerabilities += total_vulnerabilities

        # Calculate Combined PQC Score and Risk Level
        domain_pqc = float(row.get("pqc_ready")) if row.get("pqc_ready") is not None else 0.0
        server_count_val = row.get("server_count", 0)

        pqc_score_result = calculate_combined_pqc_score(
            domain_pqc,
            avg_repo_security,
            server_count_val,
            total_system_vulns
        )
        combined_pqc_score = pqc_score_result["combined_score"]
        risk_level = pqc_score_result["risk_level"]

        pqc_scores.append(combined_pqc_score)
        if risk_level in risk_distribution_counts:
            risk_distribution_counts[risk_level] += 1
        else:
            risk_distribution_counts["Unknown"] += 1

        if risk_level == "Low":
            secure_apps_count += 1
        
        # Calculate Time Complexity
        time_complexity = get_time_complexity(total_vulnerabilities)

        # Migration Status — use the SQL-computed value which respects manual overrides
        migration_status = row.get("status", "Not Started")

        # Determine App Category
        app_category = determine_app_category(
            row.get("server_count", 0), 
            row.get("repo_count", 0), 
            bool(row.get("domain", None))
        )
        
        # Build individual application record
        app_record = {
            "Organisation": row.get("Organisation", ""),
            "Org ID": row.get("Org_ID", ""),
            "Sub Org": row.get("Sub_Org", ""),
            "Sub Org ID": row.get("Sub_Org_ID", ""),
            "Org Target Migration Data": row.get("Org_Target_Migration_Data", "Q4 2026"),
            "application": application_name,
            "Application ID": app_id,
            "pqc_ready": combined_pqc_score,
            "risk_level": risk_level,
            "status": migration_status,
            "alg_changes": total_vulnerable_repo_algs,
            "cert_changes": cert_vulnerabilities,
            "total_algorithms": len(combined_algorithms),
            "total_certificates": int(row.get("total_certificates", 0)),
            "total_pqc_vulnerable_algorithms": total_vulnerable_repo_algs,
            "total_pqc_vulnerable_certificates": cert_vulnerabilities,
            "vulnerabilities": total_vulnerabilities,
            "time_complexity": time_complexity,
            "current_date": row.get("current_date", datetime.now().strftime('%m-%d-%Y')),
            "App Category": app_category,
            "algorithms_used": combined_algorithms
        }
        processed_applications.append(app_record)

    # Calculate overall suborganization summary
    total_apps_in_suborg = len(processed_applications)
    avg_pqc_readiness = sum(pqc_scores) / total_apps_in_suborg if total_apps_in_suborg > 0 else 0.0

    suborganization_view = {
        "view": "suborganization",
        "suborganization_id": suborg_id,
        "suborganization_name": suborg_applications_data[0].get("Sub_Org", "Unknown SubOrganization"),
        "summary": {
            "total_applications": total_apps_in_suborg,
            "pqc_readiness_percent": round(avg_pqc_readiness, 1),
            "secure_applications": secure_apps_count,
            "total_vulnerabilities": total_suborg_vulnerabilities
        },
        "risk_distribution": risk_distribution_counts,
        "applications": processed_applications
    }

    log.info(f"Successfully built suborganization view for SubOrg ID: {suborg_id}")
    return suborganization_view

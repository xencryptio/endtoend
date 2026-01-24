import logging
from datetime import datetime
from typing import Dict, Any, List

log = logging.getLogger(__name__)

def calculate_migration_quarter(base_date: datetime, months_to_add: int = 6) -> str:
    """
    Calculate target migration quarter
    Format: "Q4 2026"
    """
    if not base_date:
        return "Q4 2026"
    
    # Add months
    month = base_date.month + months_to_add
    year = base_date.year
    
    # Handle year overflow
    while month > 12:
        month -= 12
        year += 1
    
    # Calculate quarter
    quarter = (month - 1) // 3 + 1
    
    return f"Q{quarter} {year}"

def get_risk_level(grade: str) -> str:
    """Map PQC grade to risk level"""
    valid_grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']
    if not grade or grade not in valid_grades:
        return "Very High"
    
    if grade in ['A+', 'A', 'A-']:
        return "Low"
    elif grade in ['B+', 'B', 'B-']:
        return "Medium"
    elif grade in ['C+', 'C', 'C-']:
        return "High"
    else:  # D+, D, D-, F
        return "Very High"

def get_time_complexity(vulnerabilities: int) -> str:
    """Calculate time complexity based on vulnerability count"""
    if vulnerabilities < 5:
        return "Low"
    elif vulnerabilities <= 20:
        return "Medium"
    elif vulnerabilities <= 50:
        return "High"
    else:
        return "Very High"

def get_migration_status(
    quantum_ready_count: int,
    total_scans: int,
    latest_scan_date: datetime,
    completed_jobs: int,
    total_scan_jobs: int
) -> str:
    """Determine migration status"""
    if quantum_ready_count > 0 and quantum_ready_count == total_scans: 
        return f"Q{ (latest_scan_date.month - 1) // 3 + 1 } { latest_scan_date.year }"
    elif completed_jobs > 0:
        return 'In Progress'
    elif total_scan_jobs > 0:
        return 'Planned'
    else:
        return 'Not Started'

def calculate_combined_pqc_score(
    domain_pqc_score: float,
    avg_repo_security_score: float,
    server_count: int,
    total_system_vulnerabilities: int
) -> Dict[str, Any]:
    """
    Calculates a combined PQC score and risk level based on various metrics.
    """
    weights = []
    scores = []

    if domain_pqc_score > 0:
        weights.append(0.4)
        scores.append(domain_pqc_score)

    if avg_repo_security_score > 0:
        weights.append(0.4)
        scores.append(avg_repo_security_score)

    if server_count > 0:
        weights.append(0.2)
        scores.append(max(0, 100 - (total_system_vulnerabilities * 10)))
    elif total_system_vulnerabilities > 0:
        weights.append(0.2)
        scores.append(max(0, 100 - (total_system_vulnerabilities * 10)))

    if weights:
        total_weight = sum(weights)
        combined_pqc_score = sum(s * (w/total_weight) for s, w in zip(scores, weights))
    else:
        # Default if no data at all
        combined_pqc_score = 0.0
    
    if combined_pqc_score >= 90:
        risk_level = "Low"
    elif combined_pqc_score >= 70:
        risk_level = "Medium"
    elif combined_pqc_score >= 50:
        risk_level = "High"
    elif combined_pqc_score > 0:
        risk_level = "Very High"
    else:
        risk_level = "Unknown"
        
    return {
        "combined_score": round(combined_pqc_score, 1),
        "risk_level": risk_level
    }

def determine_app_category(server_count: int, repo_count: int, has_domains: bool) -> str:
    """
    Determines the application category based on server, repository, and domain presence.
    """
    if server_count > 0 and repo_count > 0:
        return 'Hybrid App'
    elif repo_count > 0:
        return 'Application'
    elif server_count > 0:
        return 'Server Infrastructure'
    elif has_domains: # If no servers/repos but has domains, classify as Network Device
        return 'Network Device'
    else:
        return 'Uncategorized'

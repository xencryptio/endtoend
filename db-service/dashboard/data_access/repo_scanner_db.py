import os
import logging
from typing import Dict, Any, List
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from ._utils import normalize_repo_url

log = logging.getLogger(__name__)

def fetch_repo_metrics() -> Dict[str, Any]:
    """
    Fetches detailed algorithm metrics per repository from repo_scanner_db.
    Returns a dictionary where keys are normalized repo URLs and values are their metrics.
    """
    repo_scanner_engine = create_engine(
        os.getenv("REPO_SCANNER_DB_URL", "postgresql://scanuser:scanpass@postgres:5432/repo_scanner_db"),
        pool_pre_ping=True
    )
    repo_session = None
    repo_metrics = {}
    
    try:
        repo_session = sessionmaker(bind=repo_scanner_engine)()
        
        repo_query = text("""
            SELECT 
                r.repo_url,
                r.overall_security_score,
                r.quantum_safe_count,
                r.quantum_vulnerable_count,
                COUNT(DISTINCT sr.algorithm) AS total_unique_algorithms,
                COUNT(DISTINCT CASE 
                    WHEN sr.quantum_safe = FALSE THEN sr.algorithm 
                END) AS vulnerable_algorithms,
                COUNT(DISTINCT CASE 
                    WHEN sr.quantum_safe = TRUE THEN sr.algorithm 
                END) AS safe_algorithms,
                SUM(sr.occurrences) AS total_algorithm_occurrences,
                ARRAY_AGG(DISTINCT sr.algorithm ORDER BY sr.algorithm) 
                    FILTER (WHERE sr.algorithm IS NOT NULL) AS all_algorithms,
                ARRAY_AGG(DISTINCT sr.algorithm ORDER BY sr.algorithm) 
                    FILTER (WHERE sr.quantum_safe = FALSE) AS vulnerable_algorithm_list,
                ARRAY_AGG(DISTINCT sr.category) 
                    FILTER (WHERE sr.category IS NOT NULL) AS categories_used
            FROM repositories r
            LEFT JOIN scan_results sr ON r.id = sr.repo_id
            WHERE r.scan_status = 'completed'
            GROUP BY r.repo_url, r.overall_security_score, r.quantum_safe_count, r.quantum_vulnerable_count
        """)
        
        repo_results = repo_session.execute(repo_query).fetchall()
        
        repo_metrics = {
            normalize_repo_url(row.repo_url): {
                'security_score': float(row.overall_security_score) if row.overall_security_score else 0.0,
                'total_algorithms': int(row.total_unique_algorithms) if row.total_unique_algorithms else 0,
                'vulnerable_algorithms': int(row.vulnerable_algorithms) if row.vulnerable_algorithms else 0,
                'safe_algorithms': int(row.safe_algorithms) if row.safe_algorithms else 0,
                'total_occurrences': int(row.total_algorithm_occurrences) if row.total_algorithm_occurrences else 0,
                'algorithms_used': list(row.all_algorithms) if row.all_algorithms else [],
                'vulnerable_list': list(row.vulnerable_algorithm_list) if row.vulnerable_algorithm_list else [],
                'categories': list(row.categories_used) if row.categories_used else []
            }
            for row in repo_results
        }
        
        log.info(f"✅ Fetched {len(repo_metrics)} repository metrics")
        log.info(f"🔍 Normalized repo URLs from repo_scanner_db: {list(repo_metrics.keys())}")
        
    except Exception as e:
        log.error(f"❌ Error fetching repo scanner data: {e}")
    finally:
        if repo_session:
            repo_session.close()
        repo_scanner_engine.dispose()
            
    return repo_metrics

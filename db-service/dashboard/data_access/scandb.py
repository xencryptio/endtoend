import logging
from typing import Any, Dict, List
from sqlalchemy import text
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

def fetch_dashboard_raw_data(db: Session) -> List[Dict[str, Any]]:
    """
    Fetches raw dashboard data by executing the main SQL query on scandb.
    """
    log.info("🎯 Executing main dashboard data query...")

    query = text("""
        WITH domain_certificates AS (
            SELECT 
                d.application_id,
                d.domain,
                COUNT(DISTINCT sr.cert_serial_number) AS total_certificates,
                
                -- CORRECTED: Count vulnerable certificates properly
                COUNT(DISTINCT CASE 
                    WHEN (sr.cert_is_pqc = FALSE OR sr.cert_is_pqc IS NULL)
                      OR (sr.pqc_quantum_ready = FALSE OR sr.pqc_quantum_ready IS NULL)
                      OR sr.pqc_overall_score < 70
                      OR sr.public_key_size_bits < 2048
                    THEN sr.cert_serial_number 
                END) AS vulnerable_certificates,
                
                -- Count unique vulnerable domains (for cert_changes)
                COUNT(DISTINCT CASE 
                    WHEN (sr.cert_is_pqc = FALSE OR sr.cert_is_pqc IS NULL)
                      OR (sr.pqc_quantum_ready = FALSE)
                      OR sr.pqc_overall_score < 70
                    THEN sr.url 
                END) AS domains_needing_cert_changes,
                
                -- Aggregate cipher suites and algorithms
                ARRAY_AGG(DISTINCT sr.primary_cipher_suite ORDER BY sr.primary_cipher_suite) 
                    FILTER (WHERE sr.primary_cipher_suite IS NOT NULL) AS cipher_suites,
                ARRAY_AGG(DISTINCT sr.primary_signature_algorithm ORDER BY sr.primary_signature_algorithm) 
                    FILTER (WHERE sr.primary_signature_algorithm IS NOT NULL) AS signature_algorithms,
                ARRAY_AGG(DISTINCT sr.primary_hash_algorithm ORDER BY sr.primary_hash_algorithm) 
                    FILTER (WHERE sr.primary_hash_algorithm IS NOT NULL) AS hash_algorithms,
                
                -- Count vulnerable cipher suites
                COUNT(DISTINCT CASE
                    WHEN sr.primary_cipher_suite LIKE '%3DES%' 
                      OR sr.primary_cipher_suite LIKE '%DES%'
                      OR sr.primary_cipher_suite LIKE '%RC4%'
                      OR sr.primary_cipher_suite LIKE '%MD5%'
                    THEN sr.primary_cipher_suite
                END) AS vulnerable_cipher_count,
                
                -- Aggregate security features
                BOOL_AND(sr.hsts_enabled) AS all_hsts_enabled,
                BOOL_AND(sr.ct_present) AS all_ct_present,
                AVG(sr.kex_score) AS avg_kex_score
                
            FROM domains d
                                    LEFT JOIN scan_results sr ON (
                                        LOWER(sr.url) LIKE '%' || LOWER(d.domain) || '%'
                                    )
                                        WHERE d.application_id IS NOT NULL
            GROUP BY d.application_id, d.domain
        ),
        
        aggregated_domain_data AS (
            SELECT 
                application_id,
                SUM(total_certificates) AS total_certificates,
                SUM(vulnerable_certificates) AS total_vulnerable_certs,
                SUM(domains_needing_cert_changes) AS cert_changes,
                SUM(vulnerable_cipher_count) AS total_vulnerable_ciphers,
                ARRAY_AGG(DISTINCT elem ORDER BY elem) AS all_cipher_suites,
                ARRAY_AGG(DISTINCT elem ORDER BY elem) AS all_sig_algorithms,
                ARRAY_AGG(DISTINCT elem ORDER BY elem) AS all_hash_algorithms,
                BOOL_AND(all_hsts_enabled) AS hsts_fully_enabled,
                BOOL_AND(all_ct_present) AS ct_fully_present,
                AVG(avg_kex_score) AS overall_kex_score
            FROM domain_certificates,
                 LATERAL unnest(cipher_suites) AS elem
            GROUP BY application_id
        ),
        
        pqc_metrics AS (
            SELECT 
                d.application_id,
                AVG(sr.pqc_overall_score) AS avg_pqc_score,
                MIN(sr.pqc_overall_score) AS min_pqc_score,
                MAX(sr.pqc_overall_score) AS max_pqc_score,
                MODE() WITHIN GROUP (ORDER BY sr.pqc_overall_grade) AS most_common_grade,
                
                -- CORRECTED: Check if ANY scan is quantum ready (not just boolean OR)
                COUNT(CASE WHEN sr.pqc_quantum_ready = TRUE THEN 1 END) AS quantum_ready_count,
                COUNT(*) AS total_scans,
                
                MAX(sr.completed_at) AS latest_scan_date,
                MIN(sr.completed_at) AS first_scan_date
            FROM domains d
                        LEFT JOIN scan_results sr ON (
                            sr.url LIKE '%' || d.domain || '%'
                            OR d.domain LIKE '%' || sr.url || '%'
                            OR REPLACE(sr.url, 'https://', '') LIKE d.domain || '%'
                            OR REPLACE(sr.url, 'http://', '') LIKE d.domain || '%'
                            OR REPLACE(REPLACE(sr.url, 'https://www.', ''), 'http://www.', '') LIKE d.domain || '%'
                            OR sr.url LIKE '%' || REPLACE(d.domain, 'www.', '') || '%'
                            OR REPLACE(d.domain, 'www.', '') LIKE '%' || sr.url || '%'
                        )                WHERE d.application_id IS NOT NULL 
              AND sr.pqc_overall_score IS NOT NULL
              AND LOWER(sr.scan_status) = 'completed'
            GROUP BY d.application_id
        ),
        
        scan_status AS (
            SELECT 
                application_id, 
                MAX(status) AS status,
                COUNT(*) AS total_scan_jobs,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_jobs
            FROM scan_jobs
            WHERE application_id IS NOT NULL
            GROUP BY application_id
        ),
        
        repo_urls AS (
            SELECT 
                application_id,
                ARRAY_AGG(repo_url ORDER BY repo_url) AS repo_urls,
                ARRAY_AGG(repo_name ORDER BY repo_name) AS repo_names,
                COUNT(*) AS repo_count
            FROM repositories
            WHERE application_id IS NOT NULL
            GROUP BY application_id
        ),
        
        server_data AS (
            SELECT 
                application_id,
                COUNT(*) AS server_count,
                COUNT(CASE WHEN agent_status = 'active' THEN 1 END) AS active_agents,
                ARRAY_AGG(hostname ORDER BY hostname) AS server_hostnames,
                ARRAY_AGG(ip_address ORDER BY hostname) AS server_ips
            FROM servers
            WHERE application_id IS NOT NULL
            GROUP BY application_id
        )
        
        SELECT 
            o.organization_name AS "Organisation",
            o.id AS "Org_ID",
            o.industry AS "Industry",
            s.suborganization_name AS "Sub_Org",
            s.id AS "Sub_Org_ID",
            
            -- Target migration quarter calculation
            CASE 
                WHEN o.onboarding_date IS NOT NULL THEN
                    'Q' || CEIL(EXTRACT(MONTH FROM o.onboarding_date + INTERVAL '6 months') / 3.0) || 
                    ' ' || EXTRACT(YEAR FROM o.onboarding_date + INTERVAL '6 months')
                WHEN o.created_at IS NOT NULL THEN
                    'Q' || CEIL(EXTRACT(MONTH FROM o.created_at + INTERVAL '6 months') / 3.0) || 
                    ' ' || EXTRACT(YEAR FROM o.created_at + INTERVAL '6 months')
                ELSE 'Q4 2026'
            END AS "Org_Target_Migration_Data",
            
            a.application_name AS "application",
            a.id AS "Application_ID",
            
            -- PQC Readiness Score
            ROUND(COALESCE(pm.avg_pqc_score, 0)::NUMERIC, 1) AS "pqc_ready",
            COALESCE(pm.min_pqc_score, 0) AS "min_pqc_score",
            COALESCE(pm.max_pqc_score, 0) AS "max_pqc_score",
            
            -- CORRECTED Risk Level Calculation
            CASE 
                WHEN pm.avg_pqc_score >= 90 THEN 'Low'
                WHEN pm.avg_pqc_score >= 70 THEN 'Medium'
                WHEN pm.avg_pqc_score >= 50 THEN 'High'
                WHEN pm.avg_pqc_score IS NOT NULL THEN 'Very High'
                ELSE 'Unknown'
            END AS "risk_level",
            
            -- Migration Status (manual override takes priority)
            COALESCE(a.migration_status, 
                CASE
                    WHEN pm.quantum_ready_count > 0 AND pm.quantum_ready_count = pm.total_scans THEN 
                        'Q' || CEIL(EXTRACT(MONTH FROM pm.latest_scan_date) / 3.0) || 
                        ' ' || EXTRACT(YEAR FROM pm.latest_scan_date)
                    WHEN ss.completed_jobs > 0 THEN 'In Progress'
                    WHEN ss.total_scan_jobs > 0 THEN 'Planned'
                    ELSE 'Not Started'
                END
            ) AS "status",
            
            -- Certificate and Domain Metrics
            COALESCE(add.cert_changes, 0) AS "cert_changes",
            COALESCE(add.total_certificates, 0) AS "total_certificates",
            COALESCE(add.total_vulnerable_certs, 0) AS "total_pqc_vulnerable_certificates",
            COALESCE(add.total_vulnerable_ciphers, 0) AS "vulnerable_cipher_suites",
            
            -- Security Features
            COALESCE(add.hsts_fully_enabled, FALSE) AS "hsts_enabled",
            COALESCE(add.ct_fully_present, FALSE) AS "certificate_transparency",
            ROUND(COALESCE(add.overall_kex_score, 0)::NUMERIC, 1) AS "kex_score",
            
            -- Scan Metadata
            TO_CHAR(COALESCE(pm.latest_scan_date, NOW()), 'MM-DD-YYYY') AS "current_date",
            TO_CHAR(COALESCE(pm.first_scan_date, NOW()), 'MM-DD-YYYY') AS "first_scan_date",
            COALESCE(pm.total_scans, 0) AS "total_scans_completed",
            
            -- Application Category (CORRECTED logic)
            CASE
                WHEN sd.server_count > 0 AND ru.repo_count > 0 THEN 'Hybrid App'
                WHEN ru.repo_count > 0 THEN 'Application'
                WHEN sd.server_count > 0 THEN 'Server Infrastructure'
                WHEN EXISTS (SELECT 1 FROM domains dom WHERE dom.application_id = a.id) THEN 'Network Device'
                ELSE 'Uncategorized'
            END AS "App_Category",
            
            -- Aggregated Arrays
            COALESCE(add.all_cipher_suites, ARRAY[]::VARCHAR[]) AS "cipher_suites",
            COALESCE(add.all_sig_algorithms, ARRAY[]::VARCHAR[]) AS "signature_algorithms",
            COALESCE(add.all_hash_algorithms, ARRAY[]::VARCHAR[]) AS "hash_algorithms",
            
            -- Repository and Server Data
            ru.repo_urls,
            ru.repo_names,
            COALESCE(ru.repo_count, 0) AS "repo_count",
            sd.server_hostnames,
            COALESCE(sd.server_count, 0) AS "server_count",
            COALESCE(sd.active_agents, 0) AS "active_agent_count",
            
            -- Domain scan coverage
            (SELECT COUNT(*) FROM domains dom WHERE dom.application_id = a.id) AS "domain_count",
            COALESCE(pm.total_scans, 0) AS "domains_scanned",
            
            -- Server IP addresses for agent matching
            sd.server_ips
            
        FROM applications a
        INNER JOIN suborganizations s ON a.suborganization_id = s.id
        INNER JOIN organizations o ON s.organization_id = o.id
        LEFT JOIN aggregated_domain_data add ON add.application_id = a.id
        LEFT JOIN pqc_metrics pm ON pm.application_id = a.id
        LEFT JOIN scan_status ss ON ss.application_id = a.id
        LEFT JOIN repo_urls ru ON ru.application_id = a.id
        LEFT JOIN server_data sd ON sd.application_id = a.id
        ORDER BY o.organization_name, s.suborganization_name, a.application_name;
    """)
    
    try:
        result = db.execute(query)
        rows = result.fetchall()
        
        # Convert Row objects to dictionaries
        records = []
        for row in rows:
            records.append(dict(row._mapping))
        
        log.info(f"✅ Fetched {len(records)} raw dashboard records from scandb")
        return records
    except Exception as e:
        log.exception("❌ Error fetching raw dashboard data")
        raise

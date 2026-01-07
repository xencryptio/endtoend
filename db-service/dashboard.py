"""
CSV Export Service - Export all database tables to CSV format
Handles data from scandb, repo_scanner_db, and system_scanner_db
"""

import csv
import io
import logging
import json
import os
from typing import List, Dict, Any
from datetime import datetime
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, Session

log = logging.getLogger(__name__)

def normalize_repo_url(url: str) -> str:
    """Normalize repository URL for matching"""
    if not url:
        return ""
    url = url.lower().strip()
    url = url.rstrip('/')
    url = url.replace('.git', '')
    return url


class DatabaseCSVExporter:
    """Export database tables to CSV format"""
    
    def __init__(self):
        # Fix spaces in URLs
        self.databases = {
            'scandb': os.getenv("DATABASE_URL", "postgresql://scanuser:scanpass@postgres:5432/scandb"),
            'repo_scanner_db': os.getenv("REPO_SCANNER_DB_URL", "postgresql://scanuser:scanpass@postgres:5432/repo_scanner_db"),
            'system_scanner_db': os.getenv("SYSTEM_SCANNER_DB_URL", "postgresql://scanuser:scanpass@postgres:5432/system_scanner_db")
        }
        self.engines = {}
        self.sessions = {}
        
        # Initialize connections
        for db_name, db_url in self.databases.items():
            try:
                engine = create_engine(db_url, pool_pre_ping=True)
                self.engines[db_name] = engine
                self.sessions[db_name] = sessionmaker(bind=engine)
                log.info(f"✅ Connected to {db_name}")
            except Exception as e:
                log.error(f"❌ Failed to connect to {db_name}: {e}")
    
    def get_table_names(self, db_name: str) -> List[str]:
        """Get all table names from a database"""
        try:
            engine = self.engines.get(db_name)
            if not engine:
                return []
            
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            log.info(f"Found {len(tables)} tables in {db_name}")
            return tables
        except Exception as e:
            log.error(f"Error getting tables from {db_name}: {e}")
            return []
    
    def get_table_data(self, db_name: str, table_name: str) -> List[Dict[str, Any]]:
        """Fetch all data from a table"""
        try:
            # Validate table name against whitelist
            valid_tables = self.get_table_names(db_name)
            if table_name not in valid_tables:
                log.error(f"❌ Invalid table name request: {table_name}")
                return []

            session_maker = self.sessions.get(db_name)
            if not session_maker:
                return []
            
            session = session_maker()
            try:
                # Use text() for raw SQL queries - table name is now validated
                query = text(f"SELECT * FROM {table_name}")
                result = session.execute(query)
                
                # Get column names
                columns = result.keys()
                
                # Fetch all rows
                rows = result.fetchall()
                
                # Convert to list of dicts
                data = []
                for row in rows:
                    row_dict = {}
                    for i, col in enumerate(columns):
                        value = row[i]
                        # Convert datetime objects to ISO format
                        if isinstance(value, datetime):
                            value = value.isoformat()
                        # Convert None to empty string for CSV
                        elif value is None:
                            value = ''
                        # Convert dict/list to string
                        elif isinstance(value, (dict, list)):
                            value = str(value)
                        row_dict[col] = value
                    data.append(row_dict)
                
                log.info(f"✅ Exported {len(data)} rows from {db_name}.{table_name}")
                return data
            finally:
                session.close()
        except Exception as e:
            log.error(f"❌ Error exporting {db_name}.{table_name}: {e}")
            return []
    
    def export_table_to_csv(self, db_name: str, table_name: str) -> str:
        """Export a single table to CSV string"""
        data = self.get_table_data(db_name, table_name)
        
        if not data:
            return ""
        
        # Create CSV in memory
        output = io.StringIO()
        
        # Get column names from first row
        fieldnames = list(data[0].keys())
        
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)
        
        csv_content = output.getvalue()
        output.close()
        
        return csv_content
    
    def export_all_tables(self) -> Dict[str, Dict[str, str]]:
        """
        Export all tables from all databases
        Returns: {
            'scandb': {'table1': 'csv_content', 'table2': 'csv_content'},
            'repo_scanner_db': {...},
            'system_scanner_db': {...}
        }
        """
        all_exports = {}
        
        for db_name in self.databases.keys():
            log.info(f"📦 Exporting database: {db_name}")
            db_exports = {}
            
            tables = self.get_table_names(db_name)
            
            for table_name in tables:
                csv_content = self.export_table_to_csv(db_name, table_name)
                if csv_content:
                    db_exports[table_name] = csv_content
            
            all_exports[db_name] = db_exports
            log.info(f"✅ Exported {len(db_exports)} tables from {db_name}")
        
        return all_exports
    
    def get_export_summary(self) -> Dict[str, Any]:
        """Get summary of what will be exported"""
        summary = {
            "timestamp": datetime.now().isoformat(),
            "databases": {}
        }
        
        for db_name in self.databases.keys():
            tables = self.get_table_names(db_name)
            table_info = {}
            
            for table_name in tables:
                data = self.get_table_data(db_name, table_name)
                table_info[table_name] = {
                    "row_count": len(data),
                    "columns": list(data[0].keys()) if data else []
                }
            
            summary["databases"][db_name] = {
                "table_count": len(tables),
                "tables": table_info
            }
        
        return summary
    
    def get_complete_export_with_summary(self) -> Dict[str, Any]:
        """
        Get complete export with both summary and actual data
        Returns: {
            "summary": {...},
            "data": {
                "scandb": {
                    "organizations": [
                        {"id": "...", "name": "..."},
                        ...
                    ]
                }
            }
        }
        """
        result = {
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "databases": {}
            },
            "data": {}
        }
        
        for db_name in self.databases.keys():
            log.info(f"📦 Exporting complete data from: {db_name}")
            
            tables = self.get_table_names(db_name)
            
            # Initialize database sections
            result["summary"]["databases"][db_name] = {
                "table_count": len(tables),
                "tables": {}
            }
            result["data"][db_name] = {}
            
            total_rows = 0
            
            for table_name in tables:
                # Get actual data
                table_data = self.get_table_data(db_name, table_name)
                
                # Add to summary
                result["summary"]["databases"][db_name]["tables"][table_name] = {
                    "row_count": len(table_data),
                    "columns": list(table_data[0].keys()) if table_data else [],
                    "has_data": len(table_data) > 0
                }
                
                # Add actual data
                result["data"][db_name][table_name] = table_data
                
                total_rows += len(table_data)
                
                log.info(f"  ✅ {table_name}: {len(table_data)} rows")
            
            # Add totals to summary
            result["summary"]["databases"][db_name]["total_rows"] = total_rows
            
            log.info(f"✅ Completed {db_name}: {len(tables)} tables, {total_rows} total rows")
        
        # Add overall totals
        result["summary"]["total_databases"] = len(self.databases)
        result["summary"]["total_tables"] = sum(
            db_info["table_count"] 
            for db_info in result["summary"]["databases"].values()
        )
        result["summary"]["total_rows"] = sum(
            db_info["total_rows"] 
            for db_info in result["summary"]["databases"].values()
        )
        
        return result


# Singleton instance
dashboarder = DatabaseCSVExporter()


class DashboardService:
    """Service to generate dashboard data from multiple databases"""
    
    def __init__(self):
        self.valid_grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']
    
    def calculate_migration_quarter(self, base_date: datetime, months_to_add: int = 6) -> str:
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
    
    def get_risk_level(self, grade: str) -> str:
        """Map PQC grade to risk level"""
        if not grade or grade not in self.valid_grades:
            return "Very High"
        
        if grade in ['A+', 'A', 'A-']:
            return "Low"
        elif grade in ['B+', 'B', 'B-']:
            return "Medium"
        elif grade in ['C+', 'C', 'C-']:
            return "High"
        else:  # D+, D, D-, F
            return "Very High"
    
    def get_time_complexity(self, vulnerabilities: int) -> str:
        """Calculate time complexity based on vulnerability count"""
        if vulnerabilities < 5:
            return "Low"
        elif vulnerabilities <= 20:
            return "Medium"
        else:
            return "High"
    
    def get_migration_status(
        self, 
        quantum_ready: bool, 
        latest_scan_date: datetime,
        scan_job_status: str
    ) -> str:
        """Determine migration status"""
        if quantum_ready:
            return self.calculate_migration_quarter(latest_scan_date, 0)
        
        status_map = {
            'completed': 'Completed',
            'in_progress': 'In Progress',
            'queued': 'Planned'
        }
        
        return status_map.get(scan_job_status, 'Not Started')
    
    def get_dashboard_data(self, db: Session) -> List[Dict[str, Any]]:
        """
        Generate complete dashboard data with CORRECTED calculations
        """
        log.info("🎯 Generating dashboard data...")
        
        # ============================================
        # STEP 1: Repository Scanner Data (Algorithms)
        # ============================================
        repo_scanner_engine = create_engine(
            os.getenv("REPO_SCANNER_DB_URL", "postgresql://scanuser:scanpass@postgres:5432/repo_scanner_db"),
            pool_pre_ping=True
        )
        repo_session = None
        repo_metrics = {}
        
        try:
            repo_session = sessionmaker(bind=repo_scanner_engine)()
            
            # CORRECTED: Get detailed algorithm metrics per repository
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
        
        # ============================================
        # STEP 2: System Scanner Data (Infrastructure)
        # ============================================
        system_scanner_engine = create_engine(
            os.getenv("SYSTEM_SCANNER_DB_URL", "postgresql://scanuser:scanpass@postgres:5432/system_scanner_db"),
            pool_pre_ping=True
        )
        system_session = None
        system_metrics = {}
        
        try:
            system_session = sessionmaker(bind=system_scanner_engine)()
            
            # Get agent audit results
            system_query = text("""
                SELECT 
                    a.agent_id,
                    a.hostname,
                    a.ip_address,
                    r.audit_results::text AS audit_json,
                    r.submitted_at
                FROM agents a
                LEFT JOIN results r ON a.agent_id = r.agent_id
                WHERE r.audit_results IS NOT NULL
                ORDER BY r.submitted_at DESC
            """)
            
            system_results = system_session.execute(system_query).fetchall()
            
            for row in system_results:
                try:
                    audit_data = json.loads(row.audit_json) if row.audit_json else {}
                    
                    # Extract vulnerability indicators
                    vulnerabilities = []
                    
                    # Check OpenSSL version
                    openssl_version = audit_data.get('openssl_version', '')
                    if openssl_version and openssl_version < '3.0':
                        vulnerabilities.append('outdated_openssl')
                    
                    # Check SSH config
                    ssh_config = audit_data.get('ssh_config', {})
                    if ssh_config:
                        # Check for weak ciphers
                        ciphers = ssh_config.get('ciphers', [])
                        weak_ciphers = ['3des', 'des', 'rc4', 'md5']
                        if any(weak in str(ciphers).lower() for weak in weak_ciphers):
                            vulnerabilities.append('weak_ssh_ciphers')
                    
                    # Check certificates
                    certificates = audit_data.get('certificates', [])
                    for cert in certificates:
                        if cert.get('expired'):
                            vulnerabilities.append('expired_certificate')
                        if cert.get('key_size', 0) < 2048:
                            vulnerabilities.append('weak_certificate_key')
                    
                    system_metrics[row.hostname or row.ip_address] = {
                        'agent_id': row.agent_id,
                        'vulnerabilities': vulnerabilities,
                        'vulnerability_count': len(vulnerabilities),
                        'audit_data': audit_data,
                        'last_scan': row.submitted_at
                    }
                    
                except json.JSONDecodeError:
                    log.warning(f"Failed to parse audit_results for agent {row.agent_id}")
            
            log.info(f"✅ Fetched {len(system_metrics)} system agent metrics")
            log.info(f"🔍 Available agents in system_scanner_db: {list(system_metrics.keys())}")
            
        except Exception as e:
            log.error(f"❌ Error fetching system scanner data: {e}")
        finally:
            if system_session:
                system_session.close()
            system_scanner_engine.dispose()
        
        # ============================================
        # STEP 2.5: Debug Data Availability
        # ============================================
        try:
            debug_checks = {
                'scan_results_total': db.execute(text("SELECT COUNT(*) FROM scan_results")).scalar(),
                'scan_results_completed': db.execute(text("SELECT COUNT(*) FROM scan_results WHERE scan_status = 'COMPLETED'")).scalar(),
                'domains_with_app': db.execute(text("SELECT COUNT(*) FROM domains WHERE application_id IS NOT NULL")).scalar(),
                'repos_with_app': db.execute(text("SELECT COUNT(*) FROM repositories WHERE application_id IS NOT NULL")).scalar(),
                'servers_with_app': db.execute(text("SELECT COUNT(*) FROM servers WHERE application_id IS NOT NULL")).scalar(),
                'repo_metrics_count': len(repo_metrics),
                'system_metrics_count': len(system_metrics)
            }
            log.info(f"📊 Data counts in scandb: {debug_checks}")
            
            # Check domain matching
            domain_url_check = db.execute(text("""
                SELECT 
                    d.domain,
                    COUNT(sr.id) as matching_scans
                FROM domains d
                LEFT JOIN scan_results sr ON (
                    LOWER(sr.url) LIKE '%' || LOWER(d.domain) || '%'
                )
                WHERE d.application_id IS NOT NULL
                GROUP BY d.domain
            """)).fetchall()
            
            log.info("🔗 Domain → Scan Results matching:")
            for row in domain_url_check:
                log.info(f"  {row.domain}: {row.matching_scans} matching scans")

            if debug_checks['repo_metrics_count'] == 0 and debug_checks['system_metrics_count'] == 0 and debug_checks['scan_results_total'] == 0:
                log.warning("⚠️ No scan data available in any database! Dashboard will show zeros.")
        except Exception as e:
            log.error(f"Error in debug checks: {e}")

        # ============================================
        # STEP 3: Main Query - TLS/Domain Data
        # ============================================
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
                                OR REPLACE(sr.url, 'https://', '') LIKE d.domain || '%'
                                OR REPLACE(sr.url, 'http://', '') LIKE d.domain || '%'
                                OR REPLACE(REPLACE(sr.url, 'https://www.', ''), 'http://www.', '') LIKE d.domain || '%'
                            )                WHERE d.application_id IS NOT NULL 
                  AND sr.pqc_overall_score IS NOT NULL
                  AND sr.scan_status = 'COMPLETED'
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
                    ARRAY_AGG(hostname ORDER BY hostname) AS server_hostnames
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
                
                -- Migration Status
                CASE
                    WHEN pm.quantum_ready_count > 0 AND pm.quantum_ready_count = pm.total_scans THEN 
                        'Q' || CEIL(EXTRACT(MONTH FROM pm.latest_scan_date) / 3.0) || 
                        ' ' || EXTRACT(YEAR FROM pm.latest_scan_date)
                    WHEN ss.completed_jobs > 0 THEN 'In Progress'
                    WHEN ss.total_scan_jobs > 0 THEN 'Planned'
                    ELSE 'Not Started'
                END AS "status",
                
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
                COALESCE(sd.active_agents, 0) AS "active_agent_count"
                
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
            
            dashboard_data = []
            
            for row in rows:
                # ============================================
                # STEP 4: Aggregate Repository Algorithms
                # ============================================
                app_repo_urls = row.repo_urls or []
                log.info(f"🔍 App has {len(app_repo_urls)} repositories")
                
                total_repo_algorithms = 0
                total_vulnerable_repo_algs = 0
                safe_repo_algs = 0
                all_repo_algorithms = []
                vulnerable_repo_algorithms = []
                repo_security_scores = []
                
                for repo_url in app_repo_urls:
                    normalized_url = normalize_repo_url(repo_url)
                    log.info(f"  Looking up: {repo_url} → {normalized_url}")
                    
                    if normalized_url in repo_metrics:
                        metrics = repo_metrics[normalized_url]
                        log.info(f"    ✅ Found! Algorithms: {metrics['total_algorithms']}, Vulnerable: {metrics['vulnerable_algorithms']}")
                        total_repo_algorithms += metrics['total_algorithms']
                        total_vulnerable_repo_algs += metrics['vulnerable_algorithms']
                        safe_repo_algs += metrics['safe_algorithms']
                        all_repo_algorithms.extend(metrics['algorithms_used'])
                        vulnerable_repo_algorithms.extend(metrics['vulnerable_list'])
                        if metrics['security_score'] > 0:
                            repo_security_scores.append(metrics['security_score'])
                    else:
                        log.warning(f"    ❌ Not found in repo_scanner_db")
                
                # Calculate average repo security score
                avg_repo_security = (
                    sum(repo_security_scores) / len(repo_security_scores)
                    if repo_security_scores else 0.0
                )
                
                # ============================================
                # STEP 5: Aggregate System/Server Vulnerabilities
                # ============================================
                server_hostnames = row.server_hostnames or []
                log.info(f"🔍 App has {len(server_hostnames)} servers")
                log.info(f"🔍 Available agents: {list(system_metrics.keys())}")
                
                system_vulnerabilities = []
                total_system_vulns = 0
                
                for hostname in server_hostnames:
                    matched = False
                    
                    # Try exact match first
                    if hostname in system_metrics:
                        sys_data = system_metrics[hostname]
                        matched = True
                        log.info(f"  ✅ Exact match: {hostname}")
                    else:
                        # Try case-insensitive partial match (for FQDN vs short name)
                        hostname_lower = hostname.lower() if hostname else ''
                        for sys_hostname in system_metrics.keys():
                            sys_hostname_lower = sys_hostname.lower() if sys_hostname else ''
                            
                            # Check if either contains the other
                            if (hostname_lower and sys_hostname_lower and
                                (hostname_lower in sys_hostname_lower or sys_hostname_lower in hostname_lower)):
                                sys_data = system_metrics[sys_hostname]
                                matched = True
                                log.info(f"  ✅ Fuzzy match: '{hostname}' → '{sys_hostname}'")
                                break
                    
                    if matched:
                        system_vulnerabilities.extend(sys_data['vulnerabilities'])
                        total_system_vulns += sys_data['vulnerability_count']
                        log.info(f"    Vulnerabilities: {sys_data['vulnerability_count']}")
                    else:
                        log.warning(f"  ❌ No agent data for: {hostname}")
                
                # ============================================
                # STEP 6: Combine All Algorithms
                # ============================================
                unique_repo_algorithms = list(set(all_repo_algorithms))
                domain_algorithms = (list(row.cipher_suites or []) + 
                                   list(row.signature_algorithms or []) + 
                                   list(row.hash_algorithms or []))
                
                combined_algorithms = list(set(unique_repo_algorithms + domain_algorithms))
                
                # ============================================
                # STEP 7: Calculate Total Vulnerabilities
                # ============================================
                cert_vulnerabilities = int(row.total_pqc_vulnerable_certificates or 0)
                cipher_vulnerabilities = int(row.vulnerable_cipher_suites or 0)
                
                total_vulnerabilities = (
                    total_vulnerable_repo_algs +  # From code
                    cert_vulnerabilities +         # From TLS certs
                    cipher_vulnerabilities +       # From cipher suites
                    total_system_vulns            # From system agents
                )
                
                # ============================================
                # STEP 8: Calculate Combined PQC Score
                # ============================================
                domain_pqc = float(row.pqc_ready) if row.pqc_ready is not None else 0.0
                
                # Dynamic re-weighting based on available data
                weights = []
                scores = []

                if domain_pqc > 0:
                    weights.append(0.4)
                    scores.append(domain_pqc)

                if avg_repo_security > 0:
                    weights.append(0.4)
                    scores.append(avg_repo_security)

                # System score: always included if we have server data, or defaulted
                if row.server_count and row.server_count > 0:
                    weights.append(0.2)
                    scores.append(max(0, 100 - (total_system_vulns * 10)))
                elif total_system_vulns > 0:
                    weights.append(0.2)
                    scores.append(max(0, 100 - (total_system_vulns * 10)))

                if weights:
                    total_weight = sum(weights)
                    combined_pqc_score = sum(s * (w/total_weight) for s, w in zip(scores, weights))
                else:
                    # Default if no data at all
                    combined_pqc_score = 0.0
                    risk_level = "Unknown"
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
                
                # ============================================
                # STEP 10: Calculate Time Complexity
                # ============================================
                if total_vulnerabilities < 5:
                    time_complexity = "Low"
                elif total_vulnerabilities <= 20:
                    time_complexity = "Medium"
                elif total_vulnerabilities <= 50:
                    time_complexity = "High"
                else:
                    time_complexity = "Very High"
                
                # ============================================
                # STEP 11: Build Final Record
                # ============================================
                
                # Normalize App Category
                app_category = row.App_Category or "Uncategorized"
                valid_categories = ["Server", "Database", "Application", "Network Device", "Hybrid App"]
                if app_category not in valid_categories:
                    # Map detailed categories to standard ones if needed, or default to Application
                    if "Server" in app_category: app_category = "Server"
                    elif "Database" in app_category: app_category = "Database"
                    elif "Network" in app_category: app_category = "Network Device"
                    elif "Hybrid" in app_category: app_category = "Hybrid App"
                    else: app_category = "Application"

                record = {
                    # Organization Info
                    "Organisation": row.Organisation or "",
                    "Org ID": row.Org_ID or "",
                    "Sub Org": row.Sub_Org or "",
                    "Sub Org ID": row.Sub_Org_ID or "",
                    "Org Target Migration Data": row.Org_Target_Migration_Data or "Q4 2026",
                    
                    # Application Info
                    "application": row.application or "",
                    "Application ID": row.Application_ID or "",
                    "App Category": app_category,
                    
                    # Security Scores
                    "pqc_ready": round(combined_pqc_score, 1),
                    
                    # Risk Assessment
                    "risk_level": risk_level,
                    "status": row.status or "Not Started",
                    
                    # Vulnerability Counts
                    "alg_changes": total_vulnerable_repo_algs,
                    "cert_changes": int(row.cert_changes) if row.cert_changes else 0,
                    
                    "total_algorithms": len(combined_algorithms),
                    "total_certificates": int(row.total_certificates) if row.total_certificates else 0,
                    
                    "total_pqc_vulnerable_algorithms": total_vulnerable_repo_algs,
                    "total_pqc_vulnerable_certificates": cert_vulnerabilities,
                    
                    "vulnerabilities": total_vulnerabilities,
                    "time_complexity": time_complexity,
                    
                    # Metadata
                    "current_date": row.current_date or datetime.now().strftime('%m-%d-%Y'),
                    
                    # Algorithm Details
                    "algorithms_used": combined_algorithms
                }
                
                # Log detailed breakdown for first record to help with debugging
                log.info(f"""
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                📊 Application: {row.application}
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                🌐 TLS/Domain Metrics:
                  ├─ Domain PQC Score: {domain_pqc:.1f}
                  ├─ Total Certificates: {int(row.total_certificates) if row.total_certificates else 0}
                  ├─ Vulnerable Certificates: {cert_vulnerabilities}
                  ├─ Cipher Suites: {len(list(row.cipher_suites or []))}
                  └─ Vulnerable Ciphers: {cipher_vulnerabilities}

                💻 Repository/Code Metrics:
                  ├─ Total Repos: {len(app_repo_urls)}
                  ├─ Avg Security Score: {avg_repo_security:.1f}
                  ├─ Total Algorithms: {total_repo_algorithms}
                  ├─ Vulnerable Algorithms: {total_vulnerable_repo_algs}
                  └─ Safe Algorithms: {safe_repo_algs}

                🖥️  System/Agent Metrics:
                  ├─ Total Servers: {len(server_hostnames)}
                  ├─ System Vulnerabilities: {total_system_vulns}
                  └─ Vulnerability Types: {list(set(system_vulnerabilities))}

                🎯 Final Scores:
                  ├─ Combined PQC Score: {combined_pqc_score:.1f}
                  ├─ Risk Level: {risk_level}
                  ├─ Total Vulnerabilities: {total_vulnerabilities}
                  └─ Time Complexity: {time_complexity}
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                """)

                dashboard_data.append(record)
            
            log.info(f"✅ Generated {len(dashboard_data)} application records with corrected calculations")
            return dashboard_data
            
        except Exception as e:
            log.exception("❌ Error generating dashboard data")
            raise


# Singleton instance
dashboard_service = DashboardService()

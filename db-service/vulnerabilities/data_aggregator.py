from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey, Text, Float
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
from sqlalchemy.orm import Session
from models import ScanResult as ScandbScanResult
from repo_scanner_models import RepoScannerScanResult, Finding, CategoryScore, Repository, SystemScannerResult
from . import schemas
import json
from datetime import datetime
import uuid
from typing import List, Dict, Any

# --- Database Connection Details (default to shared SQLite files) ---
import os as _os
SCANDB_URL = _os.getenv("DATABASE_URL", "sqlite:////data/scandb.db")
REPO_SCANNER_DB_URL = _os.getenv("REPO_SCANNER_DB_URL", "sqlite:////data/repo_scanner.db")
SYSTEM_SCANNER_DB_URL = _os.getenv("SYSTEM_SCANNER_DB_URL", "sqlite:////data/system_scanner.db")

# --- Engine and Session Creation ---
# ... (database connection setup remains the same) ...

# --- SQLAlchemy Models ---
# ... (SQLAlchemy models remain the same) ...

# --- START: Intelligence Helper Functions ---

def _classify_context(snippet: str) -> str:
    """Infers the cryptographic context from a code snippet."""
    snippet_lower = snippet.lower()
    if any(k in snippet_lower for k in ["password", "hashlib", "bcrypt"]):
        return "password_hashing"
    if any(k in snippet_lower for k in ["jwt", "token", "auth"]):
        return "authentication"
    if any(k in snippet_lower for k in ["encrypt", "decrypt", "aes", "cipher"]):
        return "data_at_rest_encryption"
    if any(k in snippet_lower for k in ["sign", "verify", "hmac"]):
        return "data_integrity_signing"
    if "tls" in snippet_lower or "https" in snippet_lower:
        return "protocol_definition"
    return "general_crypto"

def _determine_risk_nature(algorithm: str) -> schemas.RiskNature:
    """Determines if the risk is classical, quantum, or both."""
    algo_lower = algorithm.lower()
    if any(k in algo_lower for k in ["rsa", "ecc", "dh", "dsa"]):
        return schemas.RiskNature(classical=True, quantum=True)
    if any(k in algo_lower for k in ["md5", "cbc", "rc4"]):
        return schemas.RiskNature(classical=True, quantum=False)
    if any(k in algo_lower for k in ["sha256", "sha384", "sha512"]):
        return schemas.RiskNature(classical=False, quantum=True) # Weakened by Grover's, not broken
    return schemas.RiskNature(classical=True, quantum=False)

def _infer_usage(algorithm: str) -> schemas.InferredUsage:
    """Infers the likely runtime usage based on the algorithm type."""
    algo_lower = algorithm.lower()
    likely_tls = any(k in algo_lower for k in ["rsa", "ecc", "dh", "tls", "sha256", "sha384"])
    likely_ssh = any(k in algo_lower for k in ["dsa", "dh", "ecdh"])
    likely_app = any(k in algo_lower for k in ["aes", "hmac", "jwt"])
    return schemas.InferredUsage(likely_tls=likely_tls, likely_ssh=likely_ssh, likely_application_crypto=likely_app)

def _infer_exposure(algorithm: str) -> schemas.ExposureAssessment:
    """Infers potential exposure points based on the algorithm type."""
    algo_lower = algorithm.lower()
    network_possible = any(k in algo_lower for k in ["rsa", "ecc", "dh", "tls", "dsa"])
    system_possible = any(k in algo_lower for k in ["openssl", "ssh", "dsa", "aes"])
    return schemas.ExposureAssessment(
        network_exposure_possible=network_possible,
        system_exposure_possible=system_possible,
        confidence="inferred-from-code"
    )

# --- END: Intelligence Helper Functions ---


def _extract_vulnerabilities(
    repo_scanner_results: List[RepoScannerScanResult]
) -> List[schemas.Vulnerability]:
    """
    Processes query results, focusing on enriching data from the active source code scanner.
    """
    vulnerabilities_by_algorithm: Dict[str, schemas.Vulnerability] = {}

    # Since only repo_scanner is active, it's our primary source of truth.
    for res in repo_scanner_results:
        if res.algorithm not in vulnerabilities_by_algorithm:
            # Create a new, enriched vulnerability object
            vulnerabilities_by_algorithm[res.algorithm] = schemas.Vulnerability(
                vulnerability_id=f"VULN-CODE-{uuid.uuid4()}",
                algorithm=res.algorithm,
                type=res.category,
                severity="High" if not res.quantum_safe else "Low",
                quantum_risk="Varies by algorithm",
                pqc_status="Quantum-Vulnerable" if not res.quantum_safe else "Quantum-Resistant",
                
                # --- HONESTY & INFERENCE ADDITIONS ---
                usage=schemas.Usage(source_code_occurrences=0, network_endpoints=0, system_configs=0, total_instances=0),
                inferred_usage=_infer_usage(res.algorithm),
                affected_layers=[], # Will be populated with 'source_code'
                potential_layers=["network", "system"], # Inferred potential
                exposure_assessment=_infer_exposure(res.algorithm),
                risk_nature=_determine_risk_nature(res.algorithm),
                # --- END ADDITIONS ---

                evidence=schemas.Evidence(source_code=schemas.SourceCodeEvidence(files=[])),
                recommendation=schemas.Recommendation(
                    strategy="Replace",
                    preferred_algorithms=["Kyber-768", "Dilithium-3"],
                    migration_type="Code-level replacement",
                    priority="High"
                )
            )
        
        vuln = vulnerabilities_by_algorithm[res.algorithm]
        
        if "source_code" not in vuln.affected_layers:
            vuln.affected_layers.append("source_code")
            
        vuln.usage.source_code_occurrences += res.occurrences
        
        # Enrich evidence with context classification
        vuln.evidence.source_code.files.extend([
            schemas.SourceCodeFile(
                file_path=finding.file_path,
                line_number=finding.line_number,
                snippet=finding.context,
                context=_classify_context(finding.context) # ADDED: Context classification
            ) for finding in res.findings
        ])

    # Final step: update total instances count
    for vuln in vulnerabilities_by_algorithm.values():
        vuln.usage.total_instances = vuln.usage.source_code_occurrences + vuln.usage.network_endpoints + vuln.usage.system_configs

    return list(vulnerabilities_by_algorithm.values())


def get_unified_vulnerability_report(scandb: Session, repo_scanner_db: Session, system_scanner_db: Session):
    # Query the databases. Note: scandb and system_scanner_db are expected to be empty.
    scandb_results = scandb.query(ScandbScanResult).limit(100).all()
    repo_scanner_results = repo_scanner_db.query(RepoScannerScanResult).limit(100).all()
    system_scanner_results = system_scanner_db.query(SystemScannerResult).limit(100).all()

    # The aggregation logic now primarily enriches the source code findings
    vulnerabilities = _extract_vulnerabilities(repo_scanner_results)
    
    # Calculate summary metrics based on the extracted vulnerabilities
    crit, high, med, low = 0, 0, 0, 0
    for v in vulnerabilities:
        if v.severity == "Critical": crit += 1
        elif v.severity == "High": high += 1
        elif v.severity == "Medium": med += 1
        else: low += 1

    # --- HONEST METADATA ---
    scan_scope = {
        "source_code": "active",
        "network": "schema-ready" if not scandb_results else "active",
        "system": "schema-ready" if not system_scanner_results else "active"
    }

    # --- ALGORITHM INVENTORY WITH 'WHAT IF' ANALYSIS ---
    algorithm_inventory_data = {
        "RSA-2048": schemas.AlgorithmInventory(
            type="Asymmetric", nist_status="Legacy", quantum_safe=False, quantum_break="Shor",
            what_if_analysis=schemas.WhatIfAnalysis(tls_risk="High if used in certificates", pqc_transition_blocker=True, nist_deprecation_timeline="Pre-2030")
        ),
        "SHA-256": schemas.AlgorithmInventory(
            type="Hash", nist_status="Approved", quantum_safe="Partially", quantum_break="Grover",
            what_if_analysis=schemas.WhatIfAnalysis(tls_risk="Low, used for integrity", pqc_transition_blocker=False, nist_deprecation_timeline="Post-2030")
        ),
        "Kyber-768": schemas.AlgorithmInventory(
            type="KEM", nist_status="Standardized", quantum_safe=True, security_level="NIST Level 3",
            what_if_analysis=schemas.WhatIfAnalysis(tls_risk="N/A, is a replacement", pqc_transition_blocker=False, nist_deprecation_timeline="N/A")
        )
    }

    return schemas.UnifiedVulnerabilityReport(
        metadata=schemas.Metadata(
            organization_id="org_123",
            scan_id=f"scan_{uuid.uuid4()}",
            generated_at=datetime.utcnow().isoformat(),
            scan_scope=scan_scope, # UPDATED
            pqc_policy_version="NIST-PQC-2024",
            risk_model_version="v2.2-inferred" # Version bump to reflect new logic
        ),
        summary_metrics=schemas.SummaryMetrics(
            vulnerability_severity=schemas.VulnerabilitySeverity(critical=crit, high=high, medium=med, low=low),
            cryptographic_inventory=schemas.CryptographicInventory(total_algorithms_detected=len(vulnerabilities), quantum_vulnerable_algorithms=sum(1 for v in vulnerabilities if v.risk_nature.quantum), hybrid_compatible_algorithms=0, post_quantum_ready_algorithms=sum(1 for v in vulnerabilities if v.pqc_status == "Quantum-Resistant")),
            overall_quantum_risk_score=0,
            overall_quantum_risk_grade="N/A",
        ),
        algorithm_inventory=algorithm_inventory_data, # UPDATED
        visual_analytics=schemas.VisualAnalytics( # Note: This data is still placeholder
            algorithm_type_distribution=schemas.AlgorithmTypeDistribution(asymmetric=1, hash=1, signature=0, key_exchange=0, protocol=0, application_crypto=0),
            algorithm_usage_frequency=[schemas.AlgorithmUsageFrequency(algorithm=v.algorithm, total_occurrences=v.usage.total_instances, contexts={"source_code": v.usage.source_code_occurrences}) for v in vulnerabilities]
        ),
        vulnerabilities=vulnerabilities,
        categories=schemas.Categories( # Note: This data is still placeholder
            asymmetric=schemas.Category(risk_score=82, grade="D", algorithms=["RSA-2048"]),
            hash_functions=schemas.Category(risk_score=41, grade="B", algorithms=["SHA-256"]),
            post_quantum=schemas.Category(risk_score=18, grade="A", algorithms=["Kyber-768"])
        ),
        data_sources=schemas.DataSources(
            network_crypto=schemas.DataSource(database="scandb", table="scan_results", confidence="High"),
            source_code_crypto=schemas.DataSource(database="repo_scanner_db", tables=["scan_results", "findings", "category_scores"], confidence="High"),
            system_crypto=schemas.DataSource(database="system_scanner_db", table="results", confidence="Medium")
        )
    )

def get_network_vulnerabilities(scandb: Session) -> List[schemas.NetworkVulnerability]:
    scan_results = scandb.query(ScandbScanResult).all()
    network_vulnerabilities = []
    for res in scan_results:
        scan_status = "unknown"
        if res.scan_status is not None:
            scan_status = res.scan_status.value if hasattr(res.scan_status, "value") else str(res.scan_status)

        network_vulnerabilities.append(schemas.NetworkVulnerability(
            url=res.url,
            scan_status=scan_status,
            requested_at=res.requested_at,
            completed_at=res.completed_at,
            execution_time_seconds=res.execution_time_seconds,
            tls_version=res.tls_version,
            supported_protocols=res.supported_protocols,
            primary_cipher_suite=res.primary_cipher_suite,
            kex_score=res.kex_score,
            kex_grade=res.kex_grade,
            ephemeral_key_exchange=res.ephemeral_key_exchange,
            public_key_algorithm=res.public_key_algorithm,
            public_key_size_bits=res.public_key_size_bits,
            primary_signature_algorithm=res.primary_signature_algorithm,
            primary_hash_algorithm=res.primary_hash_algorithm,
            cert_is_pqc=res.cert_is_pqc,
            pqc_overall_score=res.pqc_overall_score,
            pqc_overall_grade=res.pqc_overall_grade,
            pqc_security_level=res.pqc_security_level,
            pqc_quantum_ready=res.pqc_quantum_ready,
            pqc_hybrid_ready=res.pqc_hybrid_ready,
            hsts_enabled=res.hsts_enabled,
            ocsp_stapling_active=res.ocsp_stapling_active,
            ct_present=res.ct_present,
            raw_response=res.raw_response
        ))
    return network_vulnerabilities

def get_code_vulnerabilities(repo_scanner_db: Session) -> List[schemas.CodeVulnerability]:
    repositories = repo_scanner_db.query(Repository).all()
    code_vulnerabilities = []

    for repo in repositories:
        algorithms_data = []
        for scan_result in repo.scan_results:
            findings_data = [
                schemas.CodeFinding(
                    file_path=finding.file_path,
                    line_number=finding.line_number,
                    context=finding.context
                ) for finding in scan_result.findings
            ]
            algorithms_data.append(schemas.CodeAlgorithm(
                algorithm=scan_result.algorithm,
                category=scan_result.category,
                quantum_safe=scan_result.quantum_safe,
                occurrences=scan_result.occurrences,
                findings=findings_data
            ))
        
        category_scores_data = [
            schemas.CodeCategoryScore(
                category_type=score.category_type,
                score=score.score,
                grade=score.grade
            ) for score in repo.category_scores
        ]

        code_vulnerabilities.append(schemas.CodeVulnerability(
            repo_url=repo.repo_url,
            branch_name=repo.branch_name,
            repo_hash=repo.repo_hash,
            overall_security_score=repo.overall_security_score,
            algorithms=algorithms_data,
            category_scores=category_scores_data
        ))
    return code_vulnerabilities

def get_system_vulnerabilities(system_scanner_db: Session) -> List[schemas.SystemVulnerability]:
    system_results = system_scanner_db.query(SystemScannerResult).all()
    system_vulnerabilities = []
    for res in system_results:
        if isinstance(res.audit_results, dict):
            audit_results_json = res.audit_results
        else:
            try:
                audit_results_json = json.loads(res.audit_results) if res.audit_results else {}
            except (TypeError, json.JSONDecodeError):
                audit_results_json = {}
        
        system_vulnerabilities.append(schemas.SystemVulnerability(
            agent_id=res.agent_id,
            hostname=audit_results_json.get("hostname", "N/A"),
            os_info=audit_results_json.get("os_info", "N/A"),
            submitted_at=res.submitted_at,
            openssl_version=audit_results_json.get("openssl_version"),
            ssh_kex_algorithms=audit_results_json.get("ssh_kex_algorithms"),
            disabled_ciphers=audit_results_json.get("disabled_ciphers"),
            system_certificates=audit_results_json.get("system_certificates"),
            tls_libraries=audit_results_json.get("tls_libraries"),
            raw_audit_results=audit_results_json
        ))
    return system_vulnerabilities

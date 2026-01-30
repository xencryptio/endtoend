from pydantic import BaseModel, Field
from typing import List, Dict, Union, Any, Optional
from datetime import datetime

class Metadata(BaseModel):
    organization_id: str
    scan_id: str
    generated_at: str
    scan_scope: Dict[str, str] # CHANGED: From List[str] to Dict
    pqc_policy_version: str
    risk_model_version: str

class VulnerabilitySeverity(BaseModel):
    critical: int
    high: int
    medium: int
    low: int

class CryptographicInventory(BaseModel):
    total_algorithms_detected: int
    quantum_vulnerable_algorithms: int
    hybrid_compatible_algorithms: int
    post_quantum_ready_algorithms: int

class SummaryMetrics(BaseModel):
    vulnerability_severity: VulnerabilitySeverity
    cryptographic_inventory: CryptographicInventory
    overall_quantum_risk_score: int
    overall_quantum_risk_grade: str

class WhatIfAnalysis(BaseModel):
    tls_risk: str
    pqc_transition_blocker: bool
    nist_deprecation_timeline: str
    
class AlgorithmInventory(BaseModel):
    type: str
    nist_status: str
    quantum_safe: Union[bool, str]
    quantum_break: Optional[str] = None
    security_strength_bits: Optional[int] = None
    effective_strength_bits: Optional[int] = None
    recommended_replacement: Optional[List[str]] = None
    security_level: Optional[str] = None
    what_if_analysis: WhatIfAnalysis # ADDED

class AlgorithmTypeDistribution(BaseModel):
    asymmetric: int
    hash: int
    signature: int
    key_exchange: int
    protocol: int
    application_crypto: int

class AlgorithmUsageFrequency(BaseModel):
    algorithm: str
    total_occurrences: int
    contexts: Dict[str, int]

class VisualAnalytics(BaseModel):
    algorithm_type_distribution: AlgorithmTypeDistribution
    algorithm_usage_frequency: List[AlgorithmUsageFrequency]

class NetworkEvidence(BaseModel):
    tls_version: str
    cipher_suite: str
    certificate: Dict[str, Union[str, int]]

class SourceCodeFile(BaseModel):
    file_path: str
    line_number: int
    snippet: str
    context: str # ADDED

class SourceCodeEvidence(BaseModel):
    files: List[SourceCodeFile]

class SystemEvidence(BaseModel):
    openssl_version: str
    ssh_kex: List[str]

class Evidence(BaseModel):
    network: Optional[NetworkEvidence] = None
    source_code: Optional[SourceCodeEvidence] = None
    system: Optional[SystemEvidence] = None

class Recommendation(BaseModel):
    strategy: str
    preferred_algorithms: List[str]
    migration_type: str
    priority: str

class Usage(BaseModel):
    source_code_occurrences: int
    network_endpoints: int
    system_configs: int
    total_instances: int

class InferredUsage(BaseModel):
    likely_tls: bool
    likely_ssh: bool
    likely_application_crypto: bool

class ExposureAssessment(BaseModel):
    network_exposure_possible: bool
    system_exposure_possible: bool
    confidence: str

class RiskNature(BaseModel):
    classical: bool
    quantum: bool

class Vulnerability(BaseModel):
    vulnerability_id: str
    algorithm: str
    type: str
    severity: str
    quantum_risk: str
    pqc_status: str
    usage: Usage # CHANGED: from Dict to model
    inferred_usage: InferredUsage # ADDED
    affected_layers: List[str]
    potential_layers: List[str] # ADDED
    evidence: Evidence
    recommendation: Recommendation
    exposure_assessment: ExposureAssessment # ADDED
    risk_nature: RiskNature # ADDED

class Category(BaseModel):
    risk_score: int
    grade: str
    algorithms: List[str]

class Categories(BaseModel):
    asymmetric: Category
    hash_functions: Category
    post_quantum: Category

class DataSource(BaseModel):
    database: str
    table: Optional[str] = None
    tables: Optional[List[str]] = None
    confidence: str

class DataSources(BaseModel):
    network_crypto: DataSource
    source_code_crypto: DataSource
    system_crypto: DataSource

class UnifiedVulnerabilityReport(BaseModel):
    metadata: Metadata
    summary_metrics: SummaryMetrics
    algorithm_inventory: Dict[str, AlgorithmInventory]
    visual_analytics: VisualAnalytics
    vulnerabilities: List[Vulnerability]
    categories: Categories
    data_sources: DataSources

# --- New Schemas for specific vulnerability endpoints ---

class NetworkVulnerability(BaseModel):
    url: str
    scan_status: str
    requested_at: Optional[datetime]
    completed_at: Optional[datetime]
    execution_time_seconds: Optional[float]

    tls_version: Optional[str]
    supported_protocols: Optional[str]
    primary_cipher_suite: Optional[str]

    kex_score: Optional[float]
    kex_grade: Optional[str]
    ephemeral_key_exchange: Optional[bool]

    public_key_algorithm: Optional[str]
    public_key_size_bits: Optional[int]
    primary_signature_algorithm: Optional[str]
    primary_hash_algorithm: Optional[str]
    cert_is_pqc: Optional[bool]

    pqc_overall_score: Optional[float]
    pqc_overall_grade: Optional[str]
    pqc_security_level: Optional[str]
    pqc_quantum_ready: Optional[bool]
    pqc_hybrid_ready: Optional[bool]

    hsts_enabled: Optional[bool]
    ocsp_stapling_active: Optional[bool]
    ct_present: Optional[bool]

    raw_response: Optional[Dict[str, Any]]

class CodeFinding(BaseModel):
    file_path: str
    line_number: int
    context: Optional[str]

class CodeAlgorithm(BaseModel):
    algorithm: str
    category: str
    quantum_safe: bool
    occurrences: int
    findings: List[CodeFinding] = []

class CodeCategoryScore(BaseModel):
    category_type: str
    score: float
    grade: str

class CodeVulnerability(BaseModel):
    repo_url: str
    branch_name: str
    repo_hash: str
    overall_security_score: Optional[float]
    algorithms: List[CodeAlgorithm] = []
    category_scores: List[CodeCategoryScore] = []

class SystemVulnerability(BaseModel):
    agent_id: str
    hostname: str
    os_info: str
    submitted_at: Optional[datetime]

    openssl_version: Optional[str]
    ssh_kex_algorithms: Optional[List[str]]
    disabled_ciphers: Optional[List[str]]
    system_certificates: Optional[List[str]]
    tls_libraries: Optional[List[str]]

    raw_audit_results: Optional[Dict[str, Any]]
"""
Shared Pydantic models for ALL scoring types
"""
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Literal
from datetime import datetime

class AlgorithmInput(BaseModel):
    """Universal algorithm input - works for ALL scoring types"""
    name: str = Field(..., description="Algorithm name (e.g., 'AES-256-GCM', 'RSA', 'X25519')")
    algorithm_type: Literal["kex", "signature", "symmetric", "hash", "protocol"] = Field(..., description="Algorithm category")
    key_size: Optional[int] = Field(None, description="Key size in bits")
    curve: Optional[str] = Field(None, description="Elliptic curve name (e.g., 'secp256r1', 'X25519')")
    curve_bits: Optional[int] = Field(None, description="Curve strength in bits")
    position: int = Field(0, description="Priority position (0 = highest priority)")
    context: Optional[Dict] = Field(default_factory=dict, description="Source-specific metadata")

class UniversalScoringRequest(BaseModel):
    """Single request model for ALL scoring types"""
    scoring_type: Literal["agent", "tls", "repository"] = Field(..., description="Type of scan being scored")
    algorithms: List[AlgorithmInput] = Field(..., description="List of algorithms to score")
    metadata: Dict = Field(default_factory=dict, description="Request metadata (domain, OS, timestamp, etc.)")
    # Adding fields to support detailed analysis for tls scans
    raw_response: Optional[Dict] = Field(default_factory=dict, description="Raw response from the scanner")

class AlgorithmScoreOutput(BaseModel):
    """Individual algorithm score output"""
    algorithm: str
    algorithm_type: str
    base_score: float
    key_size: int
    key_size_score: float
    curve_strength: float
    final_score: float
    grade: str
    is_pqc: bool
    is_hybrid: bool
    position: int
    weighted_score: float
    security_level: str
    quantum_safe: bool
    quantum_safety_reason: Optional[str] = None
    deprecated: bool
    vulnerabilities: List[str] = Field(default_factory=list)


class ComponentScore(BaseModel):
    """Component-level scores (kex, signature, symmetric, hash)"""
    component_type: str
    algorithms: List[AlgorithmScoreOutput]
    score: float
    average_score: float
    weighted_average: float
    grade: str
    weight_in_final: float
    best_algorithm: str
    worst_algorithm: str
    pqc_percentage: float
    hybrid_percentage: float
    deprecated_count: int
    quantum_safe_count: int
    algorithm_count: int
    pfs_enabled: bool

class ProtocolAnalysis(BaseModel):
    supported_versions: List[str]
    deprecated_versions: List[str]
    version_scores: Dict[str, float]
    compression_enabled: bool
    renegotiation_secure: bool
    heartbeat_enabled: bool
    session_resumption: str
    downgrade_protection: bool

class CertificateAnalysis(BaseModel):
    total_certificates: int
    weak_signatures: int
    strong_signatures: int
    validity_period_days: int
    cert_transparency: bool
    ocsp_stapling: bool
    key_pinning: bool
    chain_consistent: bool
    signature_algorithms: List[str]
    hash_algorithms: List[str]

class SecurityFeatures(BaseModel):
    hsts_enabled: bool
    hsts_max_age: int
    pfs_supported: bool
    pfs_percentage: float
    sni_supported: bool
    alpn_supported: List[str]
    supported_extensions: List[str]


class UniversalScoringResponse(BaseModel):
    """Single response model for ALL scoring types"""
    domain: Optional[str] = None
    timestamp: Optional[str] = None
    overall_score: float
    overall_grade: str
    security_level: str
    components: Dict[str, ComponentScore]
    algorithm_scores: List[AlgorithmScoreOutput]
    protocol_analysis: Optional[ProtocolAnalysis] = None
    certificate_analysis: Optional[CertificateAnalysis] = None
    security_features: Optional[SecurityFeatures] = None
    quantum_ready: bool
    hybrid_ready: bool
    quantum_readiness_detail: Optional[Dict] = None
    critical_vulnerabilities: List[str] = Field(default_factory=list)
    compliance_status: Dict[str, bool] = Field(default_factory=dict)
    metadata: Dict = Field(default_factory=dict, description="Original request metadata + processing info")
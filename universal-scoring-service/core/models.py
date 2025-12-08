"""
Shared Pydantic models for ALL scoring types
"""
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Literal
from datetime import datetime

class AlgorithmInput(BaseModel):
    """Universal algorithm input - works for ALL scoring types"""
    name: str = Field(..., description="Algorithm name (e.g., 'AES-256-GCM', 'RSA', 'X25519')")
    algorithm_type: Literal["kex", "signature", "symmetric", "hash"] = Field(..., description="Algorithm category")
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

class ComponentScore(BaseModel):
    """Component-level scores (kex, signature, symmetric, hash)"""
    component_type: str
    average_score: float
    weighted_average: float
    grade: str
    pqc_percentage: float
    quantum_safe_count: int
    algorithm_count: int

class AlgorithmScoreOutput(BaseModel):
    """Individual algorithm score output"""
    algorithm: str
    algorithm_type: str
    base_score: float
    key_size: int
    key_size_score: float
    final_score: float
    grade: str
    is_pqc: bool
    quantum_safe: bool
    quantum_safety_reason: Optional[str] = None
    deprecated: bool
    position: int
    weighted_score: float

class UniversalScoringResponse(BaseModel):
    """Single response model for ALL scoring types"""
    overall_score: float
    overall_grade: str
    security_level: Literal["critical", "low", "medium", "high", "excellent"]
    quantum_ready: bool
    hybrid_ready: bool
    components: Dict[str, ComponentScore]
    algorithm_scores: List[AlgorithmScoreOutput]
    critical_vulnerabilities: List[str] = Field(default_factory=list)
    compliance_status: Dict[str, bool] = Field(default_factory=dict)
    metadata: Dict = Field(default_factory=dict, description="Original request metadata + processing info")
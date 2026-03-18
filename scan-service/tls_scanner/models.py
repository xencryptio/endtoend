from typing import List, Optional, Literal
from dataclasses import dataclass

@dataclass
class CipherSuite:
    name: str
    kex: str
    auth: str
    symmetric: str
    hash: str
    curve: Optional[str] = None
    curve_bits: Optional[int] = None

@dataclass
class EllipticCurve:
    name: str
    bits: int

@dataclass
class Certificate:
    type: Literal["leaf", "intermediate", "root"]
    signature_algorithm: str
    signature_hash: str
    public_key_algorithm: str
    public_key_size: int
    public_key_curve: Optional[str] = None

@dataclass
class EndpointResult:
    ip: str
    port: int
    protocols: List[str]
    tls_configuration: dict
    supported_elliptic_curves: List[dict]
    certificates: dict
    signature_algorithms: dict

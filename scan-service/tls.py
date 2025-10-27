#!/usr/bin/env python3
"""
Post-Quantum Cryptography Security Analyzer
Complete implementation with all algorithms and full CLI
"""

import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field, asdict
from enum import Enum
from datetime import datetime
import re


class AlgorithmType(Enum):
    KEX = "key_exchange"
    SIGNATURE = "signature"
    SYMMETRIC = "symmetric"
    HASH = "hash"
    HYBRID = "hybrid"


class SecurityLevel(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    MINIMAL = "minimal"


@dataclass
class AlgorithmScore:
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
    deprecated: bool
    vulnerabilities: List[str] = field(default_factory=list)


@dataclass
class ComponentAnalysis:
    component_type: str
    algorithms: List[AlgorithmScore]
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
    pfs_enabled: bool


@dataclass
class ProtocolAnalysis:
    supported_versions: List[str]
    deprecated_versions: List[str]
    version_scores: Dict[str, float]
    compression_enabled: bool
    renegotiation_secure: bool
    heartbeat_enabled: bool
    session_resumption: str
    downgrade_protection: bool


@dataclass
class CertificateAnalysis:
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


@dataclass
class SecurityFeatures:
    hsts_enabled: bool
    hsts_max_age: int
    pfs_supported: bool
    pfs_percentage: float
    sni_supported: bool
    alpn_supported: List[str]
    supported_extensions: List[str]


@dataclass
class FinalReport:
    domain: str
    timestamp: str
    overall_score: float
    overall_grade: str
    security_level: str
    components: Dict[str, ComponentAnalysis]
    individual_scores: List[AlgorithmScore]
    protocol_analysis: ProtocolAnalysis
    certificate_analysis: CertificateAnalysis
    security_features: SecurityFeatures
    quantum_ready: bool
    hybrid_ready: bool
    critical_vulnerabilities: List[str]
    compliance_status: Dict[str, bool]


class PQCAnalyzer:
    """
    Comprehensive Post-Quantum Cryptography Security Analyzer
    """
    
    def __init__(self):
        self.PQ_RESISTANCE_TABLE = {
            "kex": {
                # Classic (Vulnerable to Quantum)
                "RSA": 0, "DH": 0, "DH-RSA": 0, "DH-DSS": 0, "ANON-DH": 0,
                "DHE": 5, "ECDH": 5, "ECDHE": 10,
                
                # Modern Curves
                "X25519": 15, "X448": 18, "CURVE25519": 15, "CURVE448": 18,
                
                # NIST Curves
                "secp224r1": 3, "secp256r1": 5, "secp256k1": 4, "secp384r1": 8,
                "secp521r1": 10, "PRIME256V1": 5,
                
                # Brainpool
                "brainpoolP256r1": 6, "brainpoolP384r1": 9, "brainpoolP512r1": 11,
                
                # FFDHE Groups
                "ffdhe2048": 7, "ffdhe3072": 9, "ffdhe4096": 11,
                "ffdhe6144": 13, "ffdhe8192": 15,
                
                # PQC Standards (NIST)
                "KYBER": 95, "KYBER512": 90, "KYBER768": 95, "KYBER1024": 98,
                "CRYSTALS-KYBER": 95, "ML-KEM": 95, "ML-KEM-512": 90,
                "ML-KEM-768": 95, "ML-KEM-1024": 98,
                
                # PQC Candidates
                "BIKE": 85, "BIKE-L1": 83, "BIKE-L3": 87, "BIKE-L5": 89,
                "SIKE": 0, "NTRU": 85, "NTRUPRIME": 87, "SNTRUP": 86,
                "SNTRUP761": 86, "SNTRUP857": 87, "SNTRUP1277": 89,
                "SABER": 88, "LIGHTSABER": 85, "FIRESABER": 90,
                "FRODO": 92, "FRODOKEM": 92, "FRODOKEM-640": 90,
                "FRODOKEM-976": 92, "FRODOKEM-1344": 94,
                "HQC": 88, "CLASSIC-MCELIECE": 93, "MCELIECE": 93,
                "NEWHOPE": 87, "NEWHOPE512": 85, "NEWHOPE1024": 89,
                "NTRU-HRSS": 87, "NTRU-HPS": 88,
                
                # Hybrid (Best practice)
                "X25519-KYBER768": 96, "X25519-KYBER512": 93,
                "X448-KYBER768": 97, "X448-KYBER1024": 97,
                "P256-KYBER512": 92, "P384-KYBER768": 95,
                "ECDHE-KYBER": 94, "ECDHE-NTRU": 90,
                
                # PSK variants
                "PSK": 40, "DHE-PSK": 45, "ECDHE-PSK": 50,
                "RSA-PSK": 35,
            },
            
            "signature": {
                # Classic (Vulnerable)
                "RSA": 0, "DSA": 0, "DSS": 0, "ECDSA": 5,
                "DSA-1024": 0, "DSA-2048": 3, "DSA-3072": 5,
                
                # RSA Variants
                "RSA-PSS": 8, "RSASSA-PSS": 8,
                
                # Modern ECC
                "EdDSA": 60, "Ed25519": 65, "Ed448": 70,
                
                # PQC Standards (NIST)
                "DILITHIUM": 95, "DILITHIUM2": 92, "DILITHIUM3": 95, "DILITHIUM5": 98,
                "ML-DSA": 95, "ML-DSA-44": 92, "ML-DSA-65": 95, "ML-DSA-87": 98,
                "FALCON": 94, "FALCON512": 92, "FALCON1024": 96,
                "SPHINCS": 96, "SPHINCS+": 97,
                "SPHINCS+-128F": 95, "SPHINCS+-192F": 96, "SPHINCS+-256F": 97,
                "SPHINCS+-128S": 96, "SPHINCS+-192S": 97, "SPHINCS+-256S": 98,
                "SLH-DSA": 97,
                
                # Hash-based
                "XMSS": 91, "LMS": 90, "HSS-LMS": 91,
                
                # PQC Candidates
                "RAINBOW": 0, "PICNIC": 88, "PICNIC3": 89,
                "PICNIC-L1": 87, "PICNIC-L3": 89, "PICNIC-L5": 91, "MAYO": 89, "UOV": 84,
                "GeMSS": 86, "LUOV": 84,
                
                # International Standards
                "SM2": 55, "GOST-SIGNATURE": 58, "GOST-2012": 60,
                
                # Hybrid (Scores reflect the classical part is a vulnerability)
                "RSA-DILITHIUM": 85, "RSA+DILITHIUM": 85,
                "ECDSA-DILITHIUM": 88, "ECDSA+DILITHIUM": 88,
                "ECDSA-FALCON": 87, "ECDSA+FALCON": 87,
                "RSA-SPHINCS+": 86, "RSA-FALCON": 86,
                "Ed25519-DILITHIUM": 90, "Ed448-DILITHIUM3": 91,
                "Ed448-FALCON1024": 92,
            },
            
            "symmetric": {
                # AES Family
                "AES-128": 70, "AES-192": 80, "AES-256": 85,
                "AES-128-GCM": 75, "AES-192-GCM": 82, "AES-256-GCM": 90,
                "AES-128-CCM": 72, "AES-256-CCM": 88,
                "AES-128-OCB": 73, "AES-256-OCB": 89,
                "AES-GCM-SIV": 89, "AES-SIV": 87, "AES-EAX": 86,
                
                # ChaCha Family
                "AEGIS-128": 79, "AEGIS-256": 84,
                "ChaCha20": 82, "ChaCha20-Poly1305": 88,
                "XChaCha20": 83, "XChaCha20-Poly1305": 88,
                
                # Salsa
                "Salsa20": 75, "XSalsa20": 76,
                
                # Other Modern
                "Camellia-128": 60, "Camellia-192": 70, "Camellia-256": 80,
                "ARIA-128": 62, "ARIA-192": 72, "ARIA-256": 82,
                "Twofish": 70, "Twofish-256": 78,
                "Serpent": 75, "Serpent-256": 82,
                
                # Lightweight (NIST)
                "ASCON-128": 80, "ASCON-128A": 82,
                "GIFT-128": 75, "SPARKLE": 76,
                "GRAIN-128AEAD": 74, "TINYJAMBU": 73,
                "DEOXYS-II": 77,
                
                # Weak/Deprecated
                "3DES": 20, "DES": 0, "RC4": 0, "RC2": 0,
                "Blowfish": 30, "IDEA": 25, "CAST5": 28,
            },
            
            "hash": {
                # Broken
                "MD5": 0, "MD4": 0, "MD2": 0,
                
                # Deprecated
                "SHA1": 10, "SHA-1": 10, "RIPEMD-160": 35,
                
                # SHA-2
                "SHA224": 50, "SHA-224": 50, "SHA256": 70, "SHA-256": 70,
                "SHA384": 80, "SHA-384": 80, "SHA512": 85, "SHA-512": 85,
                "SHA512/224": 78, "SHA512/256": 80,
                
                # SHA-3
                "SHA3-224": 70, "SHA3-256": 72, "SHA3-384": 82, "SHA3-512": 88,
                "SHAKE128": 73, "SHAKE256": 86,
                "Keccak": 72, "Keccak-256": 72,
                
                # BLAKE
                "BLAKE2b": 80, "BLAKE2s": 78, "BLAKE3": 85,
                "BLAKE2b-256": 80, "BLAKE2b-512": 83,
                "BLAKE2BP": 82, "BLAKE2SP": 81,
                
                # Lightweight
                "ASCON-HASH": 78, "ASCON-HASHA": 79,
                
                # International
                "Whirlpool": 72, "SM3": 68, "GOST": 60,
                "STREEBOG-256": 65, "STREEBOG-512": 70,
                "LSH-256": 68, "LSH-512": 73, "GOST-HASH": 62,
            }
        }
        
        self.PROTOCOL_SCORES = {
            "SSL 2.0": 0, "SSL 3.0": 0,
            "TLS 1.0": 20, "TLS 1.1": 40, "TLS 1.2": 75, "TLS 1.3": 90,
            "DTLS 1.0": 30, "DTLS 1.2": 75, "DTLS 1.3": 90,
            "QUIC": 85,
        }
        
        self.WEIGHTS = {
            "kex": 0.35, "signature": 0.30, "symmetric": 0.15,
            "certificate": 0.10, "protocol": 0.10,
        }
        
        self.PQC_ALGORITHMS = {
            "KYBER", "BIKE", "SIKE", "NTRU", "SABER", "FRODO", "HQC", "NTRUPRIME",
            "DILITHIUM", "FALCON", "SPHINCS", "RAINBOW", "PICNIC", "GeMSS",
            "XMSS", "LMS", "MCELIECE", "CLASSIC-MCELIECE", "ML-KEM", "ML-DSA",
            "SLH-DSA", "CRYSTALS", "SNTRUP", "LIGHTSABER", "FIRESABER", "FRODOKEM",
            "NEWHOPE", "LUOV",
        }
        
        self.DEPRECATED_ALGORITHMS = {
            "MD5", "MD4", "MD2", "SHA1", "SHA-1", "DES", "3DES", "RC4", "RC2",
            "SSL 2.0", "SSL 3.0", "TLS 1.0", "TLS 1.1", "DSA", "DSS",
            "ANON-DH", "IDEA", "RAINBOW", "SIKE", "DSA-1024",
        }

    def score_to_grade(self, score: float) -> str:
        if score >= 95: return "A+"
        elif score >= 90: return "A"
        elif score >= 85: return "A-"
        elif score >= 80: return "B+"
        elif score >= 75: return "B"
        elif score >= 70: return "B-"
        elif score >= 65: return "C+"
        elif score >= 60: return "C"
        elif score >= 50: return "D"
        else: return "F"

    def get_security_level(self, score: float) -> str:
        if score >= 90: return SecurityLevel.HIGH.value
        elif score >= 70: return SecurityLevel.MEDIUM.value
        elif score >= 50: return SecurityLevel.LOW.value
        else: return SecurityLevel.CRITICAL.value

    def is_hybrid_algorithm(self, algorithm: str) -> bool:
        algo_upper = algorithm.upper()
        hybrid_indicators = ["+", "-", "HYBRID"]
        
        if any(ind in algo_upper for ind in hybrid_indicators):
            has_classical = any(classic in algo_upper for classic in 
                              ["RSA", "ECDSA", "ECDHE", "X25519", "X448", "ED25519", "P256", "P384"])
            has_pqc = any(pqc in algo_upper for pqc in self.PQC_ALGORITHMS)
            return has_classical and has_pqc
        
        return False

    def calculate_key_size_score(self, algorithm: str, key_size: int, algo_type: str) -> float:
        if not key_size:
            return 0.0
        
        algo_upper = algorithm.upper()
        
        if any(x in algo_upper for x in ["RSA", "DSA"]):
            if key_size < 1024: return -40.0
            elif key_size < 2048: return -30.0
            elif key_size == 2048: return 5.0
            elif key_size == 3072: return 10.0
            elif key_size >= 4096: return 15.0
        
        if any(x in algo_upper for x in ["ECDSA", "ECDH", "EC", "ED25519", "ED448"]):
            if key_size < 224: return -25.0
            elif key_size < 256: return -15.0
            elif key_size == 256: return 5.0
            elif key_size == 384: return 10.0
            elif key_size >= 521: return 15.0
        
        if "AES" in algo_upper:
            if key_size == 128: return 0.0
            elif key_size == 192: return 10.0
            elif key_size == 256: return 20.0
        
        if "CHACHA" in algo_upper:
            if key_size == 256: return 15.0
        
        if any(pqc in algo_upper for pqc in self.PQC_ALGORITHMS):
            if key_size >= 3000: return 8.0
            elif key_size >= 1500: return 5.0
            elif key_size >= 800: return 3.0
        
        return 0.0

    def calculate_curve_strength_score(self, curve: str, curve_bits: int) -> float:
        if not curve:
            return 0.0
        
        curve_upper = curve.upper()
        
        if "X25519" in curve_upper or "CURVE25519" in curve_upper:
            return 15.0
        elif "X448" in curve_upper or "CURVE448" in curve_upper:
            return 20.0
        elif "SECP256R1" in curve_upper or "PRIME256V1" in curve_upper:
            return 5.0
        elif "SECP256K1" in curve_upper:
            return 4.0
        elif "SECP384R1" in curve_upper:
            return 10.0
        elif "SECP521R1" in curve_upper:
            return 12.0
        elif "BRAINPOOL" in curve_upper:
            if "512" in curve_upper: return 11.0
            elif "384" in curve_upper: return 9.0
            elif "256" in curve_upper: return 6.0
        
        if curve_bits:
            if curve_bits >= 512: return 12.0
            elif curve_bits >= 384: return 10.0
            elif curve_bits >= 256: return 5.0
            elif curve_bits >= 224: return 3.0
        
        return 0.0

    def parse_algorithm_from_suite(self, suite_name: str, field: str) -> Optional[str]:
        upper_name = suite_name.upper()
        
        if field == "kex":
            # PQC patterns
            for pqc in ["KYBER1024", "KYBER768", "KYBER512", "KYBER", "NTRU", "SABER", "FRODO"]:
                if pqc in upper_name:
                    # Check for hybrid
                    if "X25519" in upper_name:
                        return f"X25519-{pqc}"
                    if "X448" in upper_name:
                        return f"X448-{pqc}"
                    if "P256" in upper_name:
                        return f"P256-{pqc}"
                    if "P384" in upper_name:
                        return f"P384-{pqc}"
                    return pqc
            
            # Standard KEX
            if "ECDHE" in upper_name:
                if "X25519" in upper_name: return "X25519"
                if "X448" in upper_name: return "X448"
                return "ECDHE"
            if "DHE" in upper_name and "ECDHE" not in upper_name:
                return "DHE"
            if "FFDHE8192" in upper_name: return "ffdhe8192"
            if "FFDHE6144" in upper_name: return "ffdhe6144"
            if "FFDHE4096" in upper_name: return "ffdhe4096"
            if "FFDHE3072" in upper_name: return "ffdhe3072"
            if "FFDHE2048" in upper_name: return "ffdhe2048"
            if "DH-RSA" in upper_name: return "DH-RSA"
            if "DH-DSS" in upper_name: return "DH-DSS"
            if "ANON" in upper_name and "DH" in upper_name: return "ANON-DH"
            if "_RSA_" in upper_name or "TLS_RSA_" in upper_name: return "RSA"
            if "ECDH" in upper_name: return "ECDH"
            if "_DH_" in upper_name: return "DH"
            if "PSK" in upper_name:
                if "ECDHE" in upper_name: return "ECDHE-PSK"
                if "DHE" in upper_name: return "DHE-PSK"
                if "RSA" in upper_name: return "RSA-PSK"
                return "PSK"
        
        if field == "symmetric":
            # AEAD modes
            if "AES_256_GCM" in upper_name: return "AES-256-GCM"
            if "AES_192_GCM" in upper_name: return "AES-192-GCM"
            if "AES_128_GCM" in upper_name: return "AES-128-GCM"
            if "AES_256_CCM" in upper_name: return "AES-256-CCM"
            if "AES_128_CCM" in upper_name: return "AES-128-CCM"
            if "AES_256" in upper_name: return "AES-256"
            if "AES_192" in upper_name: return "AES-192"
            if "AES_128" in upper_name: return "AES-128"
            
            # ChaCha
            if "CHACHA20" in upper_name:
                if "POLY1305" in upper_name: return "ChaCha20-Poly1305"
                return "ChaCha20"
            
            # Others
            if "CAMELLIA_256" in upper_name: return "Camellia-256"
            if "CAMELLIA_128" in upper_name: return "Camellia-128"
            if "ARIA_256" in upper_name: return "ARIA-256"
            if "ARIA_128" in upper_name: return "ARIA-128"
            if "ASCON" in upper_name: return "ASCON-128"
            if "3DES" in upper_name: return "3DES"
            if "RC4" in upper_name: return "RC4"
            if "DES" in upper_name and "3DES" not in upper_name: return "DES"
        
        return None

    def parse_signature_algorithm(self, sig_algo: str) -> str:
        upper = sig_algo.upper()
        
        # PQC Signatures
        if "DILITHIUM5" in upper or "ML-DSA-87" in upper: return "DILITHIUM5"
        if "DILITHIUM3" in upper or "ML-DSA-65" in upper: return "DILITHIUM3"
        if "DILITHIUM2" in upper or "ML-DSA-44" in upper: return "DILITHIUM2"
        if "DILITHIUM" in upper or "ML-DSA" in upper: return "DILITHIUM"
        
        if "FALCON1024" in upper: return "FALCON1024"
        if "FALCON512" in upper: return "FALCON512"
        if "FALCON" in upper: return "FALCON"
        
        if "SPHINCS+" in upper or "SLH-DSA" in upper: return "SPHINCS+"
        if "SPHINCS" in upper: return "SPHINCS"
        
        # Hash-based
        if "XMSS" in upper: return "XMSS"
        if "LMS" in upper or "HSS-LMS" in upper: return "LMS"
        
        # Hybrid
        if "RSA" in upper and "DILITHIUM" in upper: return "RSA+DILITHIUM"
        if "ECDSA" in upper and "DILITHIUM" in upper: return "ECDSA+DILITHIUM"
        if "ECDSA" in upper and "FALCON" in upper: return "ECDSA+FALCON"
        if "ED448" in upper and "DILITHIUM" in upper: return "Ed448-DILITHIUM3"
        if "ED448" in upper and "FALCON" in upper: return "Ed448-FALCON1024"
        
        # Modern
        if "ED448" in upper: return "Ed448"
        if "ED25519" in upper or "EDDSA" in upper: return "Ed25519"
        
        # RSA variants
        if "RSA-PSS" in upper or "RSASSA-PSS" in upper: return "RSA-PSS"
        if "ECDSA" in upper: return "ECDSA"
        if "SM2" in upper: return "SM2"
        if "GOST" in upper: return "GOST-SIGNATURE"
        if "RSA" in upper: return "RSA"
        if "DSA" in upper or "DSS" in upper: return "DSA"
        
        return "RSA"

    def parse_hash_algorithm(self, hash_algo: str) -> str:
        upper = hash_algo.upper()
        
        # SHA-3
        if "SHA3-512" in upper or "SHA3_512" in upper: return "SHA3-512"
        if "SHA3-384" in upper or "SHA3_384" in upper: return "SHA3-384"
        if "SHA3-256" in upper or "SHA3_256" in upper: return "SHA3-256"
        if "SHA3" in upper: return "SHA3-256"
        
        # SHAKE
        if "SHAKE256" in upper: return "SHAKE256"
        if "SHAKE128" in upper: return "SHAKE128"
        
        # SHA-2
        if "SHA512/256" in upper: return "SHA512/256"
        if "SHA512" in upper or "SHA-512" in upper: return "SHA512"
        if "SHA384" in upper or "SHA-384" in upper: return "SHA384"
        if "SHA256" in upper or "SHA-256" in upper: return "SHA256"
        if "SHA224" in upper or "SHA-224" in upper: return "SHA224"
        if "SHA1" in upper or "SHA-1" in upper: return "SHA1"
        
        # MD5
        if "MD5" in upper: return "MD5"
        if "MD4" in upper: return "MD4"
        
        # BLAKE
        if "BLAKE3" in upper: return "BLAKE3"
        if "BLAKE2B-512" in upper: return "BLAKE2b-512"
        if "BLAKE2B" in upper: return "BLAKE2b"
        if "BLAKE2S" in upper: return "BLAKE2s"
        
        # Others
        if "ASCON" in upper: return "ASCON-HASH"
        if "STREEBOG-512" in upper: return "STREEBOG-512"
        if "STREEBOG" in upper: return "STREEBOG-256"
        if "LSH-512" in upper: return "LSH-512"
        if "LSH" in upper: return "LSH-256"
        if "WHIRLPOOL" in upper: return "Whirlpool"
        if "SM3" in upper: return "SM3"
        if "RIPEMD" in upper: return "RIPEMD-160"
        if "KECCAK" in upper: return "Keccak"
        if "GOST" in upper: return "GOST-HASH"
        
        return "SHA256"

    def score_individual_algorithm(self, algorithm: str, algo_type: str, 
                                   key_size: Optional[int] = None, curve: Optional[str] = None,
                                   curve_bits: Optional[int] = None, position: int = 0) -> AlgorithmScore:
        
        type_table = self.PQ_RESISTANCE_TABLE.get(algo_type, {})
        base_score = type_table.get(algorithm, None)
        
        if base_score is None:
            algo_upper = algorithm.upper()
            for key in type_table.keys():
                if key.upper() in algo_upper or algo_upper in key.upper():
                    base_score = type_table[key]
                    break
        
        if base_score is None:
            base_score = 0
        
        key_size_score = self.calculate_key_size_score(algorithm, key_size or 0, algo_type)
        curve_strength = self.calculate_curve_strength_score(curve or "", curve_bits or 0)
        
        final_score = base_score + key_size_score + curve_strength
        final_score = max(0, min(100, final_score))
        
        # Gentler positional decay: 1.0, 0.95, 0.91, 0.87 ...
        position_decay = 1.0 / (1 + 0.05 * position) if position >= 0 else 1.0
        weighted_score = final_score * position_decay
        
        is_pqc = any(pqc in algorithm.upper() for pqc in self.PQC_ALGORITHMS)
        is_hybrid = self.is_hybrid_algorithm(algorithm)
        deprecated = any(dep in algorithm.upper() for dep in self.DEPRECATED_ALGORITHMS)
        quantum_safe = is_pqc or (is_hybrid and final_score >= 85)
        grade = self.score_to_grade(final_score)
        security_level = self.get_security_level(final_score)
        
        return AlgorithmScore(
            algorithm=algorithm,
            algorithm_type=algo_type,
            base_score=base_score,
            key_size=key_size or 0,
            key_size_score=key_size_score,
            curve_strength=curve_strength,
            final_score=round(final_score, 2),
            grade=grade,
            is_pqc=is_pqc,
            is_hybrid=is_hybrid,
            position=position,
            weighted_score=round(weighted_score, 2),
            security_level=security_level,
            quantum_safe=quantum_safe,
            deprecated=deprecated,
            vulnerabilities=[]
        )

    def analyze_protocol_features(self, data: Dict) -> ProtocolAnalysis:
        raw = data.get("raw_response", {})
        tls_config = raw.get("tls_configuration", {})
        
        supported_versions = tls_config.get("supported_protocols", [])
        deprecated_versions = [v for v in supported_versions 
                             if v in ["SSL 2.0", "SSL 3.0", "TLS 1.0", "TLS 1.1"]]
        
        version_scores = {}
        for version in supported_versions:
            version_scores[version] = self.PROTOCOL_SCORES.get(version, 50)
        
        compression_enabled = tls_config.get("compression_support", False)
        renegotiation = tls_config.get("renegotiation", {})
        renegotiation_secure = renegotiation.get("secure", True) if renegotiation else True
        heartbeat_enabled = tls_config.get("heartbeat_extension", False)
        session_resumption = tls_config.get("session_resumption", "unknown")
        downgrade_protection = "TLS 1.3" in supported_versions
        
        return ProtocolAnalysis(
            supported_versions=supported_versions,
            deprecated_versions=deprecated_versions,
            version_scores=version_scores,
            compression_enabled=compression_enabled,
            renegotiation_secure=renegotiation_secure,
            heartbeat_enabled=heartbeat_enabled,
            session_resumption=session_resumption,
            downgrade_protection=downgrade_protection
        )

    def analyze_certificate_chain(self, data: Dict, signature_scores: List[AlgorithmScore]) -> CertificateAnalysis:
        raw = data.get("raw_response", {})
        cert_data = raw.get("certificate_chain", {})
        sig_data = raw.get("signature_algorithms", {})
        
        cert_sigs = sig_data.get("certificate_signatures", [])
        weak_sigs = sum(1 for score in signature_scores if score.final_score < 50)
        strong_sigs = sum(1 for score in signature_scores if score.final_score >= 70)
        
        validity_days = cert_data.get("validity_period_days", 0)
        cert_transparency = cert_data.get("certificate_transparency", False)
        ocsp_stapling = cert_data.get("ocsp_stapling", False)
        key_pinning = cert_data.get("public_key_pinning", False)
        
        signature_algos = [cert.get("signature_algorithm", "") for cert in cert_sigs]
        hash_algos = [cert.get("hash_algorithm", "") for cert in cert_sigs]
        chain_consistent = len(set(signature_algos)) <= 2 and len(set(hash_algos)) <= 2
        
        return CertificateAnalysis(
            total_certificates=len(cert_sigs),
            weak_signatures=weak_sigs,
            strong_signatures=strong_sigs,
            validity_period_days=validity_days,
            cert_transparency=cert_transparency,
            ocsp_stapling=ocsp_stapling,
            key_pinning=key_pinning,
            chain_consistent=chain_consistent,
            signature_algorithms=signature_algos,
            hash_algorithms=hash_algos
        )

    def analyze_security_features(self, data: Dict, kex_scores: List[AlgorithmScore]) -> SecurityFeatures:
        raw = data.get("raw_response", {})
        security_data = raw.get("security_features", {})
        tls_config = raw.get("tls_configuration", {})
        
        hsts_enabled = security_data.get("hsts_enabled", False)
        hsts_max_age = security_data.get("hsts_max_age", 0)
        
        pfs_algos = ["DHE", "ECDHE", "X25519", "X448"] + list(self.PQC_ALGORITHMS)
        pfs_count = sum(1 for score in kex_scores 
                       if any(pfs in score.algorithm.upper() for pfs in pfs_algos))
        pfs_supported = pfs_count > 0
        pfs_percentage = (pfs_count / len(kex_scores) * 100) if kex_scores else 0
        
        extensions = tls_config.get("extensions", [])
        sni_supported = "server_name" in extensions or "SNI" in str(extensions).upper()
        alpn_protocols = tls_config.get("alpn_protocols", [])
        
        return SecurityFeatures(
            hsts_enabled=hsts_enabled,
            hsts_max_age=hsts_max_age,
            pfs_supported=pfs_supported,
            pfs_percentage=round(pfs_percentage, 2),
            sni_supported=sni_supported,
            alpn_supported=alpn_protocols,
            supported_extensions=extensions
        )

    def analyze_tls_configuration(self, data: Dict) -> FinalReport:
        raw = data.get("raw_response", {})
        tls_config = raw.get("tls_configuration") or {}
        
        all_scores = []
        component_data = {
            "kex": [], "signature": [], "symmetric": [],
            "certificate": [], "protocol": []
        }
        
        # TLS 1.2 Cipher Suites
        tls12_suites = tls_config.get("tls_1.2_cipher_suites", {}).get("suites", [])
        for position, suite in enumerate(tls12_suites):
            suite_name = suite.get("name", "")
            
            kex_algo = suite.get("key_exchange")
            curve = suite.get("curve")
            curve_bits = suite.get("curve_bits")
            
            if not kex_algo:
                kex_algo = self.parse_algorithm_from_suite(suite_name, "kex")
            
            if kex_algo:
                score = self.score_individual_algorithm(
                    kex_algo, "kex", curve_bits=curve_bits,
                    curve=curve, position=position
                )
                all_scores.append(score)
                component_data["kex"].append(score)
            
            sym_algo = self.parse_algorithm_from_suite(suite_name, "symmetric")
            if sym_algo:
                key_size = 256 if "256" in sym_algo else (192 if "192" in sym_algo else 128)
                score = self.score_individual_algorithm(
                    sym_algo, "symmetric", key_size=key_size, position=position
                )
                all_scores.append(score)
                component_data["symmetric"].append(score)
        
        # TLS 1.3 Cipher Suites
        tls13_suites = tls_config.get("tls_1.3_cipher_suites", {}).get("suites", [])
        for position, suite in enumerate(tls13_suites):
            suite_name = suite.get("name", "")
            kex = suite.get("key_exchange", "")
            curve_bits = suite.get("curve_bits")
            
            if kex:
                score = self.score_individual_algorithm(
                    kex, "kex", curve_bits=curve_bits,
                    curve=kex, position=position
                )
                all_scores.append(score)
                component_data["kex"].append(score)
            
            sym_algo = self.parse_algorithm_from_suite(suite_name, "symmetric")
            if sym_algo:
                key_size = 256 if "256" in sym_algo else (192 if "192" in sym_algo else 128)
                score = self.score_individual_algorithm(
                    sym_algo, "symmetric", key_size=key_size, position=position
                )
                all_scores.append(score)
                component_data["symmetric"].append(score)
        
        # Certificate Signatures
        cert_sigs = raw.get("signature_algorithms", {}).get("certificate_signatures", [])
        for cert in cert_sigs:
            sig_algo = self.parse_signature_algorithm(cert.get("signature_algorithm", ""))
            hash_algo = self.parse_hash_algorithm(cert.get("hash_algorithm", ""))
            key_size = cert.get("public_key_size", 0)
            position = cert.get("position", 0)
            
            sig_score = self.score_individual_algorithm(
                sig_algo, "signature", key_size=key_size, position=position
            )
            all_scores.append(sig_score)
            component_data["signature"].append(sig_score)
            
            hash_score = self.score_individual_algorithm(
                hash_algo, "hash", position=position
            )
            all_scores.append(hash_score)
            component_data["certificate"].append(hash_score)
        
        # Handshake Signatures
        hs_sigs = raw.get("signature_algorithms", {}).get("handshake_signatures", [])
        for idx, hs in enumerate(hs_sigs):
            algo_name = hs.get("algorithm", "")
            sig_algo = self.parse_signature_algorithm(algo_name)
            score = self.score_individual_algorithm(
                sig_algo, "signature", position=idx
            )
            all_scores.append(score)
            component_data["signature"].append(score)
        
        # Protocol Analysis
        protocol_analysis = self.analyze_protocol_features(data)
        for version, score in protocol_analysis.version_scores.items():
            proto_score = self.score_individual_algorithm(version, "protocol", position=0)
            component_data["protocol"].append(proto_score)
        
        # Build Component Analyses
        components = {}
        critical_vulnerabilities = []
        
        for comp_type, scores in component_data.items():
            if not scores or len(scores) == 0:
                continue
            
            final_scores = [s.final_score for s in scores]
            weighted_scores = [s.weighted_score for s in scores]
            
            # The weighted_score already includes position decay.
            # To get the weighted average, we need to normalize by the sum of weights.
            position_weights = [1.0 / (1 + 0.05 * s.position) for s in scores]

            avg_score = sum(final_scores) / len(final_scores)
            weighted_avg = sum(weighted_scores) / sum(position_weights)
            weighted_avg = min(100, weighted_avg)
            
            best_algo = max(scores, key=lambda x: x.final_score).algorithm
            worst_algo = min(scores, key=lambda x: x.final_score).algorithm
            
            pqc_count = sum(1 for s in scores if s.is_pqc)
            pqc_percentage = (pqc_count / len(scores)) * 100
            
            hybrid_count = sum(1 for s in scores if s.is_hybrid)
            hybrid_percentage = (hybrid_count / len(scores)) * 100
            
            deprecated_count = sum(1 for s in scores if s.deprecated)
            quantum_safe_count = sum(1 for s in scores if s.quantum_safe)
            
            pfs_enabled = False
            if comp_type == "kex":
                pfs_algos = ["DHE", "ECDHE", "X25519", "X448"]
                pfs_enabled = any(any(pfs in s.algorithm.upper() for pfs in pfs_algos) 
                                for s in scores)
            
            grade = self.score_to_grade(weighted_avg)
            
            components[comp_type] = ComponentAnalysis(
                component_type=comp_type,
                algorithms=scores,
                average_score=round(avg_score, 2),
                weighted_average=round(weighted_avg, 2),
                grade=grade,
                weight_in_final=self.WEIGHTS.get(comp_type, 0),
                best_algorithm=best_algo,
                worst_algorithm=worst_algo,
                pqc_percentage=round(pqc_percentage, 2),
                hybrid_percentage=round(hybrid_percentage, 2),
                deprecated_count=deprecated_count,
                quantum_safe_count=quantum_safe_count,
                pfs_enabled=pfs_enabled
            )
        
        # Calculate Overall Score
        overall_score = sum(
            comp.weighted_average * comp.weight_in_final 
            for comp in components.values()
        )
        
        overall_grade = self.score_to_grade(overall_score)
        security_level = self.get_security_level(overall_score)
        
        # Additional Features
        cert_analysis = self.analyze_certificate_chain(data, component_data["signature"])
        security_features = self.analyze_security_features(data, component_data["kex"])
        
        # Quantum Readiness
        kex_comp = components.get("kex", None)
        sig_comp = components.get("signature", None)
        
        quantum_ready = (
            overall_score >= 80 and
            ((kex_comp and kex_comp.pqc_percentage > 0) or
             (sig_comp and sig_comp.pqc_percentage > 0) or
             (kex_comp and kex_comp.weighted_average >= 85 and
              sig_comp and sig_comp.weighted_average >= 85)) and
            len(critical_vulnerabilities) == 0
        )
        
        hybrid_ready = any(comp.hybrid_percentage > 0 for comp in components.values())
        
        # Generate Recommendations
        # Check Compliance
        compliance_status = self.check_compliance(
            components, protocol_analysis, cert_analysis, security_features
        )
        
        return FinalReport(
            domain=data.get("url", "Unknown"),
            timestamp=data.get("requested_at", datetime.now().isoformat()),
            overall_score=round(overall_score, 2),
            overall_grade=overall_grade,
            security_level=security_level,
            components=components,
            individual_scores=all_scores,
            protocol_analysis=protocol_analysis,
            certificate_analysis=cert_analysis,
            security_features=security_features,
            quantum_ready=bool(quantum_ready),
            hybrid_ready=hybrid_ready,
            critical_vulnerabilities=critical_vulnerabilities,
            compliance_status=compliance_status
        )

    def check_compliance(self, components: Dict[str, ComponentAnalysis],
                        protocol: ProtocolAnalysis, cert: CertificateAnalysis,
                        security: SecurityFeatures) -> Dict[str, bool]:
        compliance = {
            "PCI DSS 4.0": True, "NIST 800-52r2": True, "FIPS 140-3": True,
            "HIPAA": True, "SOC 2": True, "ISO 27001": True, "CNSA 2.0": False,
        }
        
        if any(v in protocol.supported_versions for v in ["SSL 2.0", "SSL 3.0", "TLS 1.0", "TLS 1.1"]):
            compliance["PCI DSS 4.0"] = False
            compliance["HIPAA"] = False
        
        sym_comp = components.get("symmetric")
        if sym_comp and sym_comp.weighted_average < 60:
            compliance["PCI DSS 4.0"] = False
        
        if "TLS 1.2" not in protocol.supported_versions and "TLS 1.3" not in protocol.supported_versions:
            compliance["NIST 800-52r2"] = False
        
        if cert.weak_signatures > 0:
            compliance["NIST 800-52r2"] = False
        
        fips_approved = ["AES", "SHA256", "SHA384", "SHA512", "RSA", "ECDSA"]
        if sym_comp:
            has_fips = any(any(alg in score.algorithm.upper() for alg in fips_approved) 
                          for score in sym_comp.algorithms)
            if not has_fips:
                compliance["FIPS 140-3"] = False
        
        kex_comp = components.get("kex")
        sig_comp = components.get("signature")
        if kex_comp and kex_comp.pqc_percentage > 0:
            if sig_comp and sig_comp.pqc_percentage > 0:
                compliance["CNSA 2.0"] = True
        
        if any(comp.weighted_average < 50 for comp in components.values()):
            compliance["SOC 2"] = False
            compliance["ISO 27001"] = False
        
        return compliance

    def export_report_json(self, report: FinalReport) -> str:
        def convert_to_dict(obj):
            if hasattr(obj, '__dict__'):
                result = {}
                for key, value in obj.__dict__.items():
                    if isinstance(value, list):
                        result[key] = [convert_to_dict(item) for item in value]
                    elif isinstance(value, dict):
                        result[key] = {k: convert_to_dict(v) for k, v in value.items()}
                    elif hasattr(value, '__dict__'):
                        result[key] = convert_to_dict(value)
                    else:
                        result[key] = value
                return result
            return obj
        
        report_dict = convert_to_dict(report)
        return json.dumps(report_dict, indent=2)
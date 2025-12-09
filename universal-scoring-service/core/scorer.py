"""
Universal PQC Scoring Engine
SINGLE implementation that works for agent, TLS, and repository scans
"""
from typing import List, Dict, Optional
from .algorithms import PQ_RESISTANCE_TABLE, PQC_ALGORITHMS, DEPRECATED_ALGORITHMS, HYBRID_ALGORITHMS
from .models import AlgorithmScoreOutput, ComponentScore, ProtocolAnalysis, CertificateAnalysis, SecurityFeatures
import logging
import re
from datetime import datetime

logger = logging.getLogger(__name__)

class UniversalPQCScorer:
    """
    Single universal scoring engine
    Works for ANY source: agent audits, TLS scans, repository scans
    """
    
    def __init__(self):
        self.resistance_table = PQ_RESISTANCE_TABLE
        self.pqc_algorithms = PQC_ALGORITHMS
        self.deprecated_algorithms = DEPRECATED_ALGORITHMS
        self.hybrid_algorithms = HYBRID_ALGORITHMS
        
        self.PROTOCOL_SCORES = {
            "SSL 2.0": 0, "SSL 3.0": 0,
            "TLS 1.0": 20, "TLS 1.1": 40, "TLS 1.2": 75, "TLS 1.3": 90,
            "DTLS 1.0": 30, "DTLS 1.2": 75, "DTLS 1.3": 90,
            "QUIC": 85,
        }
        
        self.component_weights = {
            "kex": 0.35, "signature": 0.30, "symmetric": 0.20, "hash": 0.15,
            "protocol": 0.10, "certificate": 0.10
        }

    def score_algorithms(
        self, 
        algorithms: List[Dict],
        scoring_type: str = "generic",
        metadata: Dict = None,
        raw_response: Dict = None
    ) -> Dict:
        """
        Main entry point - scores ANY list of algorithms
        """
        if not algorithms:
            return self._empty_result(scoring_type)
        
        scored_algorithms = []
        for algo in algorithms:
            score = self._score_single_algorithm(
                name=algo.get("name", ""),
                algo_type=algo.get("algorithm_type", "symmetric"),
                key_size=algo.get("key_size"),
                curve=algo.get("curve"),
                curve_bits=algo.get("curve_bits"),
                position=algo.get("position", 0),
                context=algo.get("context", {})
            )
            scored_algorithms.append(score)
        
        components_data = self._group_by_component(scored_algorithms)
        
        components = {}
        for comp_type, scores in components_data.items():
            if scores:
                components[comp_type] = self._aggregate_component(scores, comp_type)
        
        overall_score = self._calculate_overall_score(components)
        overall_grade = self._score_to_grade(overall_score)
        security_level = self._determine_security_level(overall_score)
        quantum_ready = self._check_quantum_readiness(components, overall_score)
        hybrid_ready = self._check_hybrid_readiness(scored_algorithms)
        
        vulnerabilities = self._identify_vulnerabilities(scored_algorithms, components)
        
        compliance = self._check_compliance(components, overall_score)
        
        protocol_analysis = None
        certificate_analysis = None
        security_features = None
        if scoring_type == "tls" and raw_response:
            data_for_analysis = { "raw_response": raw_response }
            protocol_analysis = self._analyze_protocol_features(data_for_analysis)
            sig_scores = [s for s in scored_algorithms if s.algorithm_type == 'signature']
            certificate_analysis = self._analyze_certificate_chain(data_for_analysis, sig_scores)
            kex_scores = [s for s in scored_algorithms if s.algorithm_type == 'kex']
            security_features = self._analyze_security_features(data_for_analysis, kex_scores)

        return {
            "domain": metadata.get("domain"),
            "timestamp": datetime.now().isoformat(),
            "overall_score": round(overall_score, 2),
            "overall_grade": overall_grade,
            "security_level": security_level,
            "quantum_ready": quantum_ready,
            "hybrid_ready": hybrid_ready,
            "components": {k: v.dict() for k, v in components.items()},
            "algorithm_scores": [s.dict() for s in scored_algorithms],
            "protocol_analysis": protocol_analysis.dict() if protocol_analysis else None,
            "certificate_analysis": certificate_analysis.dict() if certificate_analysis else None,
            "security_features": security_features.dict() if security_features else None,
            "critical_vulnerabilities": vulnerabilities,
            "compliance_status": compliance,
            "metadata": metadata
        }
    
    def _score_single_algorithm(
        self,
        name: str,
        algo_type: str,
        key_size: Optional[int] = None,
        curve: Optional[str] = None,
        curve_bits: Optional[int] = None,
        position: int = 0,
        context: Dict = None
    ) -> AlgorithmScoreOutput:
        type_table = self.resistance_table.get(algo_type, {})
        base_score = type_table.get(name.upper(), 0)
        
        if base_score == 0:
            base_score = self._fuzzy_lookup(name, type_table)
        
        key_size_score = self._calculate_key_size_bonus(name, key_size or 0, algo_type)
        curve_strength = self._calculate_curve_bonus(curve or "", curve_bits or 0)
        
        final_score = base_score + key_size_score + curve_strength
        final_score = max(0, min(100, final_score))
        
        position_decay = 1.0 / (1 + 0.05 * position)
        weighted_score = final_score * position_decay
        
        is_pqc = any(pqc in name.upper() for pqc in self.pqc_algorithms)
        is_hybrid = any(h in name.upper() for h in self.hybrid_algorithms)
        deprecated = any(dep in name.upper() for dep in self.deprecated_algorithms)
        quantum_safe, safety_reason = self._determine_quantum_safety(
            name, algo_type, final_score, key_size or 0, is_pqc
        )
        
        return AlgorithmScoreOutput(
            algorithm=name,
            algorithm_type=algo_type,
            base_score=base_score,
            key_size=key_size or 0,
            key_size_score=key_size_score,
            curve_strength=curve_strength,
            final_score=round(final_score, 2),
            grade=self._score_to_grade(final_score),
            is_pqc=is_pqc,
            is_hybrid=is_hybrid,
            position=position,
            weighted_score=round(weighted_score, 2),
            security_level=self._determine_security_level(final_score),
            quantum_safe=quantum_safe,
            quantum_safety_reason=safety_reason,
            deprecated=deprecated
        )

    def _group_by_component(self, scores: List[AlgorithmScoreOutput]) -> Dict[str, List[AlgorithmScoreOutput]]:
        grouped = {"kex": [], "signature": [], "symmetric": [], "hash": [], "protocol": []}
        for score in scores:
            if score.algorithm_type in grouped:
                grouped[score.algorithm_type].append(score)
        return grouped
    
    def _aggregate_component(self, scores: List[AlgorithmScoreOutput], comp_type: str) -> ComponentScore:
        if not scores:
            return None
        
        final_scores = [s.final_score for s in scores]
        weighted_scores = [s.weighted_score for s in scores]
        position_weights = [1.0 / (1 + 0.05 * s.position) for s in scores]
        
        avg_score = sum(final_scores) / len(final_scores)
        weighted_avg = sum(weighted_scores) / sum(position_weights) if sum(position_weights) > 0 else avg_score
        
        pqc_count = sum(1 for s in scores if s.is_pqc)
        pqc_percentage = (pqc_count / len(scores)) * 100 if scores else 0
        hybrid_count = sum(1 for s in scores if s.is_hybrid)
        hybrid_percentage = (hybrid_count / len(scores)) * 100 if scores else 0
        quantum_safe_count = sum(1 for s in scores if s.quantum_safe)
        deprecated_count = sum(1 for s in scores if s.deprecated)
        
        pfs_algos = ["DHE", "ECDHE", "X25519", "X448"] + list(self.pqc_algorithms)
        pfs_enabled = any(any(pfs in s.algorithm.upper() for pfs in pfs_algos) for s in scores) if comp_type == "kex" else False

        return ComponentScore(
            component_type=comp_type,
            algorithms=scores,
            score=round(weighted_avg, 2),
            average_score=round(avg_score, 2),
            weighted_average=round(weighted_avg, 2),
            grade=self._score_to_grade(weighted_avg),
            weight_in_final=self.component_weights.get(comp_type, 0.1),
            best_algorithm=max(scores, key=lambda x: x.final_score).algorithm,
            worst_algorithm=min(scores, key=lambda x: x.final_score).algorithm,
            pqc_percentage=round(pqc_percentage, 2),
            hybrid_percentage=round(hybrid_percentage, 2),
            deprecated_count=deprecated_count,
            quantum_safe_count=quantum_safe_count,
            algorithm_count=len(scores),
            pfs_enabled=pfs_enabled
        )

    def _calculate_overall_score(self, components: Dict[str, ComponentScore]) -> float:
        total_score = 0
        total_weight = 0
        
        for comp in components.values():
            weight = self.component_weights.get(comp.component_type, 0.1)
            total_score += comp.weighted_average * weight
            total_weight += weight
        
        return total_score / total_weight if total_weight > 0 else 0

    def _check_quantum_readiness(self, components: Dict[str, ComponentScore], overall_score: float) -> bool:
        if overall_score < 80:
            return False
        
        has_pqc = any(comp.pqc_percentage > 0 for comp in components.values())
        
        high_quantum_safe = all(
            comp.quantum_safe_count / comp.algorithm_count >= 0.5
            for comp in components.values() if comp.algorithm_count > 0
        )
        
        return has_pqc or high_quantum_safe

    def _check_hybrid_readiness(self, scores: List[AlgorithmScoreOutput]) -> bool:
        return any(s.is_hybrid for s in scores)
    
    def _identify_vulnerabilities(self, scores: List[AlgorithmScoreOutput], components: Dict[str, ComponentScore]) -> List[str]:
        vulns = []
        
        deprecated_algos = [s.algorithm for s in scores if s.deprecated]
        if deprecated_algos:
            vulns.append(f"Deprecated algorithms detected: {', '.join(deprecated_algos[:3])}")
        
        for comp_type, comp_data in components.items():
            if comp_data.weighted_average < 50:
                vulns.append(f"Critical weakness in {comp_type}: score {comp_data.weighted_average}")
        
        if "kex" in components and components["kex"].pqc_percentage == 0:
            vulns.append("No post-quantum key exchange algorithms detected")
        
        return vulns

    def _check_compliance(self, components: Dict[str, ComponentScore], overall_score: float) -> Dict[str, bool]:
        return {
            "PCI DSS 4.0": overall_score >= 70 and all(
                comp.weighted_average >= 60 for comp in components.values()
            ),
            "NIST 800-52r2": overall_score >= 75,
            "FIPS 140-3": overall_score >= 80,
            "CNSA 2.0 (Quantum-Ready)": overall_score >= 85 and any(
                comp.pqc_percentage > 0 for comp in components.values()
            )
        }

    def _determine_security_level(self, score: float) -> str:
        if score >= 90: return "excellent"
        elif score >= 75: return "high"
        elif score >= 60: return "medium"
        elif score >= 40: return "low"
        else: return "critical"
    
    def _score_to_grade(self, score: float) -> str:
        if score >= 97: return "A+"
        elif score >= 93: return "A"
        elif score >= 90: return "A-"
        elif score >= 87: return "B+"
        elif score >= 83: return "B"
        elif score >= 80: return "B-"
        elif score >= 77: return "C+"
        elif score >= 73: return "C"
        elif score >= 70: return "C-"
        elif score >= 60: return "D"
        else: return "F"
    
    def _determine_quantum_safety(
        self, name: str, algo_type: str, score: float, key_size: int, is_pqc: bool
    ) -> tuple[bool, str]:
        if is_pqc:
            return True, f"Post-quantum algorithm ({name})"
        
        if algo_type in ["symmetric", "hash"]:
            if key_size >= 256 or score >= 85:
                return True, f"{algo_type.capitalize()} with {key_size}-bit key (Grover-resistant)"
        
        if score >= 90:
            return True, f"High security score ({score}) indicates strong resistance"
        
        return False, "Not quantum-resistant"

    def _fuzzy_lookup(self, name: str, table: Dict) -> float:
        name_upper = name.upper()
        for key in table.keys():
            if key in name_upper or name_upper in key:
                return table[key]
        return 0
    
    def _calculate_key_size_bonus(self, algo: str, key_size: int, algo_type: str) -> float:
        if key_size == 0:
            return 0
        
        if algo_type == "symmetric":
            if key_size >= 256: return 10
            elif key_size >= 192: return 5
            elif key_size >= 128: return 0
            else: return -20
        
        elif algo_type in ["kex", "signature"]:
            if "RSA" in algo.upper() or "DH" in algo.upper():
                if key_size >= 4096: return 10
                elif key_size >= 2048: return 0
                else: return -30
        
        return 0
    
    def _calculate_curve_bonus(self, curve: str, curve_bits: int) -> float:
        if not curve:
            return 0
        
        curve_upper = curve.upper()
        
        if any(modern in curve_upper for modern in ["X25519", "X448", "ED25519", "ED448"]):
            return 15
        
        if "P-521" in curve_upper or "SECP521" in curve_upper: return 10
        elif "P-384" in curve_upper or "SECP384" in curve_upper: return 5
        elif "P-256" in curve_upper or "SECP256" in curve_upper: return 0
        elif "P-224" in curve_upper or "SECP224" in curve_upper: return -10
        
        if curve_bits >= 512: return 10
        elif curve_bits >= 384: return 5
        elif curve_bits >= 256: return 0
        elif curve_bits > 0: return -10
        
        return 0

    def _analyze_protocol_features(self, data: Dict) -> ProtocolAnalysis:
        raw = data.get("raw_response", {})
        tls_config = raw.get("tls_configuration", {})
        
        supported_versions = tls_config.get("supported_protocols", [])
        deprecated_versions = [v for v in supported_versions 
                             if v in ["SSL 2.0", "SSL 3.0", "TLS 1.0", "TLS 1.1"]]
        
        version_scores = {v: self.PROTOCOL_SCORES.get(v, 50) for v in supported_versions}
        
        return ProtocolAnalysis(
            supported_versions=supported_versions,
            deprecated_versions=deprecated_versions,
            version_scores=version_scores,
            compression_enabled=tls_config.get("compression_support", False),
            renegotiation_secure=tls_config.get("renegotiation", {}).get("secure", True),
            heartbeat_enabled=tls_config.get("heartbeat_extension", False),
            session_resumption=tls_config.get("session_resumption", "unknown"),
            downgrade_protection="TLS 1.3" in supported_versions
        )

    def _analyze_certificate_chain(self, data: Dict, signature_scores: List[AlgorithmScoreOutput]) -> CertificateAnalysis:
        raw = data.get("raw_response", {})
        cert_data = raw.get("certificate_chain", {})
        sig_data = raw.get("signature_algorithms", {})
        
        cert_sigs = sig_data.get("certificate_signatures", [])
        weak_sigs = sum(1 for score in signature_scores if score.final_score < 50)
        strong_sigs = sum(1 for score in signature_scores if score.final_score >= 70)
        
        return CertificateAnalysis(
            total_certificates=len(cert_sigs),
            weak_signatures=weak_sigs,
            strong_signatures=strong_sigs,
            validity_period_days=cert_data.get("validity_period_days", 0),
            cert_transparency=cert_data.get("certificate_transparency", False),
            ocsp_stapling=cert_data.get("ocsp_stapling", False),
            key_pinning=cert_data.get("public_key_pinning", False),
            chain_consistent=len(set(cert.get("signature_algorithm", "") for cert in cert_sigs)) <= 2,
            signature_algorithms=[cert.get("signature_algorithm", "") for cert in cert_sigs],
            hash_algorithms=[cert.get("hash_algorithm", "") for cert in cert_sigs]
        )

    def _analyze_security_features(self, data: Dict, kex_scores: List[AlgorithmScoreOutput]) -> SecurityFeatures:
        raw = data.get("raw_response", {})
        security_data = raw.get("security_features", {})
        tls_config = raw.get("tls_configuration", {})
        
        pfs_algos = ["DHE", "ECDHE", "X25519", "X448"] + list(self.pqc_algorithms)
        pfs_count = sum(1 for score in kex_scores if any(pfs in score.algorithm.upper() for pfs in pfs_algos))
        pfs_supported = pfs_count > 0
        pfs_percentage = (pfs_count / len(kex_scores) * 100) if kex_scores else 0
        
        extensions = tls_config.get("extensions", [])
        
        return SecurityFeatures(
            hsts_enabled=security_data.get("hsts_enabled", False),
            hsts_max_age=security_data.get("hsts_max_age", 0),
            pfs_supported=pfs_supported,
            pfs_percentage=round(pfs_percentage, 2),
            sni_supported="server_name" in extensions,
            alpn_supported=tls_config.get("alpn_protocols", []),
            supported_extensions=extensions
        )
    
    def _empty_result(self, scoring_type: str) -> Dict:
        return {
            "overall_score": 0,
            "overall_grade": "F",
            "security_level": "critical",
            "quantum_ready": False,
            "hybrid_ready": False,
            "components": {},
            "algorithm_scores": [],
            "critical_vulnerabilities": ["No algorithms provided for scoring"],
            "compliance_status": {},
            "metadata": {"scoring_type": scoring_type}
        }
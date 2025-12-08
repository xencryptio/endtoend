"""
Universal PQC Scoring Engine
SINGLE implementation that works for agent, TLS, and repository scans
"""
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional
from .algorithms import PQ_RESISTANCE_TABLE, PQC_ALGORITHMS, DEPRECATED_ALGORITHMS, HYBRID_ALGORITHMS
import logging

logger = logging.getLogger(__name__)

@dataclass
class AlgorithmScore:
    """Internal scoring result"""
    algorithm: str
    algorithm_type: str
    base_score: float
    key_size: int
    key_size_score: float
    final_score: float
    grade: str
    is_pqc: bool
    quantum_safe: bool
    quantum_safety_reason: str
    deprecated: bool
    position: int
    weighted_score: float
    context: Dict = None  # Preserve original context

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
        
        # Component weights (can be customized per scoring_type if needed)
        self.component_weights = {
            "kex": 0.35,
            "signature": 0.30,
            "symmetric": 0.20,
            "hash": 0.15
        }
    
    def score_algorithms(
        self, 
        algorithms: List[Dict],
        scoring_type: str = "generic"
    ) -> Dict:
        """
        Main entry point - scores ANY list of algorithms
        
        Args:
            algorithms: List of algorithm dicts with keys:
                - name, algorithm_type, key_size, curve, curve_bits, position
            scoring_type: "agent", "tls", or "repository" (for context only)
        
        Returns:
            Complete scoring report with overall score, components, and details
        """
        if not algorithms:
            return self._empty_result(scoring_type)
        
        # Step 1: Score each individual algorithm
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
        
        # Step 2: Group by component type
        components_data = self._group_by_component(scored_algorithms)
        
        # Step 3: Aggregate component scores
        components = {}
        for comp_type, scores in components_data.items():
            if scores:
                components[comp_type] = self._aggregate_component(scores, comp_type)
        
        # Step 4: Calculate overall metrics
        overall_score = self._calculate_overall_score(components)
        overall_grade = self._score_to_grade(overall_score)
        security_level = self._determine_security_level(overall_score)
        quantum_ready = self._check_quantum_readiness(components, overall_score)
        hybrid_ready = self._check_hybrid_readiness(scored_algorithms)
        
        # Step 5: Identify critical vulnerabilities
        vulnerabilities = self._identify_vulnerabilities(scored_algorithms, components)
        
        # Step 6: Check compliance (can be expanded per scoring_type)
        compliance = self._check_compliance(components, overall_score)
        
        return {
            "overall_score": round(overall_score, 2),
            "overall_grade": overall_grade,
            "security_level": security_level,
            "quantum_ready": quantum_ready,
            "hybrid_ready": hybrid_ready,
            "components": components,
            "algorithm_scores": [asdict(s) for s in scored_algorithms],
            "critical_vulnerabilities": vulnerabilities,
            "compliance_status": compliance
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
    ) -> AlgorithmScore:
        """Score a single algorithm - PURE SCORING LOGIC"""
        
        # Lookup base score
        type_table = self.resistance_table.get(algo_type, {})
        base_score = type_table.get(name.upper(), 0)
        
        # If not found, try partial match (e.g., "TLS_AES_256_GCM_SHA384" -> "AES-256")
        if base_score == 0:
            base_score = self._fuzzy_lookup(name, type_table)
        
        # Calculate adjustments
        key_size_score = self._calculate_key_size_bonus(name, key_size or 0, algo_type)
        curve_strength = self._calculate_curve_bonus(curve or "", curve_bits or 0)
        
        # Final score with adjustments
        final_score = base_score + key_size_score + curve_strength
        final_score = max(0, min(100, final_score))
        
        # Apply position decay (earlier in list = more important)
        position_decay = 1.0 / (1 + 0.05 * position)
        weighted_score = final_score * position_decay
        
        # Classifications
        is_pqc = any(pqc in name.upper() for pqc in self.pqc_algorithms)
        deprecated = any(dep in name.upper() for dep in self.deprecated_algorithms)
        quantum_safe, safety_reason = self._determine_quantum_safety(
            name, algo_type, final_score, key_size or 0, is_pqc
        )
        
        return AlgorithmScore(
            algorithm=name,
            algorithm_type=algo_type,
            base_score=base_score,
            key_size=key_size or 0,
            key_size_score=key_size_score,
            final_score=round(final_score, 2),
            grade=self._score_to_grade(final_score),
            is_pqc=is_pqc,
            quantum_safe=quantum_safe,
            quantum_safety_reason=safety_reason,
            deprecated=deprecated,
            position=position,
            weighted_score=round(weighted_score, 2),
            context=context or {}
        )
    
    def _group_by_component(self, scores: List[AlgorithmScore]) -> Dict[str, List[AlgorithmScore]]:
        """Group scored algorithms by component type"""
        grouped = {"kex": [], "signature": [], "symmetric": [], "hash": []}
        for score in scores:
            if score.algorithm_type in grouped:
                grouped[score.algorithm_type].append(score)
        return grouped
    
    def _aggregate_component(self, scores: List[AlgorithmScore], comp_type: str) -> Dict:
        """Aggregate scores for a single component"""
        if not scores:
            return {}
        
        # Calculate averages
        final_scores = [s.final_score for s in scores]
        weighted_scores = [s.weighted_score for s in scores]
        position_weights = [1.0 / (1 + 0.05 * s.position) for s in scores]
        
        avg_score = sum(final_scores) / len(final_scores)
        weighted_avg = sum(weighted_scores) / sum(position_weights) if sum(position_weights) > 0 else avg_score
        
        # PQC statistics
        pqc_count = sum(1 for s in scores if s.is_pqc)
        pqc_percentage = (pqc_count / len(scores)) * 100
        quantum_safe_count = sum(1 for s in scores if s.quantum_safe)
        
        return {
            "component_type": comp_type,
            "average_score": round(avg_score, 2),
            "weighted_average": round(weighted_avg, 2),
            "grade": self._score_to_grade(weighted_avg),
            "pqc_percentage": round(pqc_percentage, 2),
            "quantum_safe_count": quantum_safe_count,
            "algorithm_count": len(scores)
        }
    
    def _calculate_overall_score(self, components: Dict) -> float:
        """Calculate weighted overall score from all components"""
        total_score = 0
        total_weight = 0
        
        for comp_type, comp_data in components.items():
            weight = self.component_weights.get(comp_type, 0.1)
            total_score += comp_data["weighted_average"] * weight
            total_weight += weight
        
        return total_score / total_weight if total_weight > 0 else 0
    
    def _check_quantum_readiness(self, components: Dict, overall_score: float) -> bool:
        """Determine if configuration is quantum-ready"""
        # Quantum ready if:
        # 1. Overall score >= 80 AND
        # 2. At least one component has PQC algorithms OR
        # 3. All components have high quantum-safe percentages
        
        if overall_score < 80:
            return False
        
        has_pqc = any(comp.get("pqc_percentage", 0) > 0 for comp in components.values())
        
        high_quantum_safe = all(
            comp.get("quantum_safe_count", 0) / comp.get("algorithm_count", 1) >= 0.5
            for comp in components.values() if comp.get("algorithm_count", 0) > 0
        )
        
        return has_pqc or high_quantum_safe
    
    def _check_hybrid_readiness(self, scores: List[AlgorithmScore]) -> bool:
        """Check if configuration uses hybrid algorithms"""
        return any(
            any(hybrid in s.algorithm.upper() for hybrid in self.hybrid_algorithms)
            for s in scores
        )
    
    def _identify_vulnerabilities(self, scores: List[AlgorithmScore], components: Dict) -> List[str]:
        """Identify critical security vulnerabilities"""
        vulns = []
        
        # Check for deprecated algorithms
        deprecated_algos = [s.algorithm for s in scores if s.deprecated]
        if deprecated_algos:
            vulns.append(f"Deprecated algorithms detected: {', '.join(deprecated_algos[:3])}")
        
        # Check for weak component scores
        for comp_type, comp_data in components.items():
            if comp_data.get("weighted_average", 0) < 50:
                vulns.append(f"Critical weakness in {comp_type}: score {comp_data['weighted_average']}")
        
        # Check for missing PQC in key exchange
        if "kex" in components and components["kex"].get("pqc_percentage", 0) == 0:
            vulns.append("No post-quantum key exchange algorithms detected")
        
        return vulns
    
    def _check_compliance(self, components: Dict, overall_score: float) -> Dict[str, bool]:
        """Check compliance against security standards"""
        return {
            "PCI DSS 4.0": overall_score >= 70 and all(
                comp.get("weighted_average", 0) >= 60 for comp in components.values()
            ),
            "NIST 800-52r2": overall_score >= 75,
            "FIPS 140-3": overall_score >= 80,
            "CNSA 2.0 (Quantum-Ready)": overall_score >= 85 and any(
                comp.get("pqc_percentage", 0) > 0 for comp in components.values()
            )
        }
    
    def _determine_security_level(self, score: float) -> str:
        """Map score to security level"""
        if score >= 90: return "excellent"
        elif score >= 75: return "high"
        elif score >= 60: return "medium"
        elif score >= 40: return "low"
        else: return "critical"
    
    def _score_to_grade(self, score: float) -> str:
        """Convert numeric score to letter grade"""
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
        """Determine if algorithm is quantum-safe and why"""
        if is_pqc:
            return True, f"Post-quantum algorithm ({name})"
        
        if algo_type in ["symmetric", "hash"]:
            if key_size >= 256 or score >= 85:
                return True, f"{algo_type.capitalize()} with {key_size}-bit key (Grover-resistant)"
        
        if score >= 90:
            return True, f"High security score ({score}) indicates strong resistance"
        
        return False, "Not quantum-resistant"
    
    def _fuzzy_lookup(self, name: str, table: Dict) -> float:
        """Try to match algorithm name against table (handles variations)"""
        name_upper = name.upper()
        for key in table.keys():
            if key in name_upper or name_upper in key:
                return table[key]
        return 0
    
    def _calculate_key_size_bonus(self, algo: str, key_size: int, algo_type: str) -> float:
        """Calculate bonus/penalty based on key size"""
        if key_size == 0:
            return 0
        
        # Symmetric ciphers
        if algo_type == "symmetric":
            if key_size >= 256: return 10
            elif key_size >= 192: return 5
            elif key_size >= 128: return 0
            else: return -20  # Weak key
        
        # Asymmetric (KEX, signature)
        elif algo_type in ["kex", "signature"]:
            if "RSA" in algo.upper() or "DH" in algo.upper():
                if key_size >= 4096: return 10
                elif key_size >= 2048: return 0
                else: return -30  # Very weak
        
        return 0
    
    def _calculate_curve_bonus(self, curve: str, curve_bits: int) -> float:
        """Calculate bonus for elliptic curve strength"""
        if not curve:
            return 0
        
        curve_upper = curve.upper()
        
        # Modern curves
        if any(modern in curve_upper for modern in ["X25519", "X448", "ED25519", "ED448"]):
            return 15
        
        # NIST curves
        if "P-521" in curve_upper or "SECP521" in curve_upper:
            return 10
        elif "P-384" in curve_upper or "SECP384" in curve_upper:
            return 5
        elif "P-256" in curve_upper or "SECP256" in curve_upper:
            return 0
        elif "P-224" in curve_upper or "SECP224" in curve_upper:
            return -10
        
        # Curve bits bonus
        if curve_bits >= 512: return 10
        elif curve_bits >= 384: return 5
        elif curve_bits >= 256: return 0
        elif curve_bits > 0: return -10
        
        return 0
    
    def _empty_result(self, scoring_type: str) -> Dict:
        """Return empty result when no algorithms provided"""
        return {
            "overall_score": 0,
            "overall_grade": "F",
            "security_level": "critical",
            "quantum_ready": False,
            "hybrid_ready": False,
            "components": {},
            "algorithm_scores": [],
            "critical_vulnerabilities": ["No algorithms provided for scoring"],
            "compliance_status": {}
        }
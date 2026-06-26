"""
Independent Repository Cryptographic Scoring Engine
====================================================
Purpose-built for source code analysis. Does NOT share logic with the
TLS/domain scoring engine â€” repo scanning has fundamentally different
semantics (static code patterns vs. live protocol negotiation).

Scoring Philosophy for Source Code:
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
â€¢ Source code uses algorithms directly â€” no "negotiation" or "preference".
  Every algorithm found in active code contributes equally weighted by
  its occurrence count.
â€¢ Quantum readiness is measured by what % of crypto operations use
  quantum-safe primitives.
â€¢ The score reflects HOW HARD it will be to migrate to PQC, not whether
  the code is "secure today" (which depends on deployment context).

Grade Thresholds (Quantum Readiness Scale):
  A+  >= 92  Fully PQC-ready codebase
  A   >= 85  Mostly PQC, minimal classical crypto
  B+  >= 78  Significant PQC adoption, good classical
  B   >= 70  Some PQC usage, strong classical defaults
  B-  >= 62  Good classical crypto, PQC migration started
  C+  >= 55  Adequate classical, no PQC
  C   >= 45  Mixed â€” some deprecated algorithms present
  C-  >= 38  Weak classical crypto, migration needed
  D   >= 28  Significant deprecated/broken algorithms
  F   <  28  Critical â€” broken crypto throughout
"""

import logging
import time
from typing import Dict, List, Optional, Tuple, Any
from collections import defaultdict

CACHE_TTL_SECONDS = 300  # safety-net: force reload every 5 min even without a version bump

logger = logging.getLogger(__name__)

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# ALGORITHM SCORE TABLE â€” Quantum Readiness scores for source code context
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# Unlike TLS scoring, source code scores are CONTEXT-FREE (no negotiation
# priority, no certificate chain analysis). Each algorithm gets a fixed
# base score representing its quantum readiness posture.
#
# Scale:  0  = broken/deprecated even classically
#        20  = classical, being phased out
#        40  = classical, acceptable today but quantum-vulnerable
#        60  = classical strong (Grover-resistant symmetric/hash)
#        80  = PQC candidate or hybrid
#       100  = NIST-standardised PQC
#
# All algorithm scores are stored in Elasticsearch index: crypto-algorithm-scores
# Edit via the ELK Algorithm Scorer UI at /elk/scorer.
# No hardcoded fallback — ES is the single source of truth.




# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# CATEGORY WEIGHTS â€” how much each category matters for overall repo score
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# Different from TLS weights because source code has different risk profile:
# - Asymmetric crypto (kex + signature) is the PRIMARY quantum risk
# - Symmetric is less critical (already Grover-safe at 256-bit)
# - Modes/MACs/KDFs are secondary concerns
REPO_CATEGORY_WEIGHTS = {
    "kex": 0.30,       # Key exchange / asymmetric encryption
    "signature": 0.25, # Digital signatures
    "symmetric": 0.20, # Symmetric encryption
    "hash": 0.15,      # Hash functions
    "mode": 0.05,      # Cipher modes
    "mac": 0.03,       # Message authentication codes
    "kdf": 0.02,       # Key derivation functions
}


def _score_to_grade(score: float) -> str:
    """Convert numeric score to letter grade."""
    if score >= 92: return "A+"
    if score >= 85: return "A"
    if score >= 78: return "B+"
    if score >= 70: return "B"
    if score >= 62: return "B-"
    if score >= 55: return "C+"
    if score >= 45: return "C"
    if score >= 38: return "C-"
    if score >= 28: return "D"
    return "F"


def _determine_security_level(score: float) -> str:
    """Determine security level from score."""
    if score >= 85: return "excellent"
    if score >= 70: return "high"
    if score >= 55: return "medium"
    if score >= 35: return "low"
    return "critical"


def _get_variant_score(algo_name: str, key_size: Optional[int], algo_info: Dict) -> Tuple[float, bool, str]:
    """Get score adjusted for key size variant."""
    variants = algo_info.get("variants", {})
    if key_size and variants:
        key_str = str(key_size)
        if key_str in variants:
            v = variants[key_str]
            return v["score"], v["safe"], v["reason"]
        # Try closest match for RSA key sizes
        if algo_name == "RSA" and key_size:
            if key_size <= 1024: return 0, False, "RSA key â‰¤1024 bits is classically broken"
            if key_size <= 2048: return 15, False, "RSA-2048 is quantum-vulnerable"
            if key_size <= 3072: return 18, False, "RSA-3072 is quantum-vulnerable"
            return 20, False, "RSA-4096+ is quantum-vulnerable"
    return algo_info["base_score"], algo_info["quantum_safe"], algo_info["reason"]


class RepoScoringEngine:
    """
    Independent scoring engine for repository cryptographic analysis.
    
    Scores are based on quantum readiness of algorithms found in source code.
    Each algorithm gets a fixed score based on its quantum resistance category:
    
    - fully_resistant: PQC algorithms (Kyber, Dilithium, etc.) â†’ 78-96
    - grover_resistant: Symmetric/hash with adequate key sizes â†’ 45-75
    - vulnerable: Classical asymmetric (RSA, ECDH, ECDSA) â†’ 15-38
    - deprecated: Broken algorithms (DES, MD5, SHA-1, RC4) â†’ 0-8
    - construction: MACs/KDFs (safety depends on params) â†’ 48-65
    - mode: Cipher modes (secondary concern) â†’ 5-70
    """

    def __init__(self):
        self.scores_table: Dict[str, Dict] = {}
        self._cache_loaded_at: float = 0.0
        self._refresh_cache()  # initial load
        self.category_weights = REPO_CATEGORY_WEIGHTS

    def _refresh_cache(self) -> None:
        """Load/reload algorithm scores from ES and update the in-memory cache."""
        new_table = self._load_from_es()
        self.scores_table = new_table
        self._cache_loaded_at = time.time()

    def _get_scores_version(self) -> float:
        """
        Fetch the last_modified timestamp of the algorithm-scores version marker from ES.
        Returns 0.0 if the doc doesn't exist or ES is unreachable.
        """
        try:
            import os
            from elasticsearch import Elasticsearch
            es_url = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
            es = Elasticsearch([es_url], request_timeout=3)
            doc = es.get(index="crypto-config", id="algorithm-scores-version")
            return float(doc["_source"].get("last_modified", 0.0))
        except Exception:
            return 0.0

    def _load_from_es(self) -> Dict[str, Dict]:
        """Load algorithm scores from Elasticsearch. Falls back to empty dict if ES unavailable."""
        import os
        es_url = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
        try:
            from elasticsearch import Elasticsearch
            es = Elasticsearch([es_url], request_timeout=5)
            result = es.search(
                index="crypto-algorithm-scores",
                query={"term": {"active": True}},
                size=10000,
            )
            table = {}
            for hit in result.get("hits", {}).get("hits", []):
                src = hit["_source"]
                name = src.get("algorithm", "").upper()
                if not name:
                    continue
                entry = {
                    "base_score": float(src.get("base_score", 0)),
                    "quantum_safe": bool(src.get("quantum_safe", False)),
                    "resistance": src.get("resistance", "unknown"),
                    "category": src.get("category", src.get("component_type", "unknown")),
                    "reason": src.get("reason", ""),
                    "migration": src.get("migration", ""),
                    "is_pqc": "pqc_nist" in src.get("tags", []) or "pqc" in src.get("tags", []),
                }
                # Reconstruct variants from nested list (stored as list in ES)
                if src.get("variants"):
                    variants = {}
                    for v in src["variants"]:
                        variants[str(v.get("key", ""))] = {
                            "score": float(v.get("score", 0)),
                            "safe": bool(v.get("safe", False)),
                            "reason": v.get("reason", ""),
                        }
                    entry["variants"] = variants
                table[name] = entry
            logger.info("Loaded %d algorithm scores from Elasticsearch", len(table))
            return table
        except Exception as exc:
            logger.error(
                "CRITICAL: Could not load algorithm scores from ES: %s. "
                "Scoring table is EMPTY — ensure ES is reachable.", exc
            )
            return {}

    def score_algorithms(self, algorithms_dict: Dict) -> Dict:
        """
        Score all algorithms found in a repository scan.
        
        Args:
            algorithms_dict: Dict mapping algorithm name â†’ {
                "category": str, "occurrences": int, "files": [...],
                "key_size": int|None, "quantum_resistance_type": str,
                "is_pqc": bool, "commented_occurrences": int,
                "total_occurrences": int, "findings": [...], ...
            }
        
        Returns:
            Dict with scored algorithms, category scores, overall score,
            migration plan, and quantum readiness details.
        """
        if not algorithms_dict:
            return self._empty_result()

        # Check the ES version marker — reload immediately if scores changed via UI,
        # or fall back to the safety-net TTL if the marker is unavailable.
        es_version = self._get_scores_version()
        scores_changed = es_version > self._cache_loaded_at
        cache_stale = time.time() - self._cache_loaded_at >= CACHE_TTL_SECONDS

        if scores_changed or cache_stale:
            reason = "scores changed via UI" if scores_changed else "TTL safety-net"
            logger.info("Algorithm cache reloading from ES (%s)", reason)
            self._refresh_cache()

        scored_algorithms = {}
        category_groups: Dict[str, List[Dict]] = defaultdict(list)

        for algo_name, algo_data in algorithms_dict.items():
            scored = self._score_single(algo_name, algo_data)
            scored_algorithms[algo_name] = scored
            cat = scored["algorithm_type"]
            category_groups[cat].append(scored)

        # Calculate category scores (occurrence-weighted averages)
        category_scores = {}
        for cat_type, algos in category_groups.items():
            category_scores[cat_type] = self._aggregate_category(cat_type, algos)

        # Calculate overall score
        overall_score = self._calculate_overall(category_scores, scored_algorithms)
        overall_grade = _score_to_grade(overall_score)

        # Calculate quantum readiness
        qr_detail = self._build_quantum_readiness(scored_algorithms, category_scores)

        # Build migration plan
        migration_plan = self._build_migration_plan(scored_algorithms, category_scores, overall_score)

        # Count stats
        quantum_safe_count = sum(1 for a in scored_algorithms.values() if a["quantum_safe"])
        quantum_vulnerable_count = sum(1 for a in scored_algorithms.values() if not a["quantum_safe"])
        pqc_count = sum(1 for a in scored_algorithms.values() if a.get("is_pqc", False))
        deprecated_count = sum(1 for a in scored_algorithms.values() if a["deprecated"])

        # Critical vulnerabilities
        vulnerabilities = self._identify_vulnerabilities(scored_algorithms, category_scores)

        return {
            "overall_score": round(overall_score, 2),
            "overall_grade": overall_grade,
            "security_level": _determine_security_level(overall_score),
            "quantum_safe_count": quantum_safe_count,
            "quantum_vulnerable_count": quantum_vulnerable_count,
            "true_pqc_count": pqc_count,
            "deprecated_count": deprecated_count,
            "quantum_readiness_detail": qr_detail,
            "migration_plan": migration_plan,
            "category_scores": category_scores,
            "algorithm_scores": scored_algorithms,
            "critical_vulnerabilities": vulnerabilities,
        }

    def _score_single(self, algo_name: str, algo_data: Dict) -> Dict:
        """Score a single algorithm."""
        info = self.scores_table.get(algo_name, None)

        if info is None:
            # Unknown algorithm â€” try fuzzy match
            info = self._fuzzy_lookup(algo_name)

        key_size = algo_data.get("key_size")
        base_score, quantum_safe, reason = _get_variant_score(algo_name, key_size, info)
        is_pqc = info.get("is_pqc", False) or algo_data.get("is_pqc", False)
        resistance = info.get("resistance", "unknown")
        deprecated = resistance == "deprecated"
        category = info.get("category", "symmetric")
        migration = info.get("migration", "Review this algorithm's quantum readiness.")

        final_score = max(0, min(100, base_score))
        grade = _score_to_grade(final_score)
        security_level = _determine_security_level(final_score)

        return {
            "algorithm": algo_name,
            "algorithm_type": category,
            "category": algo_data.get("category", info.get("category", "Unknown")),
            "base_score": base_score,
            "final_score": final_score,
            "grade": grade,
            "security_level": security_level,
            "quantum_safe": quantum_safe,
            "quantum_safety_reason": reason,
            "quantum_resistance_type": resistance,
            "is_pqc": is_pqc,
            "deprecated": deprecated,
            "weighted_score": final_score,
            "occurrences": algo_data.get("occurrences", 0),
            "commented_occurrences": algo_data.get("commented_occurrences", 0),
            "files_affected": len(algo_data.get("files", [])),
            "key_size": key_size,
            "migration_recommendation": migration,
        }

    def _fuzzy_lookup(self, name: str) -> Dict:
        """Try to find a matching algorithm by substring."""
        name_upper = name.upper()
        best_match = None
        best_len = 0

        for key, info in self.scores_table.items():
            key_upper = key.upper()
            if key_upper in name_upper or name_upper in key_upper:
                if len(key_upper) > best_len:
                    best_len = len(key_upper)
                    best_match = info

        if best_match:
            return best_match

        # Default: treat as unknown symmetric
        return {
            "base_score": 40, "category": "symmetric",
            "quantum_safe": False, "resistance": "unknown",
            "reason": f"Unknown algorithm '{name}' â€” review manually",
            "migration": f"Manually assess '{name}' for quantum readiness.",
        }

    def _aggregate_category(self, cat_type: str, algos: List[Dict]) -> Dict:
        """Calculate occurrence-weighted category score."""
        total_weight = 0
        weighted_sum = 0

        for algo in algos:
            # Weight by occurrence count (capped to prevent single-algo dominance)
            occ_weight = min(algo["occurrences"], 100)
            weight = max(occ_weight, 1)  # at least 1

            weighted_sum += algo["final_score"] * weight
            total_weight += weight

        score = weighted_sum / total_weight if total_weight > 0 else 0
        best = max(algos, key=lambda a: a["final_score"])
        worst = min(algos, key=lambda a: a["final_score"])

        return {
            "score": round(score, 2),
            "grade": _score_to_grade(score),
            "algorithm_count": len(algos),
            "best_algorithm": best["algorithm"],
            "worst_algorithm": worst["algorithm"],
            "quantum_safe_count": sum(1 for a in algos if a["quantum_safe"]),
            "deprecated_count": sum(1 for a in algos if a["deprecated"]),
        }

    def _calculate_overall(self, category_scores: Dict, scored_algos: Dict) -> float:
        """Calculate overall repository score.
        
        Core principle: this is a QUANTUM READINESS tool.
        The score = quantum readiness percentage, adjusted by:
          - Deprecated penalty (MD5/DES/RC4 actively reduce score)
          - Vulnerable cap (RSA/ECDSA in code â†’ can't reach A+)
          - PQC bonus (using NIST PQC standards â†’ extra credit)
        
        This ensures QR% and score always tell the same story.
        """
        total_occ = sum(a["occurrences"] for a in scored_algos.values())
        if total_occ == 0:
            return 0

        qsafe_occ = sum(a["occurrences"] for a in scored_algos.values() if a["quantum_safe"])
        qr_pct = (qsafe_occ / total_occ * 100)

        # Start from QR% â€” the score IS quantum readiness
        base = qr_pct

        # PQC bonus: using actual NIST PQC standards (Kyber, Dilithium, etc.)
        # pushes above the QR% baseline into A+ territory
        pqc_algos = [a for a in scored_algos.values() if a.get("is_pqc") and a["quantum_safe"]]
        if pqc_algos:
            pqc_bonus = min(len(pqc_algos) * 2, 8)
            base += pqc_bonus

        # Deprecated penalty: broken crypto (MD5, DES, RC4, SHA-1) actively
        # reduces score proportional to how much of the codebase uses it
        deprecated_algos = [a for a in scored_algos.values() if a["deprecated"]]
        if deprecated_algos:
            dep_occ = sum(a["occurrences"] for a in deprecated_algos)
            dep_ratio = dep_occ / total_occ
            # Penalty scales with usage: 3% deprecated â†’ -3, 30% â†’ -15
            base -= min(dep_ratio * 50, 25)

        # Quantum-vulnerable cap: having RSA/ECDSA/DH in active code
        # means you're NOT fully quantum ready â€” cap the score
        vulnerable_algos = [a for a in scored_algos.values()
                           if a["quantum_resistance_type"] == "vulnerable"]
        if vulnerable_algos:
            vuln_occ = sum(a["occurrences"] for a in vulnerable_algos)
            vuln_ratio = vuln_occ / total_occ
            if vuln_ratio > 0.2:
                base = min(base, 55)   # Heavy vulnerable usage â†’ C+ max
            else:
                base = min(base, 75)   # Some vulnerable usage â†’ B max

        return max(0, min(100, round(base, 2)))

    def _build_quantum_readiness(self, scored_algos: Dict, category_scores: Dict) -> Dict:
        """Build quantum readiness detail."""
        total_occ = sum(a["occurrences"] for a in scored_algos.values())
        qsafe_occ = sum(a["occurrences"] for a in scored_algos.values() if a["quantum_safe"])
        qr_percentage = (qsafe_occ / total_occ * 100) if total_occ > 0 else 0

        pqc_algos = [a["algorithm"] for a in scored_algos.values() if a.get("is_pqc") and a["quantum_safe"]]
        vulnerable_algos = [a["algorithm"] for a in scored_algos.values() if a["quantum_resistance_type"] == "vulnerable"]
        deprecated_algos = [a["algorithm"] for a in scored_algos.values() if a["deprecated"]]
        grover_safe = [a["algorithm"] for a in scored_algos.values()
                       if a["quantum_resistance_type"] == "grover_resistant" and a["quantum_safe"]]

        has_pqc = len(pqc_algos) > 0
        has_vulnerable = len(vulnerable_algos) > 0
        has_deprecated = len(deprecated_algos) > 0

        # Risk assessment
        if has_deprecated:
            risk_level = "critical" if not has_pqc else "high"
            risk_reason = f"Deprecated/broken algorithms found: {', '.join(deprecated_algos[:5])}"
        elif has_vulnerable and not has_pqc:
            risk_level = "high"
            risk_reason = f"Quantum-vulnerable algorithms in use with no PQC alternatives: {', '.join(vulnerable_algos[:5])}"
        elif has_vulnerable and has_pqc:
            risk_level = "medium"
            risk_reason = "PQC migration in progress â€” some classical algorithms remain"
        elif has_pqc:
            risk_level = "low"
            risk_reason = "PQC algorithms deployed. Codebase is quantum-ready."
        else:
            risk_level = "medium"
            risk_reason = "No asymmetric crypto detected. Only symmetric/hash algorithms in use."

        # Migration status
        if has_pqc and not has_vulnerable and not has_deprecated:
            migration_status = "complete"
            migration_note = "All cryptographic algorithms are quantum-safe."
        elif has_pqc:
            migration_status = "in_progress"
            migration_note = "PQC algorithms adopted but classical algorithms still present."
        elif has_vulnerable:
            migration_status = "not_started"
            migration_note = "No PQC algorithms detected. Quantum-vulnerable algorithms require migration."
        else:
            migration_status = "not_applicable"
            migration_note = "No asymmetric algorithms detected. Focus on symmetric key sizes."

        return {
            "quantum_readiness_percentage": round(qr_percentage, 2),
            "risk_level": risk_level,
            "risk_reason": risk_reason,
            "migration_status": migration_status,
            "migration_note": migration_note,
            "pqc_algorithms": pqc_algos,
            "vulnerable_algorithms": vulnerable_algos,
            "deprecated_algorithms": deprecated_algos,
            "grover_safe_algorithms": grover_safe,
            "total_crypto_operations": total_occ,
            "quantum_safe_operations": qsafe_occ,
        }

    def _build_migration_plan(self, scored_algos: Dict, category_scores: Dict, overall_score: float) -> Dict:
        """Build actionable migration plan with prioritised steps."""
        steps = []
        step_num = 1

        deprecated_algos = {a["algorithm"]: a for a in scored_algos.values() if a["deprecated"]}
        vulnerable_algos = {a["algorithm"]: a for a in scored_algos.values()
                          if a["quantum_resistance_type"] == "vulnerable"}
        weak_symmetric = {a["algorithm"]: a for a in scored_algos.values()
                        if a["algorithm_type"] == "symmetric" and a["final_score"] < 40}
        weak_hashes = {a["algorithm"]: a for a in scored_algos.values()
                      if a["algorithm_type"] == "hash" and a["final_score"] < 30}

        # CRITICAL: Remove broken/deprecated algorithms
        if deprecated_algos:
            for algo_name, algo in deprecated_algos.items():
                steps.append({
                    "step": step_num,
                    "priority": "CRITICAL",
                    "title": f"Remove {algo_name}",
                    "summary": algo.get("migration_recommendation", f"Replace {algo_name} immediately."),
                    "detail": algo["quantum_safety_reason"],
                    "affected_files": algo["files_affected"],
                    "occurrences": algo["occurrences"],
                    "replacement": self._get_replacement(algo_name),
                    "effort": "Low" if algo["occurrences"] < 10 else "Medium" if algo["occurrences"] < 50 else "High",
                    "impact": "Eliminates broken cryptography",
                    "nist_ref": self._get_nist_ref(algo_name),
                })
                step_num += 1

        # HIGH: Replace quantum-vulnerable asymmetric algorithms
        if vulnerable_algos:
            # Group by type for cleaner output
            kex_vulns = [a for a in vulnerable_algos.values() if a["algorithm_type"] == "kex"]
            sig_vulns = [a for a in vulnerable_algos.values() if a["algorithm_type"] == "signature"]

            if kex_vulns:
                names = ", ".join(a["algorithm"] for a in kex_vulns[:5])
                total_occ = sum(a["occurrences"] for a in kex_vulns)
                total_files = sum(a["files_affected"] for a in kex_vulns)
                steps.append({
                    "step": step_num,
                    "priority": "HIGH",
                    "title": "Replace Quantum-Vulnerable Key Exchange",
                    "summary": f"Migrate {names} to ML-KEM (NIST FIPS 203). Use hybrid X25519+ML-KEM-768 during transition.",
                    "detail": (
                        "All classical key exchange algorithms (RSA, DH, ECDH, Curve25519) are broken by "
                        "Shor's algorithm on a cryptographically relevant quantum computer. "
                        "NIST recommends ML-KEM (Kyber) as the primary post-quantum KEM. "
                        "Use hybrid mode (classical + PQC) for defense in depth."
                    ),
                    "affected_files": total_files,
                    "occurrences": total_occ,
                    "replacement": "ML-KEM-768 (FIPS 203) or hybrid X25519+ML-KEM-768",
                    "effort": "High â€” requires library upgrades and protocol changes",
                    "impact": "Eliminates quantum vulnerability in key exchange",
                    "nist_ref": "NIST FIPS 203 (ML-KEM), CISA PQC Migration Guidance 2024",
                    "code_example": (
                        "# Python (using pqcrypto or oqs-python):\n"
                        "from oqs import KeyEncapsulation\n"
                        "kem = KeyEncapsulation('ML-KEM-768')\n"
                        "public_key = kem.generate_keypair()\n"
                        "ciphertext, shared_secret = kem.encap_secret(public_key)"
                    ),
                })
                step_num += 1

            if sig_vulns:
                names = ", ".join(a["algorithm"] for a in sig_vulns[:5])
                total_occ = sum(a["occurrences"] for a in sig_vulns)
                total_files = sum(a["files_affected"] for a in sig_vulns)
                steps.append({
                    "step": step_num,
                    "priority": "HIGH",
                    "title": "Replace Quantum-Vulnerable Signatures",
                    "summary": f"Migrate {names} to ML-DSA (NIST FIPS 204). Use hybrid ECDSA+ML-DSA during transition.",
                    "detail": (
                        "All classical signature algorithms (RSA, ECDSA, Ed25519, DSA) are broken by "
                        "Shor's algorithm. NIST recommends ML-DSA (Dilithium) as the primary post-quantum "
                        "signature scheme. SLH-DSA (SPHINCS+) is available as a hash-based alternative."
                    ),
                    "affected_files": total_files,
                    "occurrences": total_occ,
                    "replacement": "ML-DSA-65 (FIPS 204) or hybrid ECDSA+ML-DSA",
                    "effort": "High â€” requires library upgrades and certificate changes",
                    "impact": "Eliminates quantum vulnerability in digital signatures",
                    "nist_ref": "NIST FIPS 204 (ML-DSA), NIST FIPS 205 (SLH-DSA)",
                    "code_example": (
                        "# Python (using oqs-python):\n"
                        "from oqs import Signature\n"
                        "sig = Signature('ML-DSA-65')\n"
                        "public_key = sig.generate_keypair()\n"
                        "signature = sig.sign(message)"
                    ),
                })
                step_num += 1

        # MEDIUM: Upgrade weak symmetric
        if weak_symmetric:
            names = ", ".join(weak_symmetric.keys())
            steps.append({
                "step": step_num,
                "priority": "MEDIUM",
                "title": "Upgrade Weak Symmetric Ciphers",
                "summary": f"Replace {names} with AES-256-GCM or ChaCha20-Poly1305.",
                "detail": (
                    "These symmetric ciphers are either deprecated (3DES, DES, RC4) or use "
                    "insufficient key sizes. AES-256-GCM provides 128-bit post-quantum security "
                    "(Grover halving). ChaCha20-Poly1305 is an excellent software-only alternative."
                ),
                "affected_files": sum(a["files_affected"] for a in weak_symmetric.values()),
                "occurrences": sum(a["occurrences"] for a in weak_symmetric.values()),
                "replacement": "AES-256-GCM or ChaCha20-Poly1305",
                "effort": "Medium",
                "impact": "Achieves Grover-safe symmetric encryption",
                "nist_ref": "NIST SP 800-131A Rev 2",
            })
            step_num += 1

        # MEDIUM: Upgrade weak hashes
        if weak_hashes:
            names = ", ".join(weak_hashes.keys())
            steps.append({
                "step": step_num,
                "priority": "MEDIUM",
                "title": "Replace Weak Hash Functions",
                "summary": f"Replace {names} with SHA-256 or SHA-384 minimum.",
                "detail": (
                    "MD5 and SHA-1 have practical collision attacks. For post-quantum resistance, "
                    "hash outputs should be â‰¥256 bits (SHA-256 provides ~128-bit collision resistance "
                    "post-quantum via Grover). SHA-384 or SHA3-256 are recommended for higher margins."
                ),
                "affected_files": sum(a["files_affected"] for a in weak_hashes.values()),
                "occurrences": sum(a["occurrences"] for a in weak_hashes.values()),
                "replacement": "SHA-256, SHA-384, or SHA3-256",
                "effort": "Medium",
                "impact": "Eliminates collision-vulnerable hashes",
                "nist_ref": "NIST Policy on Hash Functions (2015), SP 800-131A Rev 2",
            })
            step_num += 1

        # LOW: CBC mode migration
        cbc_algo = scored_algos.get("CBC")
        if cbc_algo and cbc_algo["occurrences"] > 0:
            steps.append({
                "step": step_num,
                "priority": "LOW",
                "title": "Migrate CBC Mode to AEAD",
                "summary": "Replace AES-CBC with AES-GCM or ChaCha20-Poly1305 for authenticated encryption.",
                "detail": (
                    "CBC mode requires separate MAC computation and is vulnerable to padding oracle attacks "
                    "if not implemented correctly. AEAD modes (GCM, CCM) provide built-in authentication."
                ),
                "affected_files": cbc_algo["files_affected"],
                "occurrences": cbc_algo["occurrences"],
                "replacement": "AES-256-GCM",
                "effort": "Medium",
                "impact": "Eliminates padding oracle risk",
                "nist_ref": "NIST SP 800-38D (GCM)",
            })
            step_num += 1

        # ONGOING: Crypto agility
        steps.append({
            "step": step_num,
            "priority": "ONGOING",
            "title": "Establish Crypto-Agility",
            "summary": "Abstract cryptographic operations behind interfaces to enable rapid algorithm swaps.",
            "detail": (
                "Crypto-agility is the ability to swap algorithms without major code changes. "
                "Abstract crypto operations behind interfaces/providers (e.g., JCA in Java, "
                "cryptography.io in Python, Web Crypto API in JS). Maintain a Cryptographic "
                "Bill of Materials (CBOM) and scan regularly."
            ),
            "affected_files": 0,
            "occurrences": 0,
            "replacement": "Cryptographic abstraction layer",
            "effort": "High â€” architectural change",
            "impact": "Enables rapid future algorithm migration",
            "nist_ref": "CISA Quantum-Readiness Roadmap 2023, NISTIR 8547",
        })

        # Sort by priority
        priority_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "ONGOING": 4}
        steps.sort(key=lambda s: priority_order.get(s["priority"], 5))

        critical_count = sum(1 for s in steps if s["priority"] == "CRITICAL")
        high_count = sum(1 for s in steps if s["priority"] == "HIGH")

        return {
            "steps": steps,
            "total_steps": len(steps),
            "critical_count": critical_count,
            "high_count": high_count,
            "urgent_count": critical_count + high_count,
            "estimated_effort": self._estimate_overall_effort(steps),
        }

    def _identify_vulnerabilities(self, scored_algos: Dict, category_scores: Dict) -> List[str]:
        """Identify critical vulnerabilities."""
        vulns = []

        deprecated = [a["algorithm"] for a in scored_algos.values() if a["deprecated"]]
        if deprecated:
            vulns.append(f"Deprecated/broken algorithms in active code: {', '.join(deprecated[:5])}")

        vulnerable = [a["algorithm"] for a in scored_algos.values()
                     if a["quantum_resistance_type"] == "vulnerable"]
        if vulnerable:
            vulns.append(
                f"Quantum-vulnerable algorithms ({len(vulnerable)}): {', '.join(vulnerable[:5])} â€” "
                "will be broken by Shor's algorithm"
            )

        for cat_type, cat_data in category_scores.items():
            if cat_data["score"] < 20 and cat_type in ("kex", "signature", "symmetric", "hash"):
                vulns.append(f"Critical weakness in {cat_type}: score {cat_data['score']:.1f}/100")

        # Check for ECB mode
        ecb = scored_algos.get("ECB")
        if ecb and ecb["occurrences"] > 0:
            vulns.append("ECB cipher mode detected â€” leaks plaintext patterns. Never use for encryption.")

        return vulns

    def _get_replacement(self, algo_name: str) -> str:
        """Get recommended replacement algorithm."""
        replacements = {
            "DES": "AES-256-GCM",
            "3DES": "AES-256-GCM",
            "RC4": "ChaCha20-Poly1305 or AES-256-GCM",
            "RC2": "AES-256-GCM",
            "MD5": "SHA-256 or SHA-384",
            "MD4": "SHA-256 or SHA-384",
            "SHA-1": "SHA-256 or SHA-384",
            "Blowfish": "AES-256-GCM",
            "IDEA": "AES-256-GCM",
            "CAST5": "AES-256-GCM",
            "DSA": "Ed25519 (interim) â†’ ML-DSA (PQC)",
            "Rainbow": "ML-DSA (Dilithium)",
            "SIKE": "ML-KEM (Kyber)",
            "ECB": "GCM or CCM mode",
        }
        return replacements.get(algo_name, "Consult NIST PQC recommendations")

    def _get_nist_ref(self, algo_name: str) -> str:
        """Get NIST reference for algorithm deprecation."""
        refs = {
            "DES": "NIST SP 800-131A Rev 2 (2019)",
            "3DES": "NIST SP 800-131A Rev 2 â€” deprecated after 2023",
            "RC4": "RFC 7465 â€” Prohibiting RC4 Cipher Suites",
            "MD5": "NIST SP 800-131A Rev 2",
            "SHA-1": "NIST SP 800-131A Rev 2 â€” prohibited for digital signatures",
            "DSA": "FIPS 186-5 â€” DSA dropped for new signatures",
            "Rainbow": "Ward Beullens key recovery attack (2022)",
            "SIKE": "Castryck-Decru attack (2022)",
        }
        return refs.get(algo_name, "NIST PQC Migration Guidance 2024")

    def _estimate_overall_effort(self, steps: List[Dict]) -> str:
        """Estimate overall migration effort."""
        total_occ = sum(s.get("occurrences", 0) for s in steps)
        critical = sum(1 for s in steps if s["priority"] == "CRITICAL")

        if critical > 3 or total_occ > 200:
            return "High â€” significant codebase changes required"
        if critical > 0 or total_occ > 50:
            return "Medium â€” focused refactoring needed"
        return "Low â€” minor adjustments"

    def _empty_result(self) -> Dict:
        """Return empty scoring result â€” no crypto code found means no quantum risk."""
        return {
            "overall_score": 85,
            "overall_grade": "A",
            "security_level": "low",
            "quantum_safe_count": 0,
            "quantum_vulnerable_count": 0,
            "true_pqc_count": 0,
            "deprecated_count": 0,
            "quantum_readiness_detail": {
                "quantum_readiness_percentage": 100,
                "risk_level": "low",
                "risk_reason": "No cryptographic algorithm usage found in code â€” no quantum migration needed",
                "migration_status": "not_applicable",
                "migration_note": "No direct cryptographic operations found. If the app uses crypto via external services/APIs, those should be assessed separately.",
            },
            "migration_plan": {"steps": [], "total_steps": 0, "critical_count": 0,
                             "high_count": 0, "urgent_count": 0, "estimated_effort": "None"},
            "category_scores": {},
            "algorithm_scores": {},
            "critical_vulnerabilities": [],
        }

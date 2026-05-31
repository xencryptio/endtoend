"""
Universal PQC Scoring Engine — Quantum Readiness Framework v2

Scoring philosophy (NIST IR 8413 / CISA PQC Migration Guidance 2024):
──────────────────────────────────────────────────────────────────────
* Key Exchange (KEX) is the PRIMARY migration priority.
  Hybrid KEX (ECDH + ML-KEM) can be deployed TODAY and protects against
  Harvest-Now-Decrypt-Later (HNDL) attacks immediately.
* Symmetric: AES-256 / ChaCha20-Poly1305 are already Grover-safe
  (128-bit post-quantum security). No migration needed.
* Certificates: no public CA supports PQC certs yet (2024-2026), so
  classical ECDSA P-256 / RSA-2048 must not be heavily penalised.

Grade thresholds (QR readiness scale):
  A+  >= 90  Full hybrid KEX + strong symmetric
  A   >= 85  Hybrid KEX deployed, excellent everything
  B+  >= 78  Hybrid KEX at server preference
  B   >= 72  Hybrid KEX available, TLS 1.3 active
  B-  >= 65  Some hybrid KEX, classical fallback majority
  C+  >= 58  X25519 only (no hybrid), good symmetric
  C   >= 50  ECDHE + good symmetric, no hybrid
  C-  >= 42  Older patterns but not broken
  D   >= 35  Legacy concerns
  F   <  35  Broken or severely inadequate
"""
from typing import List, Dict, Optional, Tuple
from .algorithms import PQ_RESISTANCE_TABLE, PQC_ALGORITHMS, DEPRECATED_ALGORITHMS, HYBRID_ALGORITHMS
from .models import AlgorithmScoreOutput, ComponentScore, ProtocolAnalysis, CertificateAnalysis, SecurityFeatures
import logging
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
            # KEX weight raised: PQ hybrid KEX is deployable TODAY and is the
            # primary indicator of quantum readiness in active TLS sessions.
            # Signature weight lowered: PQC certificates don't exist yet for
            # public CAs, so a 30% penalty for classical certs is unfair.
            # NOTE: "certificate" was removed — the input model only accepts
            # {kex, signature, symmetric, hash, protocol}, so no scanner ever
            # populated it. Weights now sum to 110% (normalized at use site).
            "kex": 0.40, "signature": 0.20, "symmetric": 0.25, "hash": 0.15,
            "protocol": 0.10,
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

        # hybrid_ready must be computed BEFORE overall_score so the bonus is applied
        hybrid_ready = self._check_hybrid_readiness(scored_algorithms)
        overall_score = self._calculate_overall_score(components, scored_algorithms, hybrid_ready)
        overall_grade = self._score_to_grade(overall_score)
        security_level = self._determine_security_level(overall_score)
        quantum_ready = self._check_quantum_readiness(components, overall_score, hybrid_ready)

        vulnerabilities = self._identify_vulnerabilities(scored_algorithms, components)

        # Derive protocol/cipher facts needed for accurate compliance checks
        _legacy_protos = {"TLS 1.0", "TLS 1.1", "SSL 2.0", "SSL 3.0"}
        _weak_cipher_keywords = ("RC4", "DES", "NULL", "EXPORT", "ANON", "3DES")
        has_legacy_tls = any(
            a.algorithm_type == "protocol" and a.algorithm in _legacy_protos
            for a in scored_algorithms
        )
        has_weak_ciphers = any(
            a.algorithm_type in ("symmetric", "kex")
            and any(kw in a.algorithm.upper() for kw in _weak_cipher_keywords)
            for a in scored_algorithms
        )

        compliance = self._check_compliance(
            components, overall_score, hybrid_ready,
            has_legacy_tls=has_legacy_tls,
            has_weak_ciphers=has_weak_ciphers,
        )
        qr_detail = self._build_qr_detail(scored_algorithms, components, hybrid_ready)
        notices = self._build_notices(scored_algorithms, hybrid_ready)

        protocol_analysis = None
        certificate_analysis = None
        security_features = None
        if scoring_type == "tls" and raw_response:
            data_for_analysis = {"raw_response": raw_response}
            protocol_analysis = self._analyze_protocol_features(data_for_analysis)
            sig_scores = [s for s in scored_algorithms if s.algorithm_type == "signature"]
            certificate_analysis = self._analyze_certificate_chain(data_for_analysis, sig_scores)
            kex_scores = [s for s in scored_algorithms if s.algorithm_type == "kex"]
            security_features = self._analyze_security_features(data_for_analysis, kex_scores)

        return {
            "domain": metadata.get("domain"),
            "timestamp": datetime.now().isoformat(),
            "overall_score": round(overall_score, 2),
            "overall_grade": overall_grade,
            "security_level": security_level,
            "quantum_ready": quantum_ready,
            "hybrid_ready": hybrid_ready,
            "notices": notices,
            "quantum_readiness_detail": qr_detail,
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
        name_upper = name.upper()

        # --- Exact lookup first (highest priority) ----------------------------
        # Use explicit table entry if present, even when the score is 0.
        # A score of 0 is a DELIBERATE value (e.g. RSA KEX = 0 because it is
        # classically weak and not quantum-safe).  Falling into fuzzy_lookup for
        # zero-scored algorithms would incorrectly award points via substring
        # matches (e.g. "RSA" matches "RSA-PSK"→35, "DH" matches "DHE-PSK"→45).
        if name_upper in type_table:
            base_score = float(type_table[name_upper])
        else:
            # Algorithm name not in table — try case-insensitive fuzzy search.
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
            deprecated=deprecated,
            context=context or {},
            category=algo_type
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

        # PQC-aware KEX aggregation:
        # Classical ECDHE entries must not drag down the component score when
        # hybrid (ML-KEM / Kyber) groups are present, because the TLS handshake
        # will USE the highest-priority group the client supports — meaning any
        # session with a modern client actually uses the PQC hybrid exchange.
        # Weight: 85% from PQC scores, 15% from classical scores.
        if comp_type == "kex":
            pqc_scores_list = [s.final_score for s in scores if s.is_pqc or s.is_hybrid]
            cls_scores_list = [s.final_score for s in scores if not (s.is_pqc or s.is_hybrid)]
            if pqc_scores_list and cls_scores_list:
                pqc_avg = sum(pqc_scores_list) / len(pqc_scores_list)
                cls_avg = sum(cls_scores_list) / len(cls_scores_list)
                weighted_avg = pqc_avg * 0.85 + cls_avg * 0.15
            elif pqc_scores_list:
                weighted_avg = sum(pqc_scores_list) / len(pqc_scores_list)

        pqc_count = sum(1 for s in scores if s.is_pqc)
        pqc_percentage = (pqc_count / len(scores)) * 100 if scores else 0
        hybrid_count = sum(1 for s in scores if s.is_hybrid)
        hybrid_percentage = (hybrid_count / len(scores)) * 100 if scores else 0
        quantum_safe_count = sum(1 for s in scores if s.quantum_safe)
        deprecated_count = sum(1 for s in scores if s.deprecated)
        
        pfs_algos = ["DHE", "ECDHE", "X25519", "X448"] + list(self.pqc_algorithms)
        pfs_enabled = any(any(pfs in s.algorithm.upper() for pfs in pfs_algos) for s in scores) if comp_type == "kex" else False

        best_algo = max(scores, key=lambda x: x.final_score)
        worst_algo = min(scores, key=lambda x: x.final_score)
        
        return ComponentScore(
            component_type=comp_type,
            algorithms=scores,
            score=round(weighted_avg, 2),
            average_score=round(avg_score, 2),
            weighted_average=round(weighted_avg, 2),
            grade=self._score_to_grade(weighted_avg),
            weight_in_final=self.component_weights.get(comp_type, 0.1),
            best_algorithm=best_algo.algorithm,
            worst_algorithm=worst_algo.algorithm,
            best_algorithm_context=best_algo.context or {},
            worst_algorithm_context=worst_algo.context or {},
            pqc_percentage=round(pqc_percentage, 2),
            hybrid_percentage=round(hybrid_percentage, 2),
            deprecated_count=deprecated_count,
            quantum_safe_count=quantum_safe_count,
            algorithm_count=len(scores),
            pfs_enabled=pfs_enabled
        )

    def _calculate_overall_score(
        self,
        components: Dict[str, ComponentScore],
        scored_algorithms: List[AlgorithmScoreOutput],
        hybrid_ready: bool
    ) -> float:
        # Stage 1: standard weighted average across components
        total_score = 0.0
        total_weight = 0.0
        for comp in components.values():
            weight = self.component_weights.get(comp.component_type, 0.1)
            total_score += comp.weighted_average * weight
            total_weight += weight
        base = total_score / total_weight if total_weight > 0 else 0.0

        # Stage 2: hybrid KEX bonus — reflects that HNDL protection is most
        # critical concern for active TLS sessions, and hybrid KEX solves it.
        bonus = 0.0
        if hybrid_ready:
            best_pqc_kex = max(
                (s.final_score for s in scored_algorithms
                 if s.algorithm_type == "kex" and (s.is_pqc or s.is_hybrid)),
                default=0.0
            )
            if best_pqc_kex >= 97:   # ML-KEM-768/1024 or equivalent
                bonus = 18.0
            elif best_pqc_kex >= 92:
                bonus = 15.0
            elif best_pqc_kex >= 85:
                bonus = 12.0
            else:
                bonus = 8.0

            # Reduce bonus slightly if symmetric is weak
            sym_comp = components.get("symmetric")
            if sym_comp and sym_comp.weighted_average < 65:
                bonus -= 5.0

        raw = base + bonus

        # Stage 3: minimum floor — a server advertising hybrid KEX + good
        # symmetric (Grover-safe) should never score below 55 regardless of
        # classical cert drag.
        sym_comp_s3 = components.get("symmetric")
        sym_ok = (sym_comp_s3.weighted_average >= 70) if sym_comp_s3 is not None else False
        if hybrid_ready and sym_ok:
            raw = max(raw, 55.0)

        # Stage 4: Protocol quality adjustment
        # Use the populated "protocol" component (from Step 6 in crypto_audit.py)
        # to apply two symmetric corrections:
        #
        # a) TLS 1.3-forward bonus (fills B-grade gap):
        #    Servers that run TLS 1.3 exclusively and have not been caught by
        #    the hybrid KEX bonus deserve modest recognition; they have already
        #    eliminated DHE/RSA cipher debt and are one config flag away from
        #    deploying X25519MLKEM768.  Without this, every non-Cloudflare
        #    server collapses into the C-/D range regardless of how clean their
        #    stack is.
        #
        # b) Legacy protocol penalty:
        #    Accepting TLS 1.0/1.1 is a Harvest-Now-Decrypt-Later amplifier
        #    (more historical traffic exposed). Penalise proportionally.
        proto_comp = components.get("protocol")
        if proto_comp is not None:
            proto_avg = proto_comp.weighted_average
            # a) TLS 1.3-forward bonus: TLS 1.3 present (alone or with TLS 1.2)
            #    scores >80 on the protocol component; TLS 1.2-only scores 75.
            if not hybrid_ready and proto_avg >= 80:   # TLS 1.3 present
                raw += 7.0   # Fills B-grade gap: moves C+ servers to B range
            elif proto_avg < 50:                       # SSL-only or old TLS-only
                penalty = (50.0 - proto_avg) * 0.2    # up to -10 pts at SSL 3.0
                raw = max(0.0, raw - penalty)

        # ── Hard cap: TLS 1.0 / TLS 1.1 present → grade capped to B (max 77.0) ─
        # This mirrors SSL Labs behaviour:
        #   "This server supports TLS 1.0 and TLS 1.1. Grade capped to B."
        # A server can still achieve B or B- but not B+ / A / A+.
        # Note: a simple protocol-average check misses the case where TLS 1.0+1.1
        # are present alongside TLS 1.2+1.3 (avg ≈ 56, above the old < 50 gate).
        legacy_tls_present = any(
            a.algorithm in ("TLS 1.0", "TLS 1.1") and a.algorithm_type == "protocol"
            for a in scored_algorithms
        )
        if legacy_tls_present:
            raw = min(raw, 77.0)

        return min(raw, 100.0)

    def _check_quantum_readiness(
        self,
        components: Dict[str, ComponentScore],
        overall_score: float,
        hybrid_ready: bool
    ) -> bool:
        # A server is quantum-ready when:
        # 1. It offers PQC/hybrid key exchange (HNDL protection today), AND
        # 2. Its symmetric encryption is Grover-safe (AES-256 / ChaCha20 = 128-bit PQC)
        # We do NOT require PQC certificates because CAs cannot issue them yet (2024).
        sym_comp = components.get("symmetric")
        sym_ok = (sym_comp.weighted_average >= 70) if sym_comp else False
        return hybrid_ready and sym_ok

    def _check_hybrid_readiness(self, scores: List[AlgorithmScoreOutput]) -> bool:
        # Only KEX algorithms matter for hybrid readiness — a PQC signature sitting
        # in the list should not trigger a false positive here.
        return any(s.is_hybrid and s.algorithm_type == "kex" for s in scores)

    def _build_qr_detail(
        self,
        scored_algorithms: List[AlgorithmScoreOutput],
        components: Dict[str, ComponentScore],
        hybrid_ready: bool
    ) -> Dict:
        kex_scores = [s for s in scored_algorithms if s.algorithm_type == "kex"]
        hybrid_kex = [s.algorithm for s in kex_scores if s.is_hybrid or s.is_pqc]
        classical_kex = [s.algorithm for s in kex_scores if not (s.is_hybrid or s.is_pqc)]
        sig_algos = [s.algorithm for s in scored_algorithms if s.algorithm_type == "signature"]
        sym_scores = [s for s in scored_algorithms if s.algorithm_type == "symmetric"]
        strong_sym = [s.algorithm for s in sym_scores if s.final_score >= 80]
        weak_sym = [s.algorithm for s in sym_scores if s.final_score < 60]

        # HNDL risk assessment
        # Risk tiers:
        #   low    — hybrid PQC/classical KEX deployed (ML-KEM, Kyber hybrid)
        #   medium — modern classical KEX only (X25519, ECDHE, FFDHE-3072+)
        #            These are NOT quantum-safe but represent sound current practice.
        #   high   — weak or legacy KEX only (RSA, plain DH-1024, DHE-512, etc.)
        # The '15' threshold captures X25519 (score≈30) and ECDHE (score≈10-20)
        # while excluding plain RSA key exchange (score≈0) and weak DH (score≈5).
        if hybrid_ready:
            hndl_risk = "low"
            hndl_reason = ("Hybrid PQC/classical key exchange is deployed. "
                           "Active TLS sessions are protected against Harvest-Now-Decrypt-Later attacks.")
        elif any(s.final_score >= 15 for s in kex_scores):
            hndl_risk = "medium"
            hndl_reason = ("No PQC hybrid KEX detected. Modern classical KEX (X25519/ECDHE) is in use — "
                           "data is classically secure but vulnerable to Harvest-Now-Decrypt-Later. "
                           "Deploying X25519MLKEM768 would eliminate this risk immediately.")
        else:
            hndl_risk = "high"
            hndl_reason = ("Weak or legacy key exchange (DH-1024 / RSA KEX) with no PQC hybrid groups. "
                           "Critical HNDL exposure — prioritise immediate KEX migration to "
                           "X25519 + X25519MLKEM768.")

        kex_comp = components.get("kex")
        sig_comp = components.get("signature")
        sym_comp = components.get("symmetric")
        proto_comp = components.get("protocol")

        # Collect detected legacy (deprecated) protocols
        legacy_protocols_detected = [
            s.algorithm for s in scored_algorithms
            if s.algorithm_type == "protocol" and s.deprecated
        ]

        # Migration tier
        if legacy_protocols_detected:
            migration_tier = 3
            lp_str = ", ".join(legacy_protocols_detected)
            migration_note = (
                f"Critical: deprecated protocol(s) detected: {lp_str}. "
                "Disable TLS 1.0/1.1 immediately, then deploy X25519MLKEM768 hybrid KEX."
            )
        elif hybrid_ready and (sym_comp and sym_comp.weighted_average >= 70):
            migration_tier = 1
            migration_note = "KEX migration complete. Await PQC certificate issuance by CAs (est. 2026-2028)."
        elif hybrid_ready:
            migration_tier = 2
            migration_note = "Hybrid KEX deployed. Upgrade symmetric to AES-256 / ChaCha20-Poly1305."
        else:
            migration_tier = 3
            migration_note = "Deploy hybrid KEX groups (X25519MLKEM768 / X25519MLKEM1024) as first priority."

        return {
            "hndl_risk": hndl_risk,
            "hndl_reason": hndl_reason,
            "migration_tier": migration_tier,
            "migration_note": migration_note,
            "hybrid_kex_groups": hybrid_kex,
            "classical_kex_groups": classical_kex,
            "signature_algorithms": sig_algos,
            "strong_symmetric": strong_sym,
            "weak_symmetric": weak_sym,
            "legacy_protocols": legacy_protocols_detected,
            "kex_score": round(kex_comp.weighted_average, 2) if kex_comp else 0.0,
            "sym_score": round(sym_comp.weighted_average, 2) if sym_comp else 0.0,
            "sig_score": round(sig_comp.weighted_average, 2) if sig_comp else 0.0,
            "proto_score": round(proto_comp.weighted_average, 2) if proto_comp else None,
            "nist_standards_used": [a for a in hybrid_kex if "MLKEM" in a.upper()],
            "draft_standards_used": [a for a in hybrid_kex if "KYBER" in a.upper() and "MLKEM" not in a.upper()],
        }
    
    def _identify_vulnerabilities(self, scores: List[AlgorithmScoreOutput], components: Dict[str, ComponentScore]) -> List[str]:
        vulns = []

        # Legacy TLS — explicit grade-cap notice (SSL Labs alignment)
        legacy_tls = [
            a.algorithm for a in scores
            if a.algorithm_type == "protocol" and a.algorithm in ("TLS 1.0", "TLS 1.1")
        ]
        if legacy_tls:
            vulns.append(
                f"This server supports {', '.join(legacy_tls)}. Grade capped to B. "
                "Disable these protocol versions immediately."
            )

        deprecated_algos = [s.algorithm for s in scores if s.deprecated and s.algorithm_type != "protocol"]
        if deprecated_algos:
            vulns.append(f"Deprecated algorithms detected: {', '.join(deprecated_algos[:3])}")

        for comp_type, comp_data in components.items():
            if comp_data.weighted_average < 20:
                vulns.append(f"Critical weakness in {comp_type}: score {comp_data.weighted_average:.1f}")

        if "kex" in components and components["kex"].pqc_percentage == 0:
            vulns.append(
                "No post-quantum key exchange detected — HNDL risk: data encrypted today "
                "could be decrypted by a future quantum computer"
            )

        sym_comp = components.get("symmetric")
        if sym_comp and sym_comp.weighted_average < 50:
            vulns.append(
                f"Symmetric encryption below Grover-safe threshold (score {sym_comp.weighted_average:.1f}): "
                "upgrade to AES-256-GCM or ChaCha20-Poly1305"
            )

        return vulns

    def _build_notices(
        self,
        scored_algorithms: List[AlgorithmScoreOutput],
        hybrid_ready: bool,
    ) -> List[Dict]:
        """
        Build SSL-Labs-style notices for display in the UI.
        Returns a list of {type, severity, message} dicts.
        """
        notices = []
        proto_names = [
            a.algorithm for a in scored_algorithms
            if a.algorithm_type == "protocol"
        ]

        # Legacy TLS cap notice
        legacy = [p for p in proto_names if p in ("TLS 1.0", "TLS 1.1")]
        if legacy:
            notices.append({
                "type": "grade_cap",
                "severity": "warning",
                "message": (
                    f"This server supports {' and '.join(legacy)}. Grade capped to B."
                ),
            })

        # TLS 1.3 present
        if "TLS 1.3" in proto_names:
            notices.append({
                "type": "tls13",
                "severity": "info",
                "message": "This server supports TLS 1.3.",
            })

        # No PQC key exchange
        if not hybrid_ready:
            notices.append({
                "type": "no_pqc_kex",
                "severity": "warning",
                "message": (
                    "This server does not support PQC (Post-Quantum Cryptography) key exchange. "
                    "Deploy X25519MLKEM768 to protect against Harvest-Now-Decrypt-Later attacks."
                ),
            })
        else:
            notices.append({
                "type": "pqc_kex",
                "severity": "info",
                "message": "This server supports PQC hybrid key exchange.",
            })

        return notices

    def _check_compliance(
        self,
        components: Dict[str, ComponentScore],
        overall_score: float,
        hybrid_ready: bool = False,
        has_legacy_tls: bool = False,
        has_weak_ciphers: bool = False,
    ) -> Dict[str, bool]:
        sym_comp = components.get("symmetric")
        kex_comp = components.get("kex")
        sym_ok = (sym_comp.weighted_average >= 70) if sym_comp else False

        # PCI DSS 4.0: requires TLS 1.2+, no RC4/DES/NULL, no MD5/SHA-1 certs.
        # Classical ECDSA/RSA signatures are FINE for PCI DSS — it is NOT a PQC
        # standard. Only the symmetric and KEX components need to meet classical
        # minimums, not the PQC-scored signature component.
        kex_ok_pci = (kex_comp.weighted_average >= 40) if kex_comp else False
        pci_pass = (
            overall_score >= 70
            and not has_legacy_tls
            and not has_weak_ciphers
            and sym_ok
            and kex_ok_pci
        )

        # NIST 800-52r2: requires TLS 1.2+ minimum. TLS 1.0/1.1 is an explicit fail.
        nist_pass = overall_score >= 75 and not has_legacy_tls

        return {
            "PCI DSS 4.0": pci_pass,
            "NIST 800-52r2": nist_pass,
            "FIPS 140-3": overall_score >= 80,
            # CNSA 2.0 requires ML-KEM hybrid KEX + AES-256; classical certs are
            # still acceptable during the transition period (until ~2030).
            "CNSA 2.0 (Quantum-Ready)": hybrid_ready and sym_ok,
        }

    def _determine_security_level(self, score: float) -> str:
        if score >= 90: return "excellent"
        elif score >= 75: return "high"
        elif score >= 60: return "medium"
        elif score >= 40: return "low"
        else: return "critical"
    
    def _score_to_grade(self, score: float) -> str:
        if score >= 90: return "A+"
        elif score >= 85: return "A"
        elif score >= 78: return "B+"
        elif score >= 72: return "B"
        elif score >= 65: return "B-"
        elif score >= 58: return "C+"
        elif score >= 50: return "C"
        elif score >= 42: return "C-"
        elif score >= 35: return "D"
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
        """Case-insensitive substring lookup that prefers the LONGEST key match.

        Preferring the longest key prevents short tokens like "DSA" from
        shadowing longer, more specific entries like "ECDSA" or "MLDSA".
        Both the input name and every table key are uppercased before
        comparison so mixed-case keys (e.g. "ChaCha20-Poly1305") are found
        correctly after all keys were normalised to uppercase in algorithms.py.
        """
        name_upper = name.upper()
        best_score = 0.0
        best_match_len = 0
        for key, score in table.items():
            key_upper = key.upper()
            if key_upper in name_upper or name_upper in key_upper:
                if len(key_upper) > best_match_len:
                    best_match_len = len(key_upper)
                    best_score = float(score)
        return best_score
    
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
                # Guard: EC curve bit-sizes (224–521) are sometimes mis-attributed
                # to RSA algorithm names when a cert chain mixes key types
                # (e.g. ECDSA leaf signed by RSA intermediate).  Applying a
                # −30 penalty to key_size=384 as if it were a 384-bit RSA key
                # would be catastrophically wrong — no CA issues <512-bit RSA.
                # Treat any sub-512 key_size here as an artefact and skip.
                if key_size < 512:
                    return 0
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
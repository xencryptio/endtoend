"""
Quantum Readiness Suggestions Engine

Generates actionable, prioritised migration recommendations from a PQC scoring
result.  Recommendations follow NIST IR 8413, CISA PQC Migration Guidance 2024,
and NSA/CNSA 2.0 Suite requirements.
"""
from typing import Dict, List, Any, Optional


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_suggestions(pqc_result: Dict) -> Dict:
    """
    Given the output of UniversalPQCScorer.score_algorithms(), return a
    structured suggestions document.

    Returns
    -------
    dict with keys:
        overall_assessment  : str
        positive_findings   : List[str]
        gaps                : List[str]
        migration_roadmap   : List[dict]  # ordered steps
        nist_timeline       : str
        grade_explanation   : str
        cnsa_compliance     : dict
    """
    grade            = pqc_result.get("overall_grade", "F")
    score            = pqc_result.get("overall_score", 0.0)
    hybrid_ready     = pqc_result.get("hybrid_ready", False)
    quantum_ready    = pqc_result.get("quantum_ready", False)
    components       = pqc_result.get("components", {})
    qr_detail        = pqc_result.get("quantum_readiness_detail") or {}
    compliance       = pqc_result.get("compliance_status", {})
    domain           = pqc_result.get("domain", "this server")
    vulns            = pqc_result.get("critical_vulnerabilities", [])

    kex_score  = _comp_score(components, "kex")
    sym_score  = _comp_score(components, "symmetric")
    sig_score  = _comp_score(components, "signature")
    hash_score = _comp_score(components, "hash")

    hybrid_groups  = qr_detail.get("hybrid_kex_groups", [])
    nist_standards = qr_detail.get("nist_standards_used", [])
    draft_standards = qr_detail.get("draft_standards_used", [])
    hndl_risk      = qr_detail.get("hndl_risk", "high")
    migration_tier = qr_detail.get("migration_tier", 3)

    positives = _build_positives(
        hybrid_ready, quantum_ready, sym_score, hash_score, sig_score,
        hybrid_groups, nist_standards, draft_standards, compliance
    )
    gaps = _build_gaps(
        hybrid_ready, kex_score, sym_score, sig_score, hndl_risk, vulns,
        compliance, qr_detail
    )
    roadmap = _build_roadmap(
        hybrid_ready, quantum_ready, kex_score, sym_score, sig_score,
        hndl_risk, migration_tier, nist_standards, compliance
    )

    return {
        "overall_assessment": _overall_assessment(
            domain, grade, score, hybrid_ready, quantum_ready, hndl_risk
        ),
        "positive_findings": positives,
        "gaps": gaps,
        "migration_roadmap": roadmap,
        "nist_timeline": _nist_timeline(migration_tier),
        "grade_explanation": _grade_explanation(grade, score, hybrid_ready, quantum_ready),
        "cnsa_compliance": _cnsa_summary(compliance, hybrid_groups, sym_score),
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _comp_score(components: Dict, key: str) -> float:
    comp = components.get(key)
    if not comp:
        return 0.0
    # components may be dict (from .dict()) or a ComponentScore model
    if isinstance(comp, dict):
        return float(comp.get("weighted_average", comp.get("score", 0.0)))
    return float(getattr(comp, "weighted_average", 0.0))


def _overall_assessment(domain, grade, score, hybrid_ready, quantum_ready, hndl_risk):
    if quantum_ready:
        return (
            f"{domain} has achieved Quantum Readiness Tier 1. "
            f"PQC hybrid key exchange is active and symmetric encryption is Grover-safe, "
            f"eliminating Harvest-Now-Decrypt-Later (HNDL) risk for active sessions. "
            f"Overall grade: {grade} ({score:.1f}/100)."
        )
    if hybrid_ready:
        return (
            f"{domain} is on the quantum migration path (grade {grade}, {score:.1f}/100). "
            "PQC hybrid key exchange is deployed, substantially reducing HNDL exposure. "
            "Complete the transition by ensuring symmetric and hash algorithms also meet "
            "post-quantum security requirements."
        )
    if hndl_risk == "medium":
        return (
            f"{domain} uses classical TLS (grade {grade}, {score:.1f}/100). "
            "No PQC hybrid key exchange is detected. Data encrypted today is vulnerable to "
            "retroactive decryption once fault-tolerant quantum computers become available "
            "('Harvest-Now, Decrypt-Later'). Deploying X25519MLKEM768 is the single highest-"
            "impact change you can make."
        )
    return (
        f"{domain} has serious post-quantum cryptography gaps (grade {grade}, {score:.1f}/100). "
        "Multiple components require attention before this server can be considered "
        "quantum-safe. Follow the prioritised roadmap below."
    )


def _build_positives(
    hybrid_ready, quantum_ready, sym_score, hash_score, sig_score,
    hybrid_groups, nist_standards, draft_standards, compliance
):
    pos = []
    if quantum_ready:
        pos.append(
            "Quantum Readiness ACHIEVED: hybrid KEX + Grover-safe symmetric encryption "
            "protect active TLS sessions against HNDL attacks."
        )
    if hybrid_ready:
        pos.append(
            f"PQC Hybrid Key Exchange deployed ({len(hybrid_groups)} hybrid group(s) detected). "
            "Modern clients negotiating a TLS handshake with this server use a post-quantum-secure "
            "key agreement, stopping HNDL attacks in real time."
        )
    if nist_standards:
        pos.append(
            f"NIST-standardised ML-KEM groups active: {', '.join(nist_standards[:4])}. "
            "These follow FIPS 203 (ML-KEM) — the finalized NIST standard."
        )
    if draft_standards:
        pos.append(
            f"Kyber draft groups also supported: {', '.join(draft_standards[:4])}. "
            "Provides backward compatibility with clients that haven't yet upgraded to FIPS 203."
        )
    if sym_score >= 80:
        pos.append(
            f"Symmetric encryption is Grover-safe (score {sym_score:.0f}/100). "
            "AES-256 provides ~128 bits of post-quantum security per Grover's algorithm analysis; "
            "ChaCha20-Poly1305 is similarly robust."
        )
    elif sym_score >= 60:
        pos.append(
            f"Symmetric encryption is adequate (score {sym_score:.0f}/100) with TLS 1.3 ciphers."
        )
    if hash_score >= 70:
        pos.append(
            f"Hash function suite is quantum-resilient (score {hash_score:.0f}/100). "
            "SHA-256 / SHA-384 provide sufficient security against Grover attacks."
        )
    if sig_score >= 40:
        pos.append(
            f"Signature algorithms are current best-practice classical (score {sig_score:.0f}/100). "
            "ECDSA P-256 / Ed25519 are used — acceptable until PQC CA infrastructure is available."
        )
    if compliance.get("PCI DSS 4.0"):
        pos.append("PCI DSS 4.0 cryptographic requirements met.")
    if compliance.get("NIST 800-52r2"):
        pos.append("NIST SP 800-52r2 (TLS requirements for federal systems) compliance met.")
    return pos


def _build_gaps(
    hybrid_ready, kex_score, sym_score, sig_score, hndl_risk, vulns,
    compliance, qr_detail
):
    gaps = []
    if not hybrid_ready:
        gaps.append(
            "No PQC hybrid key exchange detected. This is the most critical gap. "
            "Without hybrid KEX, recorded TLS sessions can be decrypted retroactively "
            "once CRQCs (Cryptographically Relevant Quantum Computers) become operational. "
            "Solution: configure X25519MLKEM768 as the highest-priority TLS group."
        )
    elif kex_score < 70:
        gaps.append(
            f"Hybrid KEX score is moderate ({kex_score:.0f}/100). Ensure ML-KEM-768 or "
            "ML-KEM-1024 groups appear BEFORE classical groups in server configuration so "
            "they are negotiated preferentially."
        )
    if sym_score < 60:
        gaps.append(
            f"Symmetric encryption score is low ({sym_score:.0f}/100). "
            "Disable 3DES, RC4, and any TLS 1.0/1.1 cipher suites. "
            "Prioritise AES-256-GCM and ChaCha20-Poly1305."
        )
    if sig_score < 20:
        gaps.append(
            f"Certificate signature score is very low ({sig_score:.0f}/100). "
            "Consider upgrading from RSA-2048 to RSA-4096 or ECDSA P-256/P-384 as an "
            "interim measure. Monitor CA support for ML-DSA (FIPS 204) certificates, "
            "expected to become available 2026-2028."
        )
    weak_sym = qr_detail.get("weak_symmetric", [])
    if weak_sym:
        gaps.append(
            f"Weak symmetric suites still accepted: {', '.join(weak_sym[:3])}. "
            "These reduce the effective security level. Disable them in server configuration."
        )
    if not compliance.get("CNSA 2.0 (Quantum-Ready)"):
        gaps.append(
            "Not yet CNSA 2.0 compliant. Full CNSA 2.0 requires ML-KEM hybrid KEX "
            "and AES-256 symmetric encryption. Signature compliance awaits PQC CA availability."
        )
    for v in vulns[:3]:
        if v not in " ".join(gaps):
            gaps.append(v)
    return gaps


def _build_roadmap(
    hybrid_ready, quantum_ready, kex_score, sym_score, sig_score,
    hndl_risk, migration_tier, nist_standards, compliance
) -> List[Dict]:
    steps = []
    step_num = 1

    if not hybrid_ready:
        steps.append({
            "step": step_num,
            "priority": "CRITICAL",
            "title": "Deploy PQC Hybrid Key Exchange",
            "description": (
                "Configure X25519MLKEM768 (FIPS 203 / IANA group 4588) as the first TLS "
                "named group in your server's priority list. Add X25519MLKEM1024 (group 4589) "
                "as a secondary option. This single change eliminates HNDL exposure for all "
                "future TLS sessions."
            ),
            "nist_reference": "NIST FIPS 203 (ML-KEM), CISA PQC Migration Guidance 2024 §3.2",
            "effort": "Low-Medium (OpenSSL 3.2+ / BoringSSL / Go 1.23+ with one config line)",
            "impact": "Eliminates Harvest-Now-Decrypt-Later risk immediately",
        })
        step_num += 1

    if sym_score < 70 and not compliance.get("PCI DSS 4.0"):
        steps.append({
            "step": step_num,
            "priority": "HIGH",
            "title": "Harden Symmetric Cipher Suite",
            "description": (
                "Ensure only AES-256-GCM-SHA384 and TLS_CHACHA20_POLY1305_SHA256 are enabled. "
                "Disable TLS_AES_128_GCM_SHA256 if your client base supports 256-bit suites. "
                "Remove all CBC-mode suites and any suites using RC4, 3DES, or DES."
            ),
            "nist_reference": "NIST SP 800-52r2 §3.3.1.1, CNSA 2.0",
            "effort": "Low (server configuration change, no code changes)",
            "impact": "Achieves 128-bit post-quantum security for symmetric layer (Grover-safe)",
        })
        step_num += 1

    if not hybrid_ready or kex_score < 75:
        steps.append({
            "step": step_num,
            "priority": "HIGH",
            "title": "Enable TLS 1.3 Exclusively (Disable TLS 1.0 / 1.1)",
            "description": (
                "TLS 1.3 mandates forward secrecy and removes negotiation of weak cipher suites. "
                "Disable TLS 1.0 and TLS 1.1 entirely. Retain TLS 1.2 only for legacy client "
                "compatibility with strong cipher-suite restrictions."
            ),
            "nist_reference": "NIST SP 800-52r2, PCI DSS 4.0 requirement 4.2.1",
            "effort": "Low (server config)",
            "impact": "Eliminates downgrade attack surface and enforces AEAD-only ciphers",
        })
        step_num += 1

    steps.append({
        "step": step_num,
        "priority": "MEDIUM",
        "title": "Monitor CA Support for PQC Certificates (ML-DSA / SLH-DSA)",
        "description": (
            "No public CA currently issues ML-DSA (FIPS 204) or SLH-DSA (FIPS 205) certificates. "
            "Subscribe to CA/Browser Forum announcements. When CAs begin issuing PQC leaf "
            "certificates (~2026-2028), plan a certificate rotation. Hybrid X.509 certificates "
            "(classical + ML-DSA) may be available as an intermediate step."
        ),
        "nist_reference": "NIST FIPS 204 (ML-DSA), FIPS 205 (SLH-DSA)",
        "effort": "Monitor only — no action required today",
        "impact": "Completes quantum readiness when PQC certs become available",
    })
    step_num += 1

    if nist_standards:
        steps.append({
            "step": step_num,
            "priority": "LOW",
            "title": "Retire Kyber Draft Groups After Broad ML-KEM Adoption",
            "description": (
                "X25519Kyber768Draft00 and similar draft groups provide good interim security "
                "but use pre-standardisation parameters. Once client adoption of FIPS 203 "
                "ML-KEM groups (X25519MLKEM768 / X25519MLKEM1024) reaches >95%, "
                "remove draft Kyber groups to reduce configuration complexity."
            ),
            "nist_reference": "IETF RFC (pending) for Hybrid TLS Key Exchange",
            "effort": "Low (remove from named-groups list)",
            "impact": "Simplification — no security regression",
        })
        step_num += 1

    steps.append({
        "step": step_num,
        "priority": "ONGOING",
        "title": "Cryptographic Agility — Automate Algorithm Inventory",
        "description": (
            "Integrate automated PQC scanning (such as this service) into your CI/CD pipeline. "
            "Re-scan on every server configuration change and after each TLS library upgrade. "
            "Maintain a cryptographic Bill of Materials (CBOM) as recommended by CISA."
        ),
        "nist_reference": "CISA Quantum-Readiness Roadmap 2023, NISTIR 8547",
        "effort": "Medium (pipeline integration)",
        "impact": "Continuous visibility into cryptographic posture",
    })

    return steps


def _nist_timeline(migration_tier: int) -> str:
    timelines = {
        1: (
            "You are at CNSA 2.0 Tier 1 — hybrid KEX deployed. "
            "CISA guidance (2024): complete KEX migration by 2025 (DONE), "
            "complete symmetric hardening by 2026, "
            "and complete certificate migration by 2030."
        ),
        2: (
            "You are at CNSA 2.0 Tier 2 — hybrid KEX deployed but symmetric needs work. "
            "CISA recommends completing symmetric hardening in 2025."
        ),
        3: (
            "You are at CNSA 2.0 Tier 3 — KEX migration not yet started. "
            "CISA considers KEX migration the highest-priority action for 2024/2025. "
            "NSA CNSA 2.0 has a recommended completion deadline of 2025 for National Security Systems. "
            "Commercial systems should treat 2026-2028 as the practical deadline before "
            "quantum computers capable of breaking RSA-2048/ECDSA-P256 become feasible."
        ),
    }
    return timelines.get(migration_tier, timelines[3])


def _grade_explanation(grade: str, score: float, hybrid_ready: bool, quantum_ready: bool) -> str:
    mapping = {
        "A+": (
            "A+ (90-100): Full Quantum Readiness. Hybrid PQC KEX + Grover-safe symmetric + "
            "optimal configuration. CNSA 2.0 compliant."
        ),
        "A": (
            "A (85-89): Excellent quantum posture. Hybrid KEX deployed and strong across all "
            "components. Minor gaps may exist in draft/transitional standards."
        ),
        "B+": (
            "B+ (78-84): Hybrid KEX deployed and working well. Server is actively protecting "
            "against HNDL for modern clients. Symmetric or signature components may need minor work."
        ),
        "B": (
            "B (72-77): Hybrid KEX available. Good TLS foundation. Some classical components "
            "drag the score; this is expected given current CA infrastructure limitations."
        ),
        "B-": (
            "B- (65-71): Hybrid KEX present but not fully optimised. Ensure hybrid groups are "
            "server-preferred (listed first) and classical fallbacks are limited to strong options."
        ),
        "C+": (
            "C+ (58-64): X25519 or strong classical KEX without hybrid PQC. Good TLS hygiene "
            "but no HNDL protection. Adding a single hybrid group would jump to B+ range."
        ),
        "C": (
            "C (50-57): Classical TLS 1.3 with basic hygiene. No quantum migration yet. "
            "Symmetric is adequate but KEX has no quantum protection."
        ),
        "C-": (
            "C- (42-49): Older TLS patterns. Some weak cipher suites may be accepted. "
            "Prioritise disabling TLS 1.0/1.1 and weak ciphers alongside adding hybrid KEX."
        ),
        "D": (
            "D (35-41): Multiple legacy concerns. Deprecated algorithms or protocols detected. "
            "Immediate remediation required even from a classical security perspective — "
            "quantum migration can follow."
        ),
        "F": (
            "F (<35): Critically insecure. Broken or severely inadequate cryptography detected. "
            "Address classical vulnerabilities first, then begin quantum migration."
        ),
    }
    return mapping.get(grade, f"Grade {grade} ({score:.1f}/100).")


def _cnsa_summary(compliance: Dict, hybrid_groups: List[str], sym_score: float) -> Dict:
    cnsa_kex_ok = len(hybrid_groups) > 0
    cnsa_sym_ok = sym_score >= 70
    cnsa_certs_ok = False  # No FIPS 204/205 certs available from public CAs yet

    reqs = {
        "kex_ml_kem": {
            "status": cnsa_kex_ok,
            "requirement": "Key agreement: ML-KEM-768 or ML-KEM-1024 hybrid (FIPS 203)",
            "detail": (
                f"Compliant — groups detected: {', '.join(hybrid_groups[:3])}"
                if cnsa_kex_ok
                else "Not met — add X25519MLKEM768 to TLS named-groups"
            ),
        },
        "symmetric_aes256": {
            "status": cnsa_sym_ok,
            "requirement": "Symmetric encryption: AES-256 (CNSA 2.0 §4)",
            "detail": (
                "Compliant — AES-256-GCM and/or ChaCha20-Poly1305 in use"
                if cnsa_sym_ok
                else "Partial — ensure AES-256-GCM is the only accepted symmetric cipher"
            ),
        },
        "signatures_ml_dsa": {
            "status": cnsa_certs_ok,
            "requirement": "Digital signatures: ML-DSA / SLH-DSA (FIPS 204/205) — transition period",
            "detail": (
                "Not yet available from public CAs. ECDSA P-384 is acceptable during "
                "transition (CNSA 2.0 Appendix B). Target: 2030."
            ),
        },
    }
    overall = cnsa_kex_ok and cnsa_sym_ok
    return {
        "overall_compliant": overall,
        "summary": (
            "CNSA 2.0 Key Exchange and Symmetric requirements met. Certificate requirement "
            "deferred — no public CA issues PQC certs yet."
        ) if overall else (
            "CNSA 2.0 compliance not yet achieved. See requirements below."
        ),
        "requirements": reqs,
    }

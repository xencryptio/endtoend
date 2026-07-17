"""
Independent Repository Cryptographic Scoring Engine
====================================================
Purpose-built for source code analysis. Does NOT share logic with the
TLS/domain scoring engine — repo scanning has fundamentally different
semantics (static code patterns vs. live protocol negotiation).

Scoring Philosophy for Source Code:
───────────────────────────────────
• Source code uses algorithms directly — no "negotiation" or "preference".
  Every algorithm found in active code contributes equally weighted by
  its occurrence count.
• Quantum readiness is measured by what % of crypto operations use
  quantum-safe primitives.
• The score reflects HOW HARD it will be to migrate to PQC, not whether
  the code is "secure today" (which depends on deployment context).

Grade Thresholds (Quantum Readiness Scale):
  A+  >= 92  Fully PQC-ready codebase
  A   >= 85  Mostly PQC, minimal classical crypto
  B+  >= 78  Significant PQC adoption, good classical
  B   >= 70  Some PQC usage, strong classical defaults
  B-  >= 62  Good classical crypto, PQC migration started
  C+  >= 55  Adequate classical, no PQC
  C   >= 45  Mixed — some deprecated algorithms present
  C-  >= 38  Weak classical crypto, migration needed
  D   >= 28  Significant deprecated/broken algorithms
  F   <  28  Critical — broken crypto throughout
"""

import logging
from typing import Dict, List, Optional, Tuple, Any
from collections import defaultdict

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# ALGORITHM SCORE TABLE — Quantum Readiness scores for source code context
# ═══════════════════════════════════════════════════════════════════════════
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

REPO_ALGORITHM_SCORES: Dict[str, Dict[str, Any]] = {
    # ── Symmetric Encryption ─────────────────────────────────────────────
    "AES": {
        "base_score": 65, "category": "symmetric",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "AES with 256-bit keys provides ~128-bit post-quantum security (Grover halving)",
        "variants": {
            "128": {"score": 45, "safe": False, "reason": "AES-128 provides only ~64-bit post-quantum security — insufficient"},
            "192": {"score": 55, "safe": True, "reason": "AES-192 provides ~96-bit post-quantum security — marginal"},
            "256": {"score": 75, "safe": True, "reason": "AES-256 provides ~128-bit post-quantum security — Grover-safe"},
        },
        "migration": "Upgrade all AES-128 usages to AES-256. AES-256-GCM is the recommended mode.",
    },
    "ChaCha20": {
        "base_score": 72, "category": "symmetric",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "ChaCha20 uses 256-bit keys — provides ~128-bit post-quantum security",
        "migration": "No migration needed. ChaCha20 is already quantum-resistant.",
    },
    "ChaCha20-Poly1305": {
        "base_score": 75, "category": "symmetric",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "AEAD with 256-bit key — Grover-safe with strong authentication",
        "migration": "No migration needed. This is a recommended AEAD cipher.",
    },
    "Salsa20": {
        "base_score": 65, "category": "symmetric",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "256-bit key stream cipher — Grover-safe",
        "migration": "Consider migrating to ChaCha20-Poly1305 for authenticated encryption.",
    },
    "Twofish": {
        "base_score": 55, "category": "symmetric",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "256-bit block cipher, Grover-safe but not widely deployed",
        "migration": "Replace with AES-256-GCM for better hardware acceleration and ecosystem support.",
    },
    "Serpent": {
        "base_score": 55, "category": "symmetric",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "256-bit block cipher, conservative design but slow",
        "migration": "Replace with AES-256-GCM for better performance and ecosystem support.",
    },
    "Blowfish": {
        "base_score": 20, "category": "symmetric",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "64-bit block size — vulnerable to birthday attacks (Sweet32). Not recommended.",
        "migration": "Replace immediately with AES-256-GCM or ChaCha20-Poly1305.",
    },
    "Camellia": {
        "base_score": 55, "category": "symmetric",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "256-bit cipher, Grover-safe. Less common than AES.",
        "migration": "Replace with AES-256-GCM for wider ecosystem support unless regulatory requirements mandate Camellia.",
    },
    "ARIA": {
        "base_score": 55, "category": "symmetric",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "Korean standard cipher, 256-bit, Grover-safe",
        "migration": "No urgent migration. Consider AES-256-GCM for global interoperability.",
    },
    "3DES": {
        "base_score": 8, "category": "symmetric",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "112-bit effective key, 64-bit block — vulnerable to Sweet32 and NIST-deprecated since 2023",
        "migration": "CRITICAL: Replace all 3DES usage with AES-256-GCM immediately. This is deprecated by NIST SP 800-131A Rev 2.",
    },
    "DES": {
        "base_score": 0, "category": "symmetric",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "56-bit key — brute-forceable in hours. Completely broken.",
        "migration": "CRITICAL: Replace all DES usage with AES-256-GCM immediately.",
    },
    "RC4": {
        "base_score": 0, "category": "symmetric",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "Multiple cryptographic weaknesses. Prohibited by RFC 7465.",
        "migration": "CRITICAL: Replace all RC4 usage with AES-256-GCM or ChaCha20-Poly1305.",
    },
    "RC2": {
        "base_score": 0, "category": "symmetric",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "Weak cipher with effective key length attacks.",
        "migration": "CRITICAL: Replace with AES-256-GCM.",
    },
    "IDEA": {
        "base_score": 15, "category": "symmetric",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "128-bit key but outdated design with known weaknesses in reduced rounds",
        "migration": "Replace with AES-256-GCM.",
    },
    "CAST5": {
        "base_score": 18, "category": "symmetric",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "64-bit block, 128-bit key — birthday attack vulnerable",
        "migration": "Replace with AES-256-GCM.",
    },

    # ── Cipher Modes ─────────────────────────────────────────────────────
    "GCM": {
        "base_score": 70, "category": "mode",
        "quantum_safe": True, "resistance": "mode",
        "reason": "Authenticated encryption mode — recommended for all block ciphers",
        "migration": "No migration needed. GCM is the recommended mode.",
    },
    "CBC": {
        "base_score": 35, "category": "mode",
        "quantum_safe": False, "resistance": "mode",
        "reason": "Vulnerable to padding oracle attacks if not implemented carefully. Not AEAD.",
        "migration": "Replace CBC with GCM or CCM mode for authenticated encryption.",
    },
    "CTR": {
        "base_score": 50, "category": "mode",
        "quantum_safe": True, "resistance": "mode",
        "reason": "Secure stream mode but requires separate MAC. Prefer GCM for built-in authentication.",
        "migration": "Pair with HMAC, or switch to GCM/CCM for built-in authentication.",
    },
    "CCM": {
        "base_score": 65, "category": "mode",
        "quantum_safe": True, "resistance": "mode",
        "reason": "Authenticated encryption mode. Good alternative to GCM.",
        "migration": "No urgent migration. GCM is slightly preferred for parallelism.",
    },
    "ECB": {
        "base_score": 5, "category": "mode",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "INSECURE: Leaks plaintext patterns. Never use for encryption.",
        "migration": "CRITICAL: Replace ECB with GCM, CCM, or CTR+HMAC immediately.",
    },

    # ── Hash Functions ───────────────────────────────────────────────────
    "SHA-256": {
        "base_score": 60, "category": "hash",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "256-bit output provides ~128-bit collision resistance post-quantum (Grover halving)",
        "migration": "Consider SHA-384 or SHA3-256 for higher post-quantum security margin.",
    },
    "SHA-384": {
        "base_score": 70, "category": "hash",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "384-bit output — strong post-quantum collision resistance",
        "migration": "No migration needed. Excellent quantum-resistant hash.",
    },
    "SHA-512": {
        "base_score": 72, "category": "hash",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "512-bit output — provides ~256-bit post-quantum collision security",
        "migration": "No migration needed. Strongest SHA-2 variant.",
    },
    "SHA-224": {
        "base_score": 45, "category": "hash",
        "quantum_safe": False, "resistance": "grover_resistant",
        "reason": "224-bit output — only ~112-bit post-quantum collision resistance. Marginal.",
        "migration": "Upgrade to SHA-256 or SHA-384 for better quantum resistance margin.",
    },
    "SHA3-256": {
        "base_score": 68, "category": "hash",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "SHA-3 family, 256-bit output, different construction from SHA-2 (Keccak sponge)",
        "migration": "No migration needed. Excellent quantum-resistant hash.",
    },
    "SHA3-384": {
        "base_score": 72, "category": "hash",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "SHA-3 family, 384-bit output — strong post-quantum collision resistance",
        "migration": "No migration needed.",
    },
    "SHA3-512": {
        "base_score": 75, "category": "hash",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "SHA-3 family, 512-bit output — strongest SHA-3 variant",
        "migration": "No migration needed.",
    },
    "BLAKE2": {
        "base_score": 65, "category": "hash",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "Modern hash function, up to 512-bit output. Grover-resistant.",
        "migration": "No migration needed. BLAKE2 is a strong modern choice.",
    },
    "BLAKE3": {
        "base_score": 68, "category": "hash",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "Latest BLAKE variant, 256-bit output with Merkle tree parallelism",
        "migration": "No migration needed.",
    },
    "Keccak": {
        "base_score": 68, "category": "hash",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "SHA-3 underlying algorithm (sponge construction). Quantum-resistant.",
        "migration": "No migration needed. Consider using standardised SHA-3 interface.",
    },
    "SHAKE128": {
        "base_score": 60, "category": "hash",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "SHA-3 XOF with 128-bit security level",
        "migration": "Consider SHAKE256 for higher post-quantum security margin.",
    },
    "SHAKE256": {
        "base_score": 70, "category": "hash",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "SHA-3 XOF with 256-bit security level",
        "migration": "No migration needed.",
    },
    "RIPEMD-160": {
        "base_score": 30, "category": "hash",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "160-bit output — only ~80-bit post-quantum collision resistance. Obsolete.",
        "migration": "Replace with SHA-256 or SHA3-256.",
    },
    "Whirlpool": {
        "base_score": 55, "category": "hash",
        "quantum_safe": True, "resistance": "grover_resistant",
        "reason": "512-bit hash. Grover-resistant but rarely used.",
        "migration": "Replace with SHA-512 or SHA3-512 for wider ecosystem support.",
    },
    "MD5": {
        "base_score": 0, "category": "hash",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "BROKEN: Collision attacks are trivial. CVE-2004-2761.",
        "migration": "CRITICAL: Replace all MD5 usage. Use SHA-256 for checksums, SHA-384+ for security.",
    },
    "MD4": {
        "base_score": 0, "category": "hash",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "BROKEN: Even weaker than MD5. Collision in seconds.",
        "migration": "CRITICAL: Replace immediately with SHA-256 or SHA-384.",
    },
    "SHA-1": {
        "base_score": 8, "category": "hash",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "BROKEN: Practical collision attacks demonstrated (SHAttered, 2017). NIST deprecated.",
        "migration": "CRITICAL: Replace all SHA-1 usage with SHA-256 or SHA-384. Already prohibited for signatures by NIST.",
    },

    # ── MACs & KDFs (constructions — safety depends on underlying primitives) ──
    "HMAC": {
        "base_score": 60, "category": "mac",
        "quantum_safe": True, "resistance": "construction",
        "reason": "HMAC security depends on underlying hash. HMAC-SHA256+ is Grover-resistant.",
        "migration": "Ensure HMAC uses SHA-256 or stronger. Avoid HMAC-MD5 and HMAC-SHA1.",
    },
    "CMAC": {
        "base_score": 55, "category": "mac",
        "quantum_safe": True, "resistance": "construction",
        "reason": "CMAC security depends on underlying cipher (AES-CMAC is Grover-safe).",
        "migration": "Ensure CMAC uses AES-256.",
    },
    "Poly1305": {
        "base_score": 65, "category": "mac",
        "quantum_safe": True, "resistance": "construction",
        "reason": "Used with ChaCha20 for authenticated encryption. Post-quantum secure.",
        "migration": "No migration needed when used as ChaCha20-Poly1305.",
    },
    "PBKDF2": {
        "base_score": 50, "category": "kdf",
        "quantum_safe": True, "resistance": "construction",
        "reason": "KDF security depends on hash and iteration count. Adequate with SHA-256 + high iterations.",
        "migration": "Consider Argon2id for new designs. If keeping PBKDF2, use SHA-256 with ≥600,000 iterations (OWASP 2024).",
    },
    "scrypt": {
        "base_score": 58, "category": "kdf",
        "quantum_safe": True, "resistance": "construction",
        "reason": "Memory-hard KDF — stronger than PBKDF2 against hardware attacks",
        "migration": "Consider Argon2id for new designs. scrypt is acceptable for existing systems.",
    },
    "Argon2": {
        "base_score": 65, "category": "kdf",
        "quantum_safe": True, "resistance": "construction",
        "reason": "Winner of Password Hashing Competition. Best-in-class KDF.",
        "migration": "No migration needed. Argon2id is the recommended KDF.",
    },
    "bcrypt": {
        "base_score": 48, "category": "kdf",
        "quantum_safe": True, "resistance": "construction",
        "reason": "Adaptive password hashing. Adequate but limited to 72-byte input.",
        "migration": "For new systems, prefer Argon2id. bcrypt is acceptable for existing password storage.",
    },
    "HKDF": {
        "base_score": 60, "category": "kdf",
        "quantum_safe": True, "resistance": "construction",
        "reason": "Key derivation function. Security depends on underlying hash (HKDF-SHA256+ is safe).",
        "migration": "Ensure HKDF uses SHA-256 or stronger.",
    },

    # ── Asymmetric / Key Exchange (all quantum-VULNERABLE) ───────────────
    "RSA": {
        "base_score": 15, "category": "kex",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "QUANTUM VULNERABLE: Broken by Shor's algorithm. All RSA key sizes will be insecure.",
        "variants": {
            "1024": {"score": 0, "safe": False, "reason": "RSA-1024 is classically broken (NIST deprecated 2013)"},
            "2048": {"score": 15, "safe": False, "reason": "RSA-2048 is current minimum — will be broken by quantum computers"},
            "3072": {"score": 18, "safe": False, "reason": "RSA-3072 — slightly more time before quantum break, still vulnerable"},
            "4096": {"score": 20, "safe": False, "reason": "RSA-4096 — slow and still quantum-vulnerable"},
        },
        "migration": "CRITICAL: Replace RSA with ML-KEM (FIPS 203) for key exchange and ML-DSA (FIPS 204) for signatures. Use hybrid schemes during transition.",
    },
    "ECDSA": {
        "base_score": 28, "category": "signature",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "QUANTUM VULNERABLE: Broken by Shor's algorithm on elliptic curves.",
        "migration": "Replace with ML-DSA (Dilithium) for signatures. Use hybrid ECDSA+ML-DSA during transition.",
    },
    "ECDH": {
        "base_score": 25, "category": "kex",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "QUANTUM VULNERABLE: ECDH key exchange broken by Shor's algorithm.",
        "migration": "Replace with ML-KEM (Kyber) for key exchange. Use hybrid X25519+ML-KEM during transition.",
    },
    "DSA": {
        "base_score": 5, "category": "signature",
        "quantum_safe": False, "resistance": "deprecated",
        "reason": "DEPRECATED: DSA is obsolete (FIPS 186-5 dropped DSA for new signatures). Also quantum-vulnerable.",
        "migration": "CRITICAL: Replace DSA with Ed25519 immediately, then plan ML-DSA migration.",
    },
    "DH": {
        "base_score": 10, "category": "kex",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "QUANTUM VULNERABLE: Diffie-Hellman broken by Shor's algorithm. Also vulnerable to Logjam with small parameters.",
        "migration": "Replace with ECDH (X25519) as interim step, then ML-KEM for full PQC.",
    },
    "ElGamal": {
        "base_score": 8, "category": "kex",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "QUANTUM VULNERABLE: Based on discrete logarithm problem, broken by Shor's algorithm.",
        "migration": "Replace with ML-KEM (Kyber) for encryption.",
    },
    "Ed25519": {
        "base_score": 35, "category": "signature",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "Modern ECC signature — current best practice for classical crypto, but quantum-vulnerable.",
        "migration": "Replace with ML-DSA (Dilithium) or use hybrid Ed25519+ML-DSA.",
    },
    "Ed448": {
        "base_score": 38, "category": "signature",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "Stronger ECC signature — good classical security, but quantum-vulnerable.",
        "migration": "Replace with ML-DSA (Dilithium) or use hybrid Ed448+ML-DSA.",
    },
    "Curve25519": {
        "base_score": 30, "category": "kex",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "Modern ECDH curve — current best practice, but quantum-vulnerable.",
        "migration": "Replace with hybrid X25519+ML-KEM-768 for quantum safety.",
    },
    "Curve448": {
        "base_score": 32, "category": "kex",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "Stronger ECDH curve — good classical security, but quantum-vulnerable.",
        "migration": "Replace with hybrid X448+ML-KEM-1024 for quantum safety.",
    },
    "P-256": {
        "base_score": 25, "category": "kex",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "NIST P-256 curve — widely deployed but quantum-vulnerable.",
        "migration": "Replace with X25519+ML-KEM hybrid.",
    },
    "P-384": {
        "base_score": 28, "category": "kex",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "NIST P-384 curve — stronger classical, but quantum-vulnerable.",
        "migration": "Replace with P-384+ML-KEM-1024 hybrid.",
    },
    "P-521": {
        "base_score": 30, "category": "kex",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "NIST P-521 curve — strongest NIST curve, but quantum-vulnerable.",
        "migration": "Replace with ML-KEM-1024 based key exchange.",
    },
    "secp256k1": {
        "base_score": 22, "category": "kex",
        "quantum_safe": False, "resistance": "vulnerable",
        "reason": "Bitcoin/Ethereum curve — quantum-vulnerable. Critical for blockchain applications.",
        "migration": "Blockchain layer must adopt PQC signatures. Monitor NIST PQC standardisation for curve replacements.",
    },

    # ── Post-Quantum Cryptography (NIST Standardised & Candidates) ───────
    "Kyber": {
        "base_score": 92, "category": "kex",
        "quantum_safe": True, "resistance": "fully_resistant", "is_pqc": True,
        "reason": "NIST FIPS 203 (ML-KEM). Lattice-based KEM — the primary standard for post-quantum key exchange.",
        "variants": {
            "512": {"score": 88, "safe": True, "reason": "ML-KEM-512: NIST Level 1 (128-bit quantum security)"},
            "768": {"score": 93, "safe": True, "reason": "ML-KEM-768: NIST Level 3 (192-bit quantum security) — RECOMMENDED"},
            "1024": {"score": 96, "safe": True, "reason": "ML-KEM-1024: NIST Level 5 (256-bit quantum security)"},
        },
        "migration": "Already PQC. Consider ML-KEM-768 as the default security level.",
    },
    "Dilithium": {
        "base_score": 92, "category": "signature",
        "quantum_safe": True, "resistance": "fully_resistant", "is_pqc": True,
        "reason": "NIST FIPS 204 (ML-DSA). Lattice-based signature — the primary standard for post-quantum signatures.",
        "variants": {
            "2": {"score": 88, "safe": True, "reason": "ML-DSA-44: NIST Level 2"},
            "3": {"score": 93, "safe": True, "reason": "ML-DSA-65: NIST Level 3 — RECOMMENDED"},
            "5": {"score": 96, "safe": True, "reason": "ML-DSA-87: NIST Level 5"},
        },
        "migration": "Already PQC. Consider ML-DSA-65 as the default security level.",
    },
    "SPHINCS+": {
        "base_score": 90, "category": "signature",
        "quantum_safe": True, "resistance": "fully_resistant", "is_pqc": True,
        "reason": "NIST FIPS 205 (SLH-DSA). Hash-based signature — no lattice assumptions, most conservative PQC.",
        "migration": "Already PQC. Large signatures — use for root-of-trust, not bulk signing.",
    },
    "Falcon": {
        "base_score": 90, "category": "signature",
        "quantum_safe": True, "resistance": "fully_resistant", "is_pqc": True,
        "reason": "NIST-selected PQC signature. Compact signatures but complex implementation (NTRU lattice + FFT).",
        "migration": "Already PQC. Prefer ML-DSA for general use; Falcon for size-constrained applications.",
    },
    "NTRU": {
        "base_score": 82, "category": "kex",
        "quantum_safe": True, "resistance": "fully_resistant", "is_pqc": True,
        "reason": "One of the oldest lattice-based schemes. Not NIST-standardised but well-studied.",
        "migration": "Consider migrating to ML-KEM (Kyber) which is the NIST standard.",
    },
    "SABER": {
        "base_score": 80, "category": "kex",
        "quantum_safe": True, "resistance": "fully_resistant", "is_pqc": True,
        "reason": "NIST PQC Round 3 finalist (not selected for standardisation).",
        "migration": "Migrate to ML-KEM (Kyber) which was selected as the NIST standard.",
    },
    "FrodoKEM": {
        "base_score": 82, "category": "kex",
        "quantum_safe": True, "resistance": "fully_resistant", "is_pqc": True,
        "reason": "Conservative lattice KEM based on plain LWE (no ring structure). ISO standardised.",
        "migration": "FrodoKEM is a valid conservative choice. ML-KEM is faster and NIST-standard.",
    },
    "BIKE": {
        "base_score": 78, "category": "kex",
        "quantum_safe": True, "resistance": "fully_resistant", "is_pqc": True,
        "reason": "NIST PQC Round 4 candidate. Code-based KEM.",
        "migration": "BIKE is still a candidate. Use ML-KEM for production; BIKE for research/diversity.",
    },
    "HQC": {
        "base_score": 78, "category": "kex",
        "quantum_safe": True, "resistance": "fully_resistant", "is_pqc": True,
        "reason": "NIST PQC Round 4 candidate selected for standardization. Code-based KEM.",
        "migration": "HQC is being standardised. Can be used alongside ML-KEM for algorithm diversity.",
    },
    "XMSS": {
        "base_score": 85, "category": "signature",
        "quantum_safe": True, "resistance": "fully_resistant", "is_pqc": True,
        "reason": "Stateful hash-based signature. RFC 8391. Quantum-safe with minimal assumptions.",
        "migration": "Already PQC. Note: XMSS is STATEFUL — requires careful key management. Use SLH-DSA for stateless needs.",
    },
    "LMS": {
        "base_score": 83, "category": "signature",
        "quantum_safe": True, "resistance": "fully_resistant", "is_pqc": True,
        "reason": "Leighton-Micali hash-based signature. RFC 8554. NIST SP 800-208 approved.",
        "migration": "Already PQC. Note: LMS is STATEFUL — requires careful state management.",
    },
    "Rainbow": {
        "base_score": 0, "category": "signature",
        "quantum_safe": False, "resistance": "deprecated", "is_pqc": True,
        "reason": "BROKEN: Key recovery attack by Ward Beullens (2022). Do not use.",
        "migration": "CRITICAL: Replace Rainbow with ML-DSA (Dilithium) immediately.",
    },
    "SIKE": {
        "base_score": 0, "category": "kex",
        "quantum_safe": False, "resistance": "deprecated", "is_pqc": True,
        "reason": "BROKEN: Full key recovery in hours by Castryck-Decru (2022). Do not use.",
        "migration": "CRITICAL: Replace SIKE with ML-KEM (Kyber) immediately.",
    },
    "McEliece": {
        "base_score": 85, "category": "kex",
        "quantum_safe": True, "resistance": "fully_resistant", "is_pqc": True,
        "reason": "Classic McEliece — oldest unbroken PQC scheme (1978). Extremely large keys but high confidence.",
        "migration": "Already PQC. Large keys make it impractical for many use cases. Consider ML-KEM.",
    },
}


# ═══════════════════════════════════════════════════════════════════════════
# CATEGORY WEIGHTS — how much each category matters for overall repo score
# ═══════════════════════════════════════════════════════════════════════════
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
            if key_size <= 1024: return 0, False, "RSA key ≤1024 bits is classically broken"
            if key_size <= 2048: return 15, False, "RSA-2048 is quantum-vulnerable"
            if key_size <= 3072: return 18, False, "RSA-3072 is quantum-vulnerable"
            return 20, False, "RSA-4096+ is quantum-vulnerable"
    return algo_info["base_score"], algo_info["quantum_safe"], algo_info["reason"]


class RepoScoringEngine:
    """
    Independent scoring engine for repository cryptographic analysis.
    
    Scores are based on quantum readiness of algorithms found in source code.
    Each algorithm gets a fixed score based on its quantum resistance category:
    
    - fully_resistant: PQC algorithms (Kyber, Dilithium, etc.) → 78-96
    - grover_resistant: Symmetric/hash with adequate key sizes → 45-75
    - vulnerable: Classical asymmetric (RSA, ECDH, ECDSA) → 15-38
    - deprecated: Broken algorithms (DES, MD5, SHA-1, RC4) → 0-8
    - construction: MACs/KDFs (safety depends on params) → 48-65
    - mode: Cipher modes (secondary concern) → 5-70
    """

    def __init__(self):
        self.scores_table = REPO_ALGORITHM_SCORES
        self.category_weights = REPO_CATEGORY_WEIGHTS

    def score_algorithms(self, algorithms_dict: Dict) -> Dict:
        """
        Score all algorithms found in a repository scan.
        
        Args:
            algorithms_dict: Dict mapping algorithm name → {
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
            # Unknown algorithm — try fuzzy match
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
            "reason": f"Unknown algorithm '{name}' — review manually",
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
          - Vulnerable cap (RSA/ECDSA in code → can't reach A+)
          - PQC bonus (using NIST PQC standards → extra credit)
        
        This ensures QR% and score always tell the same story.
        """
        total_occ = sum(a["occurrences"] for a in scored_algos.values())
        if total_occ == 0:
            return 0

        qsafe_occ = sum(a["occurrences"] for a in scored_algos.values() if a["quantum_safe"])
        qr_pct = (qsafe_occ / total_occ * 100)

        # Start from QR% — the score IS quantum readiness
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
            # Penalty scales with usage: 3% deprecated → -3, 30% → -15
            base -= min(dep_ratio * 50, 25)

        # Quantum-vulnerable cap: having RSA/ECDSA/DH in active code
        # means you're NOT fully quantum ready — cap the score
        vulnerable_algos = [a for a in scored_algos.values()
                           if a["quantum_resistance_type"] == "vulnerable"]
        if vulnerable_algos:
            vuln_occ = sum(a["occurrences"] for a in vulnerable_algos)
            vuln_ratio = vuln_occ / total_occ
            if vuln_ratio > 0.2:
                base = min(base, 55)   # Heavy vulnerable usage → C+ max
            else:
                base = min(base, 75)   # Some vulnerable usage → B max

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
            risk_reason = "PQC migration in progress — some classical algorithms remain"
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
                    "effort": "High — requires library upgrades and protocol changes",
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
                    "effort": "High — requires library upgrades and certificate changes",
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
                    "hash outputs should be ≥256 bits (SHA-256 provides ~128-bit collision resistance "
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
            "effort": "High — architectural change",
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
                f"Quantum-vulnerable algorithms ({len(vulnerable)}): {', '.join(vulnerable[:5])} — "
                "will be broken by Shor's algorithm"
            )

        for cat_type, cat_data in category_scores.items():
            if cat_data["score"] < 20 and cat_type in ("kex", "signature", "symmetric", "hash"):
                vulns.append(f"Critical weakness in {cat_type}: score {cat_data['score']:.1f}/100")

        # Check for ECB mode
        ecb = scored_algos.get("ECB")
        if ecb and ecb["occurrences"] > 0:
            vulns.append("ECB cipher mode detected — leaks plaintext patterns. Never use for encryption.")

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
            "DSA": "Ed25519 (interim) → ML-DSA (PQC)",
            "Rainbow": "ML-DSA (Dilithium)",
            "SIKE": "ML-KEM (Kyber)",
            "ECB": "GCM or CCM mode",
        }
        return replacements.get(algo_name, "Consult NIST PQC recommendations")

    def _get_nist_ref(self, algo_name: str) -> str:
        """Get NIST reference for algorithm deprecation."""
        refs = {
            "DES": "NIST SP 800-131A Rev 2 (2019)",
            "3DES": "NIST SP 800-131A Rev 2 — deprecated after 2023",
            "RC4": "RFC 7465 — Prohibiting RC4 Cipher Suites",
            "MD5": "NIST SP 800-131A Rev 2",
            "SHA-1": "NIST SP 800-131A Rev 2 — prohibited for digital signatures",
            "DSA": "FIPS 186-5 — DSA dropped for new signatures",
            "Rainbow": "Ward Beullens key recovery attack (2022)",
            "SIKE": "Castryck-Decru attack (2022)",
        }
        return refs.get(algo_name, "NIST PQC Migration Guidance 2024")

    def _estimate_overall_effort(self, steps: List[Dict]) -> str:
        """Estimate overall migration effort."""
        total_occ = sum(s.get("occurrences", 0) for s in steps)
        critical = sum(1 for s in steps if s["priority"] == "CRITICAL")

        if critical > 3 or total_occ > 200:
            return "High — significant codebase changes required"
        if critical > 0 or total_occ > 50:
            return "Medium — focused refactoring needed"
        return "Low — minor adjustments"

    def _empty_result(self) -> Dict:
        """Return empty scoring result — no crypto code found means no quantum risk."""
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
                "risk_reason": "No cryptographic algorithm usage found in code — no quantum migration needed",
                "migration_status": "not_applicable",
                "migration_note": "No direct cryptographic operations found. If the app uses crypto via external services/APIs, those should be assessed separately.",
            },
            "migration_plan": {"steps": [], "total_steps": 0, "critical_count": 0,
                             "high_count": 0, "urgent_count": 0, "estimated_effort": "None"},
            "category_scores": {},
            "algorithm_scores": {},
            "critical_vulnerabilities": [],
        }
# core/algorithms.py

"""
This file contains the core data tables for PQC algorithm analysis.
- PQ_RESISTANCE_TABLE: Base scores for cryptographic algorithms.
- PQC_ALGORITHMS: A set of known Post-Quantum Cryptography algorithms.
- DEPRECATED_ALGORITHMS: A set of known weak or deprecated algorithms.
"""


# NOTE: ALL keys in PQ_RESISTANCE_TABLE are uppercase so that the scorer's
# `name.upper()` exact-match lookup (and fuzzy fallback) work correctly.
PQ_RESISTANCE_TABLE = {
    "kex": {
        # Classic (Vulnerable to Quantum)
        "RSA": 0, "DH": 0, "DH-RSA": 0, "DH-DSS": 0, "ANON-DH": 0,
        "DHE": 5, "ECDH": 5, "ECDHE": 10,

        # Modern Curves — these alone are NOT quantum-safe but score better than plain ECDHE
        "X25519": 15, "X448": 18, "CURVE25519": 15, "CURVE448": 18,

        # NIST Curves (uppercase)
        "SECP224R1": 3, "SECP256R1": 5, "SECP256K1": 4, "SECP384R1": 8,
        "SECP521R1": 10, "PRIME256V1": 5, "P-256": 5, "P-384": 8, "P-521": 10,

        # Brainpool (uppercase)
        "BRAINPOOLP256R1": 6, "BRAINPOOLP384R1": 9, "BRAINPOOLP512R1": 11,

        # FFDHE Groups (uppercase)
        "FFDHE2048": 7, "FFDHE3072": 9, "FFDHE4096": 11,
        "FFDHE6144": 13, "FFDHE8192": 15,

        # Raw DHE parameter sizes — injected by probe_dhe_key_size() when the
        # server uses a non-named DH group (classic Logjam / weak-DH configs).
        # Names are "DHE-{bits}", e.g. "DHE-1024".  The key_size_bonus logic
        # penalises these further via the RSA/DH branch in scorer.py.
        "DHE-512": 0, "DHE-768": 1, "DHE-1024": 2, "DHE-1536": 4,
        "DHE-2048": 7, "DHE-3072": 9, "DHE-4096": 11,

        # -------------------------------------------------------------------
        # PQC Hybrid KEX — IANA-standardised and draft hybrid groups.
        # These are what Chrome/Firefox/Cloudflare actually deploy in prod.
        # -------------------------------------------------------------------
        # ML-KEM / CRYSTALS-Kyber (NIST FIPS 203)
        "X25519MLKEM768": 97,          # IANA 0x11eb — standardised hybrid
        "X25519-MLKEM768": 97,         # hyphenated alias
        "X25519MLKEM1024": 98,
        "X25519KYBER768DRAFT00": 96,   # Pre-standard draft (Cloudflare/Chrome)
        "X25519KYBER512DRAFT00": 93,
        "P256KYBER512DRAFT00": 92,
        "P384KYBER768DRAFT00": 95,
        "SECP256R1MLKEM768": 96,
        "SECP384R1MLKEM1024": 97,
        "SECP256R1KYBER768": 96,       # Scanner output variant
        "SECP256R1-MLKEM768": 96,      # Hyphenated variant

        # Pure PQC Standards (NIST) — uppercase
        "KYBER": 95, "KYBER512": 90, "KYBER768": 95, "KYBER1024": 98,
        "CRYSTALS-KYBER": 95, "ML-KEM": 95, "ML-KEM-512": 90,
        "ML-KEM-768": 95, "ML-KEM-1024": 98, "MLKEM": 95,
        "MLKEM512": 90, "MLKEM768": 95, "MLKEM1024": 98,

        # PQC Candidates (uppercase)
        "BIKE": 85, "BIKE-L1": 83, "BIKE-L3": 87, "BIKE-L5": 89,
        "SIKE": 0, "NTRU": 85, "NTRUPRIME": 87, "SNTRUP": 86,
        "SNTRUP761": 86, "SNTRUP857": 87, "SNTRUP1277": 89,
        "SABER": 88, "LIGHTSABER": 85, "FIRESABER": 90,
        "FRODO": 92, "FRODOKEM": 92, "FRODOKEM-640": 90,
        "FRODOKEM-976": 92, "FRODOKEM-1344": 94,
        "HQC": 88, "CLASSIC-MCELIECE": 93, "MCELIECE": 93,
        "NEWHOPE": 87, "NEWHOPE512": 85, "NEWHOPE1024": 89,
        "NTRU-HRSS": 87, "NTRU-HPS": 88,

        # Classical + PQC Hybrid (uppercase)
        "X25519-KYBER768": 96, "X25519-KYBER512": 93,
        "X448-KYBER768": 97, "X448-KYBER1024": 97,
        "P256-KYBER512": 92, "P384-KYBER768": 95,
        "ECDHE-KYBER": 94, "ECDHE-NTRU": 90,

        # PSK variants
        "PSK": 40, "DHE-PSK": 45, "ECDHE-PSK": 50, "RSA-PSK": 35,
    },

    "signature": {
        # -----------------------------------------------------------------------
        # Baseline scores for purely CLASSICAL algorithms.
        # These are NOT quantum-safe, but they ARE the current industry standard.
        # Scoring them at 0–5 makes every modern server grade F even though their
        # TLS configuration is perfectly fine today.
        #
        # Design philosophy (0–100 PQC-readiness scale):
        #   0   = broken even classically (MD5-signed, DSA-512, etc.)
        #  20   = classical, legacy (RSA-2048 bare)
        #  35   = classical, current best-practice (RSA-PSS, ECDSA-P256)
        #  55   = classical strong (Ed25519, ECDSA-P384)
        #  80+  = PQC-ready hybrid
        # 100   = fully PQC (DILITHIUM, FALCON, etc.)
        # -----------------------------------------------------------------------

        # Pure RSA (vulnerable to Shor; 2048 is current baseline)
        "RSA": 20, "RSA-SHA256": 25, "RSA-SHA384": 28, "RSA-SHA512": 30,
        "RSA-PSS": 35, "RSASSA-PSS": 35,

        # DSA / DSS (obsolete; FIPS deprecated in 2023)
        "DSS": 5, "DSA-1024": 0, "DSA-2048": 8, "DSA-3072": 12,
        "PURE-DSA": 0,

        # ECDSA — current TLS standard, P-256/P-384 widely deployed
        "ECDSA": 35, "ECDSA-SHA256": 38, "ECDSA-SHA384": 42, "ECDSA-SHA512": 45,

        # Modern ECC — stronger classical; Ed25519 is best-practice today
        "EDDSA": 52, "ED25519": 55, "ED448": 60,

        # PQC Standards (NIST) (uppercase)
        "DILITHIUM": 95, "DILITHIUM2": 92, "DILITHIUM3": 95, "DILITHIUM5": 98,
        "ML-DSA": 95, "ML-DSA-44": 92, "ML-DSA-65": 95, "ML-DSA-87": 98,
        "MLDSA": 95, "MLDSA44": 92, "MLDSA65": 95, "MLDSA87": 98,
        "FALCON": 94, "FALCON512": 92, "FALCON1024": 96,
        "SPHINCS": 96, "SPHINCS+": 97,
        "SPHINCS+-128F": 95, "SPHINCS+-192F": 96, "SPHINCS+-256F": 97,
        "SPHINCS+-128S": 96, "SPHINCS+-192S": 97, "SPHINCS+-256S": 98,
        "SLH-DSA": 97, "SLHDSA": 97,

        # Hash-based (uppercase)
        "XMSS": 91, "LMS": 90, "HSS-LMS": 91,

        # PQC Candidates (uppercase)
        "RAINBOW": 0, "PICNIC": 88, "PICNIC3": 89,
        "PICNIC-L1": 87, "PICNIC-L3": 89, "PICNIC-L5": 91,
        "MAYO": 89, "UOV": 84, "GEMSS": 86, "LUOV": 84,

        # International Standards (uppercase)
        "SM2": 55, "GOST-SIGNATURE": 58, "GOST-2012": 60,

        # Hybrid (uppercase)
        "RSA-DILITHIUM": 85, "RSA+DILITHIUM": 85,
        "ECDSA-DILITHIUM": 88, "ECDSA+DILITHIUM": 88,
        "ECDSA-FALCON": 87, "ECDSA+FALCON": 87,
        "RSA-SPHINCS+": 86, "RSA-FALCON": 86,
        "ED25519-DILITHIUM": 90, "ED448-DILITHIUM3": 91,
        "ED448-FALCON1024": 92,
    },

    "symmetric": {
        # AES Family (uppercase)
        "AES-128": 70, "AES-192": 80, "AES-256": 85,
        "AES-128-CBC": 68, "AES-256-CBC": 82,
        "AES-128-GCM": 75, "AES-192-GCM": 82, "AES-256-GCM": 90,
        "AES-128-CCM": 72, "AES-256-CCM": 88,
        "AES-128-OCB": 73, "AES-256-OCB": 89,
        "AES-GCM-SIV": 89, "AES-SIV": 87, "AES-EAX": 86,

        # ChaCha Family (ALL uppercase so .upper() lookup hits exactly)
        "AEGIS-128": 79, "AEGIS-256": 84,
        "CHACHA20": 82, "CHACHA20-POLY1305": 88,
        "XCHACHA20": 83, "XCHACHA20-POLY1305": 88,

        # Salsa (uppercase)
        "SALSA20": 75, "XSALSA20": 76,

        # Other Modern (uppercase)
        "CAMELLIA-128": 60, "CAMELLIA-192": 70, "CAMELLIA-256": 80,
        "ARIA-128": 62, "ARIA-192": 72, "ARIA-256": 82,
        "TWOFISH": 70, "TWOFISH-256": 78,
        "SERPENT": 75, "SERPENT-256": 82,

        # Lightweight (NIST) (uppercase)
        "ASCON-128": 80, "ASCON-128A": 82,
        "GIFT-128": 75, "SPARKLE": 76,
        "GRAIN-128AEAD": 74, "TINYJAMBU": 73,
        "DEOXYS-II": 77,

        # Weak/Deprecated (uppercase)
        "3DES": 20, "DES": 0, "RC4": 0, "RC2": 0,
        "BLOWFISH": 30, "IDEA": 25, "CAST5": 28,
    },

    "hash": {
        # Broken (uppercase)
        "MD5": 0, "MD4": 0, "MD2": 0,

        # Deprecated (uppercase)
        "SHA1": 10, "SHA-1": 10, "RIPEMD-160": 35,

        # SHA-2 (uppercase)
        "SHA224": 50, "SHA-224": 50, "SHA256": 70, "SHA-256": 70,
        "SHA384": 80, "SHA-384": 80, "SHA512": 85, "SHA-512": 85,
        "SHA512/224": 78, "SHA512/256": 80,

        # SHA-3 (uppercase)
        "SHA3-224": 70, "SHA3-256": 72, "SHA3-384": 82, "SHA3-512": 88,
        "SHAKE128": 73, "SHAKE256": 86,
        "KECCAK": 72, "KECCAK-256": 72,

        # BLAKE (uppercase)
        "BLAKE2B": 80, "BLAKE2S": 78, "BLAKE3": 85,
        "BLAKE2B-256": 80, "BLAKE2B-512": 83,
        "BLAKE2BP": 82, "BLAKE2SP": 81,

        # Lightweight (uppercase)
        "ASCON-HASH": 78, "ASCON-HASHA": 79,

        # International (uppercase)
        "WHIRLPOOL": 72, "SM3": 68, "GOST": 60,
        "STREEBOG-256": 65, "STREEBOG-512": 70,
        "LSH-256": 68, "LSH-512": 73, "GOST-HASH": 62,
    },

    # ------------------------------------------------------------------
    # Protocol version scores
    # These directly mirror PROTOCOL_SCORES in scorer.py and are used
    # when protocol versions are submitted as algorithm_type="protocol".
    # TLS 1.0/1.1 are deprecated and intentionally kept at low scores.
    # ------------------------------------------------------------------
    "protocol": {
        "SSL 2.0": 0,
        "SSL 3.0": 0,
        "TLS 1.0": 20,
        "TLS 1.1": 40,
        "TLS 1.2": 75,
        "TLS 1.3": 90,
        "DTLS 1.0": 30,
        "DTLS 1.2": 75,
        "DTLS 1.3": 90,
        "QUIC": 85,
        # Windows-specific protocol markers
        "FIPS-140-2": 85,
        "FIPS-140-3": 90,
        "SCHANNEL": 70,
    },
}

PQC_ALGORITHMS = {
    # Core PQC families (uppercase substrings used for detection)
    "KYBER", "MLKEM", "ML-KEM", "BIKE", "SIKE", "NTRU", "SABER", "FRODO",
    "HQC", "NTRUPRIME", "DILITHIUM", "MLDSA", "ML-DSA", "FALCON",
    "SPHINCS", "SLH-DSA", "SLHDSA", "RAINBOW", "PICNIC", "GEMSS",
    "XMSS", "LMS", "MCELIECE", "CLASSIC-MCELIECE", "CRYSTALS",
    "SNTRUP", "LIGHTSABER", "FIRESABER", "FRODOKEM", "NEWHOPE", "LUOV",
}

# Algorithms that are known to be fully deprecated / broken.
# IMPORTANT: Do NOT add short tokens like "DSA" here — they substring-match
# modern algorithms such as "ECDSA-SHA256" and produce false positives.
# Use the longest unambiguous string instead.
DEPRECATED_ALGORITHMS = {
    "MD5", "MD4", "MD2",
    "SHA1", "SHA-1",
    "DES", "3DES", "RC4", "RC2", "IDEA",
    "SSL 2.0", "SSL 3.0", "TLS 1.0", "TLS 1.1",
    "DSS",           # pure DSS (different from ECDSA)
    "DSA-1024",      # explicitly weak DSA key size
    "PURE-DSA",      # explicit pure-DSA marker
    "ANON-DH",       # anonymous DH — always insecure
    "RAINBOW",       # broken PQC candidate
    "SIKE",          # broken PQC candidate (Castryck-Decru attack)
}

HYBRID_ALGORITHMS = {
    # IANA-registered hybrid ML-KEM groups (standardised 2024)
    "X25519MLKEM768", "X25519-MLKEM768", "X25519MLKEM1024",
    "X25519KYBER768DRAFT00", "X25519KYBER512DRAFT00",
    "P256KYBER512DRAFT00", "P384KYBER768DRAFT00",
    "SECP256R1MLKEM768", "SECP384R1MLKEM1024",
    "SECP256R1KYBER768", "SECP256R1-MLKEM768",  # Scanner output variants
    # Older draft / vendor names
    "X25519-KYBER768", "X25519-KYBER512", "X448-KYBER768", "X448-KYBER1024",
    "P256-KYBER512", "P384-KYBER768", "ECDHE-KYBER", "ECDHE-NTRU",
    # Hybrid signature schemes
    "RSA-DILITHIUM", "RSA+DILITHIUM", "ECDSA-DILITHIUM", "ECDSA+DILITHIUM",
    "ECDSA-FALCON", "ECDSA+FALCON", "RSA-SPHINCS+", "RSA-FALCON",
    "ED25519-DILITHIUM", "ED448-DILITHIUM3", "ED448-FALCON1024",
}

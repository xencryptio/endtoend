# core/algorithms.py

"""
This file contains the core data tables for PQC algorithm analysis.
- PQ_RESISTANCE_TABLE: Base scores for cryptographic algorithms.
- PQC_ALGORITHMS: A set of known Post-Quantum Cryptography algorithms.
- DEPRECATED_ALGORITHMS: A set of known weak or deprecated algorithms.
"""

PQ_RESISTANCE_TABLE = {
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

PQC_ALGORITHMS = {
    "KYBER", "BIKE", "SIKE", "NTRU", "SABER", "FRODO", "HQC", "NTRUPRIME",
    "DILITHIUM", "FALCON", "SPHINCS", "RAINBOW", "PICNIC", "GeMSS",
    "XMSS", "LMS", "MCELIECE", "CLASSIC-MCELIECE", "ML-KEM", "ML-DSA",
    "SLH-DSA", "CRYSTALS", "SNTRUP", "LIGHTSABER", "FIRESABER", "FRODOKEM",
    "NEWHOPE", "LUOV",
}

DEPRECATED_ALGORITHMS = {
    "MD5", "MD4", "MD2", "SHA1", "SHA-1", "DES", "3DES", "RC4", "RC2",
    "SSL 2.0", "SSL 3.0", "TLS 1.0", "TLS 1.1", "DSA", "DSS",
    "ANON-DH", "IDEA", "RAINBOW", "SIKE", "DSA-1024",
}

HYBRID_ALGORITHMS = {
    "X25519-KYBER768", "X25519-KYBER512", "X448-KYBER768", "X448-KYBER1024",
    "P256-KYBER512", "P384-KYBER768", "ECDHE-KYBER", "ECDHE-NTRU",
    "RSA-DILITHIUM", "RSA+DILITHIUM", "ECDSA-DILITHIUM", "ECDSA+DILITHIUM",
    "ECDSA-FALCON", "ECDSA+FALCON", "RSA-SPHINCS+", "RSA-FALCON",
    "Ed25519-DILITHIUM", "Ed448-DILITHIUM3", "Ed448-FALCON1024",
}

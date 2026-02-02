import re
from typing import Dict, Optional

def parse_cipher_suite(cipher_name: str) -> Dict[str, Optional[str]]:
    """
    Parse a cipher suite name into its cryptographic components.
    Supports both TLS 1.2 and TLS 1.3 naming conventions.
    
    Returns:
        dict with keys: kex, auth, symmetric, hash
    """
    # TLS 1.3 ciphers (format: TLS_SYMMETRIC_HASH)
    if cipher_name.startswith("TLS_"):
        return parse_tls13_cipher(cipher_name)
    
    # TLS 1.2 and earlier (format: KEX-AUTH-WITH-SYMMETRIC-HASH)
    return parse_tls12_cipher(cipher_name)

def parse_tls13_cipher(cipher_name: str) -> dict:
    """
    Parse TLS 1.3 cipher suite.
    Example: TLS_AES_128_GCM_SHA256
    
    TLS 1.3 uses implicit ECDHE for key exchange and 
    auth is determined by certificate type.
    """
    parts = cipher_name.split("_")
    
    result = {
        "kex": "ECDHE",  # TLS 1.3 always uses ECDHE
        "auth": None,     # Determined by certificate
        "symmetric": None,
        "hash": None
    }
    
    # Extract symmetric algorithm and mode
    # TLS_AES_128_GCM_SHA256 -> AES_128_GCM
    if "AES" in cipher_name:
        if "128" in cipher_name:
            if "GCM" in cipher_name:
                result["symmetric"] = "AES-128-GCM"
            elif "CCM" in cipher_name:
                result["symmetric"] = "AES-128-CCM"
        elif "256" in cipher_name:
            if "GCM" in cipher_name:
                result["symmetric"] = "AES-256-GCM"
            elif "CCM" in cipher_name:
                result["symmetric"] = "AES-256-CCM"
    elif "CHACHA20" in cipher_name:
        result["symmetric"] = "CHACHA20-POLY1305"
    
    # Extract hash
    if "SHA256" in cipher_name:
        result["hash"] = "SHA256"
    elif "SHA384" in cipher_name:
        result["hash"] = "SHA384"
    
    return result

def parse_tls12_cipher(cipher_name: str) -> dict:
    """
    Parse TLS 1.2 cipher suite.
    Examples:
        ECDHE-RSA-AES128-GCM-SHA256
        DHE-RSA-AES256-SHA384
        AES128-SHA256 (no KEX means RSA key exchange)
    """
    result = {
        "kex": None,
        "auth": None,
        "symmetric": None,
        "hash": None
    }
    
    parts = cipher_name.split("-")
    
    # Determine key exchange
    if cipher_name.startswith("ECDHE"):
        result["kex"] = "ECDHE"
        parts = parts[1:]  # Remove ECDHE
    elif cipher_name.startswith("DHE"):
        result["kex"] = "DHE"
        parts = parts[1:]  # Remove DHE
    elif cipher_name.startswith("ECDH"):
        result["kex"] = "ECDH"
        parts = parts[1:]
    else:
        result["kex"] = "RSA"  # Static RSA key exchange
    
    # Determine authentication
    if parts and parts[0] in ["RSA", "ECDSA", "DSS"]:
        result["auth"] = parts[0]
        parts = parts[1:]
    elif result["kex"] == "RSA":
        result["auth"] = "RSA"
    
    # Parse symmetric algorithm
    symmetric_str = "-".join(parts)
    
    # AES variants
    if "AES128" in symmetric_str or "AES-128" in symmetric_str:
        if "GCM" in symmetric_str:
            result["symmetric"] = "AES-128-GCM"
        elif "CBC" in symmetric_str:
            result["symmetric"] = "AES-128-CBC"
        elif "CCM" in symmetric_str:
            result["symmetric"] = "AES-128-CCM"
        else:
            result["symmetric"] = "AES-128-CBC"  # Default mode
    elif "AES256" in symmetric_str or "AES-256" in symmetric_str:
        if "GCM" in symmetric_str:
            result["symmetric"] = "AES-256-GCM"
        elif "CBC" in symmetric_str:
            result["symmetric"] = "AES-256-CBC"
        elif "CCM" in symmetric_str:
            result["symmetric"] = "AES-256-CCM"
        else:
            result["symmetric"] = "AES-256-CBC"
    elif "CHACHA20" in symmetric_str:
        result["symmetric"] = "CHACHA20-POLY1305"
    elif "3DES" in symmetric_str:
        result["symmetric"] = "3DES-CBC"
    
    # Extract hash
    if "SHA384" in symmetric_str:
        result["hash"] = "SHA384"
    elif "SHA256" in symmetric_str:
        result["hash"] = "SHA256"
    elif "SHA" in symmetric_str:
        result["hash"] = "SHA1"
    
    return result

def get_cipher_strength(cipher_data: dict) -> dict:
    """
    Determine strength characteristics of a cipher suite.
    """
    strength = {
        "kex_strength": None,
        "symmetric_strength": None,
        "hash_strength": None
    }
    
    # Key exchange strength
    kex = cipher_data.get("kex", "")
    if kex == "ECDHE":
        strength["kex_strength"] = "strong"
    elif kex == "DHE":
        strength["kex_strength"] = "strong"
    elif kex == "RSA":
        strength["kex_strength"] = "weak"  # No forward secrecy
    
    # Symmetric encryption strength
    symmetric = cipher_data.get("symmetric", "")
    if "AES-256-GCM" in symmetric or "CHACHA20" in symmetric:
        strength["symmetric_strength"] = "strong"
    elif "AES-128-GCM" in symmetric:
        strength["symmetric_strength"] = "strong"
    elif "AES" in symmetric and "CBC" in symmetric:
        strength["symmetric_strength"] = "medium"
    elif "3DES" in symmetric:
        strength["symmetric_strength"] = "weak"
    
    # Hash strength
    hash_alg = cipher_data.get("hash", "")
    if hash_alg == "SHA384":
        strength["hash_strength"] = "strong"
    elif hash_alg == "SHA256":
        strength["hash_strength"] = "strong"
    elif hash_alg == "SHA1":
        strength["hash_strength"] = "weak"
    
    return strength

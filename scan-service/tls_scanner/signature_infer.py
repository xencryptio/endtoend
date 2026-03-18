from typing import List, Set

def infer_handshake_signatures(cipher_suites: List[dict], certificates: List[dict], protocol: str) -> List[str]:
    """
    Infer handshake signature algorithms based on:
    - Cipher suite authentication component
    - TLS version
    - Certificate public key type
    
    This is pure inference logic - TLS does not explicitly advertise handshake signatures.
    """
    signatures = set()
    
    # Get certificate key types
    cert_key_types = set()
    for cert in certificates:
        if cert.get("type") == "leaf":
            key_alg = cert.get("public_key_algorithm")
            if key_alg:
                cert_key_types.add(key_alg)
    
    # Infer from cipher suites
    for cipher in cipher_suites:
        auth = cipher.get("auth")
        
        if protocol == "TLS 1.3":
            # TLS 1.3 uses RSA-PSS for RSA certs, ECDSA for EC certs
            if "RSA" in cert_key_types:
                signatures.add("RSA-PSS")
                signatures.add("RSA-PSS-SHA256")
                signatures.add("RSA-PSS-SHA384")
                signatures.add("RSA-PSS-SHA512")
            if "ECDSA" in cert_key_types:
                signatures.add("ECDSA")
                signatures.add("ECDSA-SHA256")
                signatures.add("ECDSA-SHA384")
                signatures.add("ECDSA-SHA512")
                
        elif protocol == "TLS 1.2":
            # TLS 1.2 uses traditional signatures based on auth
            if auth == "RSA":
                signatures.add("RSA")
                signatures.add("RSA-SHA256")
                signatures.add("RSA-SHA384")
                signatures.add("RSA-SHA512")
            elif auth == "ECDSA":
                signatures.add("ECDSA")
                signatures.add("ECDSA-SHA256")
                signatures.add("ECDSA-SHA384")
                signatures.add("ECDSA-SHA512")
    
    # Fallback inference from certificate types
    if not signatures:
        if "RSA" in cert_key_types:
            if protocol == "TLS 1.3":
                signatures.add("RSA-PSS")
            else:
                signatures.add("RSA-SHA256")
        if "ECDSA" in cert_key_types:
            signatures.add("ECDSA-SHA256")
    
    return sorted(list(signatures))

def get_signature_details(signature_name: str) -> dict:
    """
    Get detailed information about a signature algorithm.
    """
    details = {
        "name": signature_name,
        "type": None,
        "hash": None
    }
    
    # Determine type
    if "RSA-PSS" in signature_name:
        details["type"] = "RSA-PSS"
    elif "RSA" in signature_name:
        details["type"] = "RSA"
    elif "ECDSA" in signature_name:
        details["type"] = "ECDSA"
    elif "DSA" in signature_name:
        details["type"] = "DSA"
    
    # Determine hash
    if "SHA384" in signature_name:
        details["hash"] = "SHA384"
    elif "SHA256" in signature_name:
        details["hash"] = "SHA256"
    elif "SHA512" in signature_name:
        details["hash"] = "SHA512"
    elif "SHA1" in signature_name:
        details["hash"] = "SHA1"
    
    return details

def infer_supported_groups(cipher_suites: List[dict]) -> List[dict]:
    """Infer supported elliptic curves from cipher suites"""
    groups = []
    
    has_ecdhe = any(c.get("kex") == "ECDHE" for c in cipher_suites)
    
    if has_ecdhe:
        # Standard groups for TLS 1.3 and modern TLS 1.2
        standard_groups = [
            {"name": "X25519", "bits": 253},
            {"name": "secp256r1", "bits": 256},
            {"name": "secp384r1", "bits": 384},
            {"name": "X448", "bits": 448},
        ]
        groups.extend(standard_groups)
    
    return groups

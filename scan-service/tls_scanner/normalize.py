from typing import List, Dict
from .cipher_parser import parse_cipher_suite
from .certs import parse_certificate_chain, group_certificates_by_type
from .signature_infer import infer_handshake_signatures, infer_supported_groups, get_signature_details

def normalize_endpoint_data(raw_data: dict, ip: str, port: int) -> dict:
    """
    Normalize raw TLS data into scoring-ready structure.
    This is the final transformation layer.
    """
    # Parse certificates
    cert_chain = raw_data.get("certificates", [])
    parsed_certs = parse_certificate_chain(cert_chain) if cert_chain else []
    
    # Group certificates by type
    grouped_certs = group_certificates_by_type(parsed_certs)
    
    # Parse cipher suites
    raw_ciphers = raw_data.get("cipher_suites", [])
    parsed_ciphers = []
    
    for cipher_data in raw_ciphers:
        cipher_name = cipher_data.get("name")
        protocol = cipher_data.get("protocol", "")
        
        if cipher_name:
            parsed = parse_cipher_suite(cipher_name)
            parsed["name"] = cipher_name
            parsed["protocol"] = protocol
            parsed_ciphers.append(parsed)
    
    # Separate by protocol
    tls12_ciphers = [c for c in parsed_ciphers if c.get("protocol") == "TLS 1.2"]
    tls13_ciphers = [c for c in parsed_ciphers if c.get("protocol") == "TLS 1.3"]
    
    # Build TLS configuration
    tls_config = {
        "tls_1_2_cipher_suites": format_cipher_suites(tls12_ciphers),
        "tls_1_3_cipher_suites": format_cipher_suites(tls13_ciphers)
    }
    
    # Infer supported curves/groups
    supported_curves = infer_supported_groups(parsed_ciphers)

    # THEN merge with subprocess results:
    subprocess_curves = raw_data.get("named_groups", [])
    for curve_name in subprocess_curves:
        if not any(c["name"] == curve_name for c in supported_curves):
            # Map curve name to bits
            bits = {"X25519": 253, "secp256r1": 256, "secp384r1": 384, "X448": 448}.get(curve_name, 0)
            supported_curves.append({"name": curve_name, "bits": bits})
    
    # Build certificate structure
    certificates = {
        "leaf_certificates": format_certificates(grouped_certs["leaf"]),
        "intermediate_certificates": format_certificates(grouped_certs["intermediate"]),
        "root_certificates": format_certificates(grouped_certs["root"])
    }
    
    # Extract certificate signatures
    cert_signatures = extract_certificate_signatures(parsed_certs)
    
    # Infer handshake signatures for each protocol
    handshake_sigs = []
    protocols = raw_data.get("protocols", [])
    
    for protocol in protocols:
        protocol_ciphers = tls12_ciphers if protocol == "TLS 1.2" else tls13_ciphers
        sigs = infer_handshake_signatures(protocol_ciphers, parsed_certs, protocol)
        
        for sig in sigs:
            sig_detail = get_signature_details(sig)
            sig_detail["context"] = f"{protocol} handshake"
            handshake_sigs.append(sig_detail)
    
    # Build signature algorithms structure
    signature_algorithms = {
        "certificate_signatures": cert_signatures,
        "handshake_signatures": handshake_sigs
    }
    
    # Build final endpoint result
    return {
        "ip": ip,
        "port": port,
        "protocols": protocols,
        "tls_configuration": tls_config,
        "supported_elliptic_curves": supported_curves,
        "certificates": certificates,
        "signature_algorithms": signature_algorithms
    }

def merge_with_application_data(normalized: dict, app_data: dict) -> dict:
    """Merge TLS crypto data with application layer data"""
    
    # ADD transport section
    normalized["transport"] = {
        "alpn": app_data.get("alpn"),
        "ocsp_stapling": app_data.get("ocsp_stapling", False)
    }
    
    # ADD http section
    normalized["http"] = {
        "headers": app_data.get("http_headers", {})
    }
    
    # ADD scan metadata
    normalized["scan_metadata"] = {
        "confidence": "high" if normalized.get("protocols") else "low",
        "has_crypto_data": bool(normalized.get("tls_configuration")),
        "has_app_data": bool(app_data.get("alpn") or app_data.get("http_headers"))
    }
    
    return normalized


def format_cipher_suites(ciphers: List[dict]) -> List[dict]:
    """
    Format cipher suites for output.
    """
    formatted = []
    
    for cipher in ciphers:
        formatted.append({
            "name": cipher.get("name"),
            "key_exchange": cipher.get("kex"),
            "authentication": cipher.get("auth"),
            "symmetric_encryption": cipher.get("symmetric"),
            "hash": cipher.get("hash"),
            "curve": cipher.get("curve"),
            "curve_bits": cipher.get("curve_bits")
        })
    
    return formatted

def format_certificates(certs: List[dict]) -> List[dict]:
    """
    Format certificates for output.
    """
    formatted = []
    
    for cert in certs:
        formatted.append({
            "signature_algorithm": cert.get("signature_algorithm"),
            "signature_hash": cert.get("signature_hash"),
            "public_key_algorithm": cert.get("public_key_algorithm"),
            "public_key_size": cert.get("public_key_size"),
            "public_key_curve": cert.get("public_key_curve"),
            "ct_scts": cert.get("ct_scts", [])  # ADD THIS
        })
    
    return formatted

def extract_certificate_signatures(certs: List[dict]) -> List[dict]:
    """
    Extract signature algorithms from certificates.
    """
    signatures = []
    
    for cert in certs:
        sig_alg = cert.get("signature_algorithm")
        sig_hash = cert.get("signature_hash")
        
        if sig_alg:
            signatures.append({
                "algorithm": sig_alg,
                "hash": sig_hash,
                "context": f"{cert.get('type', 'unknown')} certificate"
            })
    
    return signatures

def extract_algorithms_for_scoring(endpoint_data: dict) -> List[dict]:
    """
    Extract individual algorithms in scoring-ready format.
    This produces a flat list of algorithm objects for the scoring engine.
    """
    algorithms = []
    
    # Extract from cipher suites
    tls_config = endpoint_data.get("tls_configuration", {})
    
    for cipher in tls_config.get("tls_1_2_cipher_suites", []):
        # Key exchange algorithm
        if cipher.get("key_exchange"):
            algorithms.append({
                "name": cipher.get("key_exchange"),
                "type": "key_exchange",
                "protocol_context": "TLS 1.2",
                "curve": cipher.get("curve"),
                "bits": cipher.get("curve_bits")
            })
        
        # Symmetric encryption
        if cipher.get("symmetric_encryption"):
            algorithms.append({
                "name": cipher.get("symmetric_encryption"),
                "type": "symmetric",
                "protocol_context": "TLS 1.2"
            })
    
    for cipher in tls_config.get("tls_1_3_cipher_suites", []):
        # Symmetric encryption
        if cipher.get("symmetric_encryption"):
            algorithms.append({
                "name": cipher.get("symmetric_encryption"),
                "type": "symmetric",
                "protocol_context": "TLS 1.3"
            })
    
    # Extract from signatures
    for sig in endpoint_data.get("signature_algorithms", {}).get("certificate_signatures", []):
        algorithms.append({
            "name": sig.get("algorithm"),
            "type": "signature",
            "hash": sig.get("hash"),
            "context": sig.get("context")
        })
    
    return algorithms

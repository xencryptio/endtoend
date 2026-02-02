"""
Adapter to convert tls-scanner output to crypto_audit format.
Bridges Document 2 scanner with Document 1 API.
"""

from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)


def transform_internal_scan_to_ssllabs_format(scan_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transform tls-scanner output to match SSL Labs structure.
    This allows reuse of existing transform_scan_result() logic.
    
    Input: Document 2 scanner output
    Output: SSL Labs-like structure
    """
    
    domain = scan_result.get("domain", "")
    endpoints = scan_result.get("endpoints", [])
    
    if not endpoints:
        logger.warning(f"No endpoints found for {domain}")
        return create_empty_result(domain)
    
    # Use first endpoint (most scans have 1 endpoint)
    endpoint = endpoints[0]
    
    # Build SSL Labs-compatible structure
    result = {
        "host": domain,
        "port": endpoint.get("port", 443),
        "endpoints": [
            {
                "ipAddress": endpoint.get("ip", ""),
                "details": build_endpoint_details(endpoint)
            }
        ],
        "certs": build_certificates(endpoint)
    }
    
    return result


def build_endpoint_details(endpoint: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build the 'details' section that mimics SSL Labs endpoint details.
    """
    tls_config = endpoint.get("tls_configuration", {})
    protocols = endpoint.get("protocols", [])
    
    # Convert protocol names to SSL Labs format
    protocol_list = []
    for proto in protocols:
        if "TLS 1.3" in proto:
            protocol_list.append({"version": "1.3", "name": "TLS"})
        elif "TLS 1.2" in proto:
            protocol_list.append({"version": "1.2", "name": "TLS"})
    
    # Build cipher suites in SSL Labs format
    suites = build_cipher_suites(tls_config, endpoint)
    
    # Build named groups (elliptic curves)
    named_groups = build_named_groups(endpoint)
    
    return {
        "protocols": protocol_list,
        "suites": suites,
        "namedGroups": named_groups
    }


def build_cipher_suites(tls_config: Dict[str, Any], endpoint: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Convert cipher suites to SSL Labs format.
    """
    suites = []
    
    # TLS 1.2 suites
    tls12_suites = tls_config.get("tls_1_2_cipher_suites", [])
    if tls12_suites:
        suite_list = []
        for cipher in tls12_suites:
            suite_list.append({
                "name": cipher.get("name", ""),
                "kxType": cipher.get("key_exchange"),
                "namedGroupName": cipher.get("curve"),
                "namedGroupBits": cipher.get("curve_bits")
            })
        
        suites.append({
            "protocol": 771,  # TLS 1.2 protocol ID
            "list": suite_list,
            "preference": True  # Assume server preference for now
        })
    
    # TLS 1.3 suites
    tls13_suites = tls_config.get("tls_1_3_cipher_suites", [])
    if tls13_suites:
        suite_list = []
        for cipher in tls13_suites:
            suite_list.append({
                "name": cipher.get("name", ""),
                "namedGroupName": cipher.get("key_exchange"),
                "namedGroupBits": cipher.get("curve_bits", 0)
            })
        
        suites.append({
            "protocol": 772,  # TLS 1.3 protocol ID
            "list": suite_list,
            "preference": True
        })
    
    return suites


def build_named_groups(endpoint: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert elliptic curves to SSL Labs namedGroups format.
    """
    curves = endpoint.get("supported_elliptic_curves", [])
    
    if not curves:
        return {"list": [], "preference": False}
    
    group_list = []
    for curve in curves:
        group_list.append({
            "name": curve.get("name", ""),
            "bits": curve.get("bits", 0),
            "namedGroupType": "EC"  # Assume EC for now
        })
    
    return {
        "list": group_list,
        "preference": True  # Assume server preference
    }


def build_certificates(endpoint: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Convert certificates to SSL Labs format.
    """
    certs = []
    cert_data = endpoint.get("certificates", {})
    
    # Leaf certificate
    leaf_certs = cert_data.get("leaf_certificates", [])
    for leaf in leaf_certs:
        certs.append({
            "subject": "CN=Unknown",  # Scanner doesn't extract this
            "commonNames": ["Unknown"],
            "altNames": [],
            "sigAlg": leaf.get("signature_algorithm", ""),
            "keyAlg": leaf.get("public_key_algorithm", ""),
            "keySize": leaf.get("public_key_size", 0),
            "sct": bool(leaf.get("ct_scts"))  # Certificate Transparency
        })
    
    # Intermediate certificates
    intermediate_certs = cert_data.get("intermediate_certificates", [])
    for cert in intermediate_certs:
        certs.append({
            "subject": "CN=Intermediate",
            "issuerSubject": "CN=Root",  # Simplified
            "sigAlg": cert.get("signature_algorithm", ""),
            "keyAlg": cert.get("public_key_algorithm", ""),
            "keySize": cert.get("public_key_size", 0)
        })
    
    # Root certificates
    root_certs = cert_data.get("root_certificates", [])
    for cert in root_certs:
        certs.append({
            "subject": "CN=Root",
            "issuerSubject": "CN=Root",  # Self-signed
            "sigAlg": cert.get("signature_algorithm", ""),
            "keyAlg": cert.get("public_key_algorithm", ""),
            "keySize": cert.get("public_key_size", 0)
        })
    
    return certs


def create_empty_result(domain: str) -> Dict[str, Any]:
    """
    Create empty result structure when scan fails.
    Matches SSL Labs empty response format.
    """
    return {
        "host": domain,
        "port": 443,
        "endpoints": [],
        "certs": []
    }


def extract_additional_metadata(endpoint: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract metadata that doesn't fit SSL Labs structure.
    Add this to scan_metadata in final result.
    """
    transport = endpoint.get("transport", {})
    http_data = endpoint.get("http", {})
    
    return {
        "alpn": transport.get("alpn"),
        "ocsp_stapling": transport.get("ocsp_stapling", False),
        "http_headers": http_data.get("headers", {}),
        "scanner_source": "internal_tls_scanner",
        "scan_confidence": endpoint.get("scan_metadata", {}).get("confidence", "unknown")
    }
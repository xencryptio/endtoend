"""
Extract normalized fields from raw scan response
This utility extracts structured data from the raw JSON response
"""
from typing import Dict, Any, Optional
from datetime import datetime


def extract_pqc_fields(raw_response: Dict[str, Any]) -> Dict[str, Any]:
    """Extract PQC/Quantum fields from raw response."""
    pqc_analysis = raw_response.get("pqc_analysis", {})

    # 🔧 FIX: Try multiple sources for scores
    # Priority: pqc_analysis > top-level quantum_* fields
    overall_score = None
    overall_grade = None

    # First try: pqc_analysis
    if pqc_analysis and isinstance(pqc_analysis, dict):
        overall_score = pqc_analysis.get("overall_score")
        overall_grade = pqc_analysis.get("overall_grade")

    # Fallback: top-level quantum fields
    if overall_score is None:
        overall_score = raw_response.get("quantum_score")
    if overall_grade is None:
        overall_grade = raw_response.get("quantum_grade")

    return {
        "pqc_overall_score": overall_score,
        "pqc_overall_grade": overall_grade,
        "pqc_security_level": pqc_analysis.get("security_level") if pqc_analysis else None,
        "pqc_quantum_ready": pqc_analysis.get("quantum_ready", False) if pqc_analysis else False,
        "pqc_hybrid_ready": pqc_analysis.get("hybrid_ready", False) if pqc_analysis else False,
    }


def extract_tls_fields(raw_response: Dict[str, Any]) -> Dict[str, Any]:
    """Extract TLS configuration fields from raw response."""
    tls_config = raw_response.get("tls_configuration", {})
    
    supported_protocols = tls_config.get("supported_protocols", [])
    protocols_str = ",".join(supported_protocols) if supported_protocols else None
    
    return {
        "tls_version": ", ".join(supported_protocols) if supported_protocols else None,
        "supported_protocols": protocols_str,
    }


def extract_kex_fields(raw_response: Dict[str, Any]) -> Dict[str, Any]:
    """Extract Key Exchange fields from raw response."""
    tls_config = raw_response.get("tls_configuration", {})
    
    kex_score = None
    kex_grade = None
    
    # Try TLS 1.2
    tls12_suites = tls_config.get("tls_1.2_cipher_suites", {})
    if isinstance(tls12_suites, dict):
        kex_score = tls12_suites.get("component_kex_score")
        kex_grade = tls12_suites.get("component_kex_grade")
    
    # Fallback to TLS 1.3
    if not kex_score:
        tls13_suites = tls_config.get("tls_1.3_cipher_suites", {})
        if isinstance(tls13_suites, dict):
            kex_score = tls13_suites.get("component_kex_score")
            kex_grade = tls13_suites.get("component_kex_grade")
    
    return {
        "kex_score": kex_score,
        "kex_grade": kex_grade,
    }


def extract_cipher_fields(raw_response: Dict[str, Any]) -> Dict[str, Any]:
    """Extract primary cipher suite from raw response."""
    tls_config = raw_response.get("tls_configuration", {})
    
    primary_cipher = None
    
    # Try TLS 1.3 first (preferred)
    tls13_suites = tls_config.get("tls_1.3_cipher_suites", {})
    if isinstance(tls13_suites, dict):
        suites = tls13_suites.get("suites", [])
        if suites and len(suites) > 0:
            primary_cipher = suites[0].get("name")
    
    # Fallback to TLS 1.2
    if not primary_cipher:
        tls12_suites = tls_config.get("tls_1.2_cipher_suites", {})
        if isinstance(tls12_suites, dict):
            suites = tls12_suites.get("suites", [])
            if suites and len(suites) > 0:
                primary_cipher = suites[0].get("name")
    
    return {
        "primary_cipher_suite": primary_cipher,
    }


def extract_certificate_fields(raw_response: Dict[str, Any]) -> Dict[str, Any]:
    """Extract certificate fields from raw response."""
    cert_chain = raw_response.get("certificate_chain", {})
    leaf_cert = cert_chain.get("leaf_certificate", {})
    
    return {
        "cert_pqc_score": leaf_cert.get("cert_pqc_score"),
        "cert_pqc_grade": leaf_cert.get("cert_pqc_grade"),
        "cert_is_pqc": leaf_cert.get("cert_is_pqc", False),
        "cert_transparency": leaf_cert.get("certificate_transparency", False),
    }


def extract_signature_fields(raw_response: Dict[str, Any]) -> Dict[str, Any]:
    """Extract signature algorithm fields from raw response."""
    sig_algorithms = raw_response.get("signature_algorithms", {})
    cert_sigs = sig_algorithms.get("certificate_signatures", [])
    
    primary_sig_algo = None
    primary_hash_algo = None
    
    if cert_sigs and len(cert_sigs) > 0:
        primary_sig_algo = cert_sigs[0].get("signature_algorithm")
        primary_hash_algo = cert_sigs[0].get("hash_algorithm")
    
    return {
        "primary_signature_algorithm": primary_sig_algo,
        "primary_hash_algorithm": primary_hash_algo,
    }


def extract_security_features(raw_response: Dict[str, Any]) -> Dict[str, Any]:
    """Extract security feature flags from raw response."""
    tls_config = raw_response.get("tls_configuration", {})
    
    # Determine if ephemeral key exchange is supported
    ephemeral_supported = False
    tls12_suites = tls_config.get("tls_1.2_cipher_suites", {})
    if isinstance(tls12_suites, dict):
        for suite in tls12_suites.get("suites", []):
            if "ECDHE" in suite.get("key_exchange", ""):
                ephemeral_supported = True
                break
    
    return {
        "ephemeral_key_exchange": ephemeral_supported,
        "ct_present": raw_response.get("ct_present", False),
    }


def extract_all_normalized_fields(raw_response: Dict[str, Any]) -> Dict[str, Any]:
    """Extract ALL normalized fields from raw response."""
    
    fields = {}
    
    # Extract each category
    fields.update(extract_pqc_fields(raw_response))
    fields.update(extract_tls_fields(raw_response))
    fields.update(extract_kex_fields(raw_response))
    fields.update(extract_cipher_fields(raw_response))
    fields.update(extract_certificate_fields(raw_response))
    fields.update(extract_signature_fields(raw_response))
    fields.update(extract_security_features(raw_response))
    
    return fields
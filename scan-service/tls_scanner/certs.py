from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.x509.oid import SignatureAlgorithmOID, NameOID
from typing import List, Dict, Optional

def parse_certificate_chain(cert_chain: List[bytes]) -> List[dict]:
    """
    Parse a certificate chain and extract cryptographic properties.
    Returns list of certificate data dictionaries.
    """
    parsed_certs = []
    
    for i, cert_bytes in enumerate(cert_chain):
        try:
            cert = x509.load_der_x509_certificate(cert_bytes, default_backend())
            cert_data = extract_cert_crypto(cert, i, len(cert_chain))
            parsed_certs.append(cert_data)
        except Exception:
            continue
    
    return parsed_certs

def extract_cert_crypto(cert: x509.Certificate, index: int, total: int) -> dict:
    """
    Extract cryptographic information from a certificate.
    NO trust validation, NO expiry checks - only crypto facts.
    
    ✅ NOW INCLUDES: Subject, Issuer, Valid From, Valid Until
    """
    # Determine certificate type
    cert_type = determine_cert_type(index, total)
    
    # Extract signature algorithm
    sig_alg = get_signature_algorithm(cert)
    sig_hash = get_signature_hash(cert)
    
    # Extract public key info
    pub_key_alg = get_public_key_algorithm(cert)
    pub_key_size = get_public_key_size(cert)
    pub_key_curve = get_public_key_curve(cert)
    
    # ✅ NEW: Extract Subject (Common Name)
    subject_cn = extract_common_name(cert.subject)
    
    # ✅ NEW: Extract Issuer (Common Name)
    issuer_cn = extract_common_name(cert.issuer)
    
    # ✅ NEW: Extract validity dates
    valid_from = cert.not_valid_before.isoformat()
    valid_until = cert.not_valid_after.isoformat()
    
    # Extract CT SCTs
    try:
        sct_extension = cert.extensions.get_extension_for_oid(
            x509.ObjectIdentifier("1.3.6.1.4.1.11129.2.4.2")
        )
        scts_value = sct_extension.value
        
        # Parse SCT list (it's binary data, not a list of objects)
        # For now, just mark as present
        scts = [{"present": True}] if scts_value else []
        
    except x509.ExtensionNotFound:
        scts = []
    except Exception:
        scts = []
    
    return {
        "type": cert_type,
        "signature_algorithm": sig_alg,
        "signature_hash": sig_hash,
        "public_key_algorithm": pub_key_alg,
        "public_key_size": pub_key_size,
        "public_key_curve": pub_key_curve,
        "ct_scts": scts,
        
        # ✅ NEW FIELDS ADDED HERE
        "subject": subject_cn,
        "issuer": issuer_cn,
        "valid_from": valid_from,
        "valid_until": valid_until
    }

def extract_common_name(name: x509.Name) -> str:
    """
    ✅ NEW FUNCTION: Extract Common Name (CN) from x509.Name object.
    Handles cases where CN might not exist.
    
    Args:
        name: x509.Name object (either subject or issuer)
    
    Returns:
        Common Name string or "Unknown" if not found
    """
    try:
        # Get all CN attributes
        cn_attrs = name.get_attributes_for_oid(NameOID.COMMON_NAME)
        
        if cn_attrs:
            # Return the first CN value
            return cn_attrs[0].value
        else:
            # Fallback: try to construct from other fields
            org_attrs = name.get_attributes_for_oid(NameOID.ORGANIZATION_NAME)
            if org_attrs:
                return f"{org_attrs[0].value} (No CN)"
            
            return "Unknown"
    
    except Exception as e:
        return f"Error extracting CN: {str(e)}"

def determine_cert_type(index: int, total: int) -> str:
    """
    Determine if certificate is leaf, intermediate, or root.
    """
    if index == 0:
        return "leaf"
    elif index == total - 1:
        return "root"
    else:
        return "intermediate"

def get_signature_algorithm(cert: x509.Certificate) -> str:
    """
    Extract the signature algorithm OID and convert to readable name.
    """
    sig_oid = cert.signature_algorithm_oid
    
    # Map common OIDs to names
    oid_map = {
        SignatureAlgorithmOID.RSA_WITH_SHA256: "RSA-SHA256",
        SignatureAlgorithmOID.RSA_WITH_SHA384: "RSA-SHA384",
        SignatureAlgorithmOID.RSA_WITH_SHA512: "RSA-SHA512",
        SignatureAlgorithmOID.RSA_WITH_SHA1: "RSA-SHA1",
        SignatureAlgorithmOID.ECDSA_WITH_SHA256: "ECDSA-SHA256",
        SignatureAlgorithmOID.ECDSA_WITH_SHA384: "ECDSA-SHA384",
        SignatureAlgorithmOID.ECDSA_WITH_SHA512: "ECDSA-SHA512",
        SignatureAlgorithmOID.RSASSA_PSS: "RSA-PSS",
    }
    
    return oid_map.get(sig_oid, sig_oid.dotted_string)

def get_signature_hash(cert: x509.Certificate) -> Optional[str]:
    """
    Extract the hash algorithm used in the signature.
    """
    try:
        sig_alg = cert.signature_algorithm_oid
        
        # Parse from OID
        if "SHA256" in str(sig_alg) or "sha256" in sig_alg.dotted_string:
            return "SHA256"
        elif "SHA384" in str(sig_alg) or "sha384" in sig_alg.dotted_string:
            return "SHA384"
        elif "SHA512" in str(sig_alg) or "sha512" in sig_alg.dotted_string:
            return "SHA512"
        elif "SHA1" in str(sig_alg) or "sha1" in sig_alg.dotted_string:
            return "SHA1"
        
        return None
    except Exception:
        return None

def get_public_key_algorithm(cert: x509.Certificate) -> str:
    """
    Determine the public key algorithm type.
    """
    pub_key = cert.public_key()
    
    from cryptography.hazmat.primitives.asymmetric import rsa, ec, dsa, ed25519, ed448
    
    if isinstance(pub_key, rsa.RSAPublicKey):
        return "RSA"
    elif isinstance(pub_key, ec.EllipticCurvePublicKey):
        return "ECDSA"
    elif isinstance(pub_key, dsa.DSAPublicKey):
        return "DSA"
    elif isinstance(pub_key, ed25519.Ed25519PublicKey):
        return "Ed25519"
    elif isinstance(pub_key, ed448.Ed448PublicKey):
        return "Ed448"
    else:
        return "Unknown"

def get_public_key_size(cert: x509.Certificate) -> Optional[int]:
    """
    Get the public key size in bits.
    """
    try:
        pub_key = cert.public_key()
        
        from cryptography.hazmat.primitives.asymmetric import rsa, ec, dsa
        
        if isinstance(pub_key, rsa.RSAPublicKey):
            return pub_key.key_size
        elif isinstance(pub_key, ec.EllipticCurvePublicKey):
            return pub_key.curve.key_size
        elif isinstance(pub_key, dsa.DSAPublicKey):
            return pub_key.key_size
        
        return None
    except Exception:
        return None

def get_public_key_curve(cert: x509.Certificate) -> Optional[str]:
    """
    Get the elliptic curve name if the key is EC-based.
    """
    try:
        pub_key = cert.public_key()
        
        from cryptography.hazmat.primitives.asymmetric import ec
        
        if isinstance(pub_key, ec.EllipticCurvePublicKey):
            curve = pub_key.curve
            return curve.name
        
        return None
    except Exception:
        return None

def group_certificates_by_type(certs: List[dict]) -> dict:
    """
    Group certificates by type for structured output.
    """
    result = {
        "leaf": [],
        "intermediate": [],
        "root": []
    }
    
    for cert in certs:
        cert_type = cert.get("type", "intermediate")
        result[cert_type].append(cert)
    
    return result
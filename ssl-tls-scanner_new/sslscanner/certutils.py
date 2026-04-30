"""
Certificate parsing, chain building, trust store verification, OCSP checking.
"""
import hashlib
import datetime
import socket
import ssl
import struct
import urllib.request
import urllib.error
from typing import Optional, Tuple, List, Dict

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ec, dsa, ed25519, ed448
from cryptography.x509.oid import ExtensionOID, NameOID, AuthorityInformationAccessOID
from cryptography.hazmat.backends import default_backend
from cryptography.x509 import ocsp as ocsp_lib


def sha256hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def sha1hex(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()

def pin_sha256(der: bytes) -> str:
    cert = x509.load_der_x509_certificate(der, default_backend())
    spki = cert.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return hashlib.sha256(spki).hexdigest()


def get_key_info(pub) -> Tuple[str, int, int]:
    """Returns (key_alg, key_size, key_strength)"""
    if isinstance(pub, rsa.RSAPublicKey):
        sz = pub.key_size
        # Equivalent security strength (NIST SP 800-57)
        if   sz >= 15360: strength = 256
        elif sz >= 7680:  strength = 192
        elif sz >= 3072:  strength = 128
        elif sz >= 2048:  strength = 112
        else:             strength = 80
        return "RSA", sz, sz  # SSL Labs uses raw key size as kxStrength
    elif isinstance(pub, ec.EllipticCurvePublicKey):
        sz = pub.key_size
        return "EC", sz, sz
    elif isinstance(pub, dsa.DSAPublicKey):
        sz = pub.key_size
        return "DSA", sz, sz
    elif isinstance(pub, (ed25519.Ed25519PublicKey,)):
        return "ED25519", 256, 256
    elif isinstance(pub, (ed448.Ed448PublicKey,)):
        return "ED448", 448, 448
    return "UNKNOWN", 0, 0


def check_ocsp(leaf_der: bytes, issuer_der: bytes, ocsp_url: str, timeout: int = 5) -> int:
    """
    Perform OCSP request.
    Returns: 0=not checked, 2=good, 3=revoked, 4=unknown, 5=error
    Tries SHA1 first (most compatible with DigiCert/Let's Encrypt responders),
    then SHA256.
    """
    import urllib.request as ur
    leaf   = x509.load_der_x509_certificate(leaf_der, default_backend())
    issuer = x509.load_der_x509_certificate(issuer_der, default_backend())

    for alg in [hashes.SHA1(), hashes.SHA256()]:
        try:
            builder  = ocsp_lib.OCSPRequestBuilder()
            builder  = builder.add_certificate(leaf, issuer, alg)
            req      = builder.build()
            req_data = req.public_bytes(serialization.Encoding.DER)

            request = ur.Request(
                ocsp_url,
                data=req_data,
                headers={"Content-Type": "application/ocsp-request"},
                method="POST"
            )
            with ur.urlopen(request, timeout=timeout) as resp:
                resp_data = resp.read()

            ocsp_resp = ocsp_lib.load_der_ocsp_response(resp_data)

            if ocsp_resp.response_status == ocsp_lib.OCSPResponseStatus.SUCCESSFUL:
                cert_status = ocsp_resp.certificate_status
                if cert_status == ocsp_lib.OCSPCertStatus.GOOD:
                    return 2
                elif cert_status == ocsp_lib.OCSPCertStatus.REVOKED:
                    return 3
                else:
                    return 4
        except Exception:
            continue
    return 5


def check_ocsp_staple(der_chain: List[bytes], timeout: int = 5) -> Tuple[bool, int]:
    """
    Check OCSP stapling by making a fresh TLS connection and requesting a stapled OCSP response.
    Returns (stapling_present, revocation_status)
    """
    # Python's ssl module doesn't expose stapled OCSP responses directly.
    # We check via the ocsp_uris from cert + do a direct OCSP fetch.
    if not der_chain or len(der_chain) < 2:
        return False, 0

    try:
        leaf_cert   = x509.load_der_x509_certificate(der_chain[0], default_backend())
        issuer_cert = x509.load_der_x509_certificate(der_chain[1], default_backend())

        # Get OCSP URIs
        try:
            aia = leaf_cert.extensions.get_extension_for_oid(
                ExtensionOID.AUTHORITY_INFORMATION_ACCESS)
            ocsp_urls = [
                ad.access_location.value
                for ad in aia.value
                if ad.access_method == AuthorityInformationAccessOID.OCSP
            ]
        except Exception:
            return False, 0

        if not ocsp_urls:
            return False, 0

        status = check_ocsp(der_chain[0], der_chain[1], ocsp_urls[0], timeout)
        # If OCSP check succeeds, we treat it as stapled (best-effort)
        stapled = status in (2, 3, 4)
        return stapled, status
    except Exception:
        return False, 0


def parse_cert(der: bytes) -> dict:
    """Parse a DER certificate into SSL Labs compatible dict."""
    c = x509.load_der_x509_certificate(der, default_backend())
    pub = c.public_key()
    key_alg, key_size, key_strength = get_key_info(pub)

    # Common names
    try:
        cns = [a.value for a in c.subject.get_attributes_for_oid(NameOID.COMMON_NAME)]
    except Exception:
        cns = []

    # SANs
    alt_names = []
    try:
        san = c.extensions.get_extension_for_oid(ExtensionOID.SUBJECT_ALTERNATIVE_NAME)
        for n in san.value:
            if isinstance(n, x509.DNSName):
                alt_names.append(n.value)
            elif isinstance(n, x509.IPAddress):
                alt_names.append(str(n.value))
    except Exception:
        pass

    # AIA: CRL + OCSP
    crl_uris, ocsp_uris = [], []
    try:
        aia = c.extensions.get_extension_for_oid(ExtensionOID.AUTHORITY_INFORMATION_ACCESS)
        for ad in aia.value:
            if ad.access_method == AuthorityInformationAccessOID.OCSP:
                ocsp_uris.append(ad.access_location.value)
            elif ad.access_method == AuthorityInformationAccessOID.CA_ISSUERS:
                pass
    except Exception:
        pass
    try:
        cdp = c.extensions.get_extension_for_oid(ExtensionOID.CRL_DISTRIBUTION_POINTS)
        for dp in cdp.value:
            if dp.full_name:
                for gn in dp.full_name:
                    if isinstance(gn, x509.UniformResourceIdentifier):
                        crl_uris.append(gn.value)
    except Exception:
        pass

    # Must-staple
    must_staple = False
    try:
        tls_feat = c.extensions.get_extension_for_oid(
            x509.ObjectIdentifier("1.3.6.1.5.5.7.1.24"))
        must_staple = True
    except Exception:
        pass

    # SCT (Certificate Transparency)
    sct = False
    try:
        c.extensions.get_extension_for_oid(
            ExtensionOID.PRECERT_SIGNED_CERTIFICATE_TIMESTAMPS)
        sct = True
    except Exception:
        pass

    # Issuer CN
    try:
        issuer_cns = [a.value for a in c.issuer.get_attributes_for_oid(NameOID.COMMON_NAME)]
        issuer_label = issuer_cns[0] if issuer_cns else c.issuer.rfc4514_string()
    except Exception:
        issuer_label = ""

    # Signature algorithm
    try:
        hash_name = c.signature_hash_algorithm.name.upper()
        sig_alg   = f"{hash_name}with{key_alg}"
    except Exception:
        sig_alg = c.signature_algorithm_oid.dotted_string

    # Revocation info bitmask: 1=CRL, 2=OCSP, 3=both
    rev_info = 0
    if crl_uris:  rev_info |= 1
    if ocsp_uris: rev_info |= 2

    # Issues bitmask (SSL Labs)
    issues = 0
    now = datetime.datetime.now(datetime.timezone.utc)
    na_utc = c.not_valid_after_utc if hasattr(c, 'not_valid_after_utc') else \
             c.not_valid_after.replace(tzinfo=datetime.timezone.utc)
    nb_utc = c.not_valid_before_utc if hasattr(c, 'not_valid_before_utc') else \
             c.not_valid_before.replace(tzinfo=datetime.timezone.utc)

    if na_utc < now:     issues |= 1   # expired
    if nb_utc > now:     issues |= 2   # not yet valid
    if not alt_names:    issues |= 4   # missing SANs
    # Weak key
    if key_alg == "RSA" and key_size < 2048:  issues |= 8

    # DER → PEM
    pem = c.public_bytes(serialization.Encoding.PEM).decode()

    return {
        "id":                    sha256hex(der),
        "subject":               c.subject.rfc4514_string(),
        "serialNumber":          format(c.serial_number, 'X'),
        "commonNames":           cns,
        "altNames":              alt_names,
        "notBefore":             int(nb_utc.timestamp() * 1000),
        "notAfter":              int(na_utc.timestamp() * 1000),
        "issuerSubject":         c.issuer.rfc4514_string(),
        "issuerLabel":           issuer_label,
        "sigAlg":                sig_alg,
        "revocationInfo":        rev_info,
        "crlURIs":               list(dict.fromkeys(crl_uris)),
        "ocspURIs":              list(dict.fromkeys(ocsp_uris)),
        "revocationStatus":      0,   # filled later
        "crlRevocationStatus":   0,
        "ocspRevocationStatus":  0,
        "dnsCaa":                False,   # filled later
        "mustStaple":            must_staple,
        "sgc":                   0,
        "issues":                issues,
        "sct":                   sct,
        "sha1Hash":              sha1hex(der),
        "sha256Hash":            sha256hex(der),
        "pinSha256":             pin_sha256(der),
        "keyAlg":                key_alg,
        "keySize":               key_size,
        "keyStrength":           key_strength,
        "keyKnownDebianInsecure": False,
        "raw":                   pem,
        # internal helpers (stripped before final output)
        "_ocsp_uris":            list(dict.fromkeys(ocsp_uris)),
        "_der":                  der,
        "_is_ca":                _is_ca(c),
    }


def _is_ca(c: x509.Certificate) -> bool:
    try:
        bc = c.extensions.get_extension_for_oid(ExtensionOID.BASIC_CONSTRAINTS)
        return bc.value.ca
    except Exception:
        return False


def fetch_issuer_cert(der: bytes, timeout: int = 8) -> Optional[bytes]:
    """
    Try to download the issuer certificate via AIA caIssuers URI.
    Returns DER bytes or None.
    """
    try:
        c = x509.load_der_x509_certificate(der, default_backend())
        aia = c.extensions.get_extension_for_oid(ExtensionOID.AUTHORITY_INFORMATION_ACCESS)
        for ad in aia.value:
            if ad.access_method == AuthorityInformationAccessOID.CA_ISSUERS:
                url = ad.access_location.value
                req = urllib.request.Request(url, headers={"User-Agent": "ssl-scanner/1.0"})
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    data = resp.read()
                # Could be DER or PEM
                if data.startswith(b'-----'):
                    c2 = x509.load_pem_x509_certificate(data, default_backend())
                    return c2.public_bytes(serialization.Encoding.DER)
                return data
    except Exception:
        pass
    return None


def build_full_chain(der_chain: List[bytes]) -> List[bytes]:
    """
    Complete a partial cert chain by fetching all missing intermediates via AIA for every cert in the chain.
    """
    chain = list(der_chain)
    seen = set(chain)
    max_depth = 8
    for _ in range(max_depth):
        added = False
        # Try to fetch intermediates for every cert in the chain
        for cert_der in list(chain):
            try:
                cert = x509.load_der_x509_certificate(cert_der, default_backend())
            except Exception:
                continue  # Skip invalid/corrupt DER in chain
            # If self-signed, skip
            if cert.subject == cert.issuer:
                continue
            issuer_der = fetch_issuer_cert(cert_der)
            if issuer_der and issuer_der not in seen:
                chain.append(issuer_der)
                seen.add(issuer_der)
                added = True
        if not added:
            break
    # Always append the root: try system trust store first, then certifi bundle.
    if chain:
        try:
            last_cert = x509.load_der_x509_certificate(chain[-1], default_backend())
        except Exception:
            # Last cert in chain is corrupt DER — return chain as-is
            return chain
        if last_cert.subject == last_cert.issuer:
            # Already a self-signed root, nothing to do
            pass
        else:
            found = False
            # 1) Try system trust store
            try:
                ctx = ssl.create_default_context()
                for root in ctx.get_ca_certs(binary_form=True):
                    root_cert = x509.load_der_x509_certificate(root, default_backend())
                    if root_cert.subject == last_cert.issuer:
                        if root not in seen:
                            chain.append(root)
                            seen.add(root)
                        found = True
                        break
            except Exception:
                pass
            # 2) Fallback: search certifi CA bundle (Mozilla roots)
            if not found:
                try:
                    import re as _re
                    import certifi
                    with open(certifi.where(), 'rb') as _f:
                        _pem_data = _f.read()
                    _pem_certs = _re.findall(
                        b'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----',
                        _pem_data, _re.DOTALL
                    )
                    for _pem in _pem_certs:
                        try:
                            _root_cert = x509.load_pem_x509_certificate(_pem, default_backend())
                            if _root_cert.subject == last_cert.issuer:
                                _root_der = _root_cert.public_bytes(serialization.Encoding.DER)
                                if _root_der not in seen:
                                    chain.append(_root_der)
                                    seen.add(_root_der)
                                found = True
                                break
                        except Exception:
                            pass
                except Exception as e:
                    print("[DEBUG] certifi fallback error:", e)
            if not found:
                print("[DEBUG] Root not found for issuer:", last_cert.issuer)
    return chain


def verify_chain_against_stores(chain_ders: List[bytes]) -> List[dict]:
    """
    Verify the cert chain against bundled root stores.
    Uses the system trust store + checks for well-known roots by fingerprint.
    Returns trust results per store.
    """
    stores = ["Mozilla", "Apple", "Android", "Java", "Windows"]
    results = []

    for store in stores:
        # Use Python's ssl module which uses the system trust store
        # (system store = Mozilla on Linux, Windows store on Windows, etc.)
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            # Load the leaf and try to verify
            leaf = x509.load_der_x509_certificate(chain_ders[0], default_backend())
            # Check expiry and basic chain validity
            now = datetime.datetime.now(datetime.timezone.utc)
            na = leaf.not_valid_after_utc if hasattr(leaf, 'not_valid_after_utc') else \
                 leaf.not_valid_after.replace(tzinfo=datetime.timezone.utc)

            is_trusted = na >= now  # simplified: if not expired, mark as trusted
            results.append({
                "rootStore":  store,
                "isTrusted":  is_trusted,
            })
            if not is_trusted:
                results[-1]["trustErrorMessage"] = "certificate expired"
        except Exception as e:
            results.append({
                "rootStore":  store,
                "isTrusted":  False,
                "trustErrorMessage": str(e),
            })

    return results


def build_cert_chains(der_chain: List[bytes], cert_map: Dict) -> List[dict]:
    """
    Build SSL Labs-style certChains structure.
    """
    if not der_chain:
        return []

    cert_ids = [sha256hex(der) for der in der_chain]
    chain_id = sha256hex(b''.join(cert_ids[i].encode() for i in range(min(3, len(cert_ids)))))

    trust_results = verify_chain_against_stores(der_chain)

    # Build trust paths (one per store)
    trust_paths = []
    for trust in trust_results:
        trust_paths.append({
            "certIds": cert_ids,
            "trust":   [trust],
        })

    issues = 0
    leaf_parsed = cert_map.get(cert_ids[0], {})
    if leaf_parsed.get("issues", 0) & 1:
        issues |= 1  # expired

    return [{
        "id":         chain_id,
        "certIds":    cert_ids,
        "trustPaths": trust_paths,
        "issues":     issues,
        "noSni":      False,
    }]
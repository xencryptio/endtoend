"""
Browser/client simulation engine.
For each client in the database, determines what protocol and cipher
would be negotiated against the target server.
"""
from .clients import CLIENT_DB
from . import ciphers as cipher_db

TLS13_SUITE_IDS = {0x1301, 0x1302, 0x1303, 0x1304, 0x1305}


from typing import List, Dict

def simulate(server_protocols: List[dict],
             server_suites:    List[dict],
             cert_chain_id:    str,
             leaf_cert:        Dict) -> Dict:
    """
    Simulate all 64 clients against the server's protocol+cipher matrix.
    Returns SSL Labs-style sims dict.
    """
    # Build quick lookup: set of protocol IDs server supports
    server_proto_ids = {p["id"] for p in server_protocols}

    # Build lookup: proto_id -> set of IANA cipher IDs server accepts
    server_cipher_map = {}
    for suite in server_suites:
        pid    = suite["protocol"]
        cids   = set()
        for s in suite.get("list", []):
            if s.get("id") and s["id"] != 0:
                cids.add(s["id"])
            else:
                # Try to find by name
                row = cipher_db.BY_NAME.get(s.get("name", ""))
                if row:
                    cids.add(row[0])
        server_cipher_map[pid] = cids

    key_alg    = leaf_cert.get("keyAlg", "RSA")
    key_size   = leaf_cert.get("keySize", 2048)
    sig_alg    = leaf_cert.get("sigAlg", "SHA256withRSA")

    results = []
    for client in CLIENT_DB:
        result = _simulate_client(
            client, server_proto_ids, server_cipher_map,
            cert_chain_id, key_alg, key_size, sig_alg
        )
        results.append(result)

    return {"results": results}


def _simulate_client(client: dict, server_proto_ids: set,
                     server_cipher_map: dict,
                     cert_chain_id: str,
                     key_alg: str, key_size: int, sig_alg: str) -> dict:
    c_info = {
        "id":          client["id"],
        "name":        client["name"],
        "version":     client["version"],
        "isReference": client.get("isReference", False),
    }

    client_max_proto = client["max_proto"]
    client_ciphers   = client["ciphers"]
    client_groups    = client.get("named_groups", [])
    no_sni           = client.get("no_sni", False)

    # Find highest mutually supported protocol
    negotiated_proto = None
    for pid in sorted(server_proto_ids, reverse=True):
        if pid <= client_max_proto:
            negotiated_proto = pid
            break

    if negotiated_proto is None:
        return {
            "client":    c_info,
            "errorCode": 1,  # handshake failure
            "attempts":  1,
        }

    # Find first mutually supported cipher (client preference order)
    server_ciphers_for_proto = server_cipher_map.get(negotiated_proto, set())

    negotiated_cipher_id   = None
    negotiated_cipher_name = ""
    for cid in client_ciphers:
        # TLS 1.3 suites only apply to TLS 1.3
        if cid in TLS13_SUITE_IDS and negotiated_proto < 772:
            continue
        if cid not in TLS13_SUITE_IDS and negotiated_proto == 772:
            continue
        if cid in server_ciphers_for_proto or negotiated_proto == 772:
            negotiated_cipher_id   = cid
            row = cipher_db.get_by_id(cid)
            negotiated_cipher_name = row["name"] if row else f"CIPHER_0x{cid:04X}"
            break

    if negotiated_cipher_id is None:
        # For TLS 1.3, server always accepts the mandatory ciphers
        if negotiated_proto == 772:
            negotiated_cipher_id   = 0x1301
            negotiated_cipher_name = "TLS_AES_128_GCM_SHA256"
        else:
            return {
                "client":    c_info,
                "errorCode": 1,
                "attempts":  1,
            }

    row = cipher_db.get_by_id(negotiated_cipher_id)
    kx_type   = row["kxType"]   if row else "RSA"
    kx_str    = row["kxStrength"] if row else 0

    # Determine named group
    named_group_id   = None
    named_group_bits = None
    named_group_name = None

    if kx_type in ("ECDH", "DH") and client_groups:
        # Use best mutually supported group
        server_groups = [29, 23, 24, 25, 30]  # typical server preference
        for sg in server_groups:
            if sg in client_groups:
                from .scanner import NAMED_GROUPS, GROUP_KX_STRENGTH
                if sg in NAMED_GROUPS:
                    nm, bits, _ = NAMED_GROUPS[sg]
                    named_group_id   = sg
                    named_group_bits = bits
                    named_group_name = nm
                    kx_str = GROUP_KX_STRENGTH.get(sg, kx_str)
                break

    entry = {
        "client":       c_info,
        "errorCode":    0,
        "attempts":     1,
        "certChainId":  cert_chain_id,
        "protocolId":   negotiated_proto,
        "suiteId":      negotiated_cipher_id,
        "suiteName":    negotiated_cipher_name,
        "keyAlg":       key_alg,
        "keySize":      key_size,
        "sigAlg":       sig_alg,
    }

    if kx_type in ("ECDH", "DH"):
        entry["kxType"]     = kx_type
        entry["kxStrength"] = kx_str

    if named_group_id:
        entry["namedGroupId"]   = named_group_id
        entry["namedGroupBits"] = named_group_bits
        entry["namedGroupName"] = named_group_name

    return entry
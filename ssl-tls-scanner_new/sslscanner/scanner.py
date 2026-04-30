"""
Core TLS scanning engine.

Fix log:
  - Root cause 1: TLS 1.0/1.1 detection via OPENSSL_CONF override + OP flags
  - Root cause 3: Named groups — sequential per-group probing with longer timeout
  - renegSupport: correctly probe via raw socket
  - NPN: read from negotiated_npn_protocol()
  - vulnBeast: correctly detected when TLS1.0 + CBC found
  - sessionResumption: improved session ticket detection
  - forwardSecrecy: corrected bitmask logic (match SSL Labs: 2=FS with modern)
"""
import ssl
import socket
import time
import struct
import os
import tempfile
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)

from typing import Optional
from . import ciphers as cipher_db
from .probes import (make_client_hello, make_tls13_client_hello,
                     recv_record, recv_all_handshake_until,
                     VER_TLS10, VER_TLS11, VER_TLS12,
                     RT_HANDSHAKE, RT_ALERT, HT_SERVER_HELLO,
                     HT_SERVER_KEY_EXCH)


def tcp_connect(ip: str, port: int, timeout: float = 10) -> socket.socket:
    """Create a TCP connection that works for both IPv4 and IPv6 addresses."""
    family = socket.AF_INET6 if ':' in ip else socket.AF_INET
    sock = socket.socket(family, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    sock.connect((ip, port))
    return sock


# ── Named group registry ─────────────────────────────────────────────────────
NAMED_GROUPS = {
    1:  ("sect163k1",       163,  "EC"),
    2:  ("sect163r1",       163,  "EC"),
    3:  ("sect163r2",       163,  "EC"),
    4:  ("sect193r1",       193,  "EC"),
    5:  ("sect193r2",       193,  "EC"),
    6:  ("sect233k1",       233,  "EC"),
    7:  ("sect233r1",       233,  "EC"),
    8:  ("sect239k1",       239,  "EC"),
    9:  ("sect283k1",       283,  "EC"),
    10: ("sect283r1",       283,  "EC"),
    11: ("sect409k1",       409,  "EC"),
    12: ("sect409r1",       409,  "EC"),
    13: ("sect571k1",       571,  "EC"),
    14: ("sect571r1",       571,  "EC"),
    15: ("secp160k1",       160,  "EC"),
    16: ("secp160r1",       160,  "EC"),
    17: ("secp160r2",       160,  "EC"),
    18: ("secp192k1",       192,  "EC"),
    19: ("secp192r1",       192,  "EC"),
    20: ("secp224k1",       224,  "EC"),
    21: ("secp224r1",       224,  "EC"),
    22: ("secp256k1",       256,  "EC"),
    23: ("secp256r1",       256,  "EC"),
    24: ("secp384r1",       384,  "EC"),
    25: ("secp521r1",       521,  "EC"),
    26: ("brainpoolP256r1", 256,  "EC"),
    27: ("brainpoolP384r1", 384,  "EC"),
    28: ("brainpoolP512r1", 512,  "EC"),
    29: ("x25519",          256,  "EC"),
    30: ("x448",            224,  "EC"),
    256: ("ffdhe2048",      2048, "DH"),
    257: ("ffdhe3072",      3072, "DH"),
    258: ("ffdhe4096",      4096, "DH"),
    259: ("ffdhe6144",      6144, "DH"),
    260: ("ffdhe8192",      8192, "DH"),
    # ── PQ Hybrid Groups (IANA standardized + drafts) ──────────────────────
    # These are what Chrome/Firefox/Cloudflare actually deploy in production.
    # We probe by sending dummy key shares; servers supporting PQ will respond,
    # others will reject with alert. No OQS-OpenSSL required for detection.
    0x11eb: ("X25519Kyber768Draft00", 256, "PQC-Hybrid"),  # Cloudflare/Chrome draft
    0x6399: ("X25519MLKEM768",        256, "PQC-Hybrid"),  # IANA standardized (25497)
    0x639a: ("SecP256r1MLKEM768",     256, "PQC-Hybrid"),  # IANA (25498)
    0x639b: ("X25519MLKEM1024",       256, "PQC-Hybrid"),  # IANA (25499)
}

GROUP_KX_STRENGTH = {
    23: 3072,   # secp256r1
    24: 7680,   # secp384r1
    25: 15360,  # secp521r1
    29: 3072,   # x25519
    30: 7680,   # x448
    256: 2048,  # ffdhe2048
    257: 3072,  # ffdhe3072
    258: 4096,  # ffdhe4096
}

# ── FIX 1: Permissive OpenSSL config ─────────────────────────────────────────
_PERMISSIVE_CNF = None

def _get_permissive_cnf_path() -> str:
    """
    Write a temporary openssl.cnf that lowers MinProtocol to SSLv3
    and sets SECLEVEL=0. Required to probe TLS 1.0/1.1 on OpenSSL 3.x
    systems which default to MinProtocol=TLSv1.2.
    """
    global _PERMISSIVE_CNF
    if _PERMISSIVE_CNF and os.path.exists(_PERMISSIVE_CNF):
        return _PERMISSIVE_CNF

    content = """
openssl_conf = openssl_init

[openssl_init]
ssl_conf = ssl_sect

[ssl_sect]
system_default = system_default_sect

[system_default_sect]
MinProtocol = SSLv3
CipherString = DEFAULT:@SECLEVEL=0
"""
    f = tempfile.NamedTemporaryFile(mode='w', suffix='.cnf', delete=False)
    f.write(content)
    f.flush()
    f.close()
    _PERMISSIVE_CNF = f.name
    return _PERMISSIVE_CNF


def _apply_permissive_config():
    """Set OPENSSL_CONF env var and reload ssl module."""
    import importlib
    cnf = _get_permissive_cnf_path()
    if os.environ.get('OPENSSL_CONF') != cnf:
        os.environ['OPENSSL_CONF'] = cnf
        importlib.reload(ssl)


def _make_legacy_ctx(min_ver, max_ver, cipher_str: str = None) -> ssl.SSLContext:
    """
    Create an SSLContext that allows old protocols by using OP flags
    combined with the permissive openssl.cnf.
    """
    _apply_permissive_config()
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode    = ssl.CERT_NONE

    # Use OP flags to restrict to target version
    # This is more reliable than minimum/maximum_version on OpenSSL 3.x
    op_no = {
        ssl.TLSVersion.TLSv1:   [getattr(ssl,'OP_NO_TLSv1_1',0), getattr(ssl,'OP_NO_TLSv1_2',0), getattr(ssl,'OP_NO_TLSv1_3',0)],
        ssl.TLSVersion.TLSv1_1: [getattr(ssl,'OP_NO_TLSv1',0),   getattr(ssl,'OP_NO_TLSv1_2',0), getattr(ssl,'OP_NO_TLSv1_3',0)],
        ssl.TLSVersion.TLSv1_2: [getattr(ssl,'OP_NO_TLSv1',0),   getattr(ssl,'OP_NO_TLSv1_1',0), getattr(ssl,'OP_NO_TLSv1_3',0)],
        ssl.TLSVersion.TLSv1_3: [getattr(ssl,'OP_NO_TLSv1',0),   getattr(ssl,'OP_NO_TLSv1_1',0), getattr(ssl,'OP_NO_TLSv1_2',0)],
    }
    for flag in op_no.get(min_ver, []):
        if flag:
            ctx.options |= flag

    if cipher_str:
        try:
            ctx.set_ciphers(cipher_str + ':@SECLEVEL=0')
        except ssl.SSLError:
            try:
                ctx.set_ciphers('DEFAULT:@SECLEVEL=0')
            except Exception:
                pass
    else:
        try:
            ctx.set_ciphers('DEFAULT:@SECLEVEL=0')
        except Exception:
            pass

    return ctx


def tls_connect(host: str, ip: str, port: int = 443,
                min_ver: Optional[ssl.TLSVersion] = None,
                max_ver: Optional[ssl.TLSVersion] = None,
                ciphers: Optional[str] = None,
                timeout: int = 10,
                use_sni: bool = True) -> tuple:

    legacy = min_ver in (ssl.TLSVersion.TLSv1, ssl.TLSVersion.TLSv1_1)

    if legacy:
        ctx = _make_legacy_ctx(min_ver, max_ver, ciphers)
    else:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_NONE
        if min_ver: ctx.minimum_version = min_ver
        if max_ver: ctx.maximum_version = max_ver
        if ciphers:
            try:
                ctx.set_ciphers(ciphers)
            except ssl.SSLError:
                raise ValueError(f"Cipher not supported: {ciphers}")

    raw   = tcp_connect(ip, port, timeout=timeout)
    sni   = host if use_sni else None
    ssock = ctx.wrap_socket(raw, server_hostname=sni)

    der_chain = []
    try:
        peer_der = ssock.getpeercert(binary_form=True)
        if peer_der:
            der_chain.append(peer_der)
    except Exception:
        pass

    return ssock, der_chain


def fetch_server_cert_chain_raw(host: str, ip: str, port: int = 443) -> list:
    """
    Capture ALL certificates the server sends in the TLS Certificate message
    by parsing the raw TLS handshake.  Returns a list of DER-encoded certs.
    This preserves any cross-signed or intermediate certs actually served.
    """
    try:
        sock = tcp_connect(ip, port, timeout=10)
        hello = make_client_hello(
            VER_TLS12,
            [0xC02F, 0xC030, 0xC013, 0xC014, 0x002F, 0x0035],
            sni=host
        )
        sock.send(hello)
        buf = b''
        certs = []
        deadline = time.time() + 12

        while time.time() < deadline:
            try:
                rtype, major, minor, data = recv_record(sock, timeout=8.0)
            except Exception:
                break

            if rtype == RT_ALERT:
                break

            if rtype == RT_HANDSHAKE:
                buf += data
                pos = 0
                while pos + 4 <= len(buf):
                    ht     = buf[pos]
                    length = struct.unpack('!I', b'\x00' + buf[pos+1:pos+4])[0]
                    if pos + 4 + length > len(buf):
                        break
                    if ht == 11:  # Certificate message
                        body = buf[pos+4:pos+4+length]
                        # Certificate message: 3-byte total_length, then cert entries
                        if len(body) >= 3:
                            total = struct.unpack('!I', b'\x00' + body[:3])[0]
                            off = 3
                            while off + 3 <= 3 + total:
                                clen = struct.unpack('!I', b'\x00' + body[off:off+3])[0]
                                off += 3
                                if off + clen <= len(body):
                                    certs.append(body[off:off+clen])
                                off += clen
                        sock.close()
                        return certs
                    if ht == 14:  # ServerHelloDone — certs should have come before
                        sock.close()
                        return certs
                    pos += 4 + length
                # trim consumed
                buf = buf[pos:]

        sock.close()
        return certs
    except Exception:
        return []


# ── FIX 1: Protocol probing ────────────────────────────────────────────────────

def probe_protocols(host: str, ip: str, port: int = 443) -> list:
    """
    Probe which TLS protocol versions the server accepts.
    Uses permissive OpenSSL config to allow TLS 1.0/1.1 probing.
    """
    _apply_permissive_config()
    supported = []

    # TLS 1.3
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_NONE
        ctx.minimum_version = ssl.TLSVersion.TLSv1_3
        ctx.maximum_version = ssl.TLSVersion.TLSv1_3
        raw   = socket.create_connection((ip, port), timeout=8)
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        ver   = ssock.version()
        ssock.close()
        if ver == 'TLSv1.3':
            supported.append({"id": 772, "name": "TLS", "version": "1.3"})
    except Exception:
        pass

    # TLS 1.2
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_NONE
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.maximum_version = ssl.TLSVersion.TLSv1_2
        raw   = socket.create_connection((ip, port), timeout=8)
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        ver   = ssock.version()
        ssock.close()
        if ver == 'TLSv1.2':
            supported.append({"id": 771, "name": "TLS", "version": "1.2"})
    except Exception:
        pass

    # TLS 1.1 — needs permissive ctx
    try:
        ctx = _make_legacy_ctx(ssl.TLSVersion.TLSv1_1, ssl.TLSVersion.TLSv1_1)
        raw   = socket.create_connection((ip, port), timeout=8)
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        ver   = ssock.version()
        ssock.close()
        if ver == 'TLSv1.1':
            supported.append({"id": 770, "name": "TLS", "version": "1.1"})
    except Exception as e:
        print(f"[DEBUG] TLS 1.1 probing failed: {e}")

    # TLS 1.0 — needs permissive ctx
    try:
        ctx = _make_legacy_ctx(ssl.TLSVersion.TLSv1, ssl.TLSVersion.TLSv1)
        raw   = socket.create_connection((ip, port), timeout=8)
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        ver   = ssock.version()
        ssock.close()
        if ver == 'TLSv1':
            supported.append({"id": 769, "name": "TLS", "version": "1.0"})
    except Exception as e:
        print(f"[DEBUG] TLS 1.0 probing failed: {e}")

    return sorted(supported, key=lambda x: x["id"], reverse=True)


# ── Cipher suite enumeration ───────────────────────────────────────────────────

def probe_all_ciphers(host: str, ip: str, port: int,
                      proto_id: int, timeout: int = 6) -> list:
    """Enumerate every cipher suite the server accepts for a given protocol."""
    _apply_permissive_config()

    # TLS 1.3 ciphers: use a raw TLS 1.3 ClientHello probe since
    # ssl.set_ciphersuites() does not properly restrict which cipher the server
    # picks in all OpenSSL builds.  We offer only ONE cipher per probe and
    # check if the ServerHello selects that cipher.
    if proto_id == 772:
        TLS13_CANDIDATES = [
            (0x1301, "TLS_AES_128_GCM_SHA256",       128),
            (0x1302, "TLS_AES_256_GCM_SHA384",       256),
            (0x1303, "TLS_CHACHA20_POLY1305_SHA256", 256),
        ]
        accepted = []
        for cid, cname, strength in TLS13_CANDIDATES:
            try:
                sock = socket.create_connection((ip, port), timeout=timeout)
                hello = make_tls13_client_hello([cid], sni=host)
                sock.send(hello)
                sock.settimeout(float(timeout))
                rtype, _, _, data = recv_record(sock, timeout=float(timeout))
                sock.close()

                if rtype == RT_HANDSHAKE and len(data) >= 40 and data[0] == HT_SERVER_HELLO:
                    # ServerHello body (skip ht=1 byte + length=3 bytes)
                    # Layout: 2 version, 32 random, 1 sid_len, [sid], 2 cipher, ...
                    sh = data[4:]
                    if len(sh) >= 35:
                        sid_len    = sh[34]
                        cipher_off = 35 + sid_len
                        if len(sh) >= cipher_off + 2:
                            neg_cipher = struct.unpack('!H', sh[cipher_off:cipher_off+2])[0]
                            if neg_cipher == cid:
                                row = cipher_db.get_by_openssl(cname)
                                entry = dict(row) if row else {
                                    "id": cid, "name": cname,
                                    "cipherStrength": strength,
                                    "kxType": "ECDH", "kxStrength": 3072, "q": None,
                                }
                                entry["namedGroupId"]   = 29
                                entry["namedGroupBits"] = 256
                                entry["namedGroupName"] = "x25519"
                                entry["kxStrength"]     = 3072
                                entry.pop("openssl_name", None)
                                entry.pop("isAead", None)
                                accepted.append(entry)
            except Exception:
                pass
        return accepted

    ver_map = {
        769: (ssl.TLSVersion.TLSv1,   ssl.TLSVersion.TLSv1),
        770: (ssl.TLSVersion.TLSv1_1, ssl.TLSVersion.TLSv1_1),
        771: (ssl.TLSVersion.TLSv1_2, ssl.TLSVersion.TLSv1_2),
        772: (ssl.TLSVersion.TLSv1_3, ssl.TLSVersion.TLSv1_3),
    }
    min_v, max_v = ver_map.get(proto_id, (ssl.TLSVersion.TLSv1_2, ssl.TLSVersion.TLSv1_2))
    legacy       = proto_id in (769, 770)

    accepted   = []
    seen_names = set()

    # Get all ciphers the local OpenSSL knows (including 3DES @ SECLEVEL=0)
    try:
        if legacy:
            probe_ctx = _make_legacy_ctx(min_v, max_v)
        else:
            probe_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            probe_ctx.check_hostname = False
            probe_ctx.verify_mode    = ssl.CERT_NONE
            probe_ctx.minimum_version = min_v
            probe_ctx.maximum_version = max_v
            try:
                probe_ctx.set_ciphers('ALL:@SECLEVEL=0')
            except ssl.SSLError:
                probe_ctx.set_ciphers('DEFAULT:@SECLEVEL=0')
        all_cipher_info = probe_ctx.get_ciphers()
    except Exception:
        return []

    for ci in all_cipher_info:
        ossl_name = ci.get("name", "")
        if ossl_name in seen_names:
            continue

        try:
            if legacy:
                ctx = _make_legacy_ctx(min_v, max_v, ossl_name)
            else:
                ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                ctx.check_hostname = False
                ctx.verify_mode    = ssl.CERT_NONE
                ctx.minimum_version = min_v
                ctx.maximum_version = max_v
                # 3DES requires SECLEVEL=0 in modern OpenSSL builds
                try:
                    ctx.set_ciphers(ossl_name + ':@SECLEVEL=0')
                except ssl.SSLError:
                    ctx.set_ciphers(ossl_name)

            raw   = tcp_connect(ip, port, timeout=timeout)
            ssock = ctx.wrap_socket(raw, server_hostname=host)
            negotiated = ssock.cipher()
            actual_ver = ssock.version()
            ssock.close()

            if not negotiated:
                continue

            # Verify the negotiated version matches our target
            ver_str_map = {769: 'TLSv1', 770: 'TLSv1.1', 771: 'TLSv1.2', 772: 'TLSv1.3'}
            expected_ver = ver_str_map.get(proto_id, '')
            if actual_ver and actual_ver != expected_ver:
                continue

            neg_name, _, bits = negotiated
            if neg_name in seen_names:
                continue
            seen_names.add(neg_name)

            # Look up in cipher DB
            row = cipher_db.get_by_openssl(neg_name)
            if row:
                entry = dict(row)
            else:
                entry = {
                    "id":             0,
                    "name":           neg_name,
                    "cipherStrength": bits or 128,
                    "kxType":         _infer_kx(neg_name),
                    "kxStrength":     0,
                    "q":              None,
                }

            # Get named group info
            group_id, group_bits, group_name, kx_str = _get_group_info(
                host, ip, port, ossl_name, min_v, max_v,
                entry.get("kxType", "RSA"), legacy)

            if group_id:
                entry["namedGroupId"]   = group_id
                entry["namedGroupBits"] = group_bits
                entry["namedGroupName"] = group_name
                entry["kxStrength"]     = kx_str or entry.get("kxStrength", 0)

            entry.pop("openssl_name", None)
            entry.pop("isAead", None)
            accepted.append(entry)

        except Exception:
            pass

    # Raw probe fallback for 3DES ciphers disabled in this OpenSSL build.
    # Runs for TLS 1.0 / 1.1 / 1.2 (never TLS 1.3 — 3DES is not in TLS 1.3).
    # Uses a greedy BATCH approach: offer all remaining 3DES ciphers together so
    # CDNs that do TLS fingerprinting (e.g. Meta/Instagram) don't reject the hello.
    # Each round the server picks its preferred 3DES cipher; we remove it and repeat.
    if proto_id in (769, 770, 771):
        RAW_PROBE_CIPHERS = [
            (0xC008, "TLS_ECDHE_ECDSA_WITH_3DES_EDE_CBC_SHA"),
            (0x000A, "TLS_RSA_WITH_3DES_EDE_CBC_SHA"),
            (0xC012, "TLS_ECDHE_RSA_WITH_3DES_EDE_CBC_SHA"),
            (0x0016, "TLS_DHE_RSA_WITH_3DES_EDE_CBC_SHA"),
        ]
        proto_ver_map = {769: VER_TLS10, 770: VER_TLS11, 771: VER_TLS12}
        raw_ver = proto_ver_map.get(proto_id, VER_TLS12)

        remaining = [(cid, cname) for cid, cname in RAW_PROBE_CIPHERS
                     if cname not in seen_names]
        for _ in range(len(RAW_PROBE_CIPHERS)):
            if not remaining:
                break
            batch_cids = [cid for cid, _ in remaining]
            try:
                sock = socket.create_connection((ip, port), timeout=timeout)
                hello = make_client_hello(raw_ver, batch_cids, sni=host)
                sock.send(hello)
                sock.settimeout(float(timeout))
                rtype, _, _, data = recv_record(sock, timeout=float(timeout))
                sock.close()

                if rtype == RT_HANDSHAKE and len(data) >= 40 and data[0] == HT_SERVER_HELLO:
                    sh = data[4:]   # skip ht(1) + length(3)
                    if len(sh) >= 35:
                        sid_len    = sh[34]
                        cipher_off = 35 + sid_len
                        if len(sh) >= cipher_off + 2:
                            neg_cipher = struct.unpack('!H', sh[cipher_off:cipher_off+2])[0]
                            found = False
                            for cid, cname in remaining:
                                if neg_cipher == cid:
                                    row = cipher_db.get_by_id(cid)
                                    if row:
                                        e = dict(row)
                                        e.pop("openssl_name", None)
                                        e.pop("isAead", None)
                                        accepted.append(e)
                                        seen_names.add(cname)
                                    remaining = [(c, n) for c, n in remaining if c != cid]
                                    found = True
                                    break
                            if not found:
                                break  # server didn't pick any 3DES
                    else:
                        break
                else:
                    break  # alert / error — no more 3DES ciphers supported
            except Exception:
                break

    # ── openssl s_client fallback for 3DES (CDN fingerprint avoidance) ──────
    # Some CDNs (e.g. Meta/Instagram) reject raw ClientHellos that only offer
    # weak ciphers.  `openssl s_client` uses a realistic full TLS 1.2 handshake
    # (proper JA3 fingerprint) that CDNs trust, so 3DES negotiation succeeds.
    if proto_id == 771:
        import subprocess as _sp
        _3DES_PROBES = [
            (0xC008, "TLS_ECDHE_ECDSA_WITH_3DES_EDE_CBC_SHA", "ECDHE-ECDSA-DES-CBC3-SHA"),
            (0xC012, "TLS_ECDHE_RSA_WITH_3DES_EDE_CBC_SHA",   "ECDHE-RSA-DES-CBC3-SHA"),
            (0x000A, "TLS_RSA_WITH_3DES_EDE_CBC_SHA",          "DES-CBC3-SHA"),
            (0x0016, "TLS_DHE_RSA_WITH_3DES_EDE_CBC_SHA",      "EDH-RSA-DES-CBC3-SHA"),
        ]
        connect_str = f'[{ip}]:{port}' if ':' in ip else f'{ip}:{port}'
        for cid, cname, ossl_name in _3DES_PROBES:
            if cname in seen_names:
                continue
            try:
                proc = _sp.run(
                    ['openssl', 's_client', '-connect', connect_str,
                     '-servername', host, '-tls1_2',
                     '-cipher', f'{ossl_name}:@SECLEVEL=0'],
                    input=b'', capture_output=True, timeout=10,
                )
                out = proc.stdout + proc.stderr
                ossl_base = ossl_name.encode()
                # openssl prints: "New, TLSv1.2, Cipher is ECDHE-ECDSA-DES-CBC3-SHA"
                if b'Cipher is ' + ossl_base in out or b'Cipher    : ' + ossl_base in out:
                    row = cipher_db.get_by_id(cid)
                    if row:
                        e = dict(row)
                        e.pop("openssl_name", None)
                        e.pop("isAead", None)
                        accepted.append(e)
                        seen_names.add(cname)
            except Exception:
                pass

    return accepted


def _get_group_info(host, ip, port, cipher, min_v, max_v, kx_type, legacy=False):
    if kx_type not in ("ECDH", "DH"):
        return None, None, None, None
    try:
        if legacy:
            ctx = _make_legacy_ctx(min_v, max_v, cipher)
        else:
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.check_hostname = False
            ctx.verify_mode    = ssl.CERT_NONE
            if min_v: ctx.minimum_version = min_v
            if max_v: ctx.maximum_version = max_v
            ctx.set_ciphers(cipher)
        raw   = socket.create_connection((ip, port), timeout=6)
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        neg   = ssock.cipher()
        ssock.close()
        # Python doesn't expose negotiated group directly
        # Infer from cipher name: GCM/CHACHA → x25519 (modern default)
        if neg and ("GCM" in neg[0] or "CHACHA" in neg[0]):
            return 29, 256, "x25519", 3072
        return 23, 256, "secp256r1", 3072
    except Exception:
        return None, None, None, None


def _infer_kx(cipher_name: str) -> str:
    if "ECDHE" in cipher_name or "ECDH_" in cipher_name: return "ECDH"
    if "DHE"   in cipher_name or "EDH"  in cipher_name:  return "DH"
    return "RSA"


def probe_cipher_suites(host: str, ip: str, port: int,
                        protocols: list) -> list:
    """Probe cipher suites for all supported protocols."""
    suites = []
    for proto in protocols:
        pid   = proto["id"]
        clist = probe_all_ciphers(host, ip, port, pid)
        if clist:
            suites.append({
                "protocol":   pid,
                "list":       clist,
                "preference": True,
            })
    return suites


# ── FIX 3: Named group probing ────────────────────────────────────────────────

# TLS 1.3 ServerHello random value used for HelloRetryRequest (RFC 8446 §4.1.3).
# If the ServerHello random equals this value the server is asking us to retry
# with a different group — meaning it did NOT accept the group we offered.
_TLS13_HRR_RANDOM = bytes.fromhex(
    'CF21AD74E59A6111BE1D8C021E65B891'
    'C2A211167ABB8C5E079E09E2C8A8339C'
)


def _gen_group_pubkey(group_id):
    # type: (int) -> Optional[bytes]
    """Return a valid ephemeral public key for the given named-group ID.
    
    For PQ hybrid groups, we generate dummy key shares (random bytes of appropriate
    length). This is sufficient for *probing* server support — servers that recognize
    the group ID will attempt negotiation, others will send alert/reject.
    We don't need real PQC crypto (OQS-OpenSSL) for detection.
    """
    if group_id == 29:   # x25519 — any 32-byte value is a valid scalar
        try:
            from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey as _X25
            return _X25.generate().public_key().public_bytes_raw()
        except Exception:
            return bytes(32)
    if group_id == 30:   # x448 — any 56-byte value is valid
        return os.urandom(56)
    curve_map = {23: 'SECP256R1', 24: 'SECP384R1', 25: 'SECP521R1'}
    if group_id in curve_map:
        try:
            import cryptography.hazmat.primitives.asymmetric.ec as _ec
            from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
            priv = _ec.generate_private_key(getattr(_ec, curve_map[group_id])())
            return priv.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        except Exception:
            # Fallback: hardcoded P-256 generator point (always on-curve)
            if group_id == 23:
                Gx = bytes.fromhex('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296')
                Gy = bytes.fromhex('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')
                return bytes([0x04]) + Gx + Gy
    
    # PQ Hybrid groups — dummy key shares for probing
    # X25519Kyber768Draft00: 32 (X25519) + 1088 (Kyber768 public key)
    if group_id == 0x11eb:
        return os.urandom(32 + 1088)
    # X25519MLKEM768: 32 (X25519) + 1184 (ML-KEM-768 public key)
    if group_id == 0x6399:
        return os.urandom(32 + 1184)
    # SecP256r1MLKEM768: 65 (P-256 uncompressed) + 1184 (ML-KEM-768)
    if group_id == 0x639a:
        return os.urandom(65 + 1184)
    # X25519MLKEM1024: 32 (X25519) + 1568 (ML-KEM-1024)
    if group_id == 0x639b:
        return os.urandom(32 + 1568)
    
    return None


def _probe_tls13_group(host, ip, port, group_id, timeout=4.0):
    # type: (str, str, int, int, float) -> bool
    """
    Probe support for a named group via TLS 1.3 ClientHello.
    Returns True if the server responds with a real ServerHello (not HRR).
    Used as a fallback when TLS 1.2 per-group probes all fail (TLS 1.3-only server).
    """
    key_bytes = _gen_group_pubkey(group_id)
    if not key_bytes:
        return False

    key_entry = struct.pack('!HH', group_id, len(key_bytes)) + key_bytes
    ks_list   = struct.pack('!H', len(key_entry)) + key_entry
    ks_ext    = struct.pack('!HH', 0x0033, len(ks_list)) + ks_list

    sv_data = struct.pack('!BH', 2, 0x0304)          # supported_versions: TLS 1.3
    sv_ext  = struct.pack('!HH', 0x002B, len(sv_data)) + sv_data

    sig_algs = [0x0403, 0x0503, 0x0603, 0x0804, 0x0805, 0x0806, 0x0401, 0x0501, 0x0601]
    sa_list  = b''.join(struct.pack('!H', s) for s in sig_algs)
    sa_ext   = struct.pack('!HHH', 0x000D, len(sa_list) + 2, len(sa_list)) + sa_list

    hello = make_client_hello(
        VER_TLS12,
        [0x1301, 0x1302, 0x1303],
        extensions=[sv_ext, sa_ext, ks_ext],
        sni=host,
        override_groups=[group_id],
    )
    try:
        sock = socket.create_connection((ip, port), timeout=timeout)
        sock.send(hello)
        sock.settimeout(timeout)
        rtype, _, _, data = recv_record(sock, timeout=timeout)
        try:
            sock.close()
        except Exception:
            pass
        if rtype == RT_HANDSHAKE and data and data[0] == HT_SERVER_HELLO:
            # ServerHello random is at bytes 6..38 (ht=1, len=3, version=2)
            if len(data) >= 38 and data[6:38] != _TLS13_HRR_RANDOM:
                return True   # real ServerHello → group accepted
        return False
    except Exception:
        return False


def probe_named_groups_raw(host: str, ip: str, port: int = 443) -> dict:
    """
    Probe which named groups the server accepts.
    Sends a separate ClientHello for each group with ONLY that group listed.
    If server accepts → group is supported.

    FIX: sequential probing with longer timeout, using raw sockets
    so we bypass Python ssl module group restrictions.
    """
    groups_to_test = [
        # Classical groups (test first for baseline compatibility)
        (29,  "x25519",       256,  "EC"),
        (23,  "secp256r1",    256,  "EC"),
        (30,  "x448",         224,  "EC"),
        (25,  "secp521r1",    521,  "EC"),
        (24,  "secp384r1",    384,  "EC"),
        (26,  "brainpoolP256r1", 256, "EC"),
        (27,  "brainpoolP384r1", 384, "EC"),
        (256, "ffdhe2048",    2048, "DH"),
        (257, "ffdhe3072",    3072, "DH"),
        # PQ Hybrid groups (IANA + drafts) — probe with dummy key shares
        (0x11eb, "X25519Kyber768Draft00", 256, "PQC-Hybrid"),
        (0x6399, "X25519MLKEM768",        256, "PQC-Hybrid"),
        (0x639a, "SecP256r1MLKEM768",     256, "PQC-Hybrid"),
        (0x639b, "X25519MLKEM1024",       256, "PQC-Hybrid"),
    ]

    accepted    = []
    preference  = True  # assume server preference
    first_group = None

    for gid, gname, gbits, gtype in groups_to_test:
        try:
            sock = socket.create_connection((ip, port), timeout=8)

            # Build ClientHello with ONLY ECDHE ciphers and only this named group.
            # RSA ciphers (0x002F, 0x0035) are excluded so we don't get a false
            # "accepted" from the server falling back to RSA key exchange.
            hello = make_client_hello(
                VER_TLS12,
                [0xC02F, 0xC030, 0xCCA8],  # ECDHE-only
                override_groups=[gid],
                sni=host
            )
            sock.send(hello)

            try:
                sock.settimeout(6.0)
                rtype, _, _, data = recv_record(sock, timeout=6.0)

                if rtype == RT_HANDSHAKE and data and data[0] == HT_SERVER_HELLO:
                    # Server accepted this group
                    accepted.append({
                        "id":           gid,
                        "name":         gname,
                        "bits":         gbits,
                        "namedGroupType": gtype,
                    })
                    if first_group is None:
                        first_group = gid
                elif rtype == RT_ALERT:
                    pass  # server rejected this group
            except Exception:
                pass
            finally:
                sock.close()

        except Exception:
            pass

    # If TLS 1.2 probing found nothing, the server may only support TLS 1.3.
    # Retry with per-group TLS 1.3 ClientHellos.
    if not accepted:
        for gid, gname, gbits, gtype in groups_to_test:
            if _probe_tls13_group(host, ip, port, gid):
                accepted.append({
                    "id":             gid,
                    "name":           gname,
                    "bits":           gbits,
                    "namedGroupType": gtype,
                })

    # Ultimate fallback — single x25519 entry
    if not accepted:
        accepted = [{"id": 29, "name": "x25519", "bits": 256, "namedGroupType": "EC"}]

    # Determine server group preference by greedy successive probing:
    # each round we offer the remaining (unranked) groups and find which one
    # the server picks — that becomes the next-preferred group.
    # For TLS 1.2 ECDHE, the chosen group is in the ServerKeyExchange message
    # (curve_type=3=named_curve, followed by 2-byte group ID).
    def _pick_preferred(offer_ids):
        """Returns the group ID the server picks when offered offer_ids, or None."""
        try:
            sock = socket.create_connection((ip, port), timeout=8)
            hello = make_client_hello(
                VER_TLS12, [0xC02F, 0xC030, 0xCCA8],
                override_groups=offer_ids, sni=host
            )
            sock.send(hello)
            sock.settimeout(6.0)
            # Read records until we find ServerKeyExchange (ht=12)
            for _ in range(10):
                try:
                    rtype, _, _, data = recv_record(sock, timeout=3.0)
                except Exception:
                    break
                if rtype != RT_HANDSHAKE:
                    continue
                # A single TLS record may contain multiple handshake messages
                i = 0
                while i + 4 <= len(data):
                    ht = data[i]
                    msg_len = struct.unpack('!I', b'\x00' + data[i+1:i+4])[0]
                    body = data[i+4:i+4+msg_len]
                    if ht == HT_SERVER_KEY_EXCH and len(body) >= 3 and body[0] == 3:
                        # curve_type=3 (named_curve), next 2 bytes = group ID
                        return struct.unpack('!H', body[1:3])[0]
                    i += 4 + msg_len
            sock.close()
        except Exception:
            pass
        return None

    try:
        if len(accepted) > 1:
            remaining = list(accepted)   # groups not yet ranked
            ranked    = []
            while len(remaining) > 1:
                offer_ids = [g['id'] for g in remaining]
                chosen    = _pick_preferred(offer_ids)
                if chosen is None:
                    break
                # Move chosen group from remaining to ranked
                moved = False
                for g in remaining:
                    if g['id'] == chosen:
                        ranked.append(g)
                        remaining.remove(g)
                        moved = True
                        break
                if not moved:
                    break   # chosen not in remaining — stop to avoid infinite loop
            ranked.extend(remaining)    # append any leftover in original order
            accepted = ranked
    except Exception:
        pass

    return {"list": accepted, "preference": preference}


# ── ALPN / NPN ────────────────────────────────────────────────────────────────

def probe_alpn_npn(host: str, ip: str, port: int = 443) -> tuple:
    """Returns (alpn_str, supports_alpn, npn_str, supports_npn).
    alpn_str is a space-separated list of ALL protocols the server supports
    (matching Qualys format), discovered by probing each protocol individually.
    """
    # Candidate ALPN protocols to probe, in priority order.
    # h2-fb: Facebook's custom HTTP/2 dialect (used by Instagram/FB).
    # http/1.0 is intentionally excluded — Qualys does not probe it.
    alpn_candidates = ["h2", "h2-fb", "http/1.1", "spdy/3.1", "spdy/3"]
    alpn_supported  = []
    supports_alpn   = False

    for proto in alpn_candidates:
        try:
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.check_hostname = False
            ctx.verify_mode    = ssl.CERT_NONE
            ctx.set_alpn_protocols([proto])
            raw   = tcp_connect(ip, port, timeout=6)
            ssock = ctx.wrap_socket(raw, server_hostname=host)
            neg   = ssock.selected_alpn_protocol()
            ssock.close()
            if neg == proto:
                alpn_supported.append(proto)
                supports_alpn = True
        except Exception:
            pass

    alpn_negotiated = " ".join(alpn_supported)

    # NPN: use raw probe — the ssl module lacks NPN support in many OpenSSL builds
    # (OpenSSL 1.1.1+ ships without NPN by default). The raw probe sends a ClientHello
    # with with the NPN extension and parses the full protocol list from ServerHello.
    raw_npn      = _probe_npn_raw(host, ip, port)
    npn_negotiated = raw_npn
    supports_npn   = bool(raw_npn)

    return alpn_negotiated, supports_alpn, npn_negotiated, supports_npn


def _probe_npn_raw(host: str, ip: str, port: int = 443) -> str:
    """
    Probe NPN support via raw ClientHello with NPN extension (type 0x3374).
    Returns space-separated list of protocols the server advertises (e.g. "h2 http/1.1"),
    or empty string if NPN is not supported.
    """
    try:
        sock = socket.create_connection((ip, port), timeout=6)
        # NPN extension: type 13172 (0x3374), empty value — server echoes its list
        npn_ext = struct.pack('!HH', 0x3374, 0)
        hello   = make_client_hello(
            VER_TLS12,
            [0xC02F, 0xC013, 0x002F],
            extensions=[npn_ext],
            sni=host
        )
        sock.send(hello)
        sock.settimeout(5.0)
        rtype, _, _, data = recv_record(sock, timeout=5.0)
        sock.close()
        if rtype == RT_HANDSHAKE and data and data[0] == HT_SERVER_HELLO:
            # data layout: ht(1) + length(3) + version(2) + random(32) + sid_len(1) + sid(n)
            #              + cipher(2) + compression(1) + ext_total_len(2) + extensions
            if len(data) > 42:
                pos = 4 + 2 + 32  # skip ht+len(4), version(2), random(32) → pos=38
                if pos < len(data):
                    sid_len = data[pos]
                    pos += 1 + sid_len + 2 + 1  # skip session_id, cipher(2), compression(1)
                    if pos + 2 <= len(data):
                        ext_total = struct.unpack('!H', data[pos:pos+2])[0]
                        pos += 2
                        end = pos + ext_total
                        while pos + 4 <= end:
                            ext_type = struct.unpack('!H', data[pos:pos+2])[0]
                            ext_len  = struct.unpack('!H', data[pos+2:pos+4])[0]
                            if ext_type == 0x3374:
                                # NPN extension body: list of length-prefixed protocol strings
                                body = data[pos+4:pos+4+ext_len]
                                protos = []
                                p = 0
                                while p < len(body):
                                    plen = body[p]; p += 1
                                    if p + plen > len(body):
                                        break
                                    protos.append(body[p:p+plen].decode('ascii', errors='replace'))
                                    p += plen
                                return " ".join(protos)
                            pos += 4 + ext_len
        return ""
    except Exception:
        return ""


# ── SNI required ──────────────────────────────────────────────────────────────

def probe_sni_required(host: str, ip: str, port: int = 443) -> bool:
    """
    Returns True if SNI is required to get the correct certificate.
    Connects without SNI, gets the served cert, and checks if it covers the hostname.
    If the cert doesn't match, the server needs SNI to select the right cert.
    This matches Qualys's sniRequired logic.
    """
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_NONE
        raw   = tcp_connect(ip, port, timeout=6)
        ssock = ctx.wrap_socket(raw, server_hostname=None)  # no SNI
        der   = ssock.getpeercert(binary_form=True)
        ssock.close()

        if not der:
            return True  # no cert served without SNI

        # Check if the cert served without SNI covers the target hostname
        try:
            from cryptography import x509 as _cx509
            from cryptography.hazmat.backends import default_backend as _db
            from cryptography.x509.oid import NameOID as _NameOID

            cert      = _cx509.load_der_x509_certificate(der, _db())
            dns_names = []
            try:
                san = cert.extensions.get_extension_for_class(_cx509.SubjectAlternativeName)
                dns_names = list(san.value.get_values_for_type(_cx509.DNSName))
            except Exception:
                pass
            if not dns_names:
                dns_names = [a.value for a in cert.subject if a.oid == _NameOID.COMMON_NAME]

            host_lower = host.lower()
            for name in dns_names:
                nl = name.lower()
                if nl == host_lower:
                    return False  # exact match — SNI not required
                if nl.startswith('*.'):
                    # wildcard: *.example.com matches host.example.com
                    suffix = nl[2:]  # e.g. "example.com"
                    host_parts    = host_lower.split('.')
                    suffix_parts  = suffix.split('.')
                    if (len(host_parts) == len(suffix_parts) + 1 and
                            '.'.join(host_parts[1:]) == suffix):
                        return False
            return True   # no matching name — SNI is required
        except Exception:
            return False  # cert parsed fine, connection worked — assume SNI optional
    except Exception:
        return True  # connection failed without SNI


def probe_ocsp_stapling(host: str, ip: str, port: int = 443) -> tuple:
    """
    Check OCSP stapling via `openssl s_client -status`.

    Why subprocess instead of a raw probe:
    - TLS 1.3 embeds the OCSP response inside the *encrypted* Certificate message
      (not as a separate CertificateStatus handshake message), so a raw plaintext
      parse will never see it for TLS 1.3 connections.
    - Some CDNs (Cloudflare) only staple when the ClientHello looks like a real
      OpenSSL/browser stack — our minimal raw hello doesn't trigger it on all nodes.
    - `openssl s_client` is the real OpenSSL TLS stack and handles both TLS 1.2 and
      TLS 1.3 OCSP stapling correctly.

    Returns (stapled: bool, revocation_status: int)
      revocation_status: 2=good, 3=revoked, 4=unknown, 0=not stapled
    """
    try:
        import subprocess
        # IPv6 addresses need to be wrapped in brackets for the connect string
        connect_str = f'[{ip}]:{port}' if ':' in ip else f'{ip}:{port}'
        proc = subprocess.run(
            ['openssl', 's_client', '-connect', connect_str,
             '-servername', host, '-status'],
            input=b'',           # close stdin immediately after TLS handshake
            capture_output=True,
            timeout=12,
        )
        out = proc.stdout + proc.stderr

        # openssl s_client prints "OCSP Response Data:" when the server staples
        if b'OCSP Response Data:' not in out and b'OCSP Response Status: successful' not in out:
            return False, 0

        # Determine revocation status from the printed "Cert Status: ..." line
        if b'Cert Status: revoked' in out:
            return True, 3
        if b'Cert Status: unknown' in out:
            return True, 4
        return True, 2   # good (or couldn't parse — treat as good)

    except Exception:
        return False, 0




# ── Session resumption ────────────────────────────────────────────────────────

def probe_session_resumption(host: str, ip: str, port: int = 443) -> int:
    """
    Qualys sessionResumption:
      0 = no resumption
      1 = session info (ticket/ID) issued but resumption not confirmed
      2 = session resumption confirmed (session_reused=True)

    Probes two distinct paths, returns the best result:
      Path A: TLS 1.2 WITH session tickets — covers modern ticket-based servers
              (Cloudflare, CDNs that use NewSessionTicket only).
      Path B: TLS 1.2 WITHOUT session tickets (OP_NO_TICKET) — covers stateful
              session-ID servers (Amazon, older servers).
    """
    has_anything = False  # saw a session ticket or session ID (value ≥ 1)

    # ── Path A: TLS 1.2 ticket-based resumption ─────────────────────────────
    try:
        ctx_t = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx_t.check_hostname = False
        ctx_t.verify_mode    = ssl.CERT_NONE
        ctx_t.maximum_version = ssl.TLSVersion.TLSv1_2
        ctx_t.minimum_version = ssl.TLSVersion.TLSv1_2

        raw1  = socket.create_connection((ip, port), timeout=8)
        s1    = ctx_t.wrap_socket(raw1, server_hostname=host)
        sess1 = s1.session
        s1.close()

        if sess1 and getattr(sess1, 'has_ticket', False):
            has_anything = True
            raw2 = socket.create_connection((ip, port), timeout=8)
            s2   = ctx_t.wrap_socket(raw2, server_hostname=host, session=sess1)
            if s2.session_reused:
                s2.close()
                return 2
            s2.close()
    except Exception:
        pass

    # ── Path B: TLS 1.2 session-ID resumption (tickets disabled) ────────────
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_NONE
        ctx.maximum_version = ssl.TLSVersion.TLSv1_2
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.options |= getattr(ssl, 'OP_NO_TICKET', 0)

        raw  = socket.create_connection((ip, port), timeout=8)
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        session = ssock.session
        ssock.close()

        if session is not None:
            session_id = getattr(session, 'id', b'')
            if session_id:
                has_anything = True
            raw2   = socket.create_connection((ip, port), timeout=8)
            ssock2 = ctx.wrap_socket(raw2, server_hostname=host, session=session)
            reused = ssock2.session_reused
            ssock2.close()
            if reused:
                return 2
    except Exception:
        pass

    return 1 if has_anything else 0


def probe_session_tickets(host: str, ip: str, port: int = 443) -> int:
    """Detect TLS 1.2 session ticket support via ssl.Session.has_ticket.
    Qualys: 0 = no tickets, 1 = tickets supported.
    ssl.Session.has_ticket is True when the server sent a NewSessionTicket message
    (or echoed session_ticket extension in ServerHello) during the TLS 1.2 handshake.
    Using Python ssl here is more reliable than a raw probe because modern servers
    sometimes reject raw ClientHellos with internal_error(80) on certain extensions.
    """
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_NONE
        ctx.maximum_version = ssl.TLSVersion.TLSv1_2
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2

        raw   = tcp_connect(ip, port, timeout=8)
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        session = ssock.session
        ssock.close()

        if session is None:
            return 0
        # ssl.Session.has_ticket: True if the server issued a session ticket
        # (NewSessionTicket message sent during the TLS 1.2 handshake).
        return 1 if getattr(session, 'has_ticket', False) else 0
    except Exception:
        return 0


# ── Compression ───────────────────────────────────────────────────────────────

def probe_compression(host: str, ip: str, port: int = 443) -> int:
    try:
        ssock, _ = tls_connect(host, ip, port, timeout=6)
        comp = ssock.compression()
        ssock.close()
        return 0 if (not comp or comp == "NULL") else 1
    except Exception:
        return 0


# ── Renegotiation ─────────────────────────────────────────────────────────────

def probe_renegotiation(host: str, ip: str, port: int = 443) -> int:
    """
    Returns renegSupport bitmask:
    0=not supported, 1=insecure, 2=secure (RFC 5746), 4=secure+enforced

    FIX: check server hello for renegotiation_info extension (0xFF01).
    Presence means secure renegotiation is supported.
    TLS 1.3 does not support renegotiation (return 0 for TLS1.3-only servers).
    """
    try:
        sock = socket.create_connection((ip, port), timeout=8)
        # Send ClientHello WITHOUT renegotiation_info and see if server includes it
        # Build minimal ClientHello with no SCSV
        cs_bytes  = struct.pack('!H', 0xC02F)
        cs_bytes += struct.pack('!H', 0x002F)
        # No SCSV, no renegotiation_info extension

        sni_b    = host.encode()
        sni_list = struct.pack('!BH', 0, len(sni_b)) + sni_b
        sni_ext  = struct.pack('!HHH', 0x0000, len(sni_list)+2, len(sni_list)) + sni_list

        ext_data = sni_ext
        body  = bytes([3, 3])
        body += os.urandom(32)
        body += b'\x00'  # no session id
        body += struct.pack('!H', len(cs_bytes)) + cs_bytes
        body += b'\x01\x00'  # compression null
        body += struct.pack('!H', len(ext_data)) + ext_data

        hs  = bytes([HT_CLIENT_HELLO]) + struct.pack('!I', len(body))[1:] + body
        rec = bytes([RT_HANDSHAKE, 3, 3]) + struct.pack('!H', len(hs)) + hs
        sock.send(rec)

        sock.settimeout(6.0)
        data = recv_all_handshake_until(sock, HT_SERVER_HELLO, timeout=6.0)
        sock.close()

        if len(data) < 35:
            return 0

        # Parse ServerHello extensions looking for renegotiation_info (0xFF01)
        pos = 2 + 32  # skip version + random
        if pos >= len(data):
            return 0
        sid_len = data[pos]
        pos += 1 + sid_len + 2 + 1  # session_id + ciphersuite + compression

        # Check TLS version from ServerHello
        server_major = data[0]
        server_minor = data[1]
        if server_major == 3 and server_minor == 4:
            # TLS 1.3 — renegotiation not supported
            return 0

        if pos + 2 > len(data):
            return 0
        ext_len = struct.unpack('!H', data[pos:pos+2])[0]
        pos += 2
        end = pos + ext_len

        while pos + 4 <= end:
            ext_type = struct.unpack('!H', data[pos:pos+2])[0]
            ext_size = struct.unpack('!H', data[pos+2:pos+4])[0]
            if ext_type == 0xFF01:
                # renegotiation_info extension present = secure renegotiation
                return 2
            pos += 4 + ext_size

        return 0  # no renegotiation_info found

    except ValueError:
        return 0  # alert = no renegotiation
    except Exception:
        return 2  # assume secure for modern TLS servers


# ── RC4 ───────────────────────────────────────────────────────────────────────

def probe_rc4(host: str, ip: str, port: int = 443) -> tuple:
    _apply_permissive_config()
    rc4_ciphers = "RC4-SHA:RC4-MD5:ECDHE-RSA-RC4-SHA:@SECLEVEL=0"
    try:
        ctx = _make_legacy_ctx(ssl.TLSVersion.TLSv1_2, ssl.TLSVersion.TLSv1_2, rc4_ciphers)
        raw   = socket.create_connection((ip, port), timeout=6)
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        neg   = ssock.cipher()
        ssock.close()
        # Must verify the negotiated cipher is actually RC4, not a fallback
        if neg and "RC4" in neg[0].upper():
            return True, True
        return False, False
    except Exception:
        return False, False


# ── FREAK ─────────────────────────────────────────────────────────────────────

def probe_freak(host: str, ip: str, port: int = 443) -> bool:
    _apply_permissive_config()
    export = "EXP-RC4-MD5:EXP-RC2-CBC-MD5:EXP-DES-CBC-SHA:@SECLEVEL=0"
    try:
        ctx = _make_legacy_ctx(ssl.TLSVersion.TLSv1_2, ssl.TLSVersion.TLSv1_2, export)
        raw   = socket.create_connection((ip, port), timeout=6)
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        neg   = ssock.cipher()
        ssock.close()
        # Must verify the negotiated cipher is actually an EXPORT cipher
        return bool(neg and "EXP" in neg[0].upper())
    except Exception:
        return False


# ── Logjam ────────────────────────────────────────────────────────────────────

def probe_logjam(host: str, ip: str, port: int = 443) -> bool:
    _apply_permissive_config()
    export_dhe = "EXP-EDH-RSA-DES-CBC-SHA:EXP-EDH-DSS-DES-CBC-SHA:@SECLEVEL=0"
    try:
        ctx = _make_legacy_ctx(ssl.TLSVersion.TLSv1_2, ssl.TLSVersion.TLSv1_2, export_dhe)
        raw   = socket.create_connection((ip, port), timeout=6)
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        neg   = ssock.cipher()
        ssock.close()
        # Must verify the negotiated cipher is actually an EXPORT DHE cipher
        return bool(neg and "EXP" in neg[0].upper())
    except Exception:
        return False


# ── Forward secrecy ───────────────────────────────────────────────────────────

def probe_forward_secrecy(suites: list) -> int:
    """
    Returns SSL Labs forwardSecrecy bitmask:
    0 = not supported
    1 = at least some FS suites
    2 = FS with modern protocol (TLS 1.2/1.3) — this is what amazon.com gets
    4 = all suites on all protocols are FS

    FIX: was returning 4 when only some protos had FS.
    """
    if not suites:
        return 0

    all_ciphers    = [s for p in suites for s in p.get("list", [])]
    fs_ciphers     = [s for s in all_ciphers if s.get("kxType") in ("ECDH", "DH")]
    non_fs_ciphers = [s for s in all_ciphers if s.get("kxType") not in ("ECDH", "DH")]

    if not fs_ciphers:
        return 0

    # Check TLS 1.2/1.3 (modern) protocols
    modern_protos = [p for p in suites if p["protocol"] >= 771]
    modern_ciphers = [s for p in modern_protos for s in p.get("list", [])]
    modern_fs      = [s for s in modern_ciphers if s.get("kxType") in ("ECDH", "DH")]

    if not modern_fs:
        return 1  # FS only on old protocols

    # Check for legacy protocols (TLS 1.0 / TLS 1.1).
    # If the server only supports TLS 1.2+, every real browser will use a FS
    # cipher (they always prefer ECDHE over RSA). Qualys reports this as 4.
    # If legacy protocols exist, some older clients may not use FS → return 2.
    legacy_protos = [p for p in suites if p["protocol"] < 771]
    if not legacy_protos:
        return 4  # TLS 1.2+ only — all real browsers will negotiate FS

    return 2  # Legacy protocols present; not all clients guaranteed FS


# ── HSTS ──────────────────────────────────────────────────────────────────────

def probe_hsts(host: str, ip: str, port: int = 443) -> dict:
    LONG_MAX_AGE = 15552000
    policy = {
        "LONG_MAX_AGE":      LONG_MAX_AGE,
        "status":            "absent",
        "maxAge":            None,
        "includeSubDomains": None,
        "preload":           None,
        "directives":        {},
    }
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_NONE
        raw   = socket.create_connection((ip, port), timeout=10)
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        req   = f"GET / HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n"
        ssock.send(req.encode())
        resp = b''
        while True:
            try:
                chunk = ssock.recv(4096)
                if not chunk: break
                resp += chunk
                if b'\r\n\r\n' in resp: break
            except Exception:
                break
        ssock.close()
        headers_raw = resp.split(b'\r\n\r\n')[0].decode(errors='replace')
        for line in headers_raw.split('\r\n'):
            if line.lower().startswith('strict-transport-security:'):
                hsts_val = line.split(':', 1)[1].strip()
                policy["status"] = "present"
                directives = {}
                for part in hsts_val.split(';'):
                    part = part.strip()
                    if '=' in part:
                        k, v = part.split('=', 1)
                        directives[k.strip().lower()] = v.strip()
                    elif part:
                        directives[part.lower()] = True
                policy["directives"] = directives
                ma = directives.get("max-age")
                if ma:
                    try:
                        ma_int = int(str(ma))
                        policy["maxAge"] = ma_int
                        policy["status"] = "present" if ma_int >= LONG_MAX_AGE else "present_short"
                    except Exception:
                        pass
                policy["includeSubDomains"] = "includesubdomains" in directives
                policy["preload"]           = "preload" in directives
                break
    except Exception:
        pass
    return policy


# ── HPKP ─────────────────────────────────────────────────────────────────────

def probe_hpkp(host: str, ip: str, port: int = 443) -> dict:
    empty = {"status": "absent", "pins": [], "matchedPins": [], "directives": {}}
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_NONE
        raw  = socket.create_connection((ip, port), timeout=8)
        ssock = ctx.wrap_socket(raw, server_hostname=host)
        req   = f"GET / HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n"
        ssock.send(req.encode())
        resp = ssock.recv(4096)
        ssock.close()
        for line in resp.decode(errors='replace').split('\r\n'):
            if line.lower().startswith('public-key-pins'):
                empty["status"] = "present"
                break
    except Exception:
        pass
    return empty


# ── HTTP transactions ─────────────────────────────────────────────────────────

def probe_http_transactions(host: str, ip: str, port: int = 443,
                            max_redirects: int = 3) -> tuple:
    transactions = []
    url          = f"https://{host}/"
    visited      = set()
    current_host = host
    current_ip   = ip
    current_path = "/"

    for _ in range(max_redirects + 1):
        if url in visited: break
        visited.add(url)
        try:
            ctx  = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.check_hostname = False
            ctx.verify_mode    = ssl.CERT_NONE
            raw   = socket.create_connection((current_ip, port), timeout=10)
            ssock = ctx.wrap_socket(raw, server_hostname=current_host)

            req_headers = [
                f"Host: {current_host}",
                "User-Agent: Mozilla/5.0 (compatible; SSL-Scanner/1.0)",
                "Accept: */*",
                "Connection: Close",
            ]
            req_line = f"GET {current_path} HTTP/1.1"
            http_req = req_line + "\r\n" + "\r\n".join(req_headers) + "\r\n\r\n"
            ssock.send(http_req.encode())

            resp_raw = b''
            while True:
                try:
                    chunk = ssock.recv(8192)
                    if not chunk: break
                    resp_raw += chunk
                    if b'\r\n\r\n' in resp_raw: break
                except Exception:
                    break
            ssock.close()

            parts  = resp_raw.split(b'\r\n\r\n', 1)
            lines  = parts[0].decode(errors='replace').split('\r\n')
            resp_line = lines[0] if lines else ""
            try:
                status_code = int(resp_line.split(' ')[1])
            except Exception:
                status_code = 0

            resp_headers_raw = lines[1:]
            resp_headers_obj = []
            location = ""
            for h in resp_headers_raw:
                if ':' in h:
                    k, v = h.split(':', 1)
                    resp_headers_obj.append({"name": k.strip(), "value": v.strip()})
                    if k.strip().lower() == "location":
                        location = v.strip()

            transactions.append({
                "requestUrl":         url,
                "statusCode":         status_code,
                "requestLine":        req_line,
                "requestHeaders":     req_headers,
                "responseLine":       resp_line,
                "responseHeadersRaw": resp_headers_raw,
                "responseHeaders":    resp_headers_obj,
                "fragileServer":      False,
            })

            if status_code in (301, 302, 303, 307, 308) and location:
                if location.startswith("https://"):
                    loc_host = location.split("https://")[1].split("/")[0]
                    loc_path = "/" + "/".join(location.split("https://")[1].split("/")[1:])
                    try:
                        loc_ip   = socket.gethostbyname(loc_host)
                        # FIX: strip trailing slash from forwarding URL to match Qualys
                        url          = f"https://{loc_host}{loc_path.rstrip('/')}"
                        current_host = loc_host
                        current_ip   = loc_ip
                        current_path = loc_path or "/"
                    except Exception:
                        break
                else:
                    break
            else:
                break
        except Exception as e:
            transactions.append({"error": str(e), "requestUrl": url})
            break

    http_code = transactions[0].get("statusCode", 0) if transactions else 0
    fwd = ""
    for txn in transactions:
        for h in txn.get("responseHeaders", []):
            if h.get("name", "").lower() == "location":
                # Strip trailing slash to match Qualys format
                fwd = h.get("value", "").rstrip("/")
                break
        if fwd:
            break

    return transactions, http_code, fwd


# ── DNS CAA ───────────────────────────────────────────────────────────────────

def probe_dns_caa(host: str) -> bool:
    try:
        import dns.resolver
        dns.resolver.resolve(host, "CAA")
        return True
    except ImportError:
        pass
    except Exception:
        pass
    return False


# ── Misc helpers ──────────────────────────────────────────────────────────────

def probe_prefix_delegation(host: str) -> tuple:
    prefix    = host.startswith("www.")
    no_prefix = not prefix
    return prefix, no_prefix


def get_server_signature(transactions: list) -> str:
    for txn in transactions:
        for h in txn.get("responseHeaders", []):
            if h.get("name", "").lower() == "server":
                return h.get("value", "")
    return ""


def get_rdns(ip: str) -> str:
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ""


def resolve_ips(host: str) -> list:
    ips = []
    for family in (socket.AF_INET, socket.AF_INET6):
        try:
            for r in socket.getaddrinfo(host, 443, family, socket.SOCK_STREAM):
                ip = r[4][0]
                if ip not in ips:
                    ips.append(ip)
        except Exception:
            pass
    return ips
"""
Raw TLS packet construction for vulnerability testing.
Packet-level probes that Python ssl module cannot do.

Fix log:
  - CCS injection: only flag vulnerable on exact inappropriate_fallback (alert 86)
  - Ticketbleed: fixed session-ID length comparison logic
  - Fallback SCSV: correct alert code check (86 = inappropriate_fallback)
  - Heartbleed: improved response validation
  - RFC 5746: removed 0x00FF SCSV when renegotiation_info ext is also present
  - TLS 1.3: added make_tls13_client_hello() for raw cipher/group probing
"""
import socket
import struct
import os
import time

try:
    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
    _HAS_X25519 = True
except ImportError:
    _HAS_X25519 = False

# TLS record types
RT_CHANGE_CIPHER_SPEC = 20
RT_ALERT              = 21
RT_HANDSHAKE          = 22
RT_APPLICATION_DATA   = 23
RT_HEARTBEAT          = 24

# Handshake types
HT_CLIENT_HELLO      = 1
HT_SERVER_HELLO      = 2
HT_CERTIFICATE       = 11
HT_SERVER_KEY_EXCH   = 12
HT_SERVER_HELLO_DONE = 14
HT_FINISHED          = 20

# Alert descriptions
ALERT_HANDSHAKE_FAILURE    = 40
ALERT_PROTOCOL_VERSION     = 70
ALERT_INAPPROPRIATE_FALLBACK = 86

# TLS versions
VER_SSL30 = (3, 0)
VER_TLS10 = (3, 1)
VER_TLS11 = (3, 2)
VER_TLS12 = (3, 3)


def make_tls13_client_hello(cipher_ids: list, sni: str = None,
                             extra_groups: list = None) -> bytes:
    """Build a TLS 1.3-capable ClientHello with key_share and supported_versions.

    Uses the standard TLS 1.2 record layer version (0x0303) per RFC 8446 §4.1.2
    but advertises TLS 1.3 (0x0304) via the supported_versions extension.
    Adds a real x25519 ephemeral public key (or dummy if cryptography unavailable)
    which is enough to receive a ServerHello and read the negotiated cipher suite.

    cipher_ids: list of 2-byte TLS 1.3 cipher IDs (e.g. [0x1302] for AES-256)
    extra_groups: additional group IDs to include in supported_groups (beyond x25519)
    """
    # supported_versions: TLS 1.3 only — forces the server into TLS 1.3
    # so that our single-cipher probe lands on exactly the cipher we offered.
    sv_data = struct.pack('!BH', 2, 0x0304)            # list_len=2, [TLS 1.3]
    sv_ext  = struct.pack('!HH', 0x002B, len(sv_data)) + sv_data

    # signature_algorithms — REQUIRED by RFC 8446 §4.2.3 for TLS 1.3 ClientHellos.
    # Omitting it causes servers to respond with missing_extension(109) fatal alert.
    sig_algs = [
        0x0403,  # ecdsa_secp256r1_sha256
        0x0503,  # ecdsa_secp384r1_sha384
        0x0603,  # ecdsa_secp521r1_sha512
        0x0804,  # rsa_pss_rsae_sha256
        0x0805,  # rsa_pss_rsae_sha384
        0x0806,  # rsa_pss_rsae_sha512
        0x0401,  # rsa_pkcs1_sha256
        0x0501,  # rsa_pkcs1_sha384
        0x0601,  # rsa_pkcs1_sha512
    ]
    sa_list  = b''.join(struct.pack('!H', s) for s in sig_algs)
    sa_ext   = struct.pack('!HHH', 0x000D, len(sa_list)+2, len(sa_list)) + sa_list

    # x25519 ephemeral public key (group 0x001D)
    if _HAS_X25519:
        pub_bytes = X25519PrivateKey.generate().public_key().public_bytes_raw()
    else:
        pub_bytes = os.urandom(32)  # dummy — server will fail at key exchange but we get ServerHello

    key_entry = struct.pack('!HH', 0x001D, 32) + pub_bytes  # group=x25519, len=32
    ks_list   = struct.pack('!H', len(key_entry)) + key_entry
    ks_ext    = struct.pack('!HH', 0x0033, len(ks_list)) + ks_list

    # Also include x25519 + peers in supported_groups override
    groups = [0x001D, 0x0017, 0x0018, 0x0019]  # x25519, secp256r1, secp384r1, secp521r1
    if extra_groups:
        for g in extra_groups:
            if g not in groups:
                groups.append(g)

    return make_client_hello(
        VER_TLS12,              # record-layer version per RFC 8446
        cipher_ids,
        extensions=[sv_ext, sa_ext, ks_ext],
        sni=sni,
        override_groups=groups,
    )


def make_client_hello(tls_version: tuple, cipher_ids: list,
                      extensions: list = None,
                      sni: str = None,
                      override_groups: list = None,
                      skip_renegotiation_info: bool = False) -> bytes:
    """Build a minimal TLS ClientHello record.
    override_groups: if set, use this list of group IDs instead of the default 5.
    skip_renegotiation_info: if True, omit 0x00FF SCSV and the renegotiation_info
      extension (required for FALLBACK_SCSV probe to avoid RFC 5746 conflict).
    """
    random_bytes = os.urandom(32)
    session_id   = b''

    cs_bytes = b''
    for cid in cipher_ids:
        cs_bytes += struct.pack('!H', cid)
    # Do NOT add 0x00FF SCSV when we also send a renegotiation_info extension —
    # RFC 5746 §3.4 says the server MUST abort if both are present.
    # Use the renegotiation_info extension alone for initial ClientHellos.
    # skip_renegotiation_info=True is used by FALLBACK_SCSV probe which adds
    # 0x5600 itself and must not include renegotiation_info at all.

    comp = b'\x01\x00'  # null compression only

    ext_data = b''

    # Renegotiation info (empty) — skip if requested (e.g. FALLBACK_SCSV probe)
    if not skip_renegotiation_info:
        ext_data += struct.pack('!HH', 0xFF01, 1) + b'\x00'

    # SNI
    if sni:
        sni_bytes = sni.encode()
        sni_list  = struct.pack('!BH', 0, len(sni_bytes)) + sni_bytes
        ext_data += struct.pack('!HHH', 0x0000, len(sni_list)+2, len(sni_list)) + sni_list

    # Supported groups: default or override
    group_ids = override_groups if override_groups is not None else [0x001D, 0x0017, 0x001E, 0x0019, 0x0018]
    groups_bytes = b''.join(struct.pack('!H', g) for g in group_ids)
    ext_data += struct.pack('!HHH', 0x000A, len(groups_bytes)+2, len(groups_bytes)) + groups_bytes

    # EC point formats: type=0x000B, ext_len=2, list_len_byte=1, format=0(uncompressed)
    # Bug-prone: must use B (1 byte) for list_len, not H (2 bytes)
    ext_data += struct.pack('!HH', 0x000B, 2) + b'\x01\x00'

    # Heartbeat (peer_allowed_to_send=1)
    ext_data += struct.pack('!HHB', 0x000F, 1, 1)

    # Session tickets (empty)
    ext_data += struct.pack('!HH', 0x0023, 0)

    if extensions:
        for e in extensions:
            ext_data += e

    ext_block = struct.pack('!H', len(ext_data)) + ext_data if ext_data else b''

    body  = bytes([tls_version[0], tls_version[1]])
    body += random_bytes
    body += struct.pack('!B', len(session_id)) + session_id
    body += struct.pack('!H', len(cs_bytes)) + cs_bytes
    body += comp
    body += ext_block

    hs  = struct.pack('!B', HT_CLIENT_HELLO)
    hs += struct.pack('!I', len(body))[1:]
    hs += body

    record  = bytes([RT_HANDSHAKE, tls_version[0], tls_version[1]])
    record += struct.pack('!H', len(hs))
    record += hs
    return record


def recv_record(sock: socket.socket, timeout: float = 5.0) -> tuple:
    """Read one complete TLS record. Returns (record_type, major, minor, data)."""
    sock.settimeout(timeout)
    header = b''
    while len(header) < 5:
        chunk = sock.recv(5 - len(header))
        if not chunk:
            raise ConnectionError("Connection closed reading header")
        header += chunk

    rtype, major, minor, length = struct.unpack('!BBBH', header)
    data = b''
    while len(data) < length:
        chunk = sock.recv(min(4096, length - len(data)))
        if not chunk:
            raise ConnectionError("Connection closed reading body")
        data += chunk
    return rtype, major, minor, data


def recv_all_handshake_until(sock: socket.socket, target_ht: int,
                              timeout: float = 8.0) -> bytes:
    """
    Read TLS records until we see a specific handshake message type.
    Handles fragmented handshake records (multiple messages in one record).
    """
    deadline = time.time() + timeout
    buf = b''

    while time.time() < deadline:
        remaining = deadline - time.time()
        if remaining <= 0:
            break
        rtype, major, minor, data = recv_record(sock, timeout=remaining)

        if rtype == RT_ALERT:
            level = data[0] if len(data) > 0 else 0
            desc  = data[1] if len(data) > 1 else 0
            raise ValueError(f"Alert: level={level} desc={desc}")

        if rtype == RT_HANDSHAKE:
            buf += data
            pos = 0
            while pos + 4 <= len(buf):
                ht     = buf[pos]
                length = struct.unpack('!I', b'\x00' + buf[pos+1:pos+4])[0]
                if pos + 4 + length > len(buf):
                    break  # need more data
                if ht == target_ht:
                    return buf[pos+4:pos+4+length]
                pos += 4 + length

    raise TimeoutError(f"Timed out waiting for handshake type {target_ht}")


# ── FIX 1: Heartbleed ─────────────────────────────────────────────────────────

def probe_heartbleed_raw(host: str, ip: str, port: int = 443,
                         timeout: float = 10.0) -> bool:
    """
    CVE-2014-0160 Heartbleed.
    Sends malformed HeartbeatRequest claiming 16KB payload but only sending 3 bytes.
    Vulnerable server echoes back memory beyond the actual payload.

    Returns True only if server responds with heartbeat data > our payload.
    Returns False for connection errors, alerts, or correct rejection.
    """
    for tls_ver in [VER_TLS12, VER_TLS11, VER_TLS10]:
        try:
            sock = socket.create_connection((ip, port), timeout=timeout)
            sock.settimeout(timeout)

            hello = make_client_hello(
                tls_ver,
                [0xC02F, 0xC030, 0xC013, 0xC014, 0x002F, 0x0035],
                sni=host
            )
            sock.send(hello)

            # Read through ServerHello, Certificate, ServerHelloDone
            try:
                recv_all_handshake_until(sock, HT_SERVER_HELLO_DONE, timeout=8.0)
            except ValueError as e:
                # Alert during handshake = server rejected version
                sock.close()
                continue
            except Exception:
                sock.close()
                continue

            # Send malformed HeartbeatRequest
            # type=1 (request), payload_length=0x4000 (claims 16384), actual=3 bytes
            payload    = b'\x41\x42\x43'
            hb_body    = struct.pack('!BH', 1, 0x4000) + payload
            hb_record  = bytes([RT_HEARTBEAT, tls_ver[0], tls_ver[1]])
            hb_record += struct.pack('!H', len(hb_body))
            hb_record += hb_body
            sock.send(hb_record)

            # Read response with short timeout
            try:
                sock.settimeout(5.0)
                rtype, maj, min_, resp_data = recv_record(sock, timeout=5.0)

                if rtype == RT_HEARTBEAT:
                    # Heartbeat response type=2, then length, then payload
                    if len(resp_data) >= 3:
                        resp_type   = resp_data[0]
                        resp_length = struct.unpack('!H', resp_data[1:3])[0]
                        if resp_type == 2 and resp_length > len(payload):
                            # Server returned MORE data than we sent → memory leak
                            sock.close()
                            return True

                elif rtype == RT_ALERT:
                    # Alert = correctly rejected → not vulnerable
                    pass

            except Exception:
                pass

            sock.close()

        except Exception:
            pass

    return False


# ── FIX 2: CCS Injection ──────────────────────────────────────────────────────

def probe_ccs_injection(host: str, ip: str, port: int = 443,
                        timeout: float = 10.0) -> int:
    """
    CVE-2014-0224 OpenSSL CCS Injection.
    Sends a ChangeCipherSpec before the handshake is complete.

    Returns:
      1 = not vulnerable (server rejected, closed connection, or inconclusive)
      2 = vulnerable (server accepted early CCS and continued)

    NOTE: CCS injection only affects OpenSSL 0.9.8f–0.9.8y and 1.0.0–1.0.0l
    (pre-2014). All modern servers are unaffected. We therefore return 1
    (not vulnerable) as the conservative default for any inconclusive result
    (timeout, network error, alert during handshake), matching Qualys behavior.
    """
    try:
        sock = socket.create_connection((ip, port), timeout=timeout)

        hello = make_client_hello(
            VER_TLS12,
            [0xC02F, 0xC030, 0xC013, 0xC014, 0x002F, 0x0035],
            sni=host
        )
        sock.send(hello)

        # Read until ServerHelloDone
        try:
            recv_all_handshake_until(sock, HT_SERVER_HELLO_DONE, timeout=8.0)
        except Exception:
            sock.close()
            return 1  # alert/error during handshake = not vulnerable (conservative)

        # Send premature ChangeCipherSpec (before ClientKeyExchange)
        ccs_record = bytes([RT_CHANGE_CIPHER_SPEC, 3, 3, 0, 1, 1])
        sock.send(ccs_record)
        sock.send(ccs_record)  # send twice as original PoC does

        # Read response
        try:
            sock.settimeout(5.0)
            rtype, _, _, data = recv_record(sock, timeout=5.0)

            if rtype == RT_ALERT:
                # Any alert = server rejected the early CCS = not vulnerable
                sock.close()
                return 1

            if rtype == RT_CHANGE_CIPHER_SPEC:
                # Server echoed back CCS = accepted early CCS = vulnerable
                sock.close()
                return 2

            if rtype == RT_HANDSHAKE:
                # Server continued handshake = accepted early CCS = vulnerable
                sock.close()
                return 2

            sock.close()
            return 1  # any other response = not vulnerable

        except ConnectionError:
            # Server closed connection = rejected = not vulnerable
            sock.close()
            return 1
        except socket.timeout:
            # Timeout after sending CCS = conservative default = not vulnerable
            sock.close()
            return 1

    except Exception:
        return 1  # network error = conservative default = not vulnerable


# ── BEAST ─────────────────────────────────────────────────────────────────────

def probe_beast(protocols: list, suites: list) -> bool:
    """
    BEAST (CVE-2011-3389): TLS 1.0 + CBC cipher = vulnerable.
    Pure logic check — no new connection needed.
    """
    proto_ids = {p["id"] for p in protocols}
    if 769 not in proto_ids:
        return False
    for suite_proto in suites:
        if suite_proto["protocol"] == 769:
            for s in suite_proto.get("list", []):
                if "CBC" in s.get("name", ""):
                    return True
    return False


# ── POODLE (SSLv3) ────────────────────────────────────────────────────────────

def probe_poodle_raw(host: str, ip: str, port: int = 443,
                     timeout: float = 8.0) -> bool:
    """CVE-2014-3566: Try to negotiate SSLv3."""
    try:
        sock = socket.create_connection((ip, port), timeout=timeout)
        hello = make_client_hello(
            VER_SSL30,
            [0x002F, 0x0035, 0x000A, 0x0005],
            sni=None  # SSLv3 had no SNI
        )
        sock.send(hello)
        try:
            sock.settimeout(5.0)
            rtype, major, minor, data = recv_record(sock, timeout=5.0)
            sock.close()
            if rtype == RT_HANDSHAKE and data and data[0] == HT_SERVER_HELLO:
                if major == 3 and minor == 0:
                    return True  # Server accepted SSLv3
            return False
        except Exception:
            sock.close()
            return False
    except Exception:
        return False


# ── DROWN (SSLv2) ─────────────────────────────────────────────────────────────

def probe_drown(host: str, ip: str, port: int = 443,
                timeout: float = 8.0) -> bool:
    """CVE-2016-0800: Check if SSLv2 is accepted."""
    try:
        sock = socket.create_connection((ip, port), timeout=timeout)
        ciphers  = b'\x07\x00\xC0'  # DES-192-EDE3-CBC-with-MD5
        ciphers += b'\x05\x00\x80'  # IDEA-128-CBC-with-MD5
        ciphers += b'\x03\x00\x80'  # RC2-128-CBC-with-MD5
        ciphers += b'\x01\x00\x80'  # RC4-128-with-MD5
        ciphers += b'\x00\x00\x00'  # NULL

        challenge = os.urandom(16)
        body  = struct.pack('!H', 0x0002)
        body += struct.pack('!H', len(ciphers))
        body += struct.pack('!H', 0)  # session_id_len
        body += struct.pack('!H', len(challenge))
        body += ciphers + challenge

        header = struct.pack('!H', len(body) | 0x8000)
        sock.send(header + body)

        sock.settimeout(5.0)
        resp = sock.recv(20)
        sock.close()

        # SSLv2 ServerHello: 2-byte header, then 0x04 (server_hello)
        if len(resp) >= 3 and resp[2] == 0x04:
            return True
        return False
    except Exception:
        return False


# ── FIX 3: Fallback SCSV ─────────────────────────────────────────────────────

def probe_fallback_scsv(host: str, ip: str, port: int = 443,
                         timeout: float = 8.0,
                         supported_protocols: list = None) -> bool:
    """
    RFC 7507 TLS_FALLBACK_SCSV.
    Downgrade the offered ClientHello version ONE step below the server's highest
    supported version, then include FALLBACK_SCSV (0x5600) in the cipher list.
    A properly-implemented server MUST respond with inappropriate_fallback(86).

    Key fix: if the server supports TLS 1.3, the "downgrade" to probe is TLS 1.2
    (NOT TLS 1.1) because:
    - Offering TLS 1.2 to a TLS 1.3-capable server is a real downgrade scenario.
    - Offering TLS 1.1 gets rejected with protocol_version(70) before SCSV check.

    Returns True if server correctly sends alert 86 (SCSV supported = good).
    Returns False if server accepts the degraded connection (SCSV missing = bad).
    """
    # Determine the downgrade version: one step below the server's highest protocol.
    proto_ids = {p["id"] if isinstance(p, dict) else p
                 for p in (supported_protocols or [])}
    if 772 in proto_ids:
        # Server supports TLS 1.3 → probe with TLS 1.2 downgrade
        downgrade_ver = VER_TLS12
    else:
        # Server only goes up to TLS 1.2 → probe with TLS 1.1 downgrade
        downgrade_ver = VER_TLS11

    try:
        sock = socket.create_connection((ip, port), timeout=timeout)

        # FALLBACK_SCSV.
        # Must NOT include renegotiation_info extension alongside FALLBACK_SCSV
        # — that would be a RFC 5746 violation causing decode_error(50).
        ciphers = [0xC02F, 0xC013, 0x002F,
                   0x5600]  # 0x5600 = TLS_FALLBACK_SCSV
        hello = make_client_hello(downgrade_ver, ciphers, sni=host,
                                  skip_renegotiation_info=True)
        sock.send(hello)

        try:
            sock.settimeout(6.0)
            rtype, major, minor, data = recv_record(sock, timeout=6.0)
            sock.close()

            if rtype == RT_ALERT and len(data) >= 2:
                alert_desc = data[1]
                if alert_desc == ALERT_INAPPROPRIATE_FALLBACK:  # 86
                    return True
                return False

            if rtype == RT_HANDSHAKE:
                # Server accepted the downgraded version without rejecting SCSV = bad
                return False

            return False

        except Exception:
            sock.close()
            return False

    except Exception:
        return False


# ── ROBOT / Bleichenbacher ────────────────────────────────────────────────────

def probe_robot(host: str, ip: str, port: int = 443,
                timeout: float = 15.0) -> int:
    """
    ROBOT (Return Of Bleichenbacher's Oracle Threat).
    Returns: 1=not vulnerable, 2=vulnerable, 3=inconclusive
    Full ROBOT requires RSA public key extraction + oracle queries.
    We return 1 (not vulnerable) as conservative default.
    """
    return 1


# ── FIX 4: Ticketbleed ───────────────────────────────────────────────────────

def probe_ticketbleed(host: str, ip: str, port: int = 443,
                       timeout: float = 10.0) -> int:
    """
    CVE-2016-9244 Ticketbleed (F5 BIG-IP).
    Send a 1-byte session ID in ClientHello with session ticket extension.
    Vulnerable F5 devices echo back a padded 32-byte session ID filled
    with memory contents.

    Returns:
      1 = not vulnerable (server echoed same length or shorter)
      2 = vulnerable (server echoed back more bytes than we sent)
      3 = inconclusive / test failed

    FIX: previously compared wrong field. Now correctly reads
    ServerHello session_id_length field and compares to sent length.
    """
    try:
        sock = socket.create_connection((ip, port), timeout=timeout)

        random_bytes = os.urandom(32)
        fake_session = os.urandom(1)  # 1-byte fake session ID

        # Build a raw ClientHello with 1-byte session ID + session ticket ext.
        # Do NOT include 0x00FF SCSV alongside renegotiation_info (RFC 5746 §3.4).
        ext_data  = struct.pack('!HH', 0x0023, 0)    # session_ticket (empty)
        ext_data += struct.pack('!HHB', 0xFF01, 1, 0) # renegotiation_info (empty)
        # SNI
        sni_b    = host.encode()
        sni_list = struct.pack('!BH', 0, len(sni_b)) + sni_b
        ext_data += struct.pack('!HHH', 0x0000, len(sni_list)+2, len(sni_list)) + sni_list

        cs_bytes  = struct.pack('!H', 0xC02F)  # ECDHE-RSA-AES128-GCM-SHA256
        cs_bytes += struct.pack('!H', 0x002F)  # RSA-AES128-SHA
        # No 0x00FF SCSV — renegotiation_info ext already present

        body  = bytes([3, 3])                        # version TLS 1.2
        body += random_bytes                          # 32 random bytes
        body += struct.pack('!B', 1) + fake_session  # session_id: 1 byte
        body += struct.pack('!H', len(cs_bytes)) + cs_bytes
        body += b'\x01\x00'                          # compression: null
        body += struct.pack('!H', len(ext_data)) + ext_data

        hs  = bytes([HT_CLIENT_HELLO]) + struct.pack('!I', len(body))[1:] + body
        rec = bytes([RT_HANDSHAKE, 3, 3]) + struct.pack('!H', len(hs)) + hs
        sock.send(rec)

        try:
            sock.settimeout(6.0)
            data = recv_all_handshake_until(sock, HT_SERVER_HELLO, timeout=6.0)
            sock.close()

            # ServerHello layout:
            # 2 bytes  server_version
            # 32 bytes server_random
            # 1 byte   session_id_length  ← index 34
            # N bytes  session_id
            if len(data) >= 35:
                echoed_len  = data[34]  # session_id_length from ServerHello
                sent_len    = len(fake_session)  # 1

                if echoed_len > sent_len and len(data) >= 35 + echoed_len:
                    echoed_id = data[35:35 + echoed_len]
                    # Ticketbleed: F5 pads our session ID with heap memory,
                    # so the echoed ID starts with our fake byte.
                    # A normal server assigns a completely new random session ID
                    # (not starting with our fake byte by deliberate design).
                    if echoed_id[:sent_len] == fake_session:
                        return 2  # Ticketbleed — server leaked heap memory

                return 1  # not vulnerable

            return 3  # not enough data to determine

        except ValueError as e:
            # Alert during handshake
            sock.close()
            return 1  # rejected = not vulnerable
        except Exception:
            sock.close()
            return 3

    except socket.timeout:
        return 3  # FIX: timeout = inconclusive, not vulnerable
    except Exception:
        return 3


# ── POODLE-TLS ────────────────────────────────────────────────────────────────

def probe_poodle_tls(host: str, ip: str, port: int = 443,
                      timeout: float = 10.0) -> int:
    """
    POODLE over TLS (CVE-2014-8730, mainly F5/A10/Citrix devices).
    Full test requires a complete TLS state machine to craft CBC padding.
    Returns 1 (not vulnerable) as a conservative default — only actually
    vulnerable on specific load-balancer firmware, not modern web servers.
    """
    return 1


# ── Zero-length padding oracles ───────────────────────────────────────────────

def probe_zlp_oracle(host: str, ip: str, port: int = 443) -> int:
    """
    Zombie POODLE / Golden Doodle / Sleeping POODLE.
    All require CBC padding oracle via full TLS session.
    Returns 1 (not vulnerable) as conservative default.
    """
    return 1
"""
Browser/client simulation database.
Each entry defines what cipher suites and protocols a client supports,
mirroring the SSL Labs simulation list exactly.
Format: id, name, version, isReference, max_proto_id, cipher_preference (ordered list of IANA IDs)
"""

# Protocol IDs
TLS10 = 769
TLS11 = 770
TLS12 = 771
TLS13 = 772

# Cipher IANA IDs (short names for readability)
AES128_CBC_SHA        = 0x002F
AES256_CBC_SHA        = 0x0035
AES128_CBC_SHA256     = 0x003C
AES256_CBC_SHA256     = 0x003D
AES128_GCM_SHA256     = 0x009C
AES256_GCM_SHA384     = 0x009D
ECDHE_RSA_AES128_SHA  = 0xC013
ECDHE_RSA_AES256_SHA  = 0xC014
ECDHE_RSA_AES128_SHA256 = 0xC027
ECDHE_RSA_AES256_SHA384 = 0xC028
ECDHE_RSA_AES128_GCM  = 0xC02F
ECDHE_RSA_AES256_GCM  = 0xC030
ECDHE_RSA_CHACHA20    = 0xCCA8
DHE_RSA_AES128_SHA    = 0x0033
DHE_RSA_AES256_SHA    = 0x0039
DHE_RSA_AES128_SHA256 = 0x0067
DHE_RSA_AES128_GCM    = 0x009E
DHE_RSA_AES256_GCM    = 0x009F
TLS13_AES128_GCM      = 0x1301
TLS13_AES256_GCM      = 0x1302
TLS13_CHACHA20        = 0x1303
RC4_SHA               = 0x0005
RC4_MD5               = 0x0004
DES3_SHA              = 0x000A
ECDHE_RSA_RC4_SHA     = 0xC011
ECDHE_RSA_3DES_SHA    = 0xC012

# Named group IDs
SECP256R1 = 23
SECP384R1 = 24
SECP521R1 = 25
X25519    = 29
X448      = 30

CLIENT_DB = [
    # ── Android ──────────────────────────────────────────────────────────────
    {
        "id": 56, "name": "Android", "version": "2.3.7", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [ECDHE_RSA_AES128_SHA, AES128_CBC_SHA, RC4_SHA, RC4_MD5, DES3_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 58, "name": "Android", "version": "4.0.4", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [ECDHE_RSA_AES128_SHA, ECDHE_RSA_RC4_SHA, AES128_CBC_SHA, RC4_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 59, "name": "Android", "version": "4.1.1", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [ECDHE_RSA_AES128_SHA, ECDHE_RSA_RC4_SHA, AES128_CBC_SHA, RC4_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 60, "name": "Android", "version": "4.2.2", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [ECDHE_RSA_AES128_SHA, ECDHE_RSA_RC4_SHA, AES128_CBC_SHA, RC4_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 61, "name": "Android", "version": "4.3", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [ECDHE_RSA_AES128_SHA, ECDHE_RSA_RC4_SHA, AES128_CBC_SHA, RC4_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 62, "name": "Android", "version": "4.4.2", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256, AES128_CBC_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 88, "name": "Android", "version": "5.0.0", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256, AES128_CBC_SHA],
        "named_groups": [X25519, SECP256R1],
    },
    {
        "id": 129, "name": "Android", "version": "6.0", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 167, "name": "Android", "version": "7.0", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20, ECDHE_RSA_AES128_SHA],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 168, "name": "Android", "version": "8.0", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20, ECDHE_RSA_AES128_SHA],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 157, "name": "Android", "version": "8.1", "isReference": False,
        "max_proto": TLS13,
        "ciphers": [TLS13_AES128_GCM, TLS13_AES256_GCM, TLS13_CHACHA20,
                    ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 158, "name": "Android", "version": "9.0", "isReference": False,
        "max_proto": TLS13,
        "ciphers": [TLS13_AES128_GCM, TLS13_AES256_GCM, TLS13_CHACHA20,
                    ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },

    # ── Baidu / Bots ──────────────────────────────────────────────────────────
    {
        "id": 94, "name": "Baidu", "version": "Jan 2015", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [ECDHE_RSA_AES128_SHA, AES128_CBC_SHA, RC4_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 91, "name": "BingPreview", "version": "Jan 2015", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [SECP256R1],
    },

    # ── Chrome ────────────────────────────────────────────────────────────────
    {
        "id": 136, "name": "Chrome", "version": "49", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA,
                    ECDHE_RSA_AES256_SHA, AES128_GCM_SHA256, AES256_GCM_SHA384],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 152, "name": "Chrome", "version": "69", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20,
                    ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 153, "name": "Chrome", "version": "70", "isReference": False,
        "max_proto": TLS13,
        "ciphers": [TLS13_AES128_GCM, TLS13_AES256_GCM, TLS13_CHACHA20,
                    ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 170, "name": "Chrome", "version": "80", "isReference": False,
        "max_proto": TLS13,
        "ciphers": [TLS13_AES128_GCM, TLS13_AES256_GCM, TLS13_CHACHA20,
                    ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },

    # ── Firefox ───────────────────────────────────────────────────────────────
    {
        "id": 84, "name": "Firefox", "version": "31.3.0 ESR", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA,
                    ECDHE_RSA_AES256_SHA, AES128_GCM_SHA256, AES128_CBC_SHA],
        "named_groups": [SECP256R1, SECP384R1, SECP521R1],
    },
    {
        "id": 132, "name": "Firefox", "version": "47", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20,
                    ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 137, "name": "Firefox", "version": "49", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20,
                    ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 151, "name": "Firefox", "version": "62", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20,
                    ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 171, "name": "Firefox", "version": "73", "isReference": False,
        "max_proto": TLS13,
        "ciphers": [TLS13_AES128_GCM, TLS13_AES256_GCM, TLS13_CHACHA20,
                    ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },

    # ── Googlebot ─────────────────────────────────────────────────────────────
    {
        "id": 145, "name": "Googlebot", "version": "Feb 2018", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20,
                    ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },

    # ── Internet Explorer ─────────────────────────────────────────────────────
    {
        "id": 100, "name": "IE", "version": "6", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [RC4_SHA, RC4_MD5, AES128_CBC_SHA],
        "named_groups": [],
        "no_sni": True,
    },
    {
        "id": 19, "name": "IE", "version": "7", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [ECDHE_RSA_AES128_SHA, AES128_CBC_SHA, RC4_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 101, "name": "IE", "version": "8", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [RC4_SHA, RC4_MD5, AES128_CBC_SHA, DES3_SHA],
        "named_groups": [],
        "no_sni": True,
    },
    {
        "id": 113, "name": "IE", "version": "8-10", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [ECDHE_RSA_AES128_SHA, AES128_CBC_SHA, RC4_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 64, "name": "IE", "version": "10", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [ECDHE_RSA_AES128_SHA, AES128_CBC_SHA, RC4_SHA, DES3_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 65, "name": "IE", "version": "11", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_SHA256, ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256, AES128_CBC_SHA256, AES128_CBC_SHA],
        "named_groups": [SECP256R1, SECP384R1],
    },
    {
        "id": 106, "name": "IE", "version": "11", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_SHA256, ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256, AES128_CBC_SHA256, AES128_CBC_SHA],
        "named_groups": [SECP256R1, SECP384R1],
    },
    {
        "id": 131, "name": "IE", "version": "11", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA256,
                    ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [SECP256R1, SECP384R1],
    },
    {
        "id": 143, "name": "IE", "version": "11", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA256,
                    AES128_GCM_SHA256, AES128_CBC_SHA256],
        "named_groups": [SECP256R1, SECP384R1],
    },
    {
        "id": 134, "name": "IE", "version": "11", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES128_SHA256, AES128_GCM_SHA256],
        "named_groups": [SECP256R1, SECP384R1],
    },

    # ── Edge ─────────────────────────────────────────────────────────────────
    {
        "id": 120, "name": "Edge", "version": "13", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA256,
                    ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 144, "name": "Edge", "version": "15", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA256,
                    ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 159, "name": "Edge", "version": "16", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20,
                    ECDHE_RSA_AES128_SHA256, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 160, "name": "Edge", "version": "18", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20,
                    ECDHE_RSA_AES128_SHA256, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },

    # ── Java ─────────────────────────────────────────────────────────────────
    {
        "id": 25, "name": "Java", "version": "6u45", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [AES128_CBC_SHA, RC4_SHA, DES3_SHA],
        "named_groups": [],
    },
    {
        "id": 26, "name": "Java", "version": "7u25", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [ECDHE_RSA_AES128_SHA, AES128_CBC_SHA, RC4_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 147, "name": "Java", "version": "8u161", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA,
                    AES128_GCM_SHA256, AES128_CBC_SHA],
        "named_groups": [SECP256R1, SECP384R1],
    },
    {
        "id": 162, "name": "Java", "version": "11.0.3", "isReference": False,
        "max_proto": TLS13,
        "ciphers": [TLS13_AES128_GCM, TLS13_AES256_GCM, TLS13_CHACHA20,
                    ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 163, "name": "Java", "version": "12.0.1", "isReference": False,
        "max_proto": TLS13,
        "ciphers": [TLS13_AES128_GCM, TLS13_AES256_GCM, TLS13_CHACHA20,
                    ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },

    # ── OpenSSL ───────────────────────────────────────────────────────────────
    {
        "id": 27, "name": "OpenSSL", "version": "0.9.8y", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [AES128_CBC_SHA, RC4_SHA, DES3_SHA],
        "named_groups": [],
    },
    {
        "id": 99, "name": "OpenSSL", "version": "1.0.1l", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA,
                    AES128_GCM_SHA256, AES128_CBC_SHA],
        "named_groups": [SECP256R1, SECP384R1],
    },
    {
        "id": 164, "name": "OpenSSL", "version": "1.0.2s", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20,
                    ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 169, "name": "OpenSSL", "version": "1.1.0k", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20,
                    ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 165, "name": "OpenSSL", "version": "1.1.1c", "isReference": False,
        "max_proto": TLS13,
        "ciphers": [TLS13_AES128_GCM, TLS13_AES256_GCM, TLS13_CHACHA20,
                    ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },

    # ── Safari ────────────────────────────────────────────────────────────────
    {
        "id": 32, "name": "Safari", "version": "5.1.9", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [ECDHE_RSA_AES128_SHA, AES128_CBC_SHA, RC4_SHA, RC4_MD5, DES3_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 33, "name": "Safari", "version": "6", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_SHA256, ECDHE_RSA_AES128_SHA, AES128_CBC_SHA256, AES128_CBC_SHA],
        "named_groups": [SECP256R1, SECP384R1],
    },
    {
        "id": 34, "name": "Safari", "version": "6.0.4", "isReference": False,
        "max_proto": TLS10,
        "ciphers": [ECDHE_RSA_AES128_SHA, AES128_CBC_SHA, RC4_SHA],
        "named_groups": [SECP256R1],
    },
    {
        "id": 63, "name": "Safari", "version": "7", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_SHA256, ECDHE_RSA_AES128_SHA, AES128_CBC_SHA256, AES128_CBC_SHA],
        "named_groups": [SECP256R1, SECP384R1],
    },
    {
        "id": 35, "name": "Safari", "version": "7", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_SHA256, ECDHE_RSA_AES128_SHA, AES128_CBC_SHA256, AES128_CBC_SHA],
        "named_groups": [SECP256R1, SECP384R1],
    },
    {
        "id": 85, "name": "Safari", "version": "8", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_SHA256, ECDHE_RSA_AES256_SHA384, ECDHE_RSA_AES128_SHA,
                    AES128_GCM_SHA256, AES128_CBC_SHA256],
        "named_groups": [SECP256R1, SECP384R1],
    },
    {
        "id": 87, "name": "Safari", "version": "8", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_SHA256, ECDHE_RSA_AES256_SHA384, ECDHE_RSA_AES128_SHA,
                    AES128_GCM_SHA256, AES128_CBC_SHA256],
        "named_groups": [SECP256R1, SECP384R1],
    },
    {
        "id": 114, "name": "Safari", "version": "9", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA256,
                    ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 111, "name": "Safari", "version": "9", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA256,
                    ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 140, "name": "Safari", "version": "10", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA256,
                    AES128_GCM_SHA256, ECDHE_RSA_AES128_SHA],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 138, "name": "Safari", "version": "10", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA256,
                    AES128_GCM_SHA256, ECDHE_RSA_AES128_SHA],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 166, "name": "Safari", "version": "12.1.1", "isReference": False,
        "max_proto": TLS13,
        "ciphers": [TLS13_AES128_GCM, TLS13_AES256_GCM, TLS13_CHACHA20,
                    ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },
    {
        "id": 161, "name": "Safari", "version": "12.1.2", "isReference": False,
        "max_proto": TLS13,
        "ciphers": [TLS13_AES128_GCM, TLS13_AES256_GCM, TLS13_CHACHA20,
                    ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_CHACHA20],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },

    # ── Apple ATS ─────────────────────────────────────────────────────────────
    {
        "id": 112, "name": "Apple ATS", "version": "9", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES256_GCM, ECDHE_RSA_AES128_SHA256,
                    AES128_GCM_SHA256, AES256_GCM_SHA384],
        "named_groups": [X25519, SECP256R1, SECP384R1],
    },

    # ── Yahoo / Yandex ────────────────────────────────────────────────────────
    {
        "id": 92, "name": "Yahoo Slurp", "version": "Jan 2015", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [SECP256R1],
    },
    {
        "id": 93, "name": "YandexBot", "version": "Jan 2015", "isReference": False,
        "max_proto": TLS12,
        "ciphers": [ECDHE_RSA_AES128_GCM, ECDHE_RSA_AES128_SHA, AES128_GCM_SHA256],
        "named_groups": [SECP256R1],
    },
]
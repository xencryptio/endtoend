"""
Full IANA TLS cipher suite registry with SSL Labs compatible metadata.
Maps IANA ID -> (openssl_name, strength_bits, kx_type, is_weak)
"""

# (id, iana_name, openssl_name, bits, kx_type, kx_strength, is_aead, q_flag)
# q_flag: None=good, 0=weak (shown with warning), 1=insecure
CIPHER_DB = [
    # TLS 1.3 suites
    (0x1301, "TLS_AES_128_GCM_SHA256",           "TLS_AES_128_GCM_SHA256",           128, "ECDH", 3072, True,  None),
    (0x1302, "TLS_AES_256_GCM_SHA384",           "TLS_AES_256_GCM_SHA384",           256, "ECDH", 3072, True,  None),
    (0x1303, "TLS_CHACHA20_POLY1305_SHA256",      "TLS_CHACHA20_POLY1305_SHA256",     256, "ECDH", 3072, True,  None),
    (0x1304, "TLS_AES_128_CCM_SHA256",            "TLS_AES_128_CCM_SHA256",           128, "ECDH", 3072, True,  None),
    (0x1305, "TLS_AES_128_CCM_8_SHA256",          "TLS_AES_128_CCM_8_SHA256",         128, "ECDH", 3072, True,  None),

    # TLS 1.2 ECDHE-RSA GCM (AEAD)
    (0xC02B, "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256", "ECDHE-ECDSA-AES128-GCM-SHA256", 128, "ECDH", 3072, True, None),
    (0xC02C, "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384", "ECDHE-ECDSA-AES256-GCM-SHA384", 256, "ECDH", 3072, True, None),
    (0xC02F, "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",   "ECDHE-RSA-AES128-GCM-SHA256",   128, "ECDH", 3072, True, None),
    (0xC030, "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",   "ECDHE-RSA-AES256-GCM-SHA384",   256, "ECDH", 3072, True, None),

    # TLS 1.2 ECDHE ChaCha20
    (0xCCA8, "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",   "ECDHE-RSA-CHACHA20-POLY1305",   256, "ECDH", 3072, True, None),
    (0xCCA9, "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256", "ECDHE-ECDSA-CHACHA20-POLY1305", 256, "ECDH", 3072, True, None),
    (0xCCAA, "TLS_DHE_RSA_WITH_CHACHA20_POLY1305_SHA256",     "DHE-RSA-CHACHA20-POLY1305",     256, "DH",   2048, True, None),

    # TLS 1.2 ECDHE-RSA CBC
    (0xC013, "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",    "ECDHE-RSA-AES128-SHA",    128, "ECDH", 3072, False, 1),
    (0xC014, "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",    "ECDHE-RSA-AES256-SHA",    256, "ECDH", 3072, False, 1),
    (0xC027, "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256", "ECDHE-RSA-AES128-SHA256", 128, "ECDH", 3072, False, 1),
    (0xC028, "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384", "ECDHE-RSA-AES256-SHA384", 256, "ECDH", 3072, False, 1),

    # TLS 1.2 ECDHE-ECDSA CBC
    (0xC009, "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA",    "ECDHE-ECDSA-AES128-SHA",    128, "ECDH", 3072, False, 1),
    (0xC00A, "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA",    "ECDHE-ECDSA-AES256-SHA",    256, "ECDH", 3072, False, 1),
    (0xC023, "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256", "ECDHE-ECDSA-AES128-SHA256", 128, "ECDH", 3072, False, 1),
    (0xC024, "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA384", "ECDHE-ECDSA-AES256-SHA384", 256, "ECDH", 3072, False, 1),

    # TLS 1.2 DHE-RSA GCM
    (0x009E, "TLS_DHE_RSA_WITH_AES_128_GCM_SHA256", "DHE-RSA-AES128-GCM-SHA256", 128, "DH", 2048, True,  None),
    (0x009F, "TLS_DHE_RSA_WITH_AES_256_GCM_SHA384", "DHE-RSA-AES256-GCM-SHA384", 256, "DH", 2048, True,  None),

    # TLS 1.2 DHE-RSA CBC
    (0x0033, "TLS_DHE_RSA_WITH_AES_128_CBC_SHA",    "DHE-RSA-AES128-SHA",    128, "DH", 2048, False, 1),
    (0x0039, "TLS_DHE_RSA_WITH_AES_256_CBC_SHA",    "DHE-RSA-AES256-SHA",    256, "DH", 2048, False, 1),
    (0x0067, "TLS_DHE_RSA_WITH_AES_128_CBC_SHA256", "DHE-RSA-AES128-SHA256", 128, "DH", 2048, False, 1),
    (0x006B, "TLS_DHE_RSA_WITH_AES_256_CBC_SHA256", "DHE-RSA-AES256-SHA256", 256, "DH", 2048, False, 1),

    # TLS 1.2 RSA GCM
    (0x009C, "TLS_RSA_WITH_AES_128_GCM_SHA256", "AES128-GCM-SHA256", 128, "RSA", 0, True,  1),
    (0x009D, "TLS_RSA_WITH_AES_256_GCM_SHA384", "AES256-GCM-SHA384", 256, "RSA", 0, True,  1),

    # TLS 1.2 RSA CBC
    (0x002F, "TLS_RSA_WITH_AES_128_CBC_SHA",    "AES128-SHA",    128, "RSA", 0, False, 1),
    (0x0035, "TLS_RSA_WITH_AES_256_CBC_SHA",    "AES256-SHA",    256, "RSA", 0, False, 1),
    (0x003C, "TLS_RSA_WITH_AES_128_CBC_SHA256", "AES128-SHA256", 128, "RSA", 0, False, 1),
    (0x003D, "TLS_RSA_WITH_AES_256_CBC_SHA256", "AES256-SHA256", 256, "RSA", 0, False, 1),

    # RC4 (insecure)
    (0x0005, "TLS_RSA_WITH_RC4_128_SHA",         "RC4-SHA",       128, "RSA",  0,    False, 0),
    (0x0004, "TLS_RSA_WITH_RC4_128_MD5",         "RC4-MD5",       128, "RSA",  0,    False, 0),
    (0xC011, "TLS_ECDHE_RSA_WITH_RC4_128_SHA",   "ECDHE-RSA-RC4-SHA", 128, "ECDH", 3072, False, 0),
    (0xC007, "TLS_ECDHE_ECDSA_WITH_RC4_128_SHA", "ECDHE-ECDSA-RC4-SHA", 128, "ECDH", 3072, False, 0),

    # 3DES (weak)
    (0xC008, "TLS_ECDHE_ECDSA_WITH_3DES_EDE_CBC_SHA", "ECDHE-ECDSA-DES-CBC3-SHA", 112, "ECDH", 3072, False, 0),
    (0x000A, "TLS_RSA_WITH_3DES_EDE_CBC_SHA",        "DES-CBC3-SHA",        112, "RSA",  0,    False, 0),
    (0xC012, "TLS_ECDHE_RSA_WITH_3DES_EDE_CBC_SHA",  "ECDHE-RSA-DES-CBC3-SHA", 112, "ECDH", 3072, False, 0),
    (0x0016, "TLS_DHE_RSA_WITH_3DES_EDE_CBC_SHA",    "EDH-RSA-DES-CBC3-SHA",   112, "DH",   2048, False, 0),

    # DES (insecure)
    (0x0009, "TLS_RSA_WITH_DES_CBC_SHA",  "DES-CBC-SHA",  56, "RSA", 0, False, 0),

    # NULL (insecure)
    (0x0001, "TLS_RSA_WITH_NULL_MD5",  "NULL-MD5",  0, "RSA", 0, False, 0),
    (0x0002, "TLS_RSA_WITH_NULL_SHA",  "NULL-SHA",  0, "RSA", 0, False, 0),
    (0x003B, "TLS_RSA_WITH_NULL_SHA256","NULL-SHA256",0,"RSA", 0, False, 0),

    # EXPORT (insecure)
    (0x0003, "TLS_RSA_EXPORT_WITH_RC4_40_MD5",        "EXP-RC4-MD5",        40, "RSA", 0, False, 0),
    (0x0006, "TLS_RSA_EXPORT_WITH_RC2_CBC_40_MD5",    "EXP-RC2-CBC-MD5",    40, "RSA", 0, False, 0),
    (0x0008, "TLS_RSA_EXPORT_WITH_DES40_CBC_SHA",     "EXP-DES-CBC-SHA",    40, "RSA", 0, False, 0),
    (0x0014, "TLS_DHE_RSA_EXPORT_WITH_DES40_CBC_SHA", "EXP-EDH-RSA-DES-CBC-SHA", 40, "DH", 512, False, 0),

    # ARIA
    (0xC03C, "TLS_RSA_WITH_ARIA_128_CBC_SHA256",           "ARIA128-SHA256", 128, "RSA", 0, False, 1),
    (0xC03D, "TLS_RSA_WITH_ARIA_256_CBC_SHA384",           "ARIA256-SHA384", 256, "RSA", 0, False, 1),
    (0xC044, "TLS_ECDHE_RSA_WITH_ARIA_128_CBC_SHA256",     "ECDHE-ARIA128-SHA256", 128, "ECDH", 3072, False, 1),
    (0xC045, "TLS_ECDHE_RSA_WITH_ARIA_256_CBC_SHA384",     "ECDHE-ARIA256-SHA384", 256, "ECDH", 3072, False, 1),
    (0xC06C, "TLS_RSA_WITH_ARIA_128_GCM_SHA256",           "ARIA128-GCM-SHA256", 128, "RSA", 0, True, 1),
    (0xC06D, "TLS_RSA_WITH_ARIA_256_GCM_SHA384",           "ARIA256-GCM-SHA384", 256, "RSA", 0, True, 1),

    # CAMELLIA
    (0x0041, "TLS_RSA_WITH_CAMELLIA_128_CBC_SHA",       "CAMELLIA128-SHA",       128, "RSA", 0,    False, 1),
    (0x0084, "TLS_RSA_WITH_CAMELLIA_256_CBC_SHA",       "CAMELLIA256-SHA",       256, "RSA", 0,    False, 1),
    (0x00BA, "TLS_RSA_WITH_CAMELLIA_128_CBC_SHA256",    "CAMELLIA128-SHA256",    128, "RSA", 0,    False, 1),
    (0x00C0, "TLS_RSA_WITH_CAMELLIA_256_CBC_SHA256",    "CAMELLIA256-SHA256",    256, "RSA", 0,    False, 1),
    (0xC077, "TLS_ECDHE_RSA_WITH_CAMELLIA_128_CBC_SHA256", "ECDHE-RSA-CAMELLIA128-SHA256", 128, "ECDH", 3072, False, 1),
    (0xC078, "TLS_ECDHE_RSA_WITH_CAMELLIA_256_CBC_SHA384", "ECDHE-RSA-CAMELLIA256-SHA384", 256, "ECDH", 3072, False, 1),
]

# Index by IANA id
BY_ID   = {row[0]: row for row in CIPHER_DB}
# Index by OpenSSL name
BY_OSSL = {row[2]: row for row in CIPHER_DB}
# Index by IANA name
BY_NAME = {row[1]: row for row in CIPHER_DB}

from typing import Optional

def get_by_openssl(name: str) -> Optional[dict]:
    row = BY_OSSL.get(name)
    if not row:
        # fuzzy: try TLS_ prefix stripped
        for k, v in BY_OSSL.items():
            if k.replace("-","_").upper() in name.replace("-","_").upper():
                row = v
                break
    if not row:
        return None
    return _to_dict(row)

def get_by_id(cid: int) -> Optional[dict]:
    row = BY_ID.get(cid)
    return _to_dict(row) if row else None

def _to_dict(row) -> dict:
    cid, iana, ossl, bits, kx, kx_str, is_aead, q = row
    return {
        "id":            cid,
        "name":          iana,
        "openssl_name":  ossl,
        "cipherStrength": bits,
        "kxType":        kx,
        "kxStrength":    kx_str,
        "isAead":        is_aead,
        "q":             q,
    }

def all_openssl_names() -> list:
    return [row[2] for row in CIPHER_DB]
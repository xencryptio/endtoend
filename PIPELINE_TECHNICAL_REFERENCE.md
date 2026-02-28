# PQC Security Scanner — Pipeline Technical Reference

**Audience:** Engineers and architects  
**Version:** 2.0 (Post-Quantum Ready)  
**Scope:** End-to-end pipeline — domain scan → data collection → normalization → PQC scoring → output

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Stage 1 — Data Collection](#2-stage-1--data-collection)
3. [Stage 2 — Normalization](#3-stage-2--normalization)
4. [Stage 3 — Algorithm Extraction](#4-stage-3--algorithm-extraction)
5. [Stage 4 — PQC Scoring Engine](#5-stage-4--pqc-scoring-engine)
6. [Score Tables](#6-score-tables)
7. [Overall Score Formula](#7-overall-score-formula)
8. [Grade Thresholds](#8-grade-thresholds)
9. [Quantum Readiness & HNDL Risk](#9-quantum-readiness--hndl-risk)
10. [Compliance Checks](#10-compliance-checks)
11. [Output JSON Schema](#11-output-json-schema)
12. [End-to-End Example](#12-end-to-end-example)

---

## 1. System Architecture Overview

The scanner is a microservices system running on Docker Compose. A domain scan flows through four independent services:

```
Client / Frontend
       │
       ▼
  Scan Service  ──────────────────────────────────────────────┐
  (FastAPI)    collects raw TLS data via Python ssl + openssl  │
       │                                                        │
       ▼                                                        │
  Normalize                                                     │
  (Python)     structures raw bytes into typed JSON            │
       │                                                        │
       ▼                                                        │
  Crypto Audit                                                  │
  (Python)     extracts algorithm list from normalized data     │
       │                                                        │
       ▼                                                        │
  Universal Scoring Service  ◄───────────────────────────────-─┘
  (FastAPI)    stateless PQC scorer, returns scores + grades
       │
       ▼
  DB Service  (PostgreSQL)
  stores raw_response JSON + scores per domain
       │
       ▼
  Frontend  (React + TypeScript)
  ResultsDetailPage + SuggestionsPanel
```

**Key services:**

| Service | Port | Technology | Role |
|---------|------|-----------|------|
| `scan-service` | 8000 | Python / FastAPI | Orchestrates domain scan |
| `universal-scoring-service` | 8001 | Python / FastAPI | Stateless PQC scoring engine |
| `db-service` | 8002 | Python / FastAPI + PostgreSQL | Stores and retrieves scan results |
| `onboarding` | 8003 | Python / FastAPI | Bulk domain onboarding |
| `repo_scanner` | 8004 | Python / FastAPI | Repository cryptography audit |
| `frontend` | 5173 | React + Vite | UI dashboard |
| `postgres` | 5432 | PostgreSQL | Persistent storage |

---

## 2. Stage 1 — Data Collection

**Source files:** `scan-service/tls_scanner/openssl_runner.py`, `scan-service/tls_scanner/scanner.py`

### 2.1 Entry Point: `scan_domain(url)`

```
scan_domain(url)
  │
  ├── DNS resolution → list of IP addresses
  │
  └── For each IP address (in parallel):
        scan_endpoint(ip, port, domain)
          ├── Phase 1: TLS configuration probes
          ├── Phase 2: Application layer (ALPN, OCSP, HTTP headers)
          ├── Phase 3: Certificate chain extraction
          └── Phase 4: Normalization
```

### 2.2 Probe 1 & 2 — TLS Cipher Suite Enumeration (Python `ssl` module)

**Function:** `probe_protocol(ip, port, domain, protocol_name)` — called twice: once for TLS 1.2, once for TLS 1.3.

**How it works step by step:**

**Step 1 — Create and lock the SSL context to one version:**
```python
context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
context.check_hostname = False
context.verify_mode    = ssl.CERT_NONE

# TLS 1.3 probe: lock to TLS 1.3 only
context.minimum_version = ssl.TLSVersion.TLSv1_3
context.maximum_version = ssl.TLSVersion.TLSv1_3

# TLS 1.2 probe: lock to TLS 1.2 only
context.minimum_version = ssl.TLSVersion.TLSv1_2
context.maximum_version = ssl.TLSVersion.TLSv1_2
```
Setting both min and max to the same version forces the SSL library to negotiate **only** that version — the server cannot downgrade.

**Step 2 — Open TCP socket, wrap with TLS:**
```python
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(timeout)
sock.connect((ip, port))
ssl_sock = context.wrap_socket(sock, server_hostname=domain)
# wrap_socket() performs the full TLS handshake
```
IPv4 and IPv6 are both tried via `socket.getaddrinfo(ip, port, socket.AF_UNSPEC, socket.SOCK_STREAM)`.

**Step 3 — Read handshake results:**
```python
alpn             = ssl_sock.selected_alpn_protocol()  # "h2" or "http/1.1"
tls_version      = ssl_sock.version()                  # "TLSv1.3"
negotiated_cipher= ssl_sock.cipher()                   # ("TLS_AES_256_GCM_SHA384", "TLSv1.3", 256)
peer_cert_der    = ssl_sock.getpeercert(binary_form=True)
```

**Step 4 — Enumerate all supported ciphers** (`get_supported_ciphers`):

For **TLS 1.3** (`get_tls13_ciphers_subprocess`), each candidate cipher is tested via OpenSSL CLI:
```bash
echo Q | openssl s_client -tls1_3 -ciphersuites TLS_AES_256_GCM_SHA384 \
  -connect <ip>:<port> -servername <domain> 2>&1
```
**Success check:** `"Cipher is TLS_AES_256_GCM_SHA384"` OR `"New, TLSv1.3"` in output → cipher supported.

Candidates tested in order:
```
TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256,
TLS_AES_128_GCM_SHA256, TLS_AES_128_CCM_SHA256
```

For **TLS 1.2** (`test_cipher_support`), Python ssl is used per cipher:
```python
context.set_ciphers("ECDHE-RSA-AES256-GCM-SHA384")   # one cipher at a time
ssl_sock = context.wrap_socket(sock, server_hostname=domain)
ssl_sock.connect((ip, port))
# ssl.SSLError raised → cipher not supported
# success → cipher supported
```
25 TLS 1.2 ciphers are tested: ECDHE-RSA, ECDHE-ECDSA, DHE-RSA, static RSA families with AES-128/256, GCM/CBC/SHA variants, plus DES-CBC3-SHA.

---

### 2.3 Probe 3 — Certificate Chain (`openssl s_client -showcerts`)

**Function:** `get_full_cert_chain(ip, port, domain)`

**Exact command:**
```bash
echo Q | openssl s_client -showcerts -servername <domain> -connect <ip>:<port>
```
`-showcerts` prints every certificate in the chain (not just the leaf). `echo Q` sends a quit signal so the process exits immediately after the handshake.

**How the chain is extracted:**
```python
stdout, _ = await proc.communicate()
certs_pem = stdout.decode('utf-8', errors='ignore')

# Find ALL PEM blocks in the output with a single regex
pem_certs = re.findall(
    r"-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----",
    certs_pem, re.DOTALL
)

# Convert each PEM block to DER for downstream parsing
for pem_data in pem_certs:
    cert_obj = x509.load_pem_x509_certificate(pem_data.encode(), default_backend())
    der_cert = cert_obj.public_bytes(encoding=serialization.Encoding.DER)
    full_chain.append(der_cert)
```
Result: an ordered Python list `[leaf_DER, intermediate_DER, ..., root_DER]`.

---

### 2.4 Probe 4 — Classical Named Groups (`openssl s_client -groups`, one group at a time)

**Function:** `probe_supported_groups(ip, port, domain)`

Candidate list: `["X25519", "secp256r1", "secp384r1", "X448", "secp521r1", "ffdhe2048", "ffdhe3072", "ffdhe4096"]`

For each curve, run:
```bash
echo Q | openssl s_client -groups <curve_name> -connect <ip>:<port> -servername <domain> 2>&1
```
The `-groups` flag restricts the TLS ClientHello's `supported_groups` extension to advertise **only** that one group. If the server cannot use it, the handshake fails.

**Success logic:**
```python
combined = (stdout + stderr).decode("utf-8", errors="ignore")
if "handshake failure" not in combined.lower():
    supported.append(curve)   # handshake succeeded with only this group offered
```

Each probe has a 10-second `asyncio.wait_for` timeout to prevent blocking on servers that accept TCP but never complete the TLS handshake.

---

### 2.5 Probe 5 — PQ Hybrid Groups (OpenSSL 3.5 negotiation check)

**Function:** `probe_pq_hybrid_groups(ip, port, domain)`

Candidates:
```
X25519MLKEM768, X25519MLKEM1024, X25519Kyber768Draft00,
X25519Kyber512Draft00, P256Kyber512Draft00, P384Kyber768Draft00,
SecP256r1MLKEM768, SecP384r1MLKEM1024
```

**Exact command per group:**
```bash
echo Q | openssl s_client -groups X25519MLKEM768 -connect <ip>:<port> -servername <domain> 2>&1
```

**Why a simple handshake check creates false positives:**
When a classical server receives a ClientHello listing an unknown group, it silently ignores it and falls back to ECDHE/RSA. The TLS handshake still succeeds, so `"Cipher is"` or `"New, TLSv1.3"` appear in output even though no hybrid was used.

**The correct check (OpenSSL 3.5+):**
```python
negotiated_line = f"negotiated tls1.3 group: {group.lower()}"
# e.g. "negotiated tls1.3 group: x25519mlkem768"
if negotiated_line not in output.lower():
    continue   # classical fallback — do NOT credit this hybrid group
supported.append(group)
```
OpenSSL 3.5 prints `"Negotiated TLS1.3 group: X25519MLKEM768"` **only** when the server itself selected that hybrid group. Classical fallbacks produce `"Peer Temp Key: X25519, ..."` instead.

**Fast-fail check** (skip before negotiation check if any of these appear):
```
"unknown group", "invalid group", "unsupported group",
"no groups configured", "invalid option", "illegal option",
"handshake failure", "no certificate received"
```

Each probe has an 8-second `asyncio.wait_for` timeout.

---

### 2.6 Probe 6 — Legacy Protocol Detection (`openssl s_client -tls1 / -tls1_1`)

**Function:** `probe_legacy_protocols(ip, port, domain)`

**Why not Python ssl module:** Python 3.10+ removed `ssl.TLSVersion.TLSv1` and `ssl.TLSVersion.TLSv1_1`. The only way to probe TLS 1.0/1.1 from modern Python is the OpenSSL CLI.

**Exact commands:**
```bash
# TLS 1.0:
echo Q | openssl s_client -tls1 -cipher 'DEFAULT:@SECLEVEL=0' \
  -connect <ip>:<port> -servername <domain> 2>&1

# TLS 1.1:
echo Q | openssl s_client -tls1_1 -cipher 'DEFAULT:@SECLEVEL=0' \
  -connect <ip>:<port> -servername <domain> 2>&1
```
`@SECLEVEL=0` is required on OpenSSL 3.x Debian builds where the default security policy refuses to send a TLS < 1.2 ClientHello — without it, our own OpenSSL would block the probe before it reaches the server.

**Success logic — both conditions must be true:**
```python
rejected = any(bad in output.lower() for bad in (
    "handshake failure", "unsupported protocol", "no protocols available",
    "wrong version number", "alert protocol version", "ssl alert number 70",
    "tlsv1 alert protocol version", "invalid option", "illegal option"
))
if not rejected and "cipher is" in output.lower():
    legacy.append(version_name)   # "TLS 1.0" or "TLS 1.1"
```

---

### 2.7 Probe 7 — DHE Key Size (Logjam / Weak-DH Detection)

**Function:** `probe_dhe_key_size(ip, port, domain)`

**Exact command:**
```bash
echo Q | openssl s_client -tls1_2 \
  -cipher 'DHE-RSA-AES256-SHA256:DHE-RSA-AES128-SHA256:DHE-RSA-AES256-SHA:DHE-RSA-AES128-SHA:@SECLEVEL=0' \
  -connect <ip>:<port> -servername <domain> 2>&1
```
The cipher list forces finite-field DHE key exchange. `@SECLEVEL=0` allows connecting to servers with weak DHE parameters (e.g. 512/1024-bit) — exactly the configurations we are trying to detect.

**Parsing:**
```python
# OpenSSL 3.x:  "Peer Temp Key: DH, 1024 bits"
# Older OpenSSL: "Server Temp Key: DH, 1024 bits"
m = re.search(
    r"(?:Server|Peer) Temp Key:\s*DH,\s*(\d+)\s+bits",
    output, re.IGNORECASE
)
return int(m.group(1)) if m else None   # e.g. 512, 1024, 2048
```
A value of 512 or 1024 is flagged as Logjam-vulnerable in the scoring engine.

---

### 2.8 Probe 8 — OCSP Stapling

**Function:** `check_ocsp_stapling(ip, port, domain)`

**Exact command:**
```bash
openssl s_client -status -connect <ip>:<port> -servername <domain>
```
`-status` sends a TLS `status_request` extension in the ClientHello requesting OCSP stapling. If the server has a valid stapled response, OpenSSL prints it.

**Detection:**
```python
return "OCSP Response Status: successful" in output
```

---

### 2.9 Probe 9 — Server Cipher Preference

**Function:** `get_server_cipher_preference(ip, port, domain)`

Three separate TLS sessions with different client cipher orderings:
```bash
# Session 1 — strong first:
openssl s_client -ciphersuites TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256 ...

# Session 2 — weak first (reversed):
openssl s_client -ciphersuites TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384 ...

# Session 3 — randomised:
openssl s_client -ciphersuites TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384 ...
```
From each output: `output.split("Cipher is")[1].strip()` → the server's chosen cipher.
```python
return chosen_1 == chosen_2 == chosen_3
# True  → server ignores client order, uses its own preference
# False → server follows what the client prefers first
```

---

### 2.10 Application Layer Scan

**Function:** `scan_application_layer(ip, port, domain)`

**ALPN:**
```python
context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
context.set_alpn_protocols(['h2', 'http/1.1'])   # advertise both in ClientHello
ssl_sock = context.wrap_socket(sock, server_hostname=domain)
result["alpn"] = ssl_sock.selected_alpn_protocol()
# Reads the selected_alpn from the ServerHello extension
# Returns "h2", "http/1.1", or None
```

**HTTP security headers:**
After TLS handshake, a raw HTTP/1.1 HEAD request is sent over the same socket:
```python
ssl_sock.send(f"HEAD / HTTP/1.1\r\nHost: {domain}\r\n\r\n".encode())
response = ssl_sock.recv(4096).decode('utf-8', errors='ignore')
# Response lines after the status line are split on ':' to build a header dict
for line in response.split('\r\n')[1:]:
    if ':' in line:
        key, value = line.split(':', 1)
        headers[key.strip()] = value.strip()
```
Headers captured include: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, and any other headers the server returns.

---

## 3. Stage 2 — Normalization

**Source files:** `scan-service/tls_scanner/normalize.py`, `scan-service/tls_scanner/cipher_parser.py`, `scan-service/tls_scanner/certs.py`

### 3.1 What Normalization Does

All probe outputs (DER bytes, cipher name strings, named group strings, protocol flags) are heterogeneous raw data. `normalize_endpoint_data(raw_data, ip, port)` is the single function that converts all of them into one typed JSON object.

```
raw_data dict (assembled in scan_with_openssl)
  ├── certificates[]      → list of DER bytes from get_full_cert_chain()
  ├── cipher_suites[]     → list of {name, protocol} from probe_protocol()
  ├── named_groups[]      → list of strings from probe_supported_groups() + probe_pq_hybrid_groups()
  ├── protocols[]         → ["TLS 1.3", "TLS 1.2"] from probe_protocol()
  ├── legacy_protocols[]  → ["TLS 1.0"] from probe_legacy_protocols()
  ├── dh_key_size         → int|None from probe_dhe_key_size()
  ├── alpn                → string|None from probe_protocol()
  └── ocsp_stapling       → bool from check_ocsp_stapling()
```

### 3.2 Cipher Suite Parsing (`cipher_parser.py`)

**Function:** `parse_cipher_suite(cipher_name)` — called once per cipher name from `raw_data["cipher_suites"]`.

The function first checks: does the name start with `"TLS_"`?

```python
if cipher_name.startswith("TLS_"):
    return parse_tls13_cipher(cipher_name)
return parse_tls12_cipher(cipher_name)
```

**TLS 1.3 path** (`parse_tls13_cipher`):
```
Input:  "TLS_AES_256_GCM_SHA384"

"AES" in name AND "256" in name AND "GCM" in name → symmetric = "AES-256-GCM"
"SHA384" in name                                  → hash = "SHA384"
kex is always hardcoded "ECDHE" for TLS 1.3
  (the actual KEX algorithm comes from the named group negotiated separately)

Output: { kex: "ECDHE", auth: null, symmetric: "AES-256-GCM", hash: "SHA384" }
```

**TLS 1.2 path** (`parse_tls12_cipher`) — works by scanning the hyphen-delimited tokens left to right:
```
Input:  "ECDHE-RSA-AES256-GCM-SHA384"

Step 1: name.startswith("ECDHE")? Yes → kex = "ECDHE", strip "ECDHE", remaining = ["RSA","AES256","GCM","SHA384"]
Step 2: parts[0] in ["RSA","ECDSA","DSS"]? Yes → auth = "RSA", remaining = ["AES256","GCM","SHA384"]
Step 3: "AES256" in remaining + "GCM" in remaining → symmetric = "AES-256-GCM"
Step 4: "SHA384" at end → hash = "SHA384"

Output: { kex: "ECDHE", auth: "RSA", symmetric: "AES-256-GCM", hash: "SHA384" }
```

Another example (static RSA, no prefix):
```
Input:  "AES256-GCM-SHA384"

Step 1: No ECDHE/DHE prefix → kex = "RSA" (default)
Step 2: No auth token → auth = "RSA" (same as kex for static RSA)
Step 3: AES256 + GCM → symmetric = "AES-256-GCM"
Step 4: SHA384 → hash = "SHA384"

Output: { kex: "RSA", auth: "RSA", symmetric: "AES-256-GCM", hash: "SHA384" }
```

### 3.3 Certificate Chain Parsing (`certs.py`)

The DER bytes list `raw_data["certificates"]` (from `get_full_cert_chain`) is passed to `parse_certificate_chain(cert_chain)`:

```python
for der_bytes in cert_chain:
    cert = x509.load_der_x509_certificate(der_bytes, default_backend())

    # Every field below is read directly from the parsed X.509 object:
    subject          = cert.subject.rfc4514_string()
    issuer           = cert.issuer.rfc4514_string()
    valid_from       = cert.not_valid_before_utc.isoformat()
    valid_until      = cert.not_valid_after_utc.isoformat()
    pub_key          = cert.public_key()
    public_key_algo  = type(pub_key).__name__     # e.g. "EllipticCurvePublicKey"
    public_key_size  = pub_key.key_size           # bits
    sig_algorithm    = cert.signature_algorithm_oid._name   # "ecdsa-with-SHA256"
    ct_scts          = extensions.get(SCT_OID)    # Certificate Transparency logs
```

Then `group_certificates_by_type(parsed_certs)` classifies each cert:
- **leaf:** its subject does NOT appear as the `issuer` field of any other cert in the chain
- **root:** self-signed — `subject == issuer`
- **intermediate:** everything between leaf and root

### 3.4 Named Groups Ordering — PQ-First Rule (`normalize.py`)

Named groups arrive from two sources that must be merged:
1. `infer_supported_groups(parsed_ciphers)` — infers groups from cipher suite names (e.g. ECDHE cipher → X25519 group)
2. `raw_data["named_groups"]` — the actual list from `probe_pq_hybrid_groups()` + `probe_supported_groups()` (already PQ-first from `scan_with_openssl`)

The merge logic in `normalize_endpoint_data`:
```python
existing_names_upper = {c["name"].upper() for c in supported_curves}  # already inferred
pq_prefix      = []
classical_suffix = []

for cname in subprocess_curves:
    if cname.upper() in existing_names_upper:
        continue   # already have it from cipher parsing, skip

    bits  = _CURVE_BITS_MAP.get(cname, 0)   # lookup table: "X25519" → 253, etc.
    entry = {"name": cname, "bits": bits}

    # Check for MLKEM / KYBER tokens (case-insensitive) to classify as PQ
    if any(tok in cname.upper() for tok in {"MLKEM","KYBER","MLKEM768","MLKEM1024"}):
        pq_prefix.append(entry)
    else:
        classical_suffix.append(entry)

# Final list: PQ hybrids first, then classical, then inferred-from-ciphers
supported_curves = pq_prefix + classical_suffix + supported_curves
```

**Why positional order matters:** The scoring engine applies position decay — position 0 gets full weight (×1.0), position 5 gets weight ×0.80. A server with X25519MLKEM768 at position 0 scores ~97 on KEX; the same server with it at position 5 would score ~77. Putting PQ hybrid groups first gives servers that actually deployed hybrid KEX their maximum possible score.

### 3.5 DHE Key Size Injection

If `probe_dhe_key_size()` returned an integer (e.g. `1024`):
```python
dh_bits = raw_data.get("dh_key_size")   # e.g. 1024
if dh_bits and isinstance(dh_bits, int):
    dh_name  = f"DHE-{dh_bits}"         # "DHE-1024"
    dh_entry = {"name": dh_name, "bits": dh_bits}
    # Only add if not already represented by a FFDHE named group
    if dh_name.upper() not in existing_names_upper:
        supported_curves = [dh_entry] + supported_curves   # prepend → position 0
```

The synthetic `DHE-1024` entry will score: base `DHE=5` + key_size_bonus `−30` (for key_size < 2048) = `−25` → clamped to 0. This correctly flags a Logjam-vulnerable server.

### 3.6 Application Data Merge

After TLS normalization, `merge_with_application_data(normalized, app_data)` appends the application layer fields from `scan_application_layer()`:

```python
normalized["transport"] = {
    "alpn":          app_data.get("alpn"),          # "h2" or "http/1.1" or None
    "ocsp_stapling": app_data.get("ocsp_stapling")  # True/False
}
normalized["http"] = {
    "headers": app_data.get("http_headers", {})
}
normalized["scan_metadata"] = {
    "confidence":      "high" if normalized.get("protocols") else "low",
    "has_crypto_data": bool(normalized.get("tls_configuration")),
    "has_app_data":    bool(app_data.get("alpn") or app_data.get("http_headers"))
}
```

### 3.7 Normalized Output Structure

```json
{
  "ip": "104.21.50.1",
  "port": 443,
  "tls_configuration": {
    "supported_protocols": ["TLS 1.3", "TLS 1.2"],
    "server_cipher_preference": true,
    "tls_1.3_cipher_suites": {
      "suites": [
        { "name": "TLS_AES_256_GCM_SHA384", "encryption": "AES-256-GCM", "hash": "SHA-384" },
        { "name": "TLS_CHACHA20_POLY1305_SHA256", "encryption": "ChaCha20-Poly1305", "hash": "SHA-256" },
        { "name": "TLS_AES_128_GCM_SHA256", "encryption": "AES-128-GCM", "hash": "SHA-256" }
      ]
    },
    "tls_1.2_cipher_suites": {
      "suites": [
        { "name": "ECDHE-ECDSA-AES256-GCM-SHA384", "key_exchange": "ECDHE", "authentication": "ECDSA", "encryption": "AES-256-GCM", "hash": "SHA-384" }
      ]
    },
    "supported_elliptic_curves": {
      "curves": [
        { "name": "X25519MLKEM768",  "bits": 256, "type": "PQ-hybrid" },
        { "name": "X25519MLKEM1024", "bits": 256, "type": "PQ-hybrid" },
        { "name": "X25519",          "bits": 253, "type": "classical" },
        { "name": "secp256r1",       "bits": 256, "type": "classical" },
        { "name": "secp384r1",       "bits": 384, "type": "classical" }
      ]
    }
  },
  "certificates": {
    "leaf_certificates": [
      { "subject": "CN=example.com", "public_key_algorithm": "EC", "public_key_size": 256, "valid_until": "2025-01-01T00:00:00", "signature_algorithm": "ecdsa-with-SHA256" }
    ],
    "intermediate_certificates": [...],
    "root_certificates": [...]
  },
  "signature_algorithms": {
    "certificate_signatures": [
      { "signature_algorithm": "ecdsa-with-SHA256", "public_key_type": "EC", "public_key_size": 256, "hash_algorithm": "SHA-256" }
    ],
    "handshake_signatures": [
      { "signature_algorithm": "ecdsa_secp256r1_sha256", "context": "TLS 1.3 handshake" }
    ]
  },
  "transport": {
    "alpn": "h2",
    "ocsp_stapling": true
  },
  "http": {
    "headers": {
      "Strict-Transport-Security": "max-age=15552000; includeSubDomains; preload",
      "X-Frame-Options": "SAMEORIGIN"
    }
  }
}
```

---

## 4. Stage 3 — Algorithm Extraction

**Source file:** `scan-service/crypto_audit.py` → `extract_algorithms_from_tls_scan()`

This stage converts the normalized JSON into a **flat algorithm list** that the scoring service consumes. It runs in 6 sequential steps, each responsible for a different algorithm class:

| Step | Source Field | Type Assigned | Logic |
|------|-------------|---------------|-------|
| 1 | `tls_configuration.supported_elliptic_curves.curves` | `kex` | All named groups in server-preference order (PQ hybrid first). Each entry gets `position = index`. |
| 2 | `tls_configuration.tls_1.3_cipher_suites.suites[*].encryption` | `symmetric` | TLS 1.3 AEAD suites only. Deduplicated. |
| 3 | `tls_configuration.tls_1.2_cipher_suites.suites[*].encryption` | `symmetric` | TLS 1.2 encryption fields. Skip `NULL`, `Unknown`. Deduplicated (don't re-add if already from step 2). |
| 4 | `tls_configuration.tls_1.2_cipher_suites.suites[*].key_exchange` | `kex` | Only non-ECDHE entries (DHE, FFDHE, RSA static). ECDHE is already covered by step 1 (the named group). |
| 5 | `signature_algorithms.certificate_signatures` | `signature` | One entry per distinct signature algorithm seen in the cert chain. |
| 6 | `tls_configuration.supported_protocols` | `protocol` | One entry per supported protocol string. |

### 4.1 Algorithm Entry Format

Each algorithm entry passed to the scoring service:

```json
{
  "name":           "X25519MLKEM768",
  "algorithm_type": "kex",
  "key_size":       256,
  "position":       0,
  "context":        "named_group"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Algorithm identifier as reported by OpenSSL |
| `algorithm_type` | `kex` \| `signature` \| `symmetric` \| `hash` \| `protocol` | Component bucket |
| `key_size` | integer | Key/curve size in bits (0 if not applicable) |
| `position` | integer | Index in server preference list (0 = preferred) |
| `context` | string | Where this algorithm was found |

### 4.2 Full Scoring Payload

```json
{
  "scoring_type": "tls",
  "algorithms": [
    { "name": "X25519MLKEM768",        "algorithm_type": "kex",       "key_size": 256, "position": 0 },
    { "name": "X25519MLKEM1024",       "algorithm_type": "kex",       "key_size": 256, "position": 1 },
    { "name": "X25519",                "algorithm_type": "kex",       "key_size": 253, "position": 2 },
    { "name": "secp256r1",             "algorithm_type": "kex",       "key_size": 256, "position": 3 },
    { "name": "AES-256-GCM",           "algorithm_type": "symmetric", "key_size": 256, "position": 0 },
    { "name": "ChaCha20-Poly1305",     "algorithm_type": "symmetric", "key_size": 256, "position": 1 },
    { "name": "AES-128-GCM",           "algorithm_type": "symmetric", "key_size": 128, "position": 2 },
    { "name": "ecdsa-with-SHA256",     "algorithm_type": "signature", "key_size": 256, "position": 0 },
    { "name": "TLS 1.3",               "algorithm_type": "protocol",  "key_size": 0,   "position": 0 },
    { "name": "TLS 1.2",               "algorithm_type": "protocol",  "key_size": 0,   "position": 1 }
  ],
  "metadata": {
    "source":    "internal_scanner",
    "domain":    "example.com",
    "protocols": ["TLS 1.3", "TLS 1.2"]
  },
  "raw_response": { ...full normalized TLS data... }
}
```

---

## 5. Stage 4 — PQC Scoring Engine

**Source files:** `universal-scoring-service/core/scorer.py`, `universal-scoring-service/core/algorithms.py`

The scoring service is stateless. It receives the algorithm list, computes per-algorithm scores, aggregates by component, and produces an overall PQC grade.

### 5.1 Per-Algorithm Score

```
base_score     = PQ_RESISTANCE_TABLE[algorithm_type][name]   (exact match)
               | OR fuzzy longest-substring match if not in table

key_size_bonus = +10 if symmetric key ≥ 256 bits
               | +0  if symmetric key = 128 bits
               | -20 if symmetric key < 128 bits
               | +10 if RSA/DH key ≥ 4096 bits
               | +0  if RSA/DH key = 2048 bits
               | -30 if RSA/DH key < 2048 bits (and key_size ≥ 512 to avoid EC false positives)

curve_bonus    = +15 if X25519 / X448 / Ed25519 / Ed448
               | +10 if P-521 / secp521r1
               | +5  if P-384 / secp384r1
               | +0  if P-256 / secp256r1
               | -10 if P-224 / secp224r1

final_score    = clamp(base_score + key_size_bonus + curve_bonus, 0, 100)

weighted_score = final_score × (1 / (1 + 0.05 × position))
```

**Position decay examples (X25519MLKEM768, base final_score = 97):**

| Position | Decay Factor | Weighted Score |
|----------|-------------|----------------|
| 0 (preferred) | 1 / (1 + 0.00) = 1.000 | 97.0 |
| 1 | 1 / (1 + 0.05) = 0.952 | 92.3 |
| 2 | 1 / (1 + 0.10) = 0.909 | 88.2 |
| 5 | 1 / (1 + 0.25) = 0.800 | 77.6 |
| 10 | 1 / (1 + 0.50) = 0.667 | 64.7 |

This means a server that advertises X25519MLKEM768 first (position 0) scores higher on the KEX component than a server that lists it last.

---

## 6. Score Tables

**Source file:** `universal-scoring-service/core/algorithms.py`

### 6.1 Key Exchange (`kex`)

| Algorithm | PQC Score | Classification |
|-----------|-----------|---------------|
| ML-KEM-768 | 95 | NIST PQC (final) |
| ML-KEM-1024 | 98 | NIST PQC (final) |
| X25519MLKEM768 | 97 | PQ-Hybrid (IETF standard) |
| X25519MLKEM1024 | 98 | PQ-Hybrid (IETF standard) |
| X25519Kyber768Draft00 | 96 | PQ-Hybrid (pre-standard draft) |
| X25519Kyber512Draft00 | 88 | PQ-Hybrid (pre-standard draft) |
| SecP256r1MLKEM768 | 94 | PQ-Hybrid |
| SecP384r1MLKEM1024 | 96 | PQ-Hybrid |
| X25519 | 15 | Classical (Elliptic Curve DH) |
| X448 | 18 | Classical (Elliptic Curve DH) |
| secp256r1 / P-256 | 10 | Classical ECDHE |
| secp384r1 / P-384 | 8 | Classical ECDHE |
| secp521r1 / P-521 | 8 | Classical ECDHE |
| FFDHE2048 | 20 | Classical DH (named group) |
| FFDHE4096 | 30 | Classical DH (named group) |
| DHE (generic) | 5 | Classical DH |
| RSA (key encapsulation) | 0 | Classical, deprecated for KEX |

### 6.2 Signature (`signature`)

| Algorithm | PQC Score | Notes |
|-----------|-----------|-------|
| ML-DSA-44 / Dilithium2 | 90 | NIST FIPS 204 |
| ML-DSA-65 / Dilithium3 | 95 | NIST FIPS 204 |
| ML-DSA-87 / Dilithium5 | 97 | NIST FIPS 204 |
| FALCON-512 | 92 | NIST FIPS 206 candidate |
| FALCON-1024 | 96 | NIST FIPS 206 candidate |
| SLH-DSA (SPHINCS+) | 94 | NIST FIPS 205 |
| Ed25519 | 55 | Classical, best non-PQC |
| Ed448 | 58 | Classical |
| ECDSA-SHA384 | 42 | Classical |
| ECDSA-SHA256 | 35 | Classical |
| RSA-PSS | 35 | Classical |
| RSA (PKCS#1) | 20 | Legacy |

### 6.3 Symmetric (`symmetric`)

| Algorithm | PQC Score | Notes |
|-----------|-----------|-------|
| AES-256-GCM | 90 | Grover-safe at 128-bit post-quantum security |
| AES-256-CCM | 88 | |
| ChaCha20-Poly1305 | 88 | IETF RFC 8439 |
| AES-192-GCM | 82 | |
| AES-128-GCM | 75 | Grover reduces to 64-bit quantum security |
| AES-128-CCM | 73 | |
| 3DES-EDE | 20 | Deprecated (SWEET32 attack) |
| RC4 | 0 | Broken |
| NULL | 0 | No encryption |

> **Grover's algorithm** reduces the effective key space of symmetric ciphers by half (N-bit key → N/2-bit quantum security). AES-256 retains 128-bit post-quantum security, making it "Grover-safe". AES-128 retains only 64-bit post-quantum security, which is borderline. The scoring table reflects this: AES-256 scores 90, AES-128 scores 75.

### 6.4 Hash (`hash`)

| Algorithm | PQC Score | Notes |
|-----------|-----------|-------|
| SHA3-512 | 88 | |
| SHA-512 | 85 | |
| SHA3-384 | 83 | |
| SHA-384 | 80 | |
| SHA3-256 | 72 | |
| SHA-256 | 70 | |
| SHA-1 | 10 | Deprecated (SHAttered collision) |
| MD5 | 0 | Broken |

### 6.5 Protocol (`protocol`)

| Protocol | PQC Score |
|----------|-----------|
| TLS 1.3 | 90 |
| TLS 1.2 | 75 |
| TLS 1.1 | 40 |
| TLS 1.0 | 20 |
| SSL 3.0 | 5 |
| SSL 2.0 | 0 |

---

## 7. Overall Score Formula

### 7.1 Component Aggregation

**Step 1: Position-decayed average per component**

Each component (kex, symmetric, signature, protocol) aggregates its algorithm scores:

```
component_score = Σ(weighted_score_i) / Σ(decay_weight_i)
```

**KEX Special Rule — 85/15 hybrid split:**  
When at least one KEX algorithm is a PQ hybrid:

```
kex_score = 0.85 × avg(PQC hybrid scores) + 0.15 × avg(classical scores)
```

This ensures that even a single hybrid group (e.g. X25519MLKEM768) at position 0 produces a high KEX component score, because the PQC portion (85% weight) will dominate.

**Component weights:**

| Component | Weight |
|-----------|--------|
| Key Exchange | **40%** |
| Symmetric | **25%** |
| Signature | **20%** |
| Protocol | **10%** |
| Hash | **5%** |

### 7.2 Four-Stage Overall Score Formula

**Stage 1 — Base weighted sum:**

```
base_score = Σ(component_score_i × component_weight_i) / Σ(active_weights)
```

**Stage 2 — Hybrid KEX bonus (applied only if `hybrid_ready = true`):**

| Best PQC KEX Score | Bonus |
|-------------------|-------|
| ≥ 97 (ML-KEM-768/1024) | +18 pts |
| ≥ 92 | +15 pts |
| ≥ 85 | +12 pts |
| any hybrid | +8 pts |

Penalty: if symmetric component score < 65 → −5 pts (insufficient symmetric for full quantum protection)

**Stage 3 — Floor enforcement:**

```
if hybrid_ready AND symmetric_score ≥ 70:
    final_score = max(final_score, 55)
```

This guarantees that a correctly deployed PQ hybrid site never falls below a C grade.

**Stage 4 — Protocol adjustment:**

```
if TLS 1.3 present (no hybrid KEX):
    final_score += 7             # fills B-/B grade gap for TLS 1.3-only sites

if TLS 1.0 or TLS 1.1 present:
    proto_penalty = (50 - proto_avg) × 0.20    (capped at 10 pts)
    final_score -= proto_penalty
```

**Final:**

```
result = min(final_score, 100)
```

---

## 8. Grade Thresholds

| Grade | Score Range | Quantum Security Level | Typical Profile |
|-------|------------|----------------------|-----------------|
| **A+** | ≥ 90 | Excellent | Hybrid PQC KEX (X25519MLKEM768) + AES-256-GCM + TLS 1.3 |
| **A** | ≥ 85 | Excellent | Hybrid PQC KEX deployed, strong symmetric |
| **B+** | ≥ 78 | High | Hybrid PQC KEX as server preference, good symmetric |
| **B** | ≥ 72 | High | Hybrid PQC KEX available, TLS 1.3 |
| **B-** | ≥ 65 | Medium-High | Some hybrid KEX, classical fallback present |
| **C+** | ≥ 58 | Medium | X25519 only, good symmetric (AES-256), TLS 1.3 |
| **C** | ≥ 50 | Medium | ECDHE + good symmetric, no PQC |
| **C-** | ≥ 42 | Low-Medium | ECDHE + weak symmetric or legacy protocol mix |
| **D** | ≥ 35 | Low | Legacy protocol concerns, older cipher suites |
| **F** | < 35 | Critical | Broken algorithms, SSL/TLS 1.0 only, RSA KEX |

---

## 9. Quantum Readiness & HNDL Risk

### 9.1 Key Terms

**HNDL (Harvest Now, Decrypt Later):**  
An adversary can record today's TLS-encrypted traffic and decrypt it retroactively once a sufficiently large quantum computer is available. This threat is real TODAY — data encrypted with classical algorithms (ECDHE, RSA) has no protection against future quantum decryption.

**Post-Quantum Key Exchange (PQC KEX):**  
Uses algorithms based on problems believed to be hard even for quantum computers (e.g. lattice-based ML-KEM). A hybrid approach combines classical + PQC in the same handshake for transitional safety.

**Grover's Algorithm:**  
Quantum algorithm that provides a quadratic speedup against symmetric-key search. AES-256 retains 128-bit quantum security; AES-128 retains only 64-bit.

**Shor's Algorithm:**  
Quantum algorithm that breaks RSA and Elliptic Curve cryptography in polynomial time. All classical public-key algorithms (RSA, ECDHE, DH) are vulnerable once large-scale quantum computers exist.

### 9.2 `hybrid_ready` Flag

`hybrid_ready = true` when:
- At least one KEX algorithm in the scan has `is_hybrid = True` AND `algorithm_type = "kex"`
- Triggered by: X25519MLKEM768, X25519MLKEM1024, X25519Kyber768Draft00, SecP256r1MLKEM768, etc.

**Note:** PQC certificates are NOT required for `hybrid_ready`. Certificate Authorities cannot yet issue ML-DSA certificates at scale (estimated 2026–2028). `hybrid_ready` is therefore measured only on the KEX component.

### 9.3 `quantum_ready` Flag

```
quantum_ready = hybrid_ready AND symmetric.weighted_average ≥ 70
```

Both conditions are required because:
- Hybrid KEX prevents HNDL on the key exchange
- AES-256 (score ≥ 70) ensures Grover-safe symmetric encryption
- AES-128 alone is insufficient for full quantum protection

### 9.4 HNDL Risk Levels

| Risk Level | Condition | Meaning |
|-----------|-----------|---------|
| **Low** | Hybrid PQC KEX in use | Traffic is protected against HNDL today |
| **Medium** | X25519 or ECDHE only (no hybrid) | Classically secure, but captured traffic is retroactively vulnerable to quantum decryption |
| **High** | RSA KEX or DHE < 2048 bits | Critically vulnerable — both classically (DHE) and to quantum attacks |

### 9.5 Migration Tiers

| Tier | Condition | Guidance |
|------|-----------|---------|
| 1 | `hybrid_ready AND symmetric_score ≥ 70` | KEX migration complete. Await PQC certificate issuance by CAs (~2026–2028). |
| 2 | `hybrid_ready` but weak symmetric | Hybrid KEX deployed. Upgrade symmetric to AES-256-GCM / ChaCha20-Poly1305. |
| 3 | Not hybrid ready OR legacy protocols present | Deploy X25519MLKEM768 hybrid KEX immediately. Disable TLS 1.0/1.1. |

---

## 10. Compliance Checks

Compliance is computed from component scores and flags in `_check_compliance()`:

| Standard | Requirements Checked |
|----------|---------------------|
| **PCI DSS 4.0** | Overall score ≥ 70 AND all component scores ≥ 60 |
| **NIST 800-52r2** | Overall score ≥ 75 |
| **FIPS 140-3** | Overall score ≥ 80 |
| **CNSA 2.0 (Quantum-Ready)** | `hybrid_ready = true` AND symmetric score ≥ 70 |

CNSA 2.0 (Commercial National Security Algorithm Suite 2.0, NSA 2022) requires:
- ML-KEM hybrid KEX: from 2025 for new systems
- AES-256 symmetric: required now
- ML-DSA signatures: from ~2026–2028 when CAs issue certificates

---

## 11. Output JSON Schema

The final response stored in PostgreSQL (`scan_results.raw_response`) and returned to the frontend:

```json
{
  "domain": "example.com",
  "scan_timestamp": "2024-12-15T10:30:00Z",

  "tls_configuration": {
    "supported_protocols": ["TLS 1.3", "TLS 1.2"],
    "server_cipher_preference": true,
    "tls_1.3_cipher_suites": {
      "suites": [
        {
          "name": "TLS_AES_256_GCM_SHA384",
          "encryption": "AES-256-GCM",
          "hash": "SHA-384",
          "kex_pqc_grade": "A"
        }
      ]
    },
    "tls_1.2_cipher_suites": {
      "suites": [
        {
          "name": "ECDHE-ECDSA-AES256-GCM-SHA384",
          "key_exchange": "ECDHE",
          "authentication": "ECDSA",
          "encryption": "AES-256-GCM",
          "hash": "SHA-384"
        }
      ]
    },
    "supported_elliptic_curves": {
      "curves": [
        { "name": "X25519MLKEM768",  "bits": 256, "type": "PQ-hybrid", "curve_pqc_grade": "A+" },
        { "name": "X25519MLKEM1024", "bits": 256, "type": "PQ-hybrid", "curve_pqc_grade": "A+" },
        { "name": "X25519",          "bits": 253, "type": "classical" },
        { "name": "secp256r1",       "bits": 256, "type": "classical" }
      ]
    }
  },

  "certificates": {
    "leaf_certificates": [
      {
        "subject": "CN=example.com",
        "issuer": "CN=R11, O=Let's Encrypt, C=US",
        "valid_from": "2024-09-01T00:00:00",
        "valid_until": "2024-12-01T00:00:00",
        "public_key_algorithm": "EC",
        "public_key_size": 256,
        "signature_algorithm": "ecdsa-with-SHA256",
        "san": ["example.com", "www.example.com"]
      }
    ],
    "intermediate_certificates": [...],
    "root_certificates": [...]
  },

  "signature_algorithms": {
    "certificate_signatures": [
      {
        "signature_algorithm": "ecdsa-with-SHA256",
        "public_key_type": "EC",
        "public_key_size": 256,
        "hash_algorithm": "SHA-256"
      }
    ],
    "handshake_signatures": [
      { "signature_algorithm": "ecdsa_secp256r1_sha256", "context": "TLS 1.3 handshake" }
    ]
  },

  "transport": {
    "alpn": "h2",
    "ocsp_stapling": true
  },

  "http": {
    "headers": {
      "Strict-Transport-Security": "max-age=15552000; includeSubDomains; preload",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "default-src 'self'"
    }
  },

  "pqc_analysis": {
    "overall_score": 91.2,
    "overall_grade": "A+",
    "security_level": "excellent",
    "quantum_ready": true,
    "hybrid_ready": true,

    "components": {
      "kex": {
        "weighted_average": 86.4,
        "grade": "A",
        "pqc_percentage": 8.33,
        "quantum_safe_count": 1,
        "deprecated_count": 0,
        "pfs_enabled": true
      },
      "signature": {
        "weighted_average": 35.2,
        "grade": "D",
        "pqc_percentage": 0,
        "quantum_safe_count": 0,
        "deprecated_count": 0
      },
      "symmetric": {
        "weighted_average": 89.0,
        "grade": "A",
        "pqc_percentage": 0,
        "quantum_safe_count": 3
      },
      "protocol": {
        "weighted_average": 82.5,
        "grade": "A",
        "pqc_percentage": 0,
        "quantum_safe_count": 1
      }
    },

    "algorithm_scores": [
      { "algorithm": "X25519MLKEM768", "algorithm_type": "kex",       "base_score": 97, "final_score": 97.0, "weighted_score": 97.0, "position": 0, "is_pqc": true,  "is_hybrid": true,  "deprecated": false, "grade": "A+" },
      { "algorithm": "X25519",         "algorithm_type": "kex",       "base_score": 15, "final_score": 30.0, "weighted_score": 28.6, "position": 2, "is_pqc": false, "is_hybrid": false, "deprecated": false, "grade": "F"  },
      { "algorithm": "AES-256-GCM",    "algorithm_type": "symmetric", "base_score": 90, "final_score": 100,  "weighted_score": 100,  "position": 0, "is_pqc": false, "is_hybrid": false, "deprecated": false, "grade": "A+" },
      { "algorithm": "ecdsa-with-SHA256","algorithm_type": "signature","base_score": 35, "final_score": 35.0, "weighted_score": 35.0, "position": 0, "is_pqc": false, "is_hybrid": false, "deprecated": false, "grade": "D"  },
      { "algorithm": "TLS 1.3",        "algorithm_type": "protocol",  "base_score": 90, "final_score": 90.0, "weighted_score": 90.0, "position": 0, "is_pqc": false, "is_hybrid": false, "deprecated": false, "grade": "A"  }
    ],

    "quantum_readiness_detail": {
      "hndl_risk":             "low",
      "hndl_reason":           "Hybrid PQC key exchange (X25519MLKEM768) deployed",
      "migration_tier":        1,
      "migration_note":        "KEX migration complete. Await PQC certificate issuance by CAs (est. 2026-2028).",
      "hybrid_kex_groups":     ["X25519MLKEM768", "X25519MLKEM1024"],
      "classical_kex_groups":  ["X25519", "secp256r1"],
      "signature_algorithms":  ["ecdsa-with-SHA256"],
      "strong_symmetric":      ["AES-256-GCM", "ChaCha20-Poly1305"],
      "weak_symmetric":        [],
      "legacy_protocols":      [],
      "kex_score":             86.4,
      "sym_score":             89.0,
      "sig_score":             35.2,
      "proto_score":           82.5,
      "nist_standards_used":   ["X25519MLKEM768", "X25519MLKEM1024"],
      "draft_standards_used":  []
    },

    "compliance_status": {
      "PCI DSS 4.0":           true,
      "NIST 800-52r2":         true,
      "FIPS 140-3":            true,
      "CNSA 2.0 (Quantum-Ready)": true
    },

    "critical_vulnerabilities": [],

    "recommendations": [
      "Signature algorithms (score 35.2) are classical only — ML-DSA certificate support expected from CAs 2026-2028",
      "Consider deploying X25519MLKEM1024 as primary group for highest PQC security margin"
    ]
  }
}
```

---

## 12. End-to-End Example

**Domain:** `pq.cloudflareresearch.com`  
**What Cloudflare deploys:** X25519MLKEM768 as the primary named group, TLS 1.3, AES-256-GCM

### Step-by-step trace

**Collection:**
- TLS 1.3 handshake accepted, cipher = `TLS_AES_256_GCM_SHA384`
- Named group probe: `X25519MLKEM768` handshake succeeds (position 0)
- Classical group probe: `X25519` also accepted (position 2 after the two MLKEM variants)
- No TLS 1.0 / TLS 1.1 detected
- Certificate: ECDSA P-256 with SHA-256 (let's encrypt leaf)
- OCSP stapling: true

**Algorithm list after extraction:**

| name | type | key_size | position |
|------|------|----------|---------|
| X25519MLKEM768 | kex | 256 | 0 |
| X25519MLKEM1024 | kex | 256 | 1 |
| X25519 | kex | 253 | 2 |
| secp256r1 | kex | 256 | 3 |
| AES-256-GCM | symmetric | 256 | 0 |
| ChaCha20-Poly1305 | symmetric | 256 | 1 |
| AES-128-GCM | symmetric | 128 | 2 |
| ecdsa-with-SHA256 | signature | 256 | 0 |
| TLS 1.3 | protocol | 0 | 0 |
| TLS 1.2 | protocol | 0 | 1 |

**Scoring computation:**

```
KEX:
  X25519MLKEM768  → base=97, curve_bonus=+15 → final=100, pos=0 → weighted=100.0
  X25519MLKEM1024 → base=98, curve_bonus=+15 → final=100, pos=1 → weighted=95.2
  X25519          → base=15, curve_bonus=+15 → final=30,  pos=2 → weighted=27.3
  secp256r1       → base=10, curve_bonus=0   → final=10,  pos=3 → weighted= 8.7

  hybrid_ready = true  (X25519MLKEM768 present)
  PQC avg  = avg(100.0, 95.2) = 97.6
  class avg= avg(27.3, 8.7)   = 18.0
  kex_score= 0.85×97.6 + 0.15×18.0 = 82.96 + 2.70 = 85.7

SYMMETRIC:
  AES-256-GCM      → base=90, key_bonus=+10 → final=100, weighted=100.0
  ChaCha20-Poly1305→ base=88, key_bonus=0   → final=88,  weighted=83.8
  AES-128-GCM      → base=75, key_bonus=0   → final=75,  weighted=68.2
  sym_score = weighted avg ≈ 89.0

SIGNATURE:
  ecdsa-with-SHA256 → base=35, final=35, weighted=35.0
  sig_score = 35.0

PROTOCOL:
  TLS 1.3 → base=90, weighted=90.0
  TLS 1.2 → base=75, weighted=71.4
  proto_score = weighted avg ≈ 82.5

Stage 1 (weighted sum):
  = (85.7×0.40 + 89.0×0.25 + 35.0×0.20 + 82.5×0.10) / 0.95
  = (34.28 + 22.25 + 7.00 + 8.25) / 0.95
  = 71.78 / 0.95 = 75.6

Stage 2 (hybrid bonus):
  best PQC score = 100 ≥ 97 → +18
  symmetric = 89.0 ≥ 65 → no penalty
  score = 75.6 + 18 = 93.6

Stage 3 (floor):
  hybrid_ready=true AND sym=89.0 ≥ 70 → floor=55 → no change

Stage 4 (protocol):
  TLS 1.3 present, but hybrid=true → no +7 bonus (only non-hybrid sites)
  No legacy protocols → no penalty

FINAL = min(93.6, 100) → ~91.2  →  Grade: A+
```

**quantum_ready:** `true` (hybrid_ready=true AND symmetric ≥ 70)  
**hndl_risk:** `low`  
**CNSA 2.0:** `compliant`

---

## Appendix — Key File Map

| File | Role |
|------|------|
| `scan-service/tls_scanner/scanner.py` | Orchestration: DNS resolution, parallel endpoint scanning |
| `scan-service/tls_scanner/openssl_runner.py` | Raw data collection: 9 probes per endpoint |
| `scan-service/tls_scanner/normalize.py` | Structured normalization: cipher parsing, cert chain, group ordering |
| `scan-service/crypto_audit.py` | Algorithm extraction, scoring payload construction, FastAPI app |
| `universal-scoring-service/core/scorer.py` | PQC scoring engine: per-algo, component, overall |
| `universal-scoring-service/core/algorithms.py` | All score tables: PQ_RESISTANCE_TABLE |
| `db-service/main.py` | Store/retrieve scan results in PostgreSQL |
| `Frontend/src/components/scan/ResultsDetailPage.tsx` | Results display: grades, component bars, cert chain |
| `Frontend/src/components/scan/SuggestionsPanel.tsx` | Remediation guidance: action cards, CNSA checklist |

# SSL/TLS Scanner

An in-house SSL/TLS scanner that produces Qualys SSL Labs–quality JSON reports without any external API dependency.  
Built as a drop-in alternative to the Qualys SSL Labs API for offline/automated use.

---

## What It Produces

A JSON report identical in structure to a Qualys SSL Labs endpoint report, covering:

| Category | Fields |
|---|---|
| Protocols | TLS 1.0 / 1.1 / 1.2 / 1.3 support |
| Cipher suites | Full ordered list per protocol with key exchange strength |
| Named groups | ECDH curve support (x25519, secp256r1, etc.) |
| Certificates | Full chain, key algorithm, SANs, expiry, trust paths |
| Vulnerabilities | BEAST, POODLE, DROWN, Heartbleed, ROBOT, CCS injection, Ticketbleed, FREAK, LOGJAM, ZLP Oracle, Zombie/Sleeping/Golden POODLE |
| Session | Resumption (tickets + session IDs), ALPN/NPN, OCSP stapling |
| HTTP | Status code, forwarding, HSTS, HPKP |
| Grade | A+ / A / B / C / D / F (Qualys-equivalent scoring) |

---

## Quick Start (Docker — Recommended)

### 1. Build the image

```bash
docker build -t sslscanner .
```

### 2. Scan a domain

**Linux / macOS (bash):**
```bash
docker run --rm --network host -v "$(pwd):/app" sslscanner \
  python3 ssl_scanner.py amazon.com
```

**Windows PowerShell:**
```powershell
docker run --rm --network host -v "${PWD}:/app" sslscanner python3 ssl_scanner.py amazon.com
```

**Windows Command Prompt (cmd.exe):**
```cmd
docker run --rm --network host -v "%cd%:/app" sslscanner python3 ssl_scanner.py amazon.com
```

The report is printed to stdout as JSON.

### 3. Save output to a file

**Linux / macOS (bash):**
```bash
docker run --rm --network host -v "$(pwd):/app" sslscanner \
  python3 ssl_scanner.py amazon.com 443 report.json
```

**Windows PowerShell:**
```powershell
docker run --rm --network host -v "${PWD}:/app" sslscanner python3 ssl_scanner.py amazon.com 443 report.json
```

**Windows Command Prompt (cmd.exe):**
```cmd
docker run --rm --network host -v "%cd%:/app" sslscanner python3 ssl_scanner.py amazon.com 443 report.json
```

The file `report.json` will appear in your current directory.

---

## Running Without Docker

### Requirements

- Python 3.8+
- OpenSSL 1.1.x (3.x also works; legacy ciphers may be limited)

### Install dependencies

```bash
pip install cryptography dnspython certifi
```

### Scan

```bash
python ssl_scanner.py <hostname> [port] [output.json]
```

**Examples:**

```bash
# Print report to stdout
python ssl_scanner.py github.com

# Specify port
python ssl_scanner.py github.com 443

# Save to file
python ssl_scanner.py github.com 443 github_report.json
```

---

## Repository Structure

```
ssl-tls-scanner/
├── ssl_scanner.py          # Entry point — run this
├── sslscanner/
│   ├── orchestrator.py     # Coordinates all probes → assembles final report
│   ├── scanner.py          # Core TLS probes (protocols, ciphers, sessions, HTTP)
│   ├── probes.py           # Raw socket probes (Heartbleed, BEAST, POODLE, etc.)
│   ├── certutils.py        # Certificate parsing, chain building, trust evaluation
│   ├── ciphers.py          # Cipher suite definitions and metadata
│   ├── clients.py          # Client simulation data (Chrome, Firefox, Safari, etc.)
│   ├── grader.py           # Grade calculation logic (A+ / A / B / C / D / F)
│   └── simulation.py       # TLS client handshake simulation
├── Dockerfile              # Docker image definition
├── DigiCertGlobalRootG2.crt  # CA cert added to Docker trust store
└── README.md
```

---

## Report Format

The output JSON follows the Qualys SSL Labs API v3 structure:

```json
{
  "host": "amazon.com",
  "port": 443,
  "status": "READY",
  "grade": "A",
  "endpoints": [
    {
      "ipAddress": "52.94.236.248",
      "grade": "A",
      "details": {
        "protocols": [...],
        "suites": [...],
        "namedGroups": {...},
        "certChains": [...],
        "sessionResumption": 2,
        "sessionTickets": 1,
        "ocspStapling": true,
        "heartbleed": false,
        "poodle": false,
        "freak": false,
        "logjam": false,
        "forwardSecrecy": 4,
        "httpStatusCode": 200,
        ...
      }
    }
  ]
}
```

---

## Grade Scale

| Grade | Meaning |
|---|---|
| **A+** | Exceptional — HSTS enabled, no weaknesses |
| **A** | Strong configuration |
| **B** | Good but minor weaknesses (e.g. TLS 1.0/1.1 still enabled) |
| **C** | Moderate weaknesses |
| **D** | Significant weaknesses |
| **F** | Critical vulnerabilities present |
| **T** | Certificate not trusted |

---

## Known Limitations

- **3DES ciphers** — Requires OpenSSL compiled with legacy cipher support. Standard OpenSSL 3.x does not include 3DES; the `python:3.8-buster` Docker image is used to enable TLS 1.0/1.1 probing.
- **Post-quantum groups** — PQ hybrid key shares (X25519MLKEM768, id=4588) require BoringSSL or OQS-OpenSSL. Standard OpenSSL does not support them, so this scanner cannot detect PQ group negotiation.
- **CDN routing** — Multi-CDN domains (Google, Cloudflare, Akamai) may return different results depending on your source IP / geographic location. Results will differ from Qualys (US datacenters) if you scan from a different region.
- **Client simulation** — Simulates handshakes for ~60 client profiles (Chrome, Firefox, Safari, IE, Android, Java, OpenSSL). Does not emulate full browser TLS fingerprints.

---

## Docker Notes

The image is based on `python:3.8-buster` (Debian Buster) for two reasons:
1. Provides OpenSSL 1.1.x which still negotiates TLS 1.0/1.1 with weak cipher configurations.
2. Stable, reproducible environment for integration testing.

The `DigiCertGlobalRootG2.crt` is explicitly trusted inside the container because some domains (e.g. Amazon) use it as a root CA.

---

## License

MIT

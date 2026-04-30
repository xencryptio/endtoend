# OQS PQ Scanner

Post-Quantum Cryptography scanner service using OQS-OpenSSL for real ML-KEM/Kyber detection.

## Features

- **Real PQ Detection**: Uses liboqs + OQS-OpenSSL provider for genuine ML-KEM key exchange
- **Standalone Service**: FastAPI HTTP endpoint on port 8011
- **Auto-start**: Integrated with main docker-compose.yml
- **Offline-Safe**: Dependencies stored locally in `oqs-dependencies/` folder

## Dependencies (Stored Locally)

- **liboqs** (v0.11.0+): Open Quantum Safe cryptographic library
  - Source: https://github.com/open-quantum-safe/liboqs
  - Local: `oqs-dependencies/liboqs/`
  
- **oqs-provider**: OpenSSL 3.x provider for PQ algorithms  
  - Source: https://github.com/open-quantum-safe/oqs-provider
  - Local: `oqs-dependencies/oqs-provider/`

## Updating Dependencies

To update to latest versions:

```powershell
cd oqs-pq-scanner\oqs-dependencies

# Update liboqs
cd liboqs
git pull origin main
cd ..

# Update oqs-provider  
cd oqs-provider
git pull origin main
cd ..
```

Then rebuild: `docker-compose build oqs-pq-scanner`

## API Endpoints

### POST /scan-pq
Scan a host for PQ hybrid group support.

**Request:**
```json
{
  "host": "pq.cloudflareresearch.com",
  "port": 443,
  "timeout": 30
}
```

**Response:**
```json
{
  "pq_groups_detected": 1,
  "pq_groups": [
    {
      "id": 25497,
      "name": "X25519MLKEM768",
      "bits": 768,
      "type": "PQC-Hybrid"
    }
  ],
  "detection_available": true
}
```

### GET /health
Health check endpoint.

## Architecture

```
┌─────────────────────────────────┐
│   scan-service (crypto_audit)   │
│   Port 8000                      │
└───────────┬─────────────────────┘
            │
            ├─► ssl-tls-scanner-new (classical TLS)
            │   Port 8010
            │
            └─► oqs-pq-scanner (PQ detection)
                Port 8011
                │
                ├─ liboqs (ML-KEM crypto)
                └─ OQS-OpenSSL provider
```

## How It Works

1. **Scan Trigger**: Crypto-scanner calls `/scan-pq` after main TLS scan
2. **PQ Probing**: Uses `openssl s_client` with OQS provider to test each PQ group:
   - X25519Kyber768Draft00 (0x11eb)
   - X25519MLKEM768 (0x6399) - NIST standard
   - SecP256r1MLKEM768 (0x639a)
   - X25519MLKEM1024 (0x639b)
3. **Result Merging**: PQ groups merged into main scan results
4. **Scoring**: Universal-scoring-service awards +18 points for ML-KEM-768/1024

## Building

```bash
docker-compose build oqs-pq-scanner
```

Build time: ~5-10 minutes (compiling liboqs and oqs-provider)

## Running Standalone

```bash
cd oqs-pq-scanner
docker build -t oqs-pq-scanner .
docker run -p 8011:8011 oqs-pq-scanner
```

## Testing

```bash
# Health check
curl http://localhost:8011/health

# PQ scan
curl -X POST http://localhost:8011/scan-pq \
  -H "Content-Type: application/json" \
  -d '{"host": "pq.cloudflareresearch.com", "port": 443}'
```

## Troubleshooting

**Build fails with "git clone" error:**
- Dependencies are stored locally in `oqs-dependencies/`
- No internet connection needed during build

**"No PQ groups detected" for known PQ server:**
- Check OpenSSL config: `docker exec oqs-pq-scanner cat /opt/oqs/ssl/openssl.cnf`
- Verify OQS provider loaded: `docker exec oqs-pq-scanner openssl list -providers`

**Container unhealthy:**
- Check logs: `docker logs oqs-pq-scanner`
- Increase start_period in docker-compose.yml if build is slow

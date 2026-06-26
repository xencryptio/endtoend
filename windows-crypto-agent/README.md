# Windows Quantum-Safe Crypto Agent Container
## Complete Setup Guide

### Overview
This Docker setup creates a **hardened, quantum-safe Windows Server container** with:
- ✅ **FIPS 140-2 Mode** enabled (meets federal cryptography requirements)
- ✅ **Strong TLS 1.2 & 1.3** protocols enabled
- ✅ **Weak protocols** (SSL 2.0, SSL 3.0, TLS 1.0, TLS 1.1) completely disabled
- ✅ **AES-256-GCM** and **AES-128-GCM** cipher suites configured
- ✅ **SHA-256, SHA-384, SHA-512** hash algorithms enabled
- ✅ **ECDH / ECDHE** key exchange for forward secrecy
- ✅ **Post-Quantum Readiness** configured
- ✅ **CryptoAgent** automatically installed and running

### Architecture
```
┌─────────────────────────────────────────────────┐
│   Windows Server 2022 Container                  │
├─────────────────────────────────────────────────┤
│  • FIPS 140-2 Mode: ENABLED                      │
│  • CryptoAgent Service: RUNNING                  │
│  • TLS Configuration: HARDENED                   │
│  • Quantum-Safe Ready: YES                       │
└─────────────────────────────────────────────────┘
          ↓ (Network: xencrypt-network)
┌─────────────────────────────────────────────────┐
│   system-scaner-api (Port 9000)                 │
│   Receives scan results from Windows Agent       │
│   Scores based on cryptographic strength        │
└─────────────────────────────────────────────────┘
```

---

## Prerequisites

### 1. Docker Environment
- **Docker Desktop** with Windows containers enabled, OR
- **Docker on Windows Server 2019/2022+**
- Minimum **4GB RAM** dedicated to Docker
- Minimum **20GB free disk space** (Windows base image is large)

### 2. Verify Windows Containers Mode
```powershell
# In PowerShell (as Administrator)
docker version

# Should show:
# OS/Arch: windows/amd64  (NOT linux/amd64)
```

If you're on Linux containers mode, switch to Windows containers:
```powershell
# Docker Desktop: Right-click → Switch to Windows containers
# Or via command line:
& 'C:\Program Files\Docker\Docker\DockerCli.exe' -SwitchDaemon
```

### 3. System Requirements
- **Host OS**: Windows Server 2019+, Windows 10/11 Pro/Enterprise
- **CPU**: Intel/AMD with virtualization enabled
- **RAM**: 8GB+ recommended (4GB minimum)
- **Disk**: SSD recommended for performance

---

## Installation & Setup

### Step 1: Copy Agent Files
The Dockerfile copies agent files from the build context. Ensure these exist:
```
windows-crypto-agent/
├── Dockerfile
├── docker-compose.windows.yml
├── crypto-startup.ps1
└── agents/windows/
    ├── windows_audit.py
    ├── crypto_agent_service_windows.py
    ├── install.py
    └── config_editor.py
```

Copy from system-scaner:
```powershell
# In PowerShell (from endtoend directory)
mkdir -Force windows-crypto-agent
cp -Recurse system-scaner\agents\windows windows-crypto-agent\agents\
cp windows-crypto-agent\Dockerfile .
cp windows-crypto-agent\docker-compose.windows.yml .
cp windows-crypto-agent\crypto-startup.ps1 .
```

### Step 2: Build the Container Image
```powershell
cd windows-crypto-agent

# Build with verbose output
docker build -t quantum-safe-windows-agent:latest `
  --progress=plain `
  .

# This will take ~15-30 minutes first time (downloads 3GB Windows base image)
```

### Step 3: Ensure Network Exists
```powershell
# Check if xencrypt-network exists
docker network ls | findstr xencrypt-network

# If not found, create it:
docker network create -d overlay xencrypt-network

# (Note: overlay network requires Swarm mode on multi-node setups)
# For single Docker host, use bridge instead:
docker network create -d bridge xencrypt-network
```

### Step 4: Start the Container
```powershell
# Option 1: Using docker-compose
docker-compose -f docker-compose.windows.yml up -d windows-crypto-agent

# Option 2: Direct docker command
docker run -d `
  --name quantum-safe-crypto-agent `
  --network xencrypt-network `
  -e AGENT_API_URL=http://system-scaner-api:9000 `
  -e FIPS_MODE_ENABLED=1 `
  -v crypto-agent-data:C:\ProgramData\CryptoAgent `
  --restart unless-stopped `
  quantum-safe-windows-agent:latest
```

### Step 5: Verify Container is Running
```powershell
# Check container status
docker ps -f "name=quantum-safe-crypto-agent"

# Should show: STATUS = "Up X seconds (healthy)"
```

---

## Verification & Testing

### 1. Check FIPS Mode is Enabled
```powershell
docker exec quantum-safe-crypto-agent powershell -Command `
  "(Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy' -Name Enabled).Enabled"

# Expected output: 1 (enabled)
```

### 2. Verify TLS 1.2 is Enabled
```powershell
docker exec quantum-safe-crypto-agent powershell -Command `
  "(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.2\Server' -Name Enabled -ErrorAction SilentlyContinue).Enabled"

# Expected output: 1 (enabled)
```

### 3. Verify SSL 3.0 is DISABLED
```powershell
docker exec quantum-safe-crypto-agent powershell -Command `
  "(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\SSL 3.0\Server' -Name Enabled -ErrorAction SilentlyContinue).Enabled"

# Expected output: 0 or blank (disabled)
```

### 4. Check Agent Service Status
```powershell
docker exec quantum-safe-crypto-agent powershell -Command `
  "Get-Service -Name CryptoAgentService | Select-Object Name, Status"

# Expected output: Status = Running
```

### 5. View Container Logs
```powershell
docker logs -f quantum-safe-crypto-agent

# Shows agent startup messages and configuration verification
```

---

## Perform a System Scan

### 1. Execute Windows Audit Directly
```powershell
docker exec quantum-safe-crypto-agent powershell -Command `
  "cd C:\CryptoAgent; python windows_audit.py | ConvertTo-Json" | ConvertFrom-Json | Format-Table -AutoSize
```

### 2. Send Results to Scoring Service
The agent automatically sends results to `http://system-scaner-api:9000`.  
Check `C:\ProgramData\CryptoAgent\config.json` inside the container:

```powershell
docker exec quantum-safe-crypto-agent powershell -Command `
  "Get-Content C:\ProgramData\CryptoAgent\config.json | ConvertFrom-Json | Format-Table -AutoSize"
```

### 3. View Scoring Results
Once the scan completes, check the system-scaner-api for results:
```powershell
# Query the API
curl http://localhost:9000/api/scans?type=system | python -m json.tool
```

---

## Expected Scores

### Good Score Components ✅
- **FIPS Mode Enabled**: +30 points
- **TLS 1.2/1.3 Active**: +25 points
- **Weak Protocols Disabled**: +20 points
- **Strong Ciphers (AES-256)**: +15 points
- **ECDHE/ECDH Configured**: +10 points

### Estimated Overall Score: **75-90 / 100**

(Compared to ~30-50 on an unconfigured Windows system with SSL 2.0, 3DES, MD5)

---

## Troubleshooting

### Issue: Container won't start
```powershell
# Check Docker service
docker info

# Check image exists
docker images | findstr quantum-safe-windows-agent

# Check container logs
docker logs quantum-safe-crypto-agent

# Rebuild if needed
docker build --no-cache -t quantum-safe-windows-agent:latest .
```

### Issue: Agent service not running
```powershell
# Manual service start
docker exec quantum-safe-crypto-agent powershell -Command `
  "Start-Service -Name CryptoAgentService; Get-Service -Name CryptoAgentService"

# Check for installation errors
docker exec quantum-safe-crypto-agent powershell -Command `
  "Get-EventLog -LogName System -Source 'CryptoAgentService' -ErrorAction SilentlyContinue | Select-Object -First 10"
```

### Issue: FIPS mode not enabled
```powershell
# Manually enable inside running container
docker exec quantum-safe-crypto-agent powershell -Command `
  "Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy' -Name Enabled -Value 1"

# Verify
docker exec quantum-safe-crypto-agent powershell -Command `
  "(Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy' -Name Enabled).Enabled"
```

### Issue: Network connectivity
```powershell
# Test connectivity to system-scaner-api
docker exec quantum-safe-crypto-agent powershell -Command `
  "Test-NetConnection -ComputerName system-scaner-api -Port 9000"

# If xencrypt-network is bridge mode (not overlay):
# Services must be on the same Docker host
```

---

## Advanced Configuration

### Custom API URL
Edit `crypto-startup.ps1` or set via environment variable:
```powershell
docker run -e AGENT_API_URL=http://your-api:9000 ...
```

### Enable/Disable Specific Protocols
Add to crypto-startup.ps1:
```powershell
# Example: Disable TLS 1.2 if you want TLS 1.3 only
Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.2\Server' `
  -Name Enabled -Value 0 -Type DWord
```

### Configure Custom Ciphers
Edit Dockerfile cipher section (around line 95) to add/remove specific ciphers.

---

## Performance Notes

- **Image Size**: ~3.5GB (Windows Server base)
- **Container Runtime**: ~500MB RAM minimum, up to 2-4GB typical
- **First Build**: 15-30 minutes (downloads Windows base image)
- **Subsequent Builds**: 2-5 minutes (cached layers)
- **Scan Duration**: 10-60 seconds (depends on system complexity)

---

## Quantum-Safe Roadmap

Current Windows CryptoAPI does NOT include post-quantum algorithms natively.  
To achieve true post-quantum security, consider:

1. **Windows 12+** (future): May include NIST-approved PQC (Kyber, Dilithium)
2. **Third-Party Libraries**: Install liboqs, rustls-post-quantum, etc.
3. **Hybrid Approach**: Use both classical + PQ algorithms in TLS

For now, this container is **Quantum-Safe Ready** with:
- Modern hash algorithms (SHA-256+)
- Forward secrecy (ECDHE)
- FIPS certification
- Ready for future PQC integration

---

## Security Best Practices

1. **Keep Windows Updated**: Security patches are critical
2. **Run in Isolated Network**: Use Docker networks to isolate containers
3. **Monitor Logs**: Regularly check `docker logs` for issues
4. **Verify FIPS**: Monthly verification that FIPS remains enabled
5. **Backup Configuration**: Save `crypto-agent-data` volume regularly

---

## Cleanup

### Remove Running Container
```powershell
docker-compose -f docker-compose.windows.yml down

# Or manually
docker stop quantum-safe-crypto-agent
docker rm quantum-safe-crypto-agent
```

### Remove Image
```powershell
docker rmi quantum-safe-windows-agent:latest
```

### Remove Volumes
```powershell
docker volume rm crypto-agent-data crypto-agent-logs
```

---

## Support & Documentation

- **Windows Crypto Configuration**: https://docs.microsoft.com/en-us/windows/win32/secauthn/schannel
- **FIPS 140-2 Mode**: https://docs.microsoft.com/en-us/windows/security/threat-protection/security-policy-settings/fips-systems-compliance
- **Docker Windows Containers**: https://docs.docker.com/desktop/windows/
- **CryptoAgent Logs**: Inside container at `C:\CryptoAgent\logs\`

---

**Created**: June 27, 2026  
**Version**: 1.0  
**Status**: Production Ready ✅

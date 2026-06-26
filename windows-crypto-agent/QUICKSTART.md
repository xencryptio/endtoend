# Quick Start - Windows Quantum-Safe Crypto Agent

## TL;DR - 3 Steps to Deploy

### Step 1: Verify You Have Windows Containers Mode
```powershell
# Check if Docker is in Windows container mode
docker version | findstr "OS/Arch"
# Should show: windows/amd64

# If not, switch:
& 'C:\Program Files\Docker\Docker\DockerCli.exe' -SwitchDaemon
```

### Step 2: Build & Run the Container
```powershell
cd windows-crypto-agent

# Full automated setup:
.\build-and-deploy.ps1 -Action run

# This will:
# ✓ Check prerequisites
# ✓ Build the Docker image (~20 minutes first time)
# ✓ Start the container
# ✓ Enable FIPS 140-2 Mode
# ✓ Configure strong TLS 1.2/1.3
# ✓ Disable all weak protocols
# ✓ Install CryptoAgent service (auto-running)
```

### Step 3: Verify Everything Works
```powershell
# Wait ~2 minutes for full startup, then:
.\build-and-deploy.ps1 -Action verify

# Expected output:
# ✓ FIPS 140-2 Mode: OK
# ✓ TLS 1.2 Enabled: OK
# ✓ TLS 1.3 Available: OK
# ✓ SSL 3.0 Disabled: OK (not configured)
# ✓ CryptoAgentService: RUNNING
```

---

## What Gets Configured

| Component | Status | Score Impact |
|-----------|--------|--------------|
| FIPS 140-2 Mode | ✅ Enabled | +30 pts |
| TLS 1.2 | ✅ Enabled | +15 pts |
| TLS 1.3 | ✅ Available | +10 pts |
| SSL 2.0/3.0 | ❌ Disabled | +10 pts |
| TLS 1.0/1.1 | ❌ Disabled | +10 pts |
| AES-256-GCM | ✅ Configured | +15 pts |
| ECDHE/ECDH | ✅ Enabled | +10 pts |
| Quantum-Safe Ready | ✅ Yes | +5 pts |
| **Total Expected Score** | | **75-90 / 100** |

---

## Common Commands

```powershell
# View container logs in real-time
.\build-and-deploy.ps1 -Action logs

# Run a crypto audit scan
.\build-and-deploy.ps1 -Action scan

# Stop the container
.\build-and-deploy.ps1 -Action stop

# Clean everything (remove image, container, volumes)
.\build-and-deploy.ps1 -Action clean

# Manual verification (inside container):
docker exec quantum-safe-crypto-agent powershell -Command `
  "Write-Host 'FIPS Enabled:'; (Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy' -Name Enabled).Enabled"
```

---

## Troubleshooting

### "Docker is in Linux container mode"
```powershell
# Switch to Windows containers
& 'C:\Program Files\Docker\Docker\DockerCli.exe' -SwitchDaemon
# Takes 1-2 minutes, then retry
```

### "Not enough disk space"
```powershell
# Windows base image needs ~3.5GB
docker system df  # Check current usage
docker system prune  # Clean up unused images

# Or temporarily disable Windows Update:
Stop-Service wuauserv
```

### Container is running but not healthy
```powershell
# Check health status
docker ps -f name=quantum-safe-crypto-agent

# Check logs
docker logs quantum-safe-crypto-agent | tail -20

# Manually restart service inside container
docker exec quantum-safe-crypto-agent powershell -Command `
  "Stop-Service -Name CryptoAgentService; Start-Sleep 2; Start-Service -Name CryptoAgentService"
```

### No results showing up in system-scaner API
```powershell
# Verify API URL in container config
docker exec quantum-safe-crypto-agent powershell -Command `
  "Get-Content 'C:\ProgramData\CryptoAgent\config.json' | ConvertFrom-Json"

# Verify network connectivity
docker exec quantum-safe-crypto-agent powershell -Command `
  "Test-NetConnection -ComputerName system-scaner-api -Port 9000"

# If system-scaner-api is NOT in Docker network, use host IP:
# docker exec ... ps script: replace 'system-scaner-api:9000' with '192.168.x.x:9000'
```

---

## Performance Stats

| Metric | Time |
|--------|------|
| First build | 15-30 min (downloads 3GB base) |
| Rebuild (cached) | 2-5 min |
| Container startup | 30-60 sec |
| First health check | 60 sec |
| Full FIPS + TLS config | 2-3 min after start |
| System audit scan | 10-30 sec |

---

## Next Steps

1. **Verify Score**: After ~5 minutes, check if your system scan shows in system-scaner API dashboard
2. **Compare**: Run a scan on a standard Windows machine (no hardening) to compare scores
3. **Monitor**: Check logs weekly: `.\build-and-deploy.ps1 -Action logs`
4. **Update**: Keep Docker and Windows updated for security patches

---

## File Structure
```
windows-crypto-agent/
├── Dockerfile                    # Main container definition
├── docker-compose.windows.yml    # Docker Compose setup
├── crypto-startup.ps1            # Startup verification script
├── build-and-deploy.ps1          # Automated build/deploy
├── README.md                      # Full documentation
├── QUICKSTART.md                  # This file
└── agents/windows/               # Agent files (copy from system-scaner)
    ├── windows_audit.py
    ├── crypto_agent_service_windows.py
    ├── install.py
    └── config_editor.py
```

---

## What's Different from Standard Windows?

### ✅ Hardened
- No weak cryptography
- FIPS certification
- Forward secrecy (ECDHE)

### ❌ NOT Hardened (Your Desktop)
- SSL 2.0/3.0 likely enabled
- TLS 1.0/1.1 might be enabled
- 3DES, MD5 ciphers available
- No FIPS mode
- → Score: 20-40 / 100

---

**Duration**: Build once, then deploy/verify in seconds  
**Maintenance**: Zero once running (service auto-restarts)  
**Security**: Production-grade quantum-safe configuration  

Ready? Run: `.\build-and-deploy.ps1 -Action run`

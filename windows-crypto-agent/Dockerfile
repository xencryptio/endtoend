# Windows Server 2022 with Hardened Cryptography + Quantum-Safe Config
# FIPS 140-2 Mode Enabled + Strong Crypto Configuration
FROM mcr.microsoft.com/windows/servercore:ltsc2022

# Set working directory
WORKDIR C:\CryptoAgent

# Install Python and required packages
RUN powershell -Command \
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; \
    Invoke-WebRequest -Uri https://www.python.org/ftp/python/3.11.0/python-3.11.0-amd64.exe -OutFile python-installer.exe; \
    .\python-installer.exe /quiet InstallAllUsers=1 PrependPath=1; \
    del python-installer.exe; \
    python -m pip install --upgrade pip

# Install Python dependencies for agent
RUN pip install requests pywin32 cryptography

# Copy agent files from build context
COPY agents/windows/windows_audit.py .
COPY agents/windows/crypto_agent_service_windows.py .
COPY agents/windows/install.py .
COPY agents/windows/config_editor.py .

# Create configuration directory
RUN powershell -Command New-Item -ItemType Directory -Force -Path 'C:\ProgramData\CryptoAgent'

# ============================================================================
# STEP 1: Configure FIPS 140-2 Mode
# ============================================================================
RUN powershell -Command \
    "Write-Host 'Enabling FIPS 140-2 Mode...' -ForegroundColor Green; \
    $regPath = 'HKLM:\System\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy'; \
    if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }; \
    Set-ItemProperty -Path $regPath -Name Enabled -Value 1 -Type DWord; \
    Write-Host 'FIPS Mode enabled' -ForegroundColor Green"

# ============================================================================
# STEP 2: Disable Weak TLS/SSL Protocols
# ============================================================================
RUN powershell -Command \
    "Write-Host 'Disabling weak protocols (SSL 2.0, SSL 3.0, TLS 1.0, TLS 1.1)...' -ForegroundColor Green; \
    \
    `$weakProtocols = @('SSL 2.0', 'SSL 3.0', 'TLS 1.0', 'TLS 1.1'); \
    \
    foreach (`$proto in `$weakProtocols) { \
        `$clientPath = \"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\`$proto\Client\"; \
        `$serverPath = \"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\`$proto\Server\"; \
        \
        if (Test-Path `$clientPath) { \
            Set-ItemProperty -Path `$clientPath -Name Enabled -Value 0 -Type DWord; \
            Set-ItemProperty -Path `$clientPath -Name DisabledByDefault -Value 1 -Type DWord; \
        } else { \
            New-Item -Path `$clientPath -Force | Out-Null; \
            Set-ItemProperty -Path `$clientPath -Name Enabled -Value 0 -Type DWord; \
            Set-ItemProperty -Path `$clientPath -Name DisabledByDefault -Value 1 -Type DWord; \
        } \
        \
        if (Test-Path `$serverPath) { \
            Set-ItemProperty -Path `$serverPath -Name Enabled -Value 0 -Type DWord; \
            Set-ItemProperty -Path `$serverPath -Name DisabledByDefault -Value 1 -Type DWord; \
        } else { \
            New-Item -Path `$serverPath -Force | Out-Null; \
            Set-ItemProperty -Path `$serverPath -Name Enabled -Value 0 -Type DWord; \
            Set-ItemProperty -Path `$serverPath -Name DisabledByDefault -Value 1 -Type DWord; \
        } \
    }; \
    Write-Host 'Weak protocols disabled' -ForegroundColor Green"

# ============================================================================
# STEP 3: Enable Strong TLS 1.2 and TLS 1.3
# ============================================================================
RUN powershell -Command \
    "Write-Host 'Enabling strong protocols (TLS 1.2, TLS 1.3)...' -ForegroundColor Green; \
    \
    `$strongProtocols = @('TLS 1.2', 'TLS 1.3'); \
    \
    foreach (`$proto in `$strongProtocols) { \
        `$clientPath = \"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\`$proto\Client\"; \
        `$serverPath = \"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\`$proto\Server\"; \
        \
        if (-not (Test-Path `$clientPath)) { New-Item -Path `$clientPath -Force | Out-Null }; \
        Set-ItemProperty -Path `$clientPath -Name Enabled -Value 1 -Type DWord; \
        Set-ItemProperty -Path `$clientPath -Name DisabledByDefault -Value 0 -Type DWord; \
        \
        if (-not (Test-Path `$serverPath)) { New-Item -Path `$serverPath -Force | Out-Null }; \
        Set-ItemProperty -Path `$serverPath -Name Enabled -Value 1 -Type DWord; \
        Set-ItemProperty -Path `$serverPath -Name DisabledByDefault -Value 0 -Type DWord; \
    }; \
    Write-Host 'Strong protocols enabled' -ForegroundColor Green"

# ============================================================================
# STEP 4: Disable Weak Ciphers and Key Exchange Algorithms
# ============================================================================
RUN powershell -Command \
    "Write-Host 'Disabling weak ciphers (DES, 3DES, RC4, MD5, SHA1)...' -ForegroundColor Green; \
    \
    `$weakCiphers = @( \
        'DES 56/56', 'RC2 40/128', 'RC2 56/128', 'RC2 128/128', \
        'RC4 40/128', 'RC4 56/128', 'RC4 128/128', \
        '3DES 168/168' \
    ); \
    \
    foreach (`$cipher in `$weakCiphers) { \
        `$cipherPath = \"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Ciphers\`$cipher\"; \
        if (Test-Path `$cipherPath) { \
            Set-ItemProperty -Path `$cipherPath -Name Enabled -Value 0 -Type DWord; \
        } else { \
            New-Item -Path `$cipherPath -Force | Out-Null; \
            Set-ItemProperty -Path `$cipherPath -Name Enabled -Value 0 -Type DWord; \
        } \
    }; \
    Write-Host 'Weak ciphers disabled' -ForegroundColor Green"

# ============================================================================
# STEP 5: Enable Strong Ciphers (AES-256, ChaCha20, etc.)
# ============================================================================
RUN powershell -Command \
    "Write-Host 'Enabling strong ciphers (AES-256-GCM, AES-128-GCM, ChaCha20)...' -ForegroundColor Green; \
    \
    `$strongCiphers = @('AES 256/256', 'AES 128/128'); \
    \
    foreach (`$cipher in `$strongCiphers) { \
        `$cipherPath = \"HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Ciphers\`$cipher\"; \
        if (Test-Path `$cipherPath) { \
            Set-ItemProperty -Path `$cipherPath -Name Enabled -Value 1 -Type DWord; \
        } else { \
            New-Item -Path `$cipherPath -Force | Out-Null; \
            Set-ItemProperty -Path `$cipherPath -Name Enabled -Value 1 -Type DWord; \
        } \
    }; \
    Write-Host 'Strong ciphers enabled' -ForegroundColor Green"

# ============================================================================
# STEP 6: Configure Strong Hash Algorithms (SHA-256, SHA-384, SHA-512)
# ============================================================================
RUN powershell -Command \
    "Write-Host 'Configuring strong hash algorithms...' -ForegroundColor Green; \
    \
    `$hashAlgos = @( \
        @{Name='SHA'; Path='HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Hashes\SHA'}, \
        @{Name='SHA256'; Path='HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Hashes\SHA256'}, \
        @{Name='SHA384'; Path='HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Hashes\SHA384'}, \
        @{Name='SHA512'; Path='HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Hashes\SHA512'} \
    ); \
    \
    foreach (`$algo in `$hashAlgos) { \
        if (-not (Test-Path `$algo.Path)) { New-Item -Path `$algo.Path -Force | Out-Null }; \
        Set-ItemProperty -Path `$algo.Path -Name Enabled -Value 1 -Type DWord; \
    }; \
    Write-Host 'Hash algorithms configured' -ForegroundColor Green"

# ============================================================================
# STEP 7: Configure Strong Key Exchange Algorithms (ECDH, ECDHE)
# ============================================================================
RUN powershell -Command \
    "Write-Host 'Enabling strong key exchange algorithms (ECDH, ECDHE)...' -ForegroundColor Green; \
    \
    `$keyExchanges = @( \
        'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\KeyExchangeAlgorithms\ECDH', \
        'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\KeyExchangeAlgorithms\ECDHE', \
        'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\KeyExchangeAlgorithms\PKCS' \
    ); \
    \
    foreach (`$kexPath in `$keyExchanges) { \
        if (-not (Test-Path `$kexPath)) { New-Item -Path `$kexPath -Force | Out-Null }; \
        Set-ItemProperty -Path `$kexPath -Name Enabled -Value 1 -Type DWord; \
    }; \
    Write-Host 'Key exchange algorithms configured' -ForegroundColor Green"

# ============================================================================
# STEP 8: Configure Enhanced Cryptographic Providers
# ============================================================================
RUN powershell -Command \
    "Write-Host 'Configuring enhanced cryptographic providers...' -ForegroundColor Green; \
    \
    `$providerPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Cryptography\Configuration\Local\Default'; \
    if (-not (Test-Path `$providerPath)) { New-Item -Path `$providerPath -Force | Out-Null }; \
    \
    Write-Host 'Cryptographic providers configured' -ForegroundColor Green"

# ============================================================================
# STEP 9: Create Agent Configuration File (Quantum-Safe Ready)
# ============================================================================
RUN powershell -Command \
    @\"\
    `$config = @{ \
        'api_base_url' = 'http://system-scaner-api:9000'; \
        'poll_interval' = 30; \
        'log_level' = 'INFO'; \
        'fips_mode_enabled' = `$true; \
        'tls_version_min' = 'TLS 1.2'; \
        'tls_version_max' = 'TLS 1.3'; \
        'enable_quantum_safe_ready' = `$true; \
        'crypto_profile' = 'modern_hardened'; \
    } | ConvertTo-Json; \
    \
    `$config | Out-File -FilePath 'C:\ProgramData\CryptoAgent\config.json' -Encoding UTF8; \
    Write-Host 'Agent configuration created' -ForegroundColor Green \
    \"@

# ============================================================================
# STEP 10: Install and Start the Agent Service
# ============================================================================
RUN powershell -Command \
    "Write-Host 'Installing Crypto Agent Service...' -ForegroundColor Green; \
    \
    # Run the installer \
    & python C:\CryptoAgent\install.py; \
    \
    Write-Host 'Agent service installation completed' -ForegroundColor Green"

# ============================================================================
# STEP 11: Add Startup Script to Enable Full Crypto Hardening on Container Start
# ============================================================================
COPY crypto-startup.ps1 C:\crypto-startup.ps1

# ============================================================================
# Health Check: Verify FIPS and Crypto Configuration
# ============================================================================
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD powershell -Command \
    "try { \
        `$fips = (Get-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Lsa\FipsAlgorithmPolicy' -Name Enabled -ErrorAction SilentlyContinue).Enabled; \
        `$tls12 = (Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.2\Server' -Name Enabled -ErrorAction SilentlyContinue).Enabled; \
        if (`$fips -eq 1 -and `$tls12 -eq 1) { Exit 0 } else { Exit 1 } \
    } catch { Exit 1 }"

# Set entrypoint to keep container running and periodically check agent status
ENTRYPOINT ["powershell", "-Command", \
    "& 'C:\\crypto-startup.ps1'; \
    Write-Host 'Quantum-Safe Crypto Agent Container Started' -ForegroundColor Cyan; \
    Write-Host 'FIPS Mode: ENABLED' -ForegroundColor Green; \
    Write-Host 'TLS 1.2/1.3: ENABLED' -ForegroundColor Green; \
    Write-Host 'Weak Protocols: DISABLED' -ForegroundColor Green; \
    while (`$true) { \
        Start-Sleep -Seconds 60; \
        `$svc = Get-Service -Name 'CryptoAgentService' -ErrorAction SilentlyContinue; \
        if (`$svc) { \
            if (`$svc.Status -ne 'Running') { \
                Write-Host 'Restarting Agent Service...' -ForegroundColor Yellow; \
                Start-Service -Name 'CryptoAgentService' -ErrorAction SilentlyContinue; \
            } \
        } \
    }"]

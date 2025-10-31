#!/bin/bash
# =============================================================================
# CRYPTO AGENT ENTRYPOINT - Container Startup Script
# =============================================================================
# This script runs when the container starts
# Cross-platform compatible (works in Ubuntu, Debian, Alpine containers)
# =============================================================================

set -e

echo "=========================================="
echo "CRYPTO AGENT STARTING"
echo "=========================================="
echo "Profile: ${AGENT_PROFILE:-unknown}"
echo "Hostname: $(hostname)"
echo "API Server: ${CRYPTO_API_BASE_URL}"
echo "Poll Interval: ${CRYPTO_POLL_INTERVAL}s"
echo "=========================================="

# Wait for API server to be ready
echo "[*] Waiting for API server..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if python3 -c "import requests; requests.get('${CRYPTO_API_BASE_URL}/api/v1/admin/stats', timeout=5)" 2>/dev/null; then
        echo "[+] API server is ready!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "    Attempt $RETRY_COUNT/$MAX_RETRIES..."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "[!] WARNING: Could not reach API server after $MAX_RETRIES attempts"
    echo "[!] Agent will continue but may have connection issues"
fi

# Display crypto configuration summary
echo ""
echo "=========================================="
echo "CRYPTO CONFIGURATION SUMMARY"
echo "=========================================="

# OpenSSL version
echo "[*] OpenSSL Version:"
openssl version

# Show configured ciphers
echo ""
echo "[*] Available Cipher Suites (first 10):"
openssl ciphers -v ALL 2>/dev/null | head -10 || echo "    Could not list ciphers"

# Show SSH configuration
if [ -f /etc/ssh/sshd_config ]; then
    echo ""
    echo "[*] SSH Cipher Configuration:"
    grep "^Ciphers" /etc/ssh/sshd_config || echo "    Default ciphers"
    
    echo ""
    echo "[*] SSH MAC Configuration:"
    grep "^MACs" /etc/ssh/sshd_config || echo "    Default MACs"
fi

# Show certificate information
echo ""
echo "[*] Generated Certificates:"
for cert in /etc/ssl/certs/*.crt; do
    if [ -f "$cert" ]; then
        echo "    - $(basename $cert)"
        openssl x509 -in "$cert" -noout -subject -issuer -dates 2>/dev/null | sed 's/^/      /'
    fi
done

echo "=========================================="
echo ""

# Ensure log directory exists
mkdir -p /var/log

# Start SSH service if available (for audit purposes)
if command -v sshd >/dev/null 2>&1; then
    echo "[*] Starting SSH daemon (for audit)..."
    if [ -d /run/sshd ]; then
        /usr/sbin/sshd -D &
    fi
fi

# Create agent ID directory
mkdir -p /var/lib/crypto_agent

echo "[+] Starting Crypto Agent Service..."
echo ""

# Run the agent service
exec python3 /opt/crypto-agent/crypto_agent_service.py
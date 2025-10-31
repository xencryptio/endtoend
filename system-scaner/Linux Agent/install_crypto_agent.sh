#!/bin/bash

# Crypto Agent Installation Script
# Usage: sudo ./install_crypto_agent.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/crypto-agent"
SERVICE_FILE="/etc/systemd/system/crypto-agent.service"
LOG_FILE="/var/log/crypto_agent.log"
AGENT_ID_DIR="/var/lib/crypto_agent"

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Crypto Agent Service Installer${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

# Check if required files exist in current directory
REQUIRED_FILES=("crypto_agent_service.py" "linux_server.py" "crypto-agent.service")
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}Error: Required file '$file' not found in current directory${NC}"
        exit 1
    fi
done

echo -e "${YELLOW}[1/7]${NC} Creating installation directory..."
mkdir -p "$INSTALL_DIR"
echo -e "${GREEN}✓${NC} Created $INSTALL_DIR"

echo -e "${YELLOW}[2/7]${NC} Copying application files..."
cp crypto_agent_service.py "$INSTALL_DIR/"
cp linux_server.py "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/crypto_agent_service.py"
echo -e "${GREEN}✓${NC} Copied application files"

echo -e "${YELLOW}[3/7]${NC} Creating required directories..."
mkdir -p "$AGENT_ID_DIR"
touch "$LOG_FILE"
chmod 644 "$LOG_FILE"
echo -e "${GREEN}✓${NC} Created directories and log file"

echo -e "${YELLOW}[4/7]${NC} Installing systemd service..."
cp crypto-agent.service "$SERVICE_FILE"
echo -e "${GREEN}✓${NC} Copied service file to $SERVICE_FILE"

echo -e "${YELLOW}[5/7]${NC} Reloading systemd daemon..."
systemctl daemon-reload
echo -e "${GREEN}✓${NC} Systemd daemon reloaded"

echo -e "${YELLOW}[6/7]${NC} Enabling crypto-agent service..."
systemctl enable crypto-agent.service
echo -e "${GREEN}✓${NC} Service enabled (will start on boot)"

echo -e "${YELLOW}[7/7]${NC} Starting crypto-agent service..."
systemctl start crypto-agent.service
sleep 2

# Check service status
if systemctl is-active --quiet crypto-agent.service; then
    echo -e "${GREEN}✓${NC} Service started successfully"
else
    echo -e "${RED}✗${NC} Service failed to start"
    echo -e "${YELLOW}Service status:${NC}"
    systemctl status crypto-agent.service --no-pager
    exit 1
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Installation Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "Service Status: ${GREEN}RUNNING${NC}"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "  Check status:   systemctl status crypto-agent.service"
echo "  View logs:      journalctl -u crypto-agent.service -f"
echo "  View log file:  tail -f $LOG_FILE"
echo "  Stop service:   systemctl stop crypto-agent.service"
echo "  Start service:  systemctl start crypto-agent.service"
echo "  Restart:        systemctl restart crypto-agent.service"
echo "  Disable:        systemctl disable crypto-agent.service"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Edit service config: nano $SERVICE_FILE"
echo "  After editing:       systemctl daemon-reload && systemctl restart crypto-agent.service"
echo ""
echo -e "${YELLOW}Installation Location:${NC}"
echo "  Application: $INSTALL_DIR"
echo "  Service:     $SERVICE_FILE"
echo "  Logs:        $LOG_FILE"
echo "  Agent ID:    $AGENT_ID_DIR/agent_id"
echo ""
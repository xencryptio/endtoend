#!/bin/bash

# Crypto Agent Uninstallation Script
# Usage: sudo ./uninstall_crypto_agent.sh

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

echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}  Crypto Agent Service Uninstaller${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

# Confirm uninstallation
read -p "Are you sure you want to uninstall Crypto Agent Service? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Uninstallation cancelled${NC}"
    exit 0
fi

echo -e "${YELLOW}[1/5]${NC} Stopping crypto-agent service..."
if systemctl is-active --quiet crypto-agent.service; then
    systemctl stop crypto-agent.service
    echo -e "${GREEN}✓${NC} Service stopped"
else
    echo -e "${YELLOW}✓${NC} Service was not running"
fi

echo -e "${YELLOW}[2/5]${NC} Disabling crypto-agent service..."
if systemctl is-enabled --quiet crypto-agent.service 2>/dev/null; then
    systemctl disable crypto-agent.service
    echo -e "${GREEN}✓${NC} Service disabled"
else
    echo -e "${YELLOW}✓${NC} Service was not enabled"
fi

echo -e "${YELLOW}[3/5]${NC} Removing service file..."
if [ -f "$SERVICE_FILE" ]; then
    rm -f "$SERVICE_FILE"
    echo -e "${GREEN}✓${NC} Removed $SERVICE_FILE"
else
    echo -e "${YELLOW}✓${NC} Service file not found"
fi

echo -e "${YELLOW}[4/5]${NC} Reloading systemd daemon..."
systemctl daemon-reload
systemctl reset-failed
echo -e "${GREEN}✓${NC} Systemd daemon reloaded"

echo -e "${YELLOW}[5/5]${NC} Removing installation files..."
if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}✓${NC} Removed $INSTALL_DIR"
else
    echo -e "${YELLOW}✓${NC} Installation directory not found"
fi

# Ask if user wants to remove logs and agent ID
echo ""
read -p "Do you want to remove logs and agent ID? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "$LOG_FILE" ]; then
        rm -f "$LOG_FILE"
        echo -e "${GREEN}✓${NC} Removed $LOG_FILE"
    fi
    if [ -d "$AGENT_ID_DIR" ]; then
        rm -rf "$AGENT_ID_DIR"
        echo -e "${GREEN}✓${NC} Removed $AGENT_ID_DIR"
    fi
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Uninstallation Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
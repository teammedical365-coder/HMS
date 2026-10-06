#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# install-service.sh — Medical365 Local Agent systemd service installer
#
# Configures Medical365 Local Agent to run as a persistent background service
# on Linux (Ubuntu/Debian/RHEL/CentOS) with automatic restart on boot and crashes.
#
# Usage:
#   sudo chmod +x install-service.sh
#   sudo ./install-service.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SERVICE_NAME="medical365-agent"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(which node || echo "/usr/bin/node")"

echo "=== Medical365 Local Agent Service Installer ==="
echo "Agent Directory: $AGENT_DIR"
echo "Node Binary:     $NODE_BIN"

if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run as root (sudo ./install-service.sh)"
  exit 1
fi

if [ ! -f "$AGENT_DIR/agent.js" ]; then
  echo "Error: agent.js not found in $AGENT_DIR"
  exit 1
fi

# Verify config.json exists
if [ ! -f "$AGENT_DIR/config.json" ]; then
  echo "Warning: config.json not found in $AGENT_DIR."
  echo "Creating default template from config.example.json..."
  cp "$AGENT_DIR/config.example.json" "$AGENT_DIR/config.json"
fi

cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=Medical365 Local Sync Agent
After=network.target mongod.service
Wants=mongod.service

[Service]
Type=simple
User=root
WorkingDirectory=${AGENT_DIR}
ExecStart=${NODE_BIN} agent.js
Restart=always
RestartSec=5
StandardOutput=append:/var/log/medical365-agent.log
StandardError=append:/var/log/medical365-agent.err
Environment=NODE_ENV=production

# Hardening
ProtectSystem=full
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

chmod 644 "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

echo "=== Installation Complete ==="
echo "Service '${SERVICE_NAME}' is now enabled and running."
echo "Check status:  sudo systemctl status ${SERVICE_NAME}"
echo "View logs:     sudo journalctl -u ${SERVICE_NAME} -f"

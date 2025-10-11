#!/usr/bin/env bash
set -euo pipefail

# Installs a systemd service for TallyHub-Pi
# Usage: sudo ./scripts/install-systemd.sh

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_FILE="/etc/systemd/system/tallyhub-pi.service"
USER_NAME=${SUDO_USER:-${USER}}

cat <<SERVICE | sudo tee "$SERVICE_FILE" >/dev/null
[Unit]
Description=TallyHub-Pi Server
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/env node server/server.js
Restart=always
Environment=PORT=8080
Environment=UPSTREAM_MANIFEST=https://raw.githubusercontent.com/tallyhubpro/Tallyhub/main/public/firmware/firmware-manifest.json
Environment=CACHE_TTL_MS=60000

[Install]
WantedBy=multi-user.target
SERVICE

echo "Service installed at $SERVICE_FILE"
echo "Run: sudo systemctl daemon-reload && sudo systemctl enable tallyhub-pi && sudo systemctl start tallyhub-pi"

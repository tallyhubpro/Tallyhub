#!/usr/bin/env bash
set -euo pipefail

G='\033[0;32m'; Y='\033[0;33m'; R='\033[0;31m'; NC='\033[0m'

log() { echo -e "${G}[TallyHub]${NC} $*"; }
warn() { echo -e "${Y}[TallyHub] $*${NC}"; }
err() { echo -e "${R}[TallyHub ERROR] $*${NC}" 1>&2; }

need_node() {
  if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE 'v1[89]|v20'; then
    warn "Node >=18 not found (or older). Installing Node 20 via nvm..."
    if [ ! -d "$HOME/.nvm" ]; then
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    fi
    # shellcheck source=/dev/null
    source "$HOME/.nvm/nvm.sh"
    nvm install 20
    nvm alias default 20
  else
    log "Node present: $(node -v)"
  fi
  # shellcheck source=/dev/null
  [ -f "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
}

ensure_env() {
  if [ ! -f .env ]; then
    cat > .env <<EOF
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
NODE_ENV=production
EOF
    log "Created default .env"
  fi
}

install_deps() {
  if [ ! -d node_modules ]; then
    log "Installing dependencies (npm ci)"
    npm ci
  else
    log "Dependencies exist. Running incremental install"
    npm install --no-audit --no-fund
  fi
}

build_app() {
  log "Building TypeScript -> dist"
  npm run build
}

start_foreground() {
  log "Starting server in foreground (CTRL+C to stop)"
  NODE_ENV=production LOG_LEVEL=${LOG_LEVEL:-info} node dist/index.js
}

install_service() {
  local svc=/etc/systemd/system/tallyhub.service
  if [ -f "$svc" ]; then
    warn "Service already exists. Restarting..."
    sudo systemctl restart tallyhub
    return
  fi
  log "Creating systemd service"
  sudo tee "$svc" >/dev/null <<EOF
[Unit]
Description=Tally Hub Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$(pwd)
Environment=NODE_ENV=production
Environment=LOG_LEVEL=info
ExecStart=$(command -v node) dist/index.js
Restart=on-failure
RestartSec=3
User=pi
Group=pi
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable tallyhub
  sudo systemctl start tallyhub
  log "Service installed. Logs: journalctl -u tallyhub -f"
}

usage() {
  cat <<EOF
Usage: $0 [--service]

Without flags: installs deps (if needed), builds, runs in foreground.
--service: installs as systemd service and starts it.
EOF
}

main() {
  local SERVICE=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --service) SERVICE=1 ;;
      -h|--help) usage; exit 0 ;;
      *) err "Unknown option $1"; usage; exit 1 ;;
    esac
    shift
  done

  need_node
  ensure_env
  install_deps
  build_app

  if [ $SERVICE -eq 1 ]; then
    install_service
  else
    start_foreground
  fi
}

main "$@"

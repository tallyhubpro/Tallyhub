#!/usr/bin/env bash
# TallyHub Raspberry Pi Installer / Updater
# Usage (fresh):  curl -fsSL https://raw.githubusercontent.com/tallyhubpro/Tallyhub/main/scripts/install-pi.sh | bash
# Usage (with service): curl -fsSL https://raw.githubusercontent.com/tallyhubpro/Tallyhub/main/scripts/install-pi.sh | bash -s -- --service
set -euo pipefail

G='\033[0;32m'; Y='\033[0;33m'; R='\033[0;31m'; NC='\033[0m'
log(){ echo -e "${G}[tallyhub]${NC} $*"; }
warn(){ echo -e "${Y}[tallyhub] WARN:${NC} $*"; }
err(){ echo -e "${R}[tallyhub] ERROR:${NC} $*" 1>&2; }

REPO_URL="https://github.com/tallyhubpro/Tallyhub.git"
APP_DIR="$HOME/Tallyhub"
SERVICE=0
BRANCH="main"

while [ $# -gt 0 ]; do
  case "$1" in
    --service) SERVICE=1 ;;
    --branch) shift; BRANCH="$1" ;;
    -h|--help)
      cat <<EOF
TallyHub Installer
Options:
  --service        Install/enable systemd service (tallyhub)
  --branch <name>  Use alternate branch (default: main)
  --help           Show this help
EOF
      exit 0
      ;;
    *) warn "Unknown arg: $1" ;;
  esac
  shift
done

ensure_packages(){
  log "Installing base packages (git, curl, build-essential, python3)..."
  sudo apt update -y
  sudo apt install -y git curl build-essential python3
}

ensure_node(){
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

clone_or_update(){
  if [ -d "$APP_DIR/.git" ]; then
    log "Updating existing repo..."
    git -C "$APP_DIR" fetch --all --prune
    git -C "$APP_DIR" checkout "$BRANCH"
    git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  else
    log "Cloning repository..."
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

create_env(){
  if [ ! -f "$APP_DIR/.env" ]; then
    cat > "$APP_DIR/.env" <<EOF
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
NODE_ENV=production
EOF
    log "Created default .env"
  fi
}

install_deps_build(){
  cd "$APP_DIR"
  if [ ! -d node_modules ]; then
    log "Installing dependencies (npm ci)"
    npm ci
  else
    log "Incremental dependency update (npm install)"
    npm install --no-audit --no-fund
  fi
  log "Building project"
  npm run build
}

install_service(){
  local svc=/etc/systemd/system/tallyhub.service
  if [ -f "$svc" ]; then
    log "Service already exists. Restarting..."
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
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=LOG_LEVEL=info
ExecStart=$(command -v node) dist/index.js
Restart=on-failure
RestartSec=3
User=$USER
Group=$USER
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

run_foreground(){
  cd "$APP_DIR"
  log "Starting foreground server (CTRL+C to stop)"
  NODE_ENV=production LOG_LEVEL=info node dist/index.js
}

main(){
  ensure_packages
  ensure_node
  clone_or_update
  create_env
  install_deps_build
  if [ $SERVICE -eq 1 ]; then
    install_service
  else
    run_foreground
  fi
}

main "$@"

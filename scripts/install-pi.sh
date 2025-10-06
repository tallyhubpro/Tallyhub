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
  # Attempt to ensure a recent Node.js (>=18) is present.
  # Preference order: existing system node -> nvm install -> NodeSource apt fallback.
  local NEED_NODE=0
  if ! command -v node >/dev/null 2>&1; then
    NEED_NODE=1
  else
    if ! node -v | grep -qE 'v1[89]|v20'; then
      NEED_NODE=1
    fi
  fi

  if [ $NEED_NODE -eq 0 ]; then
    log "Node present: $(node -v)"
  else
    warn "Node >=18 not found (or too old). Attempting nvm install of Node 20..."
    export NVM_DIR="$HOME/.nvm"
    if [ ! -d "$NVM_DIR" ]; then
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    fi
    # shellcheck source=/dev/null
    if [ -s "$NVM_DIR/nvm.sh" ]; then
      . "$NVM_DIR/nvm.sh"
    fi
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"

    if command -v nvm >/dev/null 2>&1; then
      nvm install 20
      nvm alias default 20
    else
      warn "nvm not available after install attempt. Falling back to NodeSource (system-wide)"
      if command -v apt >/dev/null 2>&1; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt install -y nodejs
      else
        err "apt not available; cannot install Node.js automatically. Please install Node 18+ manually and re-run."
        exit 1
      fi
    fi
  fi

  # Re-source nvm for current shell if present so subsequent npm commands use it.
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  if command -v node >/dev/null 2>&1; then
    log "Using Node: $(command -v node) ($(node -v))"
  else
    err "Node installation failed; aborting."
    exit 1
  fi
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
  local NODE_BIN
  NODE_BIN="$(command -v node)"
  if [ -z "$NODE_BIN" ]; then
    err "Cannot determine node binary path for service. Aborting."
    exit 1
  fi
  sudo tee "$svc" >/dev/null <<EOF
[Unit]
Description=Tally Hub Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=LOG_LEVEL=info
ExecStart=$NODE_BIN dist/index.js
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

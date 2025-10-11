#!/usr/bin/env bash
set -euo pipefail

# One-line installer for TallyHub-Pi
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/tallyhubpro/Tallyhub/main/TallyHub-Pi/scripts/quick-install.sh | bash

REPO="https://github.com/tallyhubpro/Tallyhub.git"
BRANCH="main"
APP_DIR="$HOME/tallyhub-pi"
SUBDIR="TallyHub-Pi"
FULLSRC="." # fetch root for building into subfolder with sparse include list

log(){ echo -e "\033[1;32m[+]\033[0m $*"; }
err(){ echo -e "\033[1;31m[!]\033[0m $*" >&2; }

# Ensure basic tools
if ! command -v git >/dev/null 2>&1; then
  log "Installing git...";
  sudo apt-get update -y && sudo apt-get install -y git
fi

# Ensure Node.js 18+
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v | sed 's/v//')
  MAJOR=${NODE_VER%%.*}
  if [ "$MAJOR" -lt 18 ]; then
    log "Node < 18 detected ($NODE_VER). Installing Node 18 via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
else
  log "Installing Node 18 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Use sparse checkout to fetch only TallyHub-Pi directory
log "Fetching repository (sparse checkout: $SUBDIR)..."
rm -rf "$APP_DIR.tmp" "$APP_DIR"
mkdir -p "$APP_DIR.tmp"
cd "$APP_DIR.tmp"

git init
git remote add origin "$REPO"
git config core.sparseCheckout true
mkdir -p .git/info
{
  echo "$SUBDIR/*"
  echo "bin/*"
  echo "dist/*"
  echo "public/*"
  echo "src/*"
  echo "package.json"
  echo "tsconfig.json"
} > .git/info/sparse-checkout

git fetch --depth=1 origin "$BRANCH"
git checkout "$BRANCH"

mkdir -p "$APP_DIR"

# Copy Pi folder contents into target root
if [ ! -d "$SUBDIR" ]; then
  err "Subdirectory $SUBDIR not found in repo. Aborting."; exit 1
fi
cp -r "$SUBDIR"/. "$APP_DIR"/

# Stage full server into tallyhub-full from temp checkout
log "Staging full Tally Hub server..."
mkdir -p "$APP_DIR/tallyhub-full"
rsync -a "$APP_DIR.tmp/src/" "$APP_DIR/tallyhub-full/src/" 2>/dev/null || true
rsync -a "$APP_DIR.tmp/public/" "$APP_DIR/tallyhub-full/public/" 2>/dev/null || true
rsync -a "$APP_DIR.tmp/bin/" "$APP_DIR/tallyhub-full/bin/" 2>/dev/null || true
cp -f "$APP_DIR.tmp/package.json" "$APP_DIR/tallyhub-full/package.json" || true
cp -f "$APP_DIR.tmp/tsconfig.json" "$APP_DIR/tallyhub-full/tsconfig.json" || true

# Fallback: if package.json missing for full server, create one
if [ ! -f "$APP_DIR/tallyhub-full/package.json" ]; then
  cat > "$APP_DIR/tallyhub-full/package.json" <<'PKG'
{
  "name": "tallyhub-full",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
PKG
fi

# Remove temp checkout
cd ~
rm -rf "$APP_DIR.tmp"

# Install Pi server deps
cd "$APP_DIR"
log "Installing Pi server dependencies..."
npm install --omit=dev

# Install and build full server with dev deps
log "Installing full server deps and building..."
cd "$APP_DIR/tallyhub-full"
npm install
npm run build
cd "$APP_DIR"

log "Installation complete."
cat <<EOT
To run now:
  cd "$APP_DIR" && npm start

To install as a service:
  cd "$APP_DIR" && sudo ./scripts/install-systemd.sh && \
  sudo systemctl daemon-reload && sudo systemctl enable tallyhub-pi && sudo systemctl start tallyhub-pi

Then open in Chrome/Edge:
  http://<pi-ip>:8080/flash.html
EOT

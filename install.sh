#!/bin/bash
#
# TallyHub Installer for Raspberry Pi / Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/tallyhubpro/Tallyhub/main/install.sh | bash
#

set -e

echo "=========================================="
echo "  TallyHub Installer"
echo "=========================================="
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  This script requires sudo privileges."
    echo "   Please run: curl -fsSL https://raw.githubusercontent.com/tallyhubpro/Tallyhub/main/install.sh | sudo bash"
    exit 1
fi

# Check if running on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo "❌ Error: This installer is for Linux/Raspberry Pi only."
    echo "   For macOS, see: https://github.com/tallyhubpro/Tallyhub/tree/main/docker"
    exit 1
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "📦 Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    
    # Add current user to docker group
    if [ "$SUDO_USER" ]; then
        usermod -aG docker $SUDO_USER
        echo "✅ Docker installed. Added $SUDO_USER to docker group."
        echo "⚠️  You may need to log out and back in for docker group to take effect."
    else
        usermod -aG docker $USER
        echo "✅ Docker installed. Added $USER to docker group."
        echo "⚠️  You may need to log out and back in for docker group to take effect."
    fi
    echo ""
else
    echo "✅ Docker already installed"
    echo ""
fi

# Create directories
echo "📁 Creating TallyHub directories in /opt/tallyhub..."
mkdir -p /opt/tallyhub/logs
echo '{}' > /opt/tallyhub/device-storage.json
echo '[]' > /opt/tallyhub/device-assignments.json
chmod 666 /opt/tallyhub/device-storage.json /opt/tallyhub/device-assignments.json
echo ""
echo ""

# Determine which Docker tag to use (default: edge for latest main, or specify version)
DOCKER_TAG="${TALLYHUB_TAG:-edge}"
echo "📥 Pulling TallyHub image (tag: $DOCKER_TAG)..."
docker pull ghcr.io/tallyhubpro/tallyhub:$DOCKER_TAG
echo ""

# Stop and remove old container if exists
echo "🔄 Removing old container (if exists)..."
docker rm -f tallyhub 2>/dev/null || true
echo ""

# Start TallyHub
echo "🚀 Starting TallyHub..."
docker run -d \
  --name tallyhub \
  --restart unless-stopped \
  --network host \
    --privileged \
    -v /dev:/dev \
  -e NODE_ENV=production \
  -e TZ=UTC \
  -v /opt/tallyhub/device-storage.json:/app/device-storage.json \
  -v /opt/tallyhub/device-assignments.json:/app/device-assignments.json \
  -v /opt/tallyhub/logs:/app/logs \
  ghcr.io/tallyhubpro/tallyhub:$DOCKER_TAG

echo ""
echo "=========================================="
echo "✅ TallyHub installed successfully!"
echo "=========================================="
echo ""

# Get IP address
IP=$(hostname -I | awk '{print $1}')

echo "📱 Access TallyHub at:"
echo "   http://$IP:3000"
echo "   http://$IP:3000/admin"
echo "   http://$IP:3000/flash.html"
echo ""
echo "🔌 Flashing tip:"
echo "   Plug your ESP32 via USB; ports appear in Server Flash Mode."
echo ""
echo "📊 View logs:"
echo "   sudo docker logs -f tallyhub"
echo ""
echo "🔄 Update TallyHub:"
echo "   curl -fsSL https://raw.githubusercontent.com/tallyhubpro/Tallyhub/main/install.sh | sudo bash"
echo ""
echo "💡 Install specific version:"
echo "   TALLYHUB_TAG=latest - Stable release"
echo "   TALLYHUB_TAG=edge - Latest development (default)"
echo "   TALLYHUB_TAG=v1.2.3 - Specific version"
echo ""
echo "🛑 Stop TallyHub:"
echo "   sudo docker stop tallyhub"
echo ""
echo "=========================================="

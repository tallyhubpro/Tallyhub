#!/bin/bash
# Quick start script for running Tally Hub on Docker Desktop for Mac

set -e

echo "🐳 Tally Hub - Docker Desktop for Mac Setup"
echo "==========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found!"
    echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running!"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

echo "✅ Docker Desktop is running"
echo ""

# Get project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "📁 Project directory: $PROJECT_DIR"
echo ""

# Create necessary directories
echo "📂 Creating directories..."
mkdir -p logs public/firmware
touch device-storage.json device-assignments.json
echo "✅ Directories created"
echo ""

# Ask if user wants to set GitHub token
echo "🔑 GitHub Token Setup (Optional)"
echo "GitHub token enables firmware downloads with higher rate limits."
read -p "Do you want to set a GitHub token? (y/n) " -n 1 -r
echo ""

GITHUB_TOKEN_ENV=""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter your GitHub token (ghp_xxx): " GITHUB_TOKEN
    if [ ! -z "$GITHUB_TOKEN" ]; then
        GITHUB_TOKEN_ENV="-e GITHUB_TOKEN=$GITHUB_TOKEN"
        echo "✅ GitHub token will be set"
    fi
fi
echo ""

# Ask which option to use
echo "Choose installation method:"
echo "1) Build locally (recommended for development)"
echo "2) Use prebuilt image from GHCR (faster, requires GitHub auth)"
read -p "Enter choice (1 or 2): " choice
echo ""

if [ "$choice" = "1" ]; then
    # Build locally
    echo "🔨 Building Docker image..."
    cd docker
    docker compose -f docker-compose.yml -f docker-compose.mac.yml build
    echo "✅ Build complete"
    echo ""
    
    echo "🚀 Starting Tally Hub..."
    docker compose -f docker-compose.yml -f docker-compose.mac.yml up -d
    echo "✅ Tally Hub started"
    
elif [ "$choice" = "2" ]; then
    # Use prebuilt image
    echo "🔑 Checking GitHub Container Registry authentication..."
    if docker pull ghcr.io/tallyhubpro/tallyhub:latest &> /dev/null; then
        echo "✅ Successfully pulled image"
    else
        echo "❌ Failed to pull image. You may need to authenticate:"
        echo "   echo YOUR_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin"
        exit 1
    fi
    echo ""
    
    echo "🚀 Starting Tally Hub..."
    docker run -d \
        --name tallyhub \
        --restart unless-stopped \
        -p 3000:3000 \
        -p 7411:7411/udp \
        -e NODE_ENV=production \
        -e TZ="$(readlink /etc/localtime | sed 's#/var/db/timezone/zoneinfo/##')" \
        $GITHUB_TOKEN_ENV \
        -v "$PROJECT_DIR/device-storage.json:/app/device-storage.json" \
        -v "$PROJECT_DIR/device-assignments.json:/app/device-assignments.json" \
        -v "$PROJECT_DIR/logs:/app/logs" \
        -v "$PROJECT_DIR/public/firmware:/app/public/firmware:ro" \
        ghcr.io/tallyhubpro/tallyhub:latest
    echo "✅ Tally Hub started"
else
    echo "❌ Invalid choice"
    exit 1
fi

echo ""
echo "⏳ Waiting for server to start..."
sleep 5

# Get Mac IP address
MAC_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')

echo ""
echo "✅ Tally Hub is running!"
echo ""
echo "📱 Access Points:"
echo "   Local:  http://localhost:3000"
echo "   Network: http://$MAC_IP:3000"
echo ""
echo "🎯 Quick Links:"
echo "   Admin Panel:  http://localhost:3000/admin"
echo "   Tally View:   http://localhost:3000/tally"
echo "   Flasher:      http://localhost:3000/flash.html"
echo ""
echo "📊 Management Commands:"
echo "   View logs:    docker logs -f tallyhub"
if [ "$choice" = "1" ]; then
    echo "   Stop:         cd docker && docker compose stop"
    echo "   Restart:      cd docker && docker compose restart"
    echo "   Remove:       cd docker && docker compose down"
else
    echo "   Stop:         docker stop tallyhub"
    echo "   Restart:      docker restart tallyhub"
    echo "   Remove:       docker rm -f tallyhub"
fi
echo ""
echo "💡 Configure devices to connect to: $MAC_IP:3000"
echo ""
echo "📖 For more info, see: docker/MACOS_GUIDE.md"
echo ""
echo "🎉 Setup complete!"

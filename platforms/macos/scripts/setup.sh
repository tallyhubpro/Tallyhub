#!/bin/bash

# Tally Hub Mac App Setup Script
echo "🚀 Setting up Tally Hub Mac App..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

echo "📁 App directory: $APP_DIR"

# Navigate to the app directory
cd "$APP_DIR"

# Install Electron app dependencies
echo "📦 Installing Electron app dependencies..."
if ! npm install; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Copy server files
echo "📋 Copying server files..."
if ! node scripts/copy-server.js; then
    echo "❌ Failed to copy server files"
    exit 1
fi

# Navigate to server directory and install dependencies
echo "🔧 Installing server dependencies..."
cd "$APP_DIR/server"
if ! npm install; then
    echo "❌ Failed to install server dependencies"
    exit 1
fi

# Build the server
echo "🏗️  Building server..."
if ! npm run build; then
    echo "❌ Failed to build server"
    exit 1
fi

echo "✅ Setup complete! You can now run:"
echo "  npm run dev      # Development mode"
echo "  npm run build-mac # Build Mac app"

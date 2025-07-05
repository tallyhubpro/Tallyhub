#!/bin/bash

echo "🏗️  Building TallyHub Mac App..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/

# Copy server files (without node_modules)
echo "📦 Copying server files..."
npm run copy-server

# Remove any existing node_modules from server
echo "🗑️  Removing server node_modules..."
rm -rf server/node_modules server/package-lock.json

# Package the app
echo "📱 Packaging the app..."
npm run pack

echo "✅ Build complete!"
echo ""
echo "📁 Built app location:"
echo "   dist/mac-arm64/TallyHub.app"
echo ""
echo "🚀 To test the app:"
echo "   open dist/mac-arm64/TallyHub.app"
echo ""
echo "📦 To create distributable packages:"
echo "   npm run build-mac"

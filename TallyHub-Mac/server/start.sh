#!/bin/bash
cd "$(dirname "$0")"
if [ ! -d "node_modules" ]; then
  echo "Installing server dependencies..."
  npm install
fi

if [ ! -d "dist" ]; then
  echo "Building server..."
  npm run build
fi

echo "Starting Tally Hub server..."
npm start

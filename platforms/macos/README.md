# Tally Hub Mac App

A native macOS application for the Tally Hub tally light control system, built with Electron.

## ⚠️ Downloaded from GitHub Releases?

If you get **"TallyHub is damaged and can't be opened"** error, run this in Terminal:

```bash
xattr -cr /Applications/TallyHub.app
```

Then right-click the app and select "Open". See [GATEKEEPER_FIX.md](GATEKEEPER_FIX.md) for details.

## Features

- 🖥️ Native macOS interface with modern design
- 🚀 One-click server start/stop/restart
- 🌐 Quick access to web interfaces
- 📱 Integrated firmware flashing
- 🔄 Real-time server status monitoring
- 📋 Server log viewing
- 🎯 Menu bar integration

## 🎛️ Supported Mixers

The Mac app bundles the same connectors as the server:

- **OBS Studio**: WebSocket connector (scene/program/preview, recording/streaming)
- **vMix**: HTTP API polling (`/api`) for input tallies
- **Blackmagic ATEM**: Network control via `atem-connection`
- **NewTek TriCaster**: TCP XML protocol (port 5951)
- **Roland Smart Tally**: HTTP `/tally` polling for V‑series mixers
- **TSL UMD 3.1 / 5.0**: UDP/TCP listeners for broadcast tally packets
- **OSC (Open Sound Control)**: UDP listener for `/tally/*` messages

### By Manufacturer

- **Blackmagic Design**: ATEM Mini/Mini Pro/Mini Pro ISO/Mini Extreme; Television Studio (Pro HD/Pro 4K); 1ME/2ME/4ME Production Studio; Constellation 8K
- **NewTek**: TriCaster TC1, TriCaster Mini, and other Ethernet‑tally models
- **StudioCoast**: vMix
- **OBS Project**: OBS Studio
- **Roland**: V‑60HD, XS‑62S, VR‑50HD‑MKII, other Smart Tally models
- **Panasonic**: AV‑HS410, AV‑HS6000, models supporting TSL UMD 3.1/5.0
- **FOR‑A**: HVS‑490/1200/2000/6000 (TSL UMD 5.0)
- **Ross Video**: Acuity, Carbonite (Black/Solo/Ultra), Graphite, TouchDrive, Vision
- **Grass Valley**: Mixers supporting TSL UMD 3.1/5.0
- **TSL UMD 3.1/5.0**: Any device emitting TSL packets (UDP/TCP)
- **OSC**: Any OSC‑capable system emitting `/tally/*`

## 📱 Device Support

- **ESP32‑1732S019**: 1.9" display, budget tally
- **M5Stick C Plus 1.1**: 1.14" display, premium build
- **M5Stick C Plus2**: Latest hardware with improved battery
- **Web Tally (no hardware)**: Use any browser via `/tally.html`

## Prerequisites

- macOS 10.15 or later
- Node.js 16 or later
- npm or yarn

## Quick Start

1. **Setup the application:**
   ```bash
   cd TallyHub-Mac
   ./scripts/setup.sh
   ```

2. **Run in development mode:**
   ```bash
   npm run dev
   ```

3. **Build for distribution:**
   ```bash
   npm run build-mac
   ```

## Manual Setup

If you prefer to set up manually:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Copy server files:**
   ```bash
   node scripts/copy-server.js
   ```

3. **Setup server:**
   ```bash
   cd server
   npm install
   npm run build
   ```

## Build Options

### Development
```bash
npm run dev          # Run in development mode with hot reload
```

### Production Build
```bash
npm run build-mac    # Build Mac app and create DMG (recommended)
npm run build-mac-universal  # Build universal binary (Intel + Apple Silicon)
```

### Distribution

The built DMG files will be in `dist/`:
- **Apple Silicon**: `TallyHub-1.2.0-arm64.dmg`
- **Intel**: `TallyHub-1.2.0.dmg`

Recipients may need to:
1. Run `xattr -cr /Applications/TallyHub.app` in Terminal
2. Right-click the app and select "Open" (for first launch)

See [LOCAL_BUILD_AND_RELEASE.md](LOCAL_BUILD_AND_RELEASE.md) for uploading to GitHub releases.

## Project Structure

```
TallyHub-Mac/
├── src/
│   ├── main.js          # Main Electron process
│   ├── preload.js       # Preload script for security
│   └── renderer.html    # Mac app UI
├── server/              # Copied Tally Hub server files
├── scripts/
│   ├── setup.sh         # Setup script
│   └── copy-server.js   # Server file copying utility
├── assets/              # App icons and assets
├── package.json         # App configuration
└── README.md           # This file
```

## Server Integration

The Mac app includes a complete copy of the Tally Hub server and manages it automatically:

- **Auto-start**: Server starts when the app launches
- **Process management**: Clean shutdown and restart capabilities
- **Log monitoring**: Real-time server log display
- **Port management**: Automatic port conflict detection

## Web Interface Access

When the server is running, you can access:

- **Main Interface**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin.html
- **Tally Display**: http://localhost:3000/tally.html
- **Firmware Flash**: http://localhost:3000/flash.html

## Menu Features

The app includes a native macOS menu with:

- Server control (Start/Stop/Restart)
- Quick links to web interfaces
- About dialog
- Standard Mac app shortcuts

## Troubleshooting

### "App can't be opened" Error
This is normal for unsigned apps. Right-click the app and select "Open", then click "Open" in the dialog.

### Port Already in Use
The app will automatically find an available port if 3000 is occupied.

### Server Won't Start
Check the logs in the app interface or run from terminal to see detailed error messages.

### Build Issues
Make sure you have the latest Node.js and run:
```bash
rm -rf node_modules package-lock.json
npm install
```

## Development

### Adding Features
1. Edit `src/main.js` for main process functionality
2. Edit `src/renderer.html` for UI changes
3. Edit `src/preload.js` for secure API exposure

### Debugging
```bash
npm run dev    # Opens with DevTools enabled
```

## Code Signing (Optional)

This build is intentionally unsigned for development and testing. For distribution through the Mac App Store or to avoid security warnings, you would need:

1. Apple Developer Account ($99/year)
2. Code signing certificate
3. App notarization

## License

Same as the main Tally Hub project.

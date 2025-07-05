# Tally Hub Mac App

A native macOS application for the Tally Hub tally light control system, built with Electron.

## Features

- 🖥️ Native macOS interface with modern design
- 🚀 One-click server start/stop/restart
- 🌐 Quick access to web interfaces
- 📱 Integrated firmware flashing
- 🔄 Real-time server status monitoring
- 📋 Server log viewing
- 🎯 Menu bar integration

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
npm run build-mac    # Build unsigned Mac app (.app bundle)
npm run dist-mac     # Build and create distributable DMG
```

### Distribution

The built app will be unsigned and can be distributed directly:

- **App Bundle**: `dist/mac/Tally Hub.app`
- **DMG**: `dist/Tally Hub-1.0.0.dmg` (if using `dist-mac`)

Recipients may need to:
1. Right-click the app and select "Open" (for first launch)
2. Or go to System Preferences → Security & Privacy → Allow anyway

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

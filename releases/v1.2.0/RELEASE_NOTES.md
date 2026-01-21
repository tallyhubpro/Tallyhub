# TallyHub v1.2.0 - Bug Fixes and Improvements

## 🐛 Bug Fixes

### macOS
- **Fixed:** Missing npm dependencies (osc, tsl-umd, xml2js, axios) causing server startup failure
- **Fixed:** Data directory not created in packaged app
- **Fixed:** Incorrect data file formats (objects instead of arrays)
- **Fixed:** Server crash on startup with "Cannot find module 'osc'" error
- **Fixed:** Admin panel URL inconsistency (/admin.html → /admin)
- **Improved:** Node.js detection and error handling
- **Improved:** Better error messages with detailed output

### Windows
- **Added:** Missing atem-connection dependency
- **Added:** Dependency validation in copy-server script
- **Added:** GitHub Repository link to Help menu
- **Improved:** Data file format validation

### Cross-Platform
- **Standardized:** Documentation URLs (https://tallyhubpro.github.io/docs/)
- **Removed:** Non-existent flash.html menu links
- **Fixed:** Menu link inconsistencies between platforms

## ✨ Enhancements

- Enhanced dependency validation in build scripts
- Better error messages for missing Node.js
- Improved server startup logging
- Automatic data file creation with correct formats
- Consistent menu structure across macOS and Windows

## 🎛️ Supported Mixers (macOS)

The mac app bundles the same connectors as the server:

- OBS Studio (obs-websocket)
- vMix (HTTP API `/api` polling)
- Blackmagic ATEM (atem-connection)
- NewTek TriCaster (TCP XML on port 5951)
- Roland Smart Tally (HTTP `/tally` polling)
- TSL UMD 3.1 / 5.0 (UDP/TCP listeners)
- OSC (Open Sound Control) for `/tally/*`

### By Manufacturer
- Blackmagic Design: ATEM Mini/Mini Pro/Mini Pro ISO/Mini Extreme; Television Studio (Pro HD/Pro 4K); 1ME/2ME/4ME Production Studio; Constellation 8K
- NewTek: TriCaster TC1, TriCaster Mini, and other Ethernet‑tally models
- StudioCoast: vMix
- OBS Project: OBS Studio
- Roland: V‑60HD, XS‑62S, VR‑50HD‑MKII, other Smart Tally models
- Panasonic: AV‑HS410, AV‑HS6000, models supporting TSL UMD 3.1/5.0
- FOR‑A: HVS‑490/1200/2000/6000 (TSL UMD 5.0)
- Ross Video: Acuity, Carbonite (Black/Solo/Ultra), Graphite, TouchDrive, Vision
- Grass Valley: Mixers supporting TSL UMD 3.1/5.0

## 📱 Device Support (macOS)

- ESP32‑1732S019 – 1.9" display, budget tally
- M5Stick C Plus 1.1 – 1.14" display, premium build
- M5Stick C Plus2 – latest hardware with improved battery
- Web Tally (no hardware) – use any browser via `/tally.html`

## 📦 Downloads

### macOS
- **Intel (x64):**
  - `TallyHub-1.2.0.dmg` (115 MB) - DMG Installer
  - `TallyHub-1.2.0-mac.zip` (111 MB) - ZIP Archive

- **Apple Silicon (arm64):**
  - `TallyHub-1.2.0-arm64.dmg` (110 MB) - DMG Installer
  - `TallyHub-1.2.0-arm64-mac.zip` (106 MB) - ZIP Archive

**Requirements:** Node.js 18+ must be installed ([Download](https://nodejs.org/))

### Windows
- **Installers:**
  - `TallyHub-Setup-1.2.0.exe` (173 MB) - NSIS Installer (x64 + ia32)
  - `TallyHub-Portable-1.2.0.exe` (172 MB) - Portable Version (x64 + ia32)

- **ZIP Archives:**
  - `TallyHub-1.2.0-win.zip` (121 MB) - 64-bit
  - `TallyHub-1.2.0-ia32-win.zip` (109 MB) - 32-bit

**Requirements:** Node.js 18+ must be installed ([Download](https://nodejs.org/))

## 🔧 Installation

### macOS
1. Download the appropriate DMG for your Mac (Intel or Apple Silicon)
2. Install Node.js if not already installed
3. Open the DMG and drag TallyHub to Applications
4. First launch: Right-click → Open (to bypass Gatekeeper)
5. The server will start automatically

### Windows
1. Download TallyHub-Setup-1.2.0.exe
2. Install Node.js if not already installed
3. Run the installer
4. TallyHub will start automatically after installation

## 📝 What's Changed
- v1.2.0: Fix missing dependencies and standardize menu links by @tallyhubpro in d2939b8

## ⚠️ Known Issues
- Apps are not code-signed (macOS users need to right-click → Open on first launch)
- Some npm audit warnings (non-critical dependencies)

## 🔗 Links
- [Documentation](https://tallyhubpro.github.io/docs/)
- [GitHub Repository](https://github.com/tallyhubpro/Tallyhub)
- [Report Issues](https://github.com/tallyhubpro/Tallyhub/issues)

---

**Full Changelog**: https://github.com/tallyhubpro/Tallyhub/compare/v1.1.0...v1.2.0

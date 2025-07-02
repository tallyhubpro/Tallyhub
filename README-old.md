# Tally Hub

A modern tally light system for live streaming and broadcast production. Supports ESP32-1732S019 and M5Stick CPlus 1.1 devices with wireless connectivity to OBS Studio, vMix, and other video mixers.

## Features

- **Multi-Device Support**: ESP32-1732S019 (1.9" display) and M5Stick CPlus 1.1
- **Modern Web Interface**: Gradient-themed UI with glassmorphism effects
- **Real-time Status**: Live/Preview/Idle states with visual feedback
- **Wireless Connectivity**: WiFi + UDP for reliable low-latency communication
- **Auto-reconnection**: Robust connection management with automatic recovery
- **Web-based Flasher**: Flash firmware directly from browser (Chrome/Edge)
- **Admin Panel**: Device management, assignments, and system monitoring

## Quick Start

1. **Start the Tally Hub server**:
   ```bash
   npm install
   npm run dev
   ```

2. **Open the web interface**: http://localhost:3000

3. **Flash your devices**: Use the built-in flasher at `/flash.html`

4. **Configure devices**: Connect devices to WiFi and assign them in the admin panel

## Web Interface

- **Home** (`/`): Navigation hub with system status
- **Flash** (`/flash.html`): ESP32 firmware flasher with device selection
- **Admin** (`/admin.html`): Device management and system administration
- **Tally** (`/tally.html`): Live tally display for monitoring

## Supported Hardware

### ESP32-1732S019
- **Display**: 1.9" 170x320 ST7789 (8-bit parallel)
- **Chip**: ESP32-S3 with 8MB Flash
- **Flash Settings**: DIO mode, 80MHz, bootloader@0x0000

### M5Stick CPlus 1.1  
- **Display**: 1.14" 135x240 ST7789 (SPI)
- **Chip**: ESP32-PICO with 4MB Flash
- **Flash Settings**: DIO mode, 40MHz, bootloader@0x1000

## Architecture

- **Backend**: Node.js with TypeScript, WebSocket + UDP communication
- **Frontend**: Modern HTML5 with gradient themes and glassmorphism
- **Firmware**: Arduino framework with WiFiManager and ArduinoJson
- **Flasher**: Web Serial API for direct browser-based firmware updates

## Connection Management

Both device firmwares include robust connection management:
- Periodic WiFi status checks and auto-reconnection
- UDP socket health monitoring and restart capability
- Configurable timeouts and retry logic
- Graceful degradation and recovery

## Development

The project uses:
- **PlatformIO** for firmware development
- **TypeScript** for type-safe backend code
- **Web Serial API** for browser-based device flashing
- **Glassmorphism UI** for modern, consistent design

## Status

✅ **Complete**: Core functionality, web flasher, admin panel, connection stability
✅ **Clean**: Removed unnecessary files, optimized build artifacts
✅ **Modern**: Updated UI design for consistency across all pages
✅ **Robust**: Enhanced firmware with improved reconnection logic

Ready for production use with reliable device connectivity and modern web interface.

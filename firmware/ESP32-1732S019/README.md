# ESP32-1732S019 Tally Light Firmware

This firmware is designed for the ESP32-1732S019 development board with a 1.9" 170x320 pixel TFT display. It provides professional tally light functionality for broadcast environments, connecting to the Tally Hub server via UDP.

## Hardware Specifications

- **MCU**: ESP32-S3 (dual-core, WiFi enabled)
- **Display**: 1.9" ST7789V TFT LCD, 170x320 pixels, 8-bit parallel interface
- **Memory**: 16MB Flash, PSRAM support
- **Communication**: WiFi 802.11 b/g/n
- **Buttons**: 2 programmable buttons (GPIO0, GPIO21)
- **Power**: USB-C or external 5V supply

## Pin Configuration

### Display (8-bit Parallel Interface)
- **TFT_CS**: GPIO5 - Chip Select
- **TFT_DC**: GPIO6 - Data/Command
- **TFT_RST**: GPIO9 - Reset
- **TFT_WR**: GPIO7 - Write Strobe
- **TFT_RD**: GPIO8 - Read Strobe
- **TFT_BL**: GPIO38 - Backlight Control
- **Data Lines**: GPIO39-46 (8-bit parallel data bus)

### Buttons
- **Button A (GPIO0)**: Boot/Flash button - Shows device info, force config mode on startup
- **Button B (GPIO21)**: User button - Enters configuration mode

## Features

- **Real-time Tally States**: LIVE (red), PREVIEW (orange), IDLE (grey)
- **Recording/Streaming Indicators**: Shows REC/STR status when active
- **WiFi Configuration**: Web-based setup with captive portal
- **Device Assignment**: Supports assignment to specific mixer sources
- **Hub Communication**: UDP-based protocol with heartbeat and reconnection
- **Persistent Storage**: Configuration saved to flash memory
- **Web Interface**: Configuration and status pages accessible via WiFi

## Installation

### Requirements
- PlatformIO IDE or Arduino IDE with ESP32 support
- TFT_eSPI library (configured for ESP32-1732S019)
- ArduinoJson library

### Setup Steps

1. **Clone or download** this firmware to your PlatformIO project
2. **Install dependencies**:
   ```bash
   pio lib install
   ```
3. **Build and upload**:
   ```bash
   pio run -e esp32-1732s019-tally -t upload
   ```

### TFT_eSPI Configuration

The firmware uses build flags to configure TFT_eSPI. If you need to manually configure the library, copy `User_Setup_ESP32_1732S019.h` to your TFT_eSPI library folder.

## Usage

### Initial Setup

1. **Power on** the device
2. **Force configuration mode** by holding Button A during startup
3. **Connect to WiFi**: Join "ESP32-Tally-Config" network (password: 12345678)
4. **Open browser** to 192.168.4.1
5. **Configure settings**:
   - WiFi network credentials
   - Tally Hub server IP and port
   - Device name and ID
6. **Save configuration** - device will restart and connect to your network

### Normal Operation

- **IDLE**: Grey display when source is not active
- **PREVIEW**: Orange display when source is in preview
- **LIVE**: Red display when source is live/program
- **REC/STR**: Recording/Streaming indicators appear at bottom

### Button Functions

- **Button A (short press)**: Show device information
- **Button B (short press)**: Enter configuration mode
- **Button A (startup)**: Force configuration mode

### Web Interface

When connected to WiFi, access the device at its IP address for:
- Device status and information
- Configuration changes
- Network diagnostics
- Device restart/reset

## Configuration

### Network Settings
- **WiFi SSID**: Your network name
- **WiFi Password**: Your network password
- **Hub IP**: Tally Hub server IP address (default: 192.168.0.216)
- **Hub Port**: Tally Hub server port (default: 7412)

### Device Settings
- **Device ID**: Unique identifier (e.g., "esp32-tally-01")
- **Device Name**: Human-readable name (e.g., "Camera 1 Tally")

### Assignment
Device assignment is managed through the Tally Hub admin panel:
1. Device appears in hub's device list after registration
2. Assign device to specific mixer source (OBS scene, vMix input, etc.)
3. Device automatically receives tally updates for assigned source

## Communication Protocol

The device communicates with Tally Hub using UDP JSON messages:

### Registration
```json
{
  "type": "register",
  "deviceId": "esp32-tally-01",
  "deviceName": "ESP32 Tally Light"
}
```

### Heartbeat
```json
{
  "type": "heartbeat",
  "deviceId": "esp32-tally-01"
}
```

### Tally Updates (received)
```json
{
  "type": "tally",
  "data": {
    "id": "obs-scene-Camera1",
    "name": "Camera 1",
    "program": true,
    "preview": false,
    "recording": false,
    "streaming": true
  }
}
```

## Troubleshooting

### Display Issues
- Check TFT_eSPI configuration matches hardware
- Verify pin connections for 8-bit parallel interface
- Ensure proper power supply (5V, adequate current)

### WiFi Connection
- Verify WiFi credentials are correct
- Check WiFi network is 2.4GHz (ESP32 doesn't support 5GHz)
- Ensure hub server is accessible from device network

### Hub Connection
- Verify hub IP address and port
- Check firewall settings allow UDP traffic
- Monitor serial output for connection status

### Factory Reset
1. Access web interface
2. Go to configuration page
3. Click "Factory Reset" button
4. Or clear preferences via code: `preferences.clear()`

## Development

### Building
```bash
# Build firmware
pio run -e esp32-1732s019-tally

# Upload to device
pio run -e esp32-1732s019-tally -t upload

# Monitor serial output
pio device monitor --baud 115200
```

### Customization
- Modify display colors in color definitions section
- Adjust timing constants for heartbeat/reconnection
- Customize web interface HTML/CSS
- Add additional button functions

## Hardware Variants

This firmware is specifically designed for ESP32-1732S019 boards. For other ESP32 boards with different display configurations:

1. Update pin definitions in platformio.ini build flags
2. Modify User_Setup configuration if needed
3. Adjust screen dimensions (TFT_WIDTH, TFT_HEIGHT)
4. Update button pin assignments

## License

This firmware is part of the Tally Hub project. See the main project LICENSE for details.

## Support

For issues, questions, or contributions:
- Check the main Tally Hub project documentation
- Review serial monitor output for diagnostic information
- Verify hardware connections match pin configuration
- Test with known-good hub server configuration

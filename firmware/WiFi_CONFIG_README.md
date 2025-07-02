# M5 Stick Tally with WiFi Configuration Portal

This enhanced version of the M5 Stick Tally firmware includes a built-in WiFi configuration portal, making it easy to set up your device without editing code.

## 🆕 New Features

### WiFi Configuration Portal
- **No code editing required** - Configure WiFi through a web interface
- **Automatic Access Point** - Device creates its own WiFi network for configuration
- **Captive Portal** - Automatically opens configuration page when connected
- **Persistent Settings** - Configuration is saved and remembered across reboots
- **Easy Reconfiguration** - Hold Button B for 3 seconds to enter config mode

### Smart Connection
- **Auto-connect** - Automatically connects to saved WiFi on startup
- **Fallback Mode** - Enters configuration mode if saved WiFi fails
- **Connection Recovery** - Automatically reconnects if WiFi is lost

## 📱 Configuration Process

### First Time Setup

1. **Power on M5StickC** - It will start in configuration mode (orange screen)
2. **Connect to WiFi** - Look for "M5-Tally-Config" network on your phone/laptop
3. **Enter password**: `12345678`
4. **Open browser** - Go to `192.168.4.1` or any website (captive portal)
5. **Configure settings**:
   - **WiFi Network**: Your home/office WiFi name
   - **WiFi Password**: Your WiFi password
   - **Hub IP**: Your Tally Hub server IP (e.g., `192.168.0.216`)
   - **Hub Port**: `7412` (default)
   - **Device ID**: Unique identifier (e.g., `m5-camera-01`)
   - **Device Name**: Display name (e.g., `Camera 1 Tally`)
6. **Save & Restart** - Device will restart and connect to your WiFi

### Reconfiguration

To change settings later:

1. **Hold Button B** for 3 seconds during normal operation
2. **Release when prompted** - "Release for Config" appears on screen
3. **Follow configuration steps** above

## 🎮 Button Functions

- **Button A**: Show device information (IP, settings, etc.)
- **Button B**: 
  - **Short press**: Force re-registration with hub
  - **Long press (3+ seconds)**: Enter configuration mode
- **Power Button**: Turn device on/off

## 📟 Status Indicators

### Screen Colors
- **Orange**: Configuration mode active
- **Yellow**: Connecting to WiFi or waiting for input
- **Blue**: Starting up, registering, or showing info
- **Green**: Connected and ready / PREVIEW state
- **Red**: LIVE/PROGRAM state
- **Gray**: IDLE state
- **Black**: Disconnected or error

### Configuration Mode Display
When in config mode, the screen shows:
```
Config Mode
WiFi: M5-Tally-Config
Pass: 12345678
Go to: 192.168.4.1
Press B to exit
```

## 🔧 Technical Details

### WiFi Access Point Settings
- **SSID**: `M5-Tally-Config`
- **Password**: `12345678`
- **IP Address**: `192.168.4.1`
- **Timeout**: 5 minutes (auto-exit)

### Configuration Storage
Settings are stored in ESP32 non-volatile storage (NVS) and persist across:
- Power cycles
- Firmware updates (if NVS is preserved)
- Factory resets (use Button A during startup to force config mode)

### Web Interface Features
- **Responsive design** - Works on phones, tablets, and computers
- **Current settings display** - Shows existing configuration
- **Input validation** - Ensures required fields are filled
- **Auto-restart** - Device restarts automatically after saving

## 🚀 Upload Instructions

### PlatformIO (Recommended)
```bash
# Build the firmware
pio run

# Upload to M5StickC
pio run --target upload

# Monitor serial output
pio device monitor
```

### Arduino IDE
1. Install required libraries:
   - `M5StickC`
   - `ArduinoJson`
   - `WebServer` (included with ESP32)
   - `DNSServer` (included with ESP32)
2. Select board: `M5Stack Arduino > M5StickC`
3. Upload the firmware

## 🔍 Troubleshooting

### Can't Connect to M5-Tally-Config WiFi
- Ensure M5StickC is in config mode (orange screen)
- Check WiFi password: `12345678`
- Try forgetting and reconnecting to the network
- Move closer to the M5StickC

### Configuration Page Won't Load
- Try going directly to `192.168.4.1`
- Disable mobile data on phones (use WiFi only)
- Clear browser cache
- Try a different browser

### WiFi Connection Fails After Configuration
- Double-check WiFi credentials
- Ensure M5StickC is within range of your WiFi
- Check for special characters in WiFi password
- Try 2.4GHz WiFi (5GHz not supported)

### Device Not Appearing in Tally Hub
- Verify Hub IP address is correct
- Check that UDP port 7412 is open
- Ensure M5StickC and hub are on same network
- Check hub server logs for registration attempts

### Reset to Factory Settings
1. Hold Button A during startup
2. When "Config Mode" appears, release button
3. This forces configuration mode regardless of saved settings

## 🌐 Network Requirements

- **WiFi**: 2.4GHz (5GHz not supported)
- **Security**: WPA/WPA2 (open networks supported but not recommended)
- **DHCP**: Device obtains IP automatically
- **Ports**: UDP 7412 for Tally Hub communication

## 📋 Default Configuration

If no configuration is saved, defaults are:
```
WiFi SSID: (none - will start config mode)
WiFi Password: (none)
Hub IP: 192.168.0.216
Hub Port: 7412
Device ID: m5-tally-01
Device Name: M5 Tally Light
```

The WiFi configuration portal makes the M5 Stick Tally much more user-friendly and suitable for production environments where multiple devices need to be configured by different users.

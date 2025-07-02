# PlatformIO M5StickC Plus Tally Light

This project can be built and uploaded using PlatformIO, which is often easier and more reliable than Arduino IDE. The firmware is optimized for the **M5StickC Plus** with its larger 1.14" display.

## Prerequisites

### Install PlatformIO
Choose one of these methods:

#### Option 1: VS Code Extension (Recommended)
1. Install [Visual Studio Code](https://code.visualstudio.com/)
2. Install the "PlatformIO IDE" extension
3. Restart VS Code

#### Option 2: PlatformIO Core (Command Line)
```bash
# Install Python if not already installed
python3 -m pip install platformio

# Or using homebrew on macOS
brew install platformio
```

## Configuration

### 1. Edit Configuration
Update the WiFi and network settings in `src/main.cpp`:

```cpp
// Lines 8-15: Update these values
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* HUB_IP = "192.168.0.216";  // Your Tally Hub IP
const char* DEVICE_ID = "m5-camera-01";
const char* DEVICE_NAME = "Camera 1 Tally";
```

## Upload Methods

### Method 1: VS Code with PlatformIO Extension

1. **Open Project**:
   - File → Open Folder
   - Select the `M5Stick_Tally` folder

2. **Connect M5StickC Plus**:
   - Connect via USB-C cable
   - Turn on the device (hold power 2 seconds)

3. **Upload**:
   - Click the "→" (Upload) button in the PlatformIO toolbar
   - Or use Command Palette: `PlatformIO: Upload`

### Method 2: Command Line

```bash
# Navigate to the project directory
cd "/Users/prince/Projects/Tally hub/firmware/M5Stick_Tally"

# Build the project
pio run

# Upload to connected M5StickC
pio run --target upload

# Build and upload in one command
pio run --target upload

# Open serial monitor to see debug output
pio device monitor
```

## Troubleshooting

### Port Detection Issues
```bash
# List available serial ports
pio device list

# Upload to specific port
pio run --target upload --upload-port /dev/cu.usbserial-*
```

### Build Issues
```bash
# Clean build files
pio run --target clean

# Update platform and libraries
pio platform update
pio lib update
```

### Monitor Serial Output
```bash
# Monitor at 115200 baud with ESP32 exception decoder
pio device monitor --baud 115200 --filter esp32_exception_decoder
```

## Project Structure

```
M5Stick_Tally/
├── platformio.ini    # PlatformIO configuration
├── src/
│   └── main.cpp      # Main firmware code
└── README_PlatformIO.md
```

## Advanced Features

### Over-The-Air (OTA) Updates
Uncomment OTA settings in `platformio.ini` for wireless updates:
```ini
upload_protocol = espota
upload_port = 192.168.1.xxx  # M5StickC IP address
```

Then upload wirelessly:
```bash
pio run --target upload
```

### Multiple Environments
Add different configurations for multiple devices in `platformio.ini`:
```ini
[env:camera1]
build_flags = -DDEVICE_ID='"m5-camera-01"' -DDEVICE_NAME='"Camera 1"'

[env:camera2]  
build_flags = -DDEVICE_ID='"m5-camera-02"' -DDEVICE_NAME='"Camera 2"'
```

Upload to specific environment:
```bash
pio run -e camera1 --target upload
```

## Benefits of PlatformIO

- **Better dependency management**: Automatic library installation
- **Faster builds**: Incremental compilation
- **Better debugging**: Built-in debugging tools
- **Cross-platform**: Works on Windows, macOS, Linux
- **Version control friendly**: All dependencies specified in config
- **Multiple board support**: Easy to switch between M5 variants

## Quick Start Commands

```bash
# Full build and upload process
cd "/Users/prince/Projects/Tally hub/firmware/M5Stick_Tally"
pio run --target upload
pio device monitor
```

Your M5StickC should now connect to your Tally Hub and start displaying tally states!

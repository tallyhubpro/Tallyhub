# M5 Stick Tally Light Firmware

This firmware turns your M5StickC into a wireless tally light that connects to the Tally Hub system.

## Features

- **Wireless Connection**: Connects to Tally Hub via WiFi and UDP
- **Real-time Tally**: Shows LIVE (red), PREVIEW (green), or IDLE (gray) states
- **Auto-reconnection**: Automatically reconnects if WiFi or hub connection is lost
- **Device Info**: Press Button A to show device information
- **Manual Registration**: Press Button B to force re-registration with hub

## Hardware Requirements

- M5StickC or M5StickC Plus
- WiFi network access
- Tally Hub server running on the same network

## Installation Instructions

### 1. Install Arduino IDE and Libraries

1. **Download Arduino IDE**: https://www.arduino.cc/en/software
2. **Install M5StickC Board Support**:
   - Open Arduino IDE
   - Go to File → Preferences
   - Add this URL to "Additional Boards Manager URLs":
     ```
     https://m5stack.oss-cn-shenzhen.aliyuncs.com/resource/arduino/package_m5stack_index.json
     ```
   - Go to Tools → Board → Boards Manager
   - Search for "M5Stack" and install "M5Stack by M5Stack"

3. **Install Required Libraries**:
   - Go to Tools → Manage Libraries
   - Install these libraries:
     - `M5StickC` by M5Stack
     - `ArduinoJson` by Benoit Blanchon
     - `WiFi` (should be included with ESP32)

### 2. Configure the Firmware

1. **Open the firmware file**: `M5Stick_Tally.ino`

2. **Update WiFi Configuration** (lines 8-9):
   ```cpp
   const char* WIFI_SSID = "YOUR_WIFI_SSID";      // Your WiFi network name
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // Your WiFi password
   ```

3. **Update Tally Hub IP** (line 10):
   ```cpp
   const char* HUB_IP = "192.168.1.100";  // IP address of your Tally Hub server
   ```
   
   To find your Tally Hub IP:
   - On Mac/Linux: Run `ifconfig` in terminal
   - On Windows: Run `ipconfig` in command prompt
   - Look for your local network IP (usually 192.168.x.x or 10.x.x.x)

4. **Customize Device Settings** (lines 13-14):
   ```cpp
   const char* DEVICE_ID = "m5-camera-01";      // Unique ID for this device
   const char* DEVICE_NAME = "Camera 1 Tally";  // Display name in admin panel
   ```

### 3. Upload to M5StickC

1. **Connect M5StickC**:
   - Connect M5StickC to your computer via USB-C cable
   - Turn on the M5StickC (press power button for 2 seconds)

2. **Select Board and Port**:
   - Go to Tools → Board → M5Stack Arduino → M5StickC
   - Go to Tools → Port → Select the COM port for your M5StickC

3. **Upload Firmware**:
   - Click the Upload button (→) in Arduino IDE
   - Wait for compilation and upload to complete
   - You should see "Done uploading" when finished

### 4. Test the Connection

1. **Power on M5StickC**: The device should automatically:
   - Connect to WiFi (shows "WiFi..." then "WiFi OK")
   - Register with Tally Hub (shows "Register" then "Connected")
   - Display current tally state

2. **Check Admin Panel**:
   - Open `http://YOUR_HUB_IP:3001/admin.html`
   - Look for your M5 device in the "Connected Devices" section

3. **Test Tally States**:
   - Change scenes in OBS
   - M5StickC should show:
     - **Red screen with "LIVE"** when scene is program
     - **Green screen with "PREVIEW"** when scene is preview
     - **Gray screen with "IDLE"** when scene is inactive

## Troubleshooting

### WiFi Connection Issues
- **Check credentials**: Verify WiFi SSID and password are correct
- **Network compatibility**: Ensure M5StickC supports your WiFi security type
- **Signal strength**: Move closer to WiFi router

### Hub Connection Issues
- **Check IP address**: Verify Tally Hub server IP is correct
- **Port configuration**: Ensure UDP port 7412 is open
- **Network access**: Make sure M5StickC and hub are on same network

### Device Not Appearing in Admin Panel
- **Check server logs**: Look for registration messages in Tally Hub console
- **Firewall**: Ensure UDP port 7412 is not blocked
- **Manual registration**: Press Button B on M5StickC to force re-registration

## Button Functions

- **Button A (M5 logo)**: Show device information
- **Button B (side button)**: Force re-registration with hub
- **Power Button**: Turn device on/off (hold for 2 seconds)

## LED Status Indicators

- **Blue**: Starting up, connecting, or registering
- **Yellow**: Connecting to WiFi
- **Green**: Connected and ready, or PREVIEW state
- **Red**: LIVE/PROGRAM state
- **Gray/Black**: IDLE state or connection issues

## Advanced Configuration

### Multiple M5 Devices
For multiple M5 sticks, change the `DEVICE_ID` and `DEVICE_NAME` for each device:
```cpp
// Camera 1
const char* DEVICE_ID = "m5-camera-01";
const char* DEVICE_NAME = "Camera 1 Tally";

// Camera 2
const char* DEVICE_ID = "m5-camera-02";
const char* DEVICE_NAME = "Camera 2 Tally";
```

### Custom Tally Logic
You can modify the `handleTallyUpdate()` function to customize which sources trigger the tally light.

## Support

If you encounter issues:
1. Check the serial monitor in Arduino IDE for debug messages
2. Verify all network settings are correct
3. Ensure Tally Hub server is running and accessible
4. Check that OBS is connected to the hub and sending scene changes

## Compilation Troubleshooting

If you encounter compilation errors during upload, try these solutions:

### Memory Issues
If you get "program too big" or memory-related errors:

1. **Enable Compact Mode**: In `main.cpp`, uncomment this line:
   ```cpp
   #define COMPACT_WEB_PORTAL
   ```

2. **Arduino IDE Settings**:
   - Tools → Board → "M5Stick-C" or "M5StickC-Plus"
   - Tools → Partition Scheme → "Huge APP (3MB No OTA/1MB SPIFFS)"
   - Tools → Flash Mode → "QIO"
   - Tools → Flash Frequency → "80MHz"
   - Tools → Flash Size → "4MB (32Mb)"

3. **PlatformIO Settings** (if using PlatformIO):
   ```ini
   board_build.partitions = huge_app.csv
   board_build.flash_mode = qio
   ```

### Common Compilation Errors

- **ArduinoJson version**: Ensure you have ArduinoJson v6.x or later
- **M5StickC library**: Update to the latest version
- **ESP32 core**: Update ESP32 board package to latest version
- **Compiler warnings**: These are usually safe to ignore

### Upload Issues

- **COM Port**: Make sure correct port is selected in Tools → Port
- **Driver**: Install CP210x USB driver for M5StickC
- **Reset**: Hold the M5StickC reset button while uploading if needed

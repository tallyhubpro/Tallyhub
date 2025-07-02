# Firmware Flashing Guide

Learn how to flash firmware to your ESP32 and M5Stick devices using the web-based flashing tool.

## 📱 **Web-Based Flashing**

Tally Hub includes a modern web-based firmware flashing tool that works directly in your browser using the Web Serial API.

### Prerequisites

- **Chrome/Edge 89+** or **Chrome for Android 89+** (Web Serial API support)
- **USB cable** to connect your device
- **Device in download mode** (varies by device type)

### Flashing Process

1. **Navigate to Flash Page**
   - Open your browser and go to: `http://localhost:3000/flash.html`
   - Or click the "Flash Firmware" button in the admin panel

2. **Select Device Type**
   - Choose your device: ESP32-1732S019 or M5Stick C Plus
   - The correct firmware will be automatically selected

3. **Connect Device**
   - Connect your device via USB
   - Click "Connect" and select the correct serial port
   - Most devices appear as "CP210x" or "CH340" USB Serial

4. **Enter Download Mode** (if required)
   - **ESP32-1732S019**: Hold BOOT button while clicking RESET
   - **M5Stick C Plus**: Hold side button while connecting USB

5. **Flash Firmware**
   - Click "Flash" to begin the process
   - Monitor progress in real-time
   - **Do not disconnect** during flashing

6. **Verification**
   - Device will restart automatically
   - Check the device display for the Tally Hub logo
   - Device should appear in the admin panel within 30 seconds

## 🔧 **Manual Flashing (Advanced)**

For development or troubleshooting, you can use PlatformIO:

### ESP32-1732S019

```bash
cd firmware/ESP32-1732S019
platformio run --target upload
```

### M5Stick C Plus

```bash
cd firmware/M5Stick_Tally
platformio run --target upload
```

## 🛠️ **Troubleshooting**

### Device Not Detected

- **Check drivers**: Install CP210x or CH340 drivers if needed
- **Try different cable**: Use a data-capable USB cable
- **Check ports**: Ensure device appears in device manager/system profiler

### Flash Fails

- **Enter download mode**: Follow device-specific instructions above
- **Check connections**: Ensure USB cable is firmly connected
- **Browser compatibility**: Use Chrome/Edge with Web Serial API support
- **Permissions**: Grant serial port access when prompted

### Device Won't Connect After Flash

- **Check WiFi settings**: Device may need WiFi reconfiguration
- **Network discovery**: Wait up to 60 seconds for device to appear
- **Reset device**: Power cycle the device
- **Check logs**: Review server logs for connection attempts

## 📋 **Firmware Versions**

| Device | Latest Version | Features |
|--------|---------------|----------|
| ESP32-1732S019 | v2.1.0 | Full color display, wake-up support |
| M5Stick C Plus | v2.0.5 | Premium display, battery management |

---

**Need help?** Check our [troubleshooting guide](../troubleshooting.md) or visit the [hardware overview](../hardware/index.md).

# Firmware Flashing Guide

## Overview

The Tally Hub uses a **simplified single-file firmware flashing system** for easy device setup. All firmware components (bootloader, partitions, and application) are automatically merged into one file during the build process.

## Supported Devices

- **ESP32-1732S019** - Touch display development board
- **M5Stick CPlus 1.1** - Compact ESP32 device with built-in display

## Firmware Files

### ESP32-1732S019
- **Merged Firmware**: `firmware-merged.bin` (~980 KB) - Complete firmware ready to flash at 0x0000

### M5Stick CPlus 1.1  
- **Merged Firmware**: `firmware-merged.bin` (~960 KB) - Complete firmware ready to flash at 0x0000

> **Note**: Merged firmware files are automatically generated during the build process and contain all necessary components (bootloader, partitions, and application firmware) properly positioned for flashing.

## How to Flash Firmware

### Web-Based Flasher (Recommended)

1. Open your Tally Hub in Chrome, Edge, or Opera browser
2. Navigate to the **Flash Firmware** page
3. Select your device type (ESP32-1732S019 or M5Stick CPlus 1.1)
4. Connect your device via USB
5. Click **Connect Device** 
6. Click **Flash Firmware**

The system will automatically:
- Download the appropriate merged firmware file
- Flash it to your device at the correct memory address (0x0000)
- Provide real-time progress updates
- Notify you when flashing is complete

### Browser Requirements

The web-based flasher requires the **Web Serial API**, which is only available in:
- Google Chrome
- Microsoft Edge  
- Opera Browser

**Note**: Safari and Firefox do not support Web Serial API.

### Connection Tips

#### ESP32-1732S019
- Device usually auto-detects and enters flash mode
- If connection fails, hold BOOT button while connecting
- Use a high-quality USB cable with data transfer capability

#### M5Stick CPlus 1.1
- Ensure the screen is ON (press power button if needed)
- If connection fails, hold RESET button and click "Retry Connection"
- For stubborn devices: Hold RESET + POWER for 2 seconds, then try again
- Some M5Stick devices require multiple connection attempts
- Use original or high-quality USB-C cable

## Firmware Features

### Enhanced Disconnection Detection
Both firmware versions now include improved disconnection detection:

- **Fast Hub Monitoring**: Checks connection every 2 seconds
- **Hub Timeout**: 15 seconds (reduced from 30 seconds)
- **WiFi Check**: Every 5 seconds
- **Quick Status Display**: Shows "HUB LOST" or "NO WIFI" immediately
- **Auto-Reconnection**: Attempts to reconnect automatically

### Display Status Messages
- **Connected**: Shows assigned camera number and status
- **HUB LOST**: Hub connection lost (red background)
- **NO WIFI**: WiFi connection lost (yellow background)
- **Connecting**: Attempting to connect to hub or WiFi

## Troubleshooting

### Connection Issues
1. **Wrong Browser**: Use Chrome, Edge, or Opera
2. **USB Cable**: Ensure cable supports data transfer (not just charging)
3. **Driver Issues**: Install ESP32 USB drivers if needed
4. **Device Not Detected**: Try different USB ports
5. **Reset Device**: Hold device reset button during connection

### M5Stick Specific Issues
- **Black Screen**: Press RESET button after flashing
- **Won't Boot**: Hold POWER button for 6 seconds
- **Flash Failed**: Try chip erase option and retry
- **Connection Timeouts**: Use retry connection button

### Post-Flash Instructions

#### ESP32-1732S019
1. Disconnect USB cable
2. Power cycle the device
3. Device should boot with new firmware

#### M5Stick CPlus 1.1
1. Disconnect USB cable
2. Wait 5 seconds
3. Press and hold POWER button for 6 seconds to restart
4. Device should boot with new firmware
5. If screen stays black, try pressing RESET button

## Technical Details

### Flash Memory Layout

#### ESP32-1732S019 (ESP32-S3)
- **Bootloader**: 0x0000 (ESP32-S3 specific offset)
- **Partitions**: 0x8000 (32KB offset)
- **Application**: 0x10000 (64KB offset)
- **Flash Size**: 8MB
- **Flash Mode**: DIO, 80MHz

#### M5Stick CPlus 1.1 (ESP32)
- **Bootloader**: 0x1000 (ESP32 standard offset)
- **Partitions**: 0x8000 (32KB offset)  
- **Application**: 0x10000 (64KB offset)
- **Flash Size**: 4MB
- **Flash Mode**: DIO, 80MHz

### Merged Firmware Creation

The merged firmware files are created using esptool:

```bash
# ESP32-1732S019 (ESP32-S3)
esptool.py --chip esp32 merge_bin -o firmware-merged.bin \
  --flash_mode dio --flash_freq 40m --flash_size 4MB \
  0x0 bootloader.bin 0x8000 partitions.bin 0x10000 firmware.bin

# M5Stick CPlus 1.1 (ESP32)  
esptool.py --chip esp32 merge_bin -o firmware-merged.bin \
  --flash_mode dio --flash_freq 40m --flash_size 4MB \
  0x1000 bootloader.bin 0x8000 partitions.bin 0x10000 firmware.bin
```

## Advanced Usage

### Manual Flashing with esptool

If you prefer command-line flashing:

```bash
# Install esptool
pip install esptool

# ESP32-1732S019 (single file)
esptool.py --chip esp32 --port /dev/ttyUSB0 --baud 460800 \
  write_flash 0x0 firmware-merged.bin

# M5Stick CPlus 1.1 (single file)
esptool.py --chip esp32 --port /dev/ttyUSB0 --baud 460800 \
  write_flash 0x0 firmware-merged.bin
```

### Custom Firmware Development

For developers wanting to modify the firmware:

1. Source code is in `firmware/ESP32-1732S019/` and `firmware/M5Stick_Tally/`
2. Use PlatformIO to build: `pio run`
3. Flash with: `pio run --target upload`
4. Monitor serial: `pio device monitor`

## Support

If you encounter issues:

1. Check this guide first
2. Verify browser compatibility (Chrome/Edge/Opera)
3. Try different USB cables and ports
4. Check device-specific troubleshooting steps
5. Use retry connection option for M5Stick devices

The single-file firmware mode should work for 95% of users and significantly simplifies the flashing process!

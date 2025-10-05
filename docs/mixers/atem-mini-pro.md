# ATEM Mini Pro Integration Guide

## Overview

Tally Hub now supports Blackmagic Design ATEM Mini Pro video switchers! This integration allows you to use your ATEM Mini Pro as a professional tally source for your M5Stick and ESP32 tally lights.

## Features

- **Real-time Tally Updates**: Get instant program/preview tally states from your ATEM Mini Pro
- **Input Monitoring**: Monitor all video inputs on your ATEM switcher
- **Recording/Streaming Status**: Display recording and streaming status on tally devices
- **Automatic Reconnection**: Robust connection handling with automatic reconnection
- **Professional Control**: Full integration with Tally Hub's device assignment system

## Quick Setup

### 1. Network Configuration

**Default ATEM Network Settings:**
- IP Address: `192.168.10.240`
- Port: `9910`
- Protocol: TCP

### 2. Configure ATEM Mini Pro

1. **Power on** your ATEM Mini Pro
2. **Connect Ethernet** cable to your network
3. **Download ATEM Setup** utility from Blackmagic Design
4. Use **ATEM Setup** to configure network settings if needed
5. Test connection with **ATEM Software Control**

### 3. Add ATEM to Tally Hub

#### Option A: Admin Interface
1. Open Tally Hub Admin Panel: `http://localhost:3000/admin`
2. Scroll to "Video Mixers" section
3. Click "Add Mixer"
4. Select **"ATEM Mini Pro"** from type dropdown
5. Enter your ATEM's IP address (default: `192.168.10.240`)
6. Port will auto-fill to `9910`
7. Click "Add Mixer"

#### Option B: Configuration File
Add to your `mixer-config.json`:
```json
{
  "id": "atem-mini-pro",
  "name": "ATEM Mini Pro",
  "type": "atem",
  "host": "192.168.10.240",
  "port": 9910
}
```

## Input Mapping

Your ATEM Mini Pro inputs will appear as:
- **Input 1**: Camera/Video source connected to HDMI 1
- **Input 2**: Camera/Video source connected to HDMI 2  
- **Input 3**: Camera/Video source connected to HDMI 3
- **Input 4**: Camera/Video source connected to HDMI 4

## Tally Behavior

- **🔴 Program (Live)**: Input currently on program output
- **🟡 Preview**: Input currently on preview (if supported)
- **⚫ Off**: Input not in use
- **🔴 Recording**: Shows when ATEM is recording (if enabled)
- **📡 Streaming**: Shows when ATEM is streaming (if supported)

## Device Assignment

You can assign specific tally devices to monitor individual ATEM inputs:

1. Go to Admin Panel → Device Management
2. Find your tally device
3. Click "Assign to Source"
4. Select the ATEM input you want to monitor
5. The device will now show tally status for that specific input

## Troubleshooting

### Connection Issues

**"Connection Failed" Error:**
- ✅ Ensure ATEM Mini Pro is powered on
- ✅ Check Ethernet cable connection
- ✅ Verify IP address (use ATEM Setup utility)
- ✅ Confirm port 9910 is accessible
- ✅ Try connecting with ATEM Software Control first

**"Connection Timeout" Error:**
- ✅ Check network connectivity
- ✅ Ensure ATEM and Tally Hub are on same network
- ✅ Power cycle ATEM Mini Pro
- ✅ Check firewall settings

### Network Discovery

If you can't find your ATEM's IP address:
1. Use **ATEM Setup utility** to scan for devices
2. Check your router's connected devices
3. Try default IP: `192.168.10.240`
4. Use network scanner tools

### Firmware Updates

Keep your ATEM Mini Pro firmware updated:
1. Download **ATEM Setup** from Blackmagic Design
2. Connect ATEM via USB or Ethernet
3. Follow firmware update instructions
4. Restart after updates

## Advanced Configuration

### Custom Port Configuration
If your ATEM uses a different port:
```json
{
  "host": "192.168.1.100",
  "port": 9911
}
```

### Multiple ATEM Devices
You can connect multiple ATEM devices:
```json
[
  {
    "id": "atem-studio-1",
    "name": "Studio ATEM",
    "type": "atem",
    "host": "192.168.1.100",
    "port": 9910
  },
  {
    "id": "atem-studio-2", 
    "name": "Remote ATEM",
    "type": "atem",
    "host": "192.168.1.101",
    "port": 9910
  }
]
```

## Compatibility

**Supported ATEM Models:**
- ATEM Mini
- ATEM Mini Pro
- ATEM Mini Pro ISO
- ATEM Mini Extreme
- ATEM Mini Extreme ISO
- Other ATEM models (may require testing)

**Requirements:**
- Network connection (Ethernet recommended)
- ATEM firmware 8.0+ recommended
- Tally Hub v1.0.1+

## Integration with Other Mixers

You can use ATEM alongside other supported mixers:
- **OBS Studio** (WebSocket)
- **vMix** (HTTP API)
- **ATEM Mini Pro** (TCP)

Each mixer operates independently, and you can assign devices to sources from any connected mixer.

## Getting Help

If you encounter issues:
1. Check the Admin Panel for connection status
2. Use the built-in connection help (click 🔧 Show Help)
3. Review the console logs for error details
4. Ensure all network requirements are met

## Professional Tips

1. **Use Wired Connection**: Ethernet is more reliable than WiFi for ATEM
2. **Static IP**: Configure static IP for your ATEM for consistent connections
3. **Test First**: Always test with ATEM Software Control before Tally Hub
4. **Keep Updated**: Regular firmware updates improve stability
5. **Monitor Logs**: Watch Tally Hub logs for connection health

---

**🎛️ Your ATEM Mini Pro is now ready for professional tally operations with Tally Hub!**

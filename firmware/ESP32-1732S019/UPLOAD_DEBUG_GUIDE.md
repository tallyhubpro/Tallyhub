# ESP32-1732S019 Upload and Debugging Guide

## ✅ **Upload Status: SUCCESS**

The firmware has been successfully uploaded to your ESP32-1732S019 device! The upload process completed without errors and showed:

- **Chip detected**: ESP32-S3 (revision v0.2) 
- **MAC Address**: f0:9e:9e:10:79:e8
- **Flash Size**: Correctly configured
- **Upload Success**: 897,088 bytes uploaded successfully

## 🔍 **Debugging Steps**

### **1. Check Serial Output**
```bash
cd firmware/ESP32-1732S019
pio device monitor --baud 115200 --port /dev/cu.usbserial-11430
```

### **2. Common Boot Issues & Solutions**

#### **Garbled Text/Boot Loop**
- **Cause**: Display configuration mismatch or power issues
- **Solution**: Check display connections and power supply
- **Note**: Some garbled text during boot is normal for ESP32

#### **No Display Output**
- **Check**: 8-bit parallel connections (GPIO39-46 for data, GPIO5-9 for control)
- **Verify**: Backlight pin (GPIO38) is working
- **Test**: Power supply provides adequate current (>500mA)

#### **WiFi Configuration Issues**
- **Expected**: Device should create "ESP32-Tally-Config" hotspot on first boot
- **Check**: Look for the WiFi network in your device's WiFi list
- **Connect**: Use password "12345678" and navigate to 192.168.4.1

### **3. Hardware Verification Checklist**

#### **Power & Connections**
- [ ] USB-C cable properly connected
- [ ] Device receiving adequate power (5V, >500mA)
- [ ] No loose connections on display interface

#### **Display Interface (8-bit Parallel)**
```
Control Pins:
- TFT_CS: GPIO5    (Chip Select)
- TFT_DC: GPIO6    (Data/Command)
- TFT_RST: GPIO9   (Reset)
- TFT_WR: GPIO7    (Write Strobe)
- TFT_RD: GPIO8    (Read Strobe)
- TFT_BL: GPIO38   (Backlight)

Data Pins (8-bit parallel):
- TFT_D0: GPIO39
- TFT_D1: GPIO40
- TFT_D2: GPIO41
- TFT_D3: GPIO42
- TFT_D4: GPIO43
- TFT_D5: GPIO44
- TFT_D6: GPIO45
- TFT_D7: GPIO46
```

#### **Button Functions**
- **GPIO0 (Boot)**: Hold during startup to force config mode
- **GPIO21 (User)**: Press to enter configuration mode

### **4. Expected Boot Sequence**

1. **Power On** → ESP32 bootloader messages (may appear garbled)
2. **Firmware Start** → "ESP32 Tally Light Starting..." message
3. **Display Init** → Screen should light up with boot screen
4. **WiFi Setup** → Creates "ESP32-Tally-Config" network (first boot)
5. **Hub Connection** → Attempts to connect to configured Tally Hub

### **5. Configuration Process**

#### **First Time Setup**
1. Device boots and creates WiFi hotspot "ESP32-Tally-Config"
2. Connect with password: `12345678`
3. Navigate to: `192.168.4.1`
4. Configure:
   - WiFi network credentials
   - Tally Hub server IP (e.g., 192.168.0.216)
   - Tally Hub port (default: 7412)
   - Device name and ID

#### **Normal Operation**
- Device connects to configured WiFi
- Registers with Tally Hub server
- Shows current tally status on display
- Receives tally updates via UDP

### **6. Troubleshooting Commands**

#### **Re-upload Firmware**
```bash
cd firmware/ESP32-1732S019
pio run -e esp32-1732s019-tally -t upload
```

#### **Monitor Serial Output**
```bash
pio device monitor --baud 115200
```

#### **Clean Build**
```bash
pio run -e esp32-1732s019-tally -t clean
pio run -e esp32-1732s019-tally
```

#### **Force Bootloader Mode**
- Hold BOOT button (GPIO0) while pressing RESET
- Or disconnect power, hold BOOT, reconnect power

### **7. Visual Indicators**

#### **Display States**
- **Boot Screen**: Shows device info and version
- **Config Mode**: Shows WiFi setup instructions
- **Connected**: Shows "IDLE" with gray background
- **LIVE**: Red background with "LIVE" text
- **PREVIEW**: Orange background with "PREVIEW" text

#### **Status Indicators**
- **REC**: Recording indicator (bottom of screen)
- **STR**: Streaming indicator (bottom of screen)
- **WiFi**: Connection status in device info

### **8. Network Integration**

#### **Tally Hub Connection**
1. Ensure Tally Hub server is running: `npm run dev`
2. Check firewall allows UDP traffic on port 7412
3. Verify device and hub are on same network
4. Device should appear in hub's device list after registration

#### **Device Assignment**
1. Open Tally Hub admin panel
2. Find ESP32 device in device list
3. Assign to specific OBS scene or vMix input
4. Device will only show tally for assigned source

### **9. If Still Having Issues**

#### **Reset Device**
- Use web interface: Navigate to device IP → Configuration → Factory Reset
- Or clear preferences in code and re-upload

#### **Check Hub Server**
- Ensure Tally Hub is running and accessible
- Test UDP connectivity from other devices
- Check server logs for device registration attempts

#### **Hardware Test**
- Try a different USB cable
- Test with different power source
- Check for damaged pins or connections

The upload was successful, so the firmware is now running on your device. The next step is to verify the display is working and configure the WiFi connection to integrate with your Tally Hub system.

## 📋 **Quick Status Check**

✅ **Firmware Upload**: SUCCESS  
⏳ **Display Test**: Pending  
⏳ **WiFi Config**: Pending  
⏳ **Hub Integration**: Pending  

Your ESP32-1732S019 tally light is ready for configuration and testing!

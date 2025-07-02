# Hardware Guide

Tally Hub supports a variety of hardware devices, from cost-effective ESP32 boards to premium M5Stack devices. This guide will help you choose the right hardware for your needs.

## 🎯 **Device Comparison**

| Device | Cost | Display | Battery | Mounting | Best For |
|--------|------|---------|---------|----------|----------|
| **ESP32-1732S019** | ~$15 | 1.9" TFT | USB Only | Compact | Budget setups |
| **M5Stick C Plus** | ~$25 | 1.14" IPS | Built-in | Professional | Mobile use |
| **Web Browser** | Free | Any screen | Device dependent | N/A | Testing |
| **Custom ESP32** | $10-20 | Optional | Optional | Custom | DIY builds |

## 📟 **ESP32-1732S019**

### Overview
The ESP32-1732S019 is an excellent entry-level device that provides professional tally functionality at an affordable price point.

### Specifications
- **Microcontroller**: ESP32-S3 dual-core
- **Display**: 1.9" 320x170 TFT LCD
- **Connectivity**: WiFi 802.11 b/g/n
- **Power**: USB-C 5V input
- **Dimensions**: 45mm x 30mm x 15mm
- **Weight**: ~25g

### Features
- **Bright Display**: Excellent visibility in studio environments
- **Low Power**: Efficient ESP32-S3 for extended operation
- **Compact Size**: Easy to mount on cameras or stands
- **USB-C Power**: Modern connector for reliable power
- **Open Source**: Full firmware source code available

### Purchasing
Available from multiple suppliers:
- **AliExpress**: Search "ESP32-1732S019"
- **Amazon**: Various sellers (~$15-20)
- **Local Electronics**: Some specialist stores

### Setup Process
1. **Connect via USB-C** to your computer
2. **Flash firmware** using the web-based flasher
3. **Configure WiFi** through setup portal
4. **Mount on camera** or tally stand
5. **Assign in admin panel**

## 🔋 **M5Stick C Plus**

### Overview
The M5Stick C Plus is a premium option that offers professional build quality with advanced features like built-in battery operation.

### Specifications
- **Microcontroller**: ESP32-PICO-D4
- **Display**: 1.14" 240x135 IPS LCD
- **Battery**: Built-in 135mAh LiPo
- **Connectivity**: WiFi 802.11 b/g/n
- **Power**: USB-C charging + battery
- **Dimensions**: 48mm x 25mm x 14mm
- **Weight**: ~13g

### Features
- **Battery Operation**: Up to 2-3 hours wireless use
- **Premium Display**: High-quality IPS with wide viewing angles
- **Professional Housing**: Durable plastic case suitable for broadcast
- **Grove Connector**: Expansion port for custom accessories
- **Button Interface**: Physical buttons for local control

### Purchasing
- **M5Stack Official**: [m5stack.com](https://m5stack.com)
- **Amazon**: Official M5Stack store
- **Adafruit**: Authorized distributor
- **Local Distributors**: Check M5Stack website

### Battery Life
- **Typical Use**: 2-3 hours continuous operation
- **Standby**: 8-12 hours with WiFi connected
- **Charging**: ~1 hour via USB-C
- **Power Management**: Automatic sleep when inactive

## 🌐 **Web-based Tallies**

### Overview
Any device with a web browser can serve as a tally light, making this the most accessible option for testing and temporary setups.

### Supported Devices
- **Smartphones**: iPhone, Android devices
- **Tablets**: iPad, Android tablets, Windows tablets
- **Laptops**: Any laptop with a web browser
- **Smart TVs**: Many modern smart TVs with browsers
- **Dedicated Displays**: Raspberry Pi with browser

### Features
- **No Cost**: Use existing devices
- **Instant Setup**: Just visit a URL
- **Full Screen**: Professional full-screen tally display
- **Responsive**: Adapts to any screen size
- **Color Customization**: Configurable tally colors

### Best Practices
- **Dedicated Devices**: Use devices exclusively for tally use
- **Power Management**: Disable sleep modes during production
- **Brightness**: Set maximum brightness for visibility
- **Orientation Lock**: Prevent accidental rotation
- **Do Not Disturb**: Enable to prevent notifications

## 🔧 **Custom Hardware Builds**

### ESP32 Development Boards
Build your own tally lights using standard ESP32 development boards:

#### Recommended Boards
- **ESP32-WROOM-32**: Classic development board
- **ESP32-S3**: Newer generation with better performance
- **ESP32-C3**: Lower cost option with adequate performance

#### Additional Components
- **LED Strips**: WS2812B/NeoPixel for custom lighting
- **Displays**: OLED, TFT, or LED matrix displays
- **Enclosures**: 3D printed or commercial project boxes
- **Power Supply**: USB power banks or wall adapters

### Building Instructions
1. **Flash Base Firmware**: Use our ESP32 firmware as starting point
2. **Modify for Hardware**: Adapt GPIO pins for your components
3. **Test Connectivity**: Ensure WiFi and UDP communication work
4. **Customize Display**: Adapt for your chosen display type
5. **Create Enclosure**: Design mounting system for your use case

### Community Builds
Check our **[GitHub Wiki](https://github.com/tallyhubpro/Tallyhub/wiki)** for community-contributed builds:
- **LED Ring Tallies**: Using WS2812B LED rings
- **Large Format Displays**: Using larger TFT screens
- **Wireless Solutions**: Battery-powered custom builds
- **Professional Enclosures**: Commercial-grade mounting solutions

## 🔌 **Connectivity Requirements**

### Network Specifications
- **WiFi Standard**: 802.11 b/g/n (2.4GHz)
- **Security**: WPA2/WPA3 supported
- **DHCP**: Automatic IP assignment preferred
- **Multicast**: Required for device discovery
- **Ports**: UDP 9999 for device communication

### Performance Considerations
- **Signal Strength**: -70dBm or better for reliable operation
- **Bandwidth**: <1Kbps per device under normal operation
- **Latency**: Network latency affects tally response time
- **Reliability**: Stable network connection essential for live production

### Network Optimization
- **5GHz WiFi**: Use when available for better performance
- **QoS Configuration**: Prioritize tally traffic
- **Dedicated SSID**: Consider separate network for production gear
- **Enterprise Networks**: May require additional configuration

## 📦 **Package Contents & Setup**

### What's Included (ESP32-1732S019)
- ESP32-1732S019 development board
- USB-C cable (varies by supplier)
- Pin header strips (unsoldered)
- Basic documentation

### What's Included (M5Stick C Plus)
- M5Stick C Plus device
- USB-C cable
- Grove connector cable
- Quick start guide
- Protective case (some packages)

### Additional Items Needed
- **Mounting Solution**: Camera mounts, desk stands, or custom brackets
- **Power Source**: USB chargers, power banks, or direct camera power
- **Network Access**: WiFi credentials for your production network

## 🛠️ **Mounting Solutions**

### Camera Mounting
- **Hot Shoe Mounts**: Standard camera accessory mounts
- **Cold Shoe Adapters**: For cameras without hot shoes
- **Magic Arms**: Flexible positioning arms
- **Velcro Strips**: Quick temporary mounting

### Desk/Stand Mounting
- **Phone Stands**: Universal phone/tablet stands
- **Custom 3D Prints**: Community-designed mounts
- **Magnetic Mounts**: For metal surfaces
- **Suction Cups**: For smooth surfaces

### Professional Solutions
- **Broadcast Mounts**: Professional camera accessory mounts
- **Rack Mounting**: For control room installations
- **Wall Mounts**: Permanent installation solutions
- **Ceiling Suspension**: Overhead mounting systems

---

## 💡 **Buying Guide**

### For Beginners
**Start with ESP32-1732S019**:
- Low cost to try the system
- Easy to use and configure
- Professional results
- Upgrade path to premium devices

### For Professional Use
**Choose M5Stick C Plus**:
- Battery operation for flexibility
- Professional appearance
- Better build quality
- Suitable for client-facing environments

### For Large Installations
**Consider Custom Builds**:
- Optimized for specific use cases
- Lower per-unit costs at scale
- Customizable features
- Integration with existing systems

**Ready to get hardware?** Check our **[recommended suppliers](suppliers.md)** and **[setup guides](../getting-started/firmware-flashing.md)** to get your devices configured quickly.

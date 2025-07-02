# Supported Devices

Tally Hub supports a variety of hardware devices, from budget-friendly ESP32 boards to premium wireless options.

## 🎯 **Recommended Devices**

### ESP32-1732S019 (Primary Recommendation)

![ESP32-1732S019](../assets/esp32-1732s019_bare.webp)

**Perfect balance of features and cost**

- **Display**: 1.9" Color IPS LCD (170×320 pixels)
- **Connectivity**: WiFi 802.11 b/g/n
- **Power**: USB-C, 5V @ 500mA
- **Size**: 85×55×18mm
- **Cost**: ~$15 USD
- **Mounting**: Standard 1/4" thread compatible

**Features:**
- ✅ Bright, clearly visible display
- ✅ Compact, camera-mountable design  
- ✅ USB-C for modern power connectivity
- ✅ Excellent price-to-performance ratio
- ✅ Wide availability from multiple suppliers

**Best for**: Studios with permanent camera positions, budget-conscious setups

### M5Stick C Plus (Premium Option)

![M5Stick C Plus](../assets/M5%20Stick%20Plus1.1.jpeg)

**Professional wireless option with battery**

- **Display**: 1.14" Color TFT LCD (135×240 pixels)
- **Connectivity**: WiFi 802.11 b/g/n
- **Power**: Built-in 135mAh battery + USB-C charging
- **Size**: 48×25×14mm
- **Cost**: ~$25 USD
- **Mounting**: Magnetic, clip-on, or lanyard

**Features:**
- ✅ Wireless operation with built-in battery
- ✅ Premium build quality and housing
- ✅ Multiple mounting accessories available
- ✅ Professional appearance suitable for broadcasts
- ✅ Ultra-compact form factor

**Best for**: Mobile productions, handheld cameras, professional broadcasts

## 📱 **Web-Based Tallies**

**Universal compatibility with any device**

Transform any smartphone, tablet, or computer into a tally light:

- **Requirements**: Modern web browser (Chrome, Firefox, Safari, Edge)
- **Display**: Full-screen tally colors with customizable brightness
- **Cost**: Free for unlimited devices
- **Features**: 
  - ✅ Instant deployment - just visit a URL
  - ✅ Perfect for testing before hardware investment
  - ✅ Great for temporary or backup tally positions
  - ✅ Supports all modern devices and screen sizes

## 🔄 **Coming Soon**

### ESP32-S3 Display Boards
- **Larger displays** with improved visibility
- **Touch interface** for local configuration
- **USB-C PD** for single-cable power and mounting

### Raspberry Pi Integration
- **GPIO tally outputs** for traditional LED systems
- **HDMI overlay** capability for camera feeds
- **Linux-based reliability** for critical installations

## 🛒 **Where to Buy**

### ESP32-1732S019

| Supplier | Typical Price | Shipping | Notes |
|----------|---------------|----------|-------|
| **AliExpress** | $12-15 USD | 2-4 weeks | Best prices, bulk options |
| **Amazon** | $18-25 USD | 1-2 days | Fast shipping, returns |
| **Banggood** | $14-18 USD | 1-3 weeks | Good balance of price/speed |
| **Local Electronics** | $20-30 USD | Same day | Support local business |

### M5Stick C Plus

| Supplier | Typical Price | Shipping | Notes |
|----------|---------------|----------|-------|
| **M5Stack Official** | $24-28 USD | 1-2 weeks | Genuine, warranty included |
| **DigiKey** | $26-30 USD | 1-2 days | Professional supplier |
| **Mouser** | $25-29 USD | 1-2 days | Electronics distributor |
| **Adafruit** | $28-32 USD | 1-3 days | Educational focus, guides |

## 📋 **Technical Specifications**

### Minimum Requirements

| Specification | ESP32-1732S019 | M5Stick C Plus | Web Browser |
|---------------|----------------|----------------|-------------|
| **Power** | 5V @ 500mA USB-C | Built-in battery | N/A |
| **WiFi** | 802.11 b/g/n | 802.11 b/g/n | WiFi connection |
| **Display** | 1.9" Color IPS | 1.14" Color TFT | Any screen |
| **Memory** | 4MB Flash | 4MB Flash | N/A |
| **Range** | 50m+ indoor | 50m+ indoor | WiFi range |

### Performance Metrics

| Metric | Target | Achieved |
|--------|---------|----------|
| **Latency** | < 100ms | 45-75ms average |
| **Reliability** | 99.9% uptime | 99.7% in testing |
| **Battery Life** | N/A (M5Stick) | 6-8 hours continuous |
| **Connection Recovery** | < 30 seconds | 15-25 seconds average |

## 🔧 **Setup Requirements**

### Network Infrastructure

- **WiFi Router**: 802.11n or newer recommended
- **Network Capacity**: Minimal bandwidth required (~1KB/s per device)
- **DHCP**: Automatic IP assignment for easy setup
- **Firewall**: Allow UDP traffic on local network

### Power Infrastructure

- **ESP32-1732S019**: USB-C power adapters or power banks
- **M5Stick C Plus**: USB-C charging stations for overnight charging
- **Mounting**: 1/4" threads or magnetic mounts as needed

---

**Ready to get started?** Check out our [firmware flashing guide](../getting-started/firmware-flashing.md) to set up your devices.

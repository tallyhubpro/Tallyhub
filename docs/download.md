# Download

Get the latest version of Tally Hub for your operating system.

## 📦 **Latest Release**

### Version 1.0.0 - Professional Tally System
*Released: July 1, 2025*

<div class="grid cards" markdown>

-   :fontawesome-brands-windows:{ .lg .middle } **Windows**

    ---

    Complete package with startup scripts and dependencies

    **Requirements:** Windows 10 or later, Node.js 16+

    [:octicons-download-24: Download for Windows](https://github.com/tallyhubpro/Tallyhub/releases/latest/download/tally-hub-windows.zip)

-   :fontawesome-brands-apple:{ .lg .middle } **macOS**

    ---

    Universal binary for Intel and Apple Silicon Macs

    **Requirements:** macOS 10.14 or later, Node.js 16+

    [:octicons-download-24: Download for macOS](https://github.com/tallyhubpro/Tallyhub/releases/latest/download/tally-hub-macos.tar.gz)

-   :fontawesome-brands-linux:{ .lg .middle } **Linux**

    ---

    Portable package for most Linux distributions

    **Requirements:** Linux kernel 3.10+, Node.js 16+

    [:octicons-download-24: Download for Linux](https://github.com/tallyhubpro/Tallyhub/releases/latest/download/tally-hub-linux.tar.gz)

-   :fontawesome-brands-github:{ .lg .middle } **Source Code**

    ---

    Build from source or contribute to development

    **Requirements:** Node.js 16+, TypeScript, Git

    [:octicons-download-24: Clone Repository](https://github.com/tallyhubpro/Tallyhub)

</div>

## 🚀 **Quick Installation**

### Automated Setup (Recommended)

The easiest way to get started is with our automated setup:

=== "Windows"

    1. **Download** the Windows package above
    2. **Extract** the ZIP file to your desired location
    3. **Run** `Start Tally Hub.bat`
    4. **Wait** for automatic dependency installation
    5. **Open** http://localhost:3000/admin.html in your browser

=== "macOS"

    1. **Download** the macOS package above
    2. **Extract** the tar.gz file to your desired location
    3. **Run** `Start Tally Hub.command`
    4. **Allow** execution when prompted by security settings
    5. **Open** http://localhost:3000/admin.html in your browser

=== "Linux"

    ```bash
    # Download and extract
    wget https://github.com/tallyhubpro/Tallyhub/releases/latest/download/tally-hub-linux.tar.gz
    tar -xzf tally-hub-linux.tar.gz
    cd Tallyhub
    
    # Make executable and run
    chmod +x "Start Tally Hub.command"
    ./Start\ Tally\ Hub.command
    ```

### Manual Installation

For advanced users who prefer manual control:

```bash
# Clone the repository
git clone https://github.com/tallyhubpro/Tallyhub.git
cd Tallyhub

# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start
```

## 📱 **Firmware Downloads**

Pre-compiled firmware for supported hardware devices:

### ESP32-1732S019
- **Latest Firmware**: [esp32-firmware-v1.0.0.bin](https://github.com/tallyhubpro/Tallyhub/releases/latest/download/esp32-firmware.bin)
- **Bootloader**: [esp32-bootloader-v1.0.0.bin](https://github.com/tallyhubpro/Tallyhub/releases/latest/download/esp32-bootloader.bin)
- **Partitions**: [esp32-partitions-v1.0.0.bin](https://github.com/tallyhubpro/Tallyhub/releases/latest/download/esp32-partitions.bin)

### M5Stick C Plus
- **Latest Firmware**: [m5stick-firmware-v1.0.0.bin](https://github.com/tallyhubpro/Tallyhub/releases/latest/download/m5stick-firmware.bin)
- **Bootloader**: [m5stick-bootloader-v1.0.0.bin](https://github.com/tallyhubpro/Tallyhub/releases/latest/download/m5stick-bootloader.bin)
- **Partitions**: [m5stick-partitions-v1.0.0.bin](https://github.com/tallyhubpro/Tallyhub/releases/latest/download/m5stick-partitions.bin)

!!! tip "Easy Firmware Flashing"
    You don't need to download firmware manually! Use the built-in web flasher at **http://localhost:3000/flash.html** for one-click firmware installation.

## 🔧 **System Requirements**

### Minimum Requirements
- **CPU**: 1 GHz single-core processor
- **RAM**: 512 MB available memory
- **Storage**: 100 MB free disk space
- **Network**: WiFi or Ethernet connection
- **Operating System**: 
  - Windows 10 or later
  - macOS 10.14 (Mojave) or later
  - Linux with kernel 3.10 or later

### Recommended Requirements
- **CPU**: 2 GHz dual-core processor or better
- **RAM**: 2 GB available memory
- **Storage**: 1 GB free disk space
- **Network**: Gigabit Ethernet or 802.11n WiFi
- **Operating System**: Latest stable version

### For Large Deployments (50+ devices)
- **CPU**: 4 GHz quad-core processor
- **RAM**: 8 GB available memory
- **Storage**: 5 GB free disk space
- **Network**: Dedicated gigabit network interface

## 📋 **What's Included**

Each download package includes:

### Core Application
- ✅ **Tally Hub Server** - Main application with web interface
- ✅ **Admin Panel** - Complete web-based management interface
- ✅ **Device Flasher** - Browser-based ESP32/M5Stick firmware installer
- ✅ **REST API** - Full HTTP API for custom integrations

### Documentation
- ✅ **Setup Guides** - Step-by-step installation instructions
- ✅ **User Manual** - Complete feature documentation
- ✅ **API Documentation** - REST API reference
- ✅ **Troubleshooting Guide** - Common issues and solutions

### Firmware & Drivers
- ✅ **ESP32 Firmware** - Pre-compiled firmware for ESP32 devices
- ✅ **M5Stick Firmware** - Pre-compiled firmware for M5Stick devices
- ✅ **Web Interface** - Browser-based tally clients
- ✅ **Example Code** - Sample integrations and custom device code

### Utilities
- ✅ **Startup Scripts** - Automated startup for Windows/macOS/Linux
- ✅ **Configuration Tools** - Network and device configuration utilities
- ✅ **Backup Tools** - Configuration backup and restore utilities
- ✅ **Update Checker** - Automatic update notifications

## 🔄 **Release Notes**

### Version 1.0.0 (Latest)
**Release Date:** July 1, 2025

#### 🆕 New Features
- Complete rewrite with TypeScript for improved reliability
- Modern gradient-based admin interface
- Automatic device wake-up and reconnection system
- Browser-based firmware flashing for ESP32/M5Stick devices
- Recording/streaming status indicators
- Real-time notification system
- Mobile-responsive admin panel

#### 🐛 Bug Fixes
- Fixed UDP socket connection issues
- Resolved device assignment persistence problems
- Improved error handling and user feedback
- Fixed browser compatibility issues with firmware flasher

#### ⚡ Performance Improvements
- Optimized device storage saving frequency
- Reduced memory usage and CPU overhead
- Faster device discovery and connection
- Improved network protocol efficiency

#### 🔧 Technical Changes
- Updated to Node.js 16+ requirement
- Enhanced TypeScript type safety
- Modular architecture for better maintainability
- Comprehensive API documentation

### Previous Versions
- **v0.9.x**: Beta releases with core functionality
- **v0.8.x**: Initial ESP32 support
- **v0.7.x**: Basic web interface

## 🆘 **Support & Updates**

### Getting Help
- **Documentation**: Comprehensive guides included with download
- **GitHub Issues**: Report bugs and request features
- **Community Discussions**: Get help from other users
- **Email Support**: Contact us for enterprise support

### Stay Updated
- **Star the Repository**: Get notified of new releases
- **Release Notifications**: Enable GitHub release notifications
- **Community**: Join our Discord for real-time updates

### Enterprise Support
For commercial deployments requiring dedicated support:

- **Priority Support**: Direct access to development team
- **Custom Features**: Tailored development for specific needs
- **Training**: On-site or remote training sessions
- **SLA**: Service level agreements for mission-critical installations

---

!!! success "Ready to Start?"
    Download the package for your operating system and follow our [Getting Started Guide](getting-started/index.md) to have your tally system running in minutes!

[Get Started →](getting-started/index.md){ .md-button .md-button--primary }
[View Features →](features.md){ .md-button }

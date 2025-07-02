# Complete Setup Guide

This comprehensive guide will walk you through setting up Tally Hub from start to finish, including hardware flashing, network configuration, and video mixer integration.

## 📋 Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Computer**: Windows 10+, macOS 10.14+, or Linux
- [ ] **Network**: WiFi network for devices (2.4GHz recommended)
- [ ] **Video Mixer**: OBS Studio or vMix (optional for testing)
- [ ] **Web Browser**: Chrome, Firefox, Safari, or Edge
- [ ] **Hardware** (optional): ESP32 or M5Stick devices

!!! tip "Start Simple"
    Begin with web-based tallies using smartphones before investing in hardware. This validates your setup and helps you understand the workflow.

## 🎯 Part 1: Server Installation

### Download and Install

=== "Windows"

    1. **Download** the [Windows package](../download.md)
    2. **Extract** to `C:\TallyHub` (or preferred location)
    3. **Right-click** `Start Tally Hub.bat` → **Run as Administrator**
    4. **Wait** for automatic dependency installation
    5. **Verify** installation: http://localhost:3000

=== "macOS"

    1. **Download** the [macOS package](../download.md)
    2. **Extract** to `/Applications/TallyHub`
    3. **Control+Click** `Start Tally Hub.command` → **Open**
    4. **Click Open** when macOS security dialog appears
    5. **Verify** installation: http://localhost:3000

=== "Linux"

    ```bash
    # Download and install
    wget https://github.com/tallyhubpro/Tallyhub/releases/latest/download/tally-hub-linux.tar.gz
    tar -xzf tally-hub-linux.tar.gz
    cd Tallyhub
    chmod +x "Start Tally Hub.command"
    ./Start\ Tally\ Hub.command
    ```

### Verify Installation

1. **Open browser** to http://localhost:3000
2. **Check admin panel** at http://localhost:3000/admin.html
3. **Test web tally** at http://localhost:3000/tally.html

If everything loads correctly, your server is ready!

## 🎥 Part 2: Video Mixer Configuration

### Option A: OBS Studio Setup

1. **Install OBS Studio** (if not already installed)
   - Download from [obsproject.com](https://obsproject.com)
   - Version 28+ recommended (built-in WebSocket)

2. **Enable WebSocket Server**:
   ```
   OBS → Tools → WebSocket Server Settings
   ✅ Enable WebSocket server
   Server Port: 4444
   Server Password: [create a secure password]
   ```

3. **Configure Tally Hub**:
   - Open admin panel: http://localhost:3000/admin.html
   - Go to **Video Mixers** section
   - Select **OBS Studio**
   - Enter connection details:
     - **Host**: `localhost` (if OBS on same computer)
     - **Port**: `4444`
     - **Password**: [your WebSocket password]
   - Click **Connect**

4. **Verify Connection**:
   - ✅ Status should show "Connected"
   - Scene list should appear in source assignments
   - Test by switching scenes in OBS

### Option B: vMix Setup

1. **Install vMix** (if not already installed)
   - Any current vMix version works
   - Basic edition sufficient for testing

2. **Enable Web Controller**:
   ```
   vMix → Settings → Web Controller
   ✅ Enable Web Controller
   Port: 8088
   Username: [optional]
   Password: [optional]
   ```

3. **Configure Tally Hub**:
   - Open admin panel: http://localhost:3000/admin.html
   - Go to **Video Mixers** section  
   - Select **vMix**
   - Enter connection details:
     - **Host**: `localhost` (if vMix on same computer)
     - **Port**: `8088`
     - **Username/Password**: [if configured]
   - Click **Connect**

4. **Verify Connection**:
   - ✅ Status should show "Connected"
   - vMix inputs appear in source list
   - Test by switching preview/program in vMix

## 📱 Part 3: Web-based Tallies

Perfect for testing and temporary setups.

### Setup Web Tallies

1. **Find your computer's IP address**:
   
   === "Windows"
       ```cmd
       ipconfig | findstr IPv4
       ```
   
   === "macOS/Linux"
       ```bash
       ifconfig | grep "inet " | grep -v 127.0.0.1
       ```

2. **Access from any device**:
   - **URL**: `http://[your-ip]:3000/tally.html`
   - **Example**: `http://192.168.1.100:3000/tally.html`

3. **Configure each tally**:
   - Device will show "STANDBY" initially
   - In admin panel, drag device to assign to a source
   - Tally will immediately reflect the assignment

### Optimize Web Tallies

For best performance:

- **Disable sleep mode** on phones/tablets
- **Use landscape orientation** for larger display
- **Set maximum brightness** for studio visibility
- **Enable "Do Not Disturb"** to prevent notifications
- **Connect to same WiFi** as Tally Hub server

## 🔧 Part 4: Hardware Setup

### ESP32-1732S019 Setup

1. **Purchase Hardware**:
   - Search "ESP32-1732S019" on AliExpress or Amazon
   - Typical cost: $15-20 including shipping
   - USB-C cable usually included

2. **Flash Firmware**:
   - Connect ESP32 to computer via USB-C
   - Open admin panel: http://localhost:3000/admin.html
   - Click **Flash ESP32 Firmware**
   - Select **ESP32-1732S019** device type
   - Choose **COM port** from dropdown
   - Click **Flash Firmware** and wait for completion

3. **Configure WiFi**:
   - After flashing, device creates WiFi hotspot: `TallyHub-Setup`
   - Connect to this network with phone/computer
   - Open browser to `192.168.4.1`
   - Enter your WiFi network credentials
   - Click **Save** - device will restart and connect

4. **Verify Connection**:
   - Device should appear in admin panel automatically
   - Status should show "Connected" with IP address
   - Device displays "STANDBY" state

### M5Stick C Plus Setup

1. **Purchase Hardware**:
   - Order from M5Stack official store or authorized dealers
   - Typical cost: $25-30
   - USB-C cable included

2. **Flash Firmware**:
   - Connect M5Stick to computer via USB-C
   - Open admin panel: http://localhost:3000/admin.html
   - Click **Flash ESP32 Firmware**
   - Select **M5Stick C Plus** device type
   - Choose **COM port** from dropdown  
   - Click **Flash Firmware** and wait for completion

3. **Configure WiFi**:
   - Process identical to ESP32-1732S019
   - Use button controls if needed for interaction

4. **Battery Management**:
   - First charge: Connect USB-C for 1+ hours
   - Normal operation: 2-3 hours wireless use
   - Battery indicator on device screen
   - Auto-sleep when inactive to preserve battery

## ⚙️ Part 5: Device Assignment

### Understanding Tally States

- **🔴 PROGRAM** (Red): Device assigned to current program/live source
- **🟢 PREVIEW** (Green): Device assigned to preview/next source  
- **⚫ STANDBY** (Dark): Device not assigned or source inactive

### Assign Devices to Sources

1. **Open Admin Panel**: http://localhost:3000/admin.html

2. **View Connected Devices**:
   - Devices appear automatically when connected
   - Each shows IP address, type, and current state
   - Connection status indicator (green = connected)

3. **Assign Sources**:
   - **Drag and Drop**: Drag device to source in video mixer section
   - **Manual Assignment**: Click device → select source dropdown
   - **Bulk Assignment**: Select multiple devices → assign to same source

4. **Test Assignments**:
   - Switch scenes/inputs in your video mixer
   - Tallies should respond immediately (<100ms)
   - Colors change based on program/preview state

### Advanced Assignment Options

- **Multiple Devices per Source**: Multiple tallies can show same source
- **Source Aliases**: Rename sources for clearer identification  
- **Assignment Groups**: Save common assignment configurations
- **Persistent Storage**: Assignments survive server restarts

## 🌐 Part 6: Network Optimization

### Basic Network Setup

For most users, standard home/office WiFi works perfectly:

- **2.4GHz WiFi**: Better range, sufficient for tally data
- **5GHz WiFi**: Lower latency if devices support it
- **Wired Connection**: Use Ethernet for Tally Hub server when possible

### Professional Network Setup

For larger installations or critical productions:

1. **Dedicated VLAN**: Separate network for production equipment
2. **QoS Configuration**: Prioritize tally traffic
3. **Static IP Assignment**: DHCP reservations for critical devices  
4. **Network Monitoring**: Monitor for packet loss or high latency
5. **Backup Connectivity**: Secondary network for redundancy

### Firewall Configuration

Ensure these ports are accessible:

- **TCP 3000**: Tally Hub web interface
- **UDP 9999**: Device communication  
- **TCP 4444**: OBS WebSocket (if using OBS)
- **TCP 8088**: vMix Web Controller (if using vMix)

## 🔍 Part 7: Testing and Validation

### Basic Functionality Test

1. **Web Tally Test**:
   - Open tally URL on phone/tablet
   - Assign to a source in admin panel
   - Switch sources in video mixer
   - Verify immediate color changes

2. **Hardware Test**:
   - Connect ESP32/M5Stick device
   - Verify automatic discovery in admin panel
   - Assign to source and test switching
   - Check display brightness and visibility

3. **Latency Test**:
   - Record video mixer and tally simultaneously
   - Frame-by-frame analysis should show <100ms delay
   - Test under normal network load conditions

### Production Readiness Checklist

Before going live:

- [ ] All devices connect automatically on power-up
- [ ] Source assignments are correct and persistent
- [ ] Video mixer integration is stable
- [ ] Network has adequate capacity and stability
- [ ] Backup plans are in place for critical shows
- [ ] Operators are trained on the system

## 🚨 Troubleshooting Common Issues

### Devices Won't Connect

**Check WiFi Configuration**:
```bash
# Reset WiFi on ESP32 (hold BOOT button for 10 seconds during startup)
# Reconfigure through setup portal
```

**Verify Network Connectivity**:
- Ping Tally Hub server from device network
- Check firewall settings on server
- Ensure multicast is enabled on network

### Slow Tally Updates

**Network Optimization**:
- Use 5GHz WiFi if available
- Check for network congestion
- Verify QoS settings prioritize tally traffic

**Mixer Configuration**:
- Reduce polling frequency if CPU usage high
- Check mixer API response times
- Verify network path between mixer and Tally Hub

### Admin Panel Issues

**Browser Compatibility**:
- Use Chrome, Firefox, Safari, or Edge
- Enable JavaScript and WebSocket support
- Clear browser cache if interface doesn't load

**Connection Problems**:
- Verify Tally Hub server is running
- Check URL is correct (http://localhost:3000/admin.html)
- Ensure port 3000 is not blocked by firewall

## 🎓 Next Steps

### Expand Your System

1. **Add More Devices**: Scale up to dozens of tally lights
2. **Custom Hardware**: Build specialized tally solutions
3. **API Integration**: Connect third-party systems
4. **Multi-Mixer**: Connect multiple video mixers
5. **Remote Monitoring**: Set up off-site system monitoring

### Join the Community

- **[GitHub Discussions](https://github.com/tallyhubpro/Tallyhub/discussions)**: Share your setup and get help
- **[Wiki](https://github.com/tallyhubpro/Tallyhub/wiki)**: Contribute guides and tips
- **[Issue Tracker](https://github.com/tallyhubpro/Tallyhub/issues)**: Report bugs and request features

### Professional Support

For commercial installations:
- **Training Sessions**: Remote or on-site training available
- **Custom Development**: Feature development for specific needs
- **Priority Support**: Faster response times for critical issues

---

## ✅ Success!

You now have a fully functional professional tally light system! Your setup should provide:

- **Real-time tally updates** synchronized with your video mixer
- **Professional reliability** suitable for live production
- **Scalable architecture** that grows with your needs  
- **Cost-effective operation** at a fraction of commercial systems

**Questions?** Check our **[troubleshooting guide](../troubleshooting.md)** or **[ask the community](https://github.com/tallyhubpro/Tallyhub/discussions)** for help.

# Getting Started with Tally Hub

Welcome to Tally Hub! This guide will get you up and running with your professional tally light system in just a few minutes.

## 📋 **Prerequisites**

Before getting started, make sure you have:

- **Computer**: Windows 10+, macOS 10.14+, or Linux
- **Network**: WiFi network for devices to connect to
- **Video Mixer**: OBS Studio or vMix (optional for testing)
- **Hardware** (optional): ESP32 or M5Stick devices for physical tallies

!!! tip "Start with Web Tallies"
    We recommend starting with web-based tallies using smartphones or tablets before investing in hardware. This lets you test the system and understand the workflow.

## 🚀 **Quick Start (5 Minutes)**

### Step 1: Download and Install

=== "Windows"

    1. Download the **[latest release](../download.md)**
    2. Extract the ZIP file to your desired location
    3. Double-click `Start Tally Hub.bat`
    4. Wait for the installation to complete

=== "macOS"

    1. Download the **[latest release](../download.md)**
    2. Extract the ZIP file to your Applications folder
    3. Right-click `Start Tally Hub.command` and select "Open"
    4. Click "Open" when macOS asks about running the script

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

### Step 2: Access the Admin Panel

1. Open your web browser
2. Navigate to **http://localhost:3000/admin.html**
3. You should see the Tally Hub admin interface

![Admin Panel](../assets/admin-panel-screenshot.png)

### Step 3: Test with Web Tally

1. Open a new browser tab or use your smartphone
2. Navigate to **http://[your-computer-ip]:3000/tally.html**
3. You should see a tally light interface
4. Try changing the Program source in the admin panel
5. Watch the tally light respond in real-time!

!!! success "Congratulations!"
    You now have a working tally system! The web tally will respond to changes in your admin panel in real-time.

## 🎥 **Connect Your Video Mixer**

### OBS Studio Setup

1. **Install OBS WebSocket Plugin** (if using OBS < 28):
   - Download from [obsproject.com](https://obsproject.com/forum/resources/obs-websocket-remote-control-obs-studio-from-websockets.466/)
   - Install and restart OBS

2. **Configure WebSocket** in OBS:
   - Go to **Tools → WebSocket Server Settings**
   - Enable **Enable WebSocket server**
   - Set port to **4444** (default)
   - Set password (optional but recommended)

3. **Connect in Tally Hub**:
   - Open the admin panel
   - Go to **Video Mixers** section
   - Enter your OBS WebSocket details:
     - **Host**: `localhost` (if OBS is on same computer)
     - **Port**: `4444`
     - **Password**: (if you set one)
   - Click **Connect**

### vMix Setup

1. **Enable vMix API**:
   - In vMix, go to **Settings → Web Controller**
   - Enable **Enable Web Controller**
   - Note the port number (usually 8088)

2. **Connect in Tally Hub**:
   - Open the admin panel
   - Go to **Video Mixers** section
   - Select **vMix** as mixer type
   - Enter vMix details:
     - **Host**: `localhost` (if vMix is on same computer)
     - **Port**: `8088` (or your configured port)
   - Click **Connect**

## 📱 **Add Hardware Devices**

### ESP32 Device Setup

1. **Purchase Hardware**:
   - **ESP32-1732S019**: Available from AliExpress, Amazon (~$15)
   - **M5Stick C Plus**: Available from M5Stack, Amazon (~$25)

2. **Flash Firmware**:
   - Connect ESP32 to your computer via USB
   - In the admin panel, click **Flash ESP32 Firmware**
   - Select your device from the list
   - Click **Flash** and wait for completion

3. **Configure WiFi**:
   - After flashing, the device will create a WiFi hotspot
   - Connect to the `TallyHub-Setup` network
   - Open a browser and configure your WiFi credentials
   - The device will restart and connect to your network

4. **Assign to Source**:
   - The device should appear in your admin panel automatically
   - Drag and drop it to assign to a video source
   - The device will immediately show the correct tally state

### M5Stick Setup

The process is identical to ESP32, but M5Stick devices offer:
- Better display quality
- Built-in battery for wireless operation
- More professional appearance
- Easier mounting options

## 🔧 **Configuration**

### Device Assignment

1. **Automatic Discovery**: Devices appear automatically when they connect
2. **Drag and Drop**: Simply drag devices to assign them to sources
3. **Multiple Assignment**: Multiple devices can be assigned to the same source
4. **Persistent Storage**: Assignments are saved across restarts

### Network Configuration

For best performance:

1. **Use 5GHz WiFi** when possible for lower latency
2. **Static IP assignment** for critical devices (optional)
3. **Quality of Service (QoS)** prioritization for tally traffic
4. **Separate VLAN** for production equipment (advanced)

### Advanced Settings

Access advanced configuration via the **Settings** page:

- **Update intervals**: Adjust polling frequency
- **Device timeouts**: Configure disconnection detection
- **Logging levels**: Enable detailed diagnostics
- **API settings**: Configure external integrations

## 🛠️ **Troubleshooting**

### Common Issues

#### Devices Not Connecting
1. **Check WiFi credentials** - ensure devices are on same network
2. **Firewall settings** - allow ports 3000 (HTTP) and 9999 (UDP)
3. **Network discovery** - ensure multicast is enabled on your network

#### Slow Tally Updates
1. **Network congestion** - check WiFi utilization
2. **Interference** - try different WiFi channels
3. **Distance** - ensure devices have good signal strength

#### Video Mixer Not Connecting
1. **Port conflicts** - ensure mixer ports are available
2. **Authentication** - verify credentials are correct
3. **Network accessibility** - test connection from other tools

### Advanced Diagnostics

Enable detailed logging in the admin panel:

1. Go to **Settings → Logging**
2. Set level to **Debug**
3. Reproduce the issue
4. Check logs in the **Logs** section

## 📚 **Next Steps**

Now that you have Tally Hub running:

1. **[Explore Features](../features.md)** - Learn about all capabilities
2. **[Hardware Guide](../hardware/index.md)** - Dive deeper into device options
3. **[Admin Panel Guide](../admin-panel.md)** - Master the interface
4. **[API Documentation](../api/index.md)** - Integrate with other systems
5. **[Join the Community](https://github.com/tallyhubpro/Tallyhub/discussions)** - Get help and share tips

## 🤝 **Need Help?**

- **[Troubleshooting Guide](../troubleshooting.md)** - Common solutions
- **[GitHub Issues](https://github.com/tallyhubpro/Tallyhub/issues)** - Report bugs
- **[Community Discussions](https://github.com/tallyhubpro/Tallyhub/discussions)** - Ask questions
- **[Wiki](https://github.com/tallyhubpro/Tallyhub/wiki)** - Community guides

---

**Congratulations!** You're now ready to use Tally Hub in your production environment. The system is designed to be reliable and professional-grade, so you can focus on creating great content while Tally Hub handles the technical details.

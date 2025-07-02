# Getting Started

Welcome to Tally Hub! This guide will help you set up a complete tally light system in just a few minutes.

## 📋 **What You'll Need**

### Required
- **Computer**: Windows, macOS, or Linux machine to run Tally Hub
- **Network**: Local WiFi network for device connectivity
- **Video Mixer**: OBS Studio, vMix, or compatible software

### Optional Hardware
- **ESP32 Devices**: For dedicated hardware tally lights
- **M5Stick C Plus**: Premium hardware option with display
- **Smartphones/Tablets**: For instant web-based tallies

## 🚀 **Quick Start (5 Minutes)**

### Step 1: Download and Start Tally Hub

=== "Windows"
    1. Download the latest release from the [Downloads page](../download.md)
    2. Extract the ZIP file to a folder
    3. Double-click `Start Tally Hub.bat`
    4. Wait for the server to start (you'll see "✅ Tally Hub ready")

=== "macOS"
    1. Download the latest release from the [Downloads page](../download.md)
    2. Extract the ZIP file to a folder
    3. Double-click `Start Tally Hub.command`
    4. If prompted about security, go to System Preferences → Security & Privacy and click "Open Anyway"
    5. Wait for the server to start (you'll see "✅ Tally Hub ready")

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
2. Go to **http://localhost:3000/admin.html**
3. You should see the Tally Hub admin interface

![Admin Panel First View](../assets/admin-panel-first-view.png)

### Step 3: Test with a Web Tally

1. On your smartphone or tablet, connect to the same WiFi network
2. Open a web browser and go to **http://[your-computer-ip]:3000**
3. Click "Connect as Web Tally"
4. You should see the device appear in the admin panel

### Step 4: Connect Your Video Mixer

=== "OBS Studio"
    1. In OBS, go to **Tools → WebSocket Server Settings**
    2. Enable **"Enable WebSocket server"**
    3. Note the port (usually 4455) and set a password if desired
    4. In Tally Hub admin panel, click **"Add Video Mixer"**
    5. Select **"OBS Studio"** and enter your connection details
    6. Click **"Test Connection"** to verify

=== "vMix"
    1. In vMix, go to **Settings → Web Controller**
    2. Enable **"Web Controller"** and note the port (usually 8088)
    3. In Tally Hub admin panel, click **"Add Video Mixer"**
    4. Select **"vMix"** and enter your connection details
    5. Click **"Test Connection"** to verify

### Step 5: Assign Your First Tally

1. In the admin panel, you should now see:
   - Your connected video mixer
   - Available video sources
   - Your connected tally device
2. Click **"Assign"** next to your tally device
3. Select a video source from the dropdown
4. Your tally device should now show the current state (program/preview/idle)

🎉 **Congratulations!** You now have a working tally light system!

## 📱 **Adding Hardware Devices**

Once you have the basic system working, you can add dedicated hardware devices:

### ESP32 Devices
1. Visit **http://localhost:3000/flash.html** in Chrome or Edge
2. Connect your ESP32 via USB
3. Click **"Flash Firmware"** and follow the prompts
4. Configure WiFi settings and server connection
5. The device will automatically appear in the admin panel

### M5Stick Devices
1. Follow the same flashing process as ESP32
2. Use the M5Stick-specific firmware from the flash page
3. Configure using the device's built-in display and buttons

## 🔧 **Next Steps**

Now that you have a basic system running, explore these advanced topics:

<div class="grid cards" markdown>

-   :material-cog:{ .lg .middle } **Advanced Configuration**

    ---

    Learn about custom ports, security settings, and advanced mixer configurations

    [:octicons-arrow-right-24: Installation Guide](installation.md)

-   :material-wifi:{ .lg .middle } **Network Setup**

    ---

    Optimize your network for multiple devices and reliable connections

    [:octicons-arrow-right-24: Setup Hub](setup-hub.md)

-   :material-devices:{ .lg .middle } **Device Management**

    ---

    Manage multiple devices, assignments, and monitoring

    [:octicons-arrow-right-24: Setup Devices](setup-devices.md)

-   :material-chip:{ .lg .middle } **Hardware Building**

    ---

    Build custom tally devices and understand the hardware options

    [:octicons-arrow-right-24: Hardware Guide](../hardware/supported-devices.md)

</div>

## 🆘 **Need Help?**

If you run into issues:

1. **Check the [Troubleshooting Guide](../troubleshooting.md)** for common solutions
2. **Review the console output** in the terminal window for error messages
3. **Visit our [GitHub Issues](https://github.com/tallyhubpro/Tallyhub/issues)** to report bugs
4. **Join the [Community Discussions](https://github.com/tallyhubpro/Tallyhub/discussions)** for help

## 🎯 **Common Use Cases**

### Home Studio Setup
- **1 Computer** running Tally Hub and OBS Studio
- **2-3 Smartphones** as web tallies for multi-camera setup
- **Perfect for**: YouTube creators, livestreamers, content creators

### Professional Studio
- **Dedicated Server** running Tally Hub
- **Multiple ESP32/M5Stick devices** for camera operators
- **vMix or OBS Studio** for video mixing
- **Perfect for**: Corporate videos, live events, broadcast

### Educational Environment
- **Classroom Computer** running Tally Hub
- **Student Tablets/Phones** as web tallies
- **OBS Studio** for lecture capture
- **Perfect for**: Distance learning, lecture recording, student media

---

!!! tip "Pro Tip"
    Start simple with web tallies to learn the system, then gradually add hardware devices as your needs grow. This approach lets you validate your setup and understand the workflow before investing in additional hardware.

[Continue to Installation →](installation.md){ .md-button .md-button--primary }

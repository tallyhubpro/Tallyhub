# Troubleshooting

Common issues and solutions for Tally Hub system problems.

## 🔧 **General Issues**

### Server Won't Start

#### "Port already in use" Error
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
1. Check if another Tally Hub instance is running
2. Change the port in configuration:
   ```bash
   # Set custom port
   export PORT=3001
   npm start
   ```
3. Kill any process using port 3000:
   ```bash
   # Find process using port
   lsof -i :3000
   
   # Kill the process (replace PID)
   kill -9 <PID>
   ```

#### "Node.js not found" Error

**Solution:**
1. Install Node.js 16 or later from [nodejs.org](https://nodejs.org)
2. Verify installation:
   ```bash
   node --version
   npm --version
   ```
3. Restart your terminal/command prompt

#### Permission Denied (macOS/Linux)

**Solution:**
1. Make startup script executable:
   ```bash
   chmod +x "Start Tally Hub.command"
   ```
2. Allow execution in System Preferences (macOS)
3. Run with sudo if necessary (not recommended)

### Admin Panel Not Loading

#### Cannot Connect to http://localhost:3000

**Check these items:**

1. **Server Status**: Ensure server is running and shows "✅ Tally Hub ready"
2. **Firewall**: Allow Node.js through firewall
3. **Network**: Try `http://127.0.0.1:3000` instead
4. **Browser**: Clear cache and cookies, try incognito mode

#### Blank Admin Panel

**Solution:**
1. Check browser console for JavaScript errors (F12)
2. Disable browser extensions
3. Try a different browser (Chrome/Firefox/Edge)
4. Clear browser cache completely

### Connection Issues

#### Cannot Access from Other Devices

**Solution:**
1. **Find Server IP**:
   ```bash
   # Windows
   ipconfig
   
   # macOS/Linux  
   ifconfig
   ```
2. **Use Server IP**: `http://192.168.1.100:3000` (replace with your IP)
3. **Firewall Rules**: Ensure port 3000 is open
4. **Network**: Ensure all devices on same network

## 🎥 **Video Mixer Issues**

### OBS Studio Connection Problems

#### "Connection Failed" Error

**Check OBS Settings:**
1. **Tools → WebSocket Server Settings**
2. **Enable "WebSocket server"**
3. **Note the port** (usually 4455)
4. **Set password** if desired
5. **Restart OBS** after changes

**Check Tally Hub Configuration:**
1. **Host**: Use `localhost` or `127.0.0.1`
2. **Port**: Match OBS port (4455)
3. **Password**: Enter exact password from OBS
4. **Test Connection**: Use admin panel test button

#### "Authentication Failed" Error

**Solution:**
1. **Check password** in OBS WebSocket settings
2. **Leave password empty** if none set in OBS
3. **Restart both** OBS and Tally Hub
4. **Case sensitivity**: Passwords are case-sensitive

### vMix Connection Problems

#### "Cannot Connect to vMix" Error

**Check vMix Settings:**
1. **Settings → Web Controller**
2. **Enable "Web Controller"**
3. **Note the port** (usually 8088)
4. **Allow external connections** if needed

**Check Network:**
1. **Host**: Use `localhost` for same computer
2. **Port**: Match vMix port (8088)
3. **Firewall**: Ensure vMix ports are open

#### No Sources Detected

**Solution:**
1. **Add inputs** to vMix project
2. **Restart vMix** with inputs configured
3. **Refresh** Tally Hub admin panel
4. **Check vMix API** in browser: `http://localhost:8088/api`

## 📱 **Device Issues**

### ESP32/M5Stick Problems

#### Device Not Connecting

**Check Hardware:**
1. **Power**: Ensure device is powered on
2. **WiFi**: Device LED should indicate WiFi connection
3. **Network**: Device must be on same network as server

**Check Configuration:**
1. **WiFi Credentials**: Correct SSID and password
2. **Server IP**: Correct Tally Hub server address
3. **Port**: Usually 7411 for UDP communication

**Reset Device:**
1. **Hold reset button** for 10 seconds
2. **Reconfigure WiFi** using device display/buttons
3. **Check serial output** if connected to computer

#### Firmware Flashing Issues

#### Chrome/Edge Required Error

**Solution:**
1. **Use Chrome or Edge** browser only
2. **Enable Web Serial API** in browser flags
3. **Update browser** to latest version
4. **Try different USB cable** (data cable, not charging only)

#### "Device Not Found" During Flashing

**Solution:**
1. **USB Connection**: Ensure device is properly connected
2. **Driver Installation**: Install ESP32 USB drivers
3. **Device Mode**: Put device in flash mode (hold BOOT button)
4. **Cable Quality**: Try different USB cable
5. **USB Port**: Try different USB port

#### Flashing Timeout

**Solution:**
1. **Close other serial programs** (Arduino IDE, etc.)
2. **Reset device** before flashing
3. **Hold BOOT button** during flash start
4. **Lower baud rate** in flash settings

### Web Tally Issues

#### Web Tally Not Appearing in Admin Panel

**Check Network:**
1. **Same Network**: Ensure device is on same WiFi as server
2. **Server URL**: Use correct server IP address
3. **Port Access**: Port 3000 must be accessible
4. **Browser**: Try different browser or incognito mode

**Clear Browser Data:**
1. **Clear cache** and cookies
2. **Disable extensions** temporarily
3. **Refresh page** multiple times
4. **Try different device** for comparison

#### Tally States Not Updating

**Solution:**
1. **WebSocket Connection**: Check browser console for errors
2. **Assignment**: Ensure device is assigned to a source
3. **Mixer Connection**: Verify video mixer is connected
4. **Network Stability**: Check for WiFi connection issues

## 🌐 **Network Issues**

### Multiple Network Interfaces

#### Server Binding to Wrong Interface

**Solution:**
1. **Specify Interface**:
   ```bash
   # Bind to specific IP
   export HOST=192.168.1.100
   npm start
   ```
2. **Disable Unused Interfaces**: VPN, virtual adapters
3. **Network Priority**: Set WiFi/Ethernet priority in OS

### Firewall Problems

#### Connections Blocked by Firewall

**Windows:**
1. **Windows Defender Firewall**
2. **Allow an app through firewall**
3. **Add Node.js** to allowed programs
4. **Allow both private and public networks**

**macOS:**
1. **System Preferences → Security & Privacy**
2. **Firewall tab**
3. **Firewall Options**
4. **Add Node.js** to allowed programs

**Linux:**
```bash
# Ubuntu/Debian
sudo ufw allow 3000
sudo ufw allow 7411

# CentOS/RHEL
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --add-port=7411/udp --permanent
sudo firewall-cmd --reload
```

## 🔍 **Diagnostic Tools**

### Server Logs

#### Enable Debug Logging
```bash
# Set debug level
export DEBUG=tally-hub:*
npm start
```

#### Check Log Files
- **Server logs**: `logs/tally-hub-YYYY-MM-DD.log`
- **Error logs**: Look for ERROR level messages
- **Device logs**: UDP communication details

### Network Testing

#### Test Server Connectivity
```bash
# Test HTTP access
curl http://localhost:3000

# Test from another device
curl http://192.168.1.100:3000
```

#### Test UDP Communication
```bash
# Send UDP test packet
echo "test" | nc -u localhost 7411
```

### Browser Developer Tools

#### Check JavaScript Errors
1. **Open Developer Tools** (F12)
2. **Console tab**: Look for red error messages
3. **Network tab**: Check for failed requests
4. **WebSocket**: Monitor WebSocket connections

#### Common Browser Console Errors
```javascript
// WebSocket connection failed
WebSocket connection to 'ws://localhost:3000/' failed

// Mixed content error (HTTPS/HTTP)
Mixed Content: The page was loaded over HTTPS, but attempted to connect to the insecure WebSocket endpoint

// CORS error
Access to XMLHttpRequest has been blocked by CORS policy
```

## 📞 **Getting More Help**

### Community Support
- **[GitHub Issues](https://github.com/tallyhubpro/Tallyhub/issues)**: Report bugs
- **[Discussions](https://github.com/tallyhubpro/Tallyhub/discussions)**: Ask questions
- **[Discord Community](https://discord.gg/tally-hub)**: Real-time chat support

### Professional Support
- **Enterprise Support**: Available for commercial deployments
- **Custom Development**: Tailored solutions for specific needs
- **Training Services**: On-site or remote training sessions

### Bug Reports

When reporting issues, please include:

1. **System Information**:
   - Operating system and version
   - Node.js version (`node --version`)
   - Tally Hub version

2. **Error Details**:
   - Complete error messages
   - Server log excerpts
   - Browser console errors

3. **Configuration**:
   - Video mixer type and version
   - Network setup
   - Device types and count

4. **Steps to Reproduce**:
   - Detailed steps to trigger the issue
   - Expected vs. actual behavior
   - Screenshots if applicable

---

!!! tip "Quick Diagnostic"
    Most issues are network-related. Start by verifying that all devices can ping the server IP address and that firewall rules allow the required ports (3000 for HTTP, 7411 for UDP).

[Admin Panel →](admin-panel.md){ .md-button .md-button--primary }
[Getting Started →](getting-started/index.md){ .md-button }

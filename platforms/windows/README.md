# TallyHub for Windows

Professional Tally Light Management System for Windows

## 🚀 Quick Start

### Option 1: Easy Setup (Recommended)
1. Double-click `Start TallyHub.bat`
2. Follow the setup prompts
3. TallyHub will launch automatically

### Option 2: Manual Setup
1. Install [Node.js](https://nodejs.org/) (v16 or later)
2. Open Command Prompt or PowerShell in this folder
3. Run setup:
   ```cmd
   setup.bat
   ```
4. Start TallyHub:
   ```cmd
   npm start
   ```

## 🎯 Features

- **System Tray Integration**: Runs in background with Windows system tray
- **Auto-Launch**: Optional startup with Windows
- **Professional Interface**: Native Windows look and feel
- **Multi-Architecture**: Supports x64 and x86 Windows systems
- **Easy Installation**: NSIS installer with desktop shortcuts

## 📦 What's Included

- **TallyHub Desktop App**: Native Windows Electron application
- **Web Interface**: Access at http://localhost:3000
- **Admin Panel**: Advanced configuration at http://localhost:3000/admin
- **Firmware Flashing**: Built-in ESP32 firmware flashing tools
- **System Tray**: Background operation with quick controls

## 🖥️ System Requirements

- **Operating System**: Windows 10 or later (Windows 11 recommended)
- **Architecture**: x64 or x86
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Storage**: 500MB free space
- **Network**: WiFi or Ethernet for device communication
- **Node.js**: v16.0.0 or later

## 🔧 Configuration

### First Time Setup
1. Launch TallyHub
2. Configure your video mixer (OBS, ATEM, etc.)
3. Connect ESP32 tally devices
4. Assign devices to camera inputs
5. Test tally functionality

### Windows-Specific Settings
- **Auto-Launch**: Enable in Tools → Toggle Auto-Launch
- **System Tray**: Minimize to tray instead of closing
- **Notifications**: Windows 10/11 toast notifications
- **File Associations**: Optional .tallyhub file association

## 🎛️ Supported Mixers

- **OBS Studio**: WebSocket connector (scene/program/preview, recording/streaming)
- **Blackmagic ATEM**: Network connector via Atem protocol
- **vMix**: HTTP API polling for input tallies
- **NewTek TriCaster**: TCP XML tally connector
- **Roland Smart Tally**: HTTP tally polling for V‑series mixers
- **TSL UMD 3.1 / 5.0**: UDP/TCP tally listeners
- **OSC**: UDP listener for `/tally/*` messages

## 📱 Device Support

- **ESP32 Devices**: WiFi-based tally lights
- **M5Stick Series**: Compact tally displays
- **Web Tally**: Browser-based tally pages
- **Custom Hardware**: API integration support

## 🌐 Web Interfaces

### Main Interface (Port 3000)
- Device management
- Live tally status
- Basic configuration

### Admin Panel (Port 3000/admin)
- Mixer configuration
- Advanced device settings
- System monitoring
- Firmware management

### Web Tally (Port 3000/tally)
- Browser-based tally light
- Mobile-friendly interface
- Customizable display

## 🔧 Advanced Usage

### Command Line Options
```cmd
# Development mode with logging
npm run dev

# Build distributable
npm run build-win

# Build for specific architecture
npm run build-win-x64
npm run build-win-ia32

# Create portable version
npm run build-win-portable
```

### Environment Variables
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode
- `UDP_PORT`: UDP communication port (default: 7411)

### Configuration Files
- `mixer-config.json`: Mixer settings
- `device-assignments.json`: Device mappings
- `device-storage.json`: Device information

## 🛠️ Building from Source

### Prerequisites
```cmd
npm install -g electron-builder
```

### Build Process
```cmd
# Install dependencies
npm install

# Copy server files
npm run copy-server

# Build server
npm run build-server

# Create Windows installer
npm run build-win

# Create portable version
npm run build-win-portable
```

### Build Outputs
- `dist/TallyHub-Setup-1.0.0.exe`: NSIS installer
- `dist/TallyHub-Portable-1.0.0.exe`: Portable executable
- `dist/TallyHub-1.0.0-win.zip`: ZIP archive

## 🔍 Troubleshooting

### Common Issues

**App won't start**
- Check Node.js installation: `node --version`
- Verify npm installation: `npm --version`
- Run setup script: `setup.bat`

**Server connection errors**
- Check Windows Firewall settings
- Verify port 3000 is available
- Ensure mixer software is running

**Tray icon missing**
- Check Windows notification area settings
- Look for hidden icons in system tray
- Restart application

**Device connection issues**
- Verify WiFi network connectivity
- Check device IP addresses
- Ensure UDP port 7411 is open

### Log Files
- Application logs: Check console output
- Server logs: `server/logs/` directory
- Electron logs: Windows Event Viewer

### Getting Help
1. Check the [Documentation](https://tallyhubpro.github.io/docs/)
2. Review [Common Issues](https://github.com/tallyhubpro/Tallyhub/issues)
3. Create [New Issue](https://github.com/tallyhubpro/Tallyhub/issues/new)

## 🚀 Production Deployment

### Installing for Multiple Users
1. Run installer as Administrator
2. Choose "Install for all users"
3. Configure shared settings location
4. Set up Windows Service (optional)

### Windows Service Setup
```cmd
# Install as Windows Service (requires admin)
npm install -g node-windows
node service-install.js
```

### Auto-Launch Configuration
- Use installer option for all users
- Configure via Windows Startup folder
- Group Policy deployment for enterprises

## 📋 Changelog

### Version 1.0.0
- Initial Windows release
- Native Windows system tray
- NSIS installer support
- Portable executable option
- Auto-launch functionality
- Windows-specific optimizations

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Test on Windows 10/11
4. Submit pull request

## 💖 Support

If you find TallyHub useful, please:
- ⭐ Star the repository
- 🐛 Report bugs
- 💡 Suggest features
- 📖 Improve documentation

---

**TallyHub for Windows** - Professional Tally Light Management
Built with ❤️ by the TallyHub Pro team

# TallyHub Windows - Setup and Deployment Guide

## 🚀 Getting Started

### Prerequisites
1. **Node.js 16+**: Download from [nodejs.org](https://nodejs.org/)
2. **Git** (optional): For cloning the repository
3. **Windows 10/11**: Required for modern features

### Quick Setup
```cmd
# Clone or download the platforms/windows folder
cd platforms/windows

# Run automated setup
setup.bat

# Start the application
npm start
```

## 📁 Project Structure

```
platforms/windows/
├── src/                     # Application source
│   ├── main.js             # Main Electron process (Windows-optimized)
│   ├── preload.js          # Preload script with Windows features
│   └── renderer.html       # UI (adapted for Windows)
├── assets/                  # Icons and resources
│   ├── icon.ico            # Main app icon (needs creation)
│   ├── tray-icon.ico       # System tray icon (needs creation)
│   └── *.png               # PNG assets (copied from Mac)
├── scripts/                 # Build and utility scripts
│   ├── copy-server.js      # Server file copying (Windows paths)
│   └── test-server.js      # Server testing script
├── build/                   # Build configuration
│   └── installer.nsh       # NSIS installer customization
├── server/                  # TallyHub server (copied during setup)
├── package.json            # Dependencies and build config
├── setup.bat               # Windows setup script
├── Start TallyHub.bat      # Windows launcher
└── README.md               # Windows-specific documentation
```

## 🔧 Development Setup

### 1. Environment Preparation
```cmd
# Install Node.js dependencies
npm install

# Install global tools (optional)
npm install -g electron-builder
npm install -g rimraf
```

### 2. Server Setup
```cmd
# Copy server files from main project
npm run copy-server

# Build server components
cd server
npm install
npm run build
cd ..
```

### 3. Development Mode
```cmd
# Start in development mode with DevTools
npm run dev

# Or start normally
npm start
```

## 📦 Building Distributables

### Windows Installer (NSIS)
```cmd
# Build NSIS installer for both x64 and x86
npm run build-win

# Build for specific architecture
npm run build-win-x64
npm run build-win-ia32
```

**Output**: `dist/TallyHub-Setup-1.0.0.exe`

### Portable Executable
```cmd
# Create portable version (no installation required)
npm run build-win --portable
```

**Output**: `dist/TallyHub-Portable-1.0.0.exe`

### ZIP Archive
```cmd
# Create ZIP distribution
npm run build-win --target zip
```

**Output**: `dist/TallyHub-1.0.0-win.zip`

## 🎯 Windows-Specific Features

### System Tray Integration
- Native Windows system tray icon
- Context menu with server controls
- Toast notifications (Windows 10/11)
- Auto-launch at Windows startup

### Windows Optimizations
- Windows-specific process management
- Native file dialog integration
- Windows Firewall rule creation
- Registry integration for auto-launch

### Multi-Architecture Support
- x64 (64-bit) primary target
- x86 (32-bit) legacy support
- Universal installer includes both

## 🔧 Configuration

### Auto-Launch Setup
```javascript
// Programmatic control
app.setLoginItemSettings({
  openAtLogin: true,
  name: 'TallyHub',
  path: app.getPath('exe')
});
```

### Windows Service (Advanced)
```cmd
# Install as Windows Service
npm install -g node-windows
node service-install.js

# Control service
sc start TallyHub
sc stop TallyHub
sc config TallyHub start= auto
```

### Firewall Configuration
```cmd
# Allow TallyHub through Windows Firewall
netsh advfirewall firewall add rule name="TallyHub Server" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="TallyHub UDP" dir=in action=allow protocol=UDP localport=7411
```

## 🚀 Deployment Options

### 1. End User Installation
**Best for**: Individual users, small studios

- Download installer from releases
- Run `TallyHub-Setup-1.0.0.exe`
- Follow installation wizard
- Launch from Start Menu or desktop shortcut

### 2. Portable Deployment
**Best for**: Temporary setups, USB installations

- Download `TallyHub-Portable-1.0.0.exe`
- Run directly without installation
- All files contained in single executable
- Settings stored relative to executable

### 3. Enterprise Deployment
**Best for**: Large organizations, IT-managed environments

#### Group Policy Deployment
```cmd
# Deploy MSI via Group Policy
msiexec /i TallyHub-1.0.0.msi /quiet

# Configure registry settings
reg add "HKLM\SOFTWARE\TallyHub" /v AutoLaunch /t REG_DWORD /d 1
```

#### SCCM Deployment
- Create SCCM package with installer
- Deploy to device collections
- Configure detection rules
- Monitor deployment status

#### Silent Installation
```cmd
# Silent installation with options
TallyHub-Setup-1.0.0.exe /S /D=C:\Program Files\TallyHub
```

## 🔍 Testing and Validation

### Automated Testing
```cmd
# Test server functionality
npm run test-server

# Validate build
npm run pack
```

### Manual Testing Checklist
- [ ] Application launches successfully
- [ ] System tray icon appears
- [ ] Server starts and responds on port 3000
- [ ] Web interface accessible at localhost:3000
- [ ] Mixer connections work
- [ ] Device communication functional
- [ ] Auto-launch works after reboot
- [ ] Uninstall removes all components

### Performance Validation
- Memory usage under 100MB in background
- CPU usage under 5% when idle
- Network traffic only for active connections
- Clean shutdown without orphaned processes

## 🐛 Troubleshooting

### Common Build Issues

**Node.js version mismatch**
```cmd
# Check Node.js version
node --version

# Use Node Version Manager (Windows)
nvm install 16.20.0
nvm use 16.20.0
```

**Missing dependencies**
```cmd
# Clean and reinstall
rimraf node_modules package-lock.json
npm install
```

**Electron rebuild issues**
```cmd
# Force electron rebuild
npm run electron-rebuild
```

### Runtime Issues

**Server won't start**
- Check port 3000 availability
- Verify Node.js installation
- Check Windows Firewall settings
- Review server logs

**Tray icon missing**
- Check Windows notification area settings
- Verify icon files exist
- Check for process in Task Manager
- Restart Windows Explorer

**Auto-launch not working**
- Check Windows Startup settings
- Verify registry entries
- Test with Task Scheduler
- Check user permissions

## 📋 Release Checklist

### Pre-Release
- [ ] Update version in package.json
- [ ] Test on clean Windows 10/11 systems
- [ ] Verify all dependencies included
- [ ] Check code signing certificate
- [ ] Validate installer behavior
- [ ] Test auto-update mechanism

### Build Process
- [ ] Clean build environment
- [ ] Build for all architectures (x64, x86)
- [ ] Create NSIS installer
- [ ] Generate portable executable
- [ ] Create ZIP archives
- [ ] Sign all executables

### Post-Release
- [ ] Upload to release platforms
- [ ] Update documentation
- [ ] Notify user community
- [ ] Monitor for issues
- [ ] Prepare hotfix if needed

## 🔐 Security Considerations

### Code Signing
```cmd
# Sign executable (requires certificate)
signtool sign /f certificate.p12 /p password /t http://timestamp.digicert.com TallyHub.exe
```

### Permissions
- Run without administrator privileges
- Minimal Windows permissions required
- Sandbox Electron renderer process
- Validate all external inputs

### Network Security
- Server binds to localhost by default
- HTTPS optional for secure connections
- Input validation for all API endpoints
- Rate limiting for external requests

## 📚 Additional Resources

### Documentation
- [Electron Windows Guide](https://www.electronjs.org/docs/latest/tutorial/windows-store-guide)
- [Node.js Windows Support](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Windows App Deployment](https://docs.microsoft.com/en-us/windows/win32/msi/windows-installer-portal)

### Tools
- [Electron Builder](https://www.electron.build/)
- [NSIS Documentation](https://nsis.sourceforge.io/Docs/)
- [Windows SDK](https://developer.microsoft.com/en-us/windows/downloads/windows-10-sdk/)

### Community
- [TallyHub GitHub](https://github.com/tallyhubpro/Tallyhub)
- [Electron Community](https://www.electronjs.org/community)
- [Windows Development](https://docs.microsoft.com/en-us/windows/apps/)

---

This Windows version provides the same professional tally light management capabilities as the Mac version, optimized for Windows workflows and deployment scenarios.

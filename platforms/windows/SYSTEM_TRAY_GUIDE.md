# System Tray Background Running - Windows

## Overview
TallyHub for Windows runs seamlessly in the background when you close the window, with a system tray icon for easy access and control. This ensures your tally light server keeps running even when the main window is closed - perfect for Windows production environments.

## Features

### 🔄 Background Operation
- **Persistent Server**: The TallyHub server continues running when you close the window
- **System Tray Icon**: A "TH" icon appears in your Windows notification area (bottom right)
- **Seamless Experience**: Your tally lights stay connected and functional
- **Windows Integration**: Native Windows 10/11 notifications and behavior

### 🎯 System Tray Icon
The system tray icon provides quick access to TallyHub controls:

#### Click Actions
- **Single Click**: Show/hide the main window
- **Right Click**: Open context menu with server controls
- **Double Click**: Show main window and bring to front (Windows-specific)

#### Context Menu Options
- **Server Status**: Shows ● (running) or ○ (stopped) with real-time status
- **Start/Stop Server**: Control server without opening main window
- **Restart Server**: Quick restart option for troubleshooting
- **Open Web Interface**: Direct access to web UI at localhost:3000
- **Open Admin Panel**: Direct access to admin interface
- **Show/Hide Window**: Toggle main window visibility
- **Auto-Launch**: Toggle startup with Windows
- **Quit TallyHub**: Completely exit the application

### 📱 Smart Window Management
- **Hide to Tray**: Closing the window hides it to tray instead of quitting
- **Taskbar Integration**: App can be hidden from taskbar when minimized to tray
- **Restore Window**: Click tray icon or use context menu to restore
- **Focus Handling**: Restored windows automatically come to front
- **Multi-Monitor**: Remembers window position across multiple displays

### 🔔 Windows Notifications
- **Toast Notifications**: Native Windows 10/11 toast notifications
- **First-Time Notice**: Shows notification explaining tray behavior on first close
- **Status Updates**: Visual feedback for server state changes
- **Mixer Alerts**: Real-time notifications for mixer connection issues
- **Action Center**: Notifications appear in Windows Action Center

## How to Use

### Running in Background
1. Start TallyHub normally (double-click Start TallyHub.bat or desktop shortcut)
2. Close the main window (X button in title bar)
3. App continues running in system tray
4. Server keeps running, tally lights stay connected
5. Toast notification explains tray behavior (first time only)

### Accessing from Tray
1. **Show Window**: Single-click the "TH" icon in notification area
2. **Server Control**: Right-click for full context menu
3. **Quick Access**: Use menu options for web interfaces
4. **Full Exit**: Choose "Quit TallyHub" to completely stop

### System Tray Location
- **Notification Area**: Bottom right corner of Windows taskbar
- **Hidden Icons**: Click the up arrow (^) if icon is hidden
- **Taskbar Settings**: Configure icon visibility in Windows Settings

### Server Management from Tray
- **Check Status**: Menu shows ● Running or ○ Stopped
- **Start Server**: Available when stopped, starts background server
- **Stop Server**: Available when running, stops server gracefully
- **Restart**: Available when running, performs clean restart
- **Direct Links**: Quick access to web interfaces (opens in default browser)

## Windows-Specific Features

### Auto-Launch at Startup
- **Enable**: Right-click tray icon → Auto-Launch: Off → toggles to On
- **Windows Startup**: App starts automatically when Windows boots
- **Registry Entry**: Creates Windows startup entry
- **Silent Start**: Launches to tray without showing main window
- **Group Policy**: Supports enterprise deployment via Group Policy

### Windows Integration
- **Native Notifications**: Uses Windows 10/11 notification system
- **Action Center**: Notifications stored in Windows Action Center
- **High DPI**: Supports high DPI displays and scaling
- **Dark Mode**: Respects Windows theme preferences
- **Security**: Code-signed executable for Windows Defender compatibility

### Performance Optimization
- **Minimal Resources**: Optimized for Windows background operation
- **Smart Updates**: Menu updates only when server state changes
- **Memory Efficient**: Low memory footprint when running in tray
- **CPU Throttling**: Reduces CPU usage when window is hidden

## Technical Details

### Platform Support
- **Windows 10**: Full support with modern notifications
- **Windows 11**: Enhanced integration with new notification system
- **Windows Server**: Compatible with Windows Server 2019/2022
- **Architecture**: Native support for x64 and x86 systems

### Security Features
- **Code Signing**: Signed executable for Windows Defender
- **Firewall Rules**: Automatic Windows Firewall configuration
- **UAC Compatibility**: Runs without administrator privileges
- **Safe Defaults**: Conservative security settings maintained

### Installation Options
- **NSIS Installer**: Professional Windows installer with shortcuts
- **Portable Version**: No-install executable for quick deployment
- **MSI Package**: Enterprise deployment via Windows Installer
- **Auto-Updater**: Built-in update mechanism (future releases)

## Best Practices

### Daily Usage
1. Set up auto-launch for always-available service
2. Start TallyHub with Windows boot
3. Minimize to tray when not actively configuring
4. Use web interfaces for routine operations
5. Keep app running in background during productions

### System Administration
- Enable auto-launch for production systems
- Configure Windows Firewall exceptions
- Use tray controls for quick server management
- Monitor system resources via Task Manager
- Keep main window available for detailed configuration

### Enterprise Deployment
- Deploy via Group Policy or SCCM
- Configure auto-launch for all users
- Set up shared configuration location
- Use Windows Service wrapper for critical systems
- Implement monitoring via Windows Management Instrumentation (WMI)

## Troubleshooting

### Tray Icon Issues
**Icon not visible**
- Check Windows notification area settings
- Click the up arrow (^) to show hidden icons
- Right-click taskbar → Taskbar settings → Select which icons appear

**Icon appears but doesn't respond**
- Check if process is running in Task Manager
- Look for "TallyHub" or "electron.exe" processes
- Restart application if unresponsive

### Notification Problems
**No toast notifications**
- Check Windows notification settings
- Enable notifications for TallyHub in Windows Settings
- Verify Focus Assist is not blocking notifications

**Notifications not appearing in Action Center**
- Check notification history in Windows Settings
- Verify Action Center is enabled
- Clear notification cache if needed

### Auto-Launch Issues
**App doesn't start with Windows**
- Check Windows Startup settings
- Look for TallyHub in Task Manager → Startup tab
- Re-enable auto-launch from tray menu

**Multiple instances starting**
- Single instance lock prevents duplicates
- Check for orphaned processes in Task Manager
- Restart system if persistent issues

### Performance Issues
**High CPU usage in background**
- Check server logs for errors
- Monitor device connection status
- Restart server from tray menu

**Memory usage growing over time**
- Normal for long-running sessions
- Restart application weekly for production use
- Monitor via Windows Performance Toolkit

## Advanced Configuration

### Windows Service Deployment
For critical production environments, TallyHub can run as a Windows Service:

```cmd
# Install service wrapper
npm install -g node-windows

# Create service configuration
node service-install.js

# Start service
sc start TallyHub

# Configure service startup
sc config TallyHub start= auto
```

### Group Policy Configuration
Enterprise environments can deploy TallyHub via Group Policy:

1. **Software Installation**: Deploy MSI via Group Policy
2. **Registry Settings**: Configure auto-launch for all users
3. **Firewall Rules**: Automatic Windows Firewall configuration
4. **Update Policy**: Centralized update management

### Multi-User Setup
Configure TallyHub for multiple Windows users:

1. Install for all users during setup
2. Place configuration files in shared location
3. Set appropriate file permissions
4. Configure Windows Service for shared access

## Security Considerations

### Network Security
- Server binds to localhost by default
- Configure Windows Firewall for external access
- Use VPN for remote mixer connections
- Enable HTTPS for secure web interfaces

### File System Security
- Configuration files stored in user profile
- Logs written with appropriate permissions
- No elevation required for normal operation
- Temporary files cleaned up on exit

This Windows-specific system tray implementation transforms TallyHub into a professional background service while maintaining the familiar Windows user experience.

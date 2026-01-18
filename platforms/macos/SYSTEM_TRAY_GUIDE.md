# System Tray Background Running

## Overview
Tally Hub now runs in the background when you close the window, with a system tray icon for easy access and control. This ensures your tally light server keeps running even when the main window is closed.

## Features

### 🔄 Background Operation
- **Persistent Server**: The Tally Hub server continues running when you close the window
- **System Tray Icon**: A "TH" icon appears in your system menu bar (top right on Mac)
- **Seamless Experience**: Your tally lights stay connected and functional

### 🎯 System Tray Icon
The system tray icon provides quick access to:

#### Click Actions
- **Single Click**: Show/hide the main window
- **Right Click**: Open context menu with server controls

#### Context Menu Options
- **Server Status**: Shows if server is running or stopped
- **Start/Stop Server**: Control server without opening main window
- **Restart Server**: Quick restart option
- **Open Web Interface**: Direct access to web UI
- **Open Admin Panel**: Direct access to admin interface
- **Show/Hide Window**: Toggle main window visibility
- **Quit Tally Hub**: Completely exit the application

### 📱 Smart Window Management
- **Hide to Tray**: Closing the window hides it to tray instead of quitting
- **Dock Integration**: On macOS, the app hides from the dock when minimized to tray
- **Restore Window**: Click tray icon or use context menu to restore
- **Focus Handling**: Restored windows automatically come to front

### 🔔 User Notifications
- **First-Time Notice**: Shows a notification explaining tray behavior on first close
- **Status Updates**: Visual feedback for server state changes in tray menu

## How to Use

### Running in Background
1. Start Tally Hub normally
2. Close the main window (red X button)
3. App continues running in system tray
4. Server keeps running, tally lights stay connected

### Accessing from Tray
1. **Show Window**: Click the "TH" icon in menu bar
2. **Server Control**: Right-click for context menu
3. **Quick Access**: Use menu options for web interfaces
4. **Full Exit**: Choose "Quit Tally Hub" to completely stop

### Server Management from Tray
- **Check Status**: Menu shows ● (running) or ○ (stopped)
- **Start Server**: Available when stopped
- **Stop Server**: Available when running
- **Restart**: Available when running
- **Direct Links**: Quick access to web interfaces

## Technical Details

### Platform Support
- **macOS**: Full system tray integration with native look
- **Windows/Linux**: Standard system tray functionality
- **Icon Scaling**: Vector-based icon adapts to screen density

### Performance
- **Minimal Resources**: Tray functionality uses minimal system resources
- **Efficient Updates**: Menu updates only when server state changes
- **Clean Shutdown**: Proper cleanup when app is fully quit

### Security
- **Local Only**: Tray controls only manage local server instance
- **No Remote Access**: Tray functionality doesn't expose external interfaces
- **Safe Defaults**: Conservative security settings maintained

## Benefits

### For Users
- **Always Available**: Server runs continuously without visible window
- **Quick Access**: Fast control without opening full interface
- **Reduced Clutter**: Desktop stays clean while app runs
- **Professional**: Behaves like professional background services

### For Production
- **Reliable**: No accidental server shutdowns from window closing
- **Streamlined**: Control server without full UI
- **Monitoring**: Easy status checking via tray
- **Flexibility**: Run with or without visible interface

## Troubleshooting

### Tray Icon Not Visible
- Check system tray settings in your OS
- Some systems hide tray icons - look for expand arrow
- Icon may be in "hidden" tray area

### Can't Find Running App
- Look for "TH" icon in system menu bar/tray
- Check Activity Monitor/Task Manager for "TallyHub-Mac"
- Use dock if app is running normally (macOS)

### Server Not Responding from Tray
- Use "Restart Server" option from tray menu
- If menu shows incorrect status, wait a moment for update
- Fully quit and restart app if needed

### Notification Issues
- First-time notification appears once per session
- Disable in system preferences if unwanted
- Notification explains tray behavior for new users

## Best Practices

### Daily Usage
1. Start Tally Hub at beginning of day
2. Minimize to tray when not actively configuring
3. Use web interfaces for routine operations
4. Keep app running in background during productions

### System Management
- Allow app to start at login for always-available service
- Use tray controls for quick server management
- Keep main window available for detailed configuration
- Monitor server status via tray icon

### Performance Tips
- Background running uses minimal resources
- Server performance unchanged when window hidden
- Tray updates are lightweight and efficient
- Full app quit only when completely done

This system tray implementation transforms Tally Hub into a true background service while maintaining easy access and control.

# Supported Video Mixers

Tally Hub supports multiple professional video mixers, allowing you to create comprehensive tally systems across different production setups.

## 📺 OBS Studio

**Connection**: WebSocket API
**Default Port**: 4455
**Status**: ✅ Fully Supported

### Features
- Real-time scene switching detection
- Source-level tally monitoring  
- Recording/streaming status
- Automatic reconnection
- Password protection support

### Setup
1. Enable WebSocket server in OBS: `Tools → WebSocket Server Settings`
2. Configure port (default: 4455)
3. Set optional password for security
4. Add to Tally Hub configuration

[📖 OBS Setup Guide](obs-studio.md)

---

## 🎬 vMix

**Connection**: HTTP API
**Default Port**: 8088
**Status**: ✅ Fully Supported

### Features
- Input switching monitoring
- Preview/program tally states
- Recording/streaming status
- Polling-based updates
- TCP connectivity verification

### Setup
1. Enable Web Controller in vMix: `Settings → Web Controller`
2. Configure port (default: 8088)
3. Ensure "Enable" is checked
4. Add to Tally Hub configuration

[📖 vMix Setup Guide](vmix.md)

---

## 🎛️ ATEM Mini Pro

**Connection**: TCP Protocol
**Default Port**: 9910
**Status**: ✅ Newly Added!

### Features
- Real-time input switching
- Program/preview tally states
- Recording status monitoring
- Streaming status (if supported)
- Direct hardware connection

### Setup
1. Connect ATEM Mini Pro to network via Ethernet
2. Configure IP address using ATEM Setup utility
3. Default IP: 192.168.10.240
4. Add to Tally Hub configuration

[📖 ATEM Mini Pro Setup Guide](atem-mini-pro.md)

---

## Mixer Comparison

| Feature | OBS Studio | vMix | ATEM Mini Pro |
|---------|------------|------|---------------|
| **Connection** | WebSocket | HTTP API | TCP |
| **Real-time Updates** | ✅ | ✅ | ✅ |
| **Preview Tally** | ✅ | ✅ | ✅ |
| **Program Tally** | ✅ | ✅ | ✅ |
| **Recording Status** | ✅ | ✅ | ✅ |
| **Streaming Status** | ✅ | ✅ | ⚠️ |
| **Source Assignment** | ✅ | ✅ | ✅ |
| **Auto Reconnection** | ✅ | ✅ | ✅ |
| **Password Protection** | ✅ | ❌ | ❌ |
| **Hardware Control** | ❌ | ❌ | ✅ |

## Multi-Mixer Support

Tally Hub can connect to multiple mixers simultaneously:

```json
[
  {
    "id": "obs-main",
    "name": "Main OBS Studio",
    "type": "obs",
    "host": "192.168.1.100",
    "port": 4455
  },
  {
    "id": "vmix-backup",
    "name": "Backup vMix",
    "type": "vmix", 
    "host": "192.168.1.101",
    "port": 8088
  },
  {
    "id": "atem-hardware",
    "name": "Studio ATEM",
    "type": "atem",
    "host": "192.168.1.102", 
    "port": 9910
  }
]
```

## Device Assignment

Each tally device can be assigned to monitor:
- Specific sources from any connected mixer
- Multiple sources (auto-switching mode)
- Sources from different mixer types

## Connection Icons

In the admin interface, mixers display with these icons:
- 📺 **OBS Studio**
- 🎬 **vMix** 
- 🎛️ **ATEM Mini Pro**

## Troubleshooting

### General Connection Issues
1. **Check Network**: Ensure mixer and Tally Hub are on same network
2. **Verify Ports**: Confirm correct ports are configured and accessible
3. **Firewall**: Check firewall settings allow required ports
4. **Software Running**: Ensure mixer software/hardware is active

### Mixer-Specific Issues
- **OBS**: Enable WebSocket server, check password
- **vMix**: Enable Web Controller, verify TCP API access
- **ATEM**: Power on device, check Ethernet connection, use ATEM Setup

## Future Mixer Support

We're always expanding mixer compatibility. Potential future additions:
- Roland V-Series
- NewTek TriCaster  
- Grass Valley
- Sony switchers
- Custom REST API mixers

## Request New Mixer Support

To request support for additional mixers:
1. Open an issue on our GitHub repository
2. Provide mixer model and API documentation
3. Include connection requirements and protocols
4. Share any available SDK or control libraries

---

**🎥 Professional tally systems for every production environment!**
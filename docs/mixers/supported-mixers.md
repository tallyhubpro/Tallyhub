# Supported Video Mixers

Tally Hub integrates seamlessly with popular video mixing software to provide real-time tally updates for your production workflow.

## 🎬 **Currently Supported**

<div class="grid cards" markdown>

-   ![OBS Studio](../assets/OBS_Studio_Logo.svg.png){ .logo .middle } **OBS Studio**

    ---

    **Program/Preview Tally** with real-time scene change detection
    
    **Recording Status** visual indication when recording
    
    **Streaming Status** shows live streaming state
    
    **Source Discovery** automatic detection of scene sources
    
    **WebSocket API** low-latency, reliable communication

-   ![vMix](../assets/vMix-Logo-Black.png){ .logo .middle } **vMix Professional**

    ---

    **Full Tally Matrix** support for all 1000 inputs
    
    **Preview/Program** complete preview and program tally
    
    **Recording/Streaming** production status indicators
    
    **Input Types** all vMix input types supported
    
    **TCP API** native vMix protocol communication

</div>

## ⚙️ **OBS Studio Setup**

### Requirements
- **OBS Studio**: Version 28.0+ (built-in WebSocket) or 27.x with plugin
- **WebSocket Plugin**: [obs-websocket](https://github.com/obsproject/obs-websocket) for older versions
- **Network Access**: OBS and Tally Hub on same network

### Configuration Steps

1. **Enable WebSocket in OBS**:
   ```
   Tools → WebSocket Server Settings
   ✅ Enable WebSocket server
   Port: 4444 (default)
   Password: [optional but recommended]
   ```

2. **Configure in Tally Hub**:
   ```json
   {
     "type": "obs",
     "host": "localhost",
     "port": 4444,
     "password": "your-password"
   }
   ```

3. **Verify Connection**:
   - Green status indicator in admin panel
   - Scene list appears in source assignment
   - Tally lights respond to scene changes

### Supported Features

| Feature | Status | Description |
|---------|--------|-------------|
| **Scene Switching** | ✅ Full Support | Instant tally updates on scene changes |
| **Source Preview** | ✅ Full Support | Preview assignments for studio monitor |
| **Recording State** | ✅ Full Support | Red indicator when recording active |
| **Streaming State** | ✅ Full Support | Live indicator during stream |
| **Multiple Scenes** | ✅ Full Support | Support for unlimited scenes |
| **Nested Sources** | ✅ Full Support | Groups and nested scene items |

## 📺 **vMix Setup**

### Requirements
- **vMix**: Any current version with TCP API enabled
- **Network Access**: vMix and Tally Hub on same network
- **Web Controller**: Must be enabled in vMix settings

### Configuration Steps

1. **Enable vMix Web Controller**:
   ```
   Settings → Web Controller
   ✅ Enable Web Controller
   Port: 8088 (default)
   Username: [optional]
   Password: [optional]
   ```

2. **Configure in Tally Hub**:
   ```json
   {
     "type": "vmix",
     "host": "localhost", 
     "port": 8088,
     "username": "admin",
     "password": "password"
   }
   ```

3. **Verify Connection**:
   - vMix inputs appear in source list
   - Tally responds to preview/program changes
   - Recording status reflects vMix state

### Supported Features

| Feature | Status | Description |
|---------|--------|-------------|
| **Input Switching** | ✅ Full Support | All 1000 vMix inputs supported |
| **Preview Tally** | ✅ Full Support | Preview assignments and switching |
| **Program Tally** | ✅ Full Support | Live program output detection |
| **Recording** | ✅ Full Support | Recording state detection |
| **Streaming** | ✅ Full Support | Live streaming indicators |
| **MultiView** | ✅ Full Support | MultiView source assignments |

## 🔄 **Coming Soon**

<div class="grid cards" markdown>

-   ![ATEM](../assets/Atem.svg.png){ .logo .middle } **ATEM Switchers**

    ---

    **Blackmagic ATEM Support** - *In Development*
    
    Direct Ethernet protocol integration
    
    All ATEM switcher models
    
    Preview/Program tally matrix
    
    Upstream/Downstream keyer support
    
    **Expected Release**: Version 1.1.0

-   ![TriCaster](../assets/TriCaster-Logo-Dark-L-scaled.png.webp){ .logo .middle } **Tricaster**

    ---

    **NewTek Tricaster Support** - *Planned*
    
    LiveSet API integration
    
    Multi-output tally support
    
    Virtual input compatibility
    
    DDR playback integration
    
    **Expected Release**: Version 1.2.0

</div>

## 🔌 **Custom Integrations**

### REST API
For mixers not directly supported, use our comprehensive REST API:

```bash
# Set tally states manually
curl -X POST http://localhost:3000/api/tally \
  -H "Content-Type: application/json" \
  -d '{"source": "Camera 1", "state": "program"}'

# Get current tally states
curl http://localhost:3000/api/tally/status
```

### WebSocket Events
Real-time integration for custom applications:

```javascript
const ws = new WebSocket('ws://localhost:3000');

// Listen for tally state changes
ws.on('message', (data) => {
  const update = JSON.parse(data);
  if (update.type === 'tally_update') {
    console.log(`${update.source}: ${update.state}`);
  }
});

// Send tally updates
ws.send(JSON.stringify({
  type: 'set_tally',
  source: 'Camera 1',
  state: 'program'
}));
```

### Plugin Development
Create custom mixer integrations:

```typescript
import { MixerPlugin } from '@tally-hub/plugins';

export class CustomMixerPlugin extends MixerPlugin {
  async connect(config: MixerConfig): Promise<void> {
    // Implement connection logic
  }

  async getTallySources(): Promise<TallySource[]> {
    // Return available sources
  }

  onTallyChange(callback: (update: TallyUpdate) => void): void {
    // Handle tally state changes
  }
}
```

## ⚙️ **Configuration Reference**

### OBS Studio Configuration
```yaml
mixer:
  type: obs
  host: localhost          # OBS Studio IP address
  port: 4444              # WebSocket port (default: 4444)
  password: ""            # WebSocket password (optional)
  reconnect_interval: 5   # Reconnection attempt interval (seconds)
  timeout: 10             # Connection timeout (seconds)
```

### vMix Configuration
```yaml
mixer:
  type: vmix
  host: localhost          # vMix IP address
  port: 8088              # Web Controller port (default: 8088)
  username: ""            # Web Controller username (optional)
  password: ""            # Web Controller password (optional)
  poll_interval: 100      # Status polling interval (milliseconds)
  timeout: 5              # Connection timeout (seconds)
```

### Multiple Mixers
Tally Hub can connect to multiple mixers simultaneously:

```yaml
mixers:
  - name: "Main OBS"
    type: obs
    host: 192.168.1.100
    port: 4444
    
  - name: "Backup vMix"
    type: vmix
    host: 192.168.1.101
    port: 8088
    
  - name: "Graphics OBS"
    type: obs
    host: 192.168.1.102
    port: 4445
```

## 🔧 **Troubleshooting**

### Common Connection Issues

#### OBS Studio
- **WebSocket not enabled**: Check Tools → WebSocket Server Settings
- **Port conflicts**: Try different port if 4444 is in use
- **Firewall blocking**: Allow Tally Hub through Windows Firewall
- **Wrong password**: Verify WebSocket password matches

#### vMix
- **Web Controller disabled**: Enable in Settings → Web Controller
- **Authentication required**: Check username/password requirements
- **Network unreachable**: Verify vMix and Tally Hub can communicate
- **Port conflicts**: Default port 8088 might be in use

### Performance Optimization

#### Network Settings
- **Wired connection** preferred over WiFi for mixers
- **Same subnet** for lowest latency
- **Gigabit network** for large installations
- **QoS prioritization** for real-time traffic

#### Mixer Settings
- **Reduce polling frequency** if CPU usage is high
- **Dedicated network interface** for production traffic
- **Minimize concurrent connections** to mixer APIs

---

## 🚀 **Getting Started**

1. **[Download Tally Hub](../download.md)** and install on your system
2. **Configure your video mixer** using the guides above
3. **Connect devices** using our [hardware setup guide](../hardware/index.md)
4. **Test the system** with web-based tallies first
5. **Scale up** with physical tally devices as needed

**Need help?** Check our **[troubleshooting guide](../troubleshooting.md)** or **[join the community](https://github.com/tallyhubpro/Tallyhub/discussions)** for support.

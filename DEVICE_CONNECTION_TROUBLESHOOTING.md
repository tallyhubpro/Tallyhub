# Device Connection Troubleshooting Guide

## Status
- **Server Status**: ✅ Running on port 7411 (UDP)
- **mDNS Advertising**: ✅ Active (`_tallyhub._udp`)
- **Issue**: Device at 192.168.0.196 not connecting

## Diagnostic Steps

### 1. **Verify Device Power & Network**
- Ensure the M5 device is powered on
- Check if device has connected to WiFi (look at WiFi icon on screen)
- Verify WiFi SSID and password are correct

### 2. **Check Device Hub Configuration**
The device needs to know where the TallyHub server is. There are two methods:

#### Method A: mDNS Auto-Discovery (Recommended)
- Device should automatically discover TallyHub via mDNS
- Requires device to be configured with `auto_discovery_enabled = true`
- Both device and hub must be on the same WiFi network

#### Method B: Manual Hub IP Configuration  
- Device must be configured with hub's IP address
- Access device config mode:
  - Power cycle device while holding button
  - Join `M5-Tally-Config` WiFi network
  - Open browser to `http://192.168.4.1`
  - Enter hub's IP: `192.168.0.XXX` (get from your network)
  - Set port: `7411`

### 3. **Verify Network Connectivity**
```powershell
# From Windows machine, test if device responds:
ping 192.168.0.196

# Send discovery message:
$udpClient = New-Object System.Net.Sockets.UdpClient
$udpClient.Connect('192.168.0.196', 7411)
$bytes = [System.Text.Encoding]::UTF8.GetBytes('{"type":"discover"}')
$udpClient.Send($bytes, $bytes.Length) | Out-Null
$udpClient.Close()
```

### 4. **Check Windows Firewall**
```powershell
# Allow inbound UDP on port 7411:
netsh advfirewall firewall add rule name="TallyHub UDP" dir=in action=allow protocol=UDP localport=7411

# Or disable firewall for testing (not recommended):
# netsh advfirewall set allprofiles state off
```

### 5. **Monitor Server Logs**
When device connects, you should see in logs:
```
📡 Device registration: [deviceName] (m5stick/ESP32) ([ip]:[port])
🔍 Checking 1 M5 device connections...
```

### 6. **Device Firmware Requirements**
- M5StickC Plus: Requires firmware v1.1.0+
- ESP32-1732S019: Requires compatible firmware
- Must have WiFi configured and firmware running

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Device not on WiFi | Check WiFi icon, reconfigure SSID/password |
| Device doesn't find hub | Use manual configuration method (config mode) |
| Firewall blocking | Run firewall rule command above |
| Wrong hub IP | Verify IP with `ipconfig` (look for IPv4 address) |
| Device keeps disconnecting | Check WiFi signal strength, consider router placement |

## How Device Connection Works

1. Device starts on WiFi
2. Device attempts auto-discovery via mDNS OR uses configured IP
3. Device sends UDP `register` message to hub port 7411
4. Hub receives message and registers device
5. Hub broadcasts tally updates to device

## Server Configuration
- **UDP Port**: 7411 (environment variable: `UDP_PORT`)
- **API Port**: 3000 (environment variable: `PORT`)
- **mDNS Service**: `_tallyhub._udp`

## Test the Hub is Ready
```powershell
# Verify UDP port listening:
Get-NetUDPEndpoint -LocalPort 7411

# Output should show:
# LocalAddress  LocalPort
# 0.0.0.0       7411
```

## Next Steps
1. Verify device is powered and on WiFi
2. Manually configure device with hub IP if auto-discovery fails
3. Check Windows firewall is allowing UDP/7411
4. Monitor logs for registration messages
5. Ping device to verify network connectivity

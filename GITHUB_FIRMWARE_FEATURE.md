# GitHub Firmware Download Feature

## Overview
Added server-side GitHub firmware download capability to the web-based ESP32 flasher. This allows users to download the latest firmware directly from the GitHub repository without exposing tokens or dealing with CORS issues.

## Implementation

### Server-Side Endpoint
**Endpoint:** `GET /api/flash/github-firmware`

**Query Parameters:**
- `device` (required): Device type (`ESP32-1732S019`, `M5Stick_Tally`, `M5Stick_Tally_Plus2`)
- `branch` (optional): GitHub branch name (default: `main`)

**Response:**
```json
{
  "success": true,
  "firmware": {
    "device": "ESP32-1732S019",
    "file": "firmware-merged.bin",
    "url": "https://github.com/tallyhubpro/Tallyhub/raw/main/public/firmware/ESP32-1732S019/firmware-merged.bin",
    "size": 1048576,
    "sha": "abc123...",
    "path": "public/firmware/ESP32-1732S019/firmware-merged.bin"
  }
}
```

### Client-Side Integration
Updated `public/flash.html` to include:
1. **New firmware source option**: "Download from GitHub (online)"
2. **Branch selector**: Optional field to specify GitHub branch
3. **Server proxy flow**: Fetches firmware metadata from server, then downloads binary from GitHub

### Security & Best Practices
✅ **Token management**: GitHub token stored server-side via `GITHUB_TOKEN` env var  
✅ **Rate limits**: Authenticated requests (5000/hour) vs anonymous (60/hour)  
✅ **No CORS issues**: Server acts as proxy for metadata lookup  
✅ **Private repo support**: Works with private repos when `GITHUB_TOKEN` is configured

## Configuration

### Environment Variables
```bash
# Optional: GitHub Personal Access Token for higher rate limits or private repos
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

### Supported Devices
The endpoint maps devices to their firmware paths:
- `ESP32-1732S019` → `public/firmware/ESP32-1732S019/firmware-merged.bin`
- `M5Stick_Tally` → `public/firmware/M5Stick_Tally/firmware-merged.bin`
- `M5Stick_Tally_Plus2` → `public/firmware/M5Stick_Tally_Plus2/firmware-merged.bin`

## Usage

### From Web Interface
1. Navigate to `/flash.html`
2. Select your device type
3. Choose "Download from GitHub (online)" as firmware source
4. Optionally specify a branch (defaults to `main`)
5. Click "Flash Firmware"

### From Command Line
```bash
# Test the endpoint
curl "http://localhost:3000/api/flash/github-firmware?device=ESP32-1732S019"

# Test with specific branch
curl "http://localhost:3000/api/flash/github-firmware?device=ESP32-1732S019&branch=develop"
```

## Testing
Run the test script to verify all endpoints:
```bash
chmod +x test-github-endpoint.sh
./test-github-endpoint.sh
```

## Architecture Benefits

### vs. Client-Side GitHub API
| Feature | Server Proxy ✅ | Client-Side ❌ |
|---------|----------------|----------------|
| Token Security | Server-side env var | Exposed in browser |
| Rate Limits | 5000/hour (authenticated) | 60/hour (anonymous) |
| Private Repos | Supported | Requires user token |
| CORS Issues | None | Potential issues |
| User Experience | Simple (no token input) | Complex (token required) |
| Maintainability | Centralized | Scattered client logic |

## Future Enhancements
- [ ] Cache GitHub API responses (reduce rate limit usage)
- [ ] Support GitHub Releases API (download from releases instead of branch)
- [ ] Add firmware version detection and update notifications
- [ ] CDN fallback for improved download speeds
- [ ] Support for multiple repositories/organizations

## Files Modified
- `src/index.ts` - Added `/api/flash/github-firmware` endpoint
- `public/flash.html` - Updated UI and download logic to use server proxy
- `test-github-endpoint.sh` - Test script for endpoint validation

## Related Documentation
- [GitHub Contents API](https://docs.github.com/en/rest/repos/contents)
- [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
- [ESPTool.js](https://github.com/espressif/esptool-js)

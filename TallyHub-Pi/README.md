# TallyHub-Pi (Raspberry Pi Server)

Host the Tally Hub Web Serial flasher on a Raspberry Pi and avoid CORS issues by serving a local manifest and streaming firmware binaries via same-origin endpoints.

## Features
- Serves a flasher UI at /flash.html
- /manifest endpoint fetches upstream manifest and rewrites firmware URLs to local paths
- /firmware/:device streams release assets from upstream to the browser (no CORS issues)
- Ready for systemd (run as a boot-time service)

## Requirements
- Raspberry Pi (or any Linux host)
- Node.js 18+ (for built-in fetch)

## Setup
Quick one-line install on a Raspberry Pi:

```bash
curl -fsSL https://raw.githubusercontent.com/tallyhubpro/Tallyhub/main/TallyHub-Pi/scripts/quick-install.sh | bash
```

Manual setup:
1. On your Pi, install Node 18+.
2. Copy this folder (TallyHub-Pi) to the Pi.
3. Install dependencies:

```bash
cd TallyHub-Pi
npm install
```

4. Start the server:

```bash
npm start
```

Open http://<pi-hostname-or-ip>:8080/flash.html in Chrome/Edge.

## Configuration
Environment variables:
- PORT: default 8080
- UPSTREAM_MANIFEST: defaults to the Tallyhub repo manifest
- CACHE_TTL_MS: manifest cache duration (default 60000)

## Systemd (optional)
Create a service so it runs on boot:

```bash
sudo ./scripts/install-systemd.sh
sudo systemctl daemon-reload
sudo systemctl enable tallyhub-pi
sudo systemctl start tallyhub-pi
```

Edit /etc/systemd/system/tallyhub-pi.service if you need to adjust paths or user.

## Notes
- Online firmware mode is recommended; built-in mode will look for files under server/public/firmware/ if you place them there.
- This server only proxies known device keys from the upstream manifest for safety.

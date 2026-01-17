<div align="center">

# 📺 Tally Hub

**Professional Tally Light System for Video Production**

[![GitHub Release](https://img.shields.io/github/v/release/tallyhubpro/Tallyhub?style=for-the-badge)](https://github.com/tallyhubpro/Tallyhub/releases)
[![License](https://img.shields.io/github/license/tallyhubpro/Tallyhub?style=for-the-badge)](LICENSE)

*Transform your video production with professional tally lights at a fraction of traditional costs*

**[⬇️ Releases](https://github.com/tallyhubpro/Tallyhub/releases)**

</div>

## 🚀 Quick Start

### Raspberry Pi / Linux (Recommended)

Install TallyHub with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/tallyhubpro/Tallyhub/main/install.sh | sudo bash
```

This will:
- ✅ Install Docker (if needed)
- ✅ Pull latest TallyHub image
- ✅ Create directories and volumes
- ✅ Start TallyHub with auto-restart

Then open: `http://<pi-ip>:3000/` (admin at `/admin`, tally at `/tally`, flasher at `/flash.html`)

**Update TallyHub:** Re-run the same command to pull the latest version. 

If the package is private, login first:

```bash
echo <TOKEN> | docker login ghcr.io -u <USER> --password-stdin
```

### Prerequisites
- Node.js 18+ 
- NPM or Yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/tallyhubpro/Tallyhub.git
   cd Tallyhub
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   - Navigate to `http://localhost:3000`
   - Use the admin panel to configure your mixer and devices

## 📋 Development & Scripts

Core commands:

- `npm run dev` – Start development server with ts-node + nodemon
- `npm run build` – Compile TypeScript to `dist/`
- `npm start` – Run compiled production build
- `npm run typecheck` – TypeScript strict type checking (no emit)
- `npm run lint` – Lint codebase (ESLint + TypeScript rules)
- `npm run lint:fix` – Auto-fix lint issues
- `npm run format` – Prettier formatting across the repo
- `npm run logs:prune` – Remove log files older than 14 days
- `npm test` – (Currently a placeholder – test suite forthcoming)

Editor integration: the repo includes `.editorconfig`, `.prettierrc`, and ESLint config for consistent formatting. Enable “Format on Save” in your IDE for best results.

## 🐳 Run with Docker (Raspberry Pi ready)

You can run Tally Hub in Docker on Raspberry Pi (armv7/arm64) or any Linux/x86_64 host.

### Option 1: Use the prebuilt image

Images are published to GitHub Container Registry on releases.

```bash
# Pull the latest release image
docker pull ghcr.io/tallyhubpro/tallyhub:latest

# Run with host networking (recommended on Pi so mDNS/UDP work)
sudo mkdir -p /opt/tallyhub/logs /opt/tallyhub/public/firmware
sudo touch /opt/tallyhub/device-storage.json /opt/tallyhub/device-assignments.json

docker run -d \
   --name tallyhub \
   --restart unless-stopped \
   --network host \
   -e NODE_ENV=production \
   -e TZ=UTC \
   -e GITHUB_TOKEN=ghp_your_token_here \
   -v /opt/tallyhub/device-storage.json:/app/device-storage.json \
   -v /opt/tallyhub/device-assignments.json:/app/device-assignments.json \
   -v /opt/tallyhub/logs:/app/logs \
   -v /opt/tallyhub/public/firmware:/app/public/firmware:ro \
   ghcr.io/tallyhubpro/tallyhub:latest
```

Notes:
- `GITHUB_TOKEN` is optional - only needed for GitHub firmware downloads (higher rate limits & private repos). Remove if not needed.
- If the package is private, authenticate first: `echo <TOKEN> | docker login ghcr.io -u <USER> --password-stdin`.
- Host networking is preferred on Raspberry Pi so Bonjour/mDNS and UDP discovery work correctly. If you cannot use host networking, publish ports instead:

```bash
-p 3000:3000 -p 7411:7411/udp
```

### Option 2: Build locally with Docker Compose

```bash
cd docker
docker compose up -d --build
docker compose logs -f
```

This uses `network_mode: host` by default and mounts:
- `device-storage.json`, `device-assignments.json` (persistent state)
- `logs/` (persistent logs)
- `public/firmware` (read-only so you can drop new `.bin` files without rebuilding)

See `docker/README.md` for more details and troubleshooting.

## 🎯 What is Tally Hub?

Tally Hub is a professional tally light system that works with OBS Studio, vMix, and other video mixers. It provides:

- **💰 Cost Effective**: $15-30 per device vs $200-500+ for commercial systems
- **🚀 Professional Grade**: Sub-100ms latency with enterprise-level reliability  
- **🎨 Modern Interface**: Beautiful web-based admin panel with real-time monitoring
- **🔌 Universal Compatibility**: Works with any computer and popular video software
- **📱 Device Flexibility**: ESP32, M5Stick, or any web browser as tally lights

### Recent Firmware Improvements (Sept 2025)
- Unified battery smoothing & percent logic across M5StickC Plus and Plus2.
- Always-on Wi‑Fi outline and disconnect indicator (simpler, clearer status at a glance).
- Removed legacy battery calibration/debug mode for a leaner build.
- Overlap-safe layout for battery percent and Wi‑Fi icon.

<!-- Documentation site intentionally not linked; refer to repo and releases. -->

## 🔧 Firmware Flashing

Tally Hub includes a built-in web-based firmware flasher at `/flash.html` that supports three firmware sources:

### Firmware Sources

1. **Built-in Firmware** (Recommended)
   - Latest stable firmware bundled with Tally Hub
   - Located at `public/firmware/<device>/firmware-merged.bin`
   - No internet connection required

2. **GitHub Download** (Online)
   - Downloads latest firmware directly from GitHub repository
   - Always up-to-date with main branch
   - Optional branch selection for testing
   - Server-side proxy for security and reliability

3. **Custom .bin File**
   - Upload your own compiled firmware
   - Perfect for development and testing
   - Supports any ESP32-compatible .bin file

### Supported Devices

- **ESP32-1732S019** - 1.9" display, budget-friendly option
- **M5Stick C Plus 1.1** - 1.14" display, premium build
- **M5Stick C Plus2** - Latest hardware with improved battery

### Usage

1. Navigate to `http://<hub-ip>:3000/flash.html`
2. Select your device type
3. Choose firmware source:
   - **Built-in**: Recommended for most users
   - **GitHub**: Get the latest from `tallyhubpro/Tallyhub` repository
   - **Custom**: Upload your own .bin file
4. Connect device via USB-C
5. Click "Flash Firmware" and follow on-screen instructions

### GitHub Firmware Configuration

The server supports optional `GITHUB_TOKEN` environment variable for:
- Higher API rate limits (5000/hour vs 60/hour)
- Private repository access
- Improved reliability

```bash
# Optional: Set GitHub token
export GITHUB_TOKEN=ghp_your_token_here
```

For more details, see [GITHUB_FIRMWARE_FEATURE.md](GITHUB_FIRMWARE_FEATURE.md).

## 🏭 Production Run

Build once and run the compiled output:

```bash
npm run build
NODE_ENV=production LOG_LEVEL=info node dist/index.js
```

`LOG_LEVEL` supports: `error`, `warn`, `info` (default), `debug`.

Recommended in production:
- `NODE_ENV=production`
- Rotate or prune `logs/` (see `npm run logs:prune`)
- Keep `LOG_LEVEL=info` unless diagnosing an issue.

## 🔍 Device Discovery (UDP + mDNS)

Tally devices now locate the Hub automatically using a two‑stage strategy:

1. **UDP Broadcast Probe** – Firmware sends a small JSON packet `{ "type": "discover" }` to the subnet broadcast on UDP port `7411`. The Hub replies directly with:
   ```json
   { "type":"discover_reply", "hubIp":"<address>", "udpPort":7411, "apiPort":3000 }
   ```
   The device then persists the hub IP/port.
2. **mDNS Fallback (`_tallyhub._udp`)** – If no reply is received after several attempts, firmware performs an mDNS query for service `_tallyhub._udp.local` and adopts the first result.

Hub advertisement uses Bonjour / mDNS with TXT records:
```
Service: _tallyhub._udp.local
TXT: api=<http-port>, udp=<udp-port>, ver=<package version>
```

### Environment Control
Set `DISABLE_MDNS=1` in the Hub environment to suppress mDNS advertising (devices will still try UDP broadcast discovery).

### When to Manually Configure
You may still hard‑code or override the Hub IP if:
- Broadcast traffic is filtered (enterprise / VLAN segmentation)
- mDNS is disabled on the network
- You need to point devices across routed subnets

### Future Enhancements (Planned)
- Priority selection if multiple hubs advertise
- Optional signed discovery replies for zero‑trust environments
- Admin UI toggle to disable discovery at runtime

If discovery fails completely, the device will enter its configuration (AP) mode so you can supply credentials and a hub IP manually.

## 🤝 Contributing

We welcome contributions! Start by reading `CONTRIBUTING.md` in the repository root for:
- Branch naming & commit message style
- Code quality gates (lint, typecheck, formatting)
- Release & versioning notes

<!-- Contributing guide is in-repo. -->

## � Raspberry Pi

Raspberry Pi-specific installers and scripts have been removed from this repository. You can still run Tally Hub on a Pi by cloning the repo, installing dependencies, building, and starting the server manually.

## 🧪 CLI Launcher

The project provides a lightweight CLI wrapper when installed (locally or via GitHub):

```bash
npx tallyhub            # builds (if needed) and starts the server
NODE_ENV=production npx tallyhub
```

On a Pi (after clone):
```bash
npx tallyhub
```

### Planned CLI Flags (future)
`--port <port>`, `--log-level <level>`, `--service` (wraps systemd install) – open to contributions.


## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 💬 Community & Support

<!-- Documentation link removed intentionally -->
- **🐛 Issues**: [GitHub Issues](https://github.com/tallyhubpro/Tallyhub/issues)
- **💡 Discussions**: [GitHub Discussions](https://github.com/tallyhubpro/Tallyhub/discussions)
- **📧 Contact**: [hello@tallyhub.pro](mailto:hello@tallyhub.pro)

---

<div align="center">
<strong>Made with ❤️ for the video production community</strong>
</div>

<div align="center">

# 📺 Tally Hub

**Professional Tally Light System for Video Production**

[![GitHub Release](https://img.shields.io/github/v/release/tallyhubpro/Tallyhub?style=for-the-badge)](https://github.com/tallyhubpro/Tallyhub/releases)
[![Documentation](https://img.shields.io/badge/docs-live-brightgreen?style=for-the-badge)](https://tallyhubpro.github.io)
[![License](https://img.shields.io/github/license/tallyhubpro/Tallyhub?style=for-the-badge)](LICENSE)

*Transform your video production with professional tally lights at a fraction of traditional costs*

**[📖 Full Documentation](https://tallyhubpro.github.io)** | **[⬇️ Download](https://tallyhubpro.github.io/download/)** | **[🚀 Quick Start](https://tallyhubpro.github.io/getting-started/)**

</div>

## 🚀 Quick Start

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
   ## � Firmware Flashing

   The project now supports two firmware sources only:

   - Built-in firmware bundled under `public/firmware/<device>/firmware-merged.bin`
   - Custom `.bin` uploaded from your computer

   Online flashing via GitHub manifest has been removed to simplify the flow and avoid CORS/network issues.

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

## 📖 Documentation

For complete setup guides, hardware recommendations, troubleshooting, and more, visit our comprehensive documentation:

**[🌐 tallyhubpro.github.io](https://tallyhubpro.github.io)**

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

Full user documentation remains at the docs site: [Contributing Guide (Docs)](https://tallyhubpro.github.io/contributing/)

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

- **📖 Documentation**: [tallyhubpro.github.io](https://tallyhubpro.github.io)
- **🐛 Issues**: [GitHub Issues](https://github.com/tallyhubpro/Tallyhub/issues)
- **💡 Discussions**: [GitHub Discussions](https://github.com/tallyhubpro/Tallyhub/discussions)
- **📧 Contact**: [hello@tallyhub.pro](mailto:hello@tallyhub.pro)

---

<div align="center">
<strong>Made with ❤️ for the video production community</strong>
</div>

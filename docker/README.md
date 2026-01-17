# Tally Hub Docker (Raspberry Pi ready)

This Docker setup builds the TypeScript app and runs it on Raspberry Pi (armv7/arm64) or x86_64.

## Why host networking?
- Bonjour/mDNS and UDP discovery work best with `network_mode: host` on Linux (Raspberry Pi). Bridge networks can block or limit multicast/broadcast.

## Prerequisites

### Linux / Raspberry Pi
- Raspberry Pi OS (Bookworm or Bullseye) or any Linux distribution
- Docker and Docker Compose plugin:

```bash
sudo apt-get update
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in to pick up docker group
sudo apt-get install -y docker-compose-plugin
```

### macOS
- Docker Desktop for Mac (Intel or Apple Silicon)
- **See [MACOS_GUIDE.md](MACOS_GUIDE.md) for complete macOS instructions**
- Note: Host networking is not supported on Mac - use port mapping instead

## Build and run

### On Linux / Raspberry Pi
```bash
cd docker
# First time (or after changes)
docker compose up -d --build

# View logs
docker compose logs -f
```

### On macOS (Docker Desktop)
```bash
cd docker
# Use macOS-specific override (disables host networking)
docker compose -f docker-compose.yml -f docker-compose.mac.yml up -d --build

# View logs
docker compose logs -f
```

**For detailed macOS instructions, see [MACOS_GUIDE.md](MACOS_GUIDE.md)**

## Quick Install (Raspberry Pi / Linux)

### One-liner installation (recommended)
This single command installs Docker (if needed) and starts TallyHub:

```bash
bash -c 'set -e; command -v docker >/dev/null || (curl -fsSL https://get.docker.com | sh); sudo mkdir -p /opt/tallyhub/logs /opt/tallyhub/public/firmware; sudo touch /opt/tallyhub/device-storage.json /opt/tallyhub/device-assignments.json; sudo docker pull ghcr.io/tallyhubpro/tallyhub:latest; sudo docker rm -f tallyhub 2>/dev/null || true; sudo docker run -d --name tallyhub --restart unless-stopped --network host --privileged -v /dev:/dev -e NODE_ENV=production -e TZ=UTC -v /opt/tallyhub/device-storage.json:/app/device-storage.json -v /opt/tallyhub/device-assignments.json:/app/device-assignments.json -v /opt/tallyhub/logs:/app/logs -v /opt/tallyhub/public/firmware:/app/public/firmware:ro ghcr.io/tallyhubpro/tallyhub:latest'
```

**What it does:**
- ✅ Installs Docker if not present
- ✅ Creates `/opt/tallyhub` directory structure
- ✅ Pulls latest TallyHub image from GitHub
- ✅ Removes old container if exists (safe updates)
- ✅ Starts TallyHub with host networking (best for mDNS/UDP)
- ✅ Auto-restart on reboot

**Optional: Add GitHub token for firmware downloads**
```bash
# Stop existing container and add GitHub token (higher rate limits for firmware downloads)
sudo docker rm -f tallyhub && \
sudo docker run -d \
  --name tallyhub \
  --restart unless-stopped \
  --network host \
  --privileged \
  -v /dev:/dev \
  -e NODE_ENV=production \
  -e TZ=UTC \
  -e GITHUB_TOKEN=ghp_your_token_here \
  -v /opt/tallyhub/device-storage.json:/app/device-storage.json \
  -v /opt/tallyhub/device-assignments.json:/app/device-assignments.json \
  -v /opt/tallyhub/logs:/app/logs \
  -v /opt/tallyhub/public/firmware:/app/public/firmware:ro \
  ghcr.io/tallyhubpro/tallyhub:latest
```

If you cannot use host networking, replace `--network host` with:

```bash
-p 3000:3000 -p 7411:7411/udp
```

App URLs (on the Pi):
- http://<pi-ip>:3000/
- http://<pi-ip>:3000/admin
- http://<pi-ip>:3000/tally

## Volumes
- `device-storage.json` and `device-assignments.json` are mounted for persistence.
- `logs` is mounted for persistent logs.
- `public/firmware` is mounted read-only so you can drop new `.bin` files without rebuilding the image.

## Non-host networking (optional)
If you cannot use host networking, comment `network_mode: host` and uncomment the `ports:` section. Note that mDNS/Bonjour discovery may not function the same under bridge mode.

## Environment variables
You can set these in `docker-compose.yml`:
- `GITHUB_TOKEN=ghp_xxx` — Optional GitHub Personal Access Token for firmware downloads (enables higher rate limits and private repo access)
- `DISABLE_MDNS=1` — disables mDNS advertising if your network blocks it
- `DISABLE_UDP_DISCOVERY=1` — disables UDP broadcast discovery

### GitHub Token Setup
For GitHub firmware downloads with higher rate limits (5000/hour vs 60/hour) or private repository access:

1. Generate a token at https://github.com/settings/tokens
2. Add to `docker-compose.yml`:
   ```yaml
   environment:
     - GITHUB_TOKEN=ghp_your_token_here
   ```
3. Or pass when running:
   ```bash
   docker run -e GITHUB_TOKEN=ghp_xxx ...
   ```

## Updating
```bash
# Pull latest repo changes, then rebuild
cd docker
docker compose build --no-cache
docker compose up -d
```

## Troubleshooting
- Healthcheck failing: ensure the app is reachable at `http://127.0.0.1:3000/` inside the container.
- mDNS not visible: make sure you are using `network_mode: host` on Raspberry Pi.
- Permissions on volumes: if you see permission errors, adjust ownership on the host files (e.g., `sudo chown -R $USER:$USER logs`).
- No serial ports for flashing: ensure the container runs with `--privileged` and mounts `/dev` (`-v /dev:/dev`). Plug your ESP32 via USB; it should show as `/dev/ttyUSB0` or `/dev/ttyACM0`.

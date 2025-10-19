# Tally Hub Docker (Raspberry Pi ready)

This Docker setup builds the TypeScript app and runs it on Raspberry Pi (armv7/arm64) or x86_64.

## Why host networking?
- Bonjour/mDNS and UDP discovery work best with `network_mode: host` on Linux (Raspberry Pi). Bridge networks can block or limit multicast/broadcast.

## Prerequisites
- Raspberry Pi OS (Bookworm or Bullseye)
- Docker and Docker Compose plugin:

```bash
sudo apt-get update
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in to pick up docker group
sudo apt-get install -y docker-compose-plugin
```

## Build and run
```bash
cd docker
# First time (or after changes)
docker compose up -d --build

# View logs
docker compose logs -f
```

## Use prebuilt image (no build on Pi)
You can pull a prebuilt multi-arch image from GitHub Container Registry (GHCR):

```bash
# Log in (optional for public repos)
echo $GITHUB_TOKEN | docker login ghcr.io -u <your-username> --password-stdin

# Pull the latest image
docker pull ghcr.io/tallyhubpro/tallyhub:latest

# Run with host networking (recommended on Pi)
docker run -d \
	--name tallyhub \
	--network host \
	-e NODE_ENV=production \
	-e TZ=UTC \
	-v $(pwd)/../device-storage.json:/app/device-storage.json \
	-v $(pwd)/../device-assignments.json:/app/device-assignments.json \
	-v $(pwd)/../logs:/app/logs \
	-v $(pwd)/../public/firmware:/app/public/firmware:ro \
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

## Environment toggles
You can set these in `docker-compose.yml`:
- `DISABLE_MDNS=1` — disables mDNS advertising if your network blocks it
- `DISABLE_UDP_DISCOVERY=1` — disables UDP broadcast discovery

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

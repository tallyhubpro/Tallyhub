# Running Tally Hub on Docker Desktop for Mac

This guide covers running Tally Hub using Docker Desktop for Mac (both Intel and Apple Silicon).

## Prerequisites

1. **Install Docker Desktop for Mac**
   - Download from: https://www.docker.com/products/docker-desktop
   - Or use Homebrew: `brew install --cask docker`
   - Start Docker Desktop from Applications

2. **Verify Installation**
   ```bash
   docker --version
   docker compose version
   ```

## Important: macOS Networking Differences

⚠️ **Docker Desktop on Mac does NOT support `host` networking mode** (it's Linux-only). On Mac:
- Docker runs in a lightweight VM
- Port mapping (`-p`) is required
- mDNS/Bonjour works differently

## Quick Start (Recommended)

### Option 1: Using Docker Compose (Easiest)

1. **Navigate to the docker directory**
   ```bash
   cd "/Users/prince/Projects/Tally hub/docker"
   ```

2. **Edit docker-compose.yml for macOS**
   
   Comment out `network_mode: host` and uncomment the `ports:` section:
   ```yaml
   # network_mode: host  # ← Comment this out
   
   ports:  # ← Uncomment these
     - "3000:3000"
     - "7411:7411/udp"
   ```

3. **Build and run**
   ```bash
   docker compose up -d --build
   ```

4. **View logs**
   ```bash
   docker compose logs -f
   ```

5. **Access the app**
   - Main: http://localhost:3000
   - Admin: http://localhost:3000/admin
   - Tally: http://localhost:3000/tally
   - Flasher: http://localhost:3000/flash.html

### Option 2: Using Docker Run

```bash
# Navigate to project root
cd "/Users/prince/Projects/Tally hub"

# Create directories
mkdir -p logs public/firmware
touch device-storage.json device-assignments.json

# Build the image
docker build -f docker/Dockerfile -t tallyhub:local .

# Run the container
docker run -d \
  --name tallyhub \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 7411:7411/udp \
  -e NODE_ENV=production \
  -e TZ=America/Los_Angeles \
  -e GITHUB_TOKEN=ghp_your_token_here \
  -v "$(pwd)/device-storage.json:/app/device-storage.json" \
  -v "$(pwd)/device-assignments.json:/app/device-assignments.json" \
  -v "$(pwd)/logs:/app/logs" \
  -v "$(pwd)/public/firmware:/app/public/firmware:ro" \
  tallyhub:local
```

### Option 3: Using Prebuilt Image (GHCR)

```bash
# Pull the latest image
docker pull ghcr.io/tallyhubpro/tallyhub:latest

# If private, login first
echo YOUR_GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# Create directories in home or project
cd "/Users/prince/Projects/Tally hub"
mkdir -p logs public/firmware
touch device-storage.json device-assignments.json

# Run the container
docker run -d \
  --name tallyhub \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 7411:7411/udp \
  -e NODE_ENV=production \
  -e TZ=America/Los_Angeles \
  -e GITHUB_TOKEN=ghp_your_token_here \
  -v "$(pwd)/device-storage.json:/app/device-storage.json" \
  -v "$(pwd)/device-assignments.json:/app/device-assignments.json" \
  -v "$(pwd)/logs:/app/logs" \
  -v "$(pwd)/public/firmware:/app/public/firmware:ro" \
  ghcr.io/tallyhubpro/tallyhub:latest
```

## macOS-Specific Configuration

### 1. Update docker-compose.yml for Mac

Create a `docker-compose.mac.yml` override file:

```yaml
# docker/docker-compose.mac.yml
version: "3.9"

services:
  tallyhub:
    network_mode: bridge  # Override host mode
    ports:
      - "3000:3000"
      - "7411:7411/udp"
```

Then run with:
```bash
docker compose -f docker-compose.yml -f docker-compose.mac.yml up -d
```

### 2. Environment Variables

For GitHub firmware downloads, add your token:
```bash
# Option A: In docker-compose.yml
environment:
  - GITHUB_TOKEN=ghp_your_token_here

# Option B: Use .env file
echo "GITHUB_TOKEN=ghp_your_token_here" > .env
docker compose up -d
```

### 3. Volume Mounts

Docker Desktop for Mac has optimized volume performance. Use absolute paths:

```bash
# Good - Absolute path
-v "/Users/prince/Projects/Tally hub/logs:/app/logs"

# Also good - $(pwd) expansion
-v "$(pwd)/logs:/app/logs"

# Avoid - Relative paths can be unreliable
-v "./logs:/app/logs"
```

## Managing the Container

### Start/Stop
```bash
# Using docker compose
docker compose stop
docker compose start
docker compose restart

# Using docker directly
docker stop tallyhub
docker start tallyhub
docker restart tallyhub
```

### View Logs
```bash
# Follow logs
docker compose logs -f
# or
docker logs -f tallyhub

# Last 100 lines
docker logs --tail 100 tallyhub
```

### Access Container Shell
```bash
docker exec -it tallyhub sh
```

### Update to Latest
```bash
# With docker compose
docker compose pull
docker compose up -d

# With docker run
docker pull ghcr.io/tallyhubpro/tallyhub:latest
docker stop tallyhub
docker rm tallyhub
# Run again with updated image (see Option 3 above)
```

### Remove Everything
```bash
# Using docker compose
docker compose down -v

# Using docker directly
docker stop tallyhub
docker rm tallyhub
docker rmi tallyhub:local  # or ghcr.io/tallyhubpro/tallyhub:latest
```

## Troubleshooting

### Port Already in Use
```bash
# Find what's using port 3000
lsof -ti:3000

# Kill the process
kill -9 $(lsof -ti:3000)

# Or change the port mapping
docker run -p 3001:3000 ...
# Then access at http://localhost:3001
```

### mDNS/Bonjour Discovery Not Working

On macOS, mDNS behaves differently in Docker:

1. **Access via IP instead of hostname**
   - Find your Mac's IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`
   - Configure devices to use: `http://<your-mac-ip>:3000`

2. **For local testing**
   - Use `http://localhost:3000` from your Mac
   - Use `http://host.docker.internal:3000` from inside container

3. **For production on Mac**
   - Not recommended (use Linux/Raspberry Pi instead)
   - Or run natively with `npm run dev`

### UDP Discovery Issues

UDP broadcast has limitations in Docker on Mac:

```bash
# Check if UDP port is accessible
docker exec tallyhub nc -zu localhost 7411

# From Mac, test the mapped port
nc -zu localhost 7411
```

If devices can't discover the hub:
1. Configure devices manually with your Mac's IP
2. Or run Tally Hub natively (not in Docker)

### Volume Permission Issues

macOS should handle this automatically, but if you see errors:

```bash
# Fix permissions
chmod 644 device-storage.json device-assignments.json
chmod 755 logs public/firmware
```

### Container Won't Start

```bash
# Check logs for errors
docker logs tallyhub

# Inspect container
docker inspect tallyhub

# Check if image is corrupt
docker images
docker rmi tallyhub:local
# Rebuild
```

### Apple Silicon (M1/M2/M3) Specific

Docker Desktop handles ARM64 architecture automatically, but ensure:

```bash
# Verify platform
docker inspect tallyhub | grep Architecture
# Should show: "Architecture": "arm64"

# Force specific platform if needed
docker run --platform linux/arm64 ...
```

## Performance Tips

1. **Use Docker Desktop's Performance Settings**
   - Docker Desktop > Preferences > Resources
   - Allocate at least 2GB RAM, 2 CPUs

2. **Enable VirtioFS (File Sharing)**
   - Docker Desktop > Preferences > Experimental Features
   - Enable VirtioFS for faster volume mounts

3. **Reduce Log Volume**
   ```bash
   # Prune old logs
   docker exec tallyhub npm run logs:prune
   ```

## Development on Mac

For active development, **run natively** instead of Docker:

```bash
cd "/Users/prince/Projects/Tally hub"
npm install
npm run dev
```

Benefits:
- ✅ Faster build/restart cycles
- ✅ Native mDNS/Bonjour works perfectly
- ✅ Direct file system access
- ✅ Better debugging experience

Use Docker on Mac mainly for:
- Testing production builds
- Testing Docker deployment before pushing to Pi
- Isolating dependencies

## Recommended Workflow

### For Development
```bash
# Run natively
npm run dev
```

### For Testing Docker Deployment
```bash
# Build and test locally
cd docker
docker compose -f docker-compose.yml -f docker-compose.mac.yml up -d --build
docker compose logs -f

# When ready, push to Raspberry Pi
git push
# Then on Pi: docker compose up -d
```

### For Production on Mac (Not Recommended)
Better to use a Raspberry Pi or Linux server for production, but if needed:

```bash
# Use launchd for auto-start
# Or use Docker Desktop's "Start Docker Desktop when you log in"
docker run -d --restart unless-stopped ...
```

## Quick Reference

```bash
# Build and run
cd docker && docker compose up -d --build

# View logs
docker compose logs -f

# Stop
docker compose stop

# Start
docker compose start

# Remove
docker compose down

# Access shell
docker exec -it tallyhub sh

# Check status
docker ps
docker compose ps

# View app
open http://localhost:3000
```

## Support

- 🐛 Issues: https://github.com/tallyhubpro/Tallyhub/issues
- 💬 Discussions: https://github.com/tallyhubpro/Tallyhub/discussions
- 📧 Email: hello@tallyhub.pro

---

**Platform:** macOS (Intel & Apple Silicon)  
**Docker Desktop Version:** 4.0+  
**Tested On:** macOS Sonoma 14.x, Sequoia 15.x

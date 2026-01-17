# Docker Configuration Updates for GitHub Firmware Feature

## Changes Made

Updated all Docker-related files to support the new GitHub firmware download feature with optional `GITHUB_TOKEN` environment variable.

## Files Updated

### 1. docker/docker-compose.yml
Added `GITHUB_TOKEN` to environment variables section:
```yaml
environment:
  - NODE_ENV=production
  - TZ=UTC
  - GITHUB_TOKEN=ghp_your_token_here  # NEW - Optional
  - DISABLE_MDNS=1                     # Existing - Optional
  - DISABLE_UDP_DISCOVERY=1            # Existing - Optional
```

### 2. docker/README.md
- Added "Environment variables" section explaining `GITHUB_TOKEN`
- Included setup instructions for generating and using GitHub tokens
- Updated prebuilt image example to include `-e GITHUB_TOKEN` flag
- Added note that token is optional

### 3. README.md (Main)
- Updated Quick Start one-liner to mention optional GitHub token
- Added example showing how to include token in docker run command
- Updated Docker section (Option 1) to include `GITHUB_TOKEN` in example
- Added note clarifying token is optional

## Usage Examples

### Docker Compose
```bash
cd docker
# Edit docker-compose.yml and add your token
docker compose up -d --build
```

### Docker Run (Prebuilt Image)
```bash
docker run -d \
  --name tallyhub \
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

### One-liner (Raspberry Pi)
```bash
# Without token (uses built-in or custom firmware only)
bash -c 'set -e; command -v docker >/dev/null || (curl -fsSL https://get.docker.com | sh); sudo mkdir -p /opt/tallyhub/logs /opt/tallyhub/public/firmware; sudo touch /opt/tallyhub/device-storage.json /opt/tallyhub/device-assignments.json; sudo docker pull ghcr.io/tallyhubpro/tallyhub:latest; sudo docker rm -f tallyhub 2>/dev/null || true; sudo docker run -d --name tallyhub --restart unless-stopped --network host -e NODE_ENV=production -e TZ=UTC -v /opt/tallyhub/device-storage.json:/app/device-storage.json -v /opt/tallyhub/device-assignments.json:/app/device-assignments.json -v /opt/tallyhub/logs:/app/logs -v /opt/tallyhub/public/firmware:/app/public/firmware:ro ghcr.io/tallyhubpro/tallyhub:latest'

# With token (enables GitHub firmware downloads)
# Add -e GITHUB_TOKEN=ghp_xxx to the docker run command
```

## Benefits

### With Token
- ✅ 5000 API requests/hour (vs 60/hour without)
- ✅ Access to private repositories
- ✅ More reliable GitHub firmware downloads
- ✅ No manual firmware file management needed

### Without Token
- ✅ Still fully functional
- ✅ Built-in firmware works perfectly
- ✅ Custom .bin uploads supported
- ⚠️ GitHub downloads limited to 60 requests/hour (usually sufficient)

## Token Setup Instructions

1. **Generate Token**
   - Go to https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select scopes: `repo` (for private repos) or `public_repo` (for public only)
   - Copy the token (starts with `ghp_`)

2. **Add to Docker**
   - **Option A**: Add to `docker-compose.yml`:
     ```yaml
     environment:
       - GITHUB_TOKEN=ghp_your_token_here
     ```
   
   - **Option B**: Pass as flag:
     ```bash
     docker run -e GITHUB_TOKEN=ghp_xxx ...
     ```
   
   - **Option C**: Use .env file (docker-compose):
     ```bash
     # Create .env file
     echo "GITHUB_TOKEN=ghp_xxx" > docker/.env
     
     # Update docker-compose.yml
     environment:
       - GITHUB_TOKEN=${GITHUB_TOKEN}
     ```

3. **Restart Container**
   ```bash
   docker restart tallyhub
   # or
   docker compose restart
   ```

## Security Notes

⚠️ **Token Security Best Practices:**
- Never commit tokens to git
- Use environment variables or secrets management
- Limit token scope to minimum required (public_repo if possible)
- Rotate tokens regularly
- Revoke unused tokens

## Testing

After updating, test the GitHub firmware endpoint:

```bash
# From inside the container
docker exec tallyhub curl -s http://localhost:3000/api/flash/github-firmware?device=ESP32-1732S019

# From host
curl -s http://localhost:3000/api/flash/github-firmware?device=ESP32-1732S019
```

Should return firmware metadata if working correctly.

## Compatibility

All Docker configurations support:
- ✅ Raspberry Pi (armv7/arm64)
- ✅ Linux x86_64
- ✅ macOS (Intel/Apple Silicon)
- ✅ Windows (WSL2)

## Migration

Existing Docker installations will continue to work without changes:
- No breaking changes
- GitHub token is **optional**
- All existing features work without token
- Simply add `-e GITHUB_TOKEN=xxx` when you want GitHub firmware downloads

---

**Updated:** 19 October 2025  
**Status:** ✅ Complete and Documented

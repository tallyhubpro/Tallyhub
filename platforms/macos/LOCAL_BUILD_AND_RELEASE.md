# Building and Releasing macOS App Locally

This guide shows how to build the macOS app locally and upload it to GitHub releases to replace broken builds.

## Prerequisites

- macOS with Xcode Command Line Tools installed
- Node.js 16+ and npm
- Write access to the GitHub repository

## Step 1: Clean Build Environment

```bash
cd platforms/macos
npm run clean
rm -rf server/ node_modules/
```

## Step 2: Setup and Build

```bash
# Install dependencies
npm install

# Copy and build server files
npm run copy-server
cd server
npm install
npm run build
cd ..

# Build the macOS app
npm run build-mac
```

This will create:
- `dist/TallyHub-1.2.0-arm64.dmg` (Apple Silicon)
- `dist/TallyHub-1.2.0.dmg` (Intel)
- `dist/TallyHub-1.2.0-arm64-mac.zip`
- `dist/TallyHub-1.2.0-mac.zip`

## Step 3: Test the Build

Before uploading, test that the DMG works:

```bash
# Mount and test the DMG
open dist/TallyHub-1.2.0-arm64.dmg  # or TallyHub-1.2.0.dmg for Intel

# Drag to Applications and test
# The app should start without "server files missing" error
```

## Step 4: Upload to GitHub Release

### Option A: Via GitHub Web Interface

1. Go to https://github.com/tallyhubpro/Tallyhub/releases
2. Find the v1.2.0 release
3. Click "Edit release"
4. Delete the broken macOS DMG files
5. Drag and drop your newly built files:
   - `TallyHub-1.2.0-arm64.dmg`
   - `TallyHub-1.2.0.dmg`
   - `TallyHub-1.2.0-arm64-mac.zip` (optional)
   - `TallyHub-1.2.0-mac.zip` (optional)
6. Click "Update release"

### Option B: Via GitHub CLI

If you have GitHub CLI installed:

```bash
# Install GitHub CLI if needed
# brew install gh

# Authenticate
gh auth login

# Delete old assets
gh release delete-asset v1.2.0 TallyHub-1.2.0-arm64.dmg --yes
gh release delete-asset v1.2.0 TallyHub-1.2.0.dmg --yes

# Upload new builds
cd dist
gh release upload v1.2.0 \
  TallyHub-1.2.0-arm64.dmg \
  TallyHub-1.2.0.dmg \
  TallyHub-1.2.0-arm64-mac.zip \
  TallyHub-1.2.0-mac.zip
```

## Step 5: Update Release Notes

Edit the release description to mention:

```markdown
## ⚠️ macOS Users

### First Time Opening (Gatekeeper):
```bash
xattr -cr /Applications/TallyHub.app
```
Then right-click → Open

See [GATEKEEPER_FIX.md](https://github.com/tallyhubpro/Tallyhub/blob/main/platforms/macos/GATEKEEPER_FIX.md) for details.

### This Release
- ✅ Fixed: Server files properly bundled (no more "server files missing" error)
- ✅ Built locally with all dependencies included
- ⚠️ Not code-signed (requires manual Gatekeeper bypass above)
```

## Verification

After uploading, verify the release:

1. Download from GitHub: https://github.com/tallyhubpro/Tallyhub/releases/latest
2. Run `xattr -cr` on the downloaded DMG
3. Install and test that the app starts correctly
4. Verify server starts without errors

## Future Releases

For future releases, the GitHub Actions workflow has been fixed, so automated builds should work correctly. However, if you need to do a quick fix release, you can always follow this process.

## Build Universal Binary (Optional)

To create a single DMG that works on both Intel and Apple Silicon:

```bash
npm run build-mac-universal
```

This creates `dist/TallyHub-1.2.0-universal.dmg` but takes longer to build.

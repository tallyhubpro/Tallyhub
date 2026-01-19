# macOS Gatekeeper "Damaged App" Fix

If you downloaded TallyHub from GitHub releases and encounter issues, here are the solutions:

## Issue 1: "TallyHub is damaged and can't be opened"

This is a macOS Gatekeeper security feature, not actual damage.

### Quick Fix (Recommended)

Open Terminal and run this command to remove the quarantine flag:

```bash
xattr -cr /Applications/TallyHub.app
```

Or if the app is still in your Downloads folder:

```bash
xattr -cr ~/Downloads/TallyHub.app
```

Then try opening the app again. You may still need to right-click and select "Open" the first time.

## Issue 2: "Server files are missing" Error

If you get an error about missing server files after opening the app, this means the GitHub release was built without the server files properly bundled.

### Solutions:

**Option A: Wait for Fixed Release**
- The GitHub Actions workflow has been updated to properly bundle server files
- Download a release version v1.2.1 or later (once published)

**Option B: Build Locally (Recommended)**

Build the app yourself to ensure all files are included:

```bash
cd platforms/macos
./scripts/setup.sh
npm run build-mac
```

The built app will be in `dist/TallyHub-1.2.0-arm64.dmg` (or `TallyHub-1.2.0.dmg` for Intel)

**Option C: Manual Fix for Downloaded DMG**

If you want to fix an existing downloaded version:

1. Install the app normally (after running `xattr -cr`)
2. Open Terminal and run:

```bash
cd /Applications/TallyHub.app/Contents/Resources/app.asar.unpacked
# Verify server folder exists
ls -la server
```

If the server folder is empty or missing critical files, you'll need to use Option A or B above.

## Alternative: Right-Click Method

1. Don't double-click the app
2. Right-click (or Control+click) on TallyHub.app
3. Select "Open" from the menu
4. Click "Open" in the security dialog

## Why Does This Happen?

The GitHub releases are not code-signed with an Apple Developer certificate ($99/year). This means:
- macOS Gatekeeper flags them as potentially unsafe
- The quarantine flag is applied to downloaded files
- You need to explicitly allow the app to run

## Building Locally (No Gatekeeper Issues)

If you prefer to avoid this entirely, build the app yourself:

```bash
cd platforms/macos
./scripts/setup.sh
npm run build-mac
```

Locally built apps don't have quarantine flags and will open normally.

## For Developers: Creating Signed Releases

To create properly signed releases that don't trigger Gatekeeper:

1. Join the Apple Developer Program ($99/year)
2. Create a Developer ID Application certificate
3. Add signing configuration to package.json:

```json
"mac": {
  "identity": "Developer ID Application: Your Name (TEAM_ID)",
  "hardenedRuntime": true,
  "gatekeeperAssess": true,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist"
}
```

4. Notarize the app with Apple after building

Note: Code signing and notarization require an active Apple Developer membership.

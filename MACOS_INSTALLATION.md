# macOS Installation Guide

## Opening TallyHub on macOS

Since TallyHub is not notarized with Apple (requires expensive Apple Developer Program membership), macOS Gatekeeper may block it from opening with a message like:

> "TallyHub" is damaged and can't be opened. You should move it to the Bin.

This is a standard macOS security measure for unsigned apps. **TallyHub is safe to use** - you just need to bypass Gatekeeper.

## Solution: Remove Quarantine Attribute

After downloading TallyHub, open **Terminal** and run:

```bash
xattr -cr /Applications/TallyHub.app
```

Or if you haven't moved it to Applications yet:

```bash
xattr -cr ~/Downloads/TallyHub.app
```

Then try opening TallyHub again - it should work!

## Alternative Method: Right-Click to Open

1. Download and mount the TallyHub DMG
2. Drag TallyHub to Applications
3. **Right-click** (or Control-click) on TallyHub.app
4. Select **Open** from the menu
5. Click **Open** in the security dialog

## Why This Happens

macOS requires apps to be "notarized" by Apple, which costs $99/year for a Developer ID certificate. As an open-source project, we don't have this certificate. The app is completely safe - you can verify the source code on GitHub.

## Need Help?

If you're still having issues, please open an issue on GitHub: https://github.com/tallyhubpro/Tallyhub/issues

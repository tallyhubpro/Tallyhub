# Changelog

## 1.1.1 - 2025-09-14
### Security & Stability
- Hardened Content-Security-Policy for Electron renderer (`renderer.html`): removed `unsafe-eval`, explicitly restricted sources.
- Added CSP meta tags to public pages (`index.html`, `admin.html`, `flash.html`).
- Added one-shot `server-ready` IPC event emitted from main process when server stdout reports successful start.
- Renderer now defers first device/mixer fetch until server-ready (eliminates early fetch error noise).

### Developer Experience
- Backoff retry logic added to lightweight public pages for early `/api/status` polling.
- Centralized server stdout handling and added explicit server-ready emission.

### Misc
- Version bumped from 1.1.0 to 1.1.1.

## 1.1.0 - 2025-09-14
- (Previous feature sync: admin messaging, read receipts, scrolling overlay, server parity.)

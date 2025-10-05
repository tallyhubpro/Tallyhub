## 2025-09-13

### Unified Battery & Wi‑Fi UI Parity
- Unified battery reading & smoothing logic across M5StickC Plus and Plus2 (asymmetric smoothing with downward lag guard).
- Removed legacy battery calibration / debug overlay and button-triggered voltage diagnostics.
- Ensured immediate initial draw of battery & Wi‑Fi indicators (prevents first-interval suppression by redraw limiter).
- Added boundary tracking to prevent Wi‑Fi icon overlapping battery percent text.

### Wi‑Fi Indicator Simplification
- Wi‑Fi outline (faint arcs) and disconnect red 'X' are now always enabled; related compile & runtime flags removed.
- Optional sprite-based Wi‑Fi arc rendering retained (WIFI_SPRITE_ICONS) for performance experimentation.

### Dependency Parity
- Standardized both environments on M5Unified 0.1.17.

### Cleanup
- Removed obsolete feature flag comments in `platformio.ini` and updated header flag documentation in `main.cpp`.
- Added documentation notes about always-on Wi‑Fi outline/X behavior.

### Fixes
- Plus2 battery & Wi‑Fi indicators not visible due to hardcoded 320px width while board definition used 240px panel width. Replaced conditional constants with dynamic `M5.Lcd.width()` for layout calculations.
- Eliminated overlapping / ghosting battery percent text during rapid tally state updates by clearing prior percent region and redrawing Wi‑Fi icon only when boundary shifts.

### Terminology
- Renamed tally state label from "LIVE" to "PROGRAM" across firmware (UI display and web config/status) for consistency with broadcast terminology. No behavioral changes.

### Notes
If you upgrade M5Unified for one environment, mirror it in the other to avoid subtle behavioral differences.

### Centered Status & Overlay Enhancements
- Reworked primary tally UI to use a single large centered status label (PROGRAM / PREVIEW / IDLE) with adaptive font sizing for improved on‑camera readability.
- Added hold-Button-A live info overlay (device metrics: Wi‑Fi RSSI, battery %, voltage, smoothing debug) replacing prior temporary info screen logic; overlay draws on demand without flicker.
- Implemented minimal redraw strategy: state change & timed throttling to preserve battery and reduce bus contention.

### Admin Messaging Feature
- Added backend → device messaging path: hub can broadcast or target short operator messages to device.
- Firmware now listens for UDP JSON packets `{ "type": "admin_message", "text": "...", "color": "#RRGGBB", "duration": ms }`.
- Messages render as a high‑priority centered overlay (beneath assignment/registration screens, above normal tally) with automatic timed dismissal (1–30s, default 8s).
- Supports optional background color (parsed to RGB565); defaults to blue.
- Simple greedy word wrapping with safety line cap to avoid overflow.

### Misc
- Ensured message overlay coexists with battery & Wi‑Fi indicators (indicators re-drawn atop overlay).
- Overlay expiration automatically triggers underlying status refresh without full screen flash.

### Usage
Send a message via hub REST POST `/api/message`:
```
{ "text": "Standby Camera 2", "color": "#ff9500", "duration": 5000, "deviceId": "tally-xxxx" }
```
Omit `deviceId` to broadcast. Duration clamped to 1–30 seconds.


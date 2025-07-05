# M5Stick Automatic Reconnection Fix

## Problem
The M5Stick Tally devices were not automatically reconnecting to the Tally Hub after losing connection, unlike the ESP32-1732S019 devices which reconnected successfully. This caused M5Stick devices to remain in a "HUB LOST" state even after the hub server was restarted.

## Root Cause
The M5Stick firmware had a critical flaw in its `checkHubConnection()` function:

```cpp
void checkHubConnection() {
  // Only check if we're connected to WiFi and were previously connected to hub
  if (!isRegisteredWithHub) return;  // <- THIS WAS THE PROBLEM
  
  // ... rest of function never executed when disconnected
}
```

This early return statement meant that once the M5Stick lost connection to the hub (`isRegisteredWithHub = false`), it would **never attempt reconnection** because the function would always exit immediately.

## Solution Applied
Updated the M5Stick firmware's `checkHubConnection()` function to match the ESP32's robust reconnection logic:

1. **Removed the early return**: The function now continues to attempt reconnection even when `!isRegisteredWithHub`

2. **Added proactive reconnection logic**: When not registered, the function actively attempts to reconnect with:
   - Rate limiting (15-second intervals between attempts)
   - Limited quick attempts (5 attempts)
   - Fallback to slow retry mode (10-second delays)
   - Automatic attempt counter reset every 5 minutes

3. **Simplified timeout handling**: When a timeout is detected, the function now simply marks the device as disconnected and lets the reconnection logic handle it

## Key Changes Made

### Before (Broken):
```cpp
void checkHubConnection() {
  if (!isRegisteredWithHub) return;  // Never reconnects!
  // ... timeout handling only
}
```

### After (Fixed):
```cpp
void checkHubConnection() {
  // Check WiFi first
  if (WiFi.status() != WL_CONNECTED) {
    // Handle WiFi loss
    return;
  }
  
  // If not registered, attempt reconnection
  if (!isRegisteredWithHub) {
    // Rate-limited reconnection attempts
    // ... robust reconnection logic
    return;
  }
  
  // If registered, check for timeout
  if (timeSinceLastResponse > HUB_TIMEOUT) {
    // Mark as disconnected to trigger reconnection
    isRegisteredWithHub = false;
  }
}
```

## Expected Results
- **Automatic reconnection**: M5Stick devices will now automatically reconnect to the hub after connection loss
- **Consistent behavior**: M5Stick and ESP32 devices now have identical reconnection behavior
- **Robust recovery**: Devices will keep trying to reconnect even after multiple failures
- **No user intervention**: Devices will recover automatically when the hub comes back online

## Testing
- Firmware compiles successfully without errors
- Only minor ArduinoJson deprecation warnings (non-breaking)
- Ready for deployment and testing with actual devices

This fix ensures that M5Stick devices behave consistently with ESP32 devices and automatically recover from hub disconnections.

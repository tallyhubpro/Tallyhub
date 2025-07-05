# Automatic Firmware Merging with PlatformIO

## Overview

Both ESP32-1732S019 and M5Stick CPlus 1.1 firmware projects now automatically generate single-file merged firmware during the PlatformIO build process.

## How It Works

### Build Process Enhancement

1. **Modified `platformio.ini`**: Added `extra_scripts = post:merge_firmware.py` to both projects
2. **Created `merge_firmware.py`**: Post-build script that runs after successful compilation
3. **Automatic Copying**: Merged firmware is automatically copied to `public/firmware/` for web-based flashing

### What Happens During Build

When you run `pio run`, the build process now:

1. ✅ Compiles the source code
2. ✅ Generates `bootloader.bin`, `partitions.bin`, and `firmware.bin`
3. ✅ **NEW**: Automatically merges these into `firmware-merged.bin`
4. ✅ **NEW**: Copies merged firmware to public directory for web flasher
5. ✅ Shows detailed build information and file sizes

### Build Output Example

```
==================================================
🔧 ESP32-1732S019 Firmware Merge Process
==================================================
📂 Build directory: /path/to/.pio/build/esp32-1732s019-tally
📂 Project directory: /path/to/firmware/ESP32-1732S019
📂 Public directory: /path/to/public/firmware/ESP32-1732S019
✅ Found: /path/to/bootloader.bin
✅ Found: /path/to/partitions.bin
✅ Found: /path/to/firmware.bin
📁 bootloader.bin: 14,032 bytes (13.7 KB)
📁 partitions.bin: 3,072 bytes (3.0 KB)
📁 firmware.bin: 936,688 bytes (914.7 KB)
🔨 Running: --chip esp32 merge_bin -o firmware-merged.bin ...
✅ Merged firmware created: 1,002,224 bytes (978.7 KB)
📋 Copied to web flasher: /path/to/public/firmware/ESP32-1732S019/firmware-merged.bin
🌐 Merged firmware available for web-based flashing!
==================================================
✨ Build Complete - Single-file firmware ready!
==================================================
```

## Build Commands

### Normal Build (generates merged firmware)
```bash
# ESP32-1732S019
cd firmware/ESP32-1732S019
pio run

# M5Stick CPlus 1.1
cd firmware/M5Stick_Tally
pio run
```

### Clean Build (recommended for releases)
```bash
# Clean and rebuild everything
pio run --target clean
pio run
```

### Upload to Device
```bash
# Upload via USB (still uses separate files for faster upload)
pio run --target upload

# Upload and monitor
pio run --target upload --target monitor
```

## File Locations

### Build Directory Files
After build, you'll find these files in `.pio/build/<env-name>/`:
- `bootloader.bin` - ESP32 bootloader
- `partitions.bin` - Partition table
- `firmware.bin` - Application firmware
- **`firmware-merged.bin`** - ⭐ Single merged file (NEW)

### Public Directory Files
Automatically copied to `public/firmware/<device>/`:
- `bootloader.bin` - For advanced/multi-file flashing
- `partitions.bin` - For advanced/multi-file flashing
- `firmware.bin` - For advanced/multi-file flashing
- **`firmware-merged.bin`** - ⭐ For single-file flashing (NEW)

## Technical Details

### ESP32-1732S019 (ESP32-S3)
```bash
esptool.py --chip esp32 merge_bin \\
  -o firmware-merged.bin \\
  --flash_mode dio --flash_freq 40m --flash_size 8MB \\
  0x0 bootloader.bin \\
  0x8000 partitions.bin \\
  0x10000 firmware.bin
```

### M5Stick CPlus 1.1 (ESP32)
```bash
esptool.py --chip esp32 merge_bin \\
  -o firmware-merged.bin \\
  --flash_mode dio --flash_freq 40m --flash_size 4MB \\
  0x1000 bootloader.bin \\
  0x8000 partitions.bin \\
  0x10000 firmware.bin
```

## Benefits

### For Developers
- ✅ **Zero Extra Steps**: Merged firmware is generated automatically
- ✅ **Build Validation**: Ensures all firmware components are present
- ✅ **Size Information**: Shows exact file sizes during build
- ✅ **Public Distribution**: Ready for web-based flashing immediately

### For Users
- ✅ **Simplified Flashing**: Single file instead of three separate files
- ✅ **Reduced Errors**: No offset calculations or missing files
- ✅ **Web-Based Flashing**: Works perfectly with the web flasher tool
- ✅ **Backwards Compatible**: Multi-file mode still available for advanced users

## Error Handling

The build script includes robust error handling:

### If esptool is not available:
- Falls back to manual binary merging
- Preserves correct memory layout and padding
- Still generates working merged firmware

### If files are missing:
- Shows clear error messages
- Lists which files are missing
- Build continues (doesn't fail the main build)

### If copying fails:
- Shows warning but doesn't stop build
- Developers can manually copy if needed

## Development Workflow

### Regular Development
```bash
# Just build and flash as normal
pio run --target upload --target monitor

# Merged firmware is generated automatically in background
```

### Release Preparation
```bash
# Clean build ensures fresh merged firmware
pio run --target clean
pio run

# Merged firmware is now ready in public/firmware/ for distribution
```

### Testing Web Flasher
```bash
# Start development server
npm run dev

# Open http://localhost:3000/flash.html
# Select "Single File" mode
# Flash the automatically generated merged firmware
```

## File Sizes (Latest Build)

| Device | Bootloader | Partitions | Firmware | **Merged Total** |
|--------|------------|------------|----------|------------------|
| ESP32-1732S019 | 13.7 KB | 3.0 KB | 914.7 KB | **978.7 KB** |
| M5Stick CPlus 1.1 | 17.2 KB | 3.0 KB | 893.7 KB | **957.7 KB** |

The merged firmware files are now automatically generated with every build, making the development and distribution process much more streamlined! 🚀

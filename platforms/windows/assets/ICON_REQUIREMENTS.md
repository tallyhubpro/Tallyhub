# Windows Icon Requirements

## Required Icon Files

To complete the Windows setup, you need to create/convert the following icon files:

### Main Application Icon
- **File**: `assets/icon.ico`
- **Sizes**: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256
- **Format**: Windows ICO format
- **Source**: Convert from existing PNG files in Mac version

### System Tray Icon
- **File**: `assets/tray-icon.ico`
- **Sizes**: 16x16, 32x32
- **Format**: Windows ICO format
- **Design**: Simple monochrome "TH" logo for visibility

## Icon Conversion Tools

### Online Converters
- **ICO Convert**: https://icoconvert.com/
- **ConvertICO**: https://convertio.co/png-ico/
- **Favicon.io**: https://favicon.io/favicon-converter/

### Command Line Tools
```bash
# Using ImageMagick
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# Using Node.js (png-to-ico)
npm install -g png-to-ico
png-to-ico icon.png > icon.ico
```

### Professional Tools
- **GIMP**: Export as ICO with multiple sizes
- **Photoshop**: Save for Web as ICO
- **Paint.NET**: ICO plugin available

## Current Status
- ✅ PNG icons copied from Mac version
- ✅ ICO icons created successfully
- ✅ Tray icons converted to Windows format
- ✅ Multi-size ICO files generated

## Created Files
- ✅ `assets/icon.ico` - Main application icon (multiple sizes)
- ✅ `assets/tray-icon.ico` - Combined tray icon (16x16, 32x32)
- ✅ `assets/tray-icon-16.ico` - 16x16 tray icon
- ✅ `assets/tray-icon-32.ico` - 32x32 tray icon

## Next Steps
1. ✅ Convert `assets/icon.png` to `assets/icon.ico`
2. ✅ Create `assets/tray-icon.ico` for system tray
3. 🔄 Test icon visibility in Windows
4. 🔄 Update build process to include icons

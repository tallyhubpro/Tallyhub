#!/bin/bash

# Script to create ICNS icon from SVG
# This script converts the TallyHub SVG icon to ICNS format for macOS app builds

SVG_FILE="../assets/tally-hub-icon-128.svg"
ICONSET_DIR="../assets/icon.iconset"
ICNS_FILE="../assets/icon.icns"

echo "🎨 Creating macOS ICNS icon from SVG..."

# Create iconset directory
mkdir -p "$ICONSET_DIR"

# Define icon sizes needed for macOS
sizes=(16 32 64 128 256 512 1024)

# Check if we have qlmanage (QuickLook) for SVG conversion
if command -v qlmanage &> /dev/null; then
    echo "📦 Using qlmanage for SVG conversion..."
    
    for size in "${sizes[@]}"; do
        echo "   Converting ${size}x${size}..."
        
        # Create regular resolution
        qlmanage -t -s $size -o "$ICONSET_DIR" "$SVG_FILE" 2>/dev/null
        mv "$ICONSET_DIR/$(basename "$SVG_FILE").png" "$ICONSET_DIR/icon_${size}x${size}.png" 2>/dev/null
        
        # Create @2x (retina) resolution for smaller sizes
        if [ $size -le 512 ]; then
            retina_size=$((size * 2))
            qlmanage -t -s $retina_size -o "$ICONSET_DIR" "$SVG_FILE" 2>/dev/null
            mv "$ICONSET_DIR/$(basename "$SVG_FILE").png" "$ICONSET_DIR/icon_${size}x${size}@2x.png" 2>/dev/null
        fi
    done
    
    # Create ICNS file
    if iconutil -c icns "$ICONSET_DIR" -o "$ICNS_FILE"; then
        echo "✅ ICNS icon created successfully: $ICNS_FILE"
        
        # Clean up
        rm -rf "$ICONSET_DIR"
        echo "🧹 Cleaned up temporary files"
    else
        echo "❌ Failed to create ICNS file"
        exit 1
    fi
else
    echo "⚠️  qlmanage not available. Trying alternative method..."
    
    # Fallback: try to use the existing icon.png and resize it
    if [ -f "../assets/icon.png" ]; then
        echo "📦 Using existing icon.png as fallback..."
        
        for size in "${sizes[@]}"; do
            echo "   Creating ${size}x${size}..."
            
            # Create regular resolution
            sips -z $size $size "../assets/icon.png" --out "$ICONSET_DIR/icon_${size}x${size}.png" 2>/dev/null
            
            # Create @2x (retina) resolution for smaller sizes
            if [ $size -le 512 ]; then
                retina_size=$((size * 2))
                sips -z $retina_size $retina_size "../assets/icon.png" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" 2>/dev/null
            fi
        done
        
        # Create ICNS file
        if iconutil -c icns "$ICONSET_DIR" -o "$ICNS_FILE"; then
            echo "✅ ICNS icon created successfully: $ICNS_FILE"
            
            # Clean up
            rm -rf "$ICONSET_DIR"
            echo "🧹 Cleaned up temporary files"
        else
            echo "❌ Failed to create ICNS file"
            exit 1
        fi
    else
        echo "❌ No suitable icon source found"
        exit 1
    fi
fi

# Create tray icons (16x16 and 32x32 for different displays)
echo "🔧 Creating tray icons..."
if command -v qlmanage &> /dev/null; then
    echo "   Creating 16x16 tray icon..."
    qlmanage -t -s 16 -o "../assets" "$SVG_FILE" 2>/dev/null
    mv "../assets/$(basename "$SVG_FILE").png" "../assets/tray-icon-16.png" 2>/dev/null
    
    echo "   Creating 32x32 tray icon..."
    qlmanage -t -s 32 -o "../assets" "$SVG_FILE" 2>/dev/null
    mv "../assets/$(basename "$SVG_FILE").png" "../assets/tray-icon-32.png" 2>/dev/null
    
    # Create a copy as the main tray icon
    cp "../assets/tray-icon-16.png" "../assets/tray-icon.png" 2>/dev/null
    
    echo "✅ Tray icons created successfully"
elif [ -f "../assets/icon.png" ]; then
    echo "   Using sips to create tray icons from fallback PNG..."
    sips -z 16 16 "../assets/icon.png" --out "../assets/tray-icon-16.png" 2>/dev/null
    sips -z 32 32 "../assets/icon.png" --out "../assets/tray-icon-32.png" 2>/dev/null
    cp "../assets/tray-icon-16.png" "../assets/tray-icon.png" 2>/dev/null
    echo "✅ Tray icons created from fallback PNG"
else
    echo "⚠️  Could not create tray icons"
fi

echo "🎉 Icon creation complete!"

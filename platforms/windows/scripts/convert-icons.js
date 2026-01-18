const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

async function convertIcons() {
    console.log('🎨 Converting PNG icons to ICO format for Windows...');
    
    const assetsDir = path.join(__dirname, '../assets');
    
    try {
        // Convert main application icon with multiple sizes
        console.log('📱 Converting main application icon...');
        const mainIconPath = path.join(assetsDir, 'icon.png');
        
        if (fs.existsSync(mainIconPath)) {
            // Create ICO with the single PNG (png-to-ico will handle size optimization)
            const mainIconBuf = await pngToIco(mainIconPath);
            const icoPath = path.join(assetsDir, 'icon.ico');
            fs.writeFileSync(icoPath, mainIconBuf);
            
            // Check the file size
            const stats = fs.statSync(icoPath);
            console.log(`✅ Created icon.ico (${Math.round(stats.size / 1024)}KB)`);
            
            // Verify the icon file is valid
            if (stats.size < 1000) {
                console.error('❌ Warning: Icon file seems too small, might be corrupted');
            }
        } else {
            console.error('❌ Main icon PNG not found:', mainIconPath);
        }
        
        // Convert tray icon (16x16)
        console.log('🔧 Converting tray icon 16x16...');
        const trayIcon16Path = path.join(assetsDir, 'tray-icon-16.png');
        
        if (fs.existsSync(trayIcon16Path)) {
            const trayIcon16Buf = await pngToIco(trayIcon16Path);
            const ico16Path = path.join(assetsDir, 'tray-icon-16.ico');
            fs.writeFileSync(ico16Path, trayIcon16Buf);
            
            const stats16 = fs.statSync(ico16Path);
            console.log(`✅ Created tray-icon-16.ico (${Math.round(stats16.size / 1024)}KB)`);
        } else {
            console.error('❌ Tray icon 16x16 PNG not found:', trayIcon16Path);
        }
        
        // Convert tray icon (32x32)
        console.log('🔧 Converting tray icon 32x32...');
        const trayIcon32Path = path.join(assetsDir, 'tray-icon-32.png');
        
        if (fs.existsSync(trayIcon32Path)) {
            const trayIcon32Buf = await pngToIco(trayIcon32Path);
            const ico32Path = path.join(assetsDir, 'tray-icon-32.ico');
            fs.writeFileSync(ico32Path, trayIcon32Buf);
            
            const stats32 = fs.statSync(ico32Path);
            console.log(`✅ Created tray-icon-32.ico (${Math.round(stats32.size / 1024)}KB)`);
        } else {
            console.error('❌ Tray icon 32x32 PNG not found:', trayIcon32Path);
        }
        
        // Create a combined tray icon with multiple sizes
        console.log('🎯 Creating combined tray icon...');
        
        if (fs.existsSync(trayIcon16Path) && fs.existsSync(trayIcon32Path)) {
            // Use both 16x16 and 32x32 for the combined icon
            const trayIconBuf = await pngToIco([
                fs.readFileSync(trayIcon16Path),
                fs.readFileSync(trayIcon32Path)
            ]);
            const combinedPath = path.join(assetsDir, 'tray-icon.ico');
            fs.writeFileSync(combinedPath, trayIconBuf);
            
            const statsCombined = fs.statSync(combinedPath);
            console.log(`✅ Created combined tray-icon.ico (${Math.round(statsCombined.size / 1024)}KB)`);
        } else {
            console.error('❌ Required tray icon PNGs not found for combined icon');
        }
        
        console.log('🎉 Icon conversion completed successfully!');
        console.log('📁 Created ICO files:');
        console.log('   - assets/icon.ico (main application)');
        console.log('   - assets/tray-icon.ico (system tray)');
        console.log('   - assets/tray-icon-16.ico (16x16 tray)');
        console.log('   - assets/tray-icon-32.ico (32x32 tray)');
        
    } catch (error) {
        console.error('❌ Error converting icons:', error.message);
        process.exit(1);
    }
}

convertIcons();

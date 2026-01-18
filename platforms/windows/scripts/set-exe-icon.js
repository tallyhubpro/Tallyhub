const rcedit = require('rcedit');
const path = require('path');
const fs = require('fs');

async function setExecutableIcon() {
    console.log('🔧 Setting executable icon using rcedit...');
    
    const iconPath = path.join(__dirname, '../assets/icon.ico');
    const executables = [
        path.join(__dirname, '../dist/win-unpacked/TallyHub.exe'),
        path.join(__dirname, '../dist/win-ia32-unpacked/TallyHub.exe')
    ];
    
    for (const exePath of executables) {
        if (fs.existsSync(exePath)) {
            console.log(`📝 Setting icon for ${path.basename(path.dirname(exePath))}...`);
            
            try {
                await rcedit(exePath, {
                    icon: iconPath
                });
                console.log(`   ✅ Icon set successfully`);
            } catch (error) {
                console.error(`   ❌ Failed to set icon:`, error.message);
            }
        } else {
            console.log(`⚠️  Executable not found: ${path.basename(path.dirname(exePath))}`);
        }
    }
    
    console.log('🎉 Icon setting completed!');
}

setExecutableIcon();

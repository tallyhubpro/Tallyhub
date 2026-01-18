const fs = require('fs');
const path = require('path');

function validateIcoFiles() {
    console.log('🔍 Validating ICO files for Windows...');
    
    const assetsDir = path.join(__dirname, '../assets');
    const requiredFiles = [
        'icon.ico',
        'tray-icon.ico',
        'tray-icon-16.ico',
        'tray-icon-32.ico'
    ];
    
    let allValid = true;
    
    requiredFiles.forEach(file => {
        const filePath = path.join(assetsDir, file);
        
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const fileSize = Math.round(stats.size / 1024 * 100) / 100; // KB with 2 decimals
            
            // Read first few bytes to check ICO header
            const buffer = fs.readFileSync(filePath, { start: 0, end: 5 });
            const isValidIco = buffer[0] === 0x00 && buffer[1] === 0x00 && 
                              (buffer[2] === 0x01 || buffer[2] === 0x02) && buffer[3] === 0x00;
            
            if (isValidIco) {
                console.log(`✅ ${file} - ${fileSize} KB - Valid ICO format`);
            } else {
                console.log(`❌ ${file} - ${fileSize} KB - Invalid ICO format`);
                allValid = false;
            }
        } else {
            console.log(`❌ ${file} - Missing file`);
            allValid = false;
        }
    });
    
    if (allValid) {
        console.log('🎉 All ICO files are valid and ready for Windows!');
        console.log('💡 The Windows app can now use these icons for:');
        console.log('   - Main application icon (taskbar, Alt+Tab)');
        console.log('   - System tray icon (notification area)');
        console.log('   - Window title bar icon');
        console.log('   - Installer icon');
    } else {
        console.log('❌ Some ICO files are missing or invalid');
        console.log('💡 Run "npm run convert-icons" to regenerate them');
    }
    
    return allValid;
}

if (require.main === module) {
    const isValid = validateIcoFiles();
    process.exit(isValid ? 0 : 1);
}

module.exports = validateIcoFiles;

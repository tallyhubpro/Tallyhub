const fs = require('fs');
const path = require('path');

async function copyIconsToOutput() {
    console.log('📋 Copying UWP icon files to output directories...');
    
    const assetsDir = path.join(__dirname, '../assets');
    const distDir = path.join(__dirname, '../dist');
    
    // Get all UWP icon files
    const iconFiles = fs.readdirSync(assetsDir).filter(file => 
        file.startsWith('Square44x44Logo') && file.endsWith('.png')
    );
    
    // Copy to both unpacked directories
    const targetDirs = [
        path.join(distDir, 'win-unpacked'),
        path.join(distDir, 'win-ia32-unpacked')
    ];
    
    for (const targetDir of targetDirs) {
        if (fs.existsSync(targetDir)) {
            console.log(`📁 Copying icons to ${path.basename(targetDir)}...`);
            
            for (const iconFile of iconFiles) {
                const sourcePath = path.join(assetsDir, iconFile);
                const targetPath = path.join(targetDir, iconFile);
                
                try {
                    fs.copyFileSync(sourcePath, targetPath);
                    console.log(`   ✅ Copied ${iconFile}`);
                } catch (error) {
                    console.error(`   ❌ Failed to copy ${iconFile}:`, error.message);
                }
            }
        } else {
            console.log(`⚠️  Target directory not found: ${path.basename(targetDir)}`);
        }
    }
    
    console.log('🎉 Icon copying completed!');
}

copyIconsToOutput();

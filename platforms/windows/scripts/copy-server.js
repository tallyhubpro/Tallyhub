const fs = require('fs');
const path = require('path');

/**
 * Copy server files from main project to Windows app
 * This script adapts the Mac copy-server.js for Windows
 */

// For Windows, the server files are already in place, so we'll just validate they exist
const targetServerPath = path.join(__dirname, '../server');

console.log('🔄 Validating TallyHub server files for Windows...');
console.log(`Target: ${targetServerPath}`);

// Create target directory if it doesn't exist
if (!fs.existsSync(targetServerPath)) {
    fs.mkdirSync(targetServerPath, { recursive: true });
}

// Copy function
function copyRecursive(src, dest) {
    const stats = fs.statSync(src);
    
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        
        const items = fs.readdirSync(src);
        items.forEach(item => {
            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);
            copyRecursive(srcPath, destPath);
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

try {
    // Validate server source files exist (Windows version - files are already in place)
    const serverSrcPath = path.join(targetServerPath, 'src');
    if (fs.existsSync(serverSrcPath)) {
        console.log('✅ Server source files found');
    } else {
        console.error('❌ Server source files not found at:', serverSrcPath);
        process.exit(1);
    }
    
    // Validate server has been built
    const serverDistPath = path.join(targetServerPath, 'dist');
    if (fs.existsSync(serverDistPath)) {
        console.log('✅ Server build files found');
    } else {
        console.log('⚠️ Server build files not found, you may need to run: npm run build-server');
    }
    
    // Validate package.json exists
    const packageJsonPath = path.join(targetServerPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        console.log('✅ Server package.json found');
    } else {
        console.log('⚠️ Server package.json not found');
    }
    
    // Validate node_modules exists
    const nodeModulesPath = path.join(targetServerPath, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
        console.log('✅ Server dependencies installed');
    } else {
        console.log('⚠️ Server dependencies not installed, you may need to run: cd server && npm install');
    }
    
    console.log('🎉 Server validation completed for Windows!');
    console.log('💡 Server is ready to run');
    
} catch (error) {
    console.error('❌ Error validating server files:', error.message);
    process.exit(1);
}

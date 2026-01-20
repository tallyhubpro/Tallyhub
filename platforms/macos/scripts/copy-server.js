const fs = require('fs-extra');
const path = require('path');

async function copyServerFiles() {
  console.log('📦 Copying Tally Hub server files...');
  
  const sourceDir = path.resolve(__dirname, '../../../');
  const targetDir = path.join(__dirname, '../server');
  
  // Ensure target directory exists
  await fs.ensureDir(targetDir);
  
  try {
    // Copy essential server files
    const filesToCopy = [
      'package.json',
      'tsconfig.json',
      'src',
      'public',
      'device-assignments.json',
      'device-storage.json',
      'mixer-config.json',
      'data/device-assignments.json',
      'data/device-storage.json',
      'data/mixer-config.json'
    ];
    
    // Also copy additional files if they exist
    const optionalFiles = [
      '.env.example',
      'dist' // Include pre-built dist if available
    ];
    
    // Copy required files
    for (const file of filesToCopy) {
      const sourcePath = path.join(sourceDir, file);
      const targetPath = path.join(targetDir, path.basename(file));
      
      if (await fs.pathExists(sourcePath)) {
        // Exclude firmware files from public directory
        const filter = (src) => {
          const relative = path.relative(sourcePath, src);
          return !relative.startsWith('firmware');
        };
        
        await fs.copy(sourcePath, targetPath, { 
          overwrite: true,
          filter: file === 'public' ? filter : undefined
        });
        console.log(`✅ Copied ${file}${file === 'public' ? ' (excluding firmware)' : ''}`);
      } else {
        console.log(`⚠️  Skipped ${file} (not found)`);
      }
    }
    
    // Copy optional files
    for (const file of optionalFiles) {
      const sourcePath = path.join(sourceDir, file);
      const targetPath = path.join(targetDir, file);
      
      if (await fs.pathExists(sourcePath)) {
        await fs.copy(sourcePath, targetPath, { overwrite: true });
        console.log(`✅ Copied optional ${file}`);
      } else {
        console.log(`ℹ️  Optional file ${file} not found, skipping`);
      }
    }
    
    // Create a simplified package.json for the server
    const serverPackageJson = {
      "name": "tally-hub-server",
      "version": "1.0.1",
      "description": "Tally Hub Server for Mac App",
      "main": "dist/index.js",
      "scripts": {
        "build": "tsc",
        "start": "node dist/index.js",
        "dev": "ts-node src/index.ts"
      },
      "dependencies": {
        "express": "^5.1.0",
        "ws": "^8.18.0",
        "cors": "^2.8.5",
        "atem-connection": "^3.6.0",
        "obs-websocket-js": "^5.0.6",
        "dotenv": "^16.5.0",
        "multer": "^2.0.1",
        "bonjour": "^3.5.0"
      },
      "devDependencies": {
        "@types/node": "^24.0.3",
        "@types/express": "^5.0.3",
        "@types/cors": "^2.8.19",
        "@types/ws": "^8.18.1",
        "@types/multer": "^1.4.13",
        "@types/bonjour": "^3.5.13",
        "typescript": "^5.8.3",
        "ts-node": "^10.9.2"
      }
    };
    
    await fs.writeJson(path.join(targetDir, 'package.json'), serverPackageJson, { spaces: 2 });
    console.log('✅ Created server package.json');
    
    // Create start script
    const startScript = `#!/bin/bash
cd "$(dirname "$0")"
if [ ! -d "node_modules" ]; then
  echo "Installing server dependencies..."
  npm install
fi

if [ ! -d "dist" ]; then
  echo "Building server..."
  npm run build
fi

echo "Starting Tally Hub server..."
npm start
`;
    
    await fs.writeFile(path.join(targetDir, 'start.sh'), startScript);
    await fs.chmod(path.join(targetDir, 'start.sh'), '755');
    console.log('✅ Created start script');
    
    // Build the server for production
    console.log('🔨 Building server for production...');
    const { spawn } = require('child_process');
    
    // Install dependencies first
    await new Promise((resolve, reject) => {
      const installProcess = spawn('npm', ['install', '--omit=dev'], {
        cwd: targetDir,
        stdio: 'inherit'
      });
      
      installProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Server dependencies installed');
          resolve();
        } else {
          reject(new Error(`npm install failed with code ${code}`));
        }
      });
    });
    
    // Build the TypeScript
    await new Promise((resolve, reject) => {
      const buildProcess = spawn('npm', ['run', 'build'], {
        cwd: targetDir,
        stdio: 'inherit'
      });
      
      buildProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Server built successfully');
          resolve();
        } else {
          reject(new Error(`npm run build failed with code ${code}`));
        }
      });
    });
    
    console.log('🎉 Server files copied successfully!');
    
  } catch (error) {
    console.error('❌ Error copying server files:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  copyServerFiles();
}

module.exports = copyServerFiles;

const fs = require('fs');
const path = require('path');

function testServerSetup() {
  console.log('🔍 Testing server setup...');
  
  const serverDir = path.join(__dirname, '../server');
  const requiredFiles = [
    'package.json',
    'tsconfig.json',
    'src/index.ts',
    'public/index.html',
    'dist/index.js'
  ];
  
  const optionalFiles = [
    'device-assignments.json',
    'device-storage.json',
    'mixer-config.json',
    'node_modules'
  ];
  
  console.log(`\n📁 Server directory: ${serverDir}`);
  console.log(`📁 Exists: ${fs.existsSync(serverDir)}`);
  
  console.log('\n✅ Required files:');
  requiredFiles.forEach(file => {
    const filePath = path.join(serverDir, file);
    const exists = fs.existsSync(filePath);
    console.log(`  ${exists ? '✅' : '❌'} ${file}`);
  });
  
  console.log('\n📄 Optional files:');
  optionalFiles.forEach(file => {
    const filePath = path.join(serverDir, file);
    const exists = fs.existsSync(filePath);
    console.log(`  ${exists ? '✅' : '⚠️'} ${file}`);
  });
  
  // Check if node_modules has the required dependencies
  const nodeModulesPath = path.join(serverDir, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    console.log('\n📦 Key dependencies:');
    const keyDeps = ['express', 'ws', 'cors', 'obs-websocket-js'];
    keyDeps.forEach(dep => {
      const depPath = path.join(nodeModulesPath, dep);
      const exists = fs.existsSync(depPath);
      console.log(`  ${exists ? '✅' : '❌'} ${dep}`);
    });
  }
  
  // Check package.json content
  const packageJsonPath = path.join(serverDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    console.log('\n📋 Package.json content:');
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      console.log(`  Name: ${packageJson.name}`);
      console.log(`  Version: ${packageJson.version}`);
      console.log(`  Main: ${packageJson.main}`);
      console.log(`  Dependencies: ${Object.keys(packageJson.dependencies || {}).length}`);
    } catch (error) {
      console.log(`  ❌ Error reading package.json: ${error.message}`);
    }
  }
  
  console.log('\n🔍 Test complete!');
}

if (require.main === module) {
  testServerSetup();
}

module.exports = testServerSetup;

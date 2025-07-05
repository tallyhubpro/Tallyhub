const { spawn } = require('child_process');
const path = require('path');

/**
 * Test server functionality for Windows
 */

console.log('🧪 Testing TallyHub server for Windows...');

const serverPath = path.join(__dirname, '../server');
console.log(`Server path: ${serverPath}`);

// Test server start
const serverProcess = spawn('node', ['dist/index.js'], {
    cwd: serverPath,
    stdio: 'inherit',
    env: {
        ...process.env,
        PORT: '3001', // Use different port for testing
        NODE_ENV: 'development'
    }
});

serverProcess.on('error', (error) => {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
});

serverProcess.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
    if (code === 0) {
        console.log('✅ Server test completed successfully');
    } else {
        console.log('❌ Server test failed');
    }
});

// Cleanup on exit
process.on('SIGINT', () => {
    console.log('🛑 Stopping test server...');
    serverProcess.kill();
    process.exit(0);
});

setTimeout(() => {
    console.log('⏰ Test timeout reached, stopping server...');
    serverProcess.kill();
}, 10000); // 10 second timeout

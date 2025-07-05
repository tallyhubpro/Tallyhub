const http = require('http');

async function testVMixAPI() {
  const host = '192.168.0.197';
  const port = 8088;
  
  console.log(`Testing vMix API at ${host}:${port}`);
  
  const endpoints = [
    '/api',
    '/api/',
    '/api/?function=version',
    '/api/?function=tally',
    '/api/?function=xmlstatus',
    '/api/?function=xml',
    '/api/?function=activeinput',
    '/api/?function=previewinput'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const url = `http://${host}:${port}${endpoint}`;
      console.log(`\n🔍 Testing: ${endpoint}`);
      
      const data = await makeHttpRequest(url);
      console.log(`✅ Success (${data.length} chars): ${data.substring(0, 100)}${data.length > 100 ? '...' : ''}`);
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
  }
}

function makeHttpRequest(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.on('error', (error) => {
      reject(error);
    });
  });
}

testVMixAPI().catch(console.error);

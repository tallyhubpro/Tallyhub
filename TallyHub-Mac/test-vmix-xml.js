const http = require('http');

async function getVMixXML() {
  const host = '192.168.0.197';
  const port = 8088;
  
  try {
    const url = `http://${host}:${port}/api`;
    const data = await makeHttpRequest(url);
    
    console.log('vMix XML Structure:');
    console.log('===================');
    console.log(data);
    
    // Try to parse some basic information
    const versionMatch = data.match(/<version>([^<]*)<\/version>/);
    console.log('\nVersion:', versionMatch ? versionMatch[1] : 'Not found');
    
    const editionMatch = data.match(/<edition>([^<]*)<\/edition>/);
    console.log('Edition:', editionMatch ? editionMatch[1] : 'Not found');
    
    // Look for inputs
    const inputMatches = data.match(/<input[^>]*>/g);
    console.log('\nInputs found:', inputMatches ? inputMatches.length : 0);
    
    if (inputMatches) {
      inputMatches.slice(0, 3).forEach((input, index) => {
        console.log(`Input ${index + 1}:`, input);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
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

getVMixXML().catch(console.error);

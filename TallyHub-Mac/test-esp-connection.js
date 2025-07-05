#!/usr/bin/env node

const dgram = require('dgram');
const os = require('os');

// Get the Mac's IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  return '127.0.0.1';
}

const SERVER_HOST = getLocalIP();
const SERVER_PORT = 7411;

console.log('🔧 ESP Device Connection Test');
console.log('============================');
console.log(`📡 Testing connection to TallyHub at ${SERVER_HOST}:${SERVER_PORT}`);
console.log(`🔧 This test simulates an ESP32 device connecting to TallyHub`);
console.log(`🔧 The ESP firmware has been updated to use port 7411 (was 7412)`);

const client = dgram.createSocket('udp4');
let responseCount = 0;
let registrationSuccessful = false;

// Test 1: ESP32-1732S019 Device Registration
console.log('\n📡 Test 1: ESP32-1732S019 Device Registration');
console.log('-----------------------------------------------');

const esp32Message = {
  type: 'register',
  deviceId: 'esp32-test-001',
  deviceName: 'ESP32 Test Device',
  deviceType: 'esp32-1732s019',
  isAssigned: false,
  assignedSource: null
};

client.send(Buffer.from(JSON.stringify(esp32Message)), SERVER_PORT, SERVER_HOST, (error) => {
  if (error) {
    console.error('❌ Failed to send ESP32 registration:', error);
  } else {
    console.log('✅ ESP32 registration message sent');
    console.log('📤 Message:', JSON.stringify(esp32Message, null, 2));
  }
});

// Test 2: M5Stick Device Registration (after 2 seconds)
setTimeout(() => {
  console.log('\n📡 Test 2: M5Stick Device Registration');
  console.log('---------------------------------------');
  
  const m5stickMessage = {
    type: 'register',
    deviceId: 'm5stick-test-001',
    deviceName: 'M5Stick Test Device',
    deviceType: 'm5stick',
    isAssigned: false,
    assignedSource: null
  };

  client.send(Buffer.from(JSON.stringify(m5stickMessage)), SERVER_PORT, SERVER_HOST, (error) => {
    if (error) {
      console.error('❌ Failed to send M5Stick registration:', error);
    } else {
      console.log('✅ M5Stick registration message sent');
      console.log('📤 Message:', JSON.stringify(m5stickMessage, null, 2));
    }
  });
}, 2000);

// Test 3: Heartbeat Test (after 4 seconds)
setTimeout(() => {
  if (registrationSuccessful) {
    console.log('\n💓 Test 3: Heartbeat Test');
    console.log('-------------------------');
    
    const heartbeatMessage = {
      type: 'heartbeat',
      deviceId: 'esp32-test-001',
      timestamp: new Date().toISOString()
    };

    client.send(Buffer.from(JSON.stringify(heartbeatMessage)), SERVER_PORT, SERVER_HOST, (error) => {
      if (error) {
        console.error('❌ Failed to send heartbeat:', error);
      } else {
        console.log('✅ Heartbeat message sent');
        console.log('📤 Message:', JSON.stringify(heartbeatMessage, null, 2));
      }
    });
  }
}, 4000);

// Listen for responses
client.on('message', (msg, rinfo) => {
  responseCount++;
  try {
    const response = JSON.parse(msg.toString());
    console.log(`\n📥 Response #${responseCount} received:`);
    console.log(`📍 From: ${rinfo.address}:${rinfo.port}`);
    console.log(`📄 Data:`, JSON.stringify(response, null, 2));
    
    if (response.type === 'registered') {
      registrationSuccessful = true;
      console.log('✅ Device registration successful!');
    } else if (response.type === 'heartbeat_ack') {
      console.log('✅ Heartbeat acknowledged!');
    }
  } catch (error) {
    console.log(`📥 Raw response #${responseCount}:`, msg.toString());
  }
});

client.on('error', (error) => {
  console.error('❌ UDP client error:', error);
});

// Test summary after 7 seconds
setTimeout(() => {
  console.log('\n🏁 Test Summary');
  console.log('================');
  console.log(`📊 Total responses received: ${responseCount}`);
  console.log(`✅ Registration successful: ${registrationSuccessful ? 'YES' : 'NO'}`);
  console.log(`📡 Server IP: ${SERVER_HOST}`);
  console.log(`🔌 Server Port: ${SERVER_PORT}`);
  
  if (responseCount > 0) {
    console.log('\n🎉 SUCCESS: TallyHub is responding to ESP device messages!');
    console.log('🔧 The UDP port issue has been resolved.');
    console.log('🚀 ESP devices should now be able to connect to the compiled app.');
  } else {
    console.log('\n❌ ISSUE: No responses received from TallyHub server');
    console.log('🔧 Check if the TallyHub app is running and listening on port 7411');
  }
  
  console.log('\n📋 Next Steps:');
  console.log('1. Flash the updated firmware to your ESP devices');
  console.log('2. Configure ESP devices to connect to IP:', SERVER_HOST);
  console.log('3. Verify ESP devices use port 7411 in their configuration');
  console.log('4. Test with actual ESP hardware');
  
  client.close();
}, 7000);

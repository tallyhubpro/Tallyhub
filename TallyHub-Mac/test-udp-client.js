#!/usr/bin/env node

const dgram = require('dgram');

const client = dgram.createSocket('udp4');
const SERVER_HOST = '192.168.0.216'; // Your Mac's IP
const SERVER_PORT = 7411;

console.log(`Testing UDP connection to ${SERVER_HOST}:${SERVER_PORT}`);
console.log('This simulates an ESP device connecting to TallyHub');

// Test message simulating an ESP device registration
const testMessage = {
  type: 'register',
  deviceId: 'test-esp-001',
  deviceName: 'Test ESP Device',
  deviceType: 'esp32-1732s019',
  isAssigned: false
};

const messageBuffer = Buffer.from(JSON.stringify(testMessage));

let responseCount = 0;

client.send(messageBuffer, SERVER_PORT, SERVER_HOST, (error) => {
  if (error) {
    console.error('❌ Failed to send UDP message:', error);
  } else {
    console.log('✅ UDP registration message sent successfully');
    console.log('📤 Sent:', JSON.stringify(testMessage, null, 2));
  }
});

// Listen for response
client.on('message', (msg, rinfo) => {
  responseCount++;
  try {
    const response = JSON.parse(msg.toString());
    console.log(`📥 Received response #${responseCount}:`, JSON.stringify(response, null, 2));
    console.log(`📍 From: ${rinfo.address}:${rinfo.port}`);
  } catch (error) {
    console.log(`📥 Received raw response #${responseCount}:`, msg.toString());
  }
});

client.on('error', (error) => {
  console.error('❌ UDP client error:', error);
});

// Send heartbeat after 3 seconds
setTimeout(() => {
  console.log('\n💓 Sending heartbeat...');
  const heartbeatMessage = {
    type: 'heartbeat',
    deviceId: 'test-esp-001',
    timestamp: new Date()
  };
  
  const heartbeatBuffer = Buffer.from(JSON.stringify(heartbeatMessage));
  client.send(heartbeatBuffer, SERVER_PORT, SERVER_HOST, (error) => {
    if (error) {
      console.error('❌ Failed to send heartbeat:', error);
    } else {
      console.log('✅ Heartbeat sent successfully');
      console.log('📤 Sent:', JSON.stringify(heartbeatMessage, null, 2));
    }
  });
}, 3000);

// Close after 7 seconds
setTimeout(() => {
  console.log(`\n🔚 Closing test client (received ${responseCount} responses)`);
  client.close();
}, 7000);

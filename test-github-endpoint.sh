#!/bin/bash
# Test the GitHub firmware endpoint

echo "Testing GitHub firmware endpoint..."
echo ""

# Test ESP32-1732S019
echo "1. Testing ESP32-1732S019:"
curl -s "http://localhost:3000/api/flash/github-firmware?device=ESP32-1732S019" | python3 -m json.tool
echo ""

# Test M5Stick_Tally
echo "2. Testing M5Stick_Tally:"
curl -s "http://localhost:3000/api/flash/github-firmware?device=M5Stick_Tally" | python3 -m json.tool
echo ""

# Test with branch parameter
echo "3. Testing with branch parameter (main):"
curl -s "http://localhost:3000/api/flash/github-firmware?device=ESP32-1732S019&branch=main" | python3 -m json.tool
echo ""

# Test invalid device
echo "4. Testing invalid device:"
curl -s "http://localhost:3000/api/flash/github-firmware?device=Invalid" | python3 -m json.tool
echo ""

echo "Done!"

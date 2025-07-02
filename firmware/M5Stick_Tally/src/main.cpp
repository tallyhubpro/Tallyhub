#include <M5StickCPlus.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <EEPROM.h>

// Configuration - Will be loaded from preferences or set via AP mode
String wifi_ssid = "";
String wifi_password = "";
String hub_ip = "192.168.0.216";
int hub_port = 7412;
String device_id = "m5-tally-01";
String device_name = "M5 Tally Light";

// Access Point Configuration
const char* AP_SSID = "M5-Tally-Config";
const char* AP_PASSWORD = "12345678";
const IPAddress AP_IP(192, 168, 4, 1);
const IPAddress AP_GATEWAY(192, 168, 4, 1);
const IPAddress AP_SUBNET(255, 255, 255, 0);

// Web server and DNS server for captive portal
WebServer server(80);
DNSServer dnsServer;

// Configuration mode flag
bool configMode = false;
bool forceConfigMode = false;

// Network objects
WiFiUDP udp;
unsigned long lastHeartbeat = 0;
unsigned long lastWiFiCheck = 0;
unsigned long lastUDPRestart = 0;
unsigned long configModeTimeout = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000;  // 30 seconds
const unsigned long WIFI_CHECK_INTERVAL = 5000; // 5 seconds (improved from 10s)
const unsigned long UDP_RESTART_INTERVAL = 300000; // 5 minutes
const unsigned long CONFIG_MODE_TIMEOUT = 300000; // 5 minutes
const unsigned long HUB_TIMEOUT = 60000; // 60 seconds timeout for hub connection (increased from 15s)
const unsigned long CONNECTION_CHECK_INTERVAL = 2000; // Check connection every 2 seconds

// Tally state
bool isProgram = false;
bool isPreview = false;
bool isConnected = false;
bool isRegisteredWithHub = false;
bool isRecording = false;   // Recording status from mixer
bool isStreaming = false;   // Streaming status from mixer
String currentSource = "";
String assignedSource = ""; // The source this device is assigned to
String assignedSourceName = ""; // The human-readable name of the assigned source
String customDisplayName = ""; // Custom display name set via web portal
bool isAssigned = false;    // Whether device has an assignment
unsigned long lastTallyUpdate = 0;

// Hub connection tracking
unsigned long lastHubResponse = 0;
unsigned long hubConnectionAttempts = 0;
unsigned long lastReconnectionAttempt = 0;
const unsigned long MAX_HUB_RECONNECT_ATTEMPTS = 5;
const unsigned long MIN_RECONNECTION_INTERVAL = 15000; // 15 seconds between attempts

// Assignment confirmation display state
bool showingAssignmentConfirmation = false;
unsigned long assignmentConfirmationStart = 0;
String confirmationSourceName = "";
String confirmationSourceId = "";
bool confirmationIsAssigned = false;

// Device info display state
bool showingDeviceInfo = false;
unsigned long deviceInfoStart = 0;

// Registration status display state
bool showingRegistrationStatus = false;
unsigned long registrationStatusStart = 0;
String registrationStatusMessage = "";
uint16_t registrationStatusColor = GREEN;

// Preferences for storing configuration
Preferences preferences;

// Function declarations
void connectToWiFi();
void checkWiFiConnection();
void reconnectWiFi();
void restartUDP();
void ensureUDPConnection();
void checkHubConnection();
void registerWithHub();
void sendHeartbeat();
void handleUDPMessages();
void handleTallyUpdate(JsonObject data);
void handleButtons();
void updateDisplay();
void showStatus(String message, uint16_t color);
void showTallyState(String state, uint16_t color);
void showDeviceInfo();
void startConfigMode();
void handleConfigMode();
void setupWebServer();
void handleRoot();
void handleConfig();
void handleSave();
void handleSources();
void handleStatus();
void handleAssign();
void handleReset();
void handleRestart();
void handleNotFound();
void loadConfiguration();
void saveConfiguration();
void loadAssignment();
void saveAssignment();
bool connectToSavedWiFi();
String cleanSourceName(String sourceName);

void setup() {
  M5.begin();
  
  // Configure display for M5StickC Plus
  M5.Lcd.setRotation(3);  // Landscape mode for better text display
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.setTextSize(2);
  
  // Initialize preferences
  preferences.begin("tally", false);
  
  Serial.begin(115200);
  Serial.println("M5 Stick Tally Light Starting...");
  
  showStatus("Starting...", BLUE);
  
  // Load configuration from preferences
  loadConfiguration();
  loadAssignment();
  
  // Check if Button A is pressed during startup to force config mode
  M5.update();
  if (M5.BtnA.isPressed()) {
    forceConfigMode = true;
    showStatus("Config Mode", YELLOW);
    delay(2000);
  }
  
  // Try to connect to saved WiFi or start config mode
  if (!forceConfigMode && wifi_ssid.length() > 0 && connectToSavedWiFi()) {
    // Connected to saved WiFi
    isConnected = true;
    lastHubResponse = millis(); // Initialize hub response tracking
    hubConnectionAttempts = 0;
    showStatus("WiFi OK", GREEN);
    delay(1000);
    
    // Start UDP
    udp.begin(hub_port + 1); // Use different port for receiving
    
    // Start web server for configuration access
    setupWebServer();
    server.begin();
    Serial.println("Web server started on WiFi network");
    Serial.print("Access device at: http://");
    Serial.println(WiFi.localIP());
    
    // Register with hub
    registerWithHub();
    
    showStatus("Ready", GREEN);
    delay(1000);
  } else {
    // Start configuration mode
    startConfigMode();
  }
}

// Fast connection monitoring function
void monitorConnectionStatus() {
  static unsigned long lastConnectionCheck = 0;
  
  if (millis() - lastConnectionCheck > CONNECTION_CHECK_INTERVAL) {
    // Quick WiFi check
    if (WiFi.status() != WL_CONNECTED) {
      if (isConnected) {
        Serial.println("WiFi disconnected - immediate detection!");
        isConnected = false;
        isRegisteredWithHub = false;
        currentSource = "";
        // Force immediate display update to show NO WIFI
        showStatus("NO WIFI", RED);
      }
    }
    
    // Quick hub connection check
    if (WiFi.status() == WL_CONNECTED && isRegisteredWithHub) {
      unsigned long timeSinceLastResponse = millis() - lastHubResponse;
      if (timeSinceLastResponse > HUB_TIMEOUT && lastHubResponse > 0) {
        Serial.println("Hub timeout detected in monitor - immediate response!");
        isConnected = false;
        isRegisteredWithHub = false;
        currentSource = "";
        // Force immediate display update to show HUB LOST
        showStatus("HUB LOST", RED);
      }
    }
    
    lastConnectionCheck = millis();
  }
}

void loop() {
  M5.update();
  
  // Handle configuration mode
  if (configMode) {
    handleConfigMode();
    return;
  }
  
  // FAST connection monitoring - every 2 seconds
  monitorConnectionStatus();
  
  // Handle web server requests when connected to WiFi
  server.handleClient();
  
  // Check WiFi connection
  if (millis() - lastWiFiCheck > WIFI_CHECK_INTERVAL) {
    checkWiFiConnection();
    lastWiFiCheck = millis();
  }
  
  // Check hub connection and attempt reconnection if needed
  checkHubConnection();
  
  // Send heartbeat
  if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }
  
  // Check for incoming UDP messages
  handleUDPMessages();
  
  // Handle button presses
  handleButtons();
  
  // Update display if needed
  updateDisplay();
  
  delay(100);
}

// WiFi and UDP Connection Management Functions for M5Stick

void reconnectWiFi() {
  static unsigned long lastReconnectAttempt = 0;
  static int reconnectAttempts = 0;
  const unsigned long RECONNECT_INTERVAL = 30000; // 30 seconds between attempts
  const int MAX_RECONNECT_ATTEMPTS = 10;
  
  if (millis() - lastReconnectAttempt < RECONNECT_INTERVAL) {
    return; // Too soon to try again
  }
  
  lastReconnectAttempt = millis();
  reconnectAttempts++;
  
  Serial.printf("WiFi reconnection attempt %d/%d\n", reconnectAttempts, MAX_RECONNECT_ATTEMPTS);
  
  // Reset WiFi and try to reconnect
  WiFi.disconnect();
  delay(1000);
  
  // Use stored credentials
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifi_ssid.c_str(), wifi_password.c_str());
  
  // Wait up to 15 seconds for connection
  unsigned long connectStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - connectStart < 15000) {
    delay(500);
    Serial.print(".");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi reconnected successfully!");
    Serial.println("IP address: " + WiFi.localIP().toString());
    reconnectAttempts = 0;
    
    // Restart UDP and re-register with hub
    restartUDP();
    isConnected = false;
    isRegisteredWithHub = false;
  } else {
    Serial.println("\nWiFi reconnection failed");
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      Serial.println("Max reconnection attempts reached, restarting device...");
      M5.Axp.PowerOff();
      delay(1000);
      esp_restart();
    }
  }
}

void restartUDP() {
  Serial.println("Restarting UDP connection...");
  udp.stop();
  delay(100);
  
  if (udp.begin(hub_port + 1)) { // Use consistent port 7413
    Serial.println("UDP restarted successfully");
  } else {
    Serial.println("Failed to restart UDP");
  }
}

void ensureUDPConnection() {
  // Check if UDP is still working by attempting to send a test packet
  if (WiFi.status() == WL_CONNECTED) {
    static unsigned long lastUDPTest = 0;
    const unsigned long UDP_TEST_INTERVAL = 120000; // Test every 2 minutes
    
    if (millis() - lastUDPTest > UDP_TEST_INTERVAL) {
      Serial.println("Testing UDP connection...");
      
      // Send a test heartbeat
      JsonDocument doc;
      doc["type"] = "ping";
      doc["deviceId"] = device_id;
      doc["timestamp"] = millis();
      
      String message;
      serializeJson(doc, message);
      
      int result = udp.beginPacket(hub_ip.c_str(), hub_port);
      if (result == 1) {
        udp.print(message);
        int endResult = udp.endPacket();
        if (endResult == 1) {
          Serial.println("UDP test successful");
        } else {
          Serial.println("UDP test failed on endPacket, restarting UDP...");
          restartUDP();
        }
      } else {
        Serial.println("UDP test failed on beginPacket, restarting UDP...");
        restartUDP();
      }
      
      lastUDPTest = millis();
    }
  }
}

void connectToWiFi() {
  if (!connectToSavedWiFi()) {
    startConfigMode();
  }
}

void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    isConnected = false;
    isRegisteredWithHub = false;
    Serial.println("WiFi disconnected, attempting reconnection...");
    
    // Try to reconnect to saved WiFi
    if (connectToSavedWiFi()) {
      isConnected = true;
      lastHubResponse = millis(); // Reset hub response tracking
      hubConnectionAttempts = 0;
      // Restart web server after reconnection
      server.stop();
      setupWebServer();
      server.begin();
      Serial.println("Web server restarted after WiFi reconnection");
      Serial.print("Access device at: http://");
      Serial.println(WiFi.localIP());
      registerWithHub();
    } else {
      Serial.println("Reconnection failed, starting config mode");
      startConfigMode();
    }
  } else if (!isConnected) {
    isConnected = true;
    lastHubResponse = millis(); // Reset hub response tracking
    hubConnectionAttempts = 0;
    // Start web server if not already started
    setupWebServer();
    server.begin();
    Serial.println("Web server started after WiFi connection restored");
    Serial.print("Access device at: http://");
    Serial.println(WiFi.localIP());
    registerWithHub();
  }
}

void registerWithHub() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  Serial.println("Registering with Tally Hub...");
  showStatus("Register", BLUE);
  
  JsonDocument doc;
  doc["type"] = "register";
  doc["deviceId"] = device_id;
  doc["deviceName"] = device_name;
  
  // Include assignment information if device has an assignment
  if (isAssigned && assignedSource.length() > 0) {
    doc["assignedSource"] = assignedSource;
    doc["isAssigned"] = true;
    Serial.println("Registration includes assignment: " + assignedSource);
  } else {
    doc["isAssigned"] = false;
  }
  
  String message;
  serializeJson(doc, message);
  
  udp.beginPacket(hub_ip.c_str(), hub_port);
  udp.print(message);
  udp.endPacket();
  
  Serial.println("Registration sent to hub");
}

void sendHeartbeat() {
  if (!isRegisteredWithHub) return;
  
  JsonDocument doc;
  doc["type"] = "heartbeat";
  doc["deviceId"] = device_id;
  
  String message;
  serializeJson(doc, message);
  
  udp.beginPacket(hub_ip.c_str(), hub_port);
  udp.print(message);
  udp.endPacket();
  
  Serial.println("Heartbeat sent");
}

void checkHubConnection() {
  // Only check if we're connected to WiFi and were previously connected to hub
  if (!isRegisteredWithHub) return;
  
  unsigned long timeSinceLastResponse = millis() - lastHubResponse;
  
  // If we haven't heard from the hub in HUB_TIMEOUT milliseconds
  if (timeSinceLastResponse > HUB_TIMEOUT) {
    // Check if enough time has passed since last reconnection attempt
    if (millis() - lastReconnectionAttempt < MIN_RECONNECTION_INTERVAL) {
      return; // Not enough time passed, skip this attempt
    }
    
    Serial.printf("Hub connection timeout (%lu ms since last response)\n", timeSinceLastResponse);
    
    // Immediately mark as not registered to show HUB LOST
    isRegisteredWithHub = false;
    
    // Don't attempt reconnection too frequently or indefinitely
    if (hubConnectionAttempts < MAX_HUB_RECONNECT_ATTEMPTS) {
      hubConnectionAttempts++;
      lastReconnectionAttempt = millis();
      Serial.printf("Attempting hub reconnection (attempt %lu/%lu)\n", hubConnectionAttempts, MAX_HUB_RECONNECT_ATTEMPTS);
      
      // Show HUB LOST status for a moment before attempting reconnection
      showingRegistrationStatus = true;
      registrationStatusStart = millis();
      registrationStatusMessage = "Hub Lost";
      registrationStatusColor = RED;
      
      // Wait 2 seconds to show HUB LOST status, then attempt reconnection
      delay(2000);
      
      showingRegistrationStatus = true;
      registrationStatusStart = millis();
      registrationStatusMessage = "Reconnecting...";
      registrationStatusColor = YELLOW;
      
      // Attempt to re-register with the hub (don't restart UDP unnecessarily)
      delay(1000); // Brief delay before attempting reconnection
      
      registerWithHub();
      // Don't reset lastHubResponse here - only reset when we get an actual response
    } else {
      Serial.println("Max quick reconnection attempts reached, switching to slow retry mode");
      
      // Reset attempt counter every 5 minutes to keep trying
      static unsigned long lastAttemptReset = 0;
      if (millis() - lastAttemptReset > 300000) { // 5 minutes
        Serial.println("Resetting reconnection attempts - continuing to try...");
        hubConnectionAttempts = 0;
        lastAttemptReset = millis();
        return; // Let the next call handle the reconnection
      }
      
      lastReconnectionAttempt = millis();
      
      showingRegistrationStatus = true;
      registrationStatusStart = millis();
      registrationStatusMessage = "Hub Lost";
      registrationStatusColor = RED;
      
      isConnected = false;
      isRegisteredWithHub = false;
      
      // Continue trying with longer delays
      delay(10000); // Wait 10 seconds before next attempt
      Serial.println("Attempting slow reconnection...");
      registerWithHub();
      // Don't reset lastHubResponse here - only reset when we get an actual response
    }
  }
}

void handleUDPMessages() {
  int packetSize = udp.parsePacket();
  if (packetSize) {
    char buffer[512];
    int len = udp.read(buffer, sizeof(buffer) - 1);
    buffer[len] = '\0';
    
    Serial.printf("Received UDP message: %s\n", buffer);
    
    // Update last hub response time for any message from hub
    lastHubResponse = millis();
    hubConnectionAttempts = 0; // Reset connection attempts on successful response
    
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, buffer);
    
    if (error) {
      Serial.printf("JSON parsing failed: %s\n", error.c_str());
      return;
    }
    
    String messageType = doc["type"];
    
    if (messageType == "registered") {
      Serial.println("Registration confirmed by hub");
      isRegisteredWithHub = true;
      
      showingRegistrationStatus = true;
      registrationStatusStart = millis();
      registrationStatusMessage = "Connected";
      registrationStatusColor = GREEN;
    }
    else if (messageType == "heartbeat_ack") {
      Serial.println("Heartbeat acknowledged");
      hubConnectionAttempts = 0; // Reset reconnection attempts on successful communication
    }
    else if (messageType == "register_required") {
      Serial.println("Hub requesting registration - re-registering...");
      
      showingRegistrationStatus = true;
      registrationStatusStart = millis();
      registrationStatusMessage = "Re-register";
      registrationStatusColor = YELLOW;
      
      registerWithHub();
    }
    else if (messageType == "tally") {
      handleTallyUpdate(doc["data"]);
    }
    else if (messageType == "assignment") {
      JsonObject data = doc["data"];
      String newAssignedSource = data["sourceId"];
      String sourceName = data["sourceName"];
      String mode = data["mode"];
      
      Serial.printf("Assignment update - Mode: %s, Source: %s\n", mode.c_str(), sourceName.c_str());
      
      if (mode == "assigned") {
        assignedSource = newAssignedSource;
        assignedSourceName = sourceName;
        isAssigned = true;
        
        // Only override custom display name if we don't have one set locally
        // This preserves user-set display names from the web portal
        if (customDisplayName.length() == 0) {
          currentSource = cleanSourceName(sourceName);
          confirmationSourceName = cleanSourceName(sourceName);
        } else {
          currentSource = customDisplayName;
          confirmationSourceName = customDisplayName;
        }
        
        saveAssignment();
        
        showingAssignmentConfirmation = true;
        assignmentConfirmationStart = millis();
        confirmationSourceId = newAssignedSource;
        confirmationIsAssigned = true;
        
        isProgram = false;
        isPreview = false;
        isRecording = false;
        isStreaming = false;
        currentSource = "";
      } else {
        assignedSource = "";
        assignedSourceName = "";
        customDisplayName = ""; // Clear custom display name on unassignment
        isAssigned = false;
        saveAssignment();
        
        showingAssignmentConfirmation = true;
        assignmentConfirmationStart = millis();
        confirmationSourceName = "";
        confirmationSourceId = "";
        confirmationIsAssigned = false;
        
        isProgram = false;
        isPreview = false;
        isRecording = false;
        isStreaming = false;
        currentSource = "";
      }
    }
  }
}

void handleTallyUpdate(JsonObject data) {
  String sourceId = data["id"];
  String sourceName = data["name"];
  bool program = data["program"];
  bool preview = data["preview"];
  
  // Better handling of optional fields
  bool recording = false;
  bool streaming = false;
  
  if (data.containsKey("recording")) {
    recording = data["recording"].as<bool>();
  }
  
  if (data.containsKey("streaming")) {
    streaming = data["streaming"].as<bool>();
  }
  
  // Debug print raw JSON data
  Serial.print("Raw tally update received: ");
  String jsonString;
  serializeJson(data, jsonString);
  Serial.println(jsonString);
  
  if (!isAssigned || assignedSource.length() == 0) {
    Serial.println("No assignment - ignoring tally update");
    return;
  }
  
  if (sourceId != assignedSource) {
    return;
  }
  
  Serial.printf("Tally update for assigned source: %s, Program: %s, Preview: %s, Recording: %s, Streaming: %s\n", 
                sourceName.c_str(), program ? "YES" : "NO", preview ? "YES" : "NO", 
                recording ? "YES" : "NO", streaming ? "YES" : "NO");
  
  // Track recording/streaming state changes for debugging
  bool recordingChanged = (isRecording != recording);
  bool streamingChanged = (isStreaming != streaming);
  
  isProgram = program;
  isPreview = preview;
  isRecording = recording;
  isStreaming = streaming;
  currentSource = cleanSourceName(sourceName);
  lastTallyUpdate = millis();
  
  // Log state changes
  if (recordingChanged) {
    Serial.printf("📌 Recording state changed to: %s\n", isRecording ? "ON" : "OFF");
  }
  if (streamingChanged) {
    Serial.printf("📌 Streaming state changed to: %s\n", isStreaming ? "ON" : "OFF");
  }
}

void handleButtons() {
  if (M5.BtnA.wasPressed()) {
    if (!showingAssignmentConfirmation && !showingRegistrationStatus) {
      showDeviceInfo();
    }
  }
  
  if (M5.BtnB.wasPressed()) {
    static unsigned long btnBPressTime = 0;
    static bool btnBLongPressed = false;
    
    if (M5.BtnB.isPressed() && btnBPressTime == 0) {
      btnBPressTime = millis();
    } else if (!M5.BtnB.isPressed() && btnBPressTime > 0) {
      unsigned long pressDuration = millis() - btnBPressTime;
      
      if (pressDuration > 3000 && !btnBLongPressed) {
        Serial.println("Long press detected - entering config mode");
        startConfigMode();
        btnBLongPressed = true;
      } else if (pressDuration < 3000 && !btnBLongPressed) {
        if (!showingAssignmentConfirmation && !showingDeviceInfo && !showingRegistrationStatus) {
          registerWithHub();
        }
      }
      
      btnBPressTime = 0;
      btnBLongPressed = false;
    } else if (M5.BtnB.isPressed() && (millis() - btnBPressTime > 3000) && !btnBLongPressed) {
      if (!showingAssignmentConfirmation && !showingDeviceInfo && !showingRegistrationStatus) {
        showStatus("Release for Config", YELLOW);
      }
      btnBLongPressed = true;
    }
  }
}

void updateDisplay() {
  static unsigned long lastDisplayUpdate = 0;
  static bool lastProgramState = false;
  static bool lastPreviewState = false;
  static String lastSource = "";
  
  // Handle registration status display
  if (showingRegistrationStatus) {
    unsigned long displayDuration = (registrationStatusMessage == "Re-register") ? 500 : 1000;
    
    if (millis() - registrationStatusStart < displayDuration) {
      showStatus(registrationStatusMessage, registrationStatusColor);
      return;
    } else {
      showingRegistrationStatus = false;
      lastDisplayUpdate = 0;
      lastProgramState = !isProgram;
      lastPreviewState = !isPreview;
      lastSource = "";
    }
  }
  
  // Handle device info display
  if (showingDeviceInfo) {
    if ((millis() - deviceInfoStart < 5000) && !M5.BtnA.wasPressed() && !M5.BtnB.wasPressed()) {
      M5.Lcd.fillScreen(BLUE);
      M5.Lcd.setTextColor(WHITE);
      M5.Lcd.setTextSize(1);
      
      M5.Lcd.setCursor(5, 10);
      M5.Lcd.printf("Device: %s", device_name.c_str());
      
      M5.Lcd.setCursor(5, 25);
      M5.Lcd.printf("ID: %s", device_id.c_str());
      
      M5.Lcd.setCursor(5, 40);
      M5.Lcd.printf("Hub: %s:%d", hub_ip.c_str(), hub_port);
      
      M5.Lcd.setCursor(5, 55);
      M5.Lcd.printf("WiFi: %s", wifi_ssid.c_str());
      
      M5.Lcd.setCursor(5, 70);
      M5.Lcd.printf("IP: %s", WiFi.localIP().toString().c_str());
      
      M5.Lcd.setCursor(5, 85);
      if (isAssigned && assignedSource.length() > 0) {
        M5.Lcd.printf("Assigned: YES");
      } else {
        M5.Lcd.printf("Assigned: NO");
      }
      
      M5.Lcd.setCursor(5, 100);
      M5.Lcd.print("Press any button to continue");
      return;
    } else {
      showingDeviceInfo = false;
      lastDisplayUpdate = 0;
      lastProgramState = !isProgram;
      lastPreviewState = !isPreview;
      lastSource = "";
    }
  }
  
  // Handle assignment confirmation display
  if (showingAssignmentConfirmation) {
    if (millis() - assignmentConfirmationStart < 3000) {
      if (confirmationIsAssigned) {
        M5.Lcd.fillScreen(BLUE);
        M5.Lcd.setTextColor(WHITE);
        M5.Lcd.setTextSize(1);
        M5.Lcd.setCursor(10, 20);
        M5.Lcd.print("ASSIGNED TO:");
        M5.Lcd.setCursor(10, 40);
        M5.Lcd.print(confirmationSourceName);
        M5.Lcd.setCursor(10, 60);
        M5.Lcd.print("ID: " + confirmationSourceId);
        M5.Lcd.setCursor(10, 80);
        M5.Lcd.print("SAVED TO MEMORY");
      } else {
        M5.Lcd.fillScreen(RED);
        M5.Lcd.setTextColor(WHITE);
        M5.Lcd.setTextSize(2);
        M5.Lcd.setCursor(30, 40);
        M5.Lcd.print("UNASSIGNED");
        M5.Lcd.setTextSize(1);
        M5.Lcd.setCursor(10, 80);
        M5.Lcd.print("No source assigned");
      }
      return;
    } else {
      showingAssignmentConfirmation = false;
      lastDisplayUpdate = 0;
      lastProgramState = !isProgram;
      lastPreviewState = !isPreview;
      lastSource = "";
    }
  }
  
  // Normal display update
  static bool lastRecordingState = false;
  static bool lastStreamingState = false;
  
  bool stateChanged = (isProgram != lastProgramState) || 
                     (isPreview != lastPreviewState) || 
                     (isRecording != lastRecordingState) ||
                     (isStreaming != lastStreamingState) ||
                     (currentSource != lastSource);
  
  if (stateChanged || (millis() - lastDisplayUpdate > 3000)) { // Faster updates - 3 seconds
    if (WiFi.status() != WL_CONNECTED) {
      showStatus("NO WIFI", RED);
    } else if (!isRegisteredWithHub) {
      // Check if we've been trying to connect for a while
      unsigned long timeSinceLastResponse = millis() - lastHubResponse;
      if ((timeSinceLastResponse > HUB_TIMEOUT && lastHubResponse > 0) || 
          (lastHubResponse == 0 && millis() > 30000)) { // Show HUB LOST after 30 seconds if never connected
        showStatus("HUB LOST", RED); // Clear indication that hub is unreachable
      } else {
        showStatus("Connecting...", BLUE);
      }
    } else if (!isAssigned || assignedSource.length() == 0) {
      showStatus("UNASSIGNED", RED);
    } else if (isProgram) {
      showTallyState("LIVE", RED);
    } else if (isPreview) {
      showTallyState("PREVIEW", 0xFD20);  // Orange color (RGB565)
    } else {
      showTallyState("IDLE", 0x7BEF);     // Grey color (RGB565)
    }
    
    lastDisplayUpdate = millis();
    lastProgramState = isProgram;
    lastPreviewState = isPreview;
    lastRecordingState = isRecording;
    lastStreamingState = isStreaming;
    lastSource = currentSource;
  }
}

void showStatus(String message, uint16_t color) {
  M5.Lcd.fillScreen(color);
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.setTextSize(2);
  
  M5.Lcd.setCursor(10, (135 - 16) / 2);
  M5.Lcd.print(message);
}

void showTallyState(String state, uint16_t color) {
  M5.Lcd.fillScreen(color);
  M5.Lcd.setTextColor(WHITE);
  
  // Show recording/streaming status in top-right corner
  if (isRecording || isStreaming) {
    // Add a small colored background for the indicator
    if (isRecording) {
      M5.Lcd.fillRect(160, 0, 80, 15, RED);
      M5.Lcd.setTextColor(WHITE);
    } else if (isStreaming) {
      M5.Lcd.fillRect(160, 0, 80, 15, 0x07E0); // Green
      M5.Lcd.setTextColor(BLACK);
    }
    
    M5.Lcd.setTextSize(1);
    M5.Lcd.setCursor(165, 4);
    if (isRecording && isStreaming) {
      M5.Lcd.print("REC/STREAM");
    } else if (isRecording) {
      M5.Lcd.print("RECORDING");
    } else if (isStreaming) {
      M5.Lcd.print("STREAMING");
    }
    M5.Lcd.setTextColor(WHITE);
  }
  
  // Main tally state - larger text, centered
  M5.Lcd.setTextSize(3);
  M5.Lcd.setCursor(50, 20);
  M5.Lcd.print(state);
  
  // Show assigned source name
  if (isAssigned && assignedSource.length() > 0) {
    M5.Lcd.setTextSize(1);
    M5.Lcd.setCursor(5, 70);
    String displaySource;
    
    // Prioritize custom display name set via web portal
    if (customDisplayName.length() > 0) {
      displaySource = "Source: " + customDisplayName;
    } else if (currentSource.length() > 0) {
      displaySource = "Source: " + currentSource;
    } else if (assignedSourceName.length() > 0) {
      displaySource = "Assigned: " + assignedSourceName;
    } else {
      displaySource = "Assigned: " + cleanSourceName(assignedSource);
    }
    
    if (displaySource.length() > 35) {
      displaySource = displaySource.substring(0, 32) + "...";
    }
    M5.Lcd.print(displaySource);
  } else {
    M5.Lcd.setTextSize(1);
    M5.Lcd.setCursor(5, 70);
    M5.Lcd.print("No assignment");
  }
  
  // Show connection status
  M5.Lcd.setTextSize(1);
  M5.Lcd.setCursor(5, 90);
  M5.Lcd.printf("IP: %s", WiFi.localIP().toString().c_str());
  
  // Show device ID
  M5.Lcd.setCursor(5, 110);
  M5.Lcd.printf("ID: %s", device_id.c_str());
}

void showDeviceInfo() {
  showingDeviceInfo = true;
  deviceInfoStart = millis();
}

void loadConfiguration() {
  wifi_ssid = preferences.getString("wifi_ssid", "");
  wifi_password = preferences.getString("wifi_password", "");
  hub_ip = preferences.getString("hub_ip", "192.168.0.216");
  hub_port = preferences.getInt("hub_port", 7412);
  device_id = preferences.getString("device_id", "m5-tally-01");
  device_name = preferences.getString("device_name", "M5 Tally Light");
  
  Serial.println("Configuration loaded:");
  Serial.printf("WiFi SSID: %s\n", wifi_ssid.c_str());
  Serial.printf("Hub IP: %s:%d\n", hub_ip.c_str(), hub_port);
  Serial.printf("Device: %s (%s)\n", device_name.c_str(), device_id.c_str());
}

void saveConfiguration() {
  preferences.putString("wifi_ssid", wifi_ssid);
  preferences.putString("wifi_password", wifi_password);
  preferences.putString("hub_ip", hub_ip);
  preferences.putInt("hub_port", hub_port);
  preferences.putString("device_id", device_id);
  preferences.putString("device_name", device_name);
  
  Serial.println("Configuration saved");
}

void loadAssignment() {
  assignedSource = preferences.getString("assigned_source", "");
  assignedSourceName = preferences.getString("assigned_source_name", "");
  customDisplayName = preferences.getString("custom_display_name", "");
  isAssigned = preferences.getBool("is_assigned", false);
  
  Serial.println("Assignment loaded:");
  if (isAssigned && assignedSource.length() > 0) {
    Serial.printf("Assigned to: %s\n", assignedSource.c_str());
    if (assignedSourceName.length() > 0) {
      Serial.printf("Source name: %s\n", assignedSourceName.c_str());
    }
    if (customDisplayName.length() > 0) {
      Serial.printf("Custom display name: %s\n", customDisplayName.c_str());
    }
  } else {
    Serial.println("No assignment");
  }
}

void saveAssignment() {
  preferences.putString("assigned_source", assignedSource);
  preferences.putString("assigned_source_name", assignedSourceName);
  preferences.putString("custom_display_name", customDisplayName);
  preferences.putBool("is_assigned", isAssigned);
  
  Serial.println("Assignment saved:");
  if (isAssigned && assignedSource.length() > 0) {
    Serial.printf("Assigned to: %s\n", assignedSource.c_str());
    if (assignedSourceName.length() > 0) {
      Serial.printf("Source name: %s\n", assignedSourceName.c_str());
    }
    if (customDisplayName.length() > 0) {
      Serial.printf("Custom display name: %s\n", customDisplayName.c_str());
    }
  } else {
    Serial.println("No assignment");
  }
}

bool connectToSavedWiFi() {
  if (wifi_ssid.length() == 0) return false;
  
  Serial.printf("Connecting to saved WiFi: %s\n", wifi_ssid.c_str());
  WiFi.begin(wifi_ssid.c_str(), wifi_password.c_str());
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected to saved WiFi");
    return true;
  } else {
    Serial.println("\nFailed to connect to saved WiFi");
    return false;
  }
}

void startConfigMode() {
  configMode = true;
  configModeTimeout = millis();
  
  Serial.println("Starting configuration mode");
  showStatus("Config AP", YELLOW);
  
  // Start WiFi Access Point
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  
  // Start DNS server for captive portal
  dnsServer.start(53, "*", AP_IP);
  
  // Setup web server
  setupWebServer();
  server.begin();
  
  M5.Lcd.fillScreen(YELLOW);
  M5.Lcd.setTextColor(BLACK);
  M5.Lcd.setTextSize(1);
  M5.Lcd.setCursor(5, 10);
  M5.Lcd.printf("=== Config Mode ===");
  M5.Lcd.setCursor(5, 25);
  M5.Lcd.printf("WiFi: %s", AP_SSID);
  M5.Lcd.setCursor(5, 40);
  M5.Lcd.printf("Pass: %s", AP_PASSWORD);
  M5.Lcd.setCursor(5, 55);
  M5.Lcd.printf("Web: 192.168.4.1");
  M5.Lcd.setCursor(5, 70);
  M5.Lcd.printf("IP: %s", AP_IP.toString().c_str());
  M5.Lcd.setCursor(5, 85);
  M5.Lcd.printf("Press B to exit");
  M5.Lcd.setCursor(5, 100);
  M5.Lcd.printf("Timeout: 5 min");
  
  Serial.printf("Config AP started: %s\n", AP_SSID);
  Serial.println("Connect to WiFi and go to 192.168.4.1");
}

void handleConfigMode() {
  dnsServer.processNextRequest();
  server.handleClient();
  
  M5.update();
  
  if (M5.BtnB.wasPressed()) {
    configMode = false;
    WiFi.softAPdisconnect(true);
    server.stop();
    dnsServer.stop();
    
    Serial.println("Exiting configuration mode");
    ESP.restart();
  }
  
  if (millis() - configModeTimeout > CONFIG_MODE_TIMEOUT) {
    Serial.println("Configuration mode timeout");
    configMode = false;
    WiFi.softAPdisconnect(true);
    server.stop();
    dnsServer.stop();
    ESP.restart();
  }
}

void setupWebServer() {
  server.on("/", handleRoot);
  server.on("/config", handleConfig);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/sources", handleSources);
  server.on("/assign", HTTP_POST, handleAssign);
  server.on("/reset", HTTP_POST, handleReset);
  server.on("/restart", HTTP_POST, handleRestart);
  server.on("/status", handleStatus);
  server.onNotFound(handleNotFound);
}

void handleRoot() {
  String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<title>M5 Tally Configuration</title>";
  html += "<style>";
  html += ":root{";
  html += "--system-blue:#007AFF;--system-green:#34C759;--system-red:#FF3B30;--system-orange:#FF9500;";
  html += "--system-gray:#8E8E93;--system-gray2:#AEAEB2;--system-gray3:#C7C7CC;--system-gray4:#D1D1D6;";
  html += "--system-gray5:#E5E5EA;--system-gray6:#F2F2F7;";
  html += "--bg-primary:#FFFFFF;--bg-secondary:#F2F2F7;--bg-quaternary:rgba(116,116,128,0.08);";
  html += "--text-primary:#000000;--text-secondary:rgba(60,60,67,0.6);";
  html += "--separator-opaque:#C6C6C8;--separator-non-opaque:rgba(60,60,67,0.36);";
  html += "--shadow-2:0 2px 10px rgba(0,0,0,0.08);--shadow-3:0 4px 20px rgba(0,0,0,0.08);";
  html += "--radius-small:6px;--radius-medium:10px;--radius-large:16px;}";
  html += "*{margin:0;padding:0;box-sizing:border-box;}";
  html += "body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;";
  html += "background:var(--bg-secondary);color:var(--text-primary);line-height:1.47;font-size:16px;";
  html += "-webkit-font-smoothing:antialiased;}";
  html += ".header{background:var(--bg-primary);border-bottom:0.5px solid var(--separator-non-opaque);";
  html += "padding:1.5rem 0;text-align:center;}";
  html += ".header-icon{width:40px;height:40px;background:linear-gradient(135deg,var(--system-blue),var(--system-orange));";
  html += "border-radius:var(--radius-medium);display:inline-flex;align-items:center;justify-content:center;";
  html += "font-size:20px;color:white;margin-bottom:0.5rem;}";
  html += ".header h1{font-size:24px;font-weight:700;color:var(--text-primary);margin-bottom:4px;}";
  html += ".header-subtitle{font-size:14px;color:var(--text-secondary);}";
  html += ".container{max-width:480px;margin:0 auto;padding:2rem 1rem;}";
  html += ".card{background:var(--bg-primary);border-radius:var(--radius-large);padding:1.5rem;";
  html += "margin-bottom:1.5rem;box-shadow:var(--shadow-2);border:0.5px solid var(--separator-non-opaque);";
  html += "transition:all 0.2s ease;}";
  html += ".card:hover{box-shadow:var(--shadow-3);transform:translateY(-1px);}";
  html += ".card-header{display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem;}";
  html += ".card-icon{width:24px;height:24px;background:var(--bg-quaternary);border-radius:var(--radius-small);";
  html += "display:flex;align-items:center;justify-content:center;font-size:14px;}";
  html += ".card h3{font-size:17px;font-weight:600;color:var(--text-primary);}";
  html += ".info-grid{display:grid;gap:0.75rem;}";
  html += ".info-item{background:var(--bg-quaternary);padding:1rem;border-radius:var(--radius-medium);";
  html += "display:flex;justify-content:space-between;align-items:center;}";
  html += ".info-label{font-size:14px;color:var(--text-secondary);font-weight:500;}";
  html += ".info-value{font-size:14px;color:var(--text-primary);font-weight:600;}";
  html += ".form-group{margin-bottom:1rem;}";
  html += ".form-label{font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:0.5rem;display:block;}";
  html += ".form-input{background:var(--bg-primary);border:1px solid var(--separator-opaque);";
  html += "border-radius:var(--radius-small);padding:0.625rem 0.75rem;font-size:14px;width:100%;";
  html += "transition:all 0.2s ease;}";
  html += ".form-input:focus{outline:none;border-color:var(--system-blue);";
  html += "box-shadow:0 0 0 3px rgba(0,122,255,0.1);}";
  html += ".btn{border:none;padding:0.75rem 1.25rem;border-radius:var(--radius-medium);";
  html += "font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s ease;width:100%;margin-bottom:0.75rem;}";
  html += ".btn-primary{background:var(--system-blue);color:white;}";
  html += ".btn-primary:hover{background:rgba(0,122,255,0.85);transform:translateY(-1px);";
  html += "box-shadow:0 2px 8px rgba(0,122,255,0.2);}";
  html += ".btn-secondary{background:var(--system-gray);color:white;}";
  html += ".btn-secondary:hover{background:rgba(142,142,147,0.85);}";
  html += ".btn-danger{background:var(--system-red);color:white;}";
  html += ".btn-danger:hover{background:rgba(255,59,48,0.85);}";
  html += ".info-list{list-style:none;padding:0;}";
  html += ".info-list li{padding:0.5rem 0;border-bottom:0.5px solid var(--separator-non-opaque);";
  html += "font-size:14px;color:var(--text-secondary);}";
  html += ".info-list li:last-child{border-bottom:none;}";
  html += "</style></head><body>";
  html += "<div class='header'><div class='header-icon'>📱</div>";
  html += "<h1>M5 Tally Configuration</h1>";
  html += "<div class='header-subtitle'>Device: " + device_name + "</div></div>";
  html += "<div class='container'>";
  html += "<div class='card'><div class='card-header'><div class='card-icon'>ℹ️</div>";
  html += "<h3>Device Information</h3></div><div class='info-grid'>";
  html += "<div class='info-item'><span class='info-label'>Device Name</span>";
  html += "<span class='info-value'>" + device_name + "</span></div>";
  html += "<div class='info-item'><span class='info-label'>Device ID</span>";
  html += "<span class='info-value'>" + device_id + "</span></div>";
  html += "<div class='info-item'><span class='info-label'>WiFi Network</span>";
  html += "<span class='info-value'>" + (wifi_ssid.length() > 0 ? wifi_ssid : "Not configured") + "</span></div>";
  html += "<div class='info-item'><span class='info-label'>IP Address</span>";
  html += "<span class='info-value'>" + WiFi.localIP().toString() + "</span></div>";
  html += "<div class='info-item'><span class='info-label'>Hub Server</span>";
  html += "<span class='info-value'>" + hub_ip + ":" + String(hub_port) + "</span></div></div></div>";
  html += "<div class='card'><div class='card-header'><div class='card-icon'>📶</div>";
  html += "<h3>WiFi Configuration</h3></div>";
  html += "<form action='/save' method='post'>";
  html += "<div class='form-group'><label class='form-label'>Network Name (SSID)</label>";
  html += "<input type='text' name='ssid' class='form-input' placeholder='Enter WiFi network name' value='" + wifi_ssid + "' required></div>";
  html += "<div class='form-group'><label class='form-label'>WiFi Password</label>";
  html += "<input type='password' name='password' class='form-input' placeholder='Enter WiFi password' value='" + wifi_password + "'></div>";
  html += "<div class='form-group'><label class='form-label'>Hub Server IP</label>";
  html += "<input type='text' name='hub_ip' class='form-input' placeholder='192.168.1.100' value='" + hub_ip + "' required></div>";
  html += "<div class='form-group'><label class='form-label'>Hub Server Port</label>";
  html += "<input type='number' name='hub_port' class='form-input' placeholder='7412' value='" + String(hub_port) + "' min='1' max='65535' required></div>";
  html += "<div class='form-group'><label class='form-label'>Device ID</label>";
  html += "<input type='text' name='device_id' class='form-input' placeholder='m5-tally-01' value='" + device_id + "' required></div>";
  html += "<div class='form-group'><label class='form-label'>Display Name</label>";
  html += "<input type='text' name='device_name' class='form-input' placeholder='Camera 1 Tally' value='" + device_name + "' required></div>";
  html += "<button type='submit' class='btn btn-primary'>Save Configuration</button></form></div>";
  html += "<div class='card'><div class='card-header'><div class='card-icon'>⚙️</div>";
  html += "<h3>Device Actions</h3></div>";
  html += "<button onclick='window.location=\"/sources\"' class='btn btn-secondary'>Manage Sources</button>";
  html += "<button onclick='window.location=\"/status\"' class='btn btn-secondary'>Device Status</button>";
  html += "<button onclick='restart()' class='btn btn-secondary'>Restart Device</button>";
  html += "<button onclick='resetConfig()' class='btn btn-danger'>Factory Reset</button></div></div>";
  html += "<script>function restart(){if(confirm('Restart the M5 Tally device now?')){";
  html += "fetch('/restart',{method:'POST'}).then(()=>{alert('Device is restarting...');});}}";
  html += "function resetConfig(){if(confirm('WARNING: This will erase ALL settings!')){";
  html += "if(confirm('This cannot be undone. Continue?')){";
  html += "fetch('/reset',{method:'POST'}).then(()=>{alert('Factory reset complete.');});}}}</script>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
}

void handleConfig() {
  handleRoot();
}

void handleSave() {
  wifi_ssid = server.arg("ssid");
  wifi_password = server.arg("password");
  hub_ip = server.arg("hub_ip");
  hub_port = server.arg("hub_port").toInt();
  device_id = server.arg("device_id");
  device_name = server.arg("device_name");
  
  saveConfiguration();
  
  String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0\">";
  html += "<title>Configuration Saved</title>";
  html += "<style>";
  html += ":root{--system-green:#34C759;--bg-primary:#FFFFFF;--bg-secondary:#F2F2F7;";
  html += "--text-primary:#000000;--text-secondary:rgba(60,60,67,0.6);";
  html += "--shadow-2:0 2px 10px rgba(0,0,0,0.08);--radius-large:16px;}";
  html += "body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;";
  html += "background:var(--bg-secondary);margin:0;padding:2rem;text-align:center;}";
  html += ".container{max-width:480px;margin:0 auto;background:var(--bg-primary);";
  html += "padding:2rem;border-radius:var(--radius-large);box-shadow:var(--shadow-2);}";
  html += ".success-icon{width:60px;height:60px;background:var(--system-green);";
  html += "border-radius:50%;display:inline-flex;align-items:center;justify-content:center;";
  html += "font-size:30px;color:white;margin-bottom:1rem;}";
  html += "h1{color:var(--system-green);font-size:24px;font-weight:700;margin-bottom:1rem;}";
  html += "p{color:var(--text-secondary);margin-bottom:0.75rem;line-height:1.5;}";
  html += ".info{color:var(--text-primary);font-weight:600;}</style></head><body>";
  html += "<div class='container'><div class='success-icon'>✓</div>";
  html += "<h1>Configuration Saved!</h1>";
  html += "<p>Your M5 Tally Light will now restart and connect to:</p>";
  html += "<p class='info'>WiFi: " + wifi_ssid + "</p>";
  html += "<p class='info'>Hub: " + hub_ip + ":" + String(hub_port) + "</p>";
  html += "<p class='info'>Device: " + device_name + "</p>";
  html += "<p>Restarting in 5 seconds...</p></div>";
  html += "<script>setTimeout(()=>{window.close();},5000);</script>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
  
  delay(2000);
  ESP.restart();
}

void handleNotFound() {
  server.sendHeader("Location", "/", true);
  server.send(302, "text/plain", "");
}

void handleSources() {
  String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0\">";
  html += "<title>M5 Tally - Source Assignment</title>";
  html += "<style>";
  html += ":root{--system-blue:#007AFF;--system-green:#34C759;--system-red:#FF3B30;";
  html += "--system-gray5:#E5E5EA;--bg-primary:#FFFFFF;--bg-secondary:#F2F2F7;";
  html += "--bg-quaternary:rgba(116,116,128,0.08);--text-primary:#000000;";
  html += "--text-secondary:rgba(60,60,67,0.6);--separator-opaque:#C6C6C8;";
  html += "--separator-non-opaque:rgba(60,60,67,0.36);--shadow-2:0 2px 10px rgba(0,0,0,0.08);";
  html += "--shadow-3:0 4px 20px rgba(0,0,0,0.08);--radius-small:6px;--radius-medium:10px;--radius-large:16px;}";
  html += "*{margin:0;padding:0;box-sizing:border-box;}";
  html += "body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;";
  html += "background:var(--bg-secondary);color:var(--text-primary);line-height:1.47;}";
  html += ".header{background:var(--bg-primary);border-bottom:0.5px solid var(--separator-non-opaque);";
  html += "padding:1.5rem 0;text-align:center;}";
  html += ".header-icon{width:40px;height:40px;background:linear-gradient(135deg,var(--system-blue),var(--system-green));";
  html += "border-radius:var(--radius-medium);display:inline-flex;align-items:center;justify-content:center;";
  html += "font-size:20px;color:white;margin-bottom:0.5rem;}";
  html += ".header h1{font-size:24px;font-weight:700;margin-bottom:4px;}";
  html += ".header-subtitle{font-size:14px;color:var(--text-secondary);}";
  html += ".container{max-width:480px;margin:0 auto;padding:2rem 1rem;}";
  html += ".card{background:var(--bg-primary);border-radius:var(--radius-large);padding:1.5rem;";
  html += "margin-bottom:1.5rem;box-shadow:var(--shadow-2);border:0.5px solid var(--separator-non-opaque);}";
  html += ".card-header{display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem;}";
  html += ".card-icon{width:24px;height:24px;background:var(--bg-quaternary);border-radius:var(--radius-small);";
  html += "display:flex;align-items:center;justify-content:center;font-size:14px;}";
  html += ".card h3{font-size:17px;font-weight:600;}";
  html += ".status-badge{padding:0.25rem 0.75rem;border-radius:12px;font-size:12px;font-weight:600;}";
  html += ".status-assigned{background:var(--system-green);color:white;}";
  html += ".status-unassigned{background:var(--system-gray5);color:var(--text-secondary);}";
  html += ".form-group{margin-bottom:1rem;}";
  html += ".form-label{font-size:13px;font-weight:600;margin-bottom:0.5rem;display:block;}";
  html += ".form-input{background:var(--bg-primary);border:1px solid var(--separator-opaque);";
  html += "border-radius:var(--radius-small);padding:0.625rem 0.75rem;font-size:14px;width:100%;";
  html += "transition:all 0.2s ease;}";
  html += ".form-input:focus{outline:none;border-color:var(--system-blue);";
  html += "box-shadow:0 0 0 3px rgba(0,122,255,0.1);}";
  html += ".btn{border:none;padding:0.75rem 1.25rem;border-radius:var(--radius-medium);";
  html += "font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s ease;width:100%;margin-bottom:0.75rem;}";
  html += ".btn-primary{background:var(--system-blue);color:white;}";
  html += ".btn-primary:hover{background:rgba(0,122,255,0.85);}";
  html += ".btn-danger{background:var(--system-red);color:white;}";
  html += ".btn-danger:hover{background:rgba(255,59,48,0.85);}";
  html += ".info-list{list-style:none;padding:0;}";
  html += ".info-list li{padding:0.5rem 0;border-bottom:0.5px solid var(--separator-non-opaque);";
  html += "font-size:14px;color:var(--text-secondary);}";
  html += ".info-list li:last-child{border-bottom:none;}";
  html += "</style></head><body>";
  html += "<div class='header'><div class='header-icon'>🎯</div>";
  html += "<h1>Source Assignment</h1>";
  html += "<div class='header-subtitle'>Configure tally source</div></div>";
  html += "<div class='container'>";
  html += "<div class='card'><div class='card-header'><div class='card-icon'>📊</div>";
  html += "<h3>Current Assignment</h3></div>";
  if (isAssigned && assignedSource.length() > 0) {
    html += "<div class='status-badge status-assigned'>ASSIGNED</div>";
    
    // Show custom display name if set, otherwise show cleaned source name
    String displayName;
    if (customDisplayName.length() > 0) {
      displayName = customDisplayName;
      html += "<p style='margin-top:1rem;font-weight:600;'>Source: " + displayName + "</p>";
      html += "<p style='color:var(--text-secondary);font-size:12px;'>Custom Name (set via web portal)</p>";
      html += "<p style='color:var(--text-secondary);font-size:14px;'>ID: " + assignedSource + "</p>";
    } else if (assignedSourceName.length() > 0) {
      displayName = assignedSourceName;
      html += "<p style='margin-top:1rem;font-weight:600;'>Source: " + displayName + "</p>";
      html += "<p style='color:var(--text-secondary);font-size:14px;'>ID: " + assignedSource + "</p>";
    } else {
      displayName = cleanSourceName(assignedSource);
      html += "<p style='margin-top:1rem;font-weight:600;'>Source: " + displayName + "</p>";
      html += "<p style='color:var(--text-secondary);font-size:14px;'>ID: " + assignedSource + "</p>";
    }
  } else {
    html += "<div class='status-badge status-unassigned'>UNASSIGNED</div>";
    html += "<p style='margin-top:1rem;color:var(--text-secondary);'>No source assigned - device will show IDLE</p>";
  }
  html += "</div>";
  html += "<div class='card'><div class='card-header'><div class='card-icon'>⚙️</div>";
  html += "<h3>Manual Assignment</h3></div>";
  html += "<form action='/assign' method='post'>";
  html += "<div class='form-group'><label class='form-label'>Source ID</label>";
  html += "<input type='text' name='source_id' class='form-input' placeholder='obs-scene-Camera1 or vmix-input-1' value='" + assignedSource + "'></div>";
  html += "<div class='form-group'><label class='form-label'>Display Name (Optional)</label>";
  html += "<input type='text' name='source_name' class='form-input' placeholder='Camera 1' value='" + customDisplayName + "'></div>";
  html += "<button type='submit' class='btn btn-primary'>Assign Source</button></form>";
  html += "<button onclick='unassign()' class='btn btn-danger'>Unassign Device</button></div>";
  html += "<div class='card'><div class='card-header'><div class='card-icon'>💡</div>";
  html += "<h3>Instructions</h3></div><ul class='info-list'>";
  html += "<li>Enter a source ID from your video mixer (OBS/vMix)</li>";
  html += "<li>Examples: obs-scene-Camera1, obs-source-Webcam, vmix-input-1</li>";
  html += "<li>Use the admin panel to see available sources</li>";
  html += "<li>Changes are saved automatically to device memory</li>";
  html += "<li>Device shows IDLE/PREVIEW/LIVE based on mixer state</li>";
  html += "<li>Recording/Streaming status displayed when active</li></ul></div></div>";
  html += "<script>function unassign(){if(confirm('Unassign this device from its current source?')){";
  html += "fetch('/assign',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},";
  html += "body:'source_id=&source_name='}).then(()=>{alert('Device unassigned successfully.');location.reload();});}}</script>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
}

void handleStatus() {
  String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0\">";
  html += "<meta http-equiv='refresh' content='5'>";
  html += "<title>M5 Tally - Device Status</title>";
  html += "<style>";
  html += ":root{--system-blue:#007AFF;--system-green:#34C759;--system-red:#FF3B30;";
  html += "--system-orange:#FF9500;--bg-primary:#FFFFFF;--bg-secondary:#F2F2F7;";
  html += "--bg-quaternary:rgba(116,116,128,0.08);--text-primary:#000000;";
  html += "--text-secondary:rgba(60,60,67,0.6);--separator-non-opaque:rgba(60,60,67,0.36);";
  html += "--shadow-2:0 2px 10px rgba(0,0,0,0.08);--radius-small:6px;--radius-medium:10px;--radius-large:16px;}";
  html += "*{margin:0;padding:0;box-sizing:border-box;}";
  html += "body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;";
  html += "background:var(--bg-secondary);color:var(--text-primary);line-height:1.47;}";
  html += ".header{background:var(--bg-primary);border-bottom:0.5px solid var(--separator-non-opaque);";
  html += "padding:1.5rem 0;text-align:center;}";
  html += ".header-icon{width:40px;height:40px;background:linear-gradient(135deg,var(--system-green),var(--system-blue));";
  html += "border-radius:var(--radius-medium);display:inline-flex;align-items:center;justify-content:center;";
  html += "font-size:20px;color:white;margin-bottom:0.5rem;}";
  html += ".header h1{font-size:24px;font-weight:700;margin-bottom:4px;}";
  html += ".header-subtitle{font-size:14px;color:var(--text-secondary);}";
  html += ".container{max-width:480px;margin:0 auto;padding:2rem 1rem;}";
  html += ".card{background:var(--bg-primary);border-radius:var(--radius-large);padding:1.5rem;";
  html += "margin-bottom:1.5rem;box-shadow:var(--shadow-2);border:0.5px solid var(--separator-non-opaque);}";
  html += ".card-header{display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem;}";
  html += ".card-icon{width:24px;height:24px;background:var(--bg-quaternary);border-radius:var(--radius-small);";
  html += "display:flex;align-items:center;justify-content:center;font-size:14px;}";
  html += ".card h3{font-size:17px;font-weight:600;}";
  html += ".status-grid{display:grid;gap:0.75rem;}";
  html += ".status-item{background:var(--bg-quaternary);padding:1rem;border-radius:var(--radius-medium);";
  html += "display:flex;justify-content:space-between;align-items:center;}";
  html += ".status-label{font-size:14px;color:var(--text-secondary);font-weight:500;}";
  html += ".status-value{font-size:14px;color:var(--text-primary);font-weight:600;}";
  html += ".status-online{color:var(--system-green);}";
  html += ".status-recording{color:var(--system-red);}";
  html += ".status-streaming{color:var(--system-blue);}";
  html += ".refresh-notice{text-align:center;padding:1rem;background:var(--bg-quaternary);";
  html += "border-radius:var(--radius-medium);font-size:12px;color:var(--text-secondary);}";
  html += "</style></head><body>";
  html += "<div class='header'><div class='header-icon'>📊</div>";
  html += "<h1>Device Status</h1>";
  html += "<div class='header-subtitle'>Real-time monitoring</div></div>";
  html += "<div class='container'>";
  html += "<div class='card'><div class='card-header'><div class='card-icon'>🔧</div>";
  html += "<h3>Device Information</h3></div><div class='status-grid'>";
  html += "<div class='status-item'><span class='status-label'>Device Name</span>";
  html += "<span class='status-value'>" + device_name + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Device ID</span>";
  html += "<span class='status-value'>" + device_id + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Uptime</span>";
  html += "<span class='status-value'>" + String(millis() / 1000) + " seconds</span></div></div></div>";
  html += "<div class='card'><div class='card-header'><div class='card-icon'>📶</div>";
  html += "<h3>Network Status</h3></div><div class='status-grid'>";
  html += "<div class='status-item'><span class='status-label'>WiFi Network</span>";
  html += "<span class='status-value'>" + wifi_ssid + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>IP Address</span>";
  html += "<span class='status-value'>" + WiFi.localIP().toString() + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Hub Server</span>";
  html += "<span class='status-value'>" + hub_ip + ":" + String(hub_port) + "</span></div></div></div>";
  html += "<div class='card'><div class='card-header'><div class='card-icon'>🎯</div>";
  html += "<h3>Tally Status</h3></div><div class='status-grid'>";
  html += "<div class='status-item'><span class='status-label'>Assigned Source</span>";
  html += "<span class='status-value'>" + (assignedSource.length() > 0 ? assignedSource : "None") + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Current Source</span>";
  html += "<span class='status-value'>" + (currentSource.length() > 0 ? currentSource : "None") + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Program</span>";
  html += "<span class='status-value " + String(isProgram ? "status-recording" : "") + "'>" + String(isProgram ? "LIVE" : "OFF") + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Preview</span>";
  html += "<span class='status-value " + String(isPreview ? "status-online" : "") + "'>" + String(isPreview ? "ON" : "OFF") + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Recording</span>";
  html += "<span class='status-value " + String(isRecording ? "status-recording" : "") + "'>" + String(isRecording ? "REC" : "OFF") + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Streaming</span>";
  html += "<span class='status-value " + String(isStreaming ? "status-streaming" : "") + "'>" + String(isStreaming ? "STREAM" : "OFF") + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Last Update</span>";
  html += "<span class='status-value'>" + (lastTallyUpdate > 0 ? String((millis() - lastTallyUpdate) / 1000) + "s ago" : "Never") + "</span></div></div></div>";
  html += "<div class='refresh-notice'>🔄 Auto-refresh: This page refreshes every 5 seconds<br>";
  html += "Last updated: " + String(millis() / 1000) + " seconds since boot</div></div>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
}

void handleAssign() {
  String sourceId = server.arg("source_id");
  String sourceName = server.arg("source_name");
  
  sourceId.trim();
  sourceName.trim();
  
  if (sourceId.length() == 0) {
    assignedSource = "";
    customDisplayName = ""; // Clear custom display name on unassignment
    isAssigned = false;
    currentSource = "";
    isProgram = false;
    isPreview = false;
    isRecording = false;
    isStreaming = false;
    
    saveAssignment();
    
    Serial.println("Device unassigned via web interface");
    
    String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
    html += "<meta name='viewport' content='width=device-width, initial-scale=1.0\">";
    html += "<title>Device Unassigned</title>";
    html += "<style>";
    html += ":root{--system-red:#FF3B30;--bg-primary:#FFFFFF;--bg-secondary:#F2F2F7;";
    html += "--text-primary:#000000;--text-secondary:rgba(60,60,67,0.6);";
    html += "--shadow-2:0 2px 10px rgba(0,0,0,0.08);--radius-large:16px;}";
    html += "body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;";
    html += "background:var(--bg-secondary);margin:0;padding:2rem;text-align:center;}";
    html += ".container{max-width:480px;margin:0 auto;background:var(--bg-primary);";
    html += "padding:2rem;border-radius:var(--radius-large);box-shadow:var(--shadow-2);}";
    html += ".status-icon{width:60px;height:60px;background:var(--system-red);";
    html += "border-radius:50%;display:inline-flex;align-items:center;justify-content:center;";
    html += "font-size:30px;color:white;margin-bottom:1rem;}";
    html += "h1{color:var(--system-red);font-size:24px;font-weight:700;margin-bottom:1rem;}";
    html += "p{color:var(--text-secondary);margin-bottom:0.75rem;line-height:1.5;}";
    html += "</style></head><body>";
    html += "<div class='container'><div class='status-icon'>❌</div>";
    html += "<h1>Device Unassigned</h1>";
    html += "<p>This M5 Tally device is now unassigned.</p>";
    html += "<p>It will not show tally states until assigned to a source.</p>";
    html += "<p>Redirecting to sources page...</p></div>";
    html += "<script>setTimeout(()=>{window.location='/sources';},3000);</script>";
    html += "</body></html>";
    
    server.send(200, "text/html", html);
  } else {
    assignedSource = sourceId;
    isAssigned = true;
    
    // Save custom display name if provided via web portal
    if (sourceName.length() > 0) {
      customDisplayName = sourceName;
      currentSource = sourceName;
    } else {
      customDisplayName = ""; // Clear custom name if not provided
      currentSource = cleanSourceName(sourceId);
    }
    
    isProgram = false;
    isPreview = false;
    isRecording = false;
    isStreaming = false;
    
    saveAssignment();
    
    Serial.printf("Device assigned to source via web interface: %s\n", sourceId.c_str());
    
    String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
    html += "<meta name='viewport' content='width=device-width, initial-scale=1.0\">";
    html += "<title>Source Assigned</title>";
    html += "<style>";
    html += ":root{--system-green:#34C759;--bg-primary:#FFFFFF;--bg-secondary:#F2F2F7;";
    html += "--text-primary:#000000;--text-secondary:rgba(60,60,67,0.6);";
    html += "--shadow-2:0 2px 10px rgba(0,0,0,0.08);--radius-large:16px;}";
    html += "body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;";
    html += "background:var(--bg-secondary);margin:0;padding:2rem;text-align:center;}";
    html += ".container{max-width:480px;margin:0 auto;background:var(--bg-primary);";
    html += "padding:2rem;border-radius:var(--radius-large);box-shadow:var(--shadow-2);}";
    html += ".success-icon{width:60px;height:60px;background:var(--system-green);";
    html += "border-radius:50%;display:inline-flex;align-items:center;justify-content:center;";
    html += "font-size:30px;color:white;margin-bottom:1rem;}";
    html += "h1{color:var(--system-green);font-size:24px;font-weight:700;margin-bottom:1rem;}";
    html += "p{color:var(--text-secondary);margin-bottom:0.75rem;line-height:1.5;}";
    html += ".info{color:var(--text-primary);font-weight:600;font-size:18px;margin:1.5rem 0;}";
    html += "</style></head><body>";
    html += "<div class='container'><div class='success-icon'>✅</div>";
    html += "<h1>Source Assigned!</h1>";
    html += "<p>Device successfully assigned to:</p>";
    html += "<div class='info'>" + sourceId + "</div>";
    html += "<p>Assignment saved to device memory.</p>";
    html += "<p>Redirecting to sources page...</p></div>";
    html += "<script>setTimeout(()=>{window.location='/sources';},3000);</script>";
    html += "</body></html>";
    
    server.send(200, "text/html", html);
  }
}

void handleReset() {
  preferences.clear();
  
  String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0\">";
  html += "<title>Factory Reset</title>";
  html += "<style>";
  html += ":root{--system-red:#FF3B30;--bg-primary:#FFFFFF;--bg-secondary:#F2F2F7;";
  html += "--text-primary:#000000;--text-secondary:rgba(60,60,67,0.6);";
  html += "--shadow-2:0 2px 10px rgba(0,0,0,0.08);--radius-large:16px;}";
  html += "body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;";
  html += "background:var(--bg-secondary);margin:0;padding:2rem;text-align:center;}";
  html += ".container{max-width:480px;margin:0 auto;background:var(--bg-primary);";
  html += "padding:2rem;border-radius:var(--radius-large);box-shadow:var(--shadow-2);}";
  html += ".warning-icon{width:60px;height:60px;background:var(--system-red);";
  html += "border-radius:50%;display:inline-flex;align-items:center;justify-content:center;";
  html += "font-size:30px;color:white;margin-bottom:1rem;}";
  html += "h1{color:var(--system-red);font-size:24px;font-weight:700;margin-bottom:1rem;}";
  html += "p{color:var(--text-secondary);margin-bottom:0.75rem;line-height:1.5;}";
  html += "</style></head><body>";
  html += "<div class='container'><div class='warning-icon'>⚠️</div>";
  html += "<h1>Factory Reset Complete</h1>";
  html += "<p>All settings have been erased.</p>";
  html += "<p>Device will restart with default settings.</p>";
  html += "<p>This page will close automatically.</p></div>";
  html += "<script>setTimeout(()=>{window.close();},3000);</script>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
  
  Serial.println("Factory reset - clearing all preferences");
  delay(2000);
  ESP.restart();
}

void handleRestart() {
  String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0\">";
  html += "<title>Device Restart</title>";
  html += "<style>";
  html += ":root{--system-orange:#FF9500;--bg-primary:#FFFFFF;--bg-secondary:#F2F2F7;";
  html += "--text-primary:#000000;--text-secondary:rgba(60,60,67,0.6);";
  html += "--shadow-2:0 2px 10px rgba(0,0,0,0.08);--radius-large:16px;}";
  html += "body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;";
  html += "background:var(--bg-secondary);margin:0;padding:2rem;text-align:center;}";
  html += ".container{max-width:480px;margin:0 auto;background:var(--bg-primary);";
  html += "padding:2rem;border-radius:var(--radius-large);box-shadow:var(--shadow-2);}";
  html += ".restart-icon{width:60px;height:60px;background:var(--system-orange);";
  html += "border-radius:50%;display:inline-flex;align-items:center;justify-content:center;";
  html += "font-size:30px;color:white;margin-bottom:1rem;}";
  html += "h1{color:var(--system-orange);font-size:24px;font-weight:700;margin-bottom:1rem;}";
  html += "p{color:var(--text-secondary);margin-bottom:0.75rem;line-height:1.5;}";
  html += "</style></head><body>";
  html += "<div class='container'><div class='restart-icon'>🔄</div>";
  html += "<h1>Device Restarting</h1>";
  html += "<p>The M5 Tally device is restarting now.</p>";
  html += "<p>This page will close automatically.</p></div>";
  html += "<script>setTimeout(()=>{window.close();},2000);</script>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
  
  Serial.println("Manual restart requested via web interface");
  delay(1000);
  ESP.restart();
}

String cleanSourceName(String sourceName) {
  String cleaned = sourceName;
  
  // Use the same cleaning logic as Web Tally and backend
  if (cleaned.startsWith("Source obs-scene-")) {
    cleaned = cleaned.substring(17); // Remove "Source obs-scene-"
  } else if (cleaned.startsWith("Source obs-source-")) {
    cleaned = cleaned.substring(18); // Remove "Source obs-source-"
  } else {
    // Fallback for other formats - remove common prefixes
    if (cleaned.startsWith("obs-scene-")) {
      cleaned = cleaned.substring(10);
    } else if (cleaned.startsWith("obs-source-")) {
      cleaned = cleaned.substring(11);
    } else if (cleaned.startsWith("vmix-input-")) {
      cleaned = cleaned.substring(11);
    } else if (cleaned.startsWith("vmix-scene-")) {
      cleaned = cleaned.substring(11);
    }
  }
  
  return cleaned;
}

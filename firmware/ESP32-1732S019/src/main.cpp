/*
 * ESP32-1732S019 Tally Light for Tally Hub
 * Based on kingson87/OBS-Tally configuration
 * 
 * Hardware: ESP32-1732S019 (ESP32-S3, 1.9" 170x320 Display)
 * Display: ST7789 with 8-bit parallel interface
 * 
 * Features:
 * - WiFi configuration portal
 * - UDP communication with Tally Hub
 * - Real-time tally status display
 * - Device registration and heartbeat
 * - Web server for configuration
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <TFT_eSPI.h>
#include <WiFiManager.h>

// Firmware version
#define FIRMWARE_VERSION "1.0.0"
#define DEVICE_MODEL "ESP32-1732S019"

// Display configuration - Based on kingson87 project
#define SCREEN_WIDTH 320
#define SCREEN_HEIGHT 170
#define TFT_ROTATION 3

// Pin definitions (for ESP32-1732S019)
#define BACKLIGHT_PIN 38
#define BOOT_BUTTON_PIN 0

// Color definitions - Updated to match kingson87 project
#define COLOR_BLACK     0x0000
#define COLOR_WHITE     0xFFFF
#define COLOR_RED       0xF800
#define COLOR_GREEN     0x07E0
#define COLOR_BLUE      0x001F
#define COLOR_YELLOW    0xFFE0
#define COLOR_ORANGE    0xFD20    // #ff9500 - Preview color
#define COLOR_PURPLE    0x780F
#define COLOR_CYAN      0x07FF
#define COLOR_MAGENTA   0xF81F
#define COLOR_GRAY      0x8410    // #8e8e93 - Idle color
#define COLOR_DARK_GRAY 0x4208
#define COLOR_LIVE_RED  0xF800    // #ff3b30 - Live color
#define COLOR_PREVIEW_ORANGE 0xFD20  // #ff9500 - Preview orange
#define COLOR_IDLE_GRAY 0x8410    // #8e8e93 - Idle gray

// Global objects
TFT_eSPI tft = TFT_eSPI();
WebServer server(80);
WiFiUDP udp;
Preferences preferences;
WiFiManager wifiManager;

// Configuration variables
String deviceName = "ESP32 Tally Light";
String deviceID = "tally-";
String macAddress = "";
String ipAddress = "";
String hubIP = "192.168.0.216";
int hubPort = 7411;
String assignedSource = "";
String assignedSourceName = ""; // The human-readable name of the assigned source
String currentSource = ""; // Current source display name (cleaned)
String customDisplayName = ""; // Custom display name set via web portal
String currentStatus = "INIT";
bool isConnected = false;
bool isRegisteredWithHub = false;
bool isAssigned = false;

// Tally states
bool isProgram = false;
bool isPreview = false;
bool isRecording = false;
bool isStreaming = false;

// Timing and hub connection variables
unsigned long lastHeartbeat = 0;
unsigned long lastDisplayUpdate = 0;
unsigned long bootTime = 0;
unsigned long lastHubResponse = 0;
unsigned long hubConnectionAttempts = 0;
unsigned long lastReconnectionAttempt = 0;
unsigned long lastWiFiCheck = 0;
unsigned long lastUDPRestart = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000;
const unsigned long WIFI_CHECK_INTERVAL = 5000; // Check WiFi every 5 seconds (improved from 30s)
const unsigned long UDP_RESTART_INTERVAL = 600000; // Restart UDP every 10 minutes (reduced frequency)
// Removed DISPLAY_UPDATE_INTERVAL; display updates are now event-driven like M5Stick
const unsigned long HUB_TIMEOUT = 60000; // 60 seconds timeout (increased from 15s)
const unsigned long MAX_HUB_RECONNECT_ATTEMPTS = 5;
const unsigned long MIN_RECONNECTION_INTERVAL = 15000; // 15 seconds between attempts
const unsigned long CONNECTION_CHECK_INTERVAL = 2000; // Check connection every 2 seconds
const unsigned long DISCONNECTED_DISPLAY_DELAY = 1000; // Show disconnected after 1 second

// Registration status display
bool showingRegistrationStatus = false;
unsigned long registrationStatusStart = 0;
String registrationStatusMessage = "";
uint16_t registrationStatusColor = COLOR_GREEN;

// Assignment confirmation display
bool showingAssignmentConfirmation = false;
unsigned long assignmentConfirmationStart = 0;
String confirmationSourceName = "";
bool confirmationIsAssigned = false;

// Function declarations
void setupDisplay();
void setupWiFi();
void setupWebServer();
void loadConfiguration();
void saveConfiguration();
void registerDevice();
void sendHeartbeat();
void handleUDPMessages();
void updateDisplay();
void updateStatus(const String& status);
void showStatus(const String& status, uint16_t bgColor, uint16_t textColor = COLOR_WHITE);
void showBootScreen();
void handleRoot();
void handleConfig();
void handleSave();
void handleSources();
void handleStatus();
void handleAssign();
void handleUnassign();
void handleSaveDisplayName();
void handleReset();
void handleRestart();
void handleNotFound();
String formatUptime();
String cleanSourceName(String sourceName);
void checkButtonForWiFiReset();
void reconnectWiFi();
void restartUDP();
void checkWiFiConnection();
void ensureUDPConnection();

// --- Button press tracking for WiFi reset ---
unsigned long buttonPressStart = 0;
bool buttonWasPressed = false;
const unsigned long WIFI_RESET_HOLD_TIME = 5000; // 5 seconds

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== ESP32-1732S019 Tally Light v" + String(FIRMWARE_VERSION) + " ===");
  Serial.println("Device Model: " + String(DEVICE_MODEL));
  Serial.println("Starting clean boot...\n");
  bootTime = millis();
  // Initialize display first
  setupDisplay();
  showBootScreen();
  // Generate device ID from MAC address
  macAddress = WiFi.macAddress();
  deviceID = "tally-" + macAddress;
  deviceID.replace(":", "");
  deviceID.toLowerCase();
  Serial.println("Device ID: " + deviceID);
  Serial.println("MAC Address: " + macAddress);
  // Load saved configuration
  loadConfiguration();
  // Setup WiFi connection
  setupWiFi();
  // Setup network services
  if (WiFi.status() == WL_CONNECTED) {
    ipAddress = WiFi.localIP().toString();
    Serial.println("IP Address: " + ipAddress);
    setupWebServer();
    // Start UDP - use same port as hub for both sending and receiving
    if (udp.begin(7411)) {
      Serial.println("UDP started on port 7411");
    } else {
      Serial.println("Failed to start UDP");
    }
    // Don't set isConnected here - wait for hub registration confirmation
    // Initialize lastHubResponse to current time for initial connection attempts
    lastHubResponse = millis();
    registerDevice();
    updateStatus("READY");
  } else {
    updateStatus("NO_WIFI");
  }
  delay(1000);
}

void checkHubConnection() {
  // Only check if we're connected to WiFi
  if (WiFi.status() != WL_CONNECTED) {
    if (isConnected || isRegisteredWithHub) {
      Serial.println("WiFi lost - marking as disconnected");
      isConnected = false;
      isRegisteredWithHub = false;
      updateStatus("NO_WIFI");
    }
    return;
  }
  
  // If we're not registered with hub, try to connect/reconnect
  if (!isRegisteredWithHub) {
    // Don't attempt reconnection too frequently
    unsigned long timeSinceLastAttempt = millis() - lastReconnectionAttempt;
    if (timeSinceLastAttempt < MIN_RECONNECTION_INTERVAL) {
      return; // Not enough time passed, skip this attempt
    }
    
    // Don't attempt reconnection too frequently or indefinitely
    if (hubConnectionAttempts < MAX_HUB_RECONNECT_ATTEMPTS) {
      hubConnectionAttempts++;
      lastReconnectionAttempt = millis();
      Serial.printf("Attempting hub connection/reconnection (attempt %lu/%lu)\n", hubConnectionAttempts, MAX_HUB_RECONNECT_ATTEMPTS);
      
      showingRegistrationStatus = true;
      registrationStatusStart = millis();
      registrationStatusMessage = "Connecting...";
      registrationStatusColor = COLOR_YELLOW;
      
      // Attempt to register with the hub
      delay(1000); // Brief delay before attempting connection
      registerDevice();
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
      registrationStatusColor = COLOR_RED;
      
      isConnected = false;
      isRegisteredWithHub = false;
      
      // Continue trying with longer delays
      delay(10000); // Wait 10 seconds before next attempt
      Serial.println("Attempting slow reconnection...");
      registerDevice();
      // Don't reset lastHubResponse here - only reset when we get an actual response
    }
    return;
  }
  
  // If we're registered, check for timeout
  unsigned long timeSinceLastResponse = millis() - lastHubResponse;
  if (timeSinceLastResponse > HUB_TIMEOUT) {
    // Don't attempt reconnection too frequently
    unsigned long timeSinceLastAttempt = millis() - lastReconnectionAttempt;
    if (timeSinceLastAttempt < MIN_RECONNECTION_INTERVAL) {
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
      registrationStatusColor = COLOR_RED;
      
      // Wait 2 seconds to show HUB LOST status, then attempt reconnection
      delay(2000);
      
      showingRegistrationStatus = true;
      registrationStatusStart = millis();
      registrationStatusMessage = "Reconnecting...";
      registrationStatusColor = COLOR_YELLOW;
      
      // Attempt to re-register with the hub (don't restart UDP unnecessarily)
      delay(1000); // Brief delay before attempting reconnection
      
      registerDevice();
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
      registrationStatusColor = COLOR_RED;
      
      isConnected = false;
      isRegisteredWithHub = false;
      
      // Continue trying with longer delays
      delay(10000); // Wait 10 seconds before next attempt
      Serial.println("Attempting slow reconnection...");
      registerDevice();
      // Don't reset lastHubResponse here - only reset when we get an actual response
    }
  }
}

// Fast connection monitoring function
void monitorConnectionStatus() {
  static unsigned long lastConnectionCheck = 0;
  
  if (millis() - lastConnectionCheck > CONNECTION_CHECK_INTERVAL) {
    // Quick WiFi check
    if (WiFi.status() != WL_CONNECTED) {
      if (isConnected || isRegisteredWithHub) {
        Serial.println("WiFi disconnected - immediate detection!");
        isConnected = false;
        isRegisteredWithHub = false;
        updateStatus("NO_WIFI");
        updateDisplay(); // Force immediate display update
      }
    }
    
    // Quick hub connection check
    if (WiFi.status() == WL_CONNECTED && (isConnected || isRegisteredWithHub)) {
      unsigned long timeSinceLastResponse = millis() - lastHubResponse;
      if (timeSinceLastResponse > HUB_TIMEOUT) {
        Serial.println("Hub timeout detected in monitor - immediate response!");
        isConnected = false;
        isRegisteredWithHub = false;
        updateStatus("HUB_LOST");
        updateDisplay(); // Force immediate display update
      }
    }
    
    lastConnectionCheck = millis();
  }
}

void loop() {
  // --- Button handler for WiFi reset ---
  checkButtonForWiFiReset();

  // FAST connection monitoring - every 2 seconds
  monitorConnectionStatus();

  // Check WiFi connection periodically and attempt reconnection
  if (millis() - lastWiFiCheck > WIFI_CHECK_INTERVAL) {
    checkWiFiConnection();
    lastWiFiCheck = millis();
  }

  // Handle WiFi connection loss
  if (WiFi.status() != WL_CONNECTED) {
    if (isConnected || isRegisteredWithHub) {
      Serial.println("WiFi connection lost, resetting hub connection");
      isConnected = false;
      isRegisteredWithHub = false;
    }
    updateStatus("NO_WIFI");
    delay(1000);
    return;
  }

  // Ensure UDP connection is working periodically (less aggressive)
  if (millis() - lastUDPRestart > UDP_RESTART_INTERVAL) {
    Serial.println("Periodic UDP restart for stability");
    restartUDP();
    lastUDPRestart = millis();
  }
  
  // Reduce UDP health check frequency
  static unsigned long lastUDPHealthCheck = 0;
  if (millis() - lastUDPHealthCheck > 300000) { // Check every 5 minutes
    ensureUDPConnection();
    lastUDPHealthCheck = millis();
  }

  // Handle web server
  server.handleClient();

  // Handle UDP messages
  handleUDPMessages();

  // Check hub connection and attempt reconnection if needed
  checkHubConnection();

  // Send heartbeat only if we think we're connected
  if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }

  // Update display only on meaningful state changes or every 30 seconds
  static bool lastProgram = false;
  static bool lastPreview = false;
  static bool lastRecording = false;
  static bool lastStreaming = false;
  static String lastAssignedSource = "";
  static String lastCurrentSource = "";
  static String lastCustomDisplayName = "";
  static String lastStatus = "";
  static bool lastIsAssigned = false;
  static bool lastIsConnected = false;
  static bool lastIsRegisteredWithHub = false;
  
  // Longer display interval to reduce flicker - only update every 30 seconds if no state changes
  unsigned long displayInterval = 30000; // 30 seconds instead of 3
  
  bool stateChanged = (isProgram != lastProgram) || (isPreview != lastPreview) || 
                     (isRecording != lastRecording) || (isStreaming != lastStreaming) || 
                     (assignedSource != lastAssignedSource) || (currentSource != lastCurrentSource) || 
                     (customDisplayName != lastCustomDisplayName) || (currentStatus != lastStatus) || 
                     (isAssigned != lastIsAssigned) || (isConnected != lastIsConnected) || 
                     (isRegisteredWithHub != lastIsRegisteredWithHub);
  
  // Only update display on meaningful state changes or after long interval
  if (stateChanged || (millis() - lastDisplayUpdate > displayInterval)) {
    updateDisplay();
    lastDisplayUpdate = millis();
    lastProgram = isProgram;
    lastPreview = isPreview;
    lastRecording = isRecording;
    lastStreaming = isStreaming;
    lastAssignedSource = assignedSource;
    lastCurrentSource = currentSource;
    lastCustomDisplayName = customDisplayName;
    lastStatus = currentStatus;
    lastIsAssigned = isAssigned;
    lastIsConnected = isConnected;
    lastIsRegisteredWithHub = isRegisteredWithHub;
  }

  delay(50);
}
// --- Button handler for WiFi config reset (long press) ---
void checkButtonForWiFiReset() {
  int buttonState = digitalRead(BOOT_BUTTON_PIN);
  if (buttonState == LOW) { // Button pressed (active low)
    if (!buttonWasPressed) {
      buttonPressStart = millis();
      buttonWasPressed = true;
    } else if (millis() - buttonPressStart > WIFI_RESET_HOLD_TIME) {
      // Long press detected
      tft.fillScreen(COLOR_RED);
      tft.setTextColor(COLOR_WHITE);
      tft.setTextSize(2);
      tft.setCursor(30, SCREEN_HEIGHT / 2 - 20);
      tft.print("WiFi RESET!");
      tft.setTextSize(1);
      tft.setCursor(30, SCREEN_HEIGHT / 2 + 10);
      tft.print("Erasing WiFi config...");
      delay(1000);
      wifiManager.resetSettings();
      preferences.begin("tally", false);
      preferences.clear();
      preferences.end();
      delay(500);
      ESP.restart();
    }
  } else {
    buttonWasPressed = false;
  }
}

void setupDisplay() {
  tft.init();
  tft.setRotation(TFT_ROTATION);
  tft.fillScreen(COLOR_BLACK);
  
  pinMode(BACKLIGHT_PIN, OUTPUT);
  digitalWrite(BACKLIGHT_PIN, HIGH);
  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);
  
  Serial.println("Display initialized");
}

void setupWiFi() {
  // Configure WiFi for better stability
  WiFi.mode(WIFI_STA);
  WiFi.setAutoConnect(true);
  WiFi.setAutoReconnect(true);
  
  // Set WiFi power management for better stability
  WiFi.setSleep(WIFI_PS_NONE); // Disable WiFi sleep for stable connection (more explicit)
  WiFi.setTxPower(WIFI_POWER_19_5dBm); // Set max WiFi power for stability
  
  wifiManager.setAPCallback([](WiFiManager *myWiFiManager) {
    Serial.println("[WiFiManager] Entered AP mode");
    tft.fillScreen(COLOR_ORANGE);
    tft.setTextColor(COLOR_WHITE);
    tft.setTextSize(2);
    tft.setCursor(20, SCREEN_HEIGHT / 2 - 20);
    tft.print("AP MODE");
    tft.setTextSize(1);
    tft.setCursor(20, SCREEN_HEIGHT / 2 + 10);
    tft.print("Connect to setup WiFi");
  });

  wifiManager.setSaveConfigCallback([]() {
    Serial.println("[WiFiManager] Config saved");
    tft.fillScreen(COLOR_GREEN);
    tft.setTextColor(COLOR_WHITE);
    tft.setTextSize(2);
    tft.setCursor(20, SCREEN_HEIGHT / 2 - 20);
    tft.print("WiFi Saved");
    delay(1000);
  });

  // Set custom AP name
  String apName = "TallyLight-" + deviceID.substring(6, 12);

  // Set timeout for connection attempts
  wifiManager.setConnectTimeout(30); // 30 seconds
  wifiManager.setConfigPortalTimeout(300); // 5 minutes for config portal

  // If no credentials, force AP mode
  wifiManager.setBreakAfterConfig(true); // Don't auto-reboot after config
  bool connected = wifiManager.autoConnect(apName.c_str());
  if (!connected) {
    Serial.println("[WiFiManager] Failed to connect or no credentials. Starting AP mode.");
    tft.fillScreen(COLOR_RED);
    tft.setTextColor(COLOR_WHITE);
    tft.setTextSize(2);
    tft.setCursor(20, SCREEN_HEIGHT / 2 - 20);
    tft.print("WiFi Failed");
    tft.setTextSize(1);
    tft.setCursor(20, SCREEN_HEIGHT / 2 + 10);
    tft.print("AP Mode for setup");
    delay(2000);
    // Stay in AP mode for config
    // Optionally, could restart or loop forever here
  } else {
    Serial.println("WiFi connected!");
    Serial.println("IP address: " + WiFi.localIP().toString());
    
    // No additional WiFi settings here - already set above
  }
}

void setupWebServer() {
  server.on("/", handleRoot);
  server.on("/config", handleConfig);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/sources", handleSources);
  server.on("/assign", HTTP_POST, handleAssign);
  server.on("/unassign", HTTP_POST, handleUnassign);
  server.on("/save_display_name", HTTP_POST, handleSaveDisplayName);
  server.on("/reset", HTTP_POST, handleReset);
  server.on("/restart", HTTP_POST, handleRestart);
  server.on("/status", handleStatus);
  server.onNotFound(handleNotFound);
  
  server.begin();
  Serial.println("HTTP server started");
}

void loadConfiguration() {
  preferences.begin("tally", false);
  deviceName = preferences.getString("deviceName", "ESP32 Tally Light");
  hubIP = preferences.getString("hubIP", "192.168.0.216");
  hubPort = preferences.getInt("hubPort", 7411);
  assignedSource = preferences.getString("assignedSource", "");
  assignedSourceName = preferences.getString("assignedSourceName", "");
  customDisplayName = preferences.getString("customDisplayName", "");
  preferences.end();
  
  // Set assignment status based on loaded configuration
  isAssigned = (assignedSource.length() > 0);
  
  Serial.println("Configuration loaded:");
  Serial.println("  Device Name: " + deviceName);
  Serial.println("  Hub IP: " + hubIP);
  Serial.println("  Hub Port: " + String(hubPort));
  Serial.println("  Assigned Source: " + (assignedSource.length() > 0 ? assignedSource : "None"));
  Serial.println("  Assigned Source Name: " + (assignedSourceName.length() > 0 ? assignedSourceName : "None"));
  Serial.println("  Custom Display Name: " + (customDisplayName.length() > 0 ? customDisplayName : "None"));
  Serial.println("  Is Assigned: " + String(isAssigned ? "YES" : "NO"));
}

void saveConfiguration() {
  preferences.begin("tally", false);
  preferences.putString("deviceName", deviceName);
  preferences.putString("hubIP", hubIP);
  preferences.putInt("hubPort", hubPort);
  preferences.putString("assignedSource", assignedSource);
  preferences.putString("assignedSourceName", assignedSourceName);
  preferences.putString("customDisplayName", customDisplayName);
  preferences.end();
  Serial.println("Configuration saved");
}

void registerDevice() {
  // Check WiFi connection instead of isConnected
  if (WiFi.status() != WL_CONNECTED) return;
  
  // Ensure UDP is working before registration
  ensureUDPConnection();
  
  JsonDocument doc;
  doc["type"] = "register";
  doc["deviceId"] = deviceID;
  doc["deviceName"] = deviceName;
  doc["deviceType"] = "esp32-1732s019";
  doc["model"] = DEVICE_MODEL;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["ip"] = ipAddress;
  doc["mac"] = macAddress;
  doc["wifiRSSI"] = WiFi.RSSI();
  doc["freeHeap"] = ESP.getFreeHeap();
  
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
  
  int result = udp.beginPacket(hubIP.c_str(), hubPort);
  if (result == 1) {
    udp.print(message);
    int endResult = udp.endPacket();
    if (endResult == 1) {
      Serial.println("Device registration sent successfully");
    } else {
      Serial.println("Registration failed on endPacket, restarting UDP...");
      restartUDP();
    }
  } else {
    Serial.println("Registration failed on beginPacket, restarting UDP...");
    restartUDP();
  }
  // Don't set isRegistered here - wait for hub confirmation
}

void sendHeartbeat() {
  // Only send heartbeat if we're connected to WiFi and registered with hub
  if (!isRegisteredWithHub) return;
  
  // Ensure UDP is working before sending heartbeat
  ensureUDPConnection();
  
  JsonDocument doc;
  doc["type"] = "heartbeat";
  doc["deviceId"] = deviceID;
  doc["uptime"] = millis() - bootTime;
  doc["status"] = currentStatus;
  doc["assignedSource"] = assignedSource;
  doc["wifiRSSI"] = WiFi.RSSI();
  doc["freeHeap"] = ESP.getFreeHeap();
  
  String message;
  serializeJson(doc, message);
  
  int result = udp.beginPacket(hubIP.c_str(), hubPort);
  if (result == 1) {
    udp.print(message);
    int endResult = udp.endPacket();
    if (endResult == 1) {
      Serial.println("Heartbeat sent successfully");
    } else {
      Serial.println("Heartbeat failed on endPacket, restarting UDP...");
      restartUDP();
    }
  } else {
    Serial.println("Heartbeat failed on beginPacket, restarting UDP...");
    restartUDP();
  }
}

void handleUDPMessages() {
  int packetSize = udp.parsePacket();
  if (packetSize == 0) return;

  char incomingPacket[512];
  int len = udp.read(incomingPacket, 511);
  if (len > 0) {
    incomingPacket[len] = 0;
  }

  Serial.printf("Received UDP packet: %s\n", incomingPacket);

  // Any message from hub resets lastHubResponse and connection attempts
  lastHubResponse = millis();
  hubConnectionAttempts = 0;

  JsonDocument doc;
  if (deserializeJson(doc, incomingPacket) != DeserializationError::Ok) {
    Serial.println("Failed to parse JSON");
    return;
  }

  String type = doc["type"];

  if (type == "tally") {
    // Check if message has a data object like the M5Stick expects
    if (doc["data"].is<JsonObject>()) {
      JsonObject data = doc["data"];
      String sourceId = data["id"];
      String sourceName = data["name"];
      bool program = data["program"];
      bool preview = data["preview"];
      bool recording = data["recording"] | false;
      bool streaming = data["streaming"] | false;

      // Only update if this is for our assigned source and we're actually assigned
      if (isAssigned && assignedSource.length() > 0 && sourceId == assignedSource) {
        isProgram = program;
        isPreview = preview;
        isRecording = recording;
        isStreaming = streaming;
        
        // Only update currentSource if no custom display name is set
        if (customDisplayName.length() == 0) {
          currentSource = cleanSourceName(sourceName); // Clean the source name for display
        }
        
        if (program) {
          updateStatus("LIVE");
        } else if (preview) {
          updateStatus("PREVIEW");
        } else {
          updateStatus("IDLE");
        }
        
        Serial.printf("Tally update (nested): Program=%s, Preview=%s, Recording=%s, Streaming=%s\n",
                      program ? "YES" : "NO", preview ? "YES" : "NO",
                      recording ? "YES" : "NO", streaming ? "YES" : "NO");
      }
    } else {
      // Legacy format without data object
      String sourceId = doc["sourceId"];
      bool program = doc["program"];
      bool preview = doc["preview"];
      bool recording = doc["recording"] | false;
      bool streaming = doc["streaming"] | false;

      // Only update if this is for our assigned source and we're actually assigned
      if (isAssigned && assignedSource.length() > 0 && sourceId == assignedSource) {
        isProgram = program;
        isPreview = preview;
        isRecording = recording;
        isStreaming = streaming;

        if (program) {
          updateStatus("LIVE");
        } else if (preview) {
          updateStatus("PREVIEW");
        } else {
          updateStatus("IDLE");
        }

        Serial.printf("Tally update (legacy): Program=%s, Preview=%s, Recording=%s, Streaming=%s\n",
                      program ? "YES" : "NO", preview ? "YES" : "NO",
                      recording ? "YES" : "NO", streaming ? "YES" : "NO");
      }
    }
  } else if (type == "assignment") {
    if (doc["data"].is<JsonObject>()) {
      // M5Stick format with nested data
      JsonObject data = doc["data"];
      String newSource = data["sourceId"];
      String sourceName = data["sourceName"];
      String mode = data["mode"];
      
      Serial.printf("Assignment update - Mode: %s, Source: %s\n", mode.c_str(), sourceName.c_str());

      if (mode == "assigned") {
        assignedSource = newSource;
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
        
        saveConfiguration();
        
        showingAssignmentConfirmation = true;
        assignmentConfirmationStart = millis();
        confirmationSourceName = cleanSourceName(sourceName);
        confirmationIsAssigned = true;
        
        // Clear tally states when assignment changes
        isProgram = false;
        isPreview = false;
        isRecording = false;
        isStreaming = false;
        
        Serial.println("Assignment updated to: " + assignedSource + " (" + sourceName + ")");
      } else {
        // Unassigned
        assignedSource = "";
        assignedSourceName = "";
        currentSource = ""; // Clear current source display name
        customDisplayName = ""; // Clear custom display name on unassignment
        isAssigned = false;
        saveConfiguration();
        
        showingAssignmentConfirmation = true;
        assignmentConfirmationStart = millis();
        confirmationSourceName = "";
        confirmationIsAssigned = false;
        
        // Clear tally states when unassigned
        isProgram = false;
        isPreview = false;
        isRecording = false;
        isStreaming = false;
        
        Serial.println("Device unassigned");
      }
    } else {
      // Legacy format without data
      String newSource = doc["sourceId"];
      if (newSource != assignedSource) {
        if (newSource.length() > 0) {
          assignedSource = newSource;
          isAssigned = true;
          saveConfiguration();
          
          showingAssignmentConfirmation = true;
          assignmentConfirmationStart = millis();
          confirmationSourceName = cleanSourceName(newSource);
          confirmationIsAssigned = true;
          
          Serial.println("Assignment updated to: " + assignedSource);
        } else {
          assignedSource = "";
          isAssigned = false;
          saveConfiguration();
          
          showingAssignmentConfirmation = true;
          assignmentConfirmationStart = millis();
          confirmationSourceName = "";
          confirmationIsAssigned = false;
          
          Serial.println("Device unassigned");
        }
        
        // Clear tally states when assignment changes
        isProgram = false;
        isPreview = false;
        isRecording = false;
        isStreaming = false;
      }
    }
  } else if (type == "register_required") {
    Serial.println("Hub requested registration, re-sending registration...");
    showingRegistrationStatus = true;
    registrationStatusStart = millis();
    registrationStatusMessage = "Re-register";
    registrationStatusColor = COLOR_YELLOW;
    registerDevice();
  } else if (type == "registered") {
    Serial.println("Registration confirmed by hub");
    isRegisteredWithHub = true;
    hubConnectionAttempts = 0; // Reset reconnection attempts
    // Don't set READY status if device is already assigned - maintain current tally status
    if (!isAssigned || assignedSource.length() == 0) {
      updateStatus("READY");
    }
    showingRegistrationStatus = true;
    registrationStatusStart = millis();
    registrationStatusMessage = "Connected";
    registrationStatusColor = COLOR_GREEN;
  } else if (type == "heartbeat_ack") {
    Serial.println("Heartbeat acknowledged");
    hubConnectionAttempts = 0; // Reset reconnection attempts on successful communication
    // No display update needed - heartbeat ack should not change display state
  }
}

void updateDisplay() {
  // Show assignment confirmation if needed
  if (showingAssignmentConfirmation) {
    if (millis() - assignmentConfirmationStart < 2000) { // Show for 2 seconds
      if (confirmationIsAssigned) {
        showStatus("ASSIGNED", COLOR_GREEN);
        // Show source name below
        tft.setTextColor(COLOR_WHITE);
        tft.setTextSize(2);
        int16_t x = (SCREEN_WIDTH - (confirmationSourceName.length() * 12)) / 2;
        int16_t y = SCREEN_HEIGHT / 2 + 10;
        tft.setCursor(x, y);
        tft.print(confirmationSourceName);
      } else {
        showStatus("UNASSIGNED", COLOR_RED);
      }
      return;
    } else {
      showingAssignmentConfirmation = false;
    }
  }

  // Show registration/reconnection status if needed
  if (showingRegistrationStatus) {
    unsigned long displayDuration = (registrationStatusMessage == "Re-register") ? 500 : 1000;
    if (millis() - registrationStatusStart < displayDuration) {
      showStatus(registrationStatusMessage, registrationStatusColor);
      return;
    } else {
      showingRegistrationStatus = false;
    }
  }

  uint16_t bgColor, textColor;
  String statusText;

  // Enhanced status determination with clearer disconnection states
  if (WiFi.status() != WL_CONNECTED) {
    bgColor = COLOR_RED;
    textColor = COLOR_WHITE;
    statusText = "NO WIFI";
  } else if (!isRegisteredWithHub) {
    // Check if we've been trying to connect for a while
    unsigned long timeSinceLastResponse = millis() - lastHubResponse;
    if ((timeSinceLastResponse > HUB_TIMEOUT && lastHubResponse > 0) || 
        (lastHubResponse == 0 && millis() > 30000)) { // Show HUB LOST after 30 seconds if never connected
      bgColor = COLOR_RED;
      textColor = COLOR_WHITE;
      statusText = "HUB LOST";
    } else {
      bgColor = COLOR_BLUE;
      textColor = COLOR_WHITE;
      statusText = "Connecting...";
    }
  } else if (!isAssigned) {
    bgColor = COLOR_GRAY;
    textColor = COLOR_WHITE;
    statusText = "UNASSIGNED";
  } else if (currentStatus == "LIVE") {
    bgColor = COLOR_LIVE_RED;
    textColor = COLOR_WHITE;
    statusText = "LIVE";
  } else if (currentStatus == "PREVIEW") {
    bgColor = COLOR_PREVIEW_ORANGE;
    textColor = COLOR_BLACK;
    statusText = "PREVIEW";
  } else if (currentStatus == "IDLE") {
    bgColor = COLOR_IDLE_GRAY;
    textColor = COLOR_WHITE;
    statusText = "IDLE";
  } else if (currentStatus == "NO_WIFI") {
    bgColor = COLOR_RED;
    textColor = COLOR_WHITE;
    statusText = "NO WIFI";
  } else if (currentStatus == "CONFIG MODE") {
    bgColor = COLOR_YELLOW;
    textColor = COLOR_BLACK;
    statusText = "CONFIG";
  } else if (currentStatus == "HUB_LOST") {
    bgColor = COLOR_RED;
    textColor = COLOR_WHITE;
    statusText = "HUB LOST";
  } else if (currentStatus == "Reconnecting...") {
    bgColor = COLOR_YELLOW;
    textColor = COLOR_BLACK;
    statusText = "RECONNECT";
  } else {
    bgColor = COLOR_BLACK;
    textColor = COLOR_WHITE;
    statusText = currentStatus;
  }

  showStatus(statusText, bgColor, textColor);
}

void updateStatus(const String& status) {
  currentStatus = status;
  Serial.println("Status: " + status);
}

void showStatus(const String& status, uint16_t bgColor, uint16_t textColor) {
  tft.fillScreen(bgColor);
  
  // Show main status
  tft.setTextColor(textColor);
  tft.setTextSize(4);
  int16_t x = (SCREEN_WIDTH - (status.length() * 24)) / 2;
  int16_t y = SCREEN_HEIGHT / 2 - 40;
  tft.setCursor(x, y);
  tft.print(status);
  
  // Show assigned source if available
  String displaySource = "";
  
  // Prioritize custom display name set via web portal, then assignedSourceName, then fallbacks
  if (customDisplayName.length() > 0) {
    displaySource = customDisplayName;
  } else if (assignedSourceName.length() > 0) {
    displaySource = assignedSourceName;
  } else if (currentSource.length() > 0) {
    displaySource = currentSource;
  } else if (assignedSource.length() > 0) {
    displaySource = cleanSourceName(assignedSource);
  }
  
  if (displaySource.length() > 0) {
    tft.setTextSize(2);
    x = (SCREEN_WIDTH - (displaySource.length() * 12)) / 2;
    y = SCREEN_HEIGHT / 2 + 10;
    tft.setCursor(x, y);
    tft.print(displaySource);
  }
  
  // Show recording/streaming status
  if (isRecording || isStreaming) {
    tft.setTextSize(1);
    tft.setCursor(5, SCREEN_HEIGHT - 20);
    if (isRecording && isStreaming) {
      tft.print("REC + STREAM");
    } else if (isRecording) {
      tft.print("RECORDING");
    } else if (isStreaming) {
      tft.print("STREAMING");
    }
  }
  
  // Show device info at bottom
  tft.setTextSize(1);
  tft.setCursor(5, SCREEN_HEIGHT - 40);
  tft.print("Device: " + deviceName);
  
  tft.setCursor(5, SCREEN_HEIGHT - 30);
  tft.print("IP: " + ipAddress);
  
  tft.setCursor(5, SCREEN_HEIGHT - 10);
  tft.print("FW: " + String(FIRMWARE_VERSION));
}

void showBootScreen() {
  tft.fillScreen(COLOR_BLACK);
  
  // Show logo/title
  tft.setTextColor(COLOR_CYAN);
  tft.setTextSize(3);
  int16_t x = (SCREEN_WIDTH - (String("TALLY LIGHT").length() * 18)) / 2;
  tft.setCursor(x, 30);
  tft.print("TALLY LIGHT");
  
  tft.setTextColor(COLOR_WHITE);
  tft.setTextSize(2);
  x = (SCREEN_WIDTH - (String("ESP32-1732S019").length() * 12)) / 2;
  tft.setCursor(x, 60);
  tft.print("ESP32-1732S019");
  
  // Show version
  tft.setTextSize(1);
  x = (SCREEN_WIDTH - (String("v" + String(FIRMWARE_VERSION)).length() * 6)) / 2;
  tft.setCursor(x, 85);
  tft.print("v" + String(FIRMWARE_VERSION));
  
  // Show device info
  tft.setCursor(5, SCREEN_HEIGHT - 40);
  tft.print("Device: " + deviceName);
  
  tft.setCursor(5, SCREEN_HEIGHT - 30);
  tft.print("Model: " + String(DEVICE_MODEL));
  
  tft.setCursor(5, SCREEN_HEIGHT - 20);
  tft.print("MAC: " + macAddress);
  
  tft.setCursor(5, SCREEN_HEIGHT - 10);
  tft.print("Starting...");
  
  delay(2000);
}

void handleRoot() {
  String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<title>ESP32 Tally Configuration</title>";
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
  html += "</style></head><body>";
  html += "<div class='header'><div class='header-icon'>�</div>";
  html += "<h1>ESP32 Tally Configuration</h1>";
  html += "<div class='header-subtitle'>Device: " + deviceName + "</div></div>";
  html += "<div class='container'>";
  html += "<div class='card'><div class='card-header'><div class='card-icon'>ℹ️</div>";
  html += "<h3>Device Information</h3></div><div class='info-grid'>";
  html += "<div class='info-item'><span class='info-label'>Device Name</span>";
  html += "<span class='info-value'>" + deviceName + "</span></div>";
  html += "<div class='info-item'><span class='info-label'>Device ID</span>";
  html += "<span class='info-value'>" + deviceID + "</span></div>";
  html += "<div class='info-item'><span class='info-label'>WiFi Network</span>";
  html += "<span class='info-value'>" + (WiFi.isConnected() ? WiFi.SSID() : "Not connected") + "</span></div>";
  html += "<div class='info-item'><span class='info-label'>IP Address</span>";
  html += "<span class='info-value'>" + WiFi.localIP().toString() + "</span></div>";
  html += "<div class='info-item'><span class='info-label'>Hub Server</span>";
  html += "<span class='info-value'>" + hubIP + ":" + String(hubPort) + "</span></div></div></div>";
  html += "<div class='card'><div class='card-header'><div class='card-icon'>📶</div>";
  html += "<h3>WiFi Configuration</h3></div>";
  html += "<form action='/save' method='post'>";
  html += "<div class='form-group'><label class='form-label'>Device Name</label>";
  html += "<input type='text' name='device_name' class='form-input' placeholder='ESP32 Tally Light' value='" + deviceName + "' required></div>";
  html += "<div class='form-group'><label class='form-label'>Hub Server IP</label>";
  html += "<input type='text' name='hub_ip' class='form-input' placeholder='192.168.1.100' value='" + hubIP + "' required></div>";
  html += "<div class='form-group'><label class='form-label'>Hub Server Port</label>";
  html += "<input type='number' name='hub_port' class='form-input' placeholder='7411' value='" + String(hubPort) + "' min='1' max='65535' required></div>";
  html += "<div class='form-group'><label class='form-label'>Device ID</label>";
  html += "<input type='text' name='device_id' class='form-input' placeholder='esp32-tally-01' value='" + deviceID + "' required></div>";
  html += "<button type='submit' class='btn btn-primary'>Save Configuration</button></form></div>";
  html += "<div class='card'><div class='card-header'><div class='card-icon'>⚙️</div>";
  html += "<h3>Device Actions</h3></div>";
  html += "<button onclick='window.location=\"/sources\"' class='btn btn-secondary'>Manage Sources</button>";
  html += "<button onclick='window.location=\"/status\"' class='btn btn-secondary'>Device Status</button>";
  html += "<button onclick='restart()' class='btn btn-secondary'>Restart Device</button>";
  html += "<button onclick='resetConfig()' class='btn btn-danger'>Factory Reset</button></div></div>";
  html += "<script>function restart(){if(confirm('Restart the ESP32 Tally device now?')){";
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
  deviceName = server.arg("device_name");
  hubIP = server.arg("hub_ip");
  hubPort = server.arg("hub_port").toInt();
  deviceID = server.arg("device_id");
  
  saveConfiguration();
  
  String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
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
  html += "<p>Your ESP32 Tally Light will now restart and connect to:</p>";
  html += "<p class='info'>Hub: " + hubIP + ":" + String(hubPort) + "</p>";
  html += "<p class='info'>Device: " + deviceName + "</p>";
  html += "<p>Restarting in 5 seconds...</p></div>";
  html += "<script>setTimeout(()=>{window.close();},5000);</script>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
  
  delay(2000);
  ESP.restart();
}

void handleRestart() {
  String html = "<!DOCTYPE html><html><head>";
  html += "<title>Restarting</title>";
  html += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
  html += "<style>body { font-family: Arial; margin: 20px; background: #1a1a1a; color: #fff; text-align: center; }</style>";
  html += "</head><body>";
  html += "<h2>Device Restarting</h2>";
  html += "<p>Please wait...</p>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
  delay(1000);
  ESP.restart();
}

void handleDeviceInfo() {
  JsonDocument doc;
  
  doc["deviceId"] = deviceID;
  doc["deviceName"] = deviceName;
  doc["ipAddress"] = ipAddress;
  doc["macAddress"] = macAddress;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["model"] = DEVICE_MODEL;
  doc["status"] = currentStatus;
  doc["uptime"] = millis() - bootTime;
  doc["hubIP"] = hubIP;
  doc["hubPort"] = hubPort;
  doc["isConnected"] = isConnected;
  doc["isRegistered"] = isRegisteredWithHub;
  doc["assignedSource"] = assignedSource;
  doc["isProgram"] = isProgram;
  doc["isPreview"] = isPreview;
  doc["isRecording"] = isRecording;
  doc["isStreaming"] = isStreaming;
  
  String output;
  serializeJson(doc, output);
  server.send(200, "application/json", output);
}

String formatUptime() {
  unsigned long uptime = millis() - bootTime;
  unsigned long seconds = uptime / 1000;
  unsigned long minutes = seconds / 60;
  unsigned long hours = minutes / 60;
  unsigned long days = hours / 24;
  
  String result = "";
  if (days > 0) result += String(days) + "d ";
  if (hours % 24 > 0) result += String(hours % 24) + "h ";
  if (minutes % 60 > 0) result += String(minutes % 60) + "m ";
  result += String(seconds % 60) + "s";
  
  return result;
}

String cleanSourceName(String sourceName) {
  // Clean up source name for display (similar to M5Stick firmware)
  String cleaned = sourceName;
  
  // Remove common prefixes
  if (cleaned.startsWith("obs-")) {
    cleaned = cleaned.substring(4);
  }
  if (cleaned.startsWith("vmix-")) {
    cleaned = cleaned.substring(5);
  }
  
  // Remove additional common prefixes
  if (cleaned.startsWith("source-")) {
    cleaned = cleaned.substring(7);
  }
  if (cleaned.startsWith("scene-")) {
    cleaned = cleaned.substring(6);
  }
  
  return cleaned;
}

// WiFi and UDP Connection Management Functions

void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi connection lost, attempting reconnection...");
    reconnectWiFi();
  }
}

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
  
  // Use stored credentials if available
  WiFi.mode(WIFI_STA);
  WiFi.begin();
  
  // Wait up to 15 seconds for connection
  unsigned long connectStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - connectStart < 15000) {
    delay(500);
    Serial.print(".");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi reconnected successfully!");
    Serial.println("IP address: " + WiFi.localIP().toString());
    ipAddress = WiFi.localIP().toString();
    reconnectAttempts = 0;
    
    // Restart UDP and re-register with hub
    restartUDP();
    isConnected = false;
    isRegisteredWithHub = false;
    lastHubResponse = 0;
    hubConnectionAttempts = 0;
  } else {
    Serial.println("\nWiFi reconnection failed");
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      Serial.println("Max reconnection attempts reached, restarting device...");
      ESP.restart();
    }
  }
}

void restartUDP() {
  Serial.println("Restarting UDP connection...");
  udp.stop();
  delay(100);
  
  if (udp.begin(7411)) {
    Serial.println("UDP restarted successfully");
  } else {
    Serial.println("Failed to restart UDP");
  }
}

void ensureUDPConnection() {
  // Check if UDP is still working by attempting to send a test packet
  if (WiFi.status() == WL_CONNECTED) {
    static unsigned long lastUDPTest = 0;
    const unsigned long UDP_TEST_INTERVAL = 300000; // Test every 5 minutes (reduced frequency)
    
    if (millis() - lastUDPTest > UDP_TEST_INTERVAL) {
      Serial.println("Testing UDP connection...");
      
      // Send a simple ping without restarting UDP on failure
      JsonDocument doc;
      doc["type"] = "ping";
      doc["deviceId"] = deviceID;
      doc["timestamp"] = millis();
      
      String message;
      serializeJson(doc, message);
      
      int result = udp.beginPacket(hubIP.c_str(), hubPort);
      if (result == 1) {
        udp.print(message);
        int endResult = udp.endPacket();
        if (endResult == 1) {
          Serial.println("UDP test successful");
        } else {
          Serial.println("UDP endPacket failed, but continuing...");
        }
      } else {
        Serial.println("UDP beginPacket failed, but continuing...");
      }
      
      lastUDPTest = millis();
    }
  }
}

void handleSources() {
  String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<title>Source Management - " + deviceName + "</title>";
  html += "<style>";
  html += ":root{--system-blue:#007AFF;--system-green:#34C759;--system-red:#FF3B30;";
  html += "--system-gray:#8E8E93;--bg-primary:#FFFFFF;--bg-secondary:#F2F2F7;";
  html += "--text-primary:#000000;--text-secondary:rgba(60,60,67,0.6);";
  html += "--shadow-2:0 2px 10px rgba(0,0,0,0.08);--radius-large:16px;}";
  html += "body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;";
  html += "background:var(--bg-secondary);margin:0;padding:2rem;}";
  html += ".container{max-width:600px;margin:0 auto;}";
  html += ".card{background:var(--bg-primary);border-radius:var(--radius-large);";
  html += "box-shadow:var(--shadow-2);margin-bottom:1.5rem;overflow:hidden;}";
  html += ".card-header{padding:1.5rem;border-bottom:1px solid var(--bg-secondary);}";
  html += "h1{color:var(--text-primary);font-size:28px;font-weight:700;margin:0;}";
  html += ".form-group{margin-bottom:1rem;}";
  html += ".form-label{font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:0.5rem;display:block;}";
  html += ".form-input{background:var(--bg-primary);border:1px solid var(--system-gray);";
  html += "border-radius:8px;padding:0.75rem;font-size:16px;width:100%;box-sizing:border-box;}";
  html += ".form-input:focus{outline:none;border-color:var(--system-blue);}";
  html += ".btn{padding:0.75rem 1.5rem;border:none;border-radius:12px;";
  html += "font-weight:600;text-decoration:none;display:inline-block;margin:0.5rem;cursor:pointer;}";
  html += ".btn-primary{background:var(--system-blue);color:white;}";
  html += ".btn-secondary{background:var(--system-gray);color:white;}";
  html += ".btn-danger{background:var(--system-red);color:white;}";
  html += ".status-item{display:flex;justify-content:space-between;padding:0.75rem 0;";
  html += "border-bottom:1px solid var(--bg-secondary);}";
  html += ".status-item:last-child{border-bottom:none;}";
  html += ".status-label{color:var(--text-secondary);font-weight:500;}";
  html += ".status-value{color:var(--text-primary);font-weight:600;}";
  html += "</style></head><body>";
  html += "<div class='container'>";
  html += "<div class='card'><div class='card-header'>";
  html += "<h1>Source Assignment</h1></div>";
  html += "<div style='padding:1.5rem;'>";
  
  // Current Assignment Status
  html += "<div class='status-item'>";
  html += "<span class='status-label'>Assigned Source ID:</span>";
  html += "<span class='status-value'>" + (assignedSource.length() > 0 ? assignedSource : "None") + "</span>";
  html += "</div>";
  html += "<div class='status-item'>";
  html += "<span class='status-label'>Custom Display Name:</span>";
  html += "<span class='status-value'>" + (customDisplayName.length() > 0 ? customDisplayName : "None") + "</span>";
  html += "</div>";
  html += "<div class='status-item'>";
  html += "<span class='status-label'>Current Source:</span>";
  html += "<span class='status-value'>" + (currentSource.length() > 0 ? currentSource : "None") + "</span>";
  html += "</div>";
  
  html += "</div></div>";
  
  // Custom Display Name Form
  html += "<div class='card'><div class='card-header'>";
  html += "<h1>Custom Display Name</h1></div>";
  html += "<div style='padding:1.5rem;'>";
  html += "<form action='/save_display_name' method='post'>";
  html += "<div class='form-group'>";
  html += "<label class='form-label'>Display Name (leave empty to use source name)</label>";
  html += "<input type='text' name='display_name' class='form-input' ";
  html += "placeholder='Enter custom display name' value='" + customDisplayName + "' maxlength='20'>";
  html += "</div>";
  html += "<button type='submit' class='btn btn-primary'>Save Display Name</button>";
  html += "</form>";
  html += "</div></div>";
  
  // Manual Assignment Form
  html += "<div class='card'><div class='card-header'>";
  html += "<h1>Manual Assignment</h1></div>";
  html += "<div style='padding:1.5rem;'>";
  html += "<form action='/assign' method='post'>";
  html += "<div class='form-group'>";
  html += "<label class='form-label'>Source ID</label>";
  html += "<input type='text' name='source' class='form-input' ";
  html += "placeholder='Enter source ID' value='" + assignedSource + "'>";
  html += "</div>";
  html += "<button type='submit' class='btn btn-primary'>Assign Source</button>";
  html += "</form>";
  html += "<form action='/unassign' method='post' style='margin-top:1rem;'>";
  html += "<button type='submit' class='btn btn-danger'>Unassign Device</button>";
  html += "</form>";
  html += "</div></div>";
  
  // Back Button
  html += "<div class='card'><div style='padding:1.5rem;text-align:center;'>";
  html += "<a href='/' class='btn btn-secondary'>Back to Main</a>";
  html += "</div></div>";
  
  html += "</div></body></html>";
  
  server.send(200, "text/html", html);
}

void handleAssign() {
  String sourceId = server.arg("source");
  if (sourceId.length() > 0) {
    assignedSource = sourceId;
    isAssigned = true;
    saveConfiguration();
    
    String html = "<!DOCTYPE html><html><head>";
    html += "<title>Assignment Complete</title>";
    html += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
    html += "<style>body { font-family: Arial; margin: 20px; background: #f2f2f7; text-align: center; }</style>";
    html += "</head><body>";
    html += "<h2>✅ Source Assigned</h2>";
    html += "<p>Device assigned to source: <strong>" + sourceId + "</strong></p>";
    html += "<p>Redirecting back to sources...</p>";
    html += "<script>setTimeout(() => { window.location = '/sources'; }, 2000);</script>";
    html += "</body></html>";
    
    server.send(200, "text/html", html);
  } else {
    server.send(400, "text/plain", "Missing source parameter");
  }
}

void handleUnassign() {
  assignedSource = "";
  isAssigned = false;
  customDisplayName = ""; // Clear custom name when unassigning
  saveConfiguration();
  
  String html = "<!DOCTYPE html><html><head>";
  html += "<title>Unassignment Complete</title>";
  html += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
  html += "<style>body { font-family: Arial; margin: 20px; background: #f2f2f7; text-align: center; }</style>";
  html += "</head><body>";
  html += "<h2>🔄 Device Unassigned</h2>";
  html += "<p>Device is no longer assigned to any source</p>";
  html += "<p>Redirecting back to sources...</p>";
  html += "<script>setTimeout(() => { window.location = '/sources'; }, 2000);</script>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
}

void handleSaveDisplayName() {
  String displayName = server.arg("display_name");
  customDisplayName = displayName;
  
  // Update currentSource immediately to reflect the change
  if (customDisplayName.length() > 0) {
    currentSource = customDisplayName;
  } else if (assignedSource.length() > 0) {
    // If clearing custom name and we have an assigned source, use cleaned source name
    currentSource = cleanSourceName(assignedSource);
  } else {
    currentSource = "";
  }
  
  saveConfiguration();
  
  String html = "<!DOCTYPE html><html><head>";
  html += "<title>Display Name Saved</title>";
  html += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
  html += "<style>body { font-family: Arial; margin: 20px; background: #f2f2f7; text-align: center; }</style>";
  html += "</head><body>";
  html += "<h2>💾 Display Name Saved</h2>";
  if (displayName.length() > 0) {
    html += "<p>Custom display name set to: <strong>" + displayName + "</strong></p>";
  } else {
    html += "<p>Custom display name cleared - will use source name</p>";
  }
  html += "<p>Redirecting back to sources...</p>";
  html += "<script>setTimeout(() => { window.location = '/sources'; }, 2000);</script>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
}

void handleReset() {
  // Clear all stored preferences
  preferences.begin("tally", false);
  preferences.clear();
  preferences.end();
  
  String html = "<!DOCTYPE html><html><head>";
  html += "<title>Factory Reset</title>";
  html += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
  html += "<style>body { font-family: Arial; margin: 20px; background: #1a1a1a; color: #fff; text-align: center; }</style>";
  html += "</head><body>";
  html += "<h2>Factory Reset Complete</h2>";
  html += "<p>Device will restart in configuration mode...</p>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
  delay(2000);
  ESP.restart();
}

void handleStatus() {
  String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<title>Device Status - " + deviceName + "</title>";
  html += "<style>";
  html += ":root{--system-blue:#007AFF;--system-green:#34C759;--system-red:#FF3B30;";
  html += "--system-gray:#8E8E93;--bg-primary:#FFFFFF;--bg-secondary:#F2F2F7;";
  html += "--text-primary:#000000;--text-secondary:rgba(60,60,67,0.6);";
  html += "--shadow-2:0 2px 10px rgba(0,0,0,0.08);--radius-large:16px;}";
  html += "body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;";
  html += "background:var(--bg-secondary);margin:0;padding:2rem;}";
  html += ".container{max-width:600px;margin:0 auto;}";
  html += ".card{background:var(--bg-primary);border-radius:var(--radius-large);";
  html += "box-shadow:var(--shadow-2);margin-bottom:1.5rem;overflow:hidden;}";
  html += ".card-header{padding:1.5rem;border-bottom:1px solid var(--bg-secondary);}";
  html += "h1{color:var(--text-primary);font-size:28px;font-weight:700;margin:0;}";
  html += ".status-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;padding:1.5rem;}";
  html += ".status-item{text-align:center;padding:1rem;background:var(--bg-secondary);border-radius:12px;}";
  html += ".status-label{color:var(--text-secondary);font-size:14px;margin-bottom:0.5rem;}";
  html += ".status-value{color:var(--text-primary);font-weight:600;font-size:18px;}";
  html += ".btn{padding:0.75rem 1.5rem;border:none;border-radius:12px;";
  html += "font-weight:600;text-decoration:none;display:inline-block;margin:0.5rem;}";
  html += ".btn-secondary{background:var(--system-gray);color:white;}";
  html += "</style></head><body>";
  html += "<div class='container'>";
  html += "<div class='card'><div class='card-header'>";
  html += "<h1>Device Status</h1></div>";
  html += "<div class='status-grid'>";
  html += "<div class='status-item'><div class='status-label'>Connection</div>";
  html += "<div class='status-value'>" + String(isConnected ? "Connected" : "Disconnected") + "</div></div>";
  html += "<div class='status-item'><div class='status-label'>Registration</div>";
  html += "<div class='status-value'>" + String(isRegisteredWithHub ? "Registered" : "Not Registered") + "</div></div>";
  html += "<div class='status-item'><div class='status-label'>Tally State</div>";
  html += "<div class='status-value'>" + String(isProgram ? "Program" : (isPreview ? "Preview" : "Off")) + "</div></div>";
  html += "<div class='status-item'><div class='status-label'>Uptime</div>";
  html += "<div class='status-value'>" + formatUptime() + "</div></div>";
  html += "</div>";
  html += "<div style='padding:1.5rem;text-align:center;'>";
  html += "<a href='/' class='btn btn-secondary'>Back to Main</a>";
  html += "</div></div></div></body></html>";
  
  server.send(200, "text/html", html);
}

void handleNotFound() {
  String message = "File Not Found\n\n";
  message += "URI: ";
  message += server.uri();
  message += "\nMethod: ";
  message += (server.method() == HTTP_GET) ? "GET" : "POST";
  message += "\nArguments: ";
  message += server.args();
  message += "\n";
  
  for (uint8_t i = 0; i < server.args(); i++) {
    message += " " + server.argName(i) + ": " + server.arg(i) + "\n";
  }
  
  server.send(404, "text/plain", message);
}

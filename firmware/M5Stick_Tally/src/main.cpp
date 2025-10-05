#include <M5Unified.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <EEPROM.h>
#include <math.h>
#include <qrcode.h>

// -----------------------------------------------------------------------------
// Optional Feature Flags (enable via platformio.ini build_flags or uncomment):
//  -DWIFI_SPRITE_ICONS   : Use cached sprite mask(s) for Wi-Fi arcs to reduce per-frame math
//  -DBATT_HIDE_PERCENT   : Hide battery percent text entirely
//  -DBATT_SMALL_PERCENT  : Use compact battery percent (ignored if BATT_HIDE_PERCENT is set)
// Wi-Fi outline & disconnect 'X' are now always shown (previous flags removed for clarity)

// Library parity notice:
// Both M5StickC Plus and Plus2 environments are pinned to M5Unified >= 0.1.17 in platformio.ini.
// If upgrading one environment, upgrade the other to keep feature parity.
// -----------------------------------------------------------------------------

// Firmware version and device info
#define FIRMWARE_VERSION "1.1.0"
#define DEVICE_MODEL_PLUS "M5StickC-Plus"
#define DEVICE_MODEL_PLUS2 "M5StickC-Plus2"

// Expected M5Unified version (informational only – library does not expose a numeric macro)
#define EXPECTED_M5UNIFIED_VERSION_STR "0.1.17"

// Configuration - Will be loaded from preferences or set via AP mode
String wifi_ssid = "";
String wifi_password = "";
String hub_ip = ""; // Auto-discover by default, will be set via mDNS
int hub_port = 7411;
String device_id = ""; // Will be generated dynamically with unique MAC-based ID
String device_name = "M5 Tally Light";
bool auto_discovery_enabled = true; // new preference: attempt hub auto-discovery when IP not known

// WiFi Memory System - Store multiple networks
#define MAX_WIFI_NETWORKS 5
struct WiFiNetwork {
  String ssid;
  String password;
  bool isActive;
};
WiFiNetwork savedNetworks[MAX_WIFI_NETWORKS];
int networkCount = 0;

// Access Point Configuration - AP name will be generated dynamically with unique ID
String AP_SSID = "M5-Tally-Config"; // Will be updated with unique ID in setup()
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
bool showQRCode = true; // Track whether to show QR code or text info

// Network objects
WiFiUDP udp;

// -----------------------------------------------------------------------------
// Runtime UI Configuration (can be changed via web UI; persisted in Preferences)
// Compile-time flags still act as hard overrides if defined (e.g. BATT_HIDE_PERCENT)
struct UIConfig {
  bool showBattPercent = true;
  bool smallBattPercent = false;
  // Wi-Fi outline & disconnect X are now always enabled (config option removed)
  bool wifiOutline = true;            // permanently enabled
  bool wifiShowDisconnectX = true;    // permanently enabled (unless WIFI_NO_DISCONNECT_X compile flag)
  bool wifiSpriteIcons = false; // if true prefer sprite path regardless of compile flag
} uiCfg;
// -----------------------------------------------------------------------------
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
String currentLiveSource = ""; // Track what source is currently live for display context
unsigned long lastLiveSourceUpdate = 0; // When we last updated the live source info

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
bool showingDeviceInfo = false; // legacy (repurposed by new hold-to-view overlay logic)
unsigned long deviceInfoStart = 0; // legacy timing variable
// New transient overlay state: show source/IP/ID while Button A is held
static bool infoOverlayActive = false;

// Registration status display state
bool showingRegistrationStatus = false;
unsigned long registrationStatusStart = 0;
String registrationStatusMessage = "";
uint16_t registrationStatusColor = GREEN;

// Admin text message overlay
static String gAdminMessage = "";           // current admin message text
static unsigned long gAdminMessageExpire = 0; // millis when it should disappear
static uint16_t gAdminMessageColor = 0x001F;  // default background (BLUE)
static bool gAdminMessageActive = false;
static String gAdminMessageId = "";          // hub-provided id for read receipts

// Current background color helper used by indicator drawing routines to avoid clearing with BLACK on colored screens
static uint16_t gBgColor = BLACK;
// Flag to request re-initialization of overlay layout rendering on next updateDisplay cycle
static bool gAdminOverlayReset = false;
// Tunable: maximum admin message text size (boosted to allow very large single-line alerts)
#ifndef ADMIN_MSG_MAX_TEXT_SIZE
#define ADMIN_MSG_MAX_TEXT_SIZE 20
#endif
// Preferred target size to attempt first when rendering (try largest first anyway)
#ifndef ADMIN_MSG_TARGET_TEXT_SIZE
#define ADMIN_MSG_TARGET_TEXT_SIZE ADMIN_MSG_MAX_TEXT_SIZE
#endif

// Network selection mode state
bool networkSelectionMode = false;
int selectedNetworkIndex = 0;
unsigned long networkSelectionStart = 0;
const unsigned long NETWORK_SELECTION_TIMEOUT = 10000; // 10 seconds
// Enable scrolling when text block height exceeds available area
#ifndef ADMIN_MSG_SCROLL_IF_OVERFLOW
#define ADMIN_MSG_SCROLL_IF_OVERFLOW 1
#endif
// Scroll parameters
#ifndef ADMIN_MSG_SCROLL_SPEED_PX_PER_SEC
#define ADMIN_MSG_SCROLL_SPEED_PX_PER_SEC 28  // vertical pixels per second
#endif
#ifndef ADMIN_MSG_SCROLL_FRAME_INTERVAL_MS
#define ADMIN_MSG_SCROLL_FRAME_INTERVAL_MS 120
#endif

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
void attemptHubDiscovery(bool force=false);
bool performDiscoveryExchange();
bool attemptMdnsLookup();
void handleTallyUpdate(JsonObject data);
void handleButtons();
void updateDisplay();
// Helper to force next updateDisplay to repaint immediately after overlay dismissal
void forceImmediateDisplay();
void showStatus(String message, uint16_t color);
void showTallyState(String state, uint16_t color);
void drawCenteredStatus(const String &text, uint16_t bgColor, uint16_t textColor);
void drawInfoOverlay();
void showDeviceInfo();
void startConfigMode();
void handleConfigMode();
void displayWiFiQRCode();
void displayWiFiInfo();
void setupWebServer();
// Network selection functions
void enterNetworkSelectionMode();
void exitNetworkSelectionMode();
void showNetworkSelectionUI();
void cycleToNextNetwork();
void connectToSelectedNetwork();
void handleRoot();
void handleConfig();
void handleSave();
void handleSwitchNetwork();
void handleDeleteNetwork();
void handleSources();
void handleStatus();
void handleAssign();
void handleReset();
void handleRestart();
void handleNotFound();
void loadConfiguration();
void saveConfiguration();
void loadSavedNetworks();
void saveSavedNetworks();
void addNetworkToMemory(String ssid, String password);
bool removeNetworkFromMemory(int index);
void clearAllSavedNetworks();
void addNetworkToMemory(String ssid, String password);
bool connectToKnownNetworks();
bool tryConnectToNetwork(String ssid, String password);
void saveConfiguration();
void loadAssignment();
void saveAssignment();
bool connectToSavedWiFi();
String cleanSourceName(String sourceName);

// Battery indicator support
struct BatteryInfo {
  int percent;        // 0-100
  bool charging;      // true if actively charging (battery not yet full)
  bool usb;           // true if USB power present
  float voltage;      // approximate battery voltage (V)
};

BatteryInfo readBattery();
void drawBatteryIndicator(const BatteryInfo &info);
// Wi-Fi signal indicator
void drawWiFiIndicator();
void drawPermanentStatusBar();
static int wifiLevelFromRSSI(int32_t rssi); // forward declaration for early usage
static int wifiLevelFromRSSI(int32_t rssi);
// Track leftmost X occupied by battery percent text so Wi-Fi icon can avoid overlap
static int gBattPctLeftX = -1; // updated each drawBatteryIndicator; -1 means unknown
// Battery animation state (unified for both devices)
static unsigned long gBatAnimLast = 0;
static int gBatAnimPhase = 0;

void setup() {
  #ifdef M5STICKC_PLUS2
  auto cfg = M5.config();
  M5.begin(cfg);
  #else
  M5.begin();
  #endif
  
  // (Optional AXP192 tweaks removed for uniform behavior across Plus and Plus2)
  
  // Configure display for M5StickC Plus / Plus2
  M5.Lcd.setRotation(3);  // Landscape mode for better text display
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.setTextSize(2);
  
  // Generate unique AP name using MAC address
  String macAddress = WiFi.macAddress();
  macAddress.replace(":", ""); // Remove colons
  String uniqueId = macAddress.substring(6); // Use last 6 characters of MAC
  AP_SSID = "M5-Tally-Config-" + uniqueId;
  Serial.println("Generated AP SSID: " + AP_SSID);
  
  // Initialize preferences
  preferences.begin("tally", false);
  
  Serial.begin(115200);
  Serial.println("M5 Stick Tally Light Starting...");
  Serial.print("Expected M5Unified >= ");
  Serial.println(EXPECTED_M5UNIFIED_VERSION_STR);
  // Note: M5Unified does not currently expose a standard version macro to compare; keep platformio.ini in sync for all envs.
  
  showStatus("Starting...", BLUE);
  // (Boot diagnostics removed with debug mode elimination)
  
  // Load configuration from preferences
  loadConfiguration();
  loadAssignment();
  loadSavedNetworks(); // Load WiFi memory

  // Seed default Wi‑Fi networks (idempotent; updates if present)
  // Requested networks:
  // 1) SSID: "Grace Haven"            Password: "Jonathan2023!"
  // 2) SSID: "Malayalam Gospel Church" Password: "MGCslough@2010"
  addNetworkToMemory("Grace Haven", "Jonathan2023!");
  addNetworkToMemory("Malayalam Gospel Church", "MGCslough@2010");
  
  // Check if Button A is pressed during startup to force config mode
  M5.update();
  if (M5.BtnA.isPressed()) {
    forceConfigMode = true;
    showStatus("Config Mode", YELLOW);
    delay(2000);
  }
  
  // Try to connect to WiFi using memory system or fallback to saved WiFi
  bool wifiConnected = false;
  if (!forceConfigMode) {
    // First try known networks from memory
    if (networkCount > 0) {
      showStatus("Auto Connect", BLUE);
      wifiConnected = connectToKnownNetworks();
    }
    
    // Fallback to legacy saved WiFi if memory connection failed
    if (!wifiConnected && wifi_ssid.length() > 0) {
      showStatus("Connecting...", BLUE);
      wifiConnected = connectToSavedWiFi();
    }
  }
  
  if (wifiConnected) {
    // Connected to WiFi
    isConnected = true;
    lastHubResponse = millis(); // Initialize hub response tracking
    hubConnectionAttempts = 0;
    showStatus("WiFi OK", GREEN);
    delay(1000);

    // Start mDNS responder early so hub can find us if needed (optional hostname: tally-<id>)
    if (!MDNS.begin(device_id.c_str())) {
      Serial.println("mDNS start failed");
    } else {
      Serial.println("mDNS responder started");
    }
    
    // Start UDP
    udp.begin(hub_port + 1); // Use different port for receiving

    // Auto-discovery AFTER UDP listener starts so we can receive reply
    if (auto_discovery_enabled && hub_ip.length() == 0) {
      Serial.println("Hub IP not configured, starting auto-discovery...");
      attemptHubDiscovery();
      // mDNS fallback if no hub learned after initial UDP attempts (deferred in attemptHubDiscovery logic)
    }
    
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

  // Ensure status icons visible immediately regardless of later limiter logic
  BatteryInfo initBat = readBattery();
  drawBatteryIndicator(initBat);
  drawWiFiIndicator();
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
  
  // Handle network selection timeout
  if (networkSelectionMode && millis() - networkSelectionStart > NETWORK_SELECTION_TIMEOUT) {
    exitNetworkSelectionMode();
  }
  
  // Handle button presses
  handleButtons();
  // (Removed battery debug & calibration input handling)
  
  // Update display if needed
  updateDisplay();

  // Removed forced status bar updates to prevent flickering
  // Status bar will update naturally when display states change

  // Change-driven HUD overlay refresh (battery + Wi-Fi) for power savings
  static unsigned long lastHud = 0;
  static unsigned long lastHudForced = 0;
  static int lastPctBucket = -1; // 1% bucket
  static int lastWifiLevel = -1;
  static bool lastCharging = false;
  static bool lastBlinkVisible = true;
  const unsigned long MIN_INTERVAL = 250;   // don't redraw faster than this
  const unsigned long MAX_INTERVAL = 5000;  // force redraw at least this often
  unsigned long now = millis();
  bool timeOk = (now - lastHud) >= MIN_INTERVAL;
  // Peek current blink state by reusing animation state; blink toggles inside drawBatteryIndicator so we estimate visibility by parity of phase time.
  // We'll trigger redraw on blink transitions only while in low battery state.
  // Simple heuristic: derive blinkOn from ( (now/700) % 2 == 0 ) matching our 700ms period.
  bool blinkOn = ((now / 700UL) % 2UL) == 0UL;
  bool need = false;
  if (timeOk) {
    BatteryInfo b = readBattery();
    int pctBucket = b.percent; // could coarsen to /2*2 if needed
    // Derive Wi-Fi level quickly (duplicate logic minimal cost)
    int32_t rssi = (WiFi.status()==WL_CONNECTED) ? WiFi.RSSI() : -200;
    int wifiLevel = (WiFi.status()==WL_CONNECTED) ? wifiLevelFromRSSI(rssi) : 0;
    bool lowBattBlinking = (!b.charging && b.percent < 15);
    if (pctBucket != lastPctBucket || wifiLevel != lastWifiLevel || b.charging != lastCharging) need = true;
    if (lowBattBlinking && blinkOn != lastBlinkVisible) need = true;
    if ((now - lastHud) >= MAX_INTERVAL) need = true; // periodic refresh guard
    if (need) {
      drawBatteryIndicator(b);
      drawWiFiIndicator();
      lastPctBucket = pctBucket;
      lastWifiLevel = wifiLevel;
      lastCharging = b.charging;
      lastBlinkVisible = blinkOn;
      lastHud = now;
    }
  }
  
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
      Serial.println("Max reconnection attempts reached, powering off (unified)...");
      // Attempt graceful power off; if platform ignores, fallback to restart
      M5.Power.powerOff();
      delay(750);
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
      if (auto_discovery_enabled) attemptHubDiscovery();
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
    if (auto_discovery_enabled) attemptHubDiscovery();
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
  // Only check if we're connected to WiFi
  if (WiFi.status() != WL_CONNECTED) {
    if (isConnected || isRegisteredWithHub) {
      Serial.println("WiFi lost - marking as disconnected");
      isConnected = false;
      isRegisteredWithHub = false;
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
      registrationStatusColor = YELLOW;
      
      // Attempt to register with the hub
      delay(1000); // Brief delay before attempting connection
      if (auto_discovery_enabled) attemptHubDiscovery();
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
      if (auto_discovery_enabled) attemptHubDiscovery();
      registerWithHub();
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
    
    // Immediately mark as not registered to trigger reconnection logic
    isRegisteredWithHub = false;
    isConnected = false;
    
    Serial.println("Hub timeout detected - will trigger reconnection attempts");
    // The reconnection will be handled in the next call to checkHubConnection()
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
    else if (messageType == "discover_reply") {
      // Hub responded to discovery request
      if (!doc["hubIp"].isNull()) {
        String newIp = doc["hubIp"].as<String>();
        int newUdp = doc["udpPort"].isNull()? hub_port : doc["udpPort"].as<int>();
        bool changed = (newIp != hub_ip) || (newUdp != hub_port);
        if (changed) {
          Serial.printf("Discovery: updating hub to %s:%d\n", newIp.c_str(), newUdp);
          hub_ip = newIp; hub_port = newUdp; saveConfiguration();
          restartUDP(); // ensure we listen on correct companion port (hub_port+1 still fine)
          // Immediately try registration with new hub details
          registerWithHub();
        }
      }
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
    else if (messageType == "admin_message") {
      // Expected fields: text, color (optional #RRGGBB), duration (ms)
      const char* txt = doc["text"] | "";
      if (strlen(txt) > 0) {
        gAdminMessage = String(txt);
        gAdminMessageId = doc["id"].isNull() ? String("") : String((const char*)doc["id"].as<const char*>());
        // Duration clamp: 1s..30s default 8s
        unsigned long dur = doc["duration"].isNull() ? 8000UL : (unsigned long)doc["duration"].as<unsigned long>();
        if (dur < 1000UL) dur = 1000UL; if (dur > 30000UL) dur = 30000UL;
        gAdminMessageExpire = millis() + dur;
        // Parse color (#RRGGBB) -> RGB565 background
        gAdminMessageColor = 0x001F; // default blue
        if (!doc["color"].isNull()) {
          String c = doc["color"].as<String>();
          if (c.startsWith("#")) c.remove(0,1);
          if (c.length() == 6) {
            char rHex[3]={c[0],c[1],'\0'}; char gHex[3]={c[2],c[3],'\0'}; char bHex[3]={c[4],c[5],'\0'};
            int r = strtol(rHex,nullptr,16); int g = strtol(gHex,nullptr,16); int b = strtol(bHex,nullptr,16);
            // Convert 8-bit each to RGB565
            uint16_t rr = (r & 0xF8) << 8;
            uint16_t gg = (g & 0xFC) << 3;
            uint16_t bb = (b >> 3);
            gAdminMessageColor = rr | gg | bb;
          }
        }
        gAdminMessageActive = true;
        gBgColor = gAdminMessageColor; // remember overlay background for consistent partial redraws
        gAdminOverlayReset = true; // ensure overlay redraw logic re-wraps with potential different sizing
        
        Serial.printf("Admin message received (%lu ms): %s\n", (unsigned long)dur, gAdminMessage.c_str());
        // Immediately refresh the top status bar so the message shows without delay (no full-screen redraw)
        drawPermanentStatusBar();

        // Send immediate acknowledgement to hub for observability (indicates device received the message)
        if (WiFi.status() == WL_CONNECTED) {
          String snippet = gAdminMessage.substring(0, 24);
          StaticJsonDocument<192> ack;
          ack["type"] = "admin_message_ack";
          ack["deviceId"] = device_id;
          ack["method"] = "received";
          ack["timestamp"] = (uint32_t)millis();
          ack["textSnippet"] = snippet;
          if (gAdminMessageId.length() > 0) ack["id"] = gAdminMessageId;
          char out[192]; size_t n = serializeJson(ack, out, sizeof(out));
          udp.beginPacket(hub_ip.c_str(), hub_port);
          udp.write((const uint8_t*)out, n);
          udp.endPacket();
        }
        // Don't trigger blue screen - messages only appear in status bar
        // showStatus("", gAdminMessageColor); // DISABLED: No more blue screen pop-ups
      }
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
  
  // ArduinoJson 7+: containsKey deprecated; use isNull() pattern
  if (!data["recording"].isNull()) {
    recording = data["recording"].as<bool>();
  }
  if (!data["streaming"].isNull()) {
    streaming = data["streaming"].as<bool>();
  }
  
  // Debug print raw JSON data
  Serial.print("Raw tally update received: ");
  String jsonString;
  serializeJson(data, jsonString);
  Serial.println(jsonString);
  
  // Global live source capture: update on ANY Program=true (regardless of this device's assignment)
  if (program) {
    String newLiveSource = cleanSourceName(sourceName);
    if (newLiveSource.length() > 0) {
      if (newLiveSource != currentLiveSource) {
        currentLiveSource = newLiveSource;
        saveConfiguration(); // Persist only when it changes to avoid flash wear
        Serial.printf("📺 Live source (global) updated: %s\n", currentLiveSource.c_str());
      }
      // Refresh the timestamp on every program broadcast so UI stays fresh
      lastLiveSourceUpdate = millis();
    }
  }
  
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
  // Updated mapping:
  //  - Button A: short press dismisses admin message only; long press (>3s) enters config mode.
  //  - Button B: double press (within 450ms) triggers re-registration; long hold (>600ms) shows info overlay.
  //              Single short press does nothing (prevents accidental registration).

  // --- Button A + B simultaneous press for network selection ---
  static bool bothButtonsPressed = false;
  static unsigned long bothButtonsPressTime = 0;
  const unsigned long simultaneousPressWindow = 200; // ms window for "simultaneous" press
  
  bool btnAPressed = M5.BtnA.isPressed();
  bool btnBPressed = M5.BtnB.isPressed();
  
  // Check for simultaneous press
  if (btnAPressed && btnBPressed && !bothButtonsPressed) {
    bothButtonsPressed = true;
    bothButtonsPressTime = millis();
    Serial.println("Both buttons pressed simultaneously");
  }
  
  // Check for simultaneous release or if one button released
  if (bothButtonsPressed && (!btnAPressed || !btnBPressed)) {
    unsigned long pressDuration = millis() - bothButtonsPressTime;
    if (pressDuration >= 100 && pressDuration <= 2000) { // Valid press duration
      if (!networkSelectionMode && !showingAssignmentConfirmation && !showingRegistrationStatus && !gAdminMessageActive) {
        Serial.println("Both buttons released -> Network selection mode");
        enterNetworkSelectionMode();
      }
    }
    bothButtonsPressed = false;
    bothButtonsPressTime = 0;
  }
  
  // Reset if both buttons held too long
  if (bothButtonsPressed && (millis() - bothButtonsPressTime) > 3000) {
    Serial.println("Both buttons held too long, ignoring");
    bothButtonsPressed = false;
    bothButtonsPressTime = 0;
  }
  
  // Skip individual button processing if both buttons are being handled
  bool processIndividualButtons = !bothButtonsPressed;
  
  if (processIndividualButtons) {

  // --- Button A handling (short / long) ---
  static unsigned long btnAPressTime = 0;
  static bool btnALongActionShown = false;
  if (M5.BtnA.wasPressed()) {
    btnAPressTime = millis();
    btnALongActionShown = false;
  }
  if (M5.BtnA.isPressed() && btnAPressTime > 0) {
    // Provide pre-long press hint after threshold
    if (!btnALongActionShown && millis() - btnAPressTime > 3000) {
      if (!showingAssignmentConfirmation && !showingRegistrationStatus && !gAdminMessageActive) {
        showStatus("Release for Config", YELLOW);
      }
      btnALongActionShown = true;
    }
  }
  if (M5.BtnA.wasReleased()) {
    unsigned long held = millis() - btnAPressTime;
    if (btnAPressTime > 0) {
      if (held > 3000) {
        // Long press -> config mode
        Serial.println("Button A long press -> Config Mode");
        startConfigMode();
      } else {
        // Short press behavior
        if (networkSelectionMode) {
          // Cancel network selection mode
          exitNetworkSelectionMode();
        } else if (gAdminMessageActive) {
          // Capture snippet before clearing
          String snippet = gAdminMessage.substring(0, 24);
          gAdminMessageActive = false; gAdminMessage = ""; Serial.println("Admin message dismissed via Button A");
          // Force immediate display refresh to return to tally state without waiting for periodic update
          // Reset change-tracking so updateDisplay paints next loop
          extern void forceImmediateDisplay(); forceImmediateDisplay();
          // Send acknowledgement UDP packet to hub
          if (WiFi.status() == WL_CONNECTED) {
            StaticJsonDocument<192> ack;
            ack["type"] = "admin_message_ack";
            ack["deviceId"] = device_id;
            ack["method"] = "button";
            ack["timestamp"] = (uint32_t)millis();
            ack["textSnippet"] = snippet;
            if (gAdminMessageId.length() > 0) ack["id"] = gAdminMessageId;
            char out[192]; size_t n = serializeJson(ack, out, sizeof(out));
            udp.beginPacket(hub_ip.c_str(), hub_port);
            udp.write((const uint8_t*)out, n);
            udp.endPacket();
          }
        }
      }
    }
    btnAPressTime = 0;
    btnALongActionShown = false;
  }

  // --- Button B handling (double press for re-register + network selection support) ---
  static unsigned long btnBFirstPressTime = 0;
  static uint8_t btnBPressCount = 0;
  const unsigned long doublePressWindow = 600; // ms
  
  if (M5.BtnB.wasPressed()) {
    unsigned long now = millis();
    
    // Handle presses differently based on current mode
    if (networkSelectionMode) {
      // In network selection mode, single press cycles through networks
      Serial.println("Network selection mode: cycling to next network");
      cycleToNextNetwork();
      btnBPressCount = 0; // Reset to prevent other actions
      btnBFirstPressTime = 0;
    } else {
      // Normal mode - count presses for double-press detection
      if (btnBPressCount == 0) {
        btnBFirstPressTime = now;
        btnBPressCount = 1;
      } else {
        if (now - btnBFirstPressTime <= doublePressWindow) {
          btnBPressCount++;
        } else {
          // Reset sequence (too slow)
          btnBFirstPressTime = now;
          btnBPressCount = 1;
        }
      }
    }
  }
  
  if (M5.BtnB.wasReleased()) {
    unsigned long now = millis();
    
    if (networkSelectionMode) {
      // Check for double press in network selection mode (connect to selected network)
      if (btnBPressCount >= 2 && (now - btnBFirstPressTime) <= doublePressWindow) {
        Serial.println("Network selection mode: connecting to selected network");
        connectToSelectedNetwork();
        btnBPressCount = 0;
        btnBFirstPressTime = 0;
      }
      return; // Don't process other button logic in network selection mode
    }
    
    // Normal mode button handling
    if (btnBPressCount == 2 && (now - btnBFirstPressTime) <= doublePressWindow) {
      if (!showingAssignmentConfirmation && !showingRegistrationStatus) {
        Serial.println("Button B double press -> Re-register");
        registerWithHub();
      }
      btnBPressCount = 0; 
      btnBFirstPressTime = 0;
    }
  }
  
  // Timeout check for incomplete press sequences
  if (btnBPressCount > 0 && btnBFirstPressTime > 0) {
    unsigned long now = millis();
    if (now - btnBFirstPressTime > doublePressWindow) {
      btnBPressCount = 0;
      btnBFirstPressTime = 0;
    }
  }
  
  } // End of processIndividualButtons if block
}

void forceImmediateDisplay() {
  // Reset internal trackers used by updateDisplay so it treats next cycle as changed
  // These statics live inside updateDisplay; we emulate by using volatile flags via globals if needed.
  // Easiest path: set lastProgramState/lastPreviewState mismatched by toggling them.
  // We'll flip them via dummy globals not exposed elsewhere (use existing ones by forward knowledge).
  // Guarantee redraw on next loop by setting lastTallyUpdate old and forcing state mismatch.
  // (Simpler: call showStatus/showTallyState directly.) We'll directly render tally state now.
  if (!gAdminMessageActive) {
    if (WiFi.status() != WL_CONNECTED) {
      showStatus("NO WIFI", RED);
    } else if (!isRegisteredWithHub) {
      showStatus("Connecting...", BLUE);
    } else if (!isAssigned || assignedSource.length()==0) {
      showStatus("UNASSIGNED", RED);
    } else if (isProgram) {
      showTallyState("PROGRAM", RED);
    } else if (isPreview) {
      showTallyState("PREVIEW", 0xFD20);
    } else {
      showTallyState("IDLE", 0x7BEF);
    }
  }
}

void updateDisplay() {
  // Don't update display during config mode - let config mode handle its own display
  if (configMode) {
    return;
  }
  
  static unsigned long lastDisplayUpdate = 0;
  static bool lastProgramState = false;
  static bool lastPreviewState = false;
  static String lastSource = "";
  // Track last-rendered live context so we can refresh when it changes
  static String lastRenderedLiveSource = "";
  static unsigned long lastRenderedLiveTs = 0;
  
  // Expire admin message if time elapsed
  if (gAdminMessageActive && millis() > gAdminMessageExpire) {
    gAdminMessageActive = false;
    gAdminMessage = "";
    // Force refresh when overlay auto-expires
    extern void forceImmediateDisplay(); forceImmediateDisplay();
  }

  // Admin message has priority just below assignment / registration but above normal tally
  // DISABLED: Admin messages now only appear in status bar, not as full screen overlays
  if (false && gAdminMessageActive && !showingAssignmentConfirmation && !showingRegistrationStatus && !infoOverlayActive) {
    // Admin message overlay (dynamic sizing). Adjustable max size via ADMIN_MSG_MAX_TEXT_SIZE (default 5).
    // Throttled admin overlay redraw to reduce flicker
  static bool firstDraw = true;
  static unsigned long lastBatterySample = 0;
    static bool lastProg = false, lastPrev = false;
    static String lastSrc = "";
    static int lastPct = -1; // coarse bucket
    static int lastWifiLevel = -1;
  const unsigned long ICON_REFRESH_INTERVAL = 900;   // icons (battery/wifi) refresh interval
  bool needBar = false; // redraw top bar (state/source) when changed
    bool needIcons = false;
    unsigned long now = millis();

  // Detect state changes requiring bar repaint
  if (isProgram != lastProg || isPreview != lastPrev || currentSource != lastSrc) needBar = true;

    // Battery / Wi-Fi sampling (coarse)
    if (now - lastBatterySample > ICON_REFRESH_INTERVAL) {
      BatteryInfo b = readBattery();
      int32_t rssi = (WiFi.status()==WL_CONNECTED) ? WiFi.RSSI() : -200;
      int wifiLevelNow = (WiFi.status()==WL_CONNECTED) ? wifiLevelFromRSSI(rssi) : 0;
      int pctBucket = b.percent/2; // 2% bucket
      if (pctBucket != lastPct || wifiLevelNow != lastWifiLevel) needIcons = true;
      lastPct = pctBucket; lastWifiLevel = wifiLevelNow;
      lastBatterySample = now;
    }
    static bool scrolling = false;
    static int scrollOffset = 0; // positive downward offset applied (content drawn at startY - scrollOffset)
    static int scrollMax = 0;    // total scrollable extra pixels
    static unsigned long lastScrollFrame = 0;
    if (firstDraw || gAdminOverlayReset) {
      // One-time full paint
      M5.Lcd.fillScreen(gAdminMessageColor);
      needBar = true;
      // Draw wrapped message once
      String raw = gAdminMessage; int screenW = M5.Lcd.width(); int screenH = M5.Lcd.height();
      int topOffset = 15; int bottomReserve = 10; int availH = screenH - topOffset - bottomReserve; // Reduced margins for more space

      // Special case: very short message (<=10 chars, no space) -> attempt ultra-large single-line full-screen display
      bool shortSingle = false;
      for (size_t i=0;i<raw.length();++i){ if (raw[i]==' '){ shortSingle=false; break; } shortSingle=true; }
      if (raw.length() > 0 && raw.length() <= 10 && shortSingle) {
        // Find largest text size that fits horizontally and vertically
        int bestSize = 1;
        for (int sz = ADMIN_MSG_MAX_TEXT_SIZE; sz >= 1; --sz) {
          int charW = 6 * sz; int charH = 8 * sz + 2;
          int textW = raw.length() * charW; int textH = charH;
          if (textW <= screenW - 8 && textH <= screenH - 8) { bestSize = sz; break; }
        }
        // Draw without status bar for maximum area
        needBar = false; // skip top bar when ultra-large
        M5.Lcd.fillScreen(gAdminMessageColor);
        M5.Lcd.setTextSize(bestSize);
        M5.Lcd.setTextColor(WHITE);
        int charH = 8*bestSize + 2; int textW = raw.length() * (6*bestSize);
        int x = (screenW - textW) / 2; if (x < 0) x = 0;
        int y = (screenH - charH) / 2; if (y < 0) y = 0;
        M5.Lcd.setCursor(x,y); M5.Lcd.print(raw);
        // Small dismiss hint at bottom
        M5.Lcd.setTextSize(1); String hint="Btn A dismiss"; int hw=hint.length()*6; M5.Lcd.setCursor((screenW-hw)/2, screenH-8); M5.Lcd.print(hint);
        firstDraw = false; gAdminOverlayReset = false; needIcons = false; // no icons in giant mode
        return; // done
      }
      struct Wrapped { int textSize; std::vector<String> lines; } best; 
      // Attempt from configured max size downward
      bool usedTargetBias = false;
      for (int sz=ADMIN_MSG_MAX_TEXT_SIZE; sz>=1; --sz) {
        int charW=6*sz, charH=8*sz+2; int maxLines=availH/charH; int maxChars=screenW/charW; if (maxChars<2) continue; // Reduced from 4 to 2 to allow larger text
        String temp=raw; std::vector<String> lines; while (temp.length()>0) { if ((int)temp.length()<=maxChars){lines.push_back(temp); break;} int cut=maxChars; for(int i=cut;i>=0;--i){ if (temp[i]==' '){cut=i; break;} } lines.push_back(temp.substring(0,cut)); while(cut<(int)temp.length() && temp[cut]==' ') cut++; temp=temp.substring(cut); if((int)lines.size()>=maxLines) break; }
        if (temp.length()==0){ best.textSize=sz; best.lines=lines; break; }
        if (sz==1){ best.textSize=sz; best.lines=lines; }
      }
      if (best.textSize==0){ best.textSize=1; best.lines={raw}; }
      int charH = 8*best.textSize+2; int blockH = best.lines.size()*charH; 
      int startY; 
      scrolling = false; scrollOffset = 0; scrollMax = 0; lastScrollFrame = millis();
#if ADMIN_MSG_SCROLL_IF_OVERFLOW
      if (blockH > availH) {
        // Enable scrolling: start content at topOffset, scroll upward (simulate marquee) if overflows
        startY = topOffset; 
        scrolling = true;
        scrollMax = blockH - availH; // how many pixels we need to scroll through
      } else {
        startY = topOffset + (availH - blockH)/2; if (startY<topOffset) startY=topOffset;
      }
#else
      startY = topOffset + (availH - blockH)/2; if (startY<topOffset) startY=topOffset;
#endif
      // Render initial (may be clipped if scrolling) 
      M5.Lcd.setTextColor(WHITE); M5.Lcd.setTextSize(best.textSize);
      for(size_t i=0;i<best.lines.size();++i){ 
        int w = best.lines[i].length()*(6*best.textSize); int x=(screenW-w)/2; if (x<2) x=2; 
        int lineY = startY + i*charH - scrollOffset; 
        if (lineY + charH < topOffset || lineY > topOffset + availH) continue; // basic vertical clip
        M5.Lcd.setCursor(x,lineY); M5.Lcd.print(best.lines[i]); 
      }
      M5.Lcd.setTextSize(1); String hint="Btn A dismiss"; int hw=hint.length()*6; M5.Lcd.setCursor((screenW-hw)/2, screenH-8); M5.Lcd.print(hint); // Moved hint closer to bottom
      firstDraw = false; gAdminOverlayReset = false; needIcons = true; // draw icons after
      // Store for incremental scroll refresh inside static captures
      // Reuse lastSrc etc; scrolling state static above.
    } else {
      // Handle scrolling updates without full repaint
#if ADMIN_MSG_SCROLL_IF_OVERFLOW
      if (scrolling && scrollMax > 0) {
        unsigned long nowMs = millis();
        if (nowMs - lastScrollFrame >= ADMIN_MSG_SCROLL_FRAME_INTERVAL_MS) {
          lastScrollFrame = nowMs;
          // Advance scrollOffset
          float step = (ADMIN_MSG_SCROLL_SPEED_PX_PER_SEC * (ADMIN_MSG_SCROLL_FRAME_INTERVAL_MS / 1000.0f));
          scrollOffset += (int)(step + 0.5f);
          if (scrollOffset > scrollMax) scrollOffset = scrollMax; // clamp (one pass)
          // Redraw scrolling region only (message body area)
          int screenW = M5.Lcd.width(); int screenH = M5.Lcd.height();
          int topOffset = 15; int bottomReserve = 10; int availH = screenH - topOffset - bottomReserve; // Match updated margins
          // Clear body area
          M5.Lcd.fillRect(0, topOffset, screenW, availH, gAdminMessageColor);
          // Re-wrap text quickly (duplicate minimal logic) to repaint lines at new offset
          String raw = gAdminMessage; struct LineWrap { std::vector<String> lines; int textSize; int charH; int startY; int availH; } wrap;
          // Determine size again (use last chosen best.textSize via static capture not stored; recompute)
          int chosenSize = 0; std::vector<String> lines;
          for (int sz=ADMIN_MSG_MAX_TEXT_SIZE; sz>=1; --sz) {
            int charW=6*sz, charH=8*sz+2; int maxLines=availH/charH; int maxChars=screenW/charW; if (maxChars<2) continue; // Reduced from 4 to 2
            String temp=raw; std::vector<String> tmp; while (temp.length()>0){ if((int)temp.length()<=maxChars){tmp.push_back(temp); break;} int cut=maxChars; for(int i=cut;i>=0;--i){ if (temp[i]==' '){cut=i; break;} } tmp.push_back(temp.substring(0,cut)); while(cut<(int)temp.length() && temp[cut]==' ') cut++; temp=temp.substring(cut); if((int)tmp.size()>=maxLines) break; }
            if (temp.length()==0){ chosenSize=sz; lines=tmp; break; }
            if (sz==1){ chosenSize=sz; lines=tmp; }
          }
          if (chosenSize==0){ chosenSize=1; lines={raw}; }
          int charH = 8*chosenSize+2; int blockH = lines.size()*charH; int startY = topOffset; // for scrolling we always start at top
          M5.Lcd.setTextSize(chosenSize); M5.Lcd.setTextColor(WHITE);
          for(size_t i=0;i<lines.size(); ++i){ int w=lines[i].length()*(6*chosenSize); int x=(screenW-w)/2; if (x<2) x=2; int lineY=startY + i*charH - scrollOffset; if (lineY + charH < topOffset || lineY > topOffset + availH) continue; M5.Lcd.setCursor(x,lineY); M5.Lcd.print(lines[i]); }
          // Redraw hint (static) with updated position
          M5.Lcd.setTextSize(1); String hint="Btn A dismiss"; int hw=hint.length()*6; M5.Lcd.setCursor((screenW-hw)/2, screenH-8); M5.Lcd.print(hint);
        }
      }
#endif
    }
    if (needBar) {
      // Monochrome HUD-style bar: black background, white text, left-aligned
      M5.Lcd.fillRect(0,0,M5.Lcd.width(),16,BLACK);
      M5.Lcd.setTextSize(1); M5.Lcd.setTextColor(WHITE); M5.Lcd.setCursor(2,4);
      if (isProgram) M5.Lcd.print("PROGRAM"); else if (isPreview) M5.Lcd.print("PREVIEW"); else M5.Lcd.print("IDLE");
      // Show current source trimmed on the right side without overlapping battery/percent
      const int screenW = M5.Lcd.width();
      const int battW = 24; const int tipW = 3; const int battX = screenW - (battW + tipW + 2);
      int rightBoundary = battX; if (gBattPctLeftX >= 0 && gBattPctLeftX < battX) { rightBoundary = gBattPctLeftX - 2; if (rightBoundary < 0) rightBoundary = 0; }
      if (currentSource.length()>0) {
        String src=currentSource; int maxChars = (rightBoundary - 4) / 6; if (maxChars < 0) maxChars = 0;
        if ((int)src.length() > maxChars) { int keep = max(0, maxChars - 3); src = src.substring(0, keep) + "..."; }
        int w=src.length()*6; int x = rightBoundary - w; if (x < 2) x = 2; M5.Lcd.setCursor(x,4); M5.Lcd.print(src);
      }
      needIcons = true; // bar overwrote icon area
      lastProg = isProgram; lastPrev = isPreview; lastSrc = currentSource;
    }
    if (needIcons) {
      // Clear icon zone to background color then redraw icons
      int screenW = M5.Lcd.width();
      M5.Lcd.fillRect(screenW-80,0,80,16,gAdminMessageColor);
      BatteryInfo b = readBattery(); drawBatteryIndicator(b); drawWiFiIndicator();
    }
    return;    
  }

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
  
  // Real-time info overlay (Button B long hold >600ms) coexisting with double press
  static bool prevBPressed = false;
  static unsigned long btnBHoldStart = 0;
  if (M5.BtnB.isPressed()) {
    if (!prevBPressed) { btnBHoldStart = millis(); prevBPressed = true; }
    if (!showingAssignmentConfirmation && !showingRegistrationStatus) {
      if ((millis() - btnBHoldStart) > 600) {
        if (!infoOverlayActive) {
          infoOverlayActive = true;
          drawInfoOverlay();
          return; // skip normal status refresh this loop
        } else {
          static unsigned long lastInfoRefresh = 0; 
          if (millis() - lastInfoRefresh > 1500) { // periodic refresh
            drawInfoOverlay();
            lastInfoRefresh = millis();
          }
          return;
        }
      }
    }
  } else {
    if (infoOverlayActive) { infoOverlayActive = false; lastDisplayUpdate = 0; }
    prevBPressed = false;
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
                     (currentSource != lastSource) ||
                     (currentLiveSource != lastRenderedLiveSource) ||
                     (lastLiveSourceUpdate != lastRenderedLiveTs);
  
  if (stateChanged || (millis() - lastDisplayUpdate > 30000)) { // Longer interval - 30 seconds to reduce flicker
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
      showTallyState("PROGRAM", RED);
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
    // Update live context snapshots
    lastRenderedLiveSource = currentLiveSource;
    lastRenderedLiveTs = lastLiveSourceUpdate;
  }
}

void showStatus(String message, uint16_t color) {
  // Clear screen below permanent status bar
  M5.Lcd.fillRect(0, 16, M5.Lcd.width(), M5.Lcd.height() - 16, color);
  
  // Always draw permanent status bar at top
  drawPermanentStatusBar();
  
  // Apply specific formatting improvements for common messages
  String displayMessage = message;
  
  // Improve readability of common status messages
  if (message == "Connecting...") {
    displayMessage = "Connecting";
  } else if (message == "NO WIFI") {
    displayMessage = "No WiFi";
  } else if (message == "HUB LOST") {
    displayMessage = "Hub Lost";
  } else if (message == "Config Mode") {
    displayMessage = "Config";
  } else if (message == "WiFi OK") {
    displayMessage = "WiFi OK";
  } else if (message == "UNASSIGNED") {
    displayMessage = "Unassigned";
  }
  
  // Draw main status text in area below status bar
  uint16_t textColor = WHITE;
  drawCenteredStatus(displayMessage, color, textColor);
  
  // Show additional info for specific status messages
  if (message == "HUB LOST" || message == "Connecting..." || message == "UNASSIGNED" || message == "NO WIFI") {
    M5.Lcd.setTextSize(1);
    M5.Lcd.setTextColor(WHITE);
    
    // For WiFi-related issues, show network info if available
    if ((message == "HUB LOST" || message == "Connecting..." || message == "UNASSIGNED") && WiFi.status() == WL_CONNECTED) {
      String ipText = "IP: " + WiFi.localIP().toString();
      int yBase = M5.Lcd.height()/2 + 28; // Position below main text
      int textWidth = ipText.length() * 6;
      int x = (M5.Lcd.width() - textWidth) / 2;
      if (x < 4) x = 4;
      M5.Lcd.setCursor(x, yBase);
      M5.Lcd.print(ipText);
    }
    
    // For "NO WIFI", show helpful hint
    if (message == "NO WIFI") {
      String hintText = "Hold A for Config";
      int yBase = M5.Lcd.height()/2 + 28;
      int textWidth = hintText.length() * 6;
      int x = (M5.Lcd.width() - textWidth) / 2;
      if (x < 4) x = 4;
      M5.Lcd.setCursor(x, yBase);
      M5.Lcd.print(hintText);
    }
  }
}

void showTallyState(String state, uint16_t color) {
  // Clear screen below permanent status bar
  M5.Lcd.fillRect(0, 16, M5.Lcd.width(), M5.Lcd.height() - 16, color);
  
  // Always draw permanent status bar at top
  drawPermanentStatusBar();
  
  // Draw recording/streaming banner at bottom with improved layout
  if (isRecording || isStreaming) {
    uint16_t bandColor = (isRecording ? RED : 0x07E0);
    if (isRecording && isStreaming) bandColor = 0xF81F;
    M5.Lcd.fillRect(0, 119, 240, 16, bandColor);
    M5.Lcd.setTextSize(1);
    M5.Lcd.setTextColor(WHITE);
    
    String bannerText;
    if (isRecording && isStreaming) bannerText = "REC & STREAM";
    else if (isRecording) bannerText = "RECORDING";
    else if (isStreaming) bannerText = "STREAMING";
    
    // Center the banner text
    int textWidth = bannerText.length() * 6;
    int x = (M5.Lcd.width() - textWidth) / 2;
    if (x < 4) x = 4;
    M5.Lcd.setCursor(x, 123);
    M5.Lcd.print(bannerText);
  }
  
  // Enhance tally state display with better formatting
  String displayState = state;
  
  // Format common tally states for better readability
  if (state == "PROGRAM") {
    displayState = "PROGRAM";
  } else if (state == "PREVIEW") {
    displayState = "PREVIEW";
  } else if (state == "IDLE") {
    displayState = "IDLE";
  } else if (state == "UNASSIGNED") {
    displayState = "Unassigned";
  }
  
  // Calculate main text position considering status bar and bottom banner
  int screenW = M5.Lcd.width();
  int screenH = M5.Lcd.height();
  int usableTop = 16; // Status bar height
  int usableBottom = (isRecording || isStreaming) ? 16 : 0;
  int usableH = screenH - usableTop - usableBottom;

  // Main centered state text (in area below status bar)
  drawCenteredStatus(displayState, color, WHITE);
}

// Draw large centered status text choosing optimal text size for readability.
void drawCenteredStatus(const String &text, uint16_t bgColor, uint16_t textColor) {
  // Reserve top 16px for battery/Wi-Fi region (they occupy y ~ 0..15)
  int screenW = M5.Lcd.width();
  int screenH = M5.Lcd.height();
  int usableTop = 16;
  int usableH = screenH - usableTop - 20; // leave some room for bottom banner if present
  if (usableH < 10) usableH = screenH; // fallback
  
  if (text.length() == 0) return;
  
  // Improved text sizing algorithm for better readability
  // - Single word short messages (1-6 chars): Use larger text but not excessively large
  // - Medium messages (7-12 chars): Balanced size for good visibility
  // - Long messages: Smaller size but still readable, with word wrapping if needed
  
  bool isSingleWord = (text.indexOf(' ') == -1);
  int len = text.length();
  int optimalSize = 1;
  
  // Calculate optimal size based on content type and length
  if (isSingleWord && len <= 6) {
    // Short single words: Use size 3-4 for good visibility without being overwhelming
    optimalSize = (len <= 3) ? 4 : 3;
  } else if (len <= 8) {
    // Medium length: Use size 3 for good balance
    optimalSize = 3;
  } else if (len <= 12) {
    // Longer messages: Size 2 for readability
    optimalSize = 2;
  } else {
    // Very long messages: Check if we need word wrapping
    optimalSize = 1;
  }
  
  // Check if text fits at optimal size, otherwise scale down
  for (int sz = optimalSize; sz >= 1; --sz) {
    int charWidth = 6 * sz;
    int textWidth = len * charWidth;
    int textHeight = 8 * sz;
    
    // Check if single line fits with reasonable margins
    if (textWidth <= screenW - 16) { // 8px margin each side
      // Position the text for optimal readability
      int x = (screenW - textWidth) / 2;
      int y = usableTop + (usableH - textHeight) / 2;
      if (y < usableTop) y = usableTop;
      
      M5.Lcd.setTextSize(sz);
      M5.Lcd.setTextColor(textColor);
      M5.Lcd.setCursor(x, y);
      M5.Lcd.print(text);
      return;
    }
  }
  
  // Fallback for extremely long text - word wrap with size 1
  M5.Lcd.setTextSize(1);
  M5.Lcd.setTextColor(textColor);
  
  // Simple word wrapping for very long messages
  String remaining = text;
  int maxCharsPerLine = (screenW - 16) / 6; // 6px per char at size 1
  int lineHeight = 10; // 8px + 2px spacing
  int currentY = usableTop + 8;
  
  while (remaining.length() > 0 && currentY < screenH - 20) {
    String line;
    if ((int)remaining.length() <= maxCharsPerLine) {
      line = remaining;
      remaining = "";
    } else {
      // Find good break point
      int breakPoint = maxCharsPerLine;
      for (int i = maxCharsPerLine; i >= maxCharsPerLine * 2 / 3; i--) {
        if (i < (int)remaining.length() && remaining[i] == ' ') {
          breakPoint = i;
          break;
        }
      }
      line = remaining.substring(0, breakPoint);
      remaining = remaining.substring(breakPoint);
      remaining.trim(); // Remove leading spaces
    }
    
    // Center the line
    int lineWidth = line.length() * 6;
    int x = (screenW - lineWidth) / 2;
    if (x < 2) x = 2;
    
    M5.Lcd.setCursor(x, currentY);
    M5.Lcd.print(line);
    currentY += lineHeight;
  }
}

void drawInfoOverlay() {
  // Clear screen below permanent status bar
  M5.Lcd.fillRect(0, 16, M5.Lcd.width(), M5.Lcd.height() - 16, BLACK);
  
  // Always draw permanent status bar at top
  drawPermanentStatusBar();
  
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.setTextSize(2);

  int y = 26; // Start below status bar
  // Source name
  String displaySource;
  if (customDisplayName.length() > 0) displaySource = customDisplayName;
  else if (assignedSourceName.length() > 0) displaySource = assignedSourceName;
  else if (currentSource.length() > 0) displaySource = currentSource;
  else if (assignedSource.length() > 0) displaySource = cleanSourceName(assignedSource);
  else displaySource = "No Source";
  if (displaySource.length() > 12) displaySource = displaySource.substring(0,11) + "...";
  M5.Lcd.setCursor(8, y); M5.Lcd.print(displaySource); y += 26;
  M5.Lcd.setTextSize(1);
  M5.Lcd.setCursor(8, y); M5.Lcd.printf("IP: %s", WiFi.localIP().toString().c_str()); y += 12;
  M5.Lcd.setCursor(8, y); M5.Lcd.printf("ID: %s", device_id.c_str()); y += 12;
  M5.Lcd.setCursor(8, y); M5.Lcd.printf("Hub: %s:%d", hub_ip.c_str(), hub_port); y += 12;
  // Network selection instruction
  M5.Lcd.setCursor(8, M5.Lcd.height() - 26);
  M5.Lcd.print("A+B: Network selection");
  // Instructions
  M5.Lcd.setCursor(8, M5.Lcd.height() - 14);
  M5.Lcd.print("Release A to hide");
}

void showDeviceInfo() {
  showingDeviceInfo = true;
  deviceInfoStart = millis();
}

// Map voltage (V) to approximate percentage using a piecewise curve for 1S LiPo.
// Based on common discharge curve; improves accuracy near 3.6-4.0V compared to linear.
static int voltageToPercent(float v) {
  // Shared curve for both Plus 1.1 (AXP192) and Plus2 (M5Unified)
  if (v <= 3.30f) return 0;
  if (v >= 4.20f) return 100;

  // Voltage-to-percent table (descending V): {voltage, percent}
  // Adjusted table (focus on smoother mid-band; no latch logic active)
  static const float table[][2] = {
    {4.20f, 100.0f},
    {4.12f,  95.0f},
    {4.07f,  90.0f},
    {4.00f,  82.0f},
    {3.95f,  76.0f},
    {3.90f,  72.0f},
    {3.85f,  68.0f},
  {3.82f,  65.0f},
    {3.77f,  58.0f},
    {3.73f,  50.0f},
    {3.68f,  42.0f},
    {3.63f,  34.0f},
    {3.58f,  24.0f},
    {3.52f,  14.0f},
    {3.46f,   7.0f},
    {3.40f,   3.0f},
    {3.30f,   0.0f}
  };

  // Find the interval and linearly interpolate
  for (int i = 0; i < (int)(sizeof(table) / sizeof(table[0])) - 1; ++i) {
    float v_hi = table[i][0];
    float p_hi = table[i][1];
    float v_lo = table[i + 1][0];
    float p_lo = table[i + 1][1];
    if (v <= v_hi && v >= v_lo) {
      float t = (v - v_lo) / (v_hi - v_lo); // 0..1
      float p = p_lo + t * (p_hi - p_lo);
      if (p < 0) p = 0;
      if (p > 100) p = 100;
      return (int)(p + 0.5f);
    }
  }
  // Fallback (shouldn't reach here due to clamps)
  float pct = (v - 3.30f) / (4.20f - 3.30f) * 100.0f;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return (int)(pct + 0.5f);
}

BatteryInfo readBattery() {
  BatteryInfo info;
  // Unified path: read millivolts, map voltage, apply asymmetric smoothing + lag guard.
  int mv = M5.Power.getBatteryVoltage();
  float vbat = (mv > 500 && mv < 5500) ? (mv / 1000.0f) : 0.0f;

  static float lastGoodV = 3.95f;
  if (!(vbat > 0.5f && vbat < 5.5f)) vbat = lastGoodV; else lastGoodV = vbat;

  bool usb = M5.Power.isCharging();
  bool charging = usb; // same signal for now

  int pctRaw = voltageToPercent(vbat);

  static float vFilt = 0.0f;
  static float pFilt = -1.0f;
  const float aRise = 0.22f;
  const float aFall = 0.38f;
  if (vFilt <= 0.0f) vFilt = vbat; else vFilt = vFilt * 0.78f + vbat * 0.22f;
  if (pFilt < 0.0f) pFilt = (float)pctRaw; else {
    float alpha = (pctRaw < pFilt) ? aFall : aRise;
    pFilt = pFilt * (1.0f - alpha) + (float)pctRaw * alpha;
  }

  static int lagCount = 0;
  if ((pFilt - pctRaw) >= 3.0f) {
    if (++lagCount >= 3) { pFilt = (float)pctRaw; lagCount = 0; }
  } else lagCount = 0;

  int pctRounded = (int)(pFilt + 0.5f);
  if (pctRounded < 0) pctRounded = 0; if (pctRounded > 100) pctRounded = 100;

  info.voltage = vFilt;
  info.percent = pctRounded;
  info.usb = usb;
  info.charging = (charging && pctRounded < 100);
  return info;
}

void drawBatteryIndicator(const BatteryInfo &info) {
  // Skip battery indicator when showing QR code in config mode to prevent overlap
  if (configMode && showQRCode) {
    return;
  }
  
  // Unified design for both devices (dynamic width from driver so board mismatch won't hide icons)
  const int screenW = M5.Lcd.width();
  const int y = 2;
  const int battW = 24; // body width
  const int battH = 12; // body height
  const int tipW = 3;
  const int gap = 2;   // gap between wifi and battery
  // Place battery at far right
  const int battX = screenW - (battW + tipW + 2); // leave 2px margin

  // Percent text will be to the left of Wi-Fi group; handled outside battery box for compactness
  // Draw outline
  M5.Lcd.drawRect(battX, y, battW, battH, WHITE);
  M5.Lcd.fillRect(battX + battW, y + (battH/3), tipW, battH/3, WHITE);
  // Inner fill area
  int innerW = battW - 4, innerH = battH - 4, px = battX + 2, py = y + 2;
  int levelW = (innerW * info.percent)/100; if (levelW < 0) levelW = 0; if (levelW > innerW) levelW = innerW;
  M5.Lcd.fillRect(px, py, innerW, innerH, BLACK);
  uint16_t fillColor = (info.percent < 15) ? RED : (info.percent < 30 ? 0xFD20 : (info.percent < 60 ? 0xFFE0 : 0x07E0));
  bool doBlink = (!info.charging && info.percent < 15);
  static unsigned long lastBlink = 0; static bool blinkOn = true;
  if (doBlink) {
    unsigned long now = millis();
    if (now - lastBlink > 700) { lastBlink = now; blinkOn = !blinkOn; }
  } else {
    blinkOn = true; // ensure visible when not blinking condition
  }
  if (blinkOn) {
    M5.Lcd.fillRect(px, py, levelW, innerH, fillColor);
  }

  // Charging / plugged icon centered inside (bolt animates)
  if (info.charging) {
    unsigned long now = millis(); if (now - gBatAnimLast > 260) { gBatAnimLast = now; gBatAnimPhase = (gBatAnimPhase + 1) % 4; }
    if (gBatAnimPhase < 3) {
      int cx = battX + battW/2 - 3; int cy = y + 2; // 6x8 area
      M5.Lcd.fillTriangle(cx, cy, cx+4, cy+4, cx+2, cy+4, WHITE);
      M5.Lcd.fillTriangle(cx+2, cy+4, cx+6, cy+8, cx+4, cy+8, WHITE);
    }
  } else if (info.usb) {
    int pxIcon = battX + battW/2 - 3, pyIcon = y + 2;
    M5.Lcd.drawRect(pxIcon, pyIcon, 6, 8, WHITE);
    M5.Lcd.drawFastVLine(pxIcon+1, pyIcon-2, 4, WHITE);
    M5.Lcd.drawFastVLine(pxIcon+4, pyIcon-2, 4, WHITE);
  }

  // Percent text left of battery (if enabled)
  #ifndef BATT_HIDE_PERCENT
    if (uiCfg.showBattPercent) {
      M5.Lcd.setTextColor(WHITE);
      bool small = uiCfg.smallBattPercent;
      #ifdef BATT_SMALL_PERCENT
        small = true; // compile-time override
      #endif
      int oldBoundary = gBattPctLeftX;
      M5.Lcd.setTextSize(1);
      int pctX;
      int clearW;
      int textY;
      if (small) {
        pctX = battX - 22; if (pctX < 0) pctX = 0;
        clearW = 24; // width previously used for small variant
        textY = y + 3;
      } else {
        pctX = battX - 28; if (pctX < 0) pctX = 0;
        clearW = 32; // allow a bit more space for 3 chars + percent symbol
        textY = y + 2;
      }
      // Clear previous percent region to avoid overdraw artifacts / overlap
      // Use max of previous and current extents to be safe
      int clearLeft = (oldBoundary >= 0 && oldBoundary < pctX) ? oldBoundary : pctX;
      int clearRight = battX - 2; // leave gap before battery outline
      if (clearLeft < 0) clearLeft = 0;
      if (clearRight > battX) clearRight = battX;
      int clearWidth = clearRight - clearLeft;
      if (clearWidth > 0) {
        M5.Lcd.fillRect(clearLeft, y, clearWidth, battH, BLACK);
      }
      gBattPctLeftX = pctX;
      M5.Lcd.setCursor(pctX, textY);
      if (small) {
        M5.Lcd.printf("%d%%", info.percent);
      } else {
        M5.Lcd.printf("%3d%%", info.percent);
      }
      // If boundary changed, request Wi-Fi redraw (immediate) to realign icon spacing
      if (oldBoundary != gBattPctLeftX) {
        drawWiFiIndicator();
      }
    }
  #endif
  #ifdef BATT_HIDE_PERCENT
    gBattPctLeftX = battX; // no percent text, treat boundary at battery
  #else
    if (!uiCfg.showBattPercent) { gBattPctLeftX = battX; }
  #endif

  // (Removed debug voltage overlay)
}

// Map RSSI (dBm) to level 0..4 similar to iPhone style thresholds
static int wifiLevelFromRSSI(int32_t rssi) {
  if (rssi >= -55) return 4;   // Excellent
  if (rssi >= -65) return 3;   // Good
  if (rssi >= -72) return 2;   // Fair
  if (rssi >= -82) return 1;   // Weak
  return 0;                    // Very weak / none
}

// Draw permanent status bar (black background, 16px high) at top of screen
void drawPermanentStatusBar() {
  const int screenW = M5.Lcd.width();
  const int barHeight = 16;
  
  // Clear and draw status bar background
  M5.Lcd.fillRect(0, 0, screenW, barHeight, BLACK);
  
  // Draw battery and Wi-Fi indicators within the status bar
  BatteryInfo b = readBattery();
  drawBatteryIndicator(b);
  drawWiFiIndicator();
  
  // Determine text content for status bar
  String statusText = "";
  bool useScrolling = false;
  
  if (gAdminMessageActive) {
    // Show admin message in status bar (no scrolling to prevent flickering)
    statusText = gAdminMessage;
    useScrolling = false;
  } else if (WiFi.status() != WL_CONNECTED) {
    statusText = "NO WIFI";
  } else if (!isRegisteredWithHub) {
    statusText = "Connecting...";
  } else if (!isAssigned || assignedSource.length() == 0) {
    statusText = "UNASSIGNED";
  } else {
    // Show current live source from mixer (not this device's state)
    if (currentLiveSource.length() > 0) {
      unsigned long timeSinceUpdate = millis() - lastLiveSourceUpdate;
      if (timeSinceUpdate < 120000) {
        // Show the live source name with label
        statusText = "Current Live: " + currentLiveSource;
      } else {
        // Live source info is stale
        if (isProgram) {
          statusText = "PROGRAM";
        } else if (isPreview) {
          statusText = "PREVIEW";
        } else {
          statusText = "IDLE";
        }
      }
    } else {
      // No live source info available, fall back to device state
      if (isProgram) {
        statusText = "PROGRAM";
      } else if (isPreview) {
        statusText = "PREVIEW";
      } else {
        statusText = "IDLE";
      }
    }
  }
  
  // Calculate available text width (avoid battery/wifi area)
  const int battW = 24; const int tipW = 3; const int battX = screenW - (battW + tipW + 2);
  int rightBoundary = battX;
  if (gBattPctLeftX >= 0 && gBattPctLeftX < battX) {
    rightBoundary = gBattPctLeftX - 2;
    if (rightBoundary < 0) rightBoundary = 0;
  }
  int maxChars = (rightBoundary - 4) / 6; // 2px padding each side, 6px per char
  
  // Handle text truncation for all messages (no scrolling to prevent flickering)
  String displayText = statusText;
  if (maxChars > 0 && (int)statusText.length() > maxChars) {
    // Truncate with ellipsis for any long text
    int keep = max(0, maxChars - 3);
    displayText = statusText.substring(0, keep) + "...";
  }
  
  // Draw status text (left-aligned, white text)
  M5.Lcd.setTextSize(1);
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.setCursor(2, 4);
  M5.Lcd.print(displayText);
}

void drawWiFiIndicator() {
  // Skip WiFi indicator when showing QR code in config mode to prevent overlap
  if (configMode && showQRCode) {
    return;
  }
  
  static float levelSmooth = -1.0f; // EMA of level for flicker reduction
  bool connected = (WiFi.status() == WL_CONNECTED);

  const int screenW = M5.Lcd.width();
  const int y = 2; // Within status bar (0-16px)
  
  // Battery sits at right edge; compute its X used inside drawBatteryIndicator.
  const int battW = 24; const int tipW = 3; const int battX = screenW - (battW + tipW + 2);
  // Determine right boundary for Wi-Fi: if battery percent is shown it may extend left of battery
  int rightBoundary = battX; // default
  if (gBattPctLeftX >= 0 && gBattPctLeftX < battX) {
    // Percent text present; leave a gap before its left edge
    rightBoundary = gBattPctLeftX - 2; // 2px spacing
    if (rightBoundary < 0) rightBoundary = 0;
  }
  const int gap = 2; // smaller gap now that alignment improved
  int wifiRight = rightBoundary - gap; // rightmost pixel available for wifi icon
  if (wifiRight < 14) wifiRight = 14; // ensure space for icon

  int baseX = wifiRight - 14; // total width ~14px
  if (baseX < 0) baseX = 0;

  int32_t rssi = connected ? WiFi.RSSI() : -200; // force worst when disconnected
  int rawLevel = connected ? wifiLevelFromRSSI(rssi) : 0;
  // EMA smoothing (treat disconnect as immediate drop)
  float target = (float)rawLevel;
  float alpha = 0.35f; // smoothing factor
  if (!connected) alpha = 0.75f; // faster fall when disconnecting
  if (levelSmooth < 0) levelSmooth = target; else levelSmooth = levelSmooth * (1.0f - alpha) + target * alpha;
  int level = (int)(levelSmooth + 0.5f);
  if (level < 0) level = 0; if (level > 4) level = 4;

  // Draw Wi‑Fi as 4 vertical bars (monochrome), left-to-right short-to-tall
  // Palette: white for active bars, dark gray outline for inactive
  uint16_t barActive = WHITE;
  uint16_t barOutline = 0x4208; // dark gray outline
  // Define bar geometry
  const int barCount = 4;
  const int barW = 2;
  const int barGap = 1;
  // Heights relative to status bar (constrained to y=2 to y=14, so 12px max)
  const int barHeights[barCount] = {3, 6, 9, 12};
  // Compute leftmost X so bars end at wifiRight
  int totalW = barCount*barW + (barCount-1)*barGap;
  int barsLeft = wifiRight - totalW;
  if (barsLeft < baseX) barsLeft = baseX;
  int bottom = y + 12; // bottom baseline within status bar
  for (int i=0; i<barCount; ++i) {
    int h = barHeights[i];
    int bx = barsLeft + i*(barW + barGap);
    int by = bottom - h;
    // Outline
    M5.Lcd.drawRect(bx, by, barW, h, barOutline);
    // Fill if enabled per level
    bool enabled = (level >= (i+1));
    if (enabled) {
      // Fill inside the outline to keep a crisp border when possible
      int fx = bx + 1; int fw = max(0, barW - 2);
      if (fw <= 0) { fw = barW; fx = bx; }
      int fy = by + 1; int fh = max(0, h - 2);
      if (fh <= 0) { fh = h; fy = by; }
      M5.Lcd.fillRect(fx, fy, fw, fh, barActive);
    }
  }

  // Draw X overlay if disconnected
  bool showX = uiCfg.wifiShowDisconnectX;
  #ifdef WIFI_NO_DISCONNECT_X
    showX = false;
  #endif
  if (!connected && showX) {
    uint16_t xc = RED;
    int x0 = baseX + 1, y0 = y + 2;
    int x1 = wifiRight - 2, y1 = y + 12;
    for (int i=0;i<2;i++) {
      M5.Lcd.drawLine(x0, y0+i, x1, y1+i, xc);
      M5.Lcd.drawLine(x0, y1-i, x1, y0-i, xc);
    }
  }
}

void loadConfiguration() {
  wifi_ssid = preferences.getString("wifi_ssid", "");
  wifi_password = preferences.getString("wifi_password", "");
  hub_ip = preferences.getString("hub_ip", ""); // Empty default - use auto-discovery
  hub_port = preferences.getInt("hub_port", 7411);
  
  // Generate unique device ID if not set
  String defaultDeviceId = preferences.getString("device_id", "");
  if (defaultDeviceId.isEmpty()) {
    // Generate unique device ID using MAC address
    String macAddress = WiFi.macAddress();
    macAddress.replace(":", "");
    macAddress.toLowerCase();
    defaultDeviceId = "m5-tally-" + macAddress.substring(6);
    preferences.putString("device_id", defaultDeviceId);
  }
  device_id = defaultDeviceId;
  device_name = preferences.getString("device_name", "M5 Tally Light");
  auto_discovery_enabled = preferences.getBool("auto_disc", true);
  
  // Load live source context for display
  currentLiveSource = preferences.getString("live_source", "");
  lastLiveSourceUpdate = preferences.getULong64("live_source_time", 0);
  
  // UI elements always enabled for optimal user experience
  uiCfg.showBattPercent = true;
  uiCfg.smallBattPercent = false; // Normal size for better readability
  uiCfg.wifiOutline = true;
  uiCfg.wifiShowDisconnectX = true;
  uiCfg.wifiSpriteIcons = false; // Simple icons for better performance
  
  Serial.println("Configuration loaded:");
  Serial.printf("WiFi SSID: %s\n", wifi_ssid.c_str());
  Serial.printf("Hub IP: %s:%d\n", hub_ip.c_str(), hub_port);
  Serial.printf("Device: %s (%s)\n", device_name.c_str(), device_id.c_str());
  if (currentLiveSource.length() > 0) {
    Serial.printf("Last live source: %s\n", currentLiveSource.c_str());
  }
}

void saveConfiguration() {
  preferences.putString("wifi_ssid", wifi_ssid);
  preferences.putString("wifi_password", wifi_password);
  preferences.putString("hub_ip", hub_ip);
  preferences.putInt("hub_port", hub_port);
  preferences.putString("device_id", device_id);
  preferences.putString("device_name", device_name);
  preferences.putBool("auto_disc", auto_discovery_enabled);
  
  // Save live source context for display persistence
  preferences.putString("live_source", currentLiveSource);
  preferences.putULong64("live_source_time", lastLiveSourceUpdate);
  
  // UI elements are now hardcoded for optimal experience - no persistence needed
  
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

// WiFi Memory System Functions
void loadSavedNetworks() {
  networkCount = preferences.getInt("wifi_count", 0);
  if (networkCount > MAX_WIFI_NETWORKS) networkCount = MAX_WIFI_NETWORKS;
  
  for (int i = 0; i < networkCount; i++) {
    String ssidKey = "wifi_ssid_" + String(i);
    String passKey = "wifi_pass_" + String(i);
    String activeKey = "wifi_active_" + String(i);
    
    savedNetworks[i].ssid = preferences.getString(ssidKey.c_str(), "");
    savedNetworks[i].password = preferences.getString(passKey.c_str(), "");
    savedNetworks[i].isActive = preferences.getBool(activeKey.c_str(), true);
  }
  
  Serial.printf("Loaded %d saved WiFi networks\n", networkCount);
}

void saveSavedNetworks() {
  preferences.putInt("wifi_count", networkCount);
  
  for (int i = 0; i < networkCount; i++) {
    String ssidKey = "wifi_ssid_" + String(i);
    String passKey = "wifi_pass_" + String(i);
    String activeKey = "wifi_active_" + String(i);
    
    preferences.putString(ssidKey.c_str(), savedNetworks[i].ssid);
    preferences.putString(passKey.c_str(), savedNetworks[i].password);
    preferences.putBool(activeKey.c_str(), savedNetworks[i].isActive);
  }
  
  Serial.printf("Saved %d WiFi networks to memory\n", networkCount);
}

void addNetworkToMemory(String ssid, String password) {
  // Check if network already exists
  for (int i = 0; i < networkCount; i++) {
    if (savedNetworks[i].ssid == ssid) {
      // Update existing network
      savedNetworks[i].password = password;
      savedNetworks[i].isActive = true;
      Serial.printf("Updated existing network: %s\n", ssid.c_str());
      saveSavedNetworks();
      return;
    }
  }
  
  // Add new network if space available
  if (networkCount < MAX_WIFI_NETWORKS) {
    savedNetworks[networkCount].ssid = ssid;
    savedNetworks[networkCount].password = password;
    savedNetworks[networkCount].isActive = true;
    networkCount++;
    Serial.printf("Added new network to memory: %s\n", ssid.c_str());
  } else {
    // Replace oldest network (index 0)
    for (int i = 0; i < MAX_WIFI_NETWORKS - 1; i++) {
      savedNetworks[i] = savedNetworks[i + 1];
    }
    savedNetworks[MAX_WIFI_NETWORKS - 1].ssid = ssid;
    savedNetworks[MAX_WIFI_NETWORKS - 1].password = password;
    savedNetworks[MAX_WIFI_NETWORKS - 1].isActive = true;
    Serial.printf("Replaced oldest network with: %s\n", ssid.c_str());
  }
  
  saveSavedNetworks();
}

bool removeNetworkFromMemory(int index) {
  if (index < 0 || index >= networkCount) {
    Serial.printf("Invalid network index for removal: %d\n", index);
    return false;
  }
  
  Serial.printf("Removing network: %s (index %d)\n", savedNetworks[index].ssid.c_str(), index);
  
  // Shift all networks after the removed one down by one position
  for (int i = index; i < networkCount - 1; i++) {
    savedNetworks[i] = savedNetworks[i + 1];
  }
  
  // Clear the last slot
  savedNetworks[networkCount - 1].ssid = "";
  savedNetworks[networkCount - 1].password = "";
  savedNetworks[networkCount - 1].isActive = false;
  
  networkCount--;
  saveSavedNetworks();
  
  Serial.printf("Network removed. %d networks remaining\n", networkCount);
  return true;
}

void clearAllSavedNetworks() {
  Serial.println("Clearing all saved networks");
  
  for (int i = 0; i < MAX_WIFI_NETWORKS; i++) {
    savedNetworks[i].ssid = "";
    savedNetworks[i].password = "";
    savedNetworks[i].isActive = false;
  }
  
  networkCount = 0;
  saveSavedNetworks();
  
  Serial.println("All saved networks cleared");
}

bool connectToKnownNetworks() {
  Serial.println("Trying to connect to known networks...");
  
  // First, scan for available networks
  int n = WiFi.scanNetworks();
  if (n == 0) {
    Serial.println("No networks found");
    return false;
  }
  
  // Try each saved network that is available
  for (int i = 0; i < networkCount; i++) {
    if (!savedNetworks[i].isActive) continue;
    
    // Check if this saved network is available
    for (int j = 0; j < n; j++) {
      if (WiFi.SSID(j) == savedNetworks[i].ssid) {
        Serial.printf("Found known network: %s\n", savedNetworks[i].ssid.c_str());
        if (tryConnectToNetwork(savedNetworks[i].ssid, savedNetworks[i].password)) {
          WiFi.scanDelete(); // Clean up scan results
          return true;
        }
        break;
      }
    }
  }
  
  WiFi.scanDelete(); // Clean up scan results
  Serial.println("Could not connect to any known networks");
  return false;
}

bool tryConnectToNetwork(String ssid, String password) {
  Serial.printf("Attempting to connect to: %s\n", ssid.c_str());
  
  WiFi.begin(ssid.c_str(), password.c_str());
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nSuccessfully connected to: %s\n", ssid.c_str());
    // Update current WiFi variables for compatibility
    wifi_ssid = ssid;
    wifi_password = password;
    return true;
  } else {
    Serial.printf("\nFailed to connect to: %s\n", ssid.c_str());
    return false;
  }
}

void startConfigMode() {
  configMode = true;
  configModeTimeout = millis();
  
  Serial.println("Starting configuration mode");
  
  // Start WiFi Access Point (use AP+STA so we can scan while in config mode)
  // Some ESP32 stacks require STA enabled for scan results to populate.
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
  WiFi.softAP(AP_SSID.c_str(), AP_PASSWORD);
  
  // Start DNS server for captive portal
  dnsServer.start(53, "*", AP_IP);
  
  // Setup web server
  setupWebServer();
  server.begin();
  
  // Small delay to ensure everything is initialized
  delay(500);
  
  // Display QR code initially
  displayWiFiQRCode();
  
  Serial.printf("Config AP started: %s\n", AP_SSID.c_str());
  Serial.println("Connect to WiFi and go to 192.168.4.1");
}

void handleConfigMode() {
  dnsServer.processNextRequest();
  server.handleClient();
  
  M5.update();
  
  // Button A toggles between QR code and text info
  if (M5.BtnA.wasPressed()) {
    showQRCode = !showQRCode;
    if (showQRCode) {
      displayWiFiQRCode();
    } else {
      displayWiFiInfo();
    }
  }
  
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

// Generate and display actual scannable QR Code for WiFi credentials
void displayWiFiQRCode() {
  Serial.println("Displaying WiFi QR Code");
  M5.Lcd.fillScreen(BLACK);
  
  // QR code data for WiFi: WIFI:T:WPA;S:SSID;P:PASSWORD;;
  String qrData = "WIFI:T:WPA;S:" + AP_SSID + ";P:" + String(AP_PASSWORD) + ";;";
  Serial.printf("QR Data: %s\n", qrData.c_str());
  
  // Create QR Code
  QRCode qrcode;
  uint8_t qrcodeData[qrcode_getBufferSize(3)];
  qrcode_initText(&qrcode, qrcodeData, 3, 0, qrData.c_str());
  
  Serial.printf("QR Code size: %d\n", qrcode.size);
  
  // Calculate QR code display parameters for full screen
  int maxScale = min(M5.Lcd.width() / qrcode.size, M5.Lcd.height() / qrcode.size);
  int scale = max(1, maxScale); // Ensure at least scale of 1
  int qrDisplaySize = qrcode.size * scale;
  int startX = (M5.Lcd.width() - qrDisplaySize) / 2;
  int startY = (M5.Lcd.height() - qrDisplaySize) / 2;
  
  Serial.printf("Display: %dx%d, Scale: %d, Start: (%d,%d)\n", 
                M5.Lcd.width(), M5.Lcd.height(), scale, startX, startY);
  
  // Draw QR code with inverted colors (white on black for better contrast)
  for (uint8_t y = 0; y < qrcode.size; y++) {
    for (uint8_t x = 0; x < qrcode.size; x++) {
      // Invert colors: QR modules are white, background is black
      uint16_t color = qrcode_getModule(&qrcode, x, y) ? WHITE : BLACK;
      
      if (scale == 1) {
        M5.Lcd.drawPixel(startX + x, startY + y, color);
      } else {
        // Draw scaled modules
        M5.Lcd.fillRect(startX + x * scale, startY + y * scale, scale, scale, color);
      }
    }
  }
  
  Serial.println("QR Code displayed");
}

void displayWiFiInfo() {
  // Clear screen below permanent status bar
  M5.Lcd.fillRect(0, 16, M5.Lcd.width(), M5.Lcd.height() - 16, BLUE);
  
  // Always draw permanent status bar at top - show config mode status
  M5.Lcd.fillRect(0, 0, M5.Lcd.width(), 16, BLACK);
  M5.Lcd.setTextSize(1);
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.setCursor(2, 3);
  M5.Lcd.print("Config Mode");
  
  // Draw battery and Wi-Fi in status bar
  BatteryInfo b = readBattery();
  drawBatteryIndicator(b);
  drawWiFiIndicator();
  
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.setTextSize(1);
  int y = 20; // Start below status bar
  
  M5.Lcd.setCursor(5, y);
  M5.Lcd.printf("=== WiFi Setup ===");
  y += 15;
  
  M5.Lcd.setCursor(5, y);
  M5.Lcd.printf("1. Scan QR code OR");
  y += 12;
  
  M5.Lcd.setCursor(5, y);
  M5.Lcd.printf("2. Connect to WiFi:");
  y += 12;
  
  M5.Lcd.setCursor(5, y);
  M5.Lcd.printf("   %s", AP_SSID.c_str());
  y += 12;
  
  M5.Lcd.setCursor(5, y);
  M5.Lcd.printf("   Pass: %s", AP_PASSWORD);
  y += 16;
  
  M5.Lcd.setCursor(5, y);
  M5.Lcd.printf("3. Open browser:");
  y += 12;
  
  M5.Lcd.setCursor(5, y);
  M5.Lcd.printf("   192.168.4.1");
  y += 16;
  
  M5.Lcd.setCursor(5, y);
  M5.Lcd.printf("A:QR Code B:Exit");
  y += 12;
  
  M5.Lcd.setCursor(5, y);
  M5.Lcd.printf("Timeout: 5 minutes");
}

void setupWebServer() {
  server.on("/", handleRoot);
  server.on("/config", handleConfig);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/switch-network", HTTP_POST, handleSwitchNetwork);
  server.on("/delete-network", HTTP_POST, handleDeleteNetwork);
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
  if (hub_ip.length() > 0) {
    html += "<span class='info-value'>" + hub_ip + ":" + String(hub_port) + "</span></div></div></div>";
  } else {
    html += "<span class='info-value'>Auto-Discovery Enabled</span></div></div></div>";
  }
  
  // Saved WiFi Networks
  html += "<div class='card'><div class='card-header'><div class='card-icon'>💾</div>";
  html += "<h3>Saved WiFi Networks</h3></div>";
  bool hasActiveNetworks = false;
  for (int i = 0; i < MAX_WIFI_NETWORKS; i++) {
    if (savedNetworks[i].isActive && savedNetworks[i].ssid.length() > 0) {
      if (!hasActiveNetworks) {
        hasActiveNetworks = true;
        html += "<div class='info-grid'>";
      }
      html += "<div class='info-item'><span class='info-label'>" + savedNetworks[i].ssid + "</span>";
      html += "<span class='info-value'>";
      if (savedNetworks[i].ssid == WiFi.SSID()) {
        html += "🟢 Connected";
      } else {
        html += "⚫ Saved";
      }
      html += "</span></div>";
    }
  }
  if (hasActiveNetworks) {
    html += "</div>";
  } else {
    html += "<p style='color:#666;text-align:center;margin:1rem;'>No saved networks</p>";
  }
  html += "</div>";
  
  html += "<div class='card'><div class='card-header'><div class='card-icon'>📶</div>";
  html += "<h3>WiFi Configuration</h3></div>";
  html += "<form action='/save' method='post'>";
  
  // WiFi Network Configuration (Manual Entry Only)
  html += "<div class='form-group'>";
  html += "<label class='form-label'>WiFi Network Name (SSID)</label>";
  html += "<input type='text' name='ssid' class='form-input' placeholder='Enter WiFi network name' value='" + wifi_ssid + "' required>";
  html += "<small style='color:#666;font-size:12px;'>Enter the exact name of your WiFi network manually</small>";
  html += "</div>";
  
  html += "<div class='form-group'><label class='form-label'>WiFi Password</label>";
  html += "<input type='password' name='password' class='form-input' placeholder='Enter WiFi password' value='" + wifi_password + "'></div>";
  
  // Saved Networks Section
  html += "<div class='form-group'><label class='form-label'>💾 Saved Networks</label>";
  html += "<div style='border:1px solid #ddd;padding:10px;margin-top:5px;border-radius:4px;'>";
  bool hasSavedNetworks = false;
  String currentSSID = WiFi.SSID();
  Serial.println("=== Displaying Saved Networks ===");
  Serial.printf("Current WiFi SSID: '%s'\n", currentSSID.c_str());
  
  for (int i = 0; i < networkCount; i++) {
    if (savedNetworks[i].ssid.length() > 0 && savedNetworks[i].isActive) {
      hasSavedNetworks = true;
      bool isCurrent = (savedNetworks[i].ssid == currentSSID);
      Serial.printf("Network %d: '%s' (current: %s)\n", i, savedNetworks[i].ssid.c_str(), isCurrent ? "yes" : "no");
      
      html += "<div style='display:flex;justify-content:space-between;align-items:center;padding:0.5rem;margin:0.25rem 0;background:" + String(isCurrent ? "#e3f2fd" : "#f5f5f5") + ";border-radius:4px;'>";
      html += "<span style='font-weight:" + String(isCurrent ? "600" : "400") + ";'>" + savedNetworks[i].ssid + (isCurrent ? " (Current)" : "") + "</span>";
      html += "<div style='display:flex;gap:0.5rem;'>";
      if (!isCurrent) {
        html += "<button onclick='switchNetwork(" + String(i) + ")' style='background:var(--system-blue);color:white;border:none;padding:0.25rem 0.75rem;border-radius:var(--radius-small);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s ease;'>Switch</button>";
      }
      html += "<button onclick='deleteNetwork(" + String(i) + ")' style='background:var(--system-red);color:white;border:none;padding:0.25rem 0.75rem;border-radius:var(--radius-small);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s ease;'>Delete</button>";
      html += "</div></div>";
    }
  }
  if (!hasSavedNetworks) {
    html += "<div style='color:#666;font-style:italic;text-align:center;padding:1rem;'>No saved networks found</div>";
    Serial.println("No saved networks found");
  } else {
    Serial.printf("Found %d saved networks\n", networkCount);
  }
  html += "</div></div>";
  
  // Advanced Configuration (collapsible)
  html += "<div class='form-group'><label class='form-label' onclick='toggleAdvanced()' style='cursor:pointer;user-select:none;'>⚙️ Advanced Settings <span id='advToggle'>▼</span></label>";
  html += "<div id='advancedSettings' style='display:none;border:1px solid #ddd;padding:10px;margin-top:5px;border-radius:4px;'>";
  html += "<div class='form-group'><label class='form-label'>Hub Server IP (leave empty for auto-discovery)</label>";
  html += "<input type='text' name='hub_ip' class='form-input' placeholder='Auto-discover or enter IP like 192.168.1.100' value='" + hub_ip + "'></div>";
  html += "<div class='form-group'><label class='form-label'>Hub Server Port</label>";
  html += "<input type='number' name='hub_port' class='form-input' placeholder='7411' value='" + String(hub_port) + "' min='1' max='65535'></div></div></div>";
  html += "<div class='form-group'><label class='form-label'>Device ID</label>";
  html += "<input type='text' name='device_id' class='form-input' placeholder='m5-tally-a1b2c3' value='" + device_id + "' required></div>";
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
  html += "fetch('/reset',{method:'POST'}).then(()=>{alert('Factory reset complete.');});}}";
  html += "function switchNetwork(index){if(confirm('Switch to this network now?')){";
  html += "fetch('/switch-network',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},";
  html += "body:'networkIndex='+index}).then(response=>response.text()).then(result=>{";
  html += "if(result==='success'){alert('Switching to network...');setTimeout(()=>location.reload(),3000);}";
  html += "else{alert('Failed to switch network: '+result);}}).catch(()=>{alert('Error switching network');});}}";
  html += "function deleteNetwork(index){if(confirm('Delete this saved network? This action cannot be undone.')){";
  html += "fetch('/delete-network',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},";
  html += "body:'networkIndex='+index}).then(response=>{";
  html += "if(response.status===302||response.ok){alert('Network deleted successfully');location.reload();}";
  html += "else{response.text().then(text=>alert('Failed to delete network: '+text));}";
  html += "}).catch(()=>{alert('Error deleting network');});}}";
  html += "function toggleAdvanced(){var div=document.getElementById('advancedSettings');";
  html += "var toggle=document.getElementById('advToggle');";
  html += "if(div.style.display==='none'){div.style.display='block';toggle.innerHTML='▲';}";
  html += "else{div.style.display='none';toggle.innerHTML='▼';}}";
  html += "</script>";
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
  
  // UI elements always enabled - no configuration needed
  uiCfg.showBattPercent = true;
  uiCfg.smallBattPercent = false; // Use normal size for better readability
  uiCfg.wifiOutline = true;
  uiCfg.wifiShowDisconnectX = true;
  uiCfg.wifiSpriteIcons = false; // Use simple icons for better performance
  
  // Add WiFi network to memory if provided
  if (wifi_ssid.length() > 0) {
    addNetworkToMemory(wifi_ssid, wifi_password);
  }
  
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

void handleSwitchNetwork() {
  Serial.println("=== Network Switch Request ===");
  Serial.print("Request args count: ");
  Serial.println(server.args());
  
  for (int i = 0; i < server.args(); i++) {
    Serial.printf("Arg %d: %s = %s\n", i, server.argName(i).c_str(), server.arg(i).c_str());
  }
  
  int networkIndex = server.arg("networkIndex").toInt();
  Serial.printf("Parsed network index: %d\n", networkIndex);
  
  // Validate network index
  if (networkIndex < 0 || networkIndex >= networkCount) {
    Serial.printf("Invalid network index: %d (max: %d)\n", networkIndex, networkCount - 1);
    server.send(400, "text/plain", "Invalid network index");
    return;
  }
  
  String ssid = savedNetworks[networkIndex].ssid;
  String password = savedNetworks[networkIndex].password;
  
  Serial.printf("Retrieved SSID: '%s'\n", ssid.c_str());
  Serial.printf("Retrieved password length: %d\n", password.length());
  
  if (ssid.length() == 0 || !savedNetworks[networkIndex].isActive) {
    Serial.println("Network not found or inactive");
    server.send(400, "text/plain", "Network not found");
    return;
  }
  
  // Check if already connected to this network
  if (ssid == WiFi.SSID()) {
    Serial.println("Already connected to this network");
    server.send(200, "text/plain", "already_connected");
    return;
  }
  
  Serial.printf("Web request to switch to network: %s (index %d)\n", ssid.c_str(), networkIndex);
  
  // Send success response before attempting connection
  server.send(200, "text/plain", "success");
  
  // Disconnect current connection
  WiFi.disconnect();
  delay(100);
  
  // Connect to selected network
  WiFi.begin(ssid.c_str(), password.c_str());
  
  // Update current WiFi settings for future reference
  wifi_ssid = ssid;
  wifi_password = password;
  
  // Wait for connection with timeout
  unsigned long connectStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - connectStart < 10000) {
    delay(100);
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("Successfully switched to network: %s\n", ssid.c_str());
  } else {
    Serial.printf("Failed to switch to network: %s\n", ssid.c_str());
  }
}

void handleDeleteNetwork() {
  Serial.println("Handling delete network request");
  
  if (!server.hasArg("networkIndex")) {
    Serial.println("Error: networkIndex parameter missing");
    server.send(400, "text/plain", "Missing networkIndex parameter");
    return;
  }
  
  int networkIndex = server.arg("networkIndex").toInt();
  Serial.printf("Request to delete network at index: %d\n", networkIndex);
  
  // Validate network index
  if (networkIndex < 0 || networkIndex >= networkCount) {
    Serial.printf("Error: Invalid network index %d (valid range: 0-%d)\n", networkIndex, networkCount - 1);
    server.send(400, "text/plain", "Invalid network index");
    return;
  }
  
  // Get network name for logging before deletion
  String networkName = savedNetworks[networkIndex].ssid;
  Serial.printf("Deleting network: %s\n", networkName.c_str());
  
  // Remove network from memory and preferences
  if (removeNetworkFromMemory(networkIndex)) {
    Serial.printf("Successfully deleted network: %s\n", networkName.c_str());
    server.sendHeader("Location", "/", true);
    server.send(302, "text/plain", "Network deleted successfully");
  } else {
    Serial.printf("Failed to delete network: %s\n", networkName.c_str());
    server.send(500, "text/plain", "Failed to delete network");
  }
}

void handleNotFound() {
  server.sendHeader("Location", "/", true);
  server.send(302, "text/plain", "");
}

void handleSources() {
  String html = "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1.0'>";
  html += "<title>M5 Tally - Source Assignment</title>";
  html += "<style>";
  html += ":root{--system-blue:#007AFF;--system-green:#34C759;--system-red:#FF3B30;";
  html += "--system-orange:#FF9500;--system-gray:#8E8E93;--bg-primary:#FFFFFF;--bg-secondary:#F2F2F7;";
  html += "--bg-quaternary:rgba(116,116,128,0.08);--text-primary:#000000;";
  html += "--text-secondary:rgba(60,60,67,0.6);--separator-opaque:#C6C6C8;";
  html += "--separator-non-opaque:rgba(60,60,67,0.36);--shadow-2:0 2px 10px rgba(0,0,0,0.08);";
  html += "--shadow-3:0 4px 20px rgba(0,0,0,0.08);--radius-small:6px;--radius-medium:10px;--radius-large:16px;}";
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
  html += ".status-badge{padding:0.5rem 1rem;border-radius:var(--radius-medium);font-size:13px;font-weight:600;";
  html += "display:inline-block;margin-bottom:1rem;}";
  html += ".status-assigned{background:var(--system-green);color:white;}";
  html += ".status-unassigned{background:var(--bg-quaternary);color:var(--text-secondary);}";
  html += ".info-item{background:var(--bg-quaternary);padding:1rem;border-radius:var(--radius-medium);";
  html += "margin-bottom:0.75rem;}";
  html += ".info-label{font-size:12px;color:var(--text-secondary);font-weight:500;text-transform:uppercase;";
  html += "letter-spacing:0.5px;margin-bottom:0.25rem;}";
  html += ".info-value{font-size:15px;color:var(--text-primary);font-weight:600;}";
  html += ".info-secondary{font-size:13px;color:var(--text-secondary);margin-top:0.25rem;}";
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
  html += ".btn-danger:hover{background:rgba(255,59,48,0.85);transform:translateY(-1px);";
  html += "box-shadow:0 2px 8px rgba(255,59,48,0.2);}";
  html += ".info-list{list-style:none;padding:0;}";
  html += ".info-list li{padding:0.75rem 0;border-bottom:0.5px solid var(--separator-non-opaque);";
  html += "font-size:14px;color:var(--text-secondary);line-height:1.4;}";
  html += ".info-list li:last-child{border-bottom:none;}";
  html += ".nav-button{margin-bottom:0.5rem;}";
  html += "</style></head><body>";
  html += "<div class='header'><div class='header-icon'>🎯</div>";
  html += "<h1>Source Assignment</h1>";
  html += "<div class='header-subtitle'>Device: " + device_name + "</div></div>";
  html += "<div class='container'>";
  
  // Current Assignment Card
  html += "<div class='card'><div class='card-header'><div class='card-icon'>📊</div>";
  html += "<h3>Current Assignment</h3></div>";
  
  if (isAssigned && assignedSource.length() > 0) {
    html += "<div class='status-badge status-assigned'>ASSIGNED</div>";
    
    // Show assignment details in info items
    html += "<div class='info-item'>";
    if (customDisplayName.length() > 0) {
      html += "<div class='info-label'>Display Name</div>";
      html += "<div class='info-value'>" + customDisplayName + "</div>";
      html += "<div class='info-secondary'>Custom name set via web portal</div>";
    } else if (assignedSourceName.length() > 0) {
      html += "<div class='info-label'>Source Name</div>";
      html += "<div class='info-value'>" + assignedSourceName + "</div>";
    } else {
      html += "<div class='info-label'>Source Name</div>";
      html += "<div class='info-value'>" + cleanSourceName(assignedSource) + "</div>";
    }
    html += "</div>";
    
    html += "<div class='info-item'>";
    html += "<div class='info-label'>Source ID</div>";
    html += "<div class='info-value'>" + assignedSource + "</div>";
    html += "</div>";
  } else {
    html += "<div class='status-badge status-unassigned'>UNASSIGNED</div>";
    html += "<div class='info-item'>";
    html += "<div class='info-label'>Status</div>";
    html += "<div class='info-value'>No source assigned</div>";
    html += "<div class='info-secondary'>Device will show IDLE state</div>";
    html += "</div>";
  }
  html += "</div>";
  
  // Manual Assignment Card
  html += "<div class='card'><div class='card-header'><div class='card-icon'>⚙️</div>";
  html += "<h3>Manual Assignment</h3></div>";
  html += "<form action='/assign' method='post'>";
  html += "<div class='form-group'><label class='form-label'>Source ID</label>";
  html += "<input type='text' name='source_id' class='form-input' placeholder='obs-scene-Camera1 or vmix-input-1' value='" + assignedSource + "'></div>";
  html += "<div class='form-group'><label class='form-label'>Display Name (Optional)</label>";
  html += "<input type='text' name='source_name' class='form-input' placeholder='Camera 1' value='" + customDisplayName + "'></div>";
  html += "<button type='submit' class='btn btn-primary'>Assign Source</button></form>";
  if (isAssigned && assignedSource.length() > 0) {
    html += "<button onclick='unassign()' class='btn btn-danger'>Unassign Device</button>";
  }
  html += "</div>";
  
  // Instructions Card
  html += "<div class='card'><div class='card-header'><div class='card-icon'>💡</div>";
  html += "<h3>Instructions</h3></div><ul class='info-list'>";
  html += "<li>Enter a source ID from your video mixer (OBS/vMix)</li>";
  html += "<li>Examples: obs-scene-Camera1, obs-source-Webcam, vmix-input-1</li>";
  html += "<li>Use the admin panel to see available sources</li>";
  html += "<li>Changes are saved automatically to device memory</li>";
  html += "<li>Device shows IDLE/PREVIEW/PROGRAM based on mixer state</li>";
  html += "<li>Recording/Streaming status displayed when active</li></ul></div>";
  
  // Navigation Card
  html += "<div class='card'><div class='card-header'><div class='card-icon'>🏠</div>";
  html += "<h3>Navigation</h3></div>";
  html += "<button onclick='window.location=\"/\"' class='btn btn-secondary nav-button'>Back to Configuration</button>";
  html += "<button onclick='window.location=\"/status\"' class='btn btn-secondary nav-button'>Device Status</button>";
  html += "<button onclick='restart()' class='btn btn-secondary nav-button'>Restart Device</button>";
  html += "</div></div>";
  
  html += "<script>function unassign(){if(confirm('Unassign this device from its current source?')){";
  html += "fetch('/assign',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},";
  html += "body:'source_id=&source_name='}).then(()=>{alert('Device unassigned successfully.');location.reload();});}}";
  html += "function restart(){if(confirm('Restart the M5 Tally device now?')){";
  html += "fetch('/restart',{method:'POST'}).then(()=>{alert('Device is restarting...');});}}";
  html += "</script>";
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
  html += ".btn{border:none;padding:0.75rem 1.25rem;border-radius:var(--radius-medium);";
  html += "font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s ease;width:100%;margin-bottom:0.75rem;}";
  html += ".btn-secondary{background:var(--system-gray);color:white;}";
  html += ".btn-secondary:hover{background:rgba(142,142,147,0.85);}";
  html += ".nav-button{margin-bottom:0.5rem;}";
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
  html += "<span class='status-value " + String(isProgram ? "status-recording" : "") + "'>" + String(isProgram ? "PROGRAM" : "OFF") + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Preview</span>";
  html += "<span class='status-value " + String(isPreview ? "status-online" : "") + "'>" + String(isPreview ? "ON" : "OFF") + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Recording</span>";
  html += "<span class='status-value " + String(isRecording ? "status-recording" : "") + "'>" + String(isRecording ? "REC" : "OFF") + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Streaming</span>";
  html += "<span class='status-value " + String(isStreaming ? "status-streaming" : "") + "'>" + String(isStreaming ? "STREAM" : "OFF") + "</span></div>";
  html += "<div class='status-item'><span class='status-label'>Last Update</span>";
  html += "<span class='status-value'>" + (lastTallyUpdate > 0 ? String((millis() - lastTallyUpdate) / 1000) + "s ago" : "Never") + "</span></div></div></div>";
  
  // Navigation Card
  html += "<div class='card'><div class='card-header'><div class='card-icon'>🏠</div>";
  html += "<h3>Navigation</h3></div>";
  html += "<button onclick='window.location=\"/\"' class='btn btn-secondary nav-button'>Back to Configuration</button>";
  html += "<button onclick='window.location=\"/sources\"' class='btn btn-secondary nav-button'>Manage Sources</button>";
  html += "<button onclick='restart()' class='btn btn-secondary nav-button'>Restart Device</button>";
  html += "</div>";
  
  html += "<div class='refresh-notice'>🔄 Auto-refresh: This page refreshes every 5 seconds<br>";
  html += "Last updated: " + String(millis() / 1000) + " seconds since boot</div></div>";
  
  html += "<script>function restart(){if(confirm('Restart the M5 Tally device now?')){";
  html += "fetch('/restart',{method:'POST'}).then(()=>{alert('Device is restarting...');});}}";
  html += "</script>";
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

// ---------------------------------------------------------------
// Auto-Discovery Implementation (firmware -> hub)
// ---------------------------------------------------------------
// Strategy: send a small UDP JSON packet {type:"discover"} to the subnet broadcast
// on the default hub port (7411) and also to the last-known hub_ip if set. The hub replies
// with {type:"discover_reply", hubIp, udpPort, apiPort}. We then persist hub_ip/port.
// Called on initial Wi-Fi connect or during reconnection attempts when not registered.

static unsigned long gLastDiscoveryAttempt = 0;
static uint8_t gDiscoveryAttempts = 0;
const unsigned long DISCOVERY_INTERVAL_MS = 4000; // backoff window between probes
const uint8_t DISCOVERY_MAX_ATTEMPTS = 6; // stop after ~24s initial scan (will retry on later recon cycles)

bool performDiscoveryExchange() {
  if (WiFi.status() != WL_CONNECTED) return false;
  IPAddress bcast = (uint32_t)WiFi.localIP() | ~((uint32_t)WiFi.subnetMask());
  JsonDocument doc;
  doc["type"] = "discover";
  doc["deviceId"] = device_id;
  doc["fw"] = FIRMWARE_VERSION;
  String payload; serializeJson(doc, payload);
  bool ok = false;
  // Send to broadcast
  udp.beginPacket(bcast, hub_port); udp.print(payload); ok = udp.endPacket()==1 || ok;
  // Also send to last known hub (in case subnet broadcast blocked but we have stale IP)
  if (hub_ip.length()>0) { udp.beginPacket(hub_ip.c_str(), hub_port); udp.print(payload); ok = udp.endPacket()==1 || ok; }
  Serial.printf("Discovery probe sent (broadcast=%s, hub=%s)\n", bcast.toString().c_str(), hub_ip.c_str());
  return ok;
}

void attemptHubDiscovery(bool force) {
  if (!auto_discovery_enabled) return;
  unsigned long now = millis();
  if (!force) {
    if (gDiscoveryAttempts >= DISCOVERY_MAX_ATTEMPTS) return; // limit per Wi-Fi session
    if (now - gLastDiscoveryAttempt < DISCOVERY_INTERVAL_MS) return; // wait interval
  }
  gLastDiscoveryAttempt = now;
  gDiscoveryAttempts++;
  bool sent = performDiscoveryExchange();
  // After final scheduled UDP attempt, try mDNS if hub still not found
  if (gDiscoveryAttempts == DISCOVERY_MAX_ATTEMPTS) {
    if (hub_ip.length() == 0) {
      Serial.println("UDP discovery exhausted, trying mDNS query for _tallyhub._udp.local");
      if (attemptMdnsLookup()) {
        saveConfiguration();
        restartUDP();
        registerWithHub();
      }
    }
  }
}

bool attemptMdnsLookup() {
  int n = MDNS.queryService("tallyhub","udp");
  if (n <= 0) {
    Serial.println("mDNS: no tallyhub services found");
    return false;
  }
  // Pick first result; future: prefer same subnet or highest priority
  String foundHost = MDNS.hostname(0);
  IPAddress addr = MDNS.IP(0);
  uint16_t port = MDNS.port(0);
  if (addr.toString() == hub_ip && port == hub_port) {
    Serial.println("mDNS: hub already set, ignoring");
    return true;
  }
  hub_ip = addr.toString();
  hub_port = port; // UDP port published is our hub UDP port
  Serial.printf("mDNS: discovered hub at %s:%d (host=%s)\n", hub_ip.c_str(), hub_port, foundHost.c_str());
  return true;
}

// Network Selection Functions
void enterNetworkSelectionMode() {
  networkSelectionMode = true;
  selectedNetworkIndex = 0;
  networkSelectionStart = millis();
  
  Serial.println("Entering network selection mode");
  
  // Find first available saved network
  bool foundNetwork = false;
  for (int i = 0; i < 5; i++) {
    if (preferences.getString(("ssid" + String(i)).c_str(), "").length() > 0) {
      selectedNetworkIndex = i;
      foundNetwork = true;
      break;
    }
  }
  
  if (!foundNetwork) {
    Serial.println("No saved networks found");
    networkSelectionMode = false;
    showStatus("No Networks", ORANGE);
    return;
  }
  
  showNetworkSelectionUI();
}

void cycleToNextNetwork() {
  if (!networkSelectionMode) return;
  
  // Find next available saved network
  int startIndex = selectedNetworkIndex;
  do {
    selectedNetworkIndex = (selectedNetworkIndex + 1) % 5;
    if (preferences.getString(("ssid" + String(selectedNetworkIndex)).c_str(), "").length() > 0) {
      break;
    }
  } while (selectedNetworkIndex != startIndex);
  
  // Reset timeout
  networkSelectionStart = millis();
  showNetworkSelectionUI();
}

void connectToSelectedNetwork() {
  if (!networkSelectionMode) return;
  
  String ssid = preferences.getString(("ssid" + String(selectedNetworkIndex)).c_str(), "");
  String password = preferences.getString(("pass" + String(selectedNetworkIndex)).c_str(), "");
  
  if (ssid.length() == 0) {
    Serial.println("Selected network is empty");
    networkSelectionMode = false;
    showStatus("Network Error", RED);
    return;
  }
  
  networkSelectionMode = false;
  
  Serial.printf("Connecting to selected network: %s (index %d)\n", ssid.c_str(), selectedNetworkIndex);
  
  // Disconnect current connection
  WiFi.disconnect();
  delay(100);
  
  // Connect to selected network
  WiFi.begin(ssid.c_str(), password.c_str());
  showStatus("Connecting...", BLUE);
  
  // Wait for connection with timeout
  unsigned long connectStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - connectStart < 10000) {
    delay(100);
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("Connected to %s\n", ssid.c_str());
    showStatus("Connected!", GREEN);
  } else {
    Serial.printf("Failed to connect to %s\n", ssid.c_str());
    showStatus("Connect Failed", RED);
  }
}

void showNetworkSelectionUI() {
  if (!networkSelectionMode) return;
  
  String ssid = preferences.getString(("ssid" + String(selectedNetworkIndex)).c_str(), "");
  
  M5.Lcd.fillScreen(0x4208); // Dark blue background
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.setTextSize(1);
  
  // Title
  M5.Lcd.setCursor(10, 10);
  M5.Lcd.print("SELECT NETWORK");
  
  // Network index indicator
  M5.Lcd.setCursor(10, 25);
  M5.Lcd.printf("Network %d of 5", selectedNetworkIndex + 1);
  
  // Current network name (truncated if too long)
  M5.Lcd.setCursor(10, 45);
  M5.Lcd.setTextSize(2);
  String displaySSID = ssid;
  if (displaySSID.length() > 10) {
    displaySSID = displaySSID.substring(0, 10) + "...";
  }
  M5.Lcd.print(displaySSID);
  
  // Instructions
  M5.Lcd.setTextSize(1);
  M5.Lcd.setCursor(10, 70);
  M5.Lcd.print("A+B: Activate mode");
  M5.Lcd.setCursor(10, 80);
  M5.Lcd.print("B: Next, B(2x): Connect");
  M5.Lcd.setCursor(10, 90);
  M5.Lcd.print("A: Cancel");
}

void exitNetworkSelectionMode() {
  networkSelectionMode = false;
  Serial.println("Exiting network selection mode");
  // Force display update
  extern void forceImmediateDisplay(); forceImmediateDisplay();
}


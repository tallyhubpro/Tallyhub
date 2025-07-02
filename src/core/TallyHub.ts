import { EventEmitter } from 'events';
import { TallyState, TallyUpdate, MixerConnection, MixerStatusUpdate, TallyDevice, DeviceAssignment, MixerConfig } from '../types';
import { OBSConnector } from './mixers/OBSConnector';
import { VMixConnector } from './mixers/VMixConnector';
import { WebSocketManager } from './WebSocketManager';
import { UDPServer } from './UDPServer';
import * as fs from 'fs';
import * as path from 'path';
import * as dgram from 'dgram';

export class TallyHub extends EventEmitter {
  private mixers: Map<string, OBSConnector | VMixConnector> = new Map();
  private tallies: Map<string, TallyState> = new Map();
  private devices: Map<string, TallyDevice> = new Map();
  private webSocketManager!: WebSocketManager;
  private udpServer!: UDPServer;
  private mixerConfigs: MixerConfig[] = [];
  // New device assignment properties
  private deviceAssignments: Map<string, DeviceAssignment> = new Map();
  // Missing properties that are referenced in the code
  private mixerConnections: Map<string, MixerConnection> = new Map();
  private configPath: string = path.join(__dirname, '../../mixer-config.json');
  private deviceStoragePath: string = path.join(__dirname, '../../device-storage.json');
  private deviceStorageSaveTimer: NodeJS.Timeout | null = null;
  private deviceStorageNeedsSave: boolean = false;
  private periodicSaveInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  public setManagers(webSocketManager: WebSocketManager, udpServer: UDPServer): void {
    this.webSocketManager = webSocketManager;
    this.udpServer = udpServer;
  }

  private setupMixerConnections(): void {
    // Setup OBS connection if configured
    if (process.env.OBS_HOST) {
      const obsConnection: MixerConnection = {
        id: 'obs-main',
        name: 'OBS Studio',
        type: 'obs',
        host: process.env.OBS_HOST,
        port: parseInt(process.env.OBS_PORT || '4455'),
        connected: false
      };
      this.mixerConnections.set('obs-main', obsConnection);
    }

    // Setup vMix connection if configured
    if (process.env.VMIX_HOST) {
      const vmixConnection: MixerConnection = {
        id: 'vmix-main',
        name: 'vMix',
        type: 'vmix',
        host: process.env.VMIX_HOST,
        port: parseInt(process.env.VMIX_PORT || '8088'),
        connected: false
      };
      this.mixerConnections.set('vmix-main', vmixConnection);
    }
  }

  private loadMixerConfigurations(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const savedMixers = JSON.parse(configData);
        
        console.log('📂 Loading saved mixer configurations...');
        
        for (const mixerConfig of savedMixers) {
          this.mixerConnections.set(mixerConfig.id, {
            ...mixerConfig,
            connected: false // Reset connection status on load
          });
          
          // Restore OBS passwords from environment variables
          if (mixerConfig.type === 'obs' && process.env[`OBS_PASSWORD_${mixerConfig.id}`]) {
            // Password will be available from environment
          }
        }
        
        console.log(`📂 Loaded ${savedMixers.length} mixer configuration(s)`);
      } else {
        console.log('📂 No saved mixer configurations found');
      }
    } catch (error) {
      console.error('❌ Error loading mixer configurations:', error);
    }
  }

  private saveMixerConfigurations(): void {
    try {
      const mixersToSave = Array.from(this.mixerConnections.values()).map(mixer => ({
        id: mixer.id,
        name: mixer.name,
        type: mixer.type,
        host: mixer.host,
        port: mixer.port
        // Note: passwords are not saved for security reasons
      }));
      
      fs.writeFileSync(this.configPath, JSON.stringify(mixersToSave, null, 2));
      console.log(`💾 Saved ${mixersToSave.length} mixer configuration(s)`);
    } catch (error) {
      console.error('❌ Error saving mixer configurations:', error);
    }
  }

  public saveConfigurations(): void {
    this.saveMixerConfigurations();
  }

  public async initialize(): Promise<void> {
    console.log('🔧 Initializing Tally Hub...');

    // Load saved mixer configurations
    this.loadMixerConfigurations();

    // Load device assignments
    this.loadDeviceAssignments();

    // Load stored device information
    this.loadStoredDevices();

    // Send wake-up signals to known UDP devices
    await this.wakeUpKnownDevices();
    
    // Start periodic device storage save (every 5 minutes)
    this.startPeriodicDeviceStorageSave();

    // Initialize mixer connections
    const connectionResults = await Promise.allSettled(
      Array.from(this.mixerConnections.entries()).map(async ([id, connection]) => {
        try {
          await this.connectToMixer(id, connection);
          return { id, success: true, error: null };
        } catch (error) {
          console.error(`❌ Failed to connect to mixer ${connection.name}:`, error);
          connection.lastError = error instanceof Error ? error.message : String(error);
          return { id, success: false, error: error instanceof Error ? error.message : String(error) };
        }
      })
    );

    // Report connection results
    const successful = connectionResults.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;
    const failed = connectionResults.length - successful;

    if (connectionResults.length === 0) {
      console.log('ℹ️  No mixer connections configured - Tally Hub will run in standalone mode');
    } else if (successful > 0) {
      console.log(`✅ Tally Hub initialized - ${successful} mixer(s) connected${failed > 0 ? `, ${failed} failed` : ''}`);
    } else {
      console.log(`⚠️  Tally Hub initialized but no mixers connected (${failed} failed)`);
      console.log('💡 Check mixer configurations and ensure mixers are running');
    }

    console.log('✅ Tally Hub ready for device connections');
  }

  private async connectToMixer(id: string, connection: MixerConnection): Promise<void> {
    let mixer: any;

    console.log(`🔌 Attempting to connect to ${connection.name} (${connection.type}) at ${connection.host}:${connection.port}`);

    switch (connection.type) {
      case 'obs':
        mixer = new OBSConnector(connection);
        break;
      case 'vmix':
        mixer = new VMixConnector(connection);
        break;
      default:
        throw new Error(`Unsupported mixer type: ${connection.type}`);
    }

    // Setup event listeners
    mixer.on('connected', () => {
      connection.connected = true;
      connection.lastError = undefined;
      console.log(`✅ Successfully connected to ${connection.name}`);
      this.emit('mixer:connected', { id, connection });
    });

    mixer.on('disconnected', () => {
      connection.connected = false;
      console.log(`📡 Disconnected from ${connection.name}`);
      this.emit('mixer:disconnected', { id, connection });
    });

    mixer.on('error', (error: Error) => {
      connection.lastError = error.message;
      console.error(`❌ Error from ${connection.name}:`, error.message);
      this.emit('mixer:error', { id, connection, error });
    });

    mixer.on('reconnect:failed', () => {
      console.log(`💡 ${connection.name} reconnection failed. Troubleshooting tips:`);
      if (connection.type === 'obs') {
        console.log(`   • Ensure OBS Studio is running`);
        console.log(`   • Enable WebSocket server in OBS (Tools > WebSocket Server Settings)`);
        console.log(`   • Check host: ${connection.host} and port: ${connection.port}`);
      } else if (connection.type === 'vmix') {
        console.log(`   • Ensure vMix is running`);
        console.log(`   • Check TCP API is enabled in vMix settings`);
        console.log(`   • Check host: ${connection.host} and port: ${connection.port}`);
      }
    });

    mixer.on('tally:update', (update: TallyUpdate) => {
      this.handleTallyUpdate(update);
    });

    mixer.on('status:update', (statusUpdate: MixerStatusUpdate) => {
      this.handleStatusUpdate(statusUpdate);
    });

    this.mixers.set(id, mixer);
    
    // Add connection timeout
    const connectTimeout = setTimeout(() => {
      throw new Error(`Connection timeout after 10 seconds`);
    }, 10000);

    try {
      await mixer.connect();
      clearTimeout(connectTimeout);
    } catch (error) {
      clearTimeout(connectTimeout);
      throw error;
    }
  }

  private handleTallyUpdate(update: TallyUpdate): void {
    const existingTally = this.tallies.get(update.deviceId);
    
    const newTallyState: TallyState = {
      id: update.deviceId,
      name: existingTally?.name || `Source ${update.deviceId}`,
      preview: update.preview,
      program: update.program,
      connected: true,
      lastSeen: update.timestamp,
      recording: update.recording,
      streaming: update.streaming
    };

    this.tallies.set(update.deviceId, newTallyState);
    
    // Emit tally update to all connected devices (for web interface)
    this.emit('tally:update', newTallyState);
    
    // Send to specific devices if they're interested in this tally - this will handle logging
    this.notifyDevices(newTallyState);
  }

  private handleStatusUpdate(statusUpdate: MixerStatusUpdate): void {
    console.log(`📊 Status update from ${statusUpdate.mixerId}: Recording=${statusUpdate.recording}, Streaming=${statusUpdate.streaming}`);
    
    // Update the mixer connection status
    const mixerConnection = this.mixerConnections.get(statusUpdate.mixerId);
    if (mixerConnection) {
      mixerConnection.recording = statusUpdate.recording;
      mixerConnection.streaming = statusUpdate.streaming;
    }
    
    // Emit status update to all connected clients
    this.emit('status:update', statusUpdate);
  }

  private notifyDevices(tallyState: TallyState): void {
    // Notify devices about tally state changes - only for assigned devices
    let deviceNotificationCount = 0;
    
    for (const device of this.devices.values()) {
      // Only send updates to devices assigned to this specific source
      if (device.assignmentMode === 'assigned' && device.assignedSource === tallyState.id) {
        // Assigned mode: only send updates for the assigned source
        this.emit('device:notify', { device, tallyState });
        console.log(`📡 Sending assigned tally update to ${device.name}: ${tallyState.name} (${tallyState.program ? 'LIVE' : tallyState.preview ? 'PREVIEW' : 'IDLE'})`);
        deviceNotificationCount++;
      }
    }
    
    // Optional: Log summary if multiple devices were updated
    if (deviceNotificationCount > 1) {
      console.log(`📡 Notified ${deviceNotificationCount} device(s) about ${tallyState.name} state change`);
    }
  }

  public registerDevice(device: TallyDevice): void {
    // Set default assignment mode if not specified - all devices start in assigned mode
    if (!device.assignmentMode) {
      device.assignmentMode = 'assigned';
    }
    
    // Check if device has a saved assignment
    const savedAssignment = this.deviceAssignments.get(device.id);
    if (savedAssignment) {
      device.assignmentMode = 'assigned';
      device.assignedSource = savedAssignment.sourceId;
      device.assignedBy = savedAssignment.assignedBy;
      device.assignedAt = savedAssignment.assignedAt;
      console.log(`📱 Device ${device.name} restored assignment to ${savedAssignment.sourceName}`);
    }
    
    this.devices.set(device.id, device);
    device.lastSeen = new Date();
    device.connected = true;
    
    console.log(`📱 Device registered: ${device.name} (${device.type}) - Mode: ${device.assignmentMode}`);
    this.emit('device:registered', device);

    // Save device storage for UDP devices
    if ((device.type === 'm5stick' || device.type === 'ESP32' || device.type === 'hardware') && device.ipAddress) {
      this.scheduleDeviceStorageSave();
    }

    // Send current tally state to new device if it has an assignment
    if (device.assignmentMode === 'assigned' && device.assignedSource) {
      // Send only the assigned source state
      const assignedTally = this.tallies.get(device.assignedSource);
      if (assignedTally) {
        this.emit('device:notify', { device, tallyState: assignedTally });
      }
    }
    // If device is not assigned, it will show "unassigned" state
  }

  public unregisterDevice(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.connected = false;
      this.devices.delete(deviceId);
      console.log(`📱 Device unregistered: ${device.name}`);
      this.emit('device:unregistered', device);
      
      // Update stored devices for UDP devices
      if ((device.type === 'm5stick' || device.type === 'ESP32' || device.type === 'hardware') && device.ipAddress) {
        this.scheduleDeviceStorageSave();
      }
    }
  }

  public updateDeviceLastSeen(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastSeen = new Date();
      device.connected = true;
      
      // Don't save storage on every heartbeat - only on register/unregister
      // This reduces file writes significantly
    }
  }

  public getTallies(): TallyState[] {
    return Array.from(this.tallies.values());
  }

  public getDevices(): TallyDevice[] {
    return Array.from(this.devices.values());
  }

  public getMixerConnections(): MixerConnection[] {
    return Array.from(this.mixerConnections.values());
  }

  public addMixerConnection(id: string, connection: MixerConnection, password?: string): boolean {
    try {
      // Initialize recording/streaming status
      connection.recording = false;
      connection.streaming = false;
      
      this.mixerConnections.set(id, connection);
      
      // Set password for OBS connections
      if (connection.type === 'obs' && password) {
        process.env[`OBS_PASSWORD_${id}`] = password;
      }
      
      // Save configurations to file
      this.saveMixerConfigurations();
      
      // Attempt to connect to the new mixer
      this.connectToMixer(id, connection).catch(error => {
        console.error(`Failed to connect to newly added mixer ${connection.name}:`, error);
        connection.lastError = error instanceof Error ? error.message : String(error);
      });
      
      return true;
    } catch (error) {
      console.error('Error adding mixer connection:', error);
      return false;
    }
  }

  public removeMixerConnection(id: string): boolean {
    try {
      const connection = this.mixerConnections.get(id);
      if (!connection) {
        return false;
      }
      
      // Disconnect the mixer if it exists
      const mixer = this.mixers.get(id);
      if (mixer) {
        mixer.disconnect().catch((error: any) => {
          console.error(`Error disconnecting mixer ${id}:`, error);
        });
        this.mixers.delete(id);
      }
      
      // Remove the connection
      this.mixerConnections.delete(id);
      
      // Clean up environment variable if it was an OBS connection
      if (connection.type === 'obs') {
        delete process.env[`OBS_PASSWORD_${id}`];
      }
      
      // Save configurations to file
      this.saveMixerConfigurations();
      
      console.log(`Mixer ${connection.name} removed successfully`);
      this.emit('mixer:removed', { id, connection });
      
      return true;
    } catch (error) {
      console.error('Error removing mixer connection:', error);
      return false;
    }
  }

  public async testMixerConnection(id: string): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const connection = this.mixerConnections.get(id);
      if (!connection) {
        return { success: false, message: 'Mixer not found' };
      }

      // Reset reconnection attempts for a fresh start
      const mixer = this.mixers.get(id);
      if (mixer && 'resetReconnectAttempts' in mixer) {
        (mixer as any).resetReconnectAttempts();
      }

      // Test the connection by attempting to connect
      await this.connectToMixer(id, connection);
      
      // Wait a moment to see if connection succeeds
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (connection.connected) {
        return { success: true, message: 'Connection successful' };
      } else {
        return { 
          success: false, 
          message: 'Connection failed', 
          error: connection.lastError || 'Unknown error' 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        message: 'Connection test failed', 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  public resetMixerReconnection(id: string): boolean {
    try {
      const mixer = this.mixers.get(id);
      if (!mixer) {
        return false;
      }

      // Call resetReconnectAttempts if the method exists
      if ('resetReconnectAttempts' in mixer) {
        (mixer as any).resetReconnectAttempts();
        console.log(`🔄 Reset reconnection attempts for mixer: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Failed to reset reconnection for mixer ${id}:`, error);
      return false;
    }
  }

  public async forceReconnectMixer(id: string): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const mixer = this.mixers.get(id);
      if (!mixer) {
        return { success: false, message: 'Mixer not found' };
      }

      console.log(`🔄 Forcing reconnection for mixer: ${id}`);

      // Call forceReconnect if the method exists
      if ('forceReconnect' in mixer) {
        await (mixer as any).forceReconnect();
        
        // Wait a moment to see if connection succeeds
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const connection = this.mixerConnections.get(id);
        if (connection?.connected) {
          return { success: true, message: 'Reconnection successful' };
        } else {
          return { 
            success: false, 
            message: 'Reconnection attempted but not yet connected', 
            error: connection?.lastError || 'Connection still in progress' 
          };
        }
      }

      return { success: false, message: 'Mixer does not support force reconnection' };
    } catch (error) {
      return { 
        success: false, 
        message: 'Force reconnection failed', 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  public async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Tally Hub...');
    
    // Clear periodic save interval
    if (this.periodicSaveInterval) {
      clearInterval(this.periodicSaveInterval);
      this.periodicSaveInterval = null;
    }
    
    // Clear any pending device storage save timer and save if needed
    if (this.deviceStorageSaveTimer) {
      clearTimeout(this.deviceStorageSaveTimer);
      this.deviceStorageSaveTimer = null;
    }
    
    // Save device storage one final time
    this.saveStoredDevices();
    
    // Disconnect all mixers
    for (const mixer of this.mixers.values()) {
      try {
        await mixer.disconnect();
      } catch (error) {
        console.error('Error disconnecting mixer:', error);
      }
    }

    this.mixers.clear();
    this.devices.clear();
    this.tallies.clear();
    
    console.log('✅ Tally Hub shutdown complete');
  }

  public assignSourceToDevice(deviceId: string, sourceId: string, assignedBy: string = 'admin'): boolean {
    const device = this.devices.get(deviceId);
    if (!device) {
      console.log(`❌ Device ${deviceId} not found for assignment`);
      return false;
    }

    // Find the source in available tallies
    const availableSource = Array.from(this.tallies.values()).find(tally => tally.id === sourceId);
    if (!availableSource) {
      console.log(`❌ Source ${sourceId} not found for assignment`);
      return false;
    }

    const assignment: DeviceAssignment = {
      deviceId,
      sourceId,
      sourceName: availableSource.name,
      assignedBy,
      assignedAt: new Date()
    };

    this.deviceAssignments.set(deviceId, assignment);
    
    // Update device properties
    device.assignedSource = sourceId;
    device.assignmentMode = 'assigned';
    device.assignedBy = assignedBy;
    device.assignedAt = new Date();

    console.log(`✅ Assigned source "${availableSource.name}" to device "${device.name}"`);
    
    // Send assignment notification to UDP devices (M5Stick and ESP32)
    if ((device.type === 'm5stick' || device.type === 'ESP32') && this.udpServer) {
      this.udpServer.sendAssignmentToDevice(deviceId, sourceId, availableSource.name);
    }
    
    // Send assignment notification and immediate tally update to the device
    this.sendAssignmentNotification(deviceId, sourceId, availableSource.name);
    this.sendTallyToAssignedDevice(deviceId, sourceId);
    
    // Notify admin clients about the assignment change
    this.emit('device:assignment_changed', {
      deviceId,
      deviceName: device.name,
      sourceId,
      sourceName: availableSource.name,
      assigned: true,
      assignedBy,
      timestamp: new Date()
    });
    
    // Save configuration
    this.saveDeviceAssignments();
    
    return true;
  }

  public unassignDevice(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;

    this.deviceAssignments.delete(deviceId);
    device.assignedSource = undefined;
    device.assignedBy = undefined;
    device.assignedAt = undefined;

    if (device.type === 'm5stick' || device.type === 'ESP32') {
      // UDP devices remain in assigned mode but with no assignment
      device.assignmentMode = 'assigned';
      console.log(`✅ Device "${device.name}" unassigned - waiting for new assignment`);
      
      // Send unassignment notification to UDP device
      if (this.udpServer) {
        this.udpServer.sendUnassignmentToDevice(deviceId);
      }
    } else {
      // Web devices also remain in assigned mode but with no assignment (no auto mode)
      device.assignmentMode = 'assigned';
      console.log(`✅ Web device "${device.name}" unassigned - waiting for new assignment`);
      
      // Send unassignment notification to web device
      this.sendUnassignmentNotification(deviceId);
    }
    
    // Notify admin clients about the unassignment
    this.emit('device:assignment_changed', {
      deviceId,
      deviceName: device.name,
      sourceId: null,
      sourceName: null,
      assigned: false,
      assignedBy: 'system',
      timestamp: new Date()
    });
    
    this.saveDeviceAssignments();
    return true;
  }

  public getDeviceAssignments(): DeviceAssignment[] {
    return Array.from(this.deviceAssignments.values());
  }

  private sendTallyToAssignedDevice(deviceId: string, sourceId: string): void {
    const device = this.devices.get(deviceId);
    if (!device) return;

    // Get or create tally state for the source
    let tallyState = this.tallies.get(sourceId);
    if (!tallyState) {
      // Try to get the source name from the device assignment
      const assignment = this.deviceAssignments.get(deviceId);
      const sourceName = assignment?.sourceName || `Source ${sourceId}`;
      
      // Create a default tally state if it doesn't exist
      tallyState = {
        id: sourceId,
        name: sourceName,
        preview: false,
        program: false,
        connected: false,
        lastSeen: new Date(),
        recording: false,
        streaming: false
      };
      console.log(`📡 Creating default tally state for ${sourceId} (${sourceName})`);
    }

    console.log(`📡 Sending assigned tally update to ${device.name}: ${tallyState.name} (${tallyState.program ? 'LIVE' : tallyState.preview ? 'PREVIEW' : 'IDLE'})`);

    // Send to specific device based on type
    if (device.type === 'web' && this.webSocketManager) {
      this.webSocketManager.sendToDevice(deviceId, {
        type: 'tally:update',
        data: tallyState
      });
    } else if ((device.type === 'm5stick' || device.type === 'ESP32') && this.udpServer) {
      this.udpServer.sendToDevice(deviceId, {
        type: 'tally',
        data: tallyState
      });
    } else if (!this.webSocketManager || !this.udpServer) {
      console.log(`⚠️  Managers not ready yet, skipping tally update for ${device.name}`);
    }
  }

  private sendAllTalliesToDevice(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (!device) return;

    console.log(`📡 Sending all tally states to ${device.name} (auto mode)`);

    // Send all current tally states to the device
    this.tallies.forEach(tallyState => {
      if (device.type === 'web' && this.webSocketManager) {
        this.webSocketManager.sendToDevice(deviceId, {
          type: 'tally:update',
          data: tallyState
        });
      } else if ((device.type === 'm5stick' || device.type === 'ESP32') && this.udpServer) {
        this.udpServer.sendToDevice(deviceId, {
          type: 'tally',
          data: tallyState
        });
      }
    });
  }

  private saveDeviceAssignments(): void {
    try {
      const assignments = Array.from(this.deviceAssignments.values());
      fs.writeFileSync(
        path.join(__dirname, '../../device-assignments.json'),
        JSON.stringify(assignments, null, 2)
      );
      console.log('💾 Device assignments saved');
    } catch (error) {
      console.error('❌ Failed to save device assignments:', error);
    }
  }

  private loadDeviceAssignments(): void {
    try {
      const assignmentsPath = path.join(__dirname, '../../device-assignments.json');
      if (fs.existsSync(assignmentsPath)) {
        const data = fs.readFileSync(assignmentsPath, 'utf8');
        const assignments: DeviceAssignment[] = JSON.parse(data);
        
        assignments.forEach(assignment => {
          this.deviceAssignments.set(assignment.deviceId, assignment);
        });
        
        console.log(`📂 Loaded ${assignments.length} device assignment(s)`);
      }
    } catch (error) {
      console.error('❌ Failed to load device assignments:', error);
    }
  }

  private sendAssignmentNotification(deviceId: string, sourceId: string, sourceName: string): void {
    const device = this.devices.get(deviceId);
    if (!device) return;

    console.log(`📢 Sending assignment notification to ${device.name}: assigned to ${sourceName}`);

    // Send to web devices
    if (device.type === 'web' && this.webSocketManager) {
      this.webSocketManager.sendToDevice(deviceId, {
        type: 'assignment:changed',
        data: {
          assigned: true,
          sourceId,
          sourceName,
          timestamp: new Date()
        }
      });
    }

    // Send to UDP devices (M5Stick and ESP32)
    if ((device.type === 'm5stick' || device.type === 'ESP32' || device.type === 'hardware') && this.udpServer) {
      this.emit('device:notify', { 
        device, 
        tallyState: { 
          id: sourceId, 
          name: sourceName, 
          program: false, 
          preview: false,
          connected: true,
          lastSeen: new Date(),
          recording: false,
          streaming: false
        } 
      });
    }
  }

  private sendUnassignmentNotification(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (!device) return;

    console.log(`📢 Sending unassignment notification to ${device.name}`);

    // Send to web devices
    if (device.type === 'web' && this.webSocketManager) {
      this.webSocketManager.sendToDevice(deviceId, {
        type: 'assignment:changed',
        data: {
          assigned: false,
          sourceId: '',
          sourceName: '',
          timestamp: new Date()
        }
      });
    }

    // UDP devices don't need unassignment notifications as they just stop receiving updates
  }

  private loadStoredDevices(): void {
    try {
      if (fs.existsSync(this.deviceStoragePath)) {
        const data = fs.readFileSync(this.deviceStoragePath, 'utf8');
        const storedDevices: TallyDevice[] = JSON.parse(data);
        
        // Store historical device information for wake-up purposes
        storedDevices.forEach(device => {
          // Don't auto-register stored devices, just keep their info for wake-up
          console.log(`📂 Loaded device info: ${device.name} (${device.ipAddress || 'unknown IP'})`);
        });
        
        console.log(`📂 Loaded ${storedDevices.length} stored device(s) for wake-up`);
      }
    } catch (error) {
      console.error('❌ Failed to load stored devices:', error);
    }
  }

  private saveStoredDevices(): void {
    try {
      const devicesToStore = Array.from(this.devices.values())
        .filter(device => device.type === 'm5stick' || device.type === 'ESP32' || device.type === 'hardware')
        .filter(device => device.ipAddress) // Only store devices with known IP addresses
        .map(device => ({
          id: device.id,
          name: device.name,
          type: device.type,
          ipAddress: device.ipAddress,
          lastSeen: device.lastSeen
        }));
      
      fs.writeFileSync(this.deviceStoragePath, JSON.stringify(devicesToStore, null, 2));
      console.log(`💾 Stored ${devicesToStore.length} UDP device(s) for future wake-up`);
    } catch (error) {
      console.error('❌ Failed to save stored devices:', error);
    }
  }

  private async wakeUpKnownDevices(): Promise<void> {
    try {
      if (!fs.existsSync(this.deviceStoragePath)) {
        console.log('📡 No stored devices found for wake-up');
        return;
      }

      const data = fs.readFileSync(this.deviceStoragePath, 'utf8');
      const storedDevices: TallyDevice[] = JSON.parse(data);
      
      const udpDevices = storedDevices.filter(device => 
        (device.type === 'm5stick' || device.type === 'ESP32' || device.type === 'hardware') && device.ipAddress
      );

      if (udpDevices.length === 0) {
        console.log('📡 No UDP devices with IP addresses found for wake-up');
        return;
      }

      console.log(`📡 Sending wake-up signals to ${udpDevices.length} known UDP device(s)...`);

      // Send wake-up signals to all known UDP devices
      const wakeUpPromises = udpDevices.map(async (device) => {
        try {
          await this.sendWakeUpSignal(device);
          console.log(`📡 Wake-up signal sent to ${device.name} (${device.ipAddress})`);
        } catch (error) {
          console.log(`📡 Wake-up failed for ${device.name} (${device.ipAddress}): ${error instanceof Error ? error.message : error}`);
        }
      });

      // Wait for all wake-up signals to be sent (with timeout)
      await Promise.allSettled(wakeUpPromises);
      
      console.log('📡 Wake-up signals sent to all known devices');
    } catch (error) {
      console.error('❌ Failed to wake up known devices:', error);
    }
  }

  private async sendWakeUpSignal(device: TallyDevice): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!device.ipAddress) {
        reject(new Error('No IP address available'));
        return;
      }

      const client = dgram.createSocket('udp4');
      let isCompleted = false;
      
      const wakeUpMessage = {
        type: 'wake_up',
        message: 'Tally Hub server is ready',
        timestamp: new Date(),
        serverInfo: {
          udpPort: parseInt(process.env.UDP_PORT || '7411'),
          wsPort: parseInt(process.env.PORT || '3000')
        }
      };

      const messageBuffer = Buffer.from(JSON.stringify(wakeUpMessage));
      
      // Send to the standard M5/ESP32 port (usually 7411)
      const targetPort = 7411;

      // Set a timeout for the send operation
      const timeout = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          try {
            client.close();
          } catch (error) {
            // Ignore close errors during timeout
          }
          reject(new Error('Wake-up signal timeout'));
        }
      }, 3000);
      
      client.send(messageBuffer, targetPort, device.ipAddress, (error: Error | null) => {
        if (!isCompleted) {
          isCompleted = true;
          clearTimeout(timeout);
          
          try {
            client.close();
          } catch (closeError) {
            // Ignore close errors
          }
          
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }
      });

      // Handle socket errors
      client.on('error', (error: Error) => {
        if (!isCompleted) {
          isCompleted = true;
          clearTimeout(timeout);
          try {
            client.close();
          } catch (closeError) {
            // Ignore close errors
          }
          reject(error);
        }
      });
    });
  }

  private scheduleDeviceStorageSave(): void {
    // Mark that we need to save
    this.deviceStorageNeedsSave = true;
    
    // Clear existing timer if one is already scheduled
    if (this.deviceStorageSaveTimer) {
      return; // Don't schedule multiple timers, just update the flag
    }
    
    // Schedule a save after 30 seconds of inactivity (increased from 5 seconds)
    this.deviceStorageSaveTimer = setTimeout(() => {
      if (this.deviceStorageNeedsSave) {
        this.saveStoredDevices();
        this.deviceStorageNeedsSave = false;
      }
      this.deviceStorageSaveTimer = null;
    }, 30000); // 30 seconds instead of 5
  }

  private startPeriodicDeviceStorageSave(): void {
    // Save device storage every 5 minutes to capture any changes
    this.periodicSaveInterval = setInterval(() => {
      const udpDeviceCount = Array.from(this.devices.values())
        .filter(device => (device.type === 'm5stick' || device.type === 'ESP32' || device.type === 'hardware') && device.ipAddress)
        .length;
      
      if (udpDeviceCount > 0) {
        this.saveStoredDevices();
        console.log(`📅 Periodic device storage save (${udpDeviceCount} UDP devices)`);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }
}

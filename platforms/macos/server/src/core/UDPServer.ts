import { createSocket, Socket } from 'dgram';
import os from 'os';
import bonjour from 'bonjour';
import { TallyHub } from './TallyHub';
import { TallyDevice, TallyState } from '../types';

interface M5Device {
  id: string;
  address: string;
  port: number;
  lastSeen: Date;
  device: TallyDevice;
}

interface TrackedAdminMessage {
  id: string;
  text: string;
  color?: string;
  duration?: number;
  timestamp: number; // when sent
  targetDeviceId?: string; // undefined means broadcast
  acknowledgements: Record<string, { method: string; at: number; snippet?: string }>;
}

export class UDPServer {
  private socket: Socket | null = null;
  private tallyHub: TallyHub;
  private m5Devices: Map<string, M5Device> = new Map();
  private port: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private adminMessages: TrackedAdminMessage[] = []; // ring buffer
  private readonly maxAdminMessages = 50;
  private mdns: ReturnType<typeof bonjour> | null = null;
  private mdnsService: any = null;

  constructor(tallyHub: TallyHub) {
    this.tallyHub = tallyHub;
    this.port = parseInt(process.env.UDP_PORT || '7411');
    this.setupEventHandlers();
  }

  /**
   * Clean source name for M5 devices by removing prefixes and formatting
   * Uses the same logic as the Web Tally to ensure consistency
   */
  private cleanSourceName(sourceName: string): string {
    let cleaned = sourceName;
    
    // Use the same cleaning logic as tally.html
    if (cleaned.startsWith('Source obs-scene-')) {
      cleaned = cleaned.replace('Source obs-scene-', '');
    } else if (cleaned.startsWith('Source obs-source-')) {
      cleaned = cleaned.replace('Source obs-source-', '');
    } else {
      // Fallback for other formats - remove common prefixes
      cleaned = cleaned.replace(/^(Source |Scene |obs-scene-|obs-source-|vmix-input-|vmix-scene-)/i, '');
    }
    
    return cleaned;
  }

  private setupEventHandlers(): void {
    this.tallyHub.on('tally:update', (tallyState: TallyState) => {
      this.broadcastTallyUpdate(tallyState);
    });

    this.tallyHub.on('device:notify', ({ device, tallyState }: { device: TallyDevice, tallyState: TallyState }) => {
      if (device.type === 'm5stick' || device.type === 'ESP32') {
        this.sendToM5Device(device.id, tallyState);
      }
    });
  }

  /**
   * Broadcast a short admin text message to all registered M5 / ESP32 tally devices.
   * @param text Message body (will be truncated to 20 characters for status bar display)
   * @param opts Optional parameters: color (hex string), duration (ms), targetDeviceId for single device
   */
  public sendAdminMessage(text: string, opts: { color?: string; duration?: number; deviceId?: string } = {}): void {
    // Limit message length to prevent display issues (20 chars fits in status bar)
    const maxLength = 20;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength - 3) + "...";
      console.log(`📝 Admin message truncated to ${maxLength} characters for display`);
    }
    
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const ts = Date.now();
    const payload = {
      type: 'admin_message',
      id,
      text,
      color: opts.color,
      duration: opts.duration,
      timestamp: ts
    };

    // Track message
    const entry: TrackedAdminMessage = {
      id,
      text,
      color: opts.color,
      duration: opts.duration,
      timestamp: ts,
      targetDeviceId: opts.deviceId,
      acknowledgements: {}
    };
    this.adminMessages.unshift(entry);
    if (this.adminMessages.length > this.maxAdminMessages) this.adminMessages.pop();

    if (opts.deviceId) {
      this.sendToDevice(opts.deviceId, payload);
      return;
    }
    // broadcast to all
    for (const m5Device of this.m5Devices.values()) {
      this.sendToAddress(m5Device.address, m5Device.port, payload);
    }
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createSocket('udp4');

      this.socket.on('listening', () => {
        const address = this.socket!.address();
        console.log(`📡 UDP server listening on ${address.address}:${address.port}`);
        // Start mDNS advertisement unless disabled
        if (!process.env.DISABLE_MDNS) {
          try {
            this.mdns = bonjour();
            const apiPort = parseInt(process.env.PORT || '3000');
            this.mdnsService = this.mdns.publish({
              name: `TallyHub-${address.address}`,
              type: 'tallyhub',
              protocol: 'udp',
              port: this.port,
              txt: {
                api: String(apiPort),
                udp: String(this.port),
                ver: process.env.npm_package_version || 'unknown'
              }
            });
            this.mdnsService.on('up', () => console.log('📣 mDNS service _tallyhub._udp advertised'));
          } catch (e) {
            console.warn('mDNS advertisement failed (continuing):', e);
          }
        } else {
          console.log('📣 mDNS disabled via DISABLE_MDNS env var');
        }
        resolve();
      });

      this.socket.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo);
      });

      this.socket.on('error', (error) => {
        console.error('UDP server error:', error);
        reject(error);
      });

      this.socket.bind(this.port);

      // Start cleanup interval for inactive devices
      this.cleanupInterval = setInterval(() => {
        const deviceCount = this.m5Devices.size;
        console.log(`🔍 Checking ${deviceCount} M5 device connections...`);
        this.cleanupInactiveDevices();
        const activeDevices = this.m5Devices.size;
        if (deviceCount !== activeDevices) {
          console.log(`📊 M5 devices: ${activeDevices} active`);
        }
      }, 60000); // Clean up every minute
    });
  }

  private handleMessage(msg: Buffer, rinfo: any): void {
    try {
      const message = JSON.parse(msg.toString());
      const deviceKey = `${rinfo.address}:${rinfo.port}`;

      switch (message.type) {
        case 'discover':
          // Lightweight auto-discovery request from firmware devices.
          // Reply unicast with hub network coordinates so device can persist them.
          this.handleDiscovery(rinfo);
          break;
        case 'register':
          this.handleDeviceRegistration(message, rinfo);
          break;

        case 'heartbeat':
          this.handleHeartbeat(message, rinfo);
          break;

        case 'status':
          this.handleStatusUpdate(message, rinfo);
          break;
        case 'admin_message_ack':
          this.handleAdminMessageAck(message, rinfo);
          break;

        default:
          console.warn(`Unknown UDP message type: ${message.type} from ${deviceKey}`);
      }
    } catch (error) {
      console.error('Error parsing UDP message:', error);
    }
  }

  /** Determine a suitable LAN IPv4 address for discovery responses */
  private getLocalIPv4(): string {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      const list = nets[name];
      if (!list) continue;
      for (const ni of list) {
        if (ni.family === 'IPv4' && !ni.internal && ni.address) {
          return ni.address;
        }
      }
    }
    return '0.0.0.0';
  }

  private handleDiscovery(rinfo: any): void {
    const payload = {
      type: 'discover_reply',
      hubIp: this.getLocalIPv4(),
      udpPort: this.port,
      apiPort: parseInt(process.env.PORT || '3000'),
      timestamp: new Date()
    };
    this.sendToAddress(rinfo.address, rinfo.port, payload);
  }

  /** Graceful shutdown allowing tests / electron app to stop networking & mDNS */
  public async stop(): Promise<void> {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.mdnsService) {
      try { this.mdnsService.stop(() => {}); } catch {}
      this.mdnsService = null;
    }
    if (this.mdns) {
      try { this.mdns.destroy(); } catch {}
      this.mdns = null;
    }
    if (this.socket) {
      await new Promise<void>(res => {
        try { this.socket!.close(() => res()); } catch { res(); }
      });
      this.socket = null;
    }
  }

  private handleDeviceRegistration(message: any, rinfo: any): void {
    const deviceId = message.deviceId || `m5-${rinfo.address}-${rinfo.port}`;
    const deviceName = message.deviceName || `M5 Stick ${deviceId}`;
    const deviceKey = `${rinfo.address}:${rinfo.port}`;
    
    // Determine device type based on the deviceType field in the message
    // ESP32-1732S019 sends "esp32-1732s019", M5Stick doesn't send this field
    const deviceType = message.deviceType === 'esp32-1732s019' ? 'ESP32' : 'm5stick';
    
    // Extract assignment information from registration message
    const deviceHasAssignment = message.isAssigned === true && message.assignedSource;
    const deviceAssignedSource = message.assignedSource || undefined;

    // Check if this device is already registered (either by key or by device ID)
    const existingByKey = this.m5Devices.get(deviceKey);
    const existingById = Array.from(this.m5Devices.values()).find(d => d.id === deviceId);

    if (existingByKey) {
      // Update existing device registration
      existingByKey.lastSeen = new Date();
      existingByKey.device.lastSeen = new Date();
      existingByKey.device.connected = true;
      existingByKey.device.type = deviceType as 'ESP32' | 'm5stick';
      
      // Update device ID if it has changed (device was reconfigured)
      if (existingByKey.id !== deviceId) {
        console.log(`📡 Device ID changed from ${existingByKey.id} to ${deviceId}`);
        // Unregister old device ID
        this.tallyHub.unregisterDevice(existingByKey.id);
        // Update to new device ID
        existingByKey.id = deviceId;
        existingByKey.device.id = deviceId;
        existingByKey.device.name = deviceName;
        // Register with new device ID and handle assignment sync
        this.tallyHub.registerDevice(existingByKey.device);
        this.handleAssignmentSync(deviceId, deviceHasAssignment, deviceAssignedSource);
      } else {
        // Just update the existing registration and sync assignment
        this.tallyHub.updateDeviceLastSeen(deviceId);
        this.handleAssignmentSync(deviceId, deviceHasAssignment, deviceAssignedSource);
      }

      console.log(`📡 Device re-registered: ${deviceName} (${deviceType.toUpperCase()}) (${rinfo.address}:${rinfo.port})`);
    } else if (existingById) {
      // Device with same ID exists but from different IP:port - remove old entry
      const oldKey = Array.from(this.m5Devices.entries())
        .find(([_, device]) => device.id === deviceId)?.[0];
      
      if (oldKey) {
        console.log(`📡 Device moved: ${deviceId} from ${oldKey} to ${deviceKey}`);
        this.m5Devices.delete(oldKey);
      }
      
      // Create new entry with updated location
      const device: TallyDevice = {
        id: deviceId,
        name: deviceName,
        type: deviceType as 'ESP32' | 'm5stick',
        ipAddress: rinfo.address,
        lastSeen: new Date(),
        connected: true,
        assignmentMode: 'assigned'
      };

      const m5Device: M5Device = {
        id: deviceId,
        address: rinfo.address,
        port: rinfo.port,
        lastSeen: new Date(),
        device
      };

      this.m5Devices.set(deviceKey, m5Device);
      this.tallyHub.registerDevice(device);
      this.handleAssignmentSync(deviceId, deviceHasAssignment, deviceAssignedSource);
      console.log(`📡 Device registered (moved): ${deviceName} (${deviceType.toUpperCase()}) (${rinfo.address}:${rinfo.port})`);
    } else {
      // Completely new device
      const device: TallyDevice = {
        id: deviceId,
        name: deviceName,
        type: deviceType as 'ESP32' | 'm5stick',
        ipAddress: rinfo.address,
        lastSeen: new Date(),
        connected: true,
        assignmentMode: 'assigned'
      };

      const m5Device: M5Device = {
        id: deviceId,
        address: rinfo.address,
        port: rinfo.port,
        lastSeen: new Date(),
        device
      };

      this.m5Devices.set(deviceKey, m5Device);
      this.tallyHub.registerDevice(device);
      this.handleAssignmentSync(deviceId, deviceHasAssignment, deviceAssignedSource);
      console.log(`📡 Device registered: ${deviceName} (${deviceType.toUpperCase()}) (${rinfo.address}:${rinfo.port})`);
    }

    // Send registration confirmation
    this.sendToAddress(rinfo.address, rinfo.port, {
      type: 'registered',
      deviceId,
      timestamp: new Date()
    });

    // Note: M5 devices now only work in assigned mode
    // They will only receive tally updates for their assigned source
    // No need to send all tally states on registration
  }

  private handleHeartbeat(message: any, rinfo: any): void {
    const deviceKey = `${rinfo.address}:${rinfo.port}`;
    const m5Device = this.m5Devices.get(deviceKey);

    if (m5Device) {
      m5Device.lastSeen = new Date();
      this.tallyHub.updateDeviceLastSeen(m5Device.id);

      // Send heartbeat response
      this.sendToAddress(rinfo.address, rinfo.port, {
        type: 'heartbeat_ack',
        timestamp: new Date()
      });
    } else {
      // Unknown device sending heartbeat - prompt it to register
      console.log(`📡 Unknown device heartbeat from ${rinfo.address}:${rinfo.port}, requesting registration`);
      this.sendToAddress(rinfo.address, rinfo.port, {
        type: 'register_required',
        message: 'Please register with the hub',
        timestamp: new Date()
      });
    }
  }

  private handleStatusUpdate(message: any, rinfo: any): void {
    const deviceKey = `${rinfo.address}:${rinfo.port}`;
    const m5Device = this.m5Devices.get(deviceKey);

    if (m5Device) {
      m5Device.lastSeen = new Date();
      // Handle any status updates from the M5 device
      console.log(`Status update from ${m5Device.device.name}:`, message.data);
    }
  }

  private handleAdminMessageAck(message: any, rinfo: any): void {
    const deviceKey = `${rinfo.address}:${rinfo.port}`;
    const m5Device = this.m5Devices.get(deviceKey);
    const summary = (message && message.textSnippet) ? message.textSnippet : '';
    const msgId = message.id as string | undefined;
    if (m5Device) {
      console.log(`✅ Admin message ACK from ${m5Device.id} (${m5Device.device.type}) method=${message.method || 'unknown'}${summary ? ` snippet=\"${summary}\"` : ''}${msgId ? ` id=${msgId}` : ''}`);
      if (msgId) {
        const tracked = this.adminMessages.find(m => m.id === msgId);
        if (tracked) {
          tracked.acknowledgements[m5Device.id] = { method: message.method || 'unknown', at: Date.now(), snippet: summary };
        }
      }
    } else {
      console.log(`✅ Admin message ACK from unknown device ${deviceKey}`);
    }
  }

  /** Return recent admin messages with acknowledgement stats */
  public getRecentAdminMessages(limit = 25) {
    return this.adminMessages.slice(0, limit).map(m => ({
      id: m.id,
      text: m.text,
      color: m.color,
      duration: m.duration,
      timestamp: m.timestamp,
      targetDeviceId: m.targetDeviceId,
      acknowledgements: m.acknowledgements,
      ackCount: Object.keys(m.acknowledgements).length
    }));
  }

  private sendToAddress(address: string, port: number, message: any): void {
    if (!this.socket) return;

    const buffer = Buffer.from(JSON.stringify(message));
    this.socket.send(buffer, port, address, (error) => {
      if (error) {
        console.error(`Error sending UDP message to ${address}:${port}:`, error);
      }
    });
  }

  public sendToDevice(deviceId: string, message: any): void {
    // Find the M5 device by deviceId
    for (const m5Device of this.m5Devices.values()) {
      if (m5Device.device.id === deviceId) {
        this.sendToAddress(m5Device.address, m5Device.port, message);
        return;
      }
    }
    console.log(`⚠️ M5 device ${deviceId} not found for sending message`);
  }

  private sendToM5Device(deviceId: string, tallyState: TallyState): void {
    for (const m5Device of this.m5Devices.values()) {
      if (m5Device.id === deviceId) {
        const message = {
          type: 'tally',
          data: {
            id: tallyState.id,
            name: this.cleanSourceName(tallyState.name), // Clean the source name
            preview: tallyState.preview,
            program: tallyState.program,
            recording: tallyState.recording || false,  // Include recording status
            streaming: tallyState.streaming || false   // Include streaming status
          }
        };
        
        console.log(`📡 Sending to M5 device ${deviceId}: ${JSON.stringify(message.data)}`);
        this.sendToAddress(m5Device.address, m5Device.port, message);
        break;
      }
    }
  }

  private broadcastTallyUpdate(tallyState: TallyState): void {
    // Broadcast global PROGRAM state so devices can learn the live source even when not assigned to it.
    if (!tallyState.program) return;
    // Only broadcast OBS scenes (skip OBS sources) to avoid overlays/logos; include vMix/ATEM inputs.
    const id = tallyState.id || '';
    if (id.startsWith('obs-source-')) return;
    if (!(id.startsWith('obs-scene-') || id.startsWith('vmix-input-') || id.startsWith('atem-input-'))) return;

    const message = {
      type: 'tally',
      data: {
        id: tallyState.id,
        name: this.cleanSourceName(tallyState.name),
        preview: tallyState.preview,
        program: true,
        recording: tallyState.recording || false,
        streaming: tallyState.streaming || false
      }
    };
    for (const m5Device of this.m5Devices.values()) {
      this.sendToAddress(m5Device.address, m5Device.port, message);
    }
  }

  private cleanupInactiveDevices(): void {
    const now = new Date();
    const timeout = 600000; // 10 minutes timeout (increased from 5 minutes)

    for (const [deviceKey, m5Device] of this.m5Devices.entries()) {
      const timeSinceLastSeen = now.getTime() - m5Device.lastSeen.getTime();
      
      if (timeSinceLastSeen > timeout) {
        console.log(`⏰ M5 device ${m5Device.device.name} timed out after ${Math.round(timeSinceLastSeen/1000)} seconds`);
        this.m5Devices.delete(deviceKey);
        this.tallyHub.unregisterDevice(m5Device.id);
      }
    }
  }

  // (stop method with mDNS teardown defined earlier)

  public getM5Devices(): M5Device[] {
    return Array.from(this.m5Devices.values());
  }

  public sendAssignmentToDevice(deviceId: string, sourceId: string, sourceName: string): void {
    for (const m5Device of this.m5Devices.values()) {
      if (m5Device.id === deviceId) {
        this.sendToAddress(m5Device.address, m5Device.port, {
          type: 'assignment',
          data: {
            mode: 'assigned',
            sourceId: sourceId,
            sourceName: this.cleanSourceName(sourceName) // Clean the source name for assignment too
          }
        });
        console.log(`📡 Sent assignment notification to ${m5Device.device.name}: ${this.cleanSourceName(sourceName)}`);
        return;
      }
    }
    console.log(`⚠️ M5 device ${deviceId} not found for assignment notification`);
  }

  public sendUnassignmentToDevice(deviceId: string): void {
    for (const m5Device of this.m5Devices.values()) {
      if (m5Device.id === deviceId) {
        this.sendToAddress(m5Device.address, m5Device.port, {
          type: 'assignment',
          data: {
            mode: 'unassigned'
          }
        });
        console.log(`📡 Sent unassignment notification to ${m5Device.device.name}`);
        return;
      }
    }
    console.log(`⚠️ M5 device ${deviceId} not found for unassignment notification`);
  }

  /**
   * Handle assignment synchronization during device registration
   * Ensures device assignment state is synchronized between device memory and hub
   */
  private handleAssignmentSync(deviceId: string, deviceHasAssignment: boolean, deviceAssignedSource?: string): void {
    if (!deviceHasAssignment || !deviceAssignedSource) {
      // Device has no assignment in memory - nothing to sync
      console.log(`📡 Device ${deviceId} has no assignment to sync`);
      return;
    }

    // Device reports an assignment - check if hub knows about it
    const hubAssignments = this.tallyHub.getDeviceAssignments();
    const hubAssignment = hubAssignments.find(assignment => assignment.deviceId === deviceId);
    
    if (hubAssignment && hubAssignment.sourceId === deviceAssignedSource) {
      // Assignment is already synchronized
      console.log(`✅ Device ${deviceId} assignment synchronized: ${deviceAssignedSource}`);
      return;
    }

    if (hubAssignment && hubAssignment.sourceId !== deviceAssignedSource) {
      // Conflict: device has different assignment than hub
      console.log(`⚠️ Assignment conflict for device ${deviceId}: device has ${deviceAssignedSource}, hub has ${hubAssignment.sourceId}`);
      // Hub assignment takes precedence - send correct assignment to device
      this.sendAssignmentToDevice(deviceId, hubAssignment.sourceId, hubAssignment.sourceName || `Source ${hubAssignment.sourceId}`);
      return;
    }

    // Device has assignment but hub doesn't - sync device assignment to hub
    console.log(`🔄 Syncing device assignment to hub: ${deviceId} -> ${deviceAssignedSource}`);
    
    // Check if the source exists in the hub's available sources
    const availableSources = this.tallyHub.getTallies();
    const sourceExists = availableSources.some((source: any) => source.id === deviceAssignedSource);
    
    if (sourceExists) {
      // Source exists - restore assignment in hub
      const success = this.tallyHub.assignSourceToDevice(deviceId, deviceAssignedSource, 'device-sync');
      if (success) {
        console.log(`✅ Successfully synced device assignment: ${deviceId} -> ${deviceAssignedSource}`);
      } else {
        console.log(`❌ Failed to sync device assignment: ${deviceId} -> ${deviceAssignedSource}`);
        // Clear device assignment since sync failed
        this.sendUnassignmentToDevice(deviceId);
      }
    } else {
      // Source no longer exists - clear device assignment
      console.log(`⚠️ Device ${deviceId} assigned to non-existent source ${deviceAssignedSource} - clearing assignment`);
      this.sendUnassignmentToDevice(deviceId);
    }
  }
}

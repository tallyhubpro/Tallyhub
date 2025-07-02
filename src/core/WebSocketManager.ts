import { WebSocketServer, WebSocket } from 'ws';
import { TallyHub } from './TallyHub';
import { TallyDevice, TallyState } from '../types';

interface WebSocketClient {
  id: string;
  ws: WebSocket;
  device: TallyDevice;
  lastPing: Date;
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private tallyHub: TallyHub;
  private clients: Map<string, WebSocketClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(wss: WebSocketServer, tallyHub: TallyHub) {
    this.wss = wss;
    this.tallyHub = tallyHub;
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.wss.on('connection', (ws, request) => {
      const url = new URL(request.url || '/', `http://${request.headers.host}`);
      const deviceId = url.searchParams.get('deviceId') || this.generateDeviceId();
      const deviceName = url.searchParams.get('deviceName') || `Web Device ${deviceId}`;
      
      this.handleNewConnection(ws, deviceId, deviceName);
    });

    // Listen for tally updates from the hub
    this.tallyHub.on('tally:update', (tallyState: TallyState) => {
      this.broadcastTallyUpdate(tallyState);
    });

    // Listen for status updates from the hub
    this.tallyHub.on('status:update', (statusUpdate: any) => {
      this.broadcastStatusUpdate(statusUpdate);
    });

    // Listen for device notifications
    this.tallyHub.on('device:notify', ({ device, tallyState }: { device: TallyDevice, tallyState: TallyState }) => {
      if (device.type === 'web') {
        this.sendToDevice(device.id, {
          type: 'tally:update',
          data: tallyState
        });
      }
    });

    // Listen for device assignment changes
    this.tallyHub.on('device:assignment_changed', (assignmentData: any) => {
      this.broadcastToAdminClients({
        type: 'device:assignment_changed',
        data: assignmentData
      });
    });
  }

  private handleNewConnection(ws: WebSocket, deviceId: string, deviceName: string): void {
    // Determine device type based on device name
    const deviceType = deviceName.includes('Admin') ? 'admin' : 'web';
    
    const device: TallyDevice = {
      id: deviceId,
      name: deviceName,
      type: deviceType as 'web' | 'm5stick',
      lastSeen: new Date(),
      connected: true,
      assignmentMode: 'assigned'
    };

    const client: WebSocketClient = {
      id: deviceId,
      ws,
      device,
      lastPing: new Date()
    };

    this.clients.set(deviceId, client);
    
    // Only register non-admin devices with TallyHub
    if (deviceType !== 'admin') {
      this.tallyHub.registerDevice(device);
    }

    console.log(`🌐 WebSocket client connected: ${deviceName} (${deviceId}) [${deviceType}]`);

    // Setup WebSocket event handlers
    ws.on('message', (data) => {
      this.handleMessage(client, data);
    });

    ws.on('close', () => {
      this.handleDisconnection(client);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${deviceName}:`, error);
      this.handleDisconnection(client);
    });

    // Send initial connection confirmation
    this.sendToClient(client, {
      type: 'connection:established',
      data: {
        deviceId,
        deviceName,
        timestamp: new Date()
      }
    });

    // Send current tally states only for non-admin clients
    if (deviceType !== 'admin') {
      const tallies = this.tallyHub.getTallies();
      tallies.forEach(tally => {
        this.sendToClient(client, {
          type: 'tally:update',
          data: tally
        });
      });
    }
  }

  private handleMessage(client: WebSocketClient, data: any): void {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'ping':
          client.lastPing = new Date();
          this.tallyHub.updateDeviceLastSeen(client.id);
          this.sendToClient(client, {
            type: 'pong',
            data: { timestamp: new Date() }
          });
          break;

        case 'device:update':
          // Update device information
          if (message.data.name) {
            client.device.name = message.data.name;
          }
          break;

        case 'tally:request':
          // Request specific tally information
          const tallies = this.tallyHub.getTallies();
          tallies.forEach(tally => {
            this.sendToClient(client, {
              type: 'tally:update',
              data: tally
            });
          });
          break;

        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private handleDisconnection(client: WebSocketClient): void {
    console.log(`🌐 WebSocket client disconnected: ${client.device.name} (${client.id})`);
    this.clients.delete(client.id);
    
    // Only unregister non-admin devices from TallyHub
    if (!client.device.name.includes('Admin')) {
      this.tallyHub.unregisterDevice(client.id);
    }
  }

  private sendToClient(client: WebSocketClient, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message to client:', error);
      }
    }
  }

  public sendToDevice(deviceId: string, message: any): void {
    const client = this.clients.get(deviceId);
    if (client) {
      this.sendToClient(client, message);
    }
  }

  private broadcastTallyUpdate(tallyState: TallyState): void {
    const message = {
      type: 'tally:update',
      data: tallyState
    };

    for (const client of this.clients.values()) {
      this.sendToClient(client, message);
    }
  }

  private broadcastStatusUpdate(statusUpdate: any): void {
    const message = {
      type: 'status:update',
      data: statusUpdate
    };

    for (const client of this.clients.values()) {
      this.sendToClient(client, message);
    }
  }

  public broadcastToAdminClients(message: any): void {
    for (const client of this.clients.values()) {
      if (client.device.name.includes('Admin')) {
        this.sendToClient(client, message);
      }
    }
  }

  private generateDeviceId(): string {
    return `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public start(): void {
    console.log('🌐 WebSocket server started');
    
    // Start ping interval to check client connections
    this.pingInterval = setInterval(() => {
      const clientCount = this.clients.size;
      console.log(`🔍 Checking ${clientCount} WebSocket client connections...`);
      this.checkClientConnections();
      const activeClients = this.clients.size;
      if (clientCount !== activeClients) {
        console.log(`📊 WebSocket clients: ${activeClients} active`);
      }
    }, 30000); // Check every 30 seconds
  }

  private checkClientConnections(): void {
    const now = new Date();
    const timeout = 180000; // 3 minutes timeout (increased from 1 minute)

    for (const [clientId, client] of this.clients.entries()) {
      const timeSinceLastPing = now.getTime() - client.lastPing.getTime();
      
      if (timeSinceLastPing > timeout) {
        console.log(`⏰ Client ${client.device.name} timed out after ${Math.round(timeSinceLastPing/1000)} seconds`);
        client.ws.terminate();
        this.clients.delete(clientId);
        // Only unregister non-admin devices from TallyHub
        if (!client.device.name.includes('Admin')) {
          this.tallyHub.unregisterDevice(clientId);
        }
      }
    }
  }

  public stop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    
    this.clients.clear();
    console.log('🌐 WebSocket server stopped');
  }

  public getConnectedClients(): WebSocketClient[] {
    return Array.from(this.clients.values());
  }
}

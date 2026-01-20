import { EventEmitter } from 'events';
import * as dgram from 'dgram';
import * as net from 'net';
import { MixerConnection, TallyUpdate } from '../../types';

/**
 * TSL UMD 3.1 Protocol Connector
 * 
 * Supports TSL UMD protocol over UDP or TCP
 * Compatible with: FOR-A HVS, Panasonic AV-HS, Ross Vision/Carbonite, 
 * Grass Valley, and many other professional broadcast mixers
 * 
 * Protocol Specification:
 * - Packet size: 18 bytes
 * - Control byte (byte 0): Contains tally bits
 *   - Bit 7 (0x80): Preview/Preset tally
 *   - Bit 6 (0x40): Program/On-Air tally
 * - Display bytes (1-16): Source name (ASCII, space-padded)
 * - Brightness byte (17): Display brightness (0x00-0x03)
 */

interface TSLUMDPacket {
  address: number;
  control: number;
  displayData: string;
  brightness: number;
  program: boolean;
  preview: boolean;
}

export class TSLUMDConnector extends EventEmitter {
  private connection: MixerConnection;
  private udpSocket: dgram.Socket | null = null;
  private tcpServer: net.Server | null = null;
  private tcpClient: net.Socket | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 5000;
  private maxReconnectDelay = 300000;
  private sources: Map<number, TSLUMDPacket> = new Map(); // address -> packet data
  private protocol: 'udp' | 'tcp';

  constructor(connection: MixerConnection) {
    super();
    this.connection = connection;
    
    // Determine protocol from port or connection settings
    // Common ports: UDP 5000-6000, TCP 5000
    this.protocol = (connection as any).protocol === 'tcp' ? 'tcp' : 'udp';
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log(`⏳ TSL UMD connection to ${this.connection.host}:${this.connection.port} already in progress`);
      return;
    }

    this.isConnecting = true;

    try {
      if (this.protocol === 'udp') {
        await this.connectUDP();
      } else {
        await this.connectTCP();
      }
      
      console.log(`✅ TSL UMD ${this.protocol.toUpperCase()} connector initialized for ${this.connection.host}:${this.connection.port}`);
      this.reconnectAttempts = 0;
      this.emit('connected');
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error(`🚨 TSL UMD connection failed to ${this.connection.host}:${this.connection.port}:`, errorMessage);
      this.emit('error', new Error(`TSL UMD connection failed: ${errorMessage}`));
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private async connectUDP(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.udpSocket = dgram.createSocket('udp4');

        this.udpSocket.on('message', (msg, rinfo) => {
          this.parseUMDPacket(msg);
        });

        this.udpSocket.on('error', (error) => {
          console.error(`🚨 TSL UMD UDP socket error:`, this.getErrorMessage(error));
          reject(error);
        });

        this.udpSocket.on('listening', () => {
          const address = this.udpSocket!.address();
          console.log(`📡 TSL UMD UDP listening on ${address.address}:${address.port}`);
          resolve();
        });

        this.udpSocket.bind(this.connection.port);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async connectTCP(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // TSL UMD can work in server mode (mixer connects to us) or client mode (we connect to mixer)
        const mode = (this.connection as any).tcpMode || 'server';

        if (mode === 'server') {
          this.tcpServer = net.createServer((socket) => {
            console.log(`📡 TSL UMD TCP client connected from ${socket.remoteAddress}:${socket.remotePort}`);
            this.tcpClient = socket;
            this.setupTCPSocketHandlers(socket);
          });

          this.tcpServer.on('error', (error) => {
            console.error(`🚨 TSL UMD TCP server error:`, this.getErrorMessage(error));
            reject(error);
          });

          this.tcpServer.listen(this.connection.port, () => {
            console.log(`📡 TSL UMD TCP server listening on port ${this.connection.port}`);
            resolve();
          });
        } else {
          // Client mode - connect to mixer
          this.tcpClient = net.createConnection({
            host: this.connection.host,
            port: this.connection.port
          });

          this.setupTCPSocketHandlers(this.tcpClient);

          this.tcpClient.on('connect', () => {
            console.log(`📡 TSL UMD TCP connected to ${this.connection.host}:${this.connection.port}`);
            resolve();
          });

          this.tcpClient.on('error', (error) => {
            console.error(`🚨 TSL UMD TCP client error:`, this.getErrorMessage(error));
            reject(error);
          });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private setupTCPSocketHandlers(socket: net.Socket): void {
    let buffer = Buffer.alloc(0);

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);

      // Process complete 18-byte packets
      while (buffer.length >= 18) {
        const packet = buffer.slice(0, 18);
        this.parseUMDPacket(packet);
        buffer = buffer.slice(18);
      }
    });

    socket.on('close', () => {
      console.log(`📡 TSL UMD TCP connection closed`);
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    socket.on('error', (error) => {
      console.error(`🚨 TSL UMD TCP socket error:`, this.getErrorMessage(error));
    });
  }

  private parseUMDPacket(buffer: Buffer): void {
    if (buffer.length < 18) {
      console.warn(`⚠️ TSL UMD packet too short: ${buffer.length} bytes (expected 18)`);
      return;
    }

    try {
      // Byte 0: Address/Control
      // High nibble (bits 4-7): Address (screen number)
      // Low nibble (bits 0-3): Control flags
      const addressByte = buffer[0];
      const address = (addressByte & 0xF0) >> 4; // Extract address from high nibble
      const control = addressByte; // Full control byte

      // Extract tally states from control byte
      const program = (control & 0x40) !== 0; // Bit 6: Program/On-Air
      const preview = (control & 0x80) !== 0; // Bit 7: Preview/Preset

      // Bytes 1-16: Display data (source name)
      const displayData = buffer.slice(1, 17).toString('ascii').trim();

      // Byte 17: Brightness
      const brightness = buffer[17];

      const packet: TSLUMDPacket = {
        address,
        control,
        displayData,
        brightness,
        program,
        preview
      };

      // Store packet data
      this.sources.set(address, packet);

      // Emit tally update for this source
      const tallyUpdate: TallyUpdate = {
        deviceId: `tsl-${this.connection.id}-${address}`,
        preview,
        program,
        timestamp: new Date()
      };

      this.emit('tally:update', {
        sourceId: `tsl-${address}`,
        sourceName: displayData || `Source ${address}`,
        ...tallyUpdate
      });

      console.log(`📊 TSL UMD [${address}] "${displayData}" - Program: ${program}, Preview: ${preview}`);
    } catch (error) {
      console.error(`🚨 Error parsing TSL UMD packet:`, this.getErrorMessage(error));
    }
  }

  async disconnect(): Promise<void> {
    console.log(`🔌 Disconnecting TSL UMD from ${this.connection.host}:${this.connection.port}`);
    
    this.clearReconnectInterval();

    if (this.udpSocket) {
      this.udpSocket.close();
      this.udpSocket = null;
    }

    if (this.tcpClient) {
      this.tcpClient.destroy();
      this.tcpClient = null;
    }

    if (this.tcpServer) {
      this.tcpServer.close();
      this.tcpServer = null;
    }

    this.sources.clear();
    this.emit('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`🚨 TSL UMD max reconnection attempts reached for ${this.connection.host}:${this.connection.port}`);
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    console.log(`🔄 TSL UMD scheduling reconnection attempt ${this.reconnectAttempts} in ${delay / 1000}s`);

    this.reconnectInterval = setTimeout(() => {
      this.reconnectInterval = null;
      this.connect();
    }, delay);
  }

  private clearReconnectInterval(): void {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  getSources(): Array<{ id: string; name: string; preview: boolean; program: boolean }> {
    const sources: Array<{ id: string; name: string; preview: boolean; program: boolean }> = [];
    
    this.sources.forEach((packet, address) => {
      sources.push({
        id: `tsl-${address}`,
        name: packet.displayData || `Source ${address}`,
        preview: packet.preview,
        program: packet.program
      });
    });

    return sources;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

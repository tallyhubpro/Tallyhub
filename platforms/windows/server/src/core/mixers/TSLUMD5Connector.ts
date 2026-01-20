import { EventEmitter } from 'events';
import * as dgram from 'dgram';
import * as net from 'net';
import { MixerConnection, TallyUpdate } from '../../types';

/**
 * TSL UMD 5.0 Protocol Connector
 * 
 * Supports TSL UMD version 5.0 over UDP or TCP
 * Compatible with: Advanced broadcast mixers requiring extended UMD protocol
 * Grass Valley, Sony, and other professional broadcast systems
 * 
 * Protocol Specification:
 * - Variable length packets (minimum 12 bytes)
 * - Header: PBC (1 byte) + VAR (1 byte) + FLAGS (2 bytes)
 * - CONTROL byte with tally bits (bit 7=preview, bit 6=program)
 * - Extended display data with Unicode support
 * - Multiple display formats (16-char, 32-char, etc.)
 */

interface TSLUMD5Packet {
  address: number;
  control: number;
  displayData: string;
  brightness: number;
  program: boolean;
  preview: boolean;
  textSize: number;
}

export class TSLUMD5Connector extends EventEmitter {
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
  private sources: Map<number, TSLUMD5Packet> = new Map();
  private protocol: 'udp' | 'tcp';
  private tcpBuffer = Buffer.alloc(0);

  constructor(connection: MixerConnection) {
    super();
    this.connection = connection;
    this.protocol = (connection as any).protocol === 'tcp' ? 'tcp' : 'udp';
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log(`⏳ TSL UMD 5.0 connection to ${this.connection.host}:${this.connection.port} already in progress`);
      return;
    }

    this.isConnecting = true;

    try {
      if (this.protocol === 'udp') {
        await this.connectUDP();
      } else {
        await this.connectTCP();
      }
      
      console.log(`✅ TSL UMD 5.0 ${this.protocol.toUpperCase()} connector initialized for ${this.connection.host}:${this.connection.port}`);
      this.reconnectAttempts = 0;
      this.emit('connected');
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error(`🚨 TSL UMD 5.0 connection failed to ${this.connection.host}:${this.connection.port}:`, errorMessage);
      this.emit('error', new Error(`TSL UMD 5.0 connection failed: ${errorMessage}`));
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
          this.parseUMD5Packet(msg);
        });

        this.udpSocket.on('error', (error) => {
          console.error(`🚨 TSL UMD 5.0 UDP socket error:`, this.getErrorMessage(error));
          reject(error);
        });

        this.udpSocket.on('listening', () => {
          const address = this.udpSocket!.address();
          console.log(`📡 TSL UMD 5.0 UDP listening on ${address.address}:${address.port}`);
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
        const mode = (this.connection as any).tcpMode || 'server';

        if (mode === 'server') {
          this.tcpServer = net.createServer((socket) => {
            console.log(`📡 TSL UMD 5.0 TCP client connected from ${socket.remoteAddress}:${socket.remotePort}`);
            this.tcpClient = socket;
            this.setupTCPSocketHandlers(socket);
          });

          this.tcpServer.on('error', (error) => {
            console.error(`🚨 TSL UMD 5.0 TCP server error:`, this.getErrorMessage(error));
            reject(error);
          });

          this.tcpServer.listen(this.connection.port, () => {
            console.log(`📡 TSL UMD 5.0 TCP server listening on port ${this.connection.port}`);
            resolve();
          });
        } else {
          this.tcpClient = net.createConnection({
            host: this.connection.host,
            port: this.connection.port
          });

          this.setupTCPSocketHandlers(this.tcpClient);

          this.tcpClient.on('connect', () => {
            console.log(`📡 TSL UMD 5.0 TCP connected to ${this.connection.host}:${this.connection.port}`);
            resolve();
          });

          this.tcpClient.on('error', (error) => {
            console.error(`🚨 TSL UMD 5.0 TCP client error:`, this.getErrorMessage(error));
            reject(error);
          });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private setupTCPSocketHandlers(socket: net.Socket): void {
    socket.on('data', (data) => {
      this.tcpBuffer = Buffer.concat([this.tcpBuffer, data]);

      // Process complete packets
      while (this.tcpBuffer.length >= 12) {
        // Read VAR field to get packet length
        const var_field = this.tcpBuffer[1];
        const packetLength = 12 + var_field;

        if (this.tcpBuffer.length < packetLength) {
          break; // Wait for more data
        }

        const packet = this.tcpBuffer.slice(0, packetLength);
        this.parseUMD5Packet(packet);
        this.tcpBuffer = this.tcpBuffer.slice(packetLength);
      }
    });

    socket.on('close', () => {
      console.log(`📡 TSL UMD 5.0 TCP connection closed`);
      this.tcpBuffer = Buffer.alloc(0);
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    socket.on('error', (error) => {
      console.error(`🚨 TSL UMD 5.0 TCP socket error:`, this.getErrorMessage(error));
    });
  }

  private parseUMD5Packet(buffer: Buffer): void {
    if (buffer.length < 12) {
      console.warn(`⚠️ TSL UMD 5.0 packet too short: ${buffer.length} bytes (expected minimum 12)`);
      return;
    }

    try {
      // Byte 0: PBC (Protocol Byte Count) - should be 0x80 for UMD v5
      const pbc = buffer[0];
      
      // Byte 1: VAR (Variable length field count)
      const var_field = buffer[1];
      
      // Bytes 2-3: FLAGS (control flags)
      const flags = buffer.readUInt16BE(2);
      
      // Byte 4: Address high nibble
      // Byte 5: Address low nibble  
      const address = ((buffer[4] & 0x0F) << 8) | buffer[5];
      
      // Byte 6: CONTROL byte
      const control = buffer[6];
      
      // Extract tally states from control byte
      const program = (control & 0x40) !== 0; // Bit 6: Program/On-Air
      const preview = (control & 0x80) !== 0; // Bit 7: Preview/Preset
      
      // Byte 7: Brightness
      const brightness = buffer[7];
      
      // Bytes 8-11: Reserved
      
      // Bytes 12+: Display data (variable length based on VAR field)
      const textSize = var_field;
      let displayData = '';
      
      if (buffer.length >= 12 + textSize) {
        displayData = buffer.slice(12, 12 + textSize).toString('utf8').trim();
        // Remove null terminators
        displayData = displayData.replace(/\0/g, '');
      }

      const packet: TSLUMD5Packet = {
        address,
        control,
        displayData,
        brightness,
        program,
        preview,
        textSize
      };

      // Store packet data
      this.sources.set(address, packet);

      // Emit tally update
      const tallyUpdate: TallyUpdate = {
        deviceId: `tsl5-${this.connection.id}-${address}`,
        preview,
        program,
        timestamp: new Date()
      };

      this.emit('tally:update', {
        sourceId: `tsl5-${address}`,
        sourceName: displayData || `Source ${address}`,
        ...tallyUpdate
      });

      console.log(`📊 TSL UMD 5.0 [${address}] "${displayData}" - Program: ${program}, Preview: ${preview}`);
    } catch (error) {
      console.error(`🚨 Error parsing TSL UMD 5.0 packet:`, this.getErrorMessage(error));
    }
  }

  async disconnect(): Promise<void> {
    console.log(`🔌 Disconnecting TSL UMD 5.0 from ${this.connection.host}:${this.connection.port}`);
    
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
    this.tcpBuffer = Buffer.alloc(0);
    this.emit('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`🚨 TSL UMD 5.0 max reconnection attempts reached for ${this.connection.host}:${this.connection.port}`);
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    console.log(`🔄 TSL UMD 5.0 scheduling reconnection attempt ${this.reconnectAttempts} in ${delay / 1000}s`);

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
        id: `tsl5-${address}`,
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

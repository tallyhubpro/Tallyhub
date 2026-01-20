import { EventEmitter } from 'events';
// @ts-ignore - osc package doesn't have type definitions
import * as osc from 'osc';
import { MixerConnection, TallyUpdate } from '../../types';

/**
 * OSC (Open Sound Control) Tally Connector
 * 
 * Listens for OSC tally messages over UDP
 * Compatible with: Roland V-series mixers, vMix (OSC output), 
 * TouchOSC controllers, and other OSC-enabled broadcast equipment
 * 
 * Supported OSC Paths:
 * - /tally/preview_on [address] - Enable preview for address
 * - /tally/preview_off [address] - Disable preview for address
 * - /tally/program_on [address] - Enable program for address
 * - /tally/program_off [address] - Disable program for address
 * - /tally/state [address] [program] [preview] - Set both states
 */

interface OSCSource {
  address: number;
  name: string;
  program: boolean;
  preview: boolean;
  lastUpdate: Date;
}

export class OSCConnector extends EventEmitter {
  private connection: MixerConnection;
  private oscPort: osc.UDPPort | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 5000;
  private maxReconnectDelay = 300000;
  private sources: Map<number, OSCSource> = new Map();

  constructor(connection: MixerConnection) {
    super();
    this.connection = connection;
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log(`⏳ OSC connection to port ${this.connection.port} already in progress`);
      return;
    }

    this.isConnecting = true;

    try {
      this.oscPort = new osc.UDPPort({
        localAddress: '0.0.0.0',
        localPort: this.connection.port,
        metadata: true
      });

      this.setupOSCHandlers();

      await new Promise<void>((resolve, reject) => {
        this.oscPort!.on('ready', () => {
          console.log(`✅ OSC UDP port listening on ${this.connection.port}`);
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        });

        this.oscPort!.on('error', (error: Error) => {
          console.error(`🚨 OSC port error:`, this.getErrorMessage(error));
          reject(error);
        });

        this.oscPort!.open();
      });
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error(`🚨 OSC connection failed on port ${this.connection.port}:`, errorMessage);
      this.emit('error', new Error(`OSC connection failed: ${errorMessage}`));
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private setupOSCHandlers(): void {
    if (!this.oscPort) return;

    this.oscPort.on('message', (oscMsg: any) => {
      try {
        const address = oscMsg.address;
        const args = oscMsg.args || [];

        // Handle different OSC message patterns
        if (address.startsWith('/tally/')) {
          this.handleTallyMessage(address, args);
        }
      } catch (error) {
        console.error(`🚨 Error processing OSC message:`, this.getErrorMessage(error));
      }
    });

    this.oscPort.on('error', (error: Error) => {
      console.error(`🚨 OSC error:`, this.getErrorMessage(error));
      this.emit('error', error);
    });

    this.oscPort.on('close', () => {
      console.log(`📡 OSC port closed`);
      this.emit('disconnected');
      this.scheduleReconnect();
    });
  }

  private handleTallyMessage(address: string, args: any[]): void {
    try {
      // Extract source address from args
      let sourceAddress: number = 0;
      let program: boolean | null = null;
      let preview: boolean | null = null;

      // Get source address (first argument, usually an integer)
      if (args.length > 0) {
        const firstArg = args[0];
        sourceAddress = typeof firstArg === 'number' ? firstArg : (firstArg.value || 0);
      }

      // Get or create source
      if (!this.sources.has(sourceAddress)) {
        this.sources.set(sourceAddress, {
          address: sourceAddress,
          name: `Source ${sourceAddress}`,
          program: false,
          preview: false,
          lastUpdate: new Date()
        });
      }

      const source = this.sources.get(sourceAddress)!;

      // Parse message type
      if (address === '/tally/preview_on') {
        preview = true;
      } else if (address === '/tally/preview_off') {
        preview = false;
      } else if (address === '/tally/program_on') {
        program = true;
      } else if (address === '/tally/program_off') {
        program = false;
      } else if (address === '/tally/state') {
        // State message: /tally/state [address] [program] [preview]
        if (args.length >= 3) {
          const programArg = args[1];
          const previewArg = args[2];
          program = typeof programArg === 'number' ? programArg !== 0 : (programArg.value !== 0);
          preview = typeof previewArg === 'number' ? previewArg !== 0 : (previewArg.value !== 0);
        }
      } else if (address.match(/\/tally\/(\d+)/)) {
        // Alternative format: /tally/1 [program] [preview]
        const match = address.match(/\/tally\/(\d+)/);
        if (match) {
          sourceAddress = parseInt(match[1]);
          if (args.length >= 2) {
            const programArg = args[0];
            const previewArg = args[1];
            program = typeof programArg === 'number' ? programArg !== 0 : (programArg.value !== 0);
            preview = typeof previewArg === 'number' ? previewArg !== 0 : (previewArg.value !== 0);
          }
        }
      }

      // Update source state
      if (program !== null) source.program = program;
      if (preview !== null) source.preview = preview;
      source.lastUpdate = new Date();

      // Emit tally update
      const tallyUpdate: TallyUpdate = {
        deviceId: `osc-${this.connection.id}-${sourceAddress}`,
        preview: source.preview,
        program: source.program,
        timestamp: new Date()
      };

      this.emit('tally:update', {
        sourceId: `osc-${sourceAddress}`,
        sourceName: source.name,
        ...tallyUpdate
      });

      console.log(`📊 OSC [${sourceAddress}] "${source.name}" - Program: ${source.program}, Preview: ${source.preview}`);
    } catch (error) {
      console.error(`🚨 Error handling OSC tally message:`, this.getErrorMessage(error));
    }
  }

  async disconnect(): Promise<void> {
    console.log(`🔌 Disconnecting OSC from port ${this.connection.port}`);
    
    this.clearReconnectInterval();

    if (this.oscPort) {
      this.oscPort.close();
      this.oscPort = null;
    }

    this.sources.clear();
    this.emit('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`🚨 OSC max reconnection attempts reached for port ${this.connection.port}`);
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    console.log(`🔄 OSC scheduling reconnection attempt ${this.reconnectAttempts} in ${delay / 1000}s`);

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
    
    this.sources.forEach((source) => {
      sources.push({
        id: `osc-${source.address}`,
        name: source.name,
        preview: source.preview,
        program: source.program
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

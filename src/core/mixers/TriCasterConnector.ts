import { EventEmitter } from 'events';
import * as net from 'net';
// @ts-ignore - xml2js doesn't have complete type definitions
import { parseString } from 'xml2js';
import { MixerConnection, TallyUpdate } from '../../types';

/**
 * NewTek TriCaster Tally Connector
 * 
 * Supports NewTek TriCaster video production systems
 * Compatible with: TriCaster TC1, Mini, 410, 860, 8000, and other models
 * 
 * Protocol Specification:
 * - TCP connection on port 5951
 * - XML-based protocol
 * - Registration: <register name="TallyHub" />
 * - Response: <shortcut_states> with input tally data
 * - Program state: "on", Preview state: "preview"
 */

interface TriCasterInput {
  name: string;
  row: string;
  value: string; // "on" = program, "preview" = preview, "off" = neither
}

export class TriCasterConnector extends EventEmitter {
  private connection: MixerConnection;
  private socket: net.Socket | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 5000;
  private maxReconnectDelay = 300000;
  private inputs: Map<string, TriCasterInput> = new Map();
  private xmlBuffer = '';

  constructor(connection: MixerConnection) {
    super();
    this.connection = connection;
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log(`⏳ TriCaster connection to ${this.connection.host}:${this.connection.port} already in progress`);
      return;
    }

    this.isConnecting = true;

    try {
      await this.connectTCP();
      console.log(`✅ TriCaster connected to ${this.connection.host}:${this.connection.port}`);
      this.reconnectAttempts = 0;
      this.emit('connected');
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error(`🚨 TriCaster connection failed to ${this.connection.host}:${this.connection.port}:`, errorMessage);
      this.emit('error', new Error(`TriCaster connection failed: ${errorMessage}`));
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private async connectTCP(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = net.createConnection({
          host: this.connection.host,
          port: this.connection.port
        });

        this.socket.on('connect', () => {
          console.log(`📡 TriCaster TCP connected to ${this.connection.host}:${this.connection.port}`);
          
          // Send registration message
          this.sendRegistration();
          resolve();
        });

        this.socket.on('data', (data) => {
          this.handleData(data);
        });

        this.socket.on('close', () => {
          console.log(`📡 TriCaster connection closed`);
          this.emit('disconnected');
          this.scheduleReconnect();
        });

        this.socket.on('error', (error) => {
          console.error(`🚨 TriCaster socket error:`, this.getErrorMessage(error));
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private sendRegistration(): void {
    if (!this.socket) return;

    const registrationXML = '<register name="TallyHub" />\n';
    this.socket.write(registrationXML);
    console.log('📤 Sent TriCaster registration');
  }

  private handleData(data: Buffer): void {
    try {
      const text = data.toString('utf8');
      this.xmlBuffer += text;

      // Process complete XML messages
      // TriCaster sends messages terminated with newline
      const messages = this.xmlBuffer.split('\n');
      
      // Keep the last incomplete message in the buffer
      this.xmlBuffer = messages.pop() || '';

      // Process complete messages
      messages.forEach((message) => {
        if (message.trim()) {
          this.parseXMLMessage(message.trim());
        }
      });
    } catch (error) {
      console.error(`🚨 Error handling TriCaster data:`, this.getErrorMessage(error));
    }
  }

  private parseXMLMessage(xml: string): void {
    parseString(xml, { explicitArray: false }, (err: Error | null, result: any) => {
      if (err) {
        console.error(`🚨 Error parsing TriCaster XML:`, err);
        return;
      }

      try {
        // Handle shortcut_states message (contains tally info)
        if (result.shortcut_states) {
          this.handleShortcutStates(result.shortcut_states);
        }
        // Handle other message types if needed
        else if (result.register_response) {
          console.log('✅ TriCaster registration confirmed');
        }
      } catch (error) {
        console.error(`🚨 Error processing TriCaster message:`, this.getErrorMessage(error));
      }
    });
  }

  private handleShortcutStates(states: any): void {
    try {
      // TriCaster sends shortcut states as array or single object
      let shortcuts = states.shortcut;
      if (!Array.isArray(shortcuts)) {
        shortcuts = shortcuts ? [shortcuts] : [];
      }

      shortcuts.forEach((shortcut: any) => {
        if (!shortcut.$ || !shortcut.$.name) return;

        const name = shortcut.$.name;
        const row = shortcut.$.row || '';
        const value = shortcut.$.value || 'off';

        // Filter for input/source shortcuts (typically row_a, row_b, etc.)
        if (row && (row.includes('row') || row.includes('input'))) {
          const inputKey = `${row}-${name}`;
          
          const input: TriCasterInput = {
            name,
            row,
            value
          };

          this.inputs.set(inputKey, input);

          // Determine tally states
          const program = value === 'on';
          const preview = value === 'preview';

          // Emit tally update
          const tallyUpdate: TallyUpdate = {
            deviceId: `tricaster-${this.connection.id}-${inputKey}`,
            preview,
            program,
            timestamp: new Date()
          };

          this.emit('tally:update', {
            sourceId: `tricaster-${inputKey}`,
            sourceName: `${row.toUpperCase()} - ${name}`,
            ...tallyUpdate
          });

          console.log(`📊 TriCaster [${row}] "${name}" - Program: ${program}, Preview: ${preview}`);
        }
      });
    } catch (error) {
      console.error(`🚨 Error handling TriCaster shortcut states:`, this.getErrorMessage(error));
    }
  }

  async disconnect(): Promise<void> {
    console.log(`🔌 Disconnecting TriCaster from ${this.connection.host}:${this.connection.port}`);
    
    this.clearReconnectInterval();

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.inputs.clear();
    this.xmlBuffer = '';
    this.emit('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`🚨 TriCaster max reconnection attempts reached for ${this.connection.host}:${this.connection.port}`);
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    console.log(`🔄 TriCaster scheduling reconnection attempt ${this.reconnectAttempts} in ${delay / 1000}s`);

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
    
    this.inputs.forEach((input, key) => {
      sources.push({
        id: `tricaster-${key}`,
        name: `${input.row.toUpperCase()} - ${input.name}`,
        preview: input.value === 'preview',
        program: input.value === 'on'
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

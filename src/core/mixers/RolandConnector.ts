import { EventEmitter } from 'events';
import axios from 'axios';
import { MixerConnection, TallyUpdate } from '../../types';

/**
 * Roland Smart Tally Connector
 * 
 * Supports Roland video mixers with Smart Tally protocol over HTTP
 * Compatible with: Roland V-60HD, V-600UHD, V-1HD, V-8HD, VR-50HD, and other V-series mixers
 * 
 * Protocol Specification:
 * - HTTP polling at 500ms intervals
 * - Endpoint: http://mixer-ip/tally
 * - Response format: JSON with input states
 * - Fields: program/preset states per input
 */

interface RolandTallyState {
  program: number;  // Program input number (1-8)
  preset: number;   // Preset/preview input number (1-8)
  inputs: {
    [key: string]: {
      program: boolean;
      preset: boolean;
    };
  };
}

export class RolandConnector extends EventEmitter {
  private connection: MixerConnection;
  private pollingInterval: NodeJS.Timeout | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 5000;
  private maxReconnectDelay = 300000;
  private pollingRate = 500; // 500ms polling interval
  private currentState: RolandTallyState = {
    program: 0,
    preset: 0,
    inputs: {}
  };
  private inputCount = 8; // Default for most V-series mixers

  constructor(connection: MixerConnection) {
    super();
    this.connection = connection;
    
    // Configure input count based on model if specified
    const modelHint = (connection as any).model?.toLowerCase();
    if (modelHint?.includes('v-1')) {
      this.inputCount = 4;
    } else if (modelHint?.includes('v-60')) {
      this.inputCount = 6;
    }
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log(`⏳ Roland connection to ${this.connection.host} already in progress`);
      return;
    }

    this.isConnecting = true;

    try {
      // Test connection
      await this.fetchTallyState();
      
      console.log(`✅ Roland Smart Tally connected to ${this.connection.host}`);
      this.reconnectAttempts = 0;
      this.emit('connected');
      
      // Start polling
      this.startPolling();
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error(`🚨 Roland connection failed to ${this.connection.host}:`, errorMessage);
      this.emit('error', new Error(`Roland connection failed: ${errorMessage}`));
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private startPolling(): void {
    if (this.pollingInterval) {
      return;
    }

    this.pollingInterval = setInterval(() => {
      this.fetchTallyState().catch((error) => {
        console.error(`🚨 Roland polling error:`, this.getErrorMessage(error));
        this.stopPolling();
        this.emit('disconnected');
        this.scheduleReconnect();
      });
    }, this.pollingRate);
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async fetchTallyState(): Promise<void> {
    try {
      const url = `http://${this.connection.host}/tally`;
      const response = await axios.get(url, { timeout: 3000 });
      
      // Parse Roland tally response
      // Response format varies by model, handle common formats
      const data = response.data;
      
      if (typeof data === 'object' && data !== null) {
        this.parseRolandResponse(data);
      } else {
        // Some Roland mixers return plain text status
        this.parseRolandTextResponse(String(data));
      }
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        throw new Error(`Cannot reach Roland mixer at ${this.connection.host}`);
      }
      throw error;
    }
  }

  private parseRolandResponse(data: any): void {
    // Roland V-60HD and V-600UHD format
    if (data.program !== undefined && data.preset !== undefined) {
      const program = parseInt(data.program) || 0;
      const preset = parseInt(data.preset) || 0;
      
      // Update state if changed
      if (this.currentState.program !== program || this.currentState.preset !== preset) {
        this.currentState.program = program;
        this.currentState.preset = preset;
        
        // Update all inputs
        for (let i = 1; i <= this.inputCount; i++) {
          const inputId = `input-${i}`;
          const isProgramme = (i === program);
          const isPreset = (i === preset);
          
          if (!this.currentState.inputs[inputId]) {
            this.currentState.inputs[inputId] = { program: false, preset: false };
          }
          
          this.currentState.inputs[inputId].program = isProgramme;
          this.currentState.inputs[inputId].preset = isPreset;
          
          // Emit tally update
          this.emitTallyUpdate(i, isProgramme, isPreset);
        }
      }
    }
    // Alternative format: inputs array
    else if (Array.isArray(data.inputs)) {
      data.inputs.forEach((input: any, index: number) => {
        const inputNum = index + 1;
        const inputId = `input-${inputNum}`;
        const isProgramme = Boolean(input.program || input.pgm);
        const isPreset = Boolean(input.preset || input.pvw);
        
        if (!this.currentState.inputs[inputId]) {
          this.currentState.inputs[inputId] = { program: false, preset: false };
        }
        
        const changed = 
          this.currentState.inputs[inputId].program !== isProgramme ||
          this.currentState.inputs[inputId].preset !== isPreset;
        
        if (changed) {
          this.currentState.inputs[inputId].program = isProgramme;
          this.currentState.inputs[inputId].preset = isPreset;
          this.emitTallyUpdate(inputNum, isProgramme, isPreset);
        }
      });
    }
  }

  private parseRolandTextResponse(text: string): void {
    // Parse text-based tally response (older Roland models)
    // Format: "PGM:1 PVW:2" or similar
    const pgmMatch = text.match(/PGM:(\d+)/i);
    const pvwMatch = text.match(/PVW:(\d+)/i) || text.match(/PST:(\d+)/i);
    
    if (pgmMatch) {
      const program = parseInt(pgmMatch[1]);
      const preset = pvwMatch ? parseInt(pvwMatch[1]) : 0;
      
      if (this.currentState.program !== program || this.currentState.preset !== preset) {
        this.currentState.program = program;
        this.currentState.preset = preset;
        
        for (let i = 1; i <= this.inputCount; i++) {
          const inputId = `input-${i}`;
          const isProgramme = (i === program);
          const isPreset = (i === preset);
          
          if (!this.currentState.inputs[inputId]) {
            this.currentState.inputs[inputId] = { program: false, preset: false };
          }
          
          this.currentState.inputs[inputId].program = isProgramme;
          this.currentState.inputs[inputId].preset = isPreset;
          this.emitTallyUpdate(i, isProgramme, isPreset);
        }
      }
    }
  }

  private emitTallyUpdate(inputNum: number, program: boolean, preview: boolean): void {
    const tallyUpdate: TallyUpdate = {
      deviceId: `roland-${this.connection.id}-${inputNum}`,
      preview,
      program,
      timestamp: new Date()
    };

    this.emit('tally:update', {
      sourceId: `roland-input-${inputNum}`,
      sourceName: `Input ${inputNum}`,
      ...tallyUpdate
    });

    console.log(`📊 Roland Input ${inputNum} - Program: ${program}, Preview: ${preview}`);
  }

  async disconnect(): Promise<void> {
    console.log(`🔌 Disconnecting Roland from ${this.connection.host}`);
    
    this.stopPolling();
    this.clearReconnectInterval();
    this.currentState = { program: 0, preset: 0, inputs: {} };
    this.emit('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`🚨 Roland max reconnection attempts reached for ${this.connection.host}`);
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;

    console.log(`🔄 Roland scheduling reconnection attempt ${this.reconnectAttempts} in ${delay / 1000}s`);

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
    
    for (let i = 1; i <= this.inputCount; i++) {
      const inputId = `input-${i}`;
      const input = this.currentState.inputs[inputId] || { program: false, preset: false };
      
      sources.push({
        id: `roland-input-${i}`,
        name: `Input ${i}`,
        preview: input.preset,
        program: input.program
      });
    }

    return sources;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

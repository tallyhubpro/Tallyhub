import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';
import { MixerConnection, TallyUpdate } from '../../types';

/**
 * Bitfocus Companion Tally Connector
 * 
 * Connects to Bitfocus Companion to retrieve button states and use them as tally sources
 * Compatible with: Companion v3.0+
 * 
 * Connection Methods:
 * - HTTP API polling for button states
 * - Monitors button feedbacks for program/preview indicators
 * - Maps button colors/text to tally states
 * 
 * Tally Mapping:
 * - Red button background = Program
 * - Green button background = Preview  
 * - Custom variable monitoring for tally states
 * 
 * API Endpoints Used:
 * - GET /api/location/[page]/[row]/[column]/style - Get button style
 * - GET /api/custom-variable/[name]/value - Get custom variable
 */

interface CompanionButton {
  page: number;
  row: number;
  column: number;
  text?: string;
  bgcolor?: number;
  color?: number;
  size?: string;
}

interface CompanionSource {
  buttonId: string;
  page: number;
  row: number;
  column: number;
  name: string;
  program: boolean;
  preview: boolean;
  lastUpdate: Date;
}

export class CompanionConnector extends EventEmitter {
  private connection: MixerConnection;
  private pollInterval: NodeJS.Timeout | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 5000;
  private maxReconnectDelay = 300000;
  private sources: Map<string, CompanionSource> = new Map();
  private pollRate = 250; // Poll every 250ms for responsive tally updates
  private useHttps = false;

  constructor(connection: MixerConnection) {
    super();
    this.connection = connection;
    // Detect if HTTPS should be used (typically Companion runs on HTTP unless configured)
    this.useHttps = connection.port === 8443 || connection.host.includes('https://');
  }

  private getHostForRequest(): string {
    const host = (this.connection.host || '').trim();
    if (host === 'localhost' || host === '::1') return '127.0.0.1';
    return host;
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log(`⏳ Companion connection to ${this.connection.host}:${this.connection.port} already in progress`);
      return;
    }

    this.isConnecting = true;

    try {
      // Test connection by attempting to fetch a simple endpoint
      await this.testConnection();
      
      console.log(`✅ Companion connected to ${this.connection.host}:${this.connection.port}`);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');

      // Start polling for button states
      this.startPolling();

      // Start autodiscovery of buttons (scan first page initially)
      await this.discoverButtons();

    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error(`🚨 Companion connection failed:`, errorMessage);
      this.emit('error', new Error(`Companion connection failed: ${errorMessage}`));
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private async testConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = this.useHttps ? https : http;
      const req = protocol.get(
        `${this.useHttps ? 'https' : 'http'}://${this.getHostForRequest()}:${this.connection.port}/api/location/1/1/1/style`,
        { timeout: 5000 },
        (res) => {
          if (res.statusCode === 200 || res.statusCode === 404) {
            // 404 is OK - means API is responding but button doesn't exist
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timeout'));
      });
    });
  }

  private async discoverButtons(): Promise<void> {
    // Scan first page (typically 8x4 = 32 buttons for Stream Deck)
    // Users can add more via configuration
    console.log(`🔍 Discovering Companion buttons on page 1...`);
    
    for (let row = 1; row <= 4; row++) {
      for (let col = 1; col <= 8; col++) {
        await this.checkButton(1, row, col);
      }
    }

    console.log(`📊 Found ${this.sources.size} active Companion buttons`);
  }

  private async checkButton(page: number, row: number, column: number): Promise<void> {
    try {
      const style = await this.getButtonStyle(page, row, column);
      if (style) {
        const buttonId = `companion-${page}-${row}-${column}`;
        const name = style.text || `Page ${page} Button ${row}×${column}`;
        
        if (!this.sources.has(buttonId)) {
          this.sources.set(buttonId, {
            buttonId,
            page,
            row,
            column,
            name,
            program: false,
            preview: false,
            lastUpdate: new Date()
          });
        }
      }
    } catch (error) {
      // Button doesn't exist or error fetching - ignore
    }
  }

  private startPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      if (!this.isConnected) return;

      try {
        await this.pollButtonStates();
      } catch (error) {
        console.error(`🚨 Companion polling error:`, this.getErrorMessage(error));
      }
    }, this.pollRate);
  }

  private async pollButtonStates(): Promise<void> {
    const updatePromises: Promise<void>[] = [];

    for (const [buttonId, source] of this.sources) {
      updatePromises.push(this.updateButtonState(source));
    }

    await Promise.all(updatePromises);
  }

  private async updateButtonState(source: CompanionSource): Promise<void> {
    try {
      const style = await this.getButtonStyle(source.page, source.row, source.column);
      if (!style) return;

      // Detect tally state from button style
      // Red background (0xFF0000 or similar) = Program
      // Green background (0x00FF00 or similar) = Preview
      const newState = {
        program: this.isColorRed(style.bgcolor),
        preview: this.isColorGreen(style.bgcolor)
      };

      // Check if state actually changed
      if (source.program !== newState.program || source.preview !== newState.preview) {
        source.program = newState.program;
        source.preview = newState.preview;
        source.lastUpdate = new Date();

        // Emit tally update
        const tallyUpdate: TallyUpdate = {
          deviceId: `${this.connection.id}-${source.buttonId}`,
          preview: source.preview,
          program: source.program,
          timestamp: new Date()
        };

        this.emit('tally:update', {
          sourceId: source.buttonId,
          sourceName: source.name,
          ...tallyUpdate
        });

        if (source.preview || source.program) {
          console.log(`📺 Companion ${source.name}: ${source.program ? 'PROGRAM' : ''} ${source.preview ? 'PREVIEW' : ''}`);
        }
      }
    } catch (error) {
      // Button fetch failed - might be removed
    }
  }

  private async getButtonStyle(page: number, row: number, column: number): Promise<CompanionButton | null> {
    return new Promise((resolve, reject) => {
      const protocol = this.useHttps ? https : http;
      const path = `/api/location/${page}/${row}/${column}/style`;
      
      const req = protocol.get(
        `${this.useHttps ? 'https' : 'http'}://${this.getHostForRequest()}:${this.connection.port}${path}`,
        { timeout: 3000 },
        (res) => {
          if (res.statusCode === 404) {
            // Button doesn't exist
            resolve(null);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const style = JSON.parse(data);
              resolve({
                page,
                row,
                column,
                text: style.text,
                bgcolor: style.bgcolor,
                color: style.color,
                size: style.size
              });
            } catch (e) {
              reject(e);
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  private isColorRed(color?: number): boolean {
    if (color === undefined || color === null) return false;
    // Check if color is predominantly red (R channel high, G and B low)
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    return r > 200 && g < 100 && b < 100;
  }

  private isColorGreen(color?: number): boolean {
    if (color === undefined || color === null) return false;
    // Check if color is predominantly green (G channel high, R and B low)
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    return g > 200 && r < 100 && b < 100;
  }

  async disconnect(): Promise<void> {
    console.log(`🔌 Disconnecting Companion from ${this.connection.host}:${this.connection.port}`);
    
    this.isConnected = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    this.sources.clear();
    this.emit('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`❌ Companion: Maximum reconnection attempts (${this.maxReconnectAttempts}) reached`);
      this.emit('error', new Error('Maximum reconnection attempts reached'));
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;
    console.log(`🔄 Companion: Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay/1000}s`);

    this.reconnectInterval = setTimeout(() => {
      this.reconnectInterval = null;
      this.connect().catch(err => {
        console.error('Companion reconnection failed:', err);
      });
    }, delay);
  }

  private getErrorMessage(error: any): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return String(error);
  }

  public isConnectedToMixer(): boolean {
    return this.isConnected;
  }

  public getConnectionInfo(): MixerConnection {
    return { ...this.connection, connected: this.isConnected };
  }

  public getInputSources(): Array<{ id: string; name: string; type: string }> {
    const sources: Array<{ id: string; name: string; type: string }> = [];
    
    for (const [_id, source] of this.sources) {
      sources.push({
        id: source.buttonId,
        name: source.name,
        type: 'button'
      });
    }

    return sources;
  }

  public getCurrentState(): any {
    const state: any = {
      connected: this.isConnected,
      host: this.connection.host,
      port: this.connection.port,
      buttons: {}
    };

    for (const [id, source] of this.sources) {
      state.buttons[id] = {
        page: source.page,
        row: source.row,
        column: source.column,
        name: source.name,
        program: source.program,
        preview: source.preview,
        lastUpdate: source.lastUpdate
      };
    }

    return state;
  }

  // Method to manually add/monitor a specific button
  public addButton(page: number, row: number, column: number, name?: string): void {
    const buttonId = `companion-${page}-${row}-${column}`;
    
    if (!this.sources.has(buttonId)) {
      this.sources.set(buttonId, {
        buttonId,
        page,
        row,
        column,
        name: name || `Page ${page} Button ${row}×${column}`,
        program: false,
        preview: false,
        lastUpdate: new Date()
      });
      
      console.log(`➕ Added Companion button: ${name || buttonId}`);
    }
  }

  // Method to remove a button from monitoring
  public removeButton(page: number, row: number, column: number): void {
    const buttonId = `companion-${page}-${row}-${column}`;
    if (this.sources.delete(buttonId)) {
      console.log(`➖ Removed Companion button: ${buttonId}`);
    }
  }
}

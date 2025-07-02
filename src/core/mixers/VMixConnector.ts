import { EventEmitter } from 'events';
import { createConnection, Socket } from 'net';
import { MixerConnection, TallyUpdate } from '../../types';

export class VMixConnector extends EventEmitter {
  private connection: MixerConnection;
  private socket: Socket | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 5000; // 5 seconds
  private maxReconnectDelay = 300000; // 5 minutes
  private currentInputs: Map<number, any> = new Map();
  private isRecording: boolean = false;
  private isStreaming: boolean = false;

  constructor(connection: MixerConnection) {
    super();
    this.connection = connection;
  }

  public async connect(): Promise<void> {
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      this.socket = createConnection({
        host: this.connection.host,
        port: this.connection.port
      });

      this.setupSocketHandlers();
      
      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        this.socket!.once('connect', () => {
          console.log(`📡 vMix TCP connected to ${this.connection.host}:${this.connection.port}`);
          this.isConnecting = false;
          this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
          this.emit('connected');
          this.clearReconnectInterval();
          resolve();
        });

        this.socket!.once('error', reject);
      });

      // Subscribe to tally updates
      this.sendCommand('SUBSCRIBE TALLY');
      
      // Request initial XML status to get recording/streaming status
      this.sendCommand('XML');
      
      // Set up periodic XML status requests to monitor recording/streaming changes
      setInterval(() => {
        this.sendCommand('XML');
      }, 5000); // Request XML status every 5 seconds
      
    } catch (error) {
      this.isConnecting = false;
      throw error;
    }
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('data', (data) => {
      const message = data.toString().trim();
      this.handleMessage(message);
    });

    this.socket.on('close', () => {
      console.log('📡 vMix TCP disconnected');
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.socket.on('error', (error) => {
      console.error('📡 vMix TCP connection error:', error);
      this.emit('error', error);
      this.scheduleReconnect();
    });
  }

  private handleMessage(message: string): void {
    // Handle different types of vMix messages
    if (message.startsWith('TALLY OK')) {
      // Parse tally data
      const tallyData = message.substring(8); // Remove 'TALLY OK'
      this.parseTallyData(tallyData);
    } else if (message.startsWith('XML')) {
      // Handle XML status updates
      this.parseXMLData(message.substring(4));
    }
  }

  private parseTallyData(tallyData: string): void {
    // vMix tally format: each character represents an input
    // '0' = off, '1' = preview, '2' = program
    for (let i = 0; i < tallyData.length; i++) {
      const inputNumber = i + 1;
      const state = tallyData[i];
      
      const update: TallyUpdate = {
        deviceId: `vmix-input-${inputNumber}`,
        preview: state === '1',
        program: state === '2',
        recording: this.isRecording,
        streaming: this.isStreaming,
        timestamp: new Date()
      };

      this.emit('tally:update', update);
    }
  }

  private parseXMLData(xmlData: string): void {
    // Parse vMix XML status for input information
    // This is a simplified parser - you might want to use a proper XML parser
    try {
      console.log('📺 Parsing vMix XML data for recording/streaming status...');
      
      // Extract recording status - vMix uses different XML structure
      // Look for recording="True" or recording="False" attributes
      const recordingMatch = xmlData.match(/recording="([^"]*)"/) || xmlData.match(/<recording>([^<]*)<\/recording>/);
      if (recordingMatch) {
        const wasRecording = this.isRecording;
        this.isRecording = recordingMatch[1].toLowerCase() === 'true';
        if (wasRecording !== this.isRecording) {
          console.log(`🔴 vMix Recording ${this.isRecording ? 'started' : 'stopped'}`);
        }
      }
      
      // Extract streaming status - vMix may use streaming="True" or external="True"
      const streamingMatch = xmlData.match(/streaming="([^"]*)"/) || xmlData.match(/<streaming>([^<]*)<\/streaming>/);
      if (streamingMatch) {
        const wasStreaming = this.isStreaming;
        this.isStreaming = streamingMatch[1].toLowerCase() === 'true';
        if (wasStreaming !== this.isStreaming) {
          console.log(`📡 vMix Streaming ${this.isStreaming ? 'started' : 'stopped'}`);
        }
      }
      
      // Alternative streaming detection - check for active external outputs
      const externalMatch = xmlData.match(/external="([^"]*)"/) || xmlData.match(/<external>([^<]*)<\/external>/);
      if (externalMatch) {
        const externalActive = externalMatch[1].toLowerCase() === 'true';
        if (externalActive && !this.isStreaming) {
          console.log(`📡 vMix External output detected - treating as streaming`);
          this.isStreaming = true;
        }
      }
      
      // Look for multiple outputs - vMix can have multiple external outputs
      const outputMatches = xmlData.match(/output\d+="([^"]*)"/g);
      if (outputMatches) {
        let hasActiveOutput = false;
        outputMatches.forEach(match => {
          const value = match.match(/="([^"]*)"/);
          if (value && value[1].toLowerCase() === 'true') {
            hasActiveOutput = true;
          }
        });
        if (hasActiveOutput && !this.isStreaming) {
          console.log(`📡 vMix Active output detected - treating as streaming`);
          this.isStreaming = true;
        }
      }
      
      // Extract input information from XML
      const inputMatches = xmlData.match(/<input[^>]*>/g);
      if (inputMatches) {
        inputMatches.forEach((inputMatch, index) => {
          const numberMatch = inputMatch.match(/number="(\d+)"/);
          const titleMatch = inputMatch.match(/title="([^"]*)"/);
          
          if (numberMatch) {
            const inputNumber = parseInt(numberMatch[1]);
            const title = titleMatch ? titleMatch[1] : `Input ${inputNumber}`;
            
            this.currentInputs.set(inputNumber, {
              number: inputNumber,
              title: title
            });
          }
        });
      }
      
      console.log(`📺 vMix Status - Recording: ${this.isRecording}, Streaming: ${this.isStreaming}`);
      
    } catch (error) {
      console.error('Error parsing vMix XML data:', error);
    }
  }

  private sendCommand(command: string): void {
    if (this.socket && this.socket.writable) {
      this.socket.write(command + '\r\n');
    }
  }

  public async disconnect(): Promise<void> {
    this.clearReconnectInterval();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) {
      return;
    }

    // Check if we've exceeded max reconnect attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`🔄 Max reconnection attempts (${this.maxReconnectAttempts}) reached for vMix ${this.connection.host}:${this.connection.port}. Giving up.`);
      this.emit('reconnect:failed');
      return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;
    console.log(`🔄 Scheduling vMix reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} to ${this.connection.host}:${this.connection.port} in ${delay / 1000}s`);

    this.reconnectInterval = setTimeout(async () => {
      console.log(`🔄 Attempting to reconnect to vMix ${this.connection.host}:${this.connection.port} (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      try {
        await this.connect();
      } catch (error) {
        console.error(`🔄 Reconnection attempt ${this.reconnectAttempts} to vMix failed:`, error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  private clearReconnectInterval(): void {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  public resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
    console.log(`🔄 Reset reconnection attempts for vMix ${this.connection.host}:${this.connection.port}`);
  }

  public async getInputs(): Promise<any[]> {
    return Array.from(this.currentInputs.values());
  }

  public async setPreview(inputNumber: number): Promise<void> {
    this.sendCommand(`FUNCTION PreviewInput Input=${inputNumber}`);
  }

  public async setCut(inputNumber: number): Promise<void> {
    this.sendCommand(`FUNCTION Cut Input=${inputNumber}`);
  }

  public async setProgram(inputNumber: number): Promise<void> {
    this.sendCommand(`FUNCTION ProgramInput Input=${inputNumber}`);
  }
}

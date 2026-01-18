import { EventEmitter } from 'events';
import { MixerConnection, TallyUpdate } from '../../types';
import * as http from 'http';
import * as https from 'https';

export class VMixConnector extends EventEmitter {
  private connection: MixerConnection;
  private pollingInterval: NodeJS.Timeout | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 5000; // 5 seconds
  private maxReconnectDelay = 300000; // 5 minutes
  private currentInputs: Map<number, any> = new Map();
  private isRecording: boolean = false;
  private isStreaming: boolean = false;
  private isConnected: boolean = false;
  private currentInputStates: Map<string, { preview: boolean; program: boolean; recording: boolean; streaming: boolean }> = new Map();

  constructor(connection: MixerConnection) {
    super();
    this.connection = connection;
  }

  public async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log(`🔄 vMix connection already in progress to ${this.connection.host}:${this.connection.port}`);
      return;
    }

    this.isConnecting = true;
    console.log(`🔌 Attempting to connect to vMix HTTP API at ${this.connection.host}:${this.connection.port}...`);

    try {
      // Test connection by requesting API version
      const testUrl = `http://${this.connection.host}:${this.connection.port}/api`;
      await this.makeHttpRequest(testUrl);
      
      console.log(`✅ vMix HTTP API connected to ${this.connection.host}:${this.connection.port}`);
      this.isConnecting = false;
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
      this.clearReconnectInterval();
      
      // Initialize input tracking (don't fail connection if this fails)
      try {
        await this.initializeInputTracking();
      } catch (error) {
        console.log('⚠️  Input tracking initialization failed, continuing with basic functionality');
      }
      
      // Start polling for tally and status updates
      this.startPolling();
      
    } catch (error) {
      this.isConnecting = false;
      this.isConnected = false;
      console.error(`❌ Failed to connect to vMix HTTP API: ${error instanceof Error ? error.message : String(error)}`);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      this.scheduleReconnect();
      throw error;
    }
  }

  private startPolling(): void {
    // Clear any existing polling interval
    this.clearPolling();
    
    console.log('🔄 Starting vMix polling...');
    
    // Poll for tally and status updates every 1 second
    this.pollingInterval = setInterval(() => {
      this.pollTallyData();
      // pollStatusData is no longer needed as pollTallyData handles everything
    }, 1000);
  }

  private clearPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async pollTallyData(): Promise<void> {
    try {
      // Use the basic API endpoint since function-based endpoints return 500 errors
      const apiUrl = `http://${this.connection.host}:${this.connection.port}/api`;
      const xmlData = await this.makeHttpRequest(apiUrl);
      
      if (xmlData && typeof xmlData === 'string') {
        // Parse the XML data for tally information
        this.parseXMLData(xmlData);
      }
    } catch (error) {
      // Handle connection errors during polling
      this.handleConnectionError(error);
    }
  }

  private async pollStatusData(): Promise<void> {
    // This is now handled by pollTallyData since we use the same endpoint
    // We'll keep this method for compatibility but it doesn't need to do anything
    return;
  }

  private makeHttpRequest(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = http.get(url, { timeout: 5000 }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  private handleConnectionError(error: any): void {
    if (this.isConnected) {
      console.log(`📡 vMix HTTP API disconnected: ${error instanceof Error ? error.message : String(error)}`);
      this.isConnected = false;
      this.clearPolling();
      this.emit('disconnected');
      this.scheduleReconnect();
    }
  }

  private handleMessage(message: string): void {
    // Handle different types of vMix messages (HTTP responses)
    try {
      console.log(`� vMix HTTP response: ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`);
    } catch (error) {
      console.error('❌ Error processing vMix message:', error);
    }
  }

  private parseTallyData(tallyData: string): void {
    // vMix tally format: each character represents an input
    // '0' = off, '1' = preview, '2' = program
    let updatesCount = 0;
    
    for (let i = 0; i < tallyData.length; i++) {
      const inputNumber = i + 1;
      const state = tallyData[i];
      
      // Only process tally for inputs that actually exist
      if (this.currentInputs.has(inputNumber)) {
        const deviceId = `vmix-input-${inputNumber}`;
        const inputData = this.currentInputs.get(inputNumber);
        const inputName = inputData?.title || `Input ${inputNumber}`;
        
        const newState = {
          preview: state === '1',
          program: state === '2',
          recording: this.isRecording,
          streaming: this.isStreaming
        };
        
        const currentState = this.currentInputStates.get(deviceId);
        
        // Only emit update if state actually changed
        if (!currentState || 
            currentState.preview !== newState.preview || 
            currentState.program !== newState.program ||
            currentState.recording !== newState.recording ||
            currentState.streaming !== newState.streaming) {
          
          this.currentInputStates.set(deviceId, newState);
          
          const update: TallyUpdate = {
            deviceId,
            preview: newState.preview,
            program: newState.program,
            recording: newState.recording,
            streaming: newState.streaming,
            timestamp: new Date()
          };

          this.emit('tally:update', update);
          updatesCount++;
          
          if (newState.preview || newState.program) {
            console.log(`📺 vMix Input ${inputNumber} (${inputName}): ${newState.program ? 'PROGRAM' : ''} ${newState.preview ? 'PREVIEW' : ''}`);
          }
        }
      }
    }
    
    if (updatesCount > 0) {
      console.log(`📊 Updated ${updatesCount} vMix input tally states from polling`);
    }
  }

  private parseXMLData(xmlData: string): void {
    try {
      // Track previous states to detect changes
      const wasRecording = this.isRecording;
      const wasStreaming = this.isStreaming;
      
      // Extract recording status
      const recordingMatch = xmlData.match(/<recording>([^<]*)<\/recording>/);
      if (recordingMatch) {
        this.isRecording = recordingMatch[1].toLowerCase() === 'true';
        if (wasRecording !== this.isRecording) {
          console.log(`🔴 vMix Recording ${this.isRecording ? 'started' : 'stopped'}`);
        }
      }
      
      // Extract streaming status
      const streamingMatch = xmlData.match(/<streaming>([^<]*)<\/streaming>/);
      if (streamingMatch) {
        this.isStreaming = streamingMatch[1].toLowerCase() === 'true';
        if (wasStreaming !== this.isStreaming) {
          console.log(`📡 vMix Streaming ${this.isStreaming ? 'started' : 'stopped'}`);
        }
      }
      
      // Extract external output status (alternative streaming detection)
      const externalMatch = xmlData.match(/<external>([^<]*)<\/external>/);
      if (externalMatch) {
        const externalActive = externalMatch[1].toLowerCase() === 'true';
        if (externalActive && !this.isStreaming) {
          console.log(`📡 vMix External output active - treating as streaming`);
          this.isStreaming = true;
        }
      }
      
      // Extract preview and active input numbers
      const previewMatch = xmlData.match(/<preview>([^<]*)<\/preview>/);
      const activeMatch = xmlData.match(/<active>([^<]*)<\/active>/);
      
      const previewInput = previewMatch ? parseInt(previewMatch[1]) : null;
      const activeInput = activeMatch ? parseInt(activeMatch[1]) : null;
      
      // Extract input information
      const inputMatches = xmlData.match(/<input[^>]*>/g);
      if (inputMatches) {
        // Clear existing inputs to rebuild from current state
        this.currentInputs.clear();
        
        inputMatches.forEach((inputMatch) => {
          const numberMatch = inputMatch.match(/number="(\d+)"/);
          const titleMatch = inputMatch.match(/title="([^"]*)"/);
          const shortTitleMatch = inputMatch.match(/shortTitle="([^"]*)"/);
          
          if (numberMatch) {
            const inputNumber = parseInt(numberMatch[1]);
            const title = titleMatch ? titleMatch[1] : shortTitleMatch ? shortTitleMatch[1] : `Input ${inputNumber}`;
            
            this.currentInputs.set(inputNumber, {
              number: inputNumber,
              title: title
            });
          }
        });
      }
      
      // Update tally states based on preview/active inputs
      this.updateInputTalliesFromPreviewActive(previewInput, activeInput);
      
      // Update all input recording/streaming states if those changed
      if (wasRecording !== this.isRecording || wasStreaming !== this.isStreaming) {
        this.updateInputTallies();
      }
      
    } catch (error) {
      console.error('Error parsing vMix XML data:', error);
    }
  }

  private updateInputTalliesFromPreviewActive(previewInput: number | null, activeInput: number | null): void {
    let updatesCount = 0;
    
    // Update tally states for all discovered inputs
    for (const [inputNumber, inputData] of this.currentInputs.entries()) {
      const deviceId = `vmix-input-${inputNumber}`;
      const inputName = inputData.title || `Input ${inputNumber}`;
      
      const newState = {
        preview: previewInput === inputNumber,
        program: activeInput === inputNumber,
        recording: this.isRecording,
        streaming: this.isStreaming
      };
      
      const currentState = this.currentInputStates.get(deviceId);
      
      // Only emit update if state actually changed
      if (!currentState || 
          currentState.preview !== newState.preview || 
          currentState.program !== newState.program ||
          currentState.recording !== newState.recording ||
          currentState.streaming !== newState.streaming) {
        
        this.currentInputStates.set(deviceId, newState);
        
        const update: TallyUpdate = {
          deviceId,
          preview: newState.preview,
          program: newState.program,
          recording: newState.recording,
          streaming: newState.streaming,
          timestamp: new Date()
        };

        this.emit('tally:update', update);
        updatesCount++;
        
        if (newState.preview || newState.program) {
          console.log(`📺 vMix Input ${inputNumber} (${inputName}): ${newState.program ? 'PROGRAM' : ''} ${newState.preview ? 'PREVIEW' : ''} ${newState.recording ? 'REC' : ''} ${newState.streaming ? 'STREAM' : ''}`);
        }
      }
    }
    
    if (updatesCount > 0) {
      console.log(`📊 Updated ${updatesCount} vMix input tally states`);
    }
  }

  private async sendCommand(command: string): Promise<void> {
    try {
      const commandUrl = `http://${this.connection.host}:${this.connection.port}/api/?function=${encodeURIComponent(command)}`;
      console.log(`📤 Sending vMix HTTP command: ${command}`);
      await this.makeHttpRequest(commandUrl);
    } catch (error) {
      console.error(`❌ Error sending vMix command '${command}':`, error);
    }
  }

  public async disconnect(): Promise<void> {
    this.clearReconnectInterval();
    this.clearPolling();
    this.isConnected = false;
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

    this.reconnectInterval = setTimeout(() => {
      this.reconnectInterval = null; // Clear the interval reference immediately
      
      console.log(`🔄 Attempting to reconnect to vMix ${this.connection.host}:${this.connection.port} (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      // Wrap async operation to prevent unhandled rejections
      (async () => {
        try {
          await this.connect();
        } catch (error) {
          console.error(`🔄 Reconnection attempt ${this.reconnectAttempts} to vMix failed:`, error);
          this.scheduleReconnect();
        }
      })().catch((error) => {
        console.error(`🚨 Unhandled error in vMix reconnection process:`, error);
      });
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

  public async forceReconnect(): Promise<void> {
    console.log(`🔄 Forcing reconnect to vMix API...`);
    await this.disconnect();
    
    // Reset reconnect attempts for a fresh start
    this.resetReconnectAttempts();
    
    // Immediate reconnect
    await this.connect();
  }

  public getInputs(): Array<{ number: number; name: string; type: string }> {
    const inputs: Array<{ number: number; name: string; type: string }> = [];
    for (const [inputNumber, inputData] of this.currentInputs.entries()) {
      inputs.push({
        number: inputNumber,
        name: inputData.name || `Input ${inputNumber}`,
        type: inputData.type || 'Unknown'
      });
    }
    return inputs;
  }

  private async initializeInputTracking(): Promise<void> {
    try {
      console.log('🔄 Initializing vMix input tracking...');
      
      // Get basic vMix API data (this includes both status and input information)
      try {
        const apiUrl = `http://${this.connection.host}:${this.connection.port}/api`;
        const xmlData = await this.makeHttpRequest(apiUrl);
        
        if (xmlData && typeof xmlData === 'string') {
          console.log(`📊 vMix API data received (${xmlData.length} chars)`);
          this.parseXMLData(xmlData);
        }
      } catch (error) {
        console.log('⚠️  Could not get vMix API data:', error instanceof Error ? error.message : String(error));
        // Set default values for recording/streaming
        this.isRecording = false;
        this.isStreaming = false;
      }
      
      // Update all input tally states
      this.updateInputTallies();
      
      console.log(`📋 Initialized tracking for ${this.currentInputs.size} vMix inputs`);
      console.log(`🔴 Recording: ${this.isRecording ? 'ON' : 'OFF'}, 📡 Streaming: ${this.isStreaming ? 'ON' : 'OFF'}`);
      
    } catch (error) {
      console.error('❌ Error initializing vMix input tracking:', error);
      // Don't throw error - allow connection to continue with basic functionality
    }
  }

  private updateInputTallies(): void {
    let updatesCount = 0;
    
    // Update tally states for all discovered inputs
    for (const [inputNumber, inputData] of this.currentInputs.entries()) {
      const deviceId = `vmix-input-${inputNumber}`;
      const inputName = inputData.title || `Input ${inputNumber}`;
      
      // For now, we'll determine tally state from the most recent tally data
      // This will be updated by the polling mechanism
      const currentState = this.currentInputStates.get(deviceId);
      
      const newState = {
        preview: currentState?.preview || false,
        program: currentState?.program || false,
        recording: this.isRecording,
        streaming: this.isStreaming
      };
      
      // Only emit update if state actually changed or if this is the first time
      if (!currentState || 
          currentState.preview !== newState.preview || 
          currentState.program !== newState.program ||
          currentState.recording !== newState.recording ||
          currentState.streaming !== newState.streaming) {
        
        this.currentInputStates.set(deviceId, newState);
        
        const update: TallyUpdate = {
          deviceId,
          preview: newState.preview,
          program: newState.program,
          recording: newState.recording,
          streaming: newState.streaming,
          timestamp: new Date()
        };

        this.emit('tally:update', update);
        updatesCount++;
        
        console.log(`📺 vMix Input ${inputNumber} (${inputName}): ${newState.program ? 'PROGRAM' : ''} ${newState.preview ? 'PREVIEW' : ''} ${newState.recording ? 'REC' : ''} ${newState.streaming ? 'STREAM' : ''}`);
      }
    }
    
    if (updatesCount > 0) {
      console.log(`📊 Updated ${updatesCount} vMix input tally states`);
    }
  }
}

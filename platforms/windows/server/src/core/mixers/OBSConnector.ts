import { EventEmitter } from 'events';
import OBSWebSocket from 'obs-websocket-js';
import { MixerConnection, TallyUpdate, MixerStatusUpdate } from '../../types';

export class OBSConnector extends EventEmitter {
  private obs: OBSWebSocket;
  private connection: MixerConnection;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 5000; // 5 seconds
  private maxReconnectDelay = 300000; // 5 minutes
  private currentProgramScene: string = '';
  private currentPreviewScene: string = '';
  private sceneSources: Map<string, string[]> = new Map(); // scene -> sources mapping
  private sourceScenes: Map<string, string[]> = new Map(); // source -> scenes mapping
  private isRecording: boolean = false;
  private isStreaming: boolean = false;

  constructor(connection: MixerConnection) {
    super();
    this.connection = connection;
    this.obs = new OBSWebSocket();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.obs.on('ConnectionOpened', async () => {
      console.log(`📡 OBS WebSocket connected to ${this.connection.host}:${this.connection.port}`);
      this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      this.emit('connected');
      this.clearReconnectInterval();
      
      // Wait a moment for the connection to be fully established
      setTimeout(() => {
        // Wrap async operation to prevent unhandled rejections
        (async () => {
          try {
            await this.initializeSourceTracking();
          } catch (error) {
            console.error(`🚨 Error initializing source tracking for OBS ${this.connection.host}:${this.connection.port}:`, this.getErrorMessage(error));
          }
        })().catch((error) => {
          console.error(`🚨 Unhandled error in source tracking initialization:`, this.getErrorMessage(error));
        });
      }, 1000);
    });

    this.obs.on('ConnectionClosed', () => {
      console.log(`📡 OBS WebSocket disconnected from ${this.connection.host}:${this.connection.port}`);
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.obs.on('ConnectionError', (error) => {
      const errorMessage = this.getErrorMessage(error);
      console.error(`📡 OBS WebSocket connection error for ${this.connection.host}:${this.connection.port}:`, errorMessage);
      this.emit('error', new Error(`OBS connection failed: ${errorMessage}`));
      this.scheduleReconnect();
    });

    // Listen for scene changes (program)
    this.obs.on('CurrentProgramSceneChanged', (data) => {
      this.currentProgramScene = data.sceneName;
      this.handleSceneChange(data.sceneName, true, false);
      this.updateSourceTallies();
    });

    // Listen for preview scene changes
    this.obs.on('CurrentPreviewSceneChanged', (data) => {
      this.currentPreviewScene = data.sceneName;
      this.handleSceneChange(data.sceneName, false, true);
      this.updateSourceTallies();
    });

    // Listen for scene item enable/disable changes
    this.obs.on('SceneItemEnableStateChanged', (data) => {
      this.handleSourceVisibilityChange(data);
    });

    // Listen for scene list changes
    this.obs.on('SceneListChanged', () => {
      // Wrap async operation to prevent unhandled rejections
      (async () => {
        try {
          await this.initializeSourceTracking();
        } catch (error) {
          console.error(`🚨 Error reinitializing source tracking after scene list change:`, this.getErrorMessage(error));
        }
      })().catch((error) => {
        console.error(`🚨 Unhandled error in scene list change handler:`, this.getErrorMessage(error));
      });
    });

    // Listen for scene item list changes
    this.obs.on('SceneItemListReindexed', (data) => {
      this.updateSceneSources(data.sceneName);
    });

    // Listen for recording status changes
    this.obs.on('RecordStateChanged', (data) => {
      this.isRecording = data.outputActive;
      console.log(`🔴 OBS Recording ${this.isRecording ? 'started' : 'stopped'}`);
      // Emit only a global status update; Hub will re-send assigned tallies with overlay
      this.emitStatusUpdate();
    });

    // Listen for streaming status changes
    this.obs.on('StreamStateChanged', (data) => {
      this.isStreaming = data.outputActive;
      console.log(`📡 OBS Streaming ${this.isStreaming ? 'started' : 'stopped'}`);
      // Emit only a global status update; Hub will re-send assigned tallies with overlay
      this.emitStatusUpdate();
    });

    // Listen for transition events
    this.obs.on('SceneTransitionStarted', () => {
      // Handle transition logic if needed
    });
  }

  private handleSceneChange(sceneName: string, isProgram: boolean, isPreview: boolean): void {
    const update: TallyUpdate = {
      deviceId: `obs-scene-${sceneName}`,
      preview: isPreview,
      program: isProgram,
      recording: this.isRecording,
      streaming: this.isStreaming,
      timestamp: new Date()
    };

    this.emit('tally:update', update);
  }

  private async initializeSourceTracking(): Promise<void> {
    try {
      // Get current program and preview scenes
      const programResponse = await this.obs.call('GetCurrentProgramScene');
      let previewResponse;
      try {
        previewResponse = await this.obs.call('GetCurrentPreviewScene');
      } catch (error) {
        console.log('No preview scene available (Studio Mode might be disabled)');
        previewResponse = { currentPreviewSceneName: '' };
      }
      
      this.currentProgramScene = (programResponse.currentProgramSceneName as string) || '';
      this.currentPreviewScene = (previewResponse.currentPreviewSceneName as string) || '';

      // Get current recording and streaming status
      try {
        const recordStatus = await this.obs.call('GetRecordStatus');
        this.isRecording = recordStatus.outputActive as boolean;
      } catch (error) {
        console.log('Could not get recording status');
        this.isRecording = false;
      }

      try {
        const streamStatus = await this.obs.call('GetStreamStatus');
        this.isStreaming = streamStatus.outputActive as boolean;
      } catch (error) {
        console.log('Could not get streaming status');
        this.isStreaming = false;
      }

      // Get all scenes and their sources
      const scenesResponse = await this.obs.call('GetSceneList');
      this.sceneSources.clear();
      this.sourceScenes.clear();

      const scenes = scenesResponse.scenes as any[];
      for (const scene of scenes) {
        if (scene.sceneName && typeof scene.sceneName === 'string') {
          await this.updateSceneSources(scene.sceneName);
        }
      }

      // Update tally states for all sources
      this.updateSourceTallies();
      
      // Also force an initial status update to ensure all tallies have correct recording/streaming status
      console.log(`🔄 Forcing initial tally state refresh with recording=${this.isRecording}, streaming=${this.isStreaming}`);
      
      console.log(`📋 Initialized tracking for ${this.sourceScenes.size} sources across ${this.sceneSources.size} scenes`);
      console.log(`📺 Current program: ${this.currentProgramScene}, preview: ${this.currentPreviewScene}`);
      console.log(`🔴 Recording: ${this.isRecording ? 'ON' : 'OFF'}, 📡 Streaming: ${this.isStreaming ? 'ON' : 'OFF'}`);
      
      // Emit initial status
      this.emitStatusUpdate();
      
      console.log(`📹 Discovered ${this.sourceScenes.size} sources across ${this.sceneSources.size} scenes`);
    } catch (error) {
      console.error('Failed to initialize source tracking:', error);
    }
  }

  private async updateSceneSources(sceneName: string): Promise<void> {
    try {
      const response = await this.obs.call('GetSceneItemList', { sceneName });
      const sources: string[] = [];

      const sceneItems = response.sceneItems as any[];
      for (const item of sceneItems) {
        if (item.sourceName && typeof item.sourceName === 'string' && item.sourceName !== sceneName) {
          const sourceName = item.sourceName as string;
          sources.push(sourceName);
          
          // Update source -> scenes mapping
          const existingScenes = this.sourceScenes.get(sourceName) || [];
          if (!existingScenes.includes(sceneName)) {
            existingScenes.push(sceneName);
            this.sourceScenes.set(sourceName, existingScenes);
          }
        }
      }

      this.sceneSources.set(sceneName, sources);
    } catch (error) {
      console.error(`Failed to update sources for scene ${sceneName}:`, error);
    }
  }

  private handleSourceVisibilityChange(data: any): void {
    // When a source's visibility changes, update tally states
    this.updateSourceTallies();
  }

  private currentSourceStates: Map<string, { preview: boolean; program: boolean; recording: boolean; streaming: boolean }> = new Map();
  private currentSceneStates: Map<string, { preview: boolean; program: boolean; recording: boolean; streaming: boolean }> = new Map();

  private updateSourceTallies(): void {
    let updatesCount = 0;
    
    // Update tally states for all sources based on current program/preview scenes
    for (const [sourceName, scenes] of this.sourceScenes.entries()) {
      const isInProgram = scenes.includes(this.currentProgramScene);
      const isInPreview = scenes.includes(this.currentPreviewScene);
      
      const newState = {
        preview: isInPreview && !isInProgram, // Only preview if not also in program
        program: isInProgram,
        recording: this.isRecording,
        streaming: this.isStreaming
      };
      
      const deviceId = `obs-source-${sourceName}`;
      const currentState = this.currentSourceStates.get(deviceId);
      
      // Only emit update if state actually changed
      if (!currentState || 
          currentState.preview !== newState.preview || 
          currentState.program !== newState.program ||
          currentState.recording !== newState.recording ||
          currentState.streaming !== newState.streaming) {
        
        this.currentSourceStates.set(deviceId, newState);
        
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
      }
    }

    // Also update tally states for all scenes
    for (const [sceneName] of this.sceneSources.entries()) {
      const isProgram = sceneName === this.currentProgramScene;
      const isPreview = sceneName === this.currentPreviewScene;
      
      const newState = {
        preview: isPreview && !isProgram,
        program: isProgram,
        recording: this.isRecording,
        streaming: this.isStreaming
      };
      
      const deviceId = `obs-scene-${sceneName}`;
      const currentState = this.currentSceneStates.get(deviceId);
      
      // Only emit update if state actually changed
      if (!currentState || 
          currentState.preview !== newState.preview || 
          currentState.program !== newState.program ||
          currentState.recording !== newState.recording ||
          currentState.streaming !== newState.streaming) {
        
        this.currentSceneStates.set(deviceId, newState);
        
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
      }
    }
    
    // Only log if there were actual updates and you want to see OBS activity
    // Comment out the next 3 lines if you don't want to see OBS tally update counts
    // if (updatesCount > 0) {
    //   console.log(`📡 OBS: Updated ${updatesCount} tally state(s)`);
    // }
  }

  public async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log(`📡 Already attempting to connect to OBS, skipping duplicate request`);
      return;
    }

    this.isConnecting = true;
    
    try {
      // Clean up any existing connection first
      await this.cleanupConnection();
      
      // Create a fresh OBS WebSocket instance for reconnection
      this.obs = new OBSWebSocket();
      this.setupEventHandlers();
      
      // OBS WebSocket v5 API - connect with URL and optional password
      const websocketUrl = `ws://${this.connection.host}:${this.connection.port}`;
      console.log(`📡 Attempting to connect to OBS at ${websocketUrl}`);
      
      // Add connection timeout
      const connectPromise = this.connection.password || process.env.OBS_PASSWORD
        ? this.obs.connect(websocketUrl, this.connection.password || process.env.OBS_PASSWORD)
        : this.obs.connect(websocketUrl);
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000);
      });
      
      await Promise.race([connectPromise, timeoutPromise]);
      
      this.isConnecting = false;
      console.log(`📡 Successfully initiated connection to OBS at ${websocketUrl}`);
    } catch (error) {
      this.isConnecting = false;
      await this.cleanupConnection();
      const errorMessage = this.getErrorMessage(error);
      console.error(`📡 Failed to connect to OBS at ${this.connection.host}:${this.connection.port}: ${errorMessage}`);
      throw new Error(`OBS connection failed: ${errorMessage}`);
    }
  }

  private async cleanupConnection(): Promise<void> {
    try {
      if (this.obs) {
        // Remove all listeners to prevent memory leaks
        this.obs.removeAllListeners();
        
        // Try to disconnect gracefully
        if (this.obs.identified) {
          await this.obs.disconnect();
        }
      }
    } catch (error) {
      // Ignore cleanup errors, we're trying to reconnect anyway
      console.log('📡 Cleanup warning (ignorable):', error instanceof Error ? error.message : String(error));
    }
  }

  public async disconnect(): Promise<void> {
    console.log(`📡 Disconnecting from OBS ${this.connection.host}:${this.connection.port}`);
    this.clearReconnectInterval();
    await this.cleanupConnection();
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) {
      return;
    }

    // Check if we've exceeded max reconnect attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`🔄 Max reconnection attempts (${this.maxReconnectAttempts}) reached for OBS ${this.connection.host}:${this.connection.port}. Giving up.`);
      console.log(`💡 To retry connection, restart the service or use the 'Reconnect' button in the admin panel.`);
      this.emit('reconnect:failed');
      return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;
    console.log(`🔄 Scheduling OBS reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} to ${this.connection.host}:${this.connection.port} in ${delay / 1000}s`);

    this.reconnectInterval = setTimeout(() => {
      this.reconnectInterval = null; // Clear the interval reference immediately
      
      console.log(`🔄 Attempting to reconnect to OBS ${this.connection.host}:${this.connection.port} (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      // Wrap the async operation to ensure proper error handling
      (async () => {
        try {
          await this.connect();
          // Success - the 'connected' event will be fired by setupEventHandlers
        } catch (error) {
          const errorMessage = this.getErrorMessage(error);
          console.error(`🔄 Reconnection attempt ${this.reconnectAttempts} to OBS failed: ${errorMessage}`);
          
          // If this was the last attempt, provide helpful guidance
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log(`💡 Troubleshooting tips for OBS connection:`);
            console.log(`   • Make sure OBS Studio is running`);
            console.log(`   • Check that WebSocket server is enabled in OBS (Tools > WebSocket Server Settings)`);
            console.log(`   • Verify the host (${this.connection.host}) and port (${this.connection.port}) are correct`);
            console.log(`   • Check firewall settings if connecting to a remote OBS instance`);
            console.log(`   • Try restarting OBS Studio if the WebSocket server seems unresponsive`);
            this.emit('reconnect:failed');
          } else {
            // Schedule the next reconnection attempt
            this.scheduleReconnect();
          }
        }
      })().catch((error) => {
        // Final safety net to prevent unhandled promise rejections
        console.error(`🚨 Unhandled error in OBS reconnection process:`, this.getErrorMessage(error));
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
    console.log(`🔄 Reset reconnection attempts for OBS ${this.connection.host}:${this.connection.port}`);
  }

  public async forceReconnect(): Promise<void> {
    console.log(`🔄 Forcing reconnection to OBS ${this.connection.host}:${this.connection.port}`);
    
    // Clear any pending reconnection
    this.clearReconnectInterval();
    
    // Reset reconnection attempts to allow immediate retry
    this.resetReconnectAttempts();
    
    try {
      await this.connect();
    } catch (error) {
      console.error(`🔄 Force reconnection failed:`, error);
      // Start normal reconnection schedule
      this.scheduleReconnect();
    }
  }

  private getErrorMessage(error: any): string {
    // Handle different types of errors with more descriptive messages
    if (error && typeof error === 'object') {
      if (error.code === 'ECONNREFUSED') {
        return `Connection refused - OBS may not be running or WebSocket server not enabled`;
      } else if (error.code === 'ENOTFOUND') {
        return `Host not found - check if ${this.connection.host} is correct`;
      } else if (error.code === 'ETIMEDOUT') {
        return `Connection timeout - check network connectivity`;
      } else if (error.code === 'ECONNRESET') {
        return `Connection reset - OBS may have closed unexpectedly`;
      } else if (error.code === -1) {
        return `Connection failed - OBS may not be running or WebSocket port ${this.connection.port} not accessible`;
      } else if (error.message) {
        return error.message;
      } else if (error.code) {
        return `Error code: ${error.code}`;
      }
    }
    
    return String(error);
  }

  public async getCurrentScene(): Promise<string | null> {
    try {
      const response = await this.obs.call('GetCurrentProgramScene');
      return response.currentProgramSceneName || null;
    } catch (error) {
      console.error('Failed to get current scene:', error);
      return null;
    }
  }

  public async getSceneList(): Promise<string[]> {
    try {
      const response = await this.obs.call('GetSceneList');
      return response.scenes?.map((scene: any) => scene.sceneName) || [];
    } catch (error) {
      console.error('Failed to get scene list:', error);
      return [];
    }
  }

  public async setCurrentScene(sceneName: string): Promise<void> {
    try {
      await this.obs.call('SetCurrentProgramScene', { sceneName });
    } catch (error) {
      console.error('Failed to set current scene:', error);
      throw error;
    }
  }

  private emitStatusUpdate(): void {
    const statusUpdate: MixerStatusUpdate = {
      mixerId: this.connection.id,
      recording: this.isRecording,
      streaming: this.isStreaming,
      timestamp: new Date()
    };

    this.emit('status:update', statusUpdate);
  }
}

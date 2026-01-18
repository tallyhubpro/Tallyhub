import { EventEmitter } from 'events';
import { Atem, AtemState } from 'atem-connection';
import { MixerConnection, TallyUpdate, MixerStatusUpdate } from '../../types';

export class ATEMConnector extends EventEmitter {
  private atem: Atem;
  private connection: MixerConnection;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 5000; // 5 seconds
  private maxReconnectDelay = 300000; // 5 minutes
  private currentState: AtemState | null = null;
  private inputSources: Map<number, string> = new Map(); // input id -> name mapping
  private isRecording: boolean = false;
  private isStreaming: boolean = false;
  private isConnected: boolean = false;
  private statusPollInterval: NodeJS.Timeout | null = null;
  private loggedNoStatusSupport: boolean = false;
  // Added for transition spam suppression / debounce
  private lastProgramInput: number | null = null;
  private lastPreviewInput: number | null = null;
  private lastInTransition: boolean = false;
  private lastEmitTimestamp: number = 0;
  private MIN_EMIT_INTERVAL_MS = 150;
  private verbose: boolean = (process.env.ATEM_VERBOSE === '1' || process.env.ATEM_VERBOSE === 'true');
  private streamingStopTimer: NodeJS.Timeout | null = null;

  constructor(connection: MixerConnection) {
    super();
    this.connection = connection;
    this.atem = new Atem();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.atem.on('connected', () => {
      console.log(`📡 ATEM connected to ${this.connection.host}:${this.connection.port}`);
      this.isConnected = true;
      this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      this.emit('connected');
      this.clearReconnectInterval();
      
      // Initialize input tracking and rec/stream flags
      setTimeout(() => {
        try {
          // Prime currentState from live atem state if available
          this.currentState = this.atem.state || this.currentState;
          this.handleRecordingStateChange();
          this.handleStreamingStateChange();
        } catch {}
        this.initializeInputTracking();
      }, 500);
      this.startStatusPolling();
    });

    this.atem.on('disconnected', () => {
      console.log(`📡 ATEM WebSocket disconnected from ${this.connection.host}:${this.connection.port}`);
      this.isConnected = false;
      this.emit('disconnected');
      this.scheduleReconnect();
      this.clearStatusPolling();
    });

    this.atem.on('error', (error) => {
      console.error(`❌ Error from ${this.connection.name}:`, this.getErrorMessage(error));
      this.emit('error', error);
      if (!this.isConnected) {
        this.scheduleReconnect();
      }
    });

    // Listen for state changes to track tally updates
    this.atem.on('stateChanged', (state: AtemState, pathToChange: string[]) => {
      this.currentState = state;
      const tallyRelated = pathToChange.some(p =>
        p === 'video' ||
        p === 'mixEffects' ||
        p.startsWith('video.mixEffects') ||
        p.includes('programInput') ||
        p.includes('previewInput') ||
        p.includes('transition') ||
        p.includes('transitionPosition')
      );
      if (tallyRelated) {
        this.handleTallyStateChange();
      }
      const recordingRelevant = pathToChange.some(p => (
        p === 'recording' || p.includes('recording.status') || p.includes('recording.state') || p.includes('recording.onAir') || p.includes('recording.active')
      ));
      const streamingRelevant = pathToChange.some(p => (
        p === 'streaming' || p.includes('streaming.status') || p.includes('streaming.state') || p.includes('streaming.onAir') || p.includes('streaming.active')
      ));
      if (recordingRelevant) this.handleRecordingStateChange();
      if (streamingRelevant) this.handleStreamingStateChange();
    });
  }

  public async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log(`🔄 ATEM connection already in progress to ${this.connection.host}:${this.connection.port}`);
      return;
    }

    this.isConnecting = true;
    console.log(`🔌 Attempting to connect to ATEM at ${this.connection.host}:${this.connection.port}...`);

    try {
      await this.atem.connect(this.connection.host, this.connection.port);
      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;
      const errorMsg = `ATEM connection failed: ${this.getErrorMessage(error)}`;
      console.error(`❌ ${errorMsg}`);
      this.emit('error', new Error(errorMsg));
      this.scheduleReconnect();
      throw new Error(errorMsg);
    }
  }

  public async disconnect(): Promise<void> {
    console.log(`🔌 Disconnecting from ATEM ${this.connection.host}:${this.connection.port}...`);
    this.clearReconnectInterval();
    
    try {
      await this.atem.disconnect();
      this.isConnected = false;
      console.log(`✅ Disconnected from ATEM ${this.connection.host}:${this.connection.port}`);
    } catch (error) {
      console.error(`❌ Error disconnecting from ATEM:`, this.getErrorMessage(error));
    }
  }

  private initializeInputTracking(): void {
    if (!this.currentState) {
      console.log('⚠️  ATEM state not available yet, skipping input tracking initialization');
      return;
    }

    try {
      // Get input sources from ATEM state
      this.inputSources.clear();
      
      if (this.currentState.inputs) {
        for (const [inputId, input] of Object.entries(this.currentState.inputs)) {
          const id = parseInt(inputId);
          if (input && input.longName) {
            this.inputSources.set(id, input.longName);
            console.log(`📹 ATEM Input ${id}: ${input.longName}`);
          }
        }
      }

      console.log(`📊 ATEM input tracking initialized with ${this.inputSources.size} inputs`);
      
      // Send initial tally state
      this.handleTallyStateChange();
      
    } catch (error) {
      console.error(`🚨 Error initializing ATEM input tracking:`, this.getErrorMessage(error));
    }
  }

  private handleTallyStateChange(forceEmit: boolean = false): void {
    if (!this.currentState || !this.currentState.video || !this.currentState.video.mixEffects) {
      return;
    }

    try {
      // ATEM typically has one or more mix effects buses
      const mixEffect = this.currentState.video.mixEffects[0]; // Use first ME
      if (!mixEffect) return;

      const programInput = mixEffect.programInput;
      const previewInput = mixEffect.previewInput;
      const rawTransition: any = (mixEffect as any).transitionPosition;
      let numericTransition: number | null = null;
      if (typeof rawTransition === 'number') numericTransition = rawTransition;
      else if (rawTransition && typeof rawTransition === 'object') {
        numericTransition = (rawTransition.position ?? rawTransition.value ?? rawTransition.handle ?? null) as number | null;
      }
      const inTransition = numericTransition !== null && numericTransition > 0 && numericTransition < 10000;

      if (!forceEmit && inTransition && this.lastInTransition && this.lastProgramInput === programInput && this.lastPreviewInput === previewInput) {
        return;
      }
      if (!forceEmit && !inTransition && !this.lastInTransition && this.lastProgramInput === programInput && this.lastPreviewInput === previewInput) {
        const now = Date.now();
        if (now - this.lastEmitTimestamp < this.MIN_EMIT_INTERVAL_MS) {
          return;
        }
      }

      for (const [inputId, inputName] of this.inputSources) {
        if (!this.isCameraSource(inputName)) continue;
        const isProgram = inputId === programInput;
        const isPreview = (!inTransition && programInput === previewInput && isProgram) ? false : (inputId === previewInput);
        const tallyUpdate: TallyUpdate = {
          deviceId: `atem-input-${inputId}`,
          preview: isPreview,
          program: isProgram,
          timestamp: new Date(),
          recording: this.isRecording,
          streaming: this.isStreaming
        };
        this.emit('tally:update', tallyUpdate);
      }
      console.log(`📡 ATEM Tally: Program=${programInput}, Preview=${previewInput}, InTransition=${inTransition} (${numericTransition})`);

      const programChanged = this.lastProgramInput !== null && this.lastProgramInput !== programInput;
      const previewChanged = this.lastPreviewInput !== null && this.lastPreviewInput !== previewInput;
      const transitionEnded = this.lastInTransition && !inTransition;
      if (transitionEnded && (programChanged || previewChanged)) {
        setTimeout(() => this.handleTallyStateChange(true), 50);
      }
      this.lastProgramInput = programInput;
      this.lastPreviewInput = previewInput;
      this.lastInTransition = inTransition;
      this.lastEmitTimestamp = Date.now();
      
    } catch (error) {
      console.error(`🚨 Error handling ATEM tally state change:`, this.getErrorMessage(error));
    }
  }

  private handleRecordingStateChange(): void {
    if (!this.currentState || !this.currentState.recording) {
      return;
    }

    try {
  const wasRecording = this.isRecording;
  this.isRecording = this.isRecordingActive(this.currentState.recording);
      
      if (wasRecording !== this.isRecording) {
        console.log(`📹 ATEM Recording state changed: ${this.isRecording ? 'Started' : 'Stopped'}`);
        
        const statusUpdate: MixerStatusUpdate = {
          mixerId: this.connection.id,
          recording: this.isRecording,
          streaming: this.isStreaming,
          timestamp: new Date()
        };
        
  this.emit('status:update', statusUpdate);
        
        // Re-emit tally updates with new recording state
        this.handleTallyStateChange();
      }
    } catch (error) {
      console.error(`🚨 Error handling ATEM recording state change:`, this.getErrorMessage(error));
    }
  }

  private handleStreamingStateChange(): void {
    if (!this.currentState || !this.currentState.streaming) {
      return;
    }

    try {
      const newActive = this.isStreamingActive(this.currentState.streaming);
      this.applyStreamingActive(newActive, 'event');
    } catch (error) {
      console.error(`🚨 Error handling ATEM streaming state change:`, this.getErrorMessage(error));
    }
  }

  private applyStreamingActive(newActive: boolean, source: 'event' | 'poll' = 'event'): void {
    const wasStreaming = this.isStreaming;
    if (this.verbose) {
      try {
        const s: any = this.currentState?.streaming?.status || this.currentState?.streaming;
        const rawState = (s && typeof s === 'object') ? (s.state ?? s.onAir ?? s.active) : s;
        console.log(`ℹ️  ATEM streaming apply (${source}): newActive=${newActive}, was=${wasStreaming}, rawState=`, rawState);
      } catch {}
    }
    if (newActive) {
      if (this.streamingStopTimer) { clearTimeout(this.streamingStopTimer); this.streamingStopTimer = null; }
      if (!wasStreaming) {
        this.isStreaming = true;
        const statusUpdate: MixerStatusUpdate = { mixerId: this.connection.id, recording: this.isRecording, streaming: this.isStreaming, timestamp: new Date() };
        this.emit('status:update', statusUpdate);
        this.handleTallyStateChange();
      }
      return;
    }
    if (wasStreaming && !this.streamingStopTimer) {
      this.streamingStopTimer = setTimeout(() => {
        this.streamingStopTimer = null;
        const confirmActive = this.isStreamingActive(this.currentState?.streaming);
        if (!confirmActive && this.isStreaming) {
          this.isStreaming = false;
          const statusUpdate: MixerStatusUpdate = { mixerId: this.connection.id, recording: this.isRecording, streaming: this.isStreaming, timestamp: new Date() };
          this.emit('status:update', statusUpdate);
          this.handleTallyStateChange();
        }
      }, 800);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) {
      return; // Already scheduled
    }

    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached for ATEM ${this.connection.host}:${this.connection.port}`);
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    const jitteredDelay = delay + Math.random() * 1000; // Add up to 1 second of jitter

    console.log(`🔄 Scheduling ATEM reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} to ${this.connection.host}:${this.connection.port} in ${Math.round(jitteredDelay / 1000)}s`);

    this.reconnectInterval = setTimeout(() => {
      this.reconnectInterval = null;
      console.log(`🔄 Attempting to reconnect to ATEM ${this.connection.host}:${this.connection.port} (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      this.connect().catch(error => {
        console.error(`🔄 Reconnection attempt ${this.reconnectAttempts} to ATEM failed:`, this.getErrorMessage(error));
      });
    }, jitteredDelay);
  }

  private clearReconnectInterval(): void {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  private getErrorMessage(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private startStatusPolling(): void {
    this.clearStatusPolling();
    this.statusPollInterval = setInterval(() => {
      try {
        const st = this.currentState;
        const recObj: any = st?.recording;
        const strObj: any = st?.streaming;
        if (!recObj && !strObj) {
          if (!this.loggedNoStatusSupport) {
            console.log('ℹ️  ATEM recording/streaming status not present in state (Windows bundle)');
            this.loggedNoStatusSupport = true;
          }
          return;
        }
        const recActive = this.isRecordingActive(recObj);
        const strActive = this.isStreamingActive(strObj);
        let changed = false;
        if (recActive !== this.isRecording) { this.isRecording = recActive; changed = true; }
        this.applyStreamingActive(strActive, 'poll');
        if (changed) {
          const statusUpdate: MixerStatusUpdate = {
            mixerId: this.connection.id,
            recording: this.isRecording,
            streaming: this.isStreaming,
            timestamp: new Date()
          };
          this.emit('status:update', statusUpdate);
          this.handleTallyStateChange();
        }
      } catch {}
    }, 2000);
  }

  private clearStatusPolling(): void {
    if (this.statusPollInterval) {
      clearInterval(this.statusPollInterval);
      this.statusPollInterval = null;
    }
    this.loggedNoStatusSupport = false;
  }

  private isStreamingActive(streaming: any): boolean {
    if (!streaming) return false;
    const s: any = (streaming as any).status || streaming;
    if (s && typeof s === 'object') {
      if (typeof s.onAir === 'boolean') return s.onAir;
      if (typeof s.active === 'boolean') return s.active;
      if (typeof s.state === 'number') return s.state >= 2;
      if (typeof s.state === 'string') {
        const v = String(s.state).toLowerCase();
        return v === 'streaming' || v === 'onair' || v === 'live';
      }
    }
    if (typeof s === 'boolean') return s;
    if (typeof s === 'number') return s >= 2;
    if (typeof s === 'string') {
      const v = s.toLowerCase();
      return v === 'streaming' || v === 'onair' || v === 'live';
    }
    return false;
  }

  private isRecordingActive(recording: any): boolean {
    if (!recording) return false;
    const s = (recording as any).status || recording;
    const stateVal = (s && typeof s === 'object') ? (s as any).state ?? (s as any).onAir ?? (s as any).active : s as any;
    if (typeof stateVal === 'number') return stateVal === 1 || stateVal === 2;
    if (typeof stateVal === 'boolean') return stateVal === true;
    if (typeof stateVal === 'string') {
      const v = stateVal.toLowerCase();
      return v === 'recording' || v === 'onair' || v === 'active';
    }
    return false;
  }

  private isCameraSource(name: string): boolean {
    // Relaxed filter to include all non-system sources
    if (!name) return false;
    const lower = name.toLowerCase();
    const excluded = [
      'black','color','bars','media player','multiview','program','preview','output','recording status','streaming status','audio status','direct'
    ];
    return !excluded.some(p => lower.includes(p));
  }

  public isConnectedToMixer(): boolean {
    return this.isConnected;
  }

  public getConnectionInfo(): MixerConnection {
    return { ...this.connection };
  }

  public getInputSources(): Array<{ id: string; name: string; type: string }> {
    const sources: Array<{ id: string; name: string; type: string }> = [];
    
    for (const [inputId, inputName] of this.inputSources) {
      if (!this.isCameraSource(inputName)) continue;
      sources.push({ id: `atem-input-${inputId}`, name: inputName, type: 'input' });
    }
    
    return sources;
  }

  public getCurrentState(): any {
    if (!this.currentState || !this.currentState.video || !this.currentState.video.mixEffects) {
      return null;
    }

    const mixEffect = this.currentState.video.mixEffects[0];
    if (!mixEffect) return null;

    return {
      programInput: mixEffect.programInput,
      previewInput: mixEffect.previewInput,
      recording: this.isRecording,
      streaming: this.isStreaming,
      inputs: Array.from(this.inputSources.entries()).map(([id, name]) => ({
        id: id.toString(),
        name,
        program: id === mixEffect.programInput,
        preview: id === mixEffect.previewInput
      }))
    };
  }
}

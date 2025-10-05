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
  // Track last seen buses to detect real changes and force refresh at end of AUTO transitions
  private lastProgramInput: number | null = null;
  private lastPreviewInput: number | null = null;
  // Track transition state & emission timing to suppress noisy transitionPosition updates
  private lastInTransition: boolean = false;
  private lastEmitTimestamp: number = 0;
  private MIN_EMIT_INTERVAL_MS = 150; // debounce identical stable states
  // Verbose logging toggle (set ATEM_VERBOSE=true to enable detailed logs)
  private verbose: boolean = (process.env.ATEM_VERBOSE === '1' || process.env.ATEM_VERBOSE === 'true');
  // Grace window timer to avoid immediate stop flicker for streaming
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
      
      // Get initial state immediately
      if (this.verbose) console.log('🔍 Getting initial ATEM state...');
      try {
        const state = this.atem.state;
        this.currentState = state || null;
        if (this.verbose) {
          console.log('📊 Initial ATEM state:', {
            hasState: !!this.currentState,
            keys: this.currentState ? Object.keys(this.currentState) : []
          });
        }
        // Initialize recording/streaming flags from initial state if available
        try {
          this.handleRecordingStateChange();
          this.handleStreamingStateChange();
        } catch {}
      } catch (error) {
        console.error('❌ Error getting initial ATEM state:', error);
      }
      
      // Initialize input tracking with multiple attempts
      this.attemptInputTracking(0);

      // Start status polling as a fallback in case events aren't emitted
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
      if (this.verbose) {
        console.log('🔄 ATEM state changed:', {
          pathToChange,
          hasInputs: !!state.inputs,
          hasVideo: !!state.video,
          inputCount: state.inputs ? Object.keys(state.inputs).length : 0
        });
      }
      
      this.currentState = state;
      
      // Handle program/preview changes (original check missed nested paths like 'video.mixEffects.0.programInput')
      const tallyRelated = pathToChange.some(p => 
        p === 'video' ||
        p === 'mixEffects' ||
        p.startsWith('video.mixEffects') ||
  p.includes('programInput') ||
  p.includes('previewInput') ||
  p.includes('transition') || // capture transitionPosition / transitionStyle changes
  p.includes('transitionPosition')
      );
      if (tallyRelated) {
        if (this.verbose) console.log('🎛️ ATEM program/preview path change detected:', pathToChange);
        this.handleTallyStateChange();
      }
      
      // Relevant path filters for recording/streaming
      const recordingRelevant = pathToChange.some(p => (
        p === 'recording' ||
        p.includes('recording.status') || p.includes('recording.state') || p.includes('recording.onAir') || p.includes('recording.active')
      ));
      const streamingRelevant = pathToChange.some(p => (
        p === 'streaming' ||
        p.includes('streaming.status') || p.includes('streaming.state') || p.includes('streaming.onAir') || p.includes('streaming.active')
      ));

      // Handle recording state changes (ignore duration/counter/stat updates)
      if (recordingRelevant) {
        if (this.verbose) console.log('🔴 ATEM recording state path (relevant) detected');
        this.handleRecordingStateChange();
      }
      
      // Handle streaming state changes (ignore duration/counter/stat updates)
      if (streamingRelevant) {
        if (this.verbose) console.log('📡 ATEM streaming state path (relevant) detected');
        this.handleStreamingStateChange();
      }
      
      // If this is the first time we get inputs, initialize tracking
      if (state.inputs && this.inputSources.size === 0) {
        if (this.verbose) console.log('📥 ATEM inputs now available, initializing tracking');
        this.initializeInputTracking();
      }
    });
  }

  private attemptInputTracking(attempt: number): void {
    const maxAttempts = 5;
    const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5 seconds
    
    setTimeout(() => {
      if (this.currentState && this.currentState.inputs) {
        console.log(`📊 ATEM state available, initializing input tracking (attempt ${attempt + 1})`);
        this.initializeInputTracking();
      } else {
        if (attempt < maxAttempts - 1) {
          console.log(`⏳ ATEM state not ready, retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
          this.attemptInputTracking(attempt + 1);
        } else {
          console.warn(`⚠️  ATEM state not available after ${maxAttempts} attempts, input tracking disabled`);
        }
      }
    }, delay);
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
      
      if (this.verbose) {
        console.log('🔍 ATEM State structure:', {
          hasInputs: !!this.currentState.inputs,
          hasVideo: !!this.currentState.video,
          hasMixEffects: !!(this.currentState.video?.mixEffects),
          inputKeys: this.currentState.inputs ? Object.keys(this.currentState.inputs) : []
        });
      }
      
      if (this.currentState.inputs) {
        let inputCount = 0;
        for (const [inputId, input] of Object.entries(this.currentState.inputs)) {
          const id = parseInt(inputId);
          if (input && typeof input === 'object') {
            // Try different property names for input name
            const inputName = (input as any).longName || 
                             (input as any).shortName || 
                             (input as any).name || 
                             `Input ${id}`;
            
            this.inputSources.set(id, inputName);
            if (this.verbose) console.log(`📹 ATEM Input ${id}: ${inputName}`);
            inputCount++;
          }
        }
        
        if (inputCount === 0) {
          console.warn('⚠️  No valid inputs found in ATEM state');
        } else {
          if (this.verbose) console.log(`📊 ATEM input tracking initialized with ${inputCount} inputs`);
        }
      } else {
        console.warn('⚠️  ATEM inputs not found in state');
      }

      // Log current mix effects state
      if (this.currentState.video?.mixEffects) {
        const mixEffect = this.currentState.video.mixEffects[0];
        if (mixEffect) {
          if (this.verbose) console.log(`🎛️ ATEM Mix Effect - Program: ${mixEffect.programInput}, Preview: ${mixEffect.previewInput}`);
        }
      }
      
      // Send initial tally state
      this.handleTallyStateChange();
      
    } catch (error) {
      console.error(`🚨 Error initializing ATEM input tracking:`, this.getErrorMessage(error));
      console.error('🔍 ATEM State dump:', JSON.stringify(this.currentState, null, 2));
    }
  }

  private handleTallyStateChange(forceEmit: boolean = false): void {
    if (!this.currentState || !this.currentState.video || !this.currentState.video.mixEffects) {
      console.log('⚠️  ATEM tally state not available');
      return;
    }

    try {
      // ATEM typically has one or more mix effects buses
      const mixEffect = this.currentState.video.mixEffects[0]; // Use first ME
      if (!mixEffect) {
        console.log('⚠️  ATEM mix effect not available');
        return;
      }

      const programInput = mixEffect.programInput;
      const previewInput = mixEffect.previewInput;
      const rawTransition = (mixEffect as any).transitionPosition;
      let numericTransition: number | null = null;
      if (typeof rawTransition === 'number') numericTransition = rawTransition;
      else if (rawTransition && typeof rawTransition === 'object') {
        // Try common property names used by atem-connection
        numericTransition = (rawTransition.position ?? rawTransition.value ?? rawTransition.handle ?? null) as number | null;
      }
      const inTransition = numericTransition !== null && numericTransition > 0 && numericTransition < 10000;

      // Suppress noisy transitionPosition-only updates:
      // 1. If we are mid-transition (transition active) and nothing about program/preview changed from last emission, skip.
      if (!forceEmit && inTransition && this.lastInTransition && this.lastProgramInput === programInput && this.lastPreviewInput === previewInput) {
        return; // ongoing transition progress update (position changing) -> ignore
      }

      // 2. If we are stable (not in transition) and buses unchanged and recently emitted, debounce.
      if (!forceEmit && !inTransition && !this.lastInTransition && this.lastProgramInput === programInput && this.lastPreviewInput === previewInput) {
        const now = Date.now();
        if (now - this.lastEmitTimestamp < this.MIN_EMIT_INTERVAL_MS) {
          return; // duplicate stable state within debounce window
        }
      }

      if (this.verbose) console.log(`🎛️ ATEM Tally Update: Program=${programInput}, Preview=${previewInput}, InTransition=${inTransition} (${numericTransition}), Inputs=${this.inputSources.size}`);
      if (!inTransition && programInput === previewInput) {
        if (this.verbose) console.log('ℹ️  Program and Preview identical (no active transition) – treating as Program only for tally output');
      }

      // Emit tally updates for all inputs
      let tallyCount = 0;
        for (const [inputId, inputName] of this.inputSources) {
          if (!this.isCameraSource(inputName)) continue; // emit only camera sources
        const isProgram = inputId === programInput;
        let isPreview = inputId === previewInput;

        // After transition completion ATEM often reports program==preview briefly; suppress preview flag then.
        if (!inTransition && programInput === previewInput && isProgram) {
          isPreview = false;
        }

        const tallyUpdate: TallyUpdate = {
          deviceId: `atem-input-${inputId}`,
          preview: isPreview,
          program: isProgram,
          timestamp: new Date(),
          recording: this.isRecording,
          streaming: this.isStreaming
        };

        this.emit('tally:update', tallyUpdate);
        
        if (isProgram || isPreview) {
          if (this.verbose) {
            const flags = `${isProgram ? 'PROGRAM' : ''}${isPreview ? 'PREVIEW' : ''}`;
            console.log(`📡 ATEM Tally: Input ${inputId} (${inputName}) - ${flags}`);
          }
          tallyCount++;
        }
      }

      // Detect transition start/end boundaries
      const programChanged = this.lastProgramInput !== null && this.lastProgramInput !== programInput;
      const previewChanged = this.lastPreviewInput !== null && this.lastPreviewInput !== previewInput;
      const transitionEnded = this.lastInTransition && !inTransition; // edge when transition just ended
      const transitionStarted = !this.lastInTransition && inTransition;

      if (transitionEnded && (programChanged || previewChanged)) {
        // Small delayed re-emit to catch any final bus settling
        setTimeout(() => {
          if (this.currentState) {
            const me = this.currentState.video?.mixEffects?.[0];
            if (me) {
              if (this.verbose) console.log('🔁 Post-transition verification emit');
              this.handleTallyStateChange(true); // force emit
            }
          }
        }, 50);
      }

      this.lastProgramInput = programInput;
      this.lastPreviewInput = previewInput;
      this.lastInTransition = inTransition;
      this.lastEmitTimestamp = Date.now();
      
      if (tallyCount === 0 && this.verbose) {
        console.log('ℹ️  No active tally states (all inputs off)');
      }
      
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
  // Check if recording is active based on ATEM state (explicit)
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

  // Apply streaming state with a short grace window on stop to avoid flicker
  private applyStreamingActive(newActive: boolean, source: 'event' | 'poll' = 'event'): void {
    const wasStreaming = this.isStreaming;
    if (this.verbose) {
      try {
        const s: any = this.currentState?.streaming?.status || this.currentState?.streaming;
        const rawState = (s && typeof s === 'object') ? (s.state ?? s.onAir ?? s.active) : s;
        console.log(`ℹ️  ATEM streaming apply (${source}): newActive=${newActive}, was=${wasStreaming}, rawState=`, rawState);
      } catch {}
    }

    // If turning ON: emit immediately, cancel any pending stop timer
    if (newActive) {
      if (this.streamingStopTimer) {
        clearTimeout(this.streamingStopTimer);
        this.streamingStopTimer = null;
      }
      if (!wasStreaming) {
        this.isStreaming = true;
        const statusUpdate: MixerStatusUpdate = {
          mixerId: this.connection.id,
          recording: this.isRecording,
          streaming: this.isStreaming,
          timestamp: new Date()
        };
        this.emit('status:update', statusUpdate);
        this.handleTallyStateChange();
      }
      return;
    }

    // If turning OFF: wait briefly to confirm still off (handles brief transitional blips)
    if (wasStreaming && !this.streamingStopTimer) {
      this.streamingStopTimer = setTimeout(() => {
        this.streamingStopTimer = null;
        const confirmActive = this.isStreamingActive(this.currentState?.streaming);
        if (!confirmActive && this.isStreaming) {
          this.isStreaming = false;
          const statusUpdate: MixerStatusUpdate = {
            mixerId: this.connection.id,
            recording: this.isRecording,
            streaming: this.isStreaming,
            timestamp: new Date()
          };
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
            console.log('ℹ️  ATEM recording/streaming status objects not present in state – model may not support these features.');
            this.loggedNoStatusSupport = true;
          }
          return;
        }

        const recActive = this.isRecordingActive(recObj);
        const strActive = this.isStreamingActive(strObj);

        let changed = false;
        if (recActive !== this.isRecording) {
          this.isRecording = recActive;
          changed = true;
        }
        // Apply streaming via helper (handles grace window); do not mark changed here for streaming
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
      } catch (e) {
        // Silent poll errors to avoid spam
      }
    }, 2000);
  }

  private clearStatusPolling(): void {
    if (this.statusPollInterval) {
      clearInterval(this.statusPollInterval);
      this.statusPollInterval = null;
    }
    this.loggedNoStatusSupport = false;
  }

  // Explicit detection for Streaming (treat only Streaming/LIVE as true)
  private isStreamingActive(streaming: any): boolean {
    if (!streaming) return false;
    const s = streaming.status || streaming;
    if (s && typeof s === 'object') {
      const so: any = s;
      if (typeof so.onAir === 'boolean') return so.onAir;
      if (typeof so.active === 'boolean') return so.active;
      if (typeof so.state === 'number') return so.state >= 2; // 0/1 = idle/connecting, >=2 = on air on many models
      if (typeof so.state === 'string') {
        const v = String(so.state).toLowerCase();
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

  // Detection for Recording (most models: 0=Idle, 1=Recording)
  private isRecordingActive(recording: any): boolean {
    if (!recording) return false;
    const s = recording.status || recording;
    const stateVal = (s && typeof s === 'object') ? (s.state ?? s.onAir ?? s.active) : s;
    if (typeof stateVal === 'number') return stateVal === 1 || stateVal === 2; // some firmwares use 1=Rec, accept 2 as active if present
    if (typeof stateVal === 'boolean') return stateVal === true;
    if (typeof stateVal === 'string') {
      const v = stateVal.toLowerCase();
      return v === 'recording' || v === 'onair' || v === 'active';
    }
    return false;
  }

  private isCameraSource(name: string): boolean {
    // Relaxed: include all inputs except obvious system/utility sources
    if (!name) return false;
    const lower = name.toLowerCase();
    const excludedPatterns = [
      'black', 'color', 'bars', 'media player', 'multiview', 'program', 'preview',
      'output', 'recording status', 'streaming status', 'audio status', 'direct'
    ];
    return !excludedPatterns.some(p => lower.includes(p));
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
    
    console.log(`📋 ATEM returning ${sources.length} sources:`, sources.map(s => `${s.id}: ${s.name}`));
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
        id: `atem-input-${id}`,
        name,
        program: id === mixEffect.programInput,
        preview: id === mixEffect.previewInput
      }))
    };
  }
}

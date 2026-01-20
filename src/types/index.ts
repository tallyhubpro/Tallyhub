export interface TallyState {
  id: string;
  name: string;
  preview: boolean;
  program: boolean;
  connected: boolean;
  lastSeen: Date;
  recording?: boolean;  // Recording status from mixer
  streaming?: boolean;  // Streaming status from mixer
}

export interface MixerConnection {
  id: string;
  name: string;
  type: 'obs' | 'vmix' | 'atem' | 'tsl_umd' | 'osc' | 'roland' | 'tricaster' | 'tsl_umd5';
  host: string;
  port: number;
  connected: boolean;
  password?: string;    // Optional password for OBS
  lastError?: string;
  recording?: boolean;  // Current recording status
  streaming?: boolean;  // Current streaming status
  protocol?: 'udp' | 'tcp';  // Protocol for TSL UMD and other network-based mixers
  tcpMode?: 'server' | 'client';  // TCP mode for TSL UMD
  model?: string;  // Model identifier for Roland and other mixers
}

export interface TallyDevice {
  id: string;
  name: string;
  type: 'web' | 'm5stick' | 'hardware' | 'ESP32';
  lastSeen: Date;
  connected: boolean;
  ipAddress?: string;
  // New assignment properties
  assignedSource?: string;  // Specific source/scene ID to monitor
  assignmentMode: 'auto' | 'assigned';  // Auto follows all, assigned follows specific
  assignedBy?: string;  // User who made the assignment
  assignedAt?: Date;    // When assignment was made
}

export interface DeviceAssignment {
  deviceId: string;
  sourceId: string;
  sourceName: string;
  assignedBy: string;
  assignedAt: Date;
}

export interface MixerSource {
  id: string;
  name: string;
  type: string;
  preview: boolean;
  program: boolean;
}

export interface TallyUpdate {
  deviceId: string;
  preview: boolean;
  program: boolean;
  timestamp: Date;
  recording?: boolean;  // Recording status from mixer
  streaming?: boolean;  // Streaming status from mixer
}

export interface MixerStatusUpdate {
  mixerId: string;
  recording: boolean;
  streaming: boolean;
  timestamp: Date;
}

export interface MixerConfig {
  id: string;
  name: string;
  type: 'obs' | 'vmix' | 'atem' | 'tsl_umd' | 'osc' | 'roland' | 'tricaster' | 'tsl_umd5';
  host: string;
  port: number;
  password?: string;
  protocol?: 'udp' | 'tcp';
  tcpMode?: 'server' | 'client';
  model?: string;
}

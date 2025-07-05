import { Application, Request, Response, RequestHandler } from 'express';
import { ParsedQs } from 'qs';
import { TallyHub } from '../core/TallyHub';
import path from 'path';
import { VMixConnector } from '../core/mixers/VMixConnector';

export function setupRoutes(app: Application, tallyHub: TallyHub): void {
  // API Routes
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'running',
      timestamp: new Date(),
      tallies: tallyHub.getTallies(),
      devices: tallyHub.getDevices(),
      mixers: tallyHub.getMixerConnections()
    });
  });

  app.get('/api/tallies', (req, res) => {
    res.json(tallyHub.getTallies());
  });

  app.get('/api/devices', (req, res) => {
    res.json(tallyHub.getDevices());
  });

  app.get('/api/mixers', (req, res) => {
    res.json(tallyHub.getMixerConnections());
  });

  // Mixer management endpoints
  app.post('/api/mixers', ((req, res) => {
    const { name, type, host, port, password } = req.body;
    
    if (!name || !type || !host || !port) {
      return res.status(400).json({ error: 'Missing required fields: name, type, host, port' });
    }

    const id = `${type}-${Date.now()}`;
    const connection = { id, name, type, host, port: parseInt(port), connected: false };
    
    const success = tallyHub.addMixerConnection(id, connection, password);
    
    if (success) {
      res.json({ success: true, message: 'Mixer added successfully', id });
    } else {
      res.status(400).json({ error: 'Failed to add mixer' });
    }
  }) as RequestHandler);

  app.delete('/api/mixers/:id', (req, res) => {
    const { id } = req.params;
    const success = tallyHub.removeMixerConnection(id);
    
    if (success) {
      res.json({ success: true, message: 'Mixer removed successfully' });
    } else {
      res.status(404).json({ error: 'Mixer not found' });
    }
  });

  app.post('/api/mixers/:id/test', async (req, res) => {
    const { id } = req.params;
    const result = await tallyHub.testMixerConnection(id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  });

  app.post('/api/mixers/:id/reconnect', (req, res) => {
    const { id } = req.params;
    const success = tallyHub.resetMixerReconnection(id);
    
    if (success) {
      res.json({ success: true, message: 'Reconnection attempts reset' });
    } else {
      res.status(404).json({ error: 'Mixer not found or does not support reconnection reset' });
    }
  });

  app.post('/api/mixers/:id/force-reconnect', async (req, res) => {
    const { id } = req.params;
    const result = await tallyHub.forceReconnectMixer(id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  });

  app.post('/api/mixers/save', (req, res) => {
    try {
      tallyHub.saveConfigurations();
      res.json({ success: true, message: 'Configurations saved successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save configurations' });
    }
  });

  // Device assignment endpoints
  const assignDeviceHandler: RequestHandler = (req: Request, res: Response) => {
    const { deviceId } = req.params;
    const { sourceId, assignedBy = 'admin' } = req.body;
    
    console.log(`📍 Assignment request: deviceId=${deviceId}, sourceId='${sourceId}', type=${typeof sourceId}`);
    
    // If sourceId is explicitly empty string, unassign the device
    if (sourceId === '') {
      console.log(`🔄 Unassigning device ${deviceId}`);
      const success = tallyHub.unassignDevice(deviceId);
      
      if (success) {
        res.json({ 
          success: true, 
          message: `Device ${deviceId} unassigned` 
        });
      } else {
        res.status(400).json({ 
          error: 'Failed to unassign device' 
        });
      }
      return;
    }
    
    // If sourceId is missing, undefined, or null, return error
    if (sourceId === undefined || sourceId === null) {
      console.log(`❌ sourceId is missing: ${sourceId}`);
      res.status(400).json({ error: 'sourceId is required' });
      return;
    }
    
    console.log(`➡️ Assigning device ${deviceId} to source ${sourceId}`);
    const success = tallyHub.assignSourceToDevice(deviceId, sourceId, assignedBy);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Device ${deviceId} assigned to source ${sourceId}` 
      });
    } else {
      res.status(400).json({ 
        error: 'Failed to assign device to source' 
      });
    }
  };

  const unassignDeviceHandler: RequestHandler = (req: Request, res: Response) => {
    const { deviceId } = req.params;
    
    const success = tallyHub.unassignDevice(deviceId);
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Device ${deviceId} unassigned` 
      });
    } else {
      res.status(400).json({ 
        error: 'Failed to unassign device' 
      });
    }
  };

  app.post('/api/devices/:deviceId/assign', assignDeviceHandler);
  app.post('/api/devices/:deviceId/unassign', unassignDeviceHandler);

  app.get('/api/assignments', (req, res) => {
    res.json(tallyHub.getDeviceAssignments());
  });

  // Test endpoint to simulate status updates (for testing)
  app.post('/api/test/status', (req, res) => {
    const { recording = false, streaming = false } = req.body;
    
    // Emit a test status update
    const statusUpdate = {
      mixerId: 'test-mixer',
      recording: recording,
      streaming: streaming,
      timestamp: new Date()
    };
    
    tallyHub.emit('status:update', statusUpdate);
    
    console.log('📊 Test status update sent:', statusUpdate);
    res.json({ 
      success: true, 
      message: 'Status update sent',
      statusUpdate 
    });
  });

  // Web Interface Routes
  app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/index.html'));
  });

  app.get('/tally', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/tally.html'));
  });

  app.get('/admin', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/admin.html'));
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date() });
  });

  // Mixer inputs endpoint
  app.get('/api/mixers/:id/inputs', (async (req, res) => {
    const { id } = req.params;
    const mixer = tallyHub.getMixerById(id);
    if (!mixer) {
      res.status(404).json({ error: 'Mixer not found' });
      return;
    }
    // If VMix, get inputs
    if (mixer instanceof VMixConnector && typeof (mixer as any).getInputs === 'function') {
      try {
        const inputs = await (mixer as any).getInputs();
        res.json({ inputs });
        return;
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }
    res.status(400).json({ error: 'Mixer does not support input listing' });
  }) as RequestHandler);
}

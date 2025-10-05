import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import { TallyHub } from './core/TallyHub';
import { WebSocketManager } from './core/WebSocketManager';
import { logger } from './core/logger';

// Global error handlers to prevent crashes from unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Promise Rejection:', reason);
  console.error('🚨 Promise:', promise);
  // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  // Exit gracefully on uncaught exceptions
  process.exit(1);
});
import { UDPServer } from './core/UDPServer';

const execAsync = promisify(exec);


// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

class TallyHubServer {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer;
  private tallyHub: TallyHub;
  private wsManager: WebSocketManager;
  private udpServer: UDPServer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    this.setupMiddleware();
    this.setupStaticFiles();
    
    // Initialize core components in correct order
    this.tallyHub = new TallyHub();
    this.wsManager = new WebSocketManager(this.wss, this.tallyHub);
    this.udpServer = new UDPServer(this.tallyHub);
    
    // Set the references after creation
    this.tallyHub.setManagers(this.wsManager, this.udpServer);
    
    this.setupRoutes();
    // Note: initializeServices() moved to start() method to happen after port cleanup
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupStaticFiles(): void {
    // Serve static files from public directory
    const publicPath = path.join(process.cwd(), 'public');
    this.app.use(express.static(publicPath));
  logger.info(`Static directory: ${publicPath}`);
  }

  private setupRoutes(): void {
    // API Routes
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'running',
        timestamp: new Date(),
        tallies: this.tallyHub.getTallies(),
        devices: this.tallyHub.getDevices(),
        mixers: this.tallyHub.getMixerConnections()
      });
    });

    this.app.get('/api/tallies', (req, res) => {
      res.json(this.tallyHub.getTallies());
    });

    this.app.get('/api/devices', (req, res) => {
      res.json(this.tallyHub.getDevices());
    });

    this.app.get('/api/mixers', (req, res) => {
      res.json(this.tallyHub.getMixerConnections());
    });

    // Dynamic mixer management endpoints
    this.app.post('/api/mixers', express.json(), (req, res) => {
      try {
        const { name, type, host, port, password } = req.body;
        
        if (!name || !type || !host || !port) {
          res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: name, type, host, port' 
          });
          return;
        }

        const mixerId = `${type.toLowerCase()}-${Date.now()}`;
        const mixerConfig = {
          id: mixerId,
          name,
          type: type.toLowerCase() as 'obs' | 'vmix',
          host,
          port: parseInt(port),
          connected: false
        };

  logger.info(`Adding mixer: ${name} (${type})`);
        const success = this.tallyHub.addMixerConnection(mixerId, mixerConfig, password);
        
        if (success) {
          res.json({ 
            success: true, 
            mixer: mixerConfig,
            message: `Mixer ${name} added successfully` 
          });
        } else {
          res.status(500).json({ 
            success: false, 
            error: 'Failed to add mixer' 
          });
        }
      } catch (error) {
        console.error('[ERROR]', error instanceof Error ? error.message : error);
        res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to add mixer' 
        });
      }
    });

    this.app.delete('/api/mixers/:id', (req, res) => {
      try {
        const { id } = req.params;
        const success = this.tallyHub.removeMixerConnection(id);
        
        if (success) {
          res.json({ 
            success: true, 
            message: `Mixer ${id} removed successfully` 
          });
        } else {
          res.status(404).json({ 
            success: false, 
            error: 'Mixer not found' 
          });
        }
      } catch (error) {
        console.error('[ERROR]', error instanceof Error ? error.message : error);
        res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to remove mixer' 
        });
      }
    });

    this.app.post('/api/mixers/:id/test', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await this.tallyHub.testMixerConnection(id);
        res.json({ 
          success: result.success, 
          result,
          message: result.message 
        });
      } catch (error) {
        console.error('[ERROR]', error instanceof Error ? error.message : error);
        res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Connection test failed' 
        });
      }
    });

    // Device assignment endpoints
    this.app.get('/api/devices/:deviceId/assignment', (req: any, res: any) => {
      try {
        const { deviceId } = req.params;
        const assignments = this.tallyHub.getDeviceAssignments();
        const assignment = assignments.find(a => a.deviceId === deviceId);
        
        if (!assignment) {
          return res.json({ assignmentMode: 'auto' });
        }
        
        res.json({
          assignmentMode: 'assigned',
          assignment
        });
      } catch (error) {
        console.error('❌ Error getting device assignment:', error);
        res.status(500).json({ error: 'Failed to get device assignment' });
      }
    });

    this.app.post('/api/devices/:deviceId/assign', express.json(), (req: any, res: any) => {
      try {
        const { deviceId } = req.params;
        const { sourceId, assignedBy = 'admin' } = req.body;
        
  logger.debug(`Assignment request deviceId=${deviceId} sourceId='${sourceId}' type=${typeof sourceId}`);
        
        // If sourceId is explicitly empty string, unassign the device
        if (sourceId === '') {
          logger.info(`Unassign device ${deviceId}`);
          const success = this.tallyHub.unassignDevice(deviceId);
          
          if (success) {
            res.json({ 
              success: true, 
              message: `Device ${deviceId} unassigned` 
            });
          } else {
            res.status(400).json({ 
              success: false, 
              error: 'Failed to unassign device' 
            });
          }
          return;
        }
        
        // If sourceId is missing, undefined, or null, return error
        if (sourceId === undefined || sourceId === null) {
          logger.warn(`Assignment missing sourceId for device ${deviceId}`);
          return res.status(400).json({ error: 'sourceId is required' });
        }
        
  logger.info(`Assign device ${deviceId} -> source ${sourceId}`);
        const success = this.tallyHub.assignSourceToDevice(deviceId, sourceId, assignedBy);
        
        if (success) {
          res.json({ 
            success: true, 
            message: `Device assigned to source: ${sourceId}` 
          });
        } else {
          res.status(400).json({ 
            success: false, 
            error: 'Failed to assign device' 
          });
        }
      } catch (error) {
        console.error('❌ Error assigning device:', error);
        res.status(500).json({ error: 'Failed to assign device' });
      }
    });

    this.app.delete('/api/devices/:deviceId/assign', (req: any, res: any) => {
      try {
        const { deviceId } = req.params;
        const success = this.tallyHub.unassignDevice(deviceId);
        
        if (success) {
          res.json({ 
            success: true, 
            message: 'Device set to auto mode' 
          });
        } else {
          res.status(400).json({ 
            success: false, 
            error: 'Device not found' 
          });
        }
      } catch (error) {
        console.error('❌ Error unassigning device:', error);
        res.status(500).json({ error: 'Failed to unassign device' });
      }
    });

    this.app.get('/api/assignments', (req: any, res: any) => {
      try {
        const assignments = this.tallyHub.getDeviceAssignments();
        res.json(assignments);
      } catch (error) {
        console.error('❌ Error getting assignments:', error);
        res.status(500).json({ error: 'Failed to get assignments' });
      }
    });

    // Web Interface Routes
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'public/index.html'));
    });

    this.app.get('/tally', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'public/tally.html'));
    });

    this.app.get('/admin', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'public/admin.html'));
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date() });
    });

    // (Removed /api/test/status for production build)

    // Save mixer configurations endpoint
    this.app.post('/api/mixers/save', (req, res) => {
      try {
        this.tallyHub.saveConfigurations();
        res.json({ 
          success: true, 
          message: 'Mixer configurations saved successfully' 
        });
      } catch (error) {
        console.error('[ERROR]', error instanceof Error ? error.message : error);
        res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to save configurations' 
        });
      }
    });

    // Server shutdown endpoint
    this.app.post('/api/shutdown', async (req, res) => {
      try {
  logger.warn('Shutdown request received');
        
        // Send response first before shutting down
        res.json({ 
          success: true, 
          message: 'Server shutdown initiated' 
        });
        
        // Give a moment for the response to be sent
        setTimeout(() => {
          // Wrap async operation to prevent unhandled rejections
          (async () => {
            try {
              console.log('🛑 Initiating graceful shutdown...');
              await this.stop();
              console.log('🛑 Server shutdown complete');
              process.exit(0);
            } catch (error) {
              console.error('🚨 Error during graceful shutdown:', error);
              process.exit(1);
            }
          })().catch((error) => {
            console.error('🚨 Unhandled error in shutdown process:', error);
            process.exit(1);
          });
        }, 1000);
        
      } catch (error) {
        console.error('[ERROR] Shutdown failed:', error instanceof Error ? error.message : error);
        res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to shutdown server' 
        });
      }
    });
  }

  private async killProcessOnPort(port: number): Promise<void> {
    try {
  logger.debug(`Checking for processes on port ${port}...`);
      
      // Find process using the port on macOS/Linux
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      
      if (stdout.trim()) {
        const pids = stdout.trim().split('\n');
  logger.warn(`Found ${pids.length} process(es) using port ${port}: ${pids.join(', ')}`);
        
        for (const pid of pids) {
          try {
            await execAsync(`kill -9 ${pid.trim()}`);
            logger.warn(`Killed process ${pid.trim()}`);
          } catch (error) {
            logger.debug(`Process ${pid.trim()} may have already exited`);
          }
        }
        
        // Wait a moment for processes to fully terminate
        await new Promise(resolve => setTimeout(resolve, 1000));
  logger.info(`Port ${port} is now available`);
      } else {
  logger.debug(`Port ${port} is available`);
      }
    } catch (error) {
      // If lsof fails, the port is likely available or we're on Windows
      if ((error as any).code === 1) {
  logger.debug(`Port ${port} is available`);
      } else {
  logger.warn(`Could not check port ${port}: ${(error as Error).message}`);
  logger.info('Attempting to start server anyway...');
      }
    }
  }

  private async initializeServices(): Promise<void> {
    try {
      // Initialize UDP server for M5 stick communication
      await this.udpServer.start();
      
      // Start WebSocket manager
      this.wsManager.start();
      
      // Initialize tally hub (will connect to mixers)
      await this.tallyHub.initialize();
      
      console.log('✅ All services initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize services:', error);
    }
  }

  public async start(): Promise<void> {
    // Clean up any existing processes on the ports
    const UDP_PORT = parseInt(process.env.UDP_PORT || '7411');
    
    await this.killProcessOnPort(Number(PORT));
    await this.killProcessOnPort(UDP_PORT);
    
    return new Promise((resolve) => {
      this.server.listen(PORT, HOST, () => {
        console.log(`🚀 Tally Hub server running on http://${HOST}:${PORT}`);
        console.log(`📱 Web tally interface: http://${HOST}:${PORT}/tally`);
        console.log(`⚙️  Admin interface: http://${HOST}:${PORT}/admin`);
        
        // Wrap async operation to prevent unhandled rejections
        (async () => {
          try {
            // Initialize services after port cleanup and server start
            await this.initializeServices();
            resolve();
          } catch (error) {
            console.error('🚨 Error during service initialization:', error);
            resolve(); // Still resolve to prevent hanging
          }
        })().catch((error) => {
          console.error('🚨 Unhandled error in service initialization:', error);
          resolve(); // Still resolve to prevent hanging
        });
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.udpServer) {
      await this.udpServer.stop();
    }
    if (this.tallyHub) {
      await this.tallyHub.shutdown();
    }
    if (this.server) {
      this.server.close();
    }
  }
}

// Start the server
const server = new TallyHubServer();
server.start().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  (async () => {
    try {
      await server.stop();
      process.exit(0);
    } catch (error) {
      console.error('🚨 Error during SIGINT shutdown:', error);
      process.exit(1);
    }
  })().catch((error) => {
    console.error('🚨 Unhandled error in SIGINT handler:', error);
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  (async () => {
    try {
      await server.stop();
      process.exit(0);
    } catch (error) {
      console.error('🚨 Error during SIGTERM shutdown:', error);
      process.exit(1);
    }
  })().catch((error) => {
    console.error('🚨 Unhandled error in SIGTERM handler:', error);
    process.exit(1);
  });
});

export default server;

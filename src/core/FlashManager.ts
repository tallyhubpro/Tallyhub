import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger';

const execAsync = promisify(exec);

export interface FlashJob {
  id: string;
  port: string;
  firmwarePath: string; // absolute path
  chip: string;
  status: 'pending' | 'running' | 'success' | 'error';
  progress: number; // 0-100 (coarse; we approximate)
  startedAt?: Date;
  endedAt?: Date;
  error?: string;
  log: string[];
}

/**
 * FlashManager: minimal server-side wrapper using esptool.py (Python) for flashing.
 * Requires that 'esptool.py' is available in PATH (pip install esptool).
 */
export class FlashManager {
  private jobs: Map<string, FlashJob> = new Map();
  private baseFirmwareDir: string;

  constructor() {
    this.baseFirmwareDir = path.join(process.cwd(), 'public', 'firmware');
  }

  listJobs(): FlashJob[] {
    return Array.from(this.jobs.values()).sort((a,b) => (b.startedAt?.getTime()||0) - (a.startedAt?.getTime()||0));
  }

  getJob(id: string): FlashJob | undefined {
    return this.jobs.get(id);
  }

  async listFirmwareFiles(): Promise<string[]> {
    const results: string[] = [];
    const walk = (dir: string, prefix='') => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(prefix, entry.name);
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, rel); else if (entry.name.endsWith('.bin')) results.push(rel);
      }
    };
    if (fs.existsSync(this.baseFirmwareDir)) walk(this.baseFirmwareDir);
    return results;
  }

  async detectPorts(): Promise<string[]> {
    // Basic heuristic: list /dev/ttyUSB* and /dev/ttyACM*, filter existing.
    const candidates = [
      ...globLike('/dev', /^ttyUSB\d+$/),
      ...globLike('/dev', /^ttyACM\d+$/)
    ];
    return candidates;
  }

  createJob(params: { port: string; firmwareRel: string; chip?: string; }): FlashJob {
    const id = `flash-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const firmwarePath = path.join(this.baseFirmwareDir, params.firmwareRel);
    if (!fs.existsSync(firmwarePath)) {
      throw new Error('Firmware not found: ' + params.firmwareRel);
    }
    const job: FlashJob = {
      id,
      port: params.port,
      firmwarePath,
      chip: params.chip || 'esp32',
      status: 'pending',
      progress: 0,
      log: []
    };
    this.jobs.set(id, job);
    this.runJob(job).catch(err => {
      logger.error('Flash job failed', err);
    });
    return job;
  }

  private append(job: FlashJob, line: string) {
    job.log.push(line);
    if (job.log.length > 500) job.log.shift();
  }

  private async runJob(job: FlashJob) {
    job.status = 'running';
    job.startedAt = new Date();
    this.append(job, `Starting flash on ${job.port}`);

    // Build esptool command
    // We assume single binary at 0x0 for now.
    const cmd = `esptool.py --chip ${job.chip} --port ${job.port} --baud 460800 write_flash -z 0x0 ${job.firmwarePath}`;
    this.append(job, 'Command: ' + cmd);

    try {
      // Spawn and capture output incrementally would be better; for simplicity use exec here.
      const { stdout, stderr } = await execAsync(cmd, { timeout: 5 * 60 * 1000 });
      if (stdout) this.append(job, stdout);
      if (stderr) this.append(job, stderr);
      job.progress = 100;
      job.status = 'success';
      job.endedAt = new Date();
      this.append(job, 'Flash complete');
    } catch (error: any) {
      job.status = 'error';
      job.endedAt = new Date();
      job.error = error?.message || String(error);
      this.append(job, 'Error: ' + job.error);
    }
  }
}

function globLike(dir: string, pattern: RegExp): string[] {
  try {
    return fs.readdirSync(dir)
      .filter(f => pattern.test(f))
      .map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

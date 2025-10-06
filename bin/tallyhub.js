#!/usr/bin/env node
/**
 * TallyHub CLI launcher
 */
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

function log(msg){ process.stdout.write(`[tallyhub] ${msg}\n`); }
function error(msg){ process.stderr.write(`[tallyhub:error] ${msg}\n`); }

const root = process.cwd();
const distEntry = join(root, 'dist', 'index.js');

if (!existsSync(distEntry)) {
  log('dist/index.js not found. Building...');
  const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
  if (r.status !== 0) {
    error('Build failed. Cannot start server.');
    process.exit(r.status || 1);
  }
}

const env = { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' };
log('Starting Tally Hub server...');
const child = spawnSync('node', [distEntry], { stdio: 'inherit', env });
process.exit(child.status ?? 0);

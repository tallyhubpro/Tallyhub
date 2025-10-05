#!/usr/bin/env node
/**
 * Prune log files older than a threshold (default: 14 days) in ./logs
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'logs');
const DAYS = parseInt(process.env.PRUNE_DAYS || '14', 10);
const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;

if (!fs.existsSync(LOG_DIR)) {
  console.log(`[logs] directory not found, nothing to prune.`);
  process.exit(0);
}

const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log'));
let removed = 0;
for (const file of files) {
  const full = path.join(LOG_DIR, file);
  try {
    const stat = fs.statSync(full);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(full);
      removed++;
      console.log(`🧹 Removed old log: ${file}`);
    }
  } catch (e) {
    console.warn(`⚠️ Could not inspect/remove ${file}:`, e.message);
  }
}
console.log(`Done. Removed ${removed} old log file(s). Retained ${files.length - removed}.`);

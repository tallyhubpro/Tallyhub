#!/usr/bin/env node
/**
 * Postinstall sanity check: ensure dist build artifacts exist.
 * Non-fatal: exits 0 after warning so install doesn't fail.
 */
const fs = require('fs');
const path = require('path');

const distIndex = path.join(process.cwd(), 'dist', 'index.js');
if (!fs.existsSync(distIndex)) {
  console.warn('[tallyhub] Warning: dist/index.js not found after install.');
  console.warn('[tallyhub] If installing from GitHub, the prepare script should have built it.');
  console.warn('[tallyhub] Run: npm run build');
} else {
  console.log('[tallyhub] Postinstall check OK.');
}

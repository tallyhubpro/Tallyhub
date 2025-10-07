#!/usr/bin/env node
// Firmware Manifest Generator
// Scans public/firmware/*/<device>/firmware-merged.bin, computes SHA256 + size, writes firmware-manifest.json.
// Usage: node scripts/generate-firmware-manifest.js --version 2025.10.07 --release v2025.10.07
// Flags: --version <ver> --release <tag> [--base-url <url>] [--dry-run] [--pretty] [--local-path]

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--version') opts.version = args[++i];
    else if (a === '--release') opts.release = args[++i];
    else if (a === '--base-url') opts.baseUrl = args[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--pretty') opts.pretty = true;
    else if (a === '--local-path') opts.localPath = true;
    else if (a === '--help' || a === '-h') {
      console.log('See script header for usage.');
      process.exit(0);
    } else {
      console.error('Unknown arg:', a);
      process.exit(1);
    }
  }
  if (!opts.version) {
    console.error('--version is required');
    process.exit(1);
  }
  if (!opts.release && !opts.localPath) {
    console.error('--release is required unless --local-path is used');
    process.exit(1);
  }
  return opts;
}

function readPackageRepo() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    if (pkg.repository && typeof pkg.repository === 'object' && pkg.repository.url) {
      const match = pkg.repository.url.match(/github.com[/:]([^/]+)\/([^/.]+)(.git)?/);
      if (match) return { owner: match[1], repo: match[2] };
    }
  } catch (e) { /* ignore */ }
  return null;
}

function hashFile(file) {
  const buf = fs.readFileSync(file);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  return { sha256: sha, size: buf.length };
}

function main() {
  const opts = parseArgs();
  const firmwareRoot = path.join(process.cwd(), 'public', 'firmware');
  const devices = {};

  if (!fs.existsSync(firmwareRoot)) {
    console.error('Firmware directory not found:', firmwareRoot);
    process.exit(1);
  }

  const repoInfo = readPackageRepo();
  const baseRelease = opts.baseUrl || (repoInfo && !opts.localPath
    ? `https://github.com/${repoInfo.owner}/${repoInfo.repo}/releases/download/${opts.release}`
    : null);

  const entries = fs.readdirSync(firmwareRoot, { withFileTypes: true })
    .filter(d => d.isDirectory());

  if (entries.length === 0) {
    console.error('No device directories found in public/firmware');
    process.exit(1);
  }

  for (const dirent of entries) {
    const device = dirent.name;
    const deviceDir = path.join(firmwareRoot, device);
    const binName = 'firmware-merged.bin';
    const binPath = path.join(deviceDir, binName);
    if (!fs.existsSync(binPath)) {
      console.warn(`[skip] ${device} missing ${binName}`);
      continue;
    }
    const { sha256, size } = hashFile(binPath);
    const url = opts.localPath
      ? `/firmware/${device}/${binName}`
      : `${baseRelease}/${device}.bin`; // expects release asset named <device>.bin

    devices[device] = {
      version: opts.version,
      url,
      sha256,
      size
    };
  }

  if (Object.keys(devices).length === 0) {
    console.error('No firmware binaries processed.');
    process.exit(1);
  }

  const manifest = {
    schema: 1,
    generated: new Date().toISOString(),
    latest: opts.version,
    devices
  };

  const json = opts.pretty ? JSON.stringify(manifest, null, 2) : JSON.stringify(manifest);

  if (opts.dryRun) {
    console.log(json);
  } else {
    const outPath = path.join(firmwareRoot, 'firmware-manifest.json');
    fs.writeFileSync(outPath, json + '\n');
    console.log('Wrote manifest:', outPath);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('Failed:', e);
    process.exit(1);
  }
}

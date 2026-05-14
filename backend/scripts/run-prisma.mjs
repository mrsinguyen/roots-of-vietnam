#!/usr/bin/env node
// Loads the repo-root `.env` (the single source of truth used by both the
// backend and the Vite frontend), then forwards every argv argument to the
// Prisma CLI. This bridges the gap between Prisma's "schema-directory `.env`"
// auto-discovery and our shared root `.env`.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, '../../.env');

if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

const child = spawn('prisma', process.argv.slice(2), {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});
child.on('close', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('Failed to spawn prisma:', err);
  process.exit(1);
});

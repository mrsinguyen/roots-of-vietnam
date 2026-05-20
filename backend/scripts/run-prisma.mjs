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

// Pick the right schema based on DB_PROVIDER. Default sqlite preserves
// existing behavior; postgresql swaps to the mirrored schema in prisma/postgres/.
// If the caller already passed --schema=..., don't override it.
const provider = (process.env.DB_PROVIDER ?? 'sqlite').toLowerCase();
if (provider !== 'sqlite' && provider !== 'postgresql') {
  console.error(`Unsupported DB_PROVIDER=${provider}. Use 'sqlite' or 'postgresql'.`);
  process.exit(1);
}
const defaultSchema =
  provider === 'postgresql' ? 'prisma/postgres/schema.prisma' : 'prisma/schema.prisma';

const cliArgs = process.argv.slice(2);
const hasSchemaArg = cliArgs.some((a) => a === '--schema' || a.startsWith('--schema='));
const finalArgs = hasSchemaArg ? cliArgs : [...cliArgs, `--schema=${defaultSchema}`];

const child = spawn('prisma', finalArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});
child.on('close', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('Failed to spawn prisma:', err);
  process.exit(1);
});

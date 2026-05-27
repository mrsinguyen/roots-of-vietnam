// Boots `wrangler pages dev` (the real Workers runtime) against a per-run,
// isolated local D1/KV/R2 (--persist-to a fresh tmp dir), migrated + seeded with
// the demo family + admin/changeme. Playwright specs import `setupServers()`,
// await it, then `teardownServers()` in afterAll. The full stack (UI + /api +
// /uploads) is served on one port, so backendPort === frontendPort.

import { spawn, type ChildProcess, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TMP_ROOT = path.resolve(REPO_ROOT, 'tmp');
const MIGRATION = path.resolve(REPO_ROOT, 'prisma/migrations/0001_init.sql');
const PORT = 8799;

export interface E2EHandles {
  server: ChildProcess;
  persistDir: string;
  backendPort: number;
  frontendPort: number;
}

let built = false;

async function waitFor(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function d1Exec(persistDir: string, file: string): void {
  execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'roots-of-vietnam', '--local', `--persist-to=${persistDir}`, `--file=${file}`],
    { cwd: REPO_ROOT, stdio: 'ignore' },
  );
}

export async function setupServers(): Promise<E2EHandles> {
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  // Build once per run: regenerate the D1 client + the static bundle pages dev serves.
  if (!built) {
    execFileSync('pnpm', ['cf:build'], { cwd: REPO_ROOT, stdio: 'ignore' });
    built = true;
  }

  const persistDir = path.join(TMP_ROOT, `e2e-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(persistDir, { recursive: true });

  // Fresh local D1: schema, then admin + demo family (admin/changeme).
  d1Exec(persistDir, MIGRATION);
  const seedSql = path.join(persistDir, 'seed.sql');
  const sql = execFileSync('node', ['prisma/seed.mjs'], {
    cwd: REPO_ROOT,
    env: { ...process.env, ADMIN_USER: 'admin', ADMIN_PASS: 'changeme' },
  });
  fs.writeFileSync(seedSql, sql);
  d1Exec(persistDir, seedSql);

  // NODE_ENV=test keeps the auth cookie non-Secure so it survives over http.
  const server = spawn(
    'pnpm',
    [
      'exec', 'wrangler', 'pages', 'dev',
      '--port', String(PORT),
      `--persist-to=${persistDir}`,
      '--binding', 'JWT_SECRET=e2e-secret-at-least-16-chars',
      '--binding', 'NODE_ENV=test',
    ],
    { cwd: REPO_ROOT, stdio: 'ignore', env: process.env },
  );

  await waitFor(`http://localhost:${PORT}/api/health`);
  return { server, persistDir, backendPort: PORT, frontendPort: PORT };
}

export async function teardownServers(h: E2EHandles): Promise<void> {
  h.server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  try {
    fs.rmSync(h.persistDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

// Boots a backend + frontend-preview pair against a per-suite SQLite file.
// Playwright specs import `setupServers()` from here, await its return, then
// teardown in afterAll.

import { spawn, type ChildProcess, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TMP_ROOT = path.resolve(REPO_ROOT, 'tmp');
const SCHEMA = path.resolve(REPO_ROOT, 'backend/prisma/schema.prisma');

export interface E2EHandles {
  backend: ChildProcess;
  frontend: ChildProcess;
  dbPath: string;
  backendPort: number;
  frontendPort: number;
}

let cachedFrontendBuild = false;

async function waitFor(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export async function setupServers(opts: { seed?: boolean } = {}): Promise<E2EHandles> {
  if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });
  const id = crypto.randomBytes(6).toString('hex');
  const dbPath = path.join(TMP_ROOT, `e2e-${id}.db`);
  const databaseUrl = `file:${dbPath}`;
  const backendPort = 13001;
  const frontendPort = 14173;

  // Migrate fresh DB
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', `--schema=${SCHEMA}`], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    cwd: REPO_ROOT,
    stdio: 'ignore',
  });
  if (opts.seed) {
    execFileSync('pnpm', ['--filter', 'backend', 'exec', 'tsx', 'prisma/seed.ts'], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
  }

  // Ensure the production bundle exists at least once per test run.
  if (!cachedFrontendBuild) {
    execFileSync('pnpm', ['--filter', 'frontend', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    cachedFrontendBuild = true;
  }

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PORT: String(backendPort),
    JWT_SECRET: 'test-secret-please-change-but-long-enough',
    NODE_ENV: 'development',
    UPLOAD_DIR: path.join(TMP_ROOT, `e2e-${id}-uploads`),
    BACKUP_DIR: path.join(TMP_ROOT, `e2e-${id}-backups`),
    CORS_ORIGIN: `http://localhost:${frontendPort}`,
  };
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(env.BACKUP_DIR, { recursive: true });

  const backend = spawn('pnpm', ['--filter', 'backend', 'dev'], {
    cwd: REPO_ROOT,
    env,
    stdio: 'ignore',
  });
  const frontend = spawn(
    'pnpm',
    ['--filter', 'frontend', 'exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(frontendPort)],
    {
      cwd: REPO_ROOT,
      env: { ...env, VITE_PROXY_TARGET: `http://localhost:${backendPort}` },
      stdio: 'ignore',
    },
  );

  await waitFor(`http://localhost:${backendPort}/api/health`);
  await waitFor(`http://localhost:${frontendPort}/`);

  return { backend, frontend, dbPath, backendPort, frontendPort };
}

export async function teardownServers(h: E2EHandles): Promise<void> {
  for (const p of [h.backend, h.frontend]) {
    p.kill('SIGTERM');
  }
  await new Promise((r) => setTimeout(r, 200));
  for (const f of [h.dbPath, `${h.dbPath}-journal`]) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch {
        // best-effort
      }
    }
  }
}

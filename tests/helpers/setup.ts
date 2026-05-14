// Global setup for vitest. Runs per test file (one fork per file).
// - Picks a unique SQLite path and migrates it before any backend module
//   is imported, so the Prisma singleton binds to a clean DB.
// - Loads jest-dom matchers for the component layer.
// - Sets a deterministic JWT secret + minimal env so importing backend modules
//   doesn't blow up on startup-time zod validation.

import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// jsdom doesn't ship ResizeObserver; pages that observe their container
// (TreePage) crash without it. A no-op stub is enough for component tests.
if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

const REPO_ROOT = path.resolve(__dirname, '../..');
const TMP_ROOT = path.resolve(REPO_ROOT, 'tmp');
const SCHEMA = path.resolve(REPO_ROOT, 'backend/prisma/schema.prisma');

if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });

const dbId = crypto.randomBytes(6).toString('hex');
const dbPath = path.join(TMP_ROOT, `test-${dbId}.db`);
const databaseUrl = `file:${dbPath}`;

process.env.JWT_SECRET ??= 'test-secret-please-change-but-long-enough';
process.env.JWT_EXPIRES_IN ??= '1h';
process.env.NODE_ENV ??= 'test';
process.env.CORS_ORIGIN ??= 'http://localhost:5173';
process.env.UPLOAD_DIR ??= './tmp/test-uploads';
process.env.BACKUP_DIR ??= './tmp/test-backups';
process.env.PORT ??= '0';
process.env.DATABASE_URL = databaseUrl;
// Exposed so tests can clean up.
(globalThis as Record<string, unknown>).__TEST_DB_PATH__ = dbPath;

try {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', `--schema=${SCHEMA}`], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    cwd: REPO_ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
} catch (err) {
  console.error('Failed to migrate test DB', err);
  throw err;
}

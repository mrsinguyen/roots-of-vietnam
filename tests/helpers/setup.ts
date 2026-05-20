// Global setup for vitest. Runs per test file (one fork per file).
// - Picks a fresh, isolated database per fork and migrates it before any
//   backend module is imported, so the Prisma singleton binds to a clean DB.
// - Supports two providers selected by DB_PROVIDER (sqlite | postgresql).
//   sqlite  → unique tmp/test-<hex>.db file.
//   postgresql → unique `test_<hex>` schema inside the URL's database. The
//   base postgres URL must come from DATABASE_URL (or TEST_DATABASE_URL).
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
const SQLITE_SCHEMA = path.resolve(REPO_ROOT, 'backend/prisma/schema.prisma');
const POSTGRES_SCHEMA = path.resolve(REPO_ROOT, 'backend/prisma/postgres/schema.prisma');

if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });

process.env.JWT_SECRET ??= 'test-secret-please-change-but-long-enough';
process.env.JWT_EXPIRES_IN ??= '1h';
process.env.NODE_ENV ??= 'test';
process.env.CORS_ORIGIN ??= 'http://localhost:5173';
process.env.UPLOAD_DIR ??= './tmp/test-uploads';
process.env.BACKUP_DIR ??= './tmp/test-backups';
process.env.PORT ??= '0';

const dbId = crypto.randomBytes(6).toString('hex');
const provider = (process.env.DB_PROVIDER ?? 'sqlite').toLowerCase();

// Strip any credentials from a postgres URL before it lands in an error
// message or a global — tests run in CI and error output is regularly
// pasted into bug reports.
function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.username || u.password) {
      u.username = u.username ? '***' : '';
      u.password = '';
    }
    return u.toString();
  } catch {
    return '<unparseable url>';
  }
}

if (provider === 'postgresql') {
  const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseUrl || !baseUrl.startsWith('postgres')) {
    throw new Error(
      'DB_PROVIDER=postgresql but DATABASE_URL (or TEST_DATABASE_URL) is not a postgres URL. ' +
        'Set DATABASE_URL=postgresql://user@host:5432/dbname or unset DB_PROVIDER to use sqlite.',
    );
  }
  const url = new URL(baseUrl);
  const schemaName = `test_${dbId}`;
  // Defense in depth: dbId is hex from randomBytes so this must hold. If a
  // refactor ever sources the suffix elsewhere, this assert catches injection
  // before it lands inside a `CREATE SCHEMA "..."` statement.
  if (!/^test_[a-f0-9]+$/.test(schemaName)) {
    throw new Error(`Refusing unsafe test schema name: ${schemaName}`);
  }
  url.searchParams.set('schema', schemaName);
  const testUrl = url.toString();

  // Create the per-fork schema via psql on the base URL (no ?schema).
  const adminUrl = new URL(baseUrl);
  adminUrl.searchParams.delete('schema');
  try {
    execFileSync(
      'psql',
      [adminUrl.toString(), '-v', 'ON_ERROR_STOP=1', '-c', `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (err) {
    throw new Error(
      `Failed to create postgres schema "${schemaName}" via psql. ` +
        `Is postgres running and is ${redactUrl(adminUrl.toString())} reachable? ` +
        `Original error: ${(err as Error).message}`,
    );
  }

  process.env.DATABASE_URL = testUrl;
  (globalThis as Record<string, unknown>).__TEST_DB_PROVIDER__ = 'postgresql';
  (globalThis as Record<string, unknown>).__TEST_DB_SCHEMA__ = schemaName;

  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', `--schema=${POSTGRES_SCHEMA}`], {
      env: { ...process.env, DATABASE_URL: testUrl },
      cwd: REPO_ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  } catch (err) {
    // Prisma may echo the URL on connection failure; we don't have it in
    // the error chain here, just re-raise with the schema name.
    throw new Error(`Failed to migrate test postgres schema ${schemaName}: ${(err as Error).message}`);
  }
} else {
  const dbPath = path.join(TMP_ROOT, `test-${dbId}.db`);
  const databaseUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = databaseUrl;
  (globalThis as Record<string, unknown>).__TEST_DB_PROVIDER__ = 'sqlite';
  (globalThis as Record<string, unknown>).__TEST_DB_PATH__ = dbPath;

  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', `--schema=${SQLITE_SCHEMA}`], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      cwd: REPO_ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  } catch (err) {
    console.error('Failed to migrate test DB', err);
    throw err;
  }
}

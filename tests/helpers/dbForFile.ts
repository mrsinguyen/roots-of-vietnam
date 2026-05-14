// Sets up a per-test-file SQLite DB and binds DATABASE_URL **before** any
// backend module is imported. Integration test files import this *first* and
// call `await prepareDb()` at the top of the file (or inside `beforeAll`).
//
// We can't use `tests/helpers/db.ts` directly because the integration tests
// share the Prisma singleton across the whole file — by the time their
// `beforeEach` runs, the client is already pinned to whatever URL was in env
// when `routes/*.ts` was first imported. So this helper has to win the race.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TMP_ROOT = path.resolve(REPO_ROOT, 'tmp');
const SCHEMA = path.resolve(REPO_ROOT, 'backend/prisma/schema.prisma');

if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });

let migrated = false;

export function prepareDb(): { dbPath: string; databaseUrl: string } {
  const id = crypto.randomBytes(6).toString('hex');
  const dbPath = path.join(TMP_ROOT, `test-${id}.db`);
  const databaseUrl = `file:${dbPath}`;
  process.env.DATABASE_URL = databaseUrl;
  if (!migrated) {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', `--schema=${SCHEMA}`], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      cwd: REPO_ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    migrated = true;
  } else {
    // Each subsequent call in the same process still creates a brand-new file —
    // re-running deploy is cheap because the migrations are already-applied.
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', `--schema=${SCHEMA}`], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      cwd: REPO_ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  }
  return { dbPath, databaseUrl };
}

export function deleteDb(dbPath: string): void {
  for (const ext of ['', '-journal']) {
    const f = `${dbPath}${ext}`;
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch {
        // best-effort
      }
    }
  }
}

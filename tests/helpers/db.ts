// Per-test SQLite DB helper. Each call creates a fresh file under tmp/,
// applies all migrations, and returns a wired Prisma client. Tests must call
// `teardown()` (typically inside `afterEach`) to release the file lock and
// remove the artefact.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TMP_ROOT = path.resolve(REPO_ROOT, 'tmp');
const SCHEMA = path.resolve(REPO_ROOT, 'backend/prisma/schema.prisma');

if (!fs.existsSync(TMP_ROOT)) fs.mkdirSync(TMP_ROOT, { recursive: true });

export interface TestDb {
  dbPath: string;
  databaseUrl: string;
  prisma: import('@prisma/client').PrismaClient;
  teardown: () => Promise<void>;
}

function ensureMigrated(dbPath: string): void {
  const url = `file:${dbPath}`;
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy', `--schema=${SCHEMA}`], {
    env: { ...process.env, DATABASE_URL: url },
    cwd: REPO_ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

export async function createTestDb(): Promise<TestDb> {
  const id = crypto.randomBytes(6).toString('hex');
  const dbPath = path.join(TMP_ROOT, `test-${id}.db`);
  const databaseUrl = `file:${dbPath}`;
  ensureMigrated(dbPath);

  // Importing the singleton Prisma client would bind it to whatever URL was set
  // first. Construct a fresh client per test so we can run them concurrently
  // without cross-talk.
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  return {
    dbPath,
    databaseUrl,
    prisma,
    async teardown() {
      await prisma.$disconnect();
      for (const ext of ['', '-journal']) {
        const f = `${dbPath}${ext}`;
        if (fs.existsSync(f)) {
          try {
            fs.unlinkSync(f);
          } catch {
            // best-effort cleanup
          }
        }
      }
    },
  };
}

// Vitest globalSetup. Runs once in the main process around the whole suite.
// We use it solely to clean up postgres `test_*` schemas after the run so
// repeated local invocations don't leak schemas indefinitely. SQLite cleanup
// happens implicitly (tmp files are .gitignored and short-lived).

import { execFileSync } from 'node:child_process';

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

export async function setup(): Promise<void> {
  // intentionally empty — per-fork setup lives in tests/helpers/setup.ts
}

export async function teardown(): Promise<void> {
  const provider = (process.env.DB_PROVIDER ?? 'sqlite').toLowerCase();
  if (provider !== 'postgresql') return;

  const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseUrl || !baseUrl.startsWith('postgres')) return;

  const adminUrl = new URL(baseUrl);
  adminUrl.searchParams.delete('schema');

  // Server-side regex match guarantees we only ever drop `test_<hex>`
  // schemas the harness created; never anything an operator named.
  const dropSql = `
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name ~ '^test_[a-f0-9]+$'
      LOOP
        EXECUTE 'DROP SCHEMA IF EXISTS ' || quote_ident(r.schema_name) || ' CASCADE';
      END LOOP;
    END $$;
  `;

  try {
    execFileSync('psql', [adminUrl.toString(), '-v', 'ON_ERROR_STOP=1', '-c', dropSql], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (err) {
    // Cleanup is best-effort; surface but don't fail the suite. Redact the
    // URL so CI logs don't capture credentials embedded in the connection
    // string.
    console.warn(
      `[globalTeardown] failed to drop test_* schemas at ${redactUrl(adminUrl.toString())}:`,
      (err as Error).message,
    );
  }
}

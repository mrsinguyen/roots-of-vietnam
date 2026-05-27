import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getPlatformProxy } from 'wrangler';
import app from '../../../worker/app';
import { getPrisma } from '../../../worker/lib/prisma';
import { hashPassword } from '../../../worker/lib/auth';
import type { Env } from '../../../worker/types';
import type { PrismaClient } from '../../../prisma/generated';
import type { Role } from '@roots/shared';

const MIGRATION = path.resolve(__dirname, '../../../prisma/migrations/0001_init.sql');
const TEST_ENV = {
  JWT_SECRET: 'test-secret-at-least-16-chars-long',
  JWT_EXPIRES_IN: '7d',
  NODE_ENV: 'test',
};

function statements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ApiOptions {
  body?: unknown;
  cookie?: string | null;
  headers?: Record<string, string>;
}

export interface Harness {
  env: Env;
  ctx: ExecutionContext;
  prisma: PrismaClient;
  api(method: string, p: string, opts?: ApiOptions): Promise<Response>;
  loginAs(role: Role): Promise<string>;
  reset(): Promise<void>;
}

let cached: Promise<Harness> | null = null;

export function harness(): Promise<Harness> {
  if (cached) return cached;
  cached = (async () => {
    const proxy = await getPlatformProxy<Env>({
      configPath: path.resolve(__dirname, '../../../wrangler.test.toml'),
      persist: false,
    });
    const env = { ...(proxy.env as unknown as Env), ...TEST_ENV } as Env;
    const ctx = proxy.ctx as unknown as ExecutionContext;

    for (const stmt of statements(readFileSync(MIGRATION, 'utf8'))) {
      await env.DB.prepare(stmt).run();
    }
    const prisma = getPrisma(env);

    function cookieFrom(res: Response): string | null {
      const sc = res.headers.get('set-cookie');
      if (!sc) return null;
      const m = sc.match(/roots_token=([^;]*)/);
      return m ? `roots_token=${m[1]}` : null;
    }

    async function api(method: string, p: string, opts: ApiOptions = {}): Promise<Response> {
      const headers = new Headers(opts.headers ?? {});
      let body: BodyInit | undefined;
      if (opts.body instanceof FormData) {
        body = opts.body;
      } else if (opts.body !== undefined) {
        headers.set('content-type', 'application/json');
        body = JSON.stringify(opts.body);
      }
      if (opts.cookie) headers.set('cookie', opts.cookie);
      const req = new Request(`http://localhost${p}`, { method, headers, body });
      return app.fetch(req, env as unknown as Record<string, unknown>, ctx);
    }

    async function loginAs(role: Role): Promise<string> {
      const username = `t_${role}_${Math.random().toString(36).slice(2, 8)}`;
      const password = 'password-123';
      await prisma.user.create({
        data: { username, passwordHash: await hashPassword(password), role },
      });
      const res = await api('POST', '/api/auth/login', { body: { username, password } });
      const cookie = cookieFrom(res);
      if (!cookie) throw new Error(`loginAs(${role}) failed: ${res.status}`);
      return cookie;
    }

    async function reset(): Promise<void> {
      await prisma.media.deleteMany({});
      await prisma.marriage.deleteMany({});
      await prisma.auditLog.deleteMany({});
      await prisma.person.deleteMany({});
      await prisma.branch.deleteMany({});
      await prisma.user.deleteMany({});
      // Clear KV (rate-limit buckets + jwt denylist) so cases don't leak.
      const kv = await env.KV.list();
      await Promise.all(kv.keys.map((k) => env.KV.delete(k.name)));
      // Clear R2 (media + backups).
      const r2 = await env.MEDIA.list();
      await Promise.all(r2.objects.map((o) => env.MEDIA.delete(o.key)));
    }

    return { env, ctx, prisma, api, loginAs, reset };
  })();
  return cached;
}

export function cookieFrom(res: Response): string | null {
  const sc = res.headers.get('set-cookie');
  if (!sc) return null;
  const m = sc.match(/roots_token=([^;]*)/);
  return m ? `roots_token=${m[1]}` : null;
}

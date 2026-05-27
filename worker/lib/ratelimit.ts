import type { Env } from '../types';

// KV-backed sliding-window limiter for login attempts. KV is eventually
// consistent (~60s global), so the count is approximate and a determined
// attacker spreading across edge PoPs
// could exceed `max` briefly. Acceptable for login throttling on a family app;
// use Durable Objects if you need strict global counting. See docs/CLOUDFLARE.md.

const MIN_KV_TTL = 60;

interface Bucket {
  count: number;
  resetAt: number;
}

export interface CheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface CheckOptions {
  key: string;
  max: number;
  windowMs: number;
}

export async function check(env: Env, opts: CheckOptions): Promise<CheckResult> {
  const now = Date.now();
  const kvKey = `ratelimit:${opts.key}`;
  const ttl = Math.max(MIN_KV_TTL, Math.ceil(opts.windowMs / 1000));
  const raw = await env.KV.get(kvKey);
  const existing = raw ? (JSON.parse(raw) as Bucket) : null;

  if (!existing || existing.resetAt <= now) {
    await env.KV.put(kvKey, JSON.stringify({ count: 1, resetAt: now + opts.windowMs }), {
      expirationTtl: ttl,
    });
    return { allowed: true, remaining: opts.max - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= opts.max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  await env.KV.put(kvKey, JSON.stringify(existing), { expirationTtl: ttl });
  return {
    allowed: true,
    remaining: Math.max(0, opts.max - existing.count),
    retryAfterSeconds: 0,
  };
}

export async function reset(env: Env, key: string): Promise<void> {
  await env.KV.delete(`ratelimit:${key}`);
}

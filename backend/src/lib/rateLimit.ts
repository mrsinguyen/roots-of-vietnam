// In-memory IP rate limiter for login attempts. Process-local — sufficient for
// the single-node MVP. Window slides per (key, action).

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

interface CheckOptions {
  key: string;
  max: number;
  windowMs: number;
}

export interface CheckResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function check(opts: CheckOptions): CheckResult {
  const now = Date.now();
  const existing = buckets.get(opts.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
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
  return {
    allowed: true,
    remaining: Math.max(0, opts.max - existing.count),
    retryAfterSeconds: 0,
  };
}

export function reset(key: string): void {
  buckets.delete(key);
}

// Wipe every bucket. Intended for tests; never call from request handlers.
export function resetAll(): void {
  buckets.clear();
}

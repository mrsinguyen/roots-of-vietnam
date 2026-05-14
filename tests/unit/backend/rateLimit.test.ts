import { describe, it, expect, beforeEach } from 'vitest';
import { check, reset } from '../../../backend/src/lib/rateLimit';

describe('rateLimit.check', () => {
  beforeEach(() => {
    reset('test-key');
  });

  it('allows the first attempt and decrements remaining', () => {
    const r = check({ key: 'test-key', max: 3, windowMs: 1000 });
    expect(r).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 0 });
  });

  it('blocks once max is reached', () => {
    for (let i = 0; i < 3; i++) check({ key: 'test-key', max: 3, windowMs: 1000 });
    const r = check({ key: 'test-key', max: 3, windowMs: 1000 });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resets after the window expires', async () => {
    check({ key: 'test-key', max: 1, windowMs: 30 });
    expect(check({ key: 'test-key', max: 1, windowMs: 30 }).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(check({ key: 'test-key', max: 1, windowMs: 30 }).allowed).toBe(true);
  });

  it('reset() clears the bucket on demand', () => {
    check({ key: 'test-key', max: 1, windowMs: 10_000 });
    expect(check({ key: 'test-key', max: 1, windowMs: 10_000 }).allowed).toBe(false);
    reset('test-key');
    expect(check({ key: 'test-key', max: 1, windowMs: 10_000 }).allowed).toBe(true);
  });

  it('isolates buckets by key', () => {
    check({ key: 'a', max: 1, windowMs: 10_000 });
    check({ key: 'a', max: 1, windowMs: 10_000 });
    const aBlocked = check({ key: 'a', max: 1, windowMs: 10_000 });
    const bFresh = check({ key: 'b', max: 1, windowMs: 10_000 });
    expect(aBlocked.allowed).toBe(false);
    expect(bFresh.allowed).toBe(true);
    reset('a');
    reset('b');
  });
});

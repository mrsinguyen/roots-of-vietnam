import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { harness, cookieFrom, type Harness } from './helpers/app';
import { hashPassword } from '../../worker/lib/auth';

let h: Harness;
beforeAll(async () => {
  h = await harness();
});
afterEach(() => h.reset());

async function seedUser(username: string, password: string, role: 'admin' | 'editor' | 'viewer' = 'admin') {
  return h.prisma.user.create({ data: { username, passwordHash: await hashPassword(password), role } });
}

describe('POST /api/auth/login', () => {
  it('returns 200 + roots_token httpOnly cookie on correct credentials', async () => {
    await seedUser('alice', 'longenoughpw1');
    const res = await h.api('POST', '/api/auth/login', { body: { username: 'alice', password: 'longenoughpw1' } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { username: string; role: string } };
    expect(body.user.username).toBe('alice');
    expect(body.user.role).toBe('admin');
    const sc = res.headers.get('set-cookie') ?? '';
    expect(sc).toMatch(/roots_token=/);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
  });

  it('returns 401 for wrong password (Vietnamese error)', async () => {
    await seedUser('bob', 'longenoughpw1');
    const res = await h.api('POST', '/api/auth/login', { body: { username: 'bob', password: 'wrong-password' } });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Tên đăng nhập hoặc mật khẩu không đúng');
  });

  it('returns 401 when user does not exist', async () => {
    const res = await h.api('POST', '/api/auth/login', { body: { username: 'nobody', password: 'whatever123' } });
    expect(res.status).toBe(401);
  });

  it('returns 400 on malformed body', async () => {
    const res = await h.api('POST', '/api/auth/login', { body: { username: '' } });
    expect(res.status).toBe(400);
  });

  it('rate-limits after 5 wrong attempts within the window', async () => {
    for (let i = 0; i < 5; i++) {
      await h.api('POST', '/api/auth/login', { body: { username: 'ghost', password: 'wrong' } });
    }
    const sixth = await h.api('POST', '/api/auth/login', { body: { username: 'ghost', password: 'wrong' } });
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).error).toContain('Quá nhiều');
    expect(sixth.headers.get('retry-after')).toBeDefined();
  });

  it('successful login resets the rate-limit bucket', async () => {
    await seedUser('eve', 'longenoughpw1');
    for (let i = 0; i < 4; i++) {
      await h.api('POST', '/api/auth/login', { body: { username: 'eve', password: 'wrong' } });
    }
    const ok = await h.api('POST', '/api/auth/login', { body: { username: 'eve', password: 'longenoughpw1' } });
    expect(ok.status).toBe(200);
    const again = await h.api('POST', '/api/auth/login', { body: { username: 'eve', password: 'longenoughpw1' } });
    expect(again.status).toBe(200);
  });

  it('writes auth.login.success + auth.login.failure to AuditLog', async () => {
    await seedUser('logger', 'longenoughpw1');
    await h.api('POST', '/api/auth/login', { body: { username: 'logger', password: 'longenoughpw1' } });
    await h.api('POST', '/api/auth/login', { body: { username: 'logger', password: 'wrong' } });
    expect(await h.prisma.auditLog.count({ where: { action: 'auth.login.success' } })).toBe(1);
    expect(await h.prisma.auditLog.count({ where: { action: 'auth.login.failure' } })).toBe(1);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a cookie (Vietnamese error)', async () => {
    const res = await h.api('GET', '/api/auth/me');
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Chưa đăng nhập');
  });

  it('returns the authenticated user and rotates the cookie (sliding refresh)', async () => {
    await seedUser('carol', 'longenoughpw1');
    const login = await h.api('POST', '/api/auth/login', { body: { username: 'carol', password: 'longenoughpw1' } });
    const c1 = cookieFrom(login)!;
    const me = await h.api('GET', '/api/auth/me', { cookie: c1 });
    expect(me.status).toBe(200);
    expect((await me.json()).user.username).toBe('carol');
    const c2 = cookieFrom(me);
    expect(c2).toBeTruthy();
    expect(c2).not.toBe(c1);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the jti so the same cookie can no longer authenticate', async () => {
    await seedUser('mallory', 'longenoughpw1');
    const login = await h.api('POST', '/api/auth/login', { body: { username: 'mallory', password: 'longenoughpw1' } });
    const cookie = cookieFrom(login)!;
    expect((await h.api('POST', '/api/auth/logout', { cookie })).status).toBe(200);
    const me = await h.api('GET', '/api/auth/me', { cookie });
    expect(me.status).toBe(401);
  });

  it('is a no-op (still 200) when called without a cookie', async () => {
    expect((await h.api('POST', '/api/auth/logout')).status).toBe(200);
  });
});

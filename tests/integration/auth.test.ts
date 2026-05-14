import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { buildApp, getPrisma, truncateAll } from '../helpers/app';
import { resetAll as resetAllRateLimits } from '../../backend/src/lib/rateLimit';

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp();
});

beforeEach(async () => {
  await truncateAll();
  // Wipe every IP bucket so tests don't see carry-over from earlier cases.
  resetAllRateLimits();
});

async function seedUser(
  username: string,
  password: string,
  role: 'admin' | 'editor' | 'viewer' = 'admin',
) {
  const prisma = await getPrisma();
  return prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 4),
      role,
    },
  });
}

describe('POST /api/auth/login', () => {
  it('returns 200 and a roots_token cookie on correct credentials', async () => {
    await seedUser('alice', 'longenoughpw1');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'longenoughpw1' });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('alice');
    expect(res.body.user.role).toBe('admin');
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('roots_token='))).toBe(true);
    expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((c) => c.includes('SameSite=Lax'))).toBe(true);
  });

  it('returns 401 for wrong password (Vietnamese error)', async () => {
    await seedUser('bob', 'longenoughpw1');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bob', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Tên đăng nhập hoặc mật khẩu không đúng');
  });

  it('returns 401 when user does not exist', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'whatever123' });
    expect(res.status).toBe(401);
  });

  it('returns 400 on malformed body', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: '' });
    expect(res.status).toBe(400);
  });

  it('rate-limits after 5 wrong attempts within the window', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'ghost', password: 'wrong' });
    }
    const sixth = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'wrong' });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error).toContain('Quá nhiều');
    expect(sixth.headers['retry-after']).toBeDefined();
  });

  it('successful login resets the rate-limit bucket', async () => {
    await seedUser('eve', 'longenoughpw1');
    for (let i = 0; i < 4; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'eve', password: 'wrong' });
    }
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ username: 'eve', password: 'longenoughpw1' });
    expect(ok.status).toBe(200);
    // After success, more attempts should be allowed.
    const again = await request(app)
      .post('/api/auth/login')
      .send({ username: 'eve', password: 'longenoughpw1' });
    expect(again.status).toBe(200);
  });

  it('writes auth.login.success to AuditLog', async () => {
    await seedUser('logger', 'longenoughpw1');
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'logger', password: 'longenoughpw1' });
    const prisma = await getPrisma();
    const audits = await prisma.auditLog.findMany({ where: { action: 'auth.login.success' } });
    expect(audits).toHaveLength(1);
  });

  it('writes auth.login.failure on wrong password', async () => {
    await seedUser('logger2', 'longenoughpw1');
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'logger2', password: 'wrong' });
    const prisma = await getPrisma();
    const audits = await prisma.auditLog.findMany({ where: { action: 'auth.login.failure' } });
    expect(audits).toHaveLength(1);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Chưa đăng nhập');
  });

  it('returns the authenticated user', async () => {
    await seedUser('carol', 'longenoughpw1');
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'carol', password: 'longenoughpw1' });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('carol');
  });

  it('rotates the cookie on each /me hit (sliding refresh)', async () => {
    await seedUser('rotate', 'longenoughpw1');
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'rotate', password: 'longenoughpw1' });
    const c1 = (login.headers['set-cookie'] as unknown as string[])[0]!;
    const me = await request(app).get('/api/auth/me').set('Cookie', c1.split(';')[0]!);
    const c2 = (me.headers['set-cookie'] as unknown as string[])[0]!;
    expect(c2).toBeDefined();
    expect(c2).not.toBe(c1);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the jti so the same cookie can no longer authenticate', async () => {
    await seedUser('mallory', 'longenoughpw1');
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'mallory', password: 'longenoughpw1' });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;

    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(200);

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
  });

  it('is a no-op (still 200) when called without a cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
  });
});

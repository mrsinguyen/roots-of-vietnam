import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { decodeJwt } from 'jose';
import { z } from 'zod';
import type { AppEnv } from '../types';
import type { Role } from '@roots/shared';
import { signToken, revokeToken, verifyPasswordOrDummy } from '../lib/auth';
import { setAuthCookie, clearAuthCookie, COOKIE_NAME } from '../lib/cookies';
import { requireAuth } from '../middleware/auth';
import * as rateLimit from '../lib/ratelimit';
import { writeAudit } from '../lib/audit';
import { readJson } from '../lib/http';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const auth = new Hono<AppEnv>();

function clientIp(c: Context<AppEnv>): string {
  return c.req.header('cf-connecting-ip') ?? 'unknown';
}

auth.post('/login', async (c) => {
  const ip = clientIp(c);
  const rl = await rateLimit.check(c.env, {
    key: `login:${ip}`,
    max: LOGIN_MAX_ATTEMPTS,
    windowMs: LOGIN_WINDOW_MS,
  });
  if (!rl.allowed) {
    c.header('Retry-After', String(rl.retryAfterSeconds));
    return c.json(
      { error: `Quá nhiều lần đăng nhập sai. Thử lại sau ${rl.retryAfterSeconds} giây.` },
      429,
    );
  }

  const parsed = loginSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: 'Dữ liệu không hợp lệ' }, 400);

  const prisma = c.get('prisma');
  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  // Always spend the bcrypt cost — even when the username is unknown — so the
  // response time doesn't betray which usernames exist.
  const ok = await verifyPasswordOrDummy(password, user?.passwordHash ?? null);
  if (!user || !ok) {
    await writeAudit(prisma, { userId: user?.id ?? null, action: 'auth.login.failure', diff: { ip, username } });
    return c.json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' }, 401);
  }

  await rateLimit.reset(c.env, `login:${ip}`);
  const { token } = await signToken(c.env, {
    sub: user.id,
    username: user.username,
    role: user.role as Role,
  });
  setAuthCookie(c, token);
  await writeAudit(prisma, { userId: user.id, action: 'auth.login.success', diff: { ip } });
  return c.json({ user: { id: user.id, username: user.username, role: user.role } });
});

auth.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE_NAME) ?? '';
  // Best-effort: decode without verify so we can revoke even near-expired tokens.
  try {
    if (token) {
      const decoded = decodeJwt(token);
      if (typeof decoded.jti === 'string') {
        await revokeToken(c.env, decoded.jti, typeof decoded.exp === 'number' ? decoded.exp : undefined);
        await writeAudit(c.get('prisma'), {
          userId: typeof decoded.sub === 'string' ? decoded.sub : null,
          action: 'auth.logout',
        });
      }
    }
  } catch {
    // ignore — clearing the cookie is the user-visible effect
  }
  clearAuthCookie(c);
  return c.json({ ok: true });
});

auth.get('/me', requireAuth, async (c) => {
  const prisma = c.get('prisma');
  const id = c.get('user')!.sub;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true },
  });
  if (!user) return c.json({ error: 'Không tìm thấy người dùng' }, 404);

  // Sliding refresh: re-issue a fresh cookie on every authenticated /me hit so an
  // active session keeps rolling forward. We do NOT revoke the previous jti here
  // — a single page load can fire /me more than once (React StrictMode, a
  // service-worker reclaim reload, or two tabs), and revoking the just-rotated
  // token would 401 the racing call and log the user out. Revocation stays on
  // explicit logout. (KV is eventually consistent anyway; see docs/CLOUDFLARE.md.)
  const { token } = await signToken(c.env, {
    sub: user.id,
    username: user.username,
    role: user.role as Role,
  });
  setAuthCookie(c, token);
  return c.json({ user });
});

export default auth;

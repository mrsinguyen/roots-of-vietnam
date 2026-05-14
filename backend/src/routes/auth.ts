import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import {
  COOKIE_NAME,
  signToken,
  revokeToken,
  verifyPassword,
} from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { env } from '../env.js';
import * as rateLimit from '../lib/rateLimit.js';
import { writeAudit } from '../lib/audit.js';
import type { Role } from '@roots/shared';

const router = Router();

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function clientIp(req: import('express').Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function setAuthCookie(res: import('express').Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

router.post('/login', async (req, res) => {
  const ip = clientIp(req);
  const rl = rateLimit.check({
    key: `login:${ip}`,
    max: LOGIN_MAX_ATTEMPTS,
    windowMs: LOGIN_WINDOW_MS,
  });
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSeconds));
    res.status(429).json({
      error: `Quá nhiều lần đăng nhập sai. Thử lại sau ${rl.retryAfterSeconds} giây.`,
    });
    return;
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    return;
  }
  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await writeAudit({
      userId: user?.id ?? null,
      action: 'auth.login.failure',
      diff: { ip, username },
    });
    res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    return;
  }

  rateLimit.reset(`login:${ip}`);
  const { token } = signToken({ sub: user.id, username: user.username, role: user.role as Role });
  setAuthCookie(res, token);
  await writeAudit({
    userId: user.id,
    action: 'auth.login.success',
    diff: { ip },
  });
  res.json({ user: { id: user.id, username: user.username, role: user.role } });
});

router.post('/logout', async (req, res) => {
  const token = (req.cookies?.[COOKIE_NAME] ?? '') as string;
  // Best-effort: decode without strict verify so we can revoke even expired-ish tokens.
  try {
    // Lazy import to avoid circular pull-in; verifyToken would refuse revoked tokens already.
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = token ? jwt.decode(token) : null;
    if (decoded && typeof decoded === 'object' && typeof decoded.jti === 'string') {
      revokeToken(decoded.jti);
      await writeAudit({
        userId: typeof decoded.sub === 'string' ? decoded.sub : null,
        action: 'auth.logout',
      });
    }
  } catch {
    // ignore — clearing the cookie is the user-visible effect
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const id = req.user!.sub;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true },
  });
  if (!user) {
    res.status(404).json({ error: 'Không tìm thấy người dùng' });
    return;
  }
  // Sliding refresh: re-issue a fresh cookie on every authenticated /me hit so an
  // active session keeps rolling forward without re-prompting login.
  const { token } = signToken({ sub: user.id, username: user.username, role: user.role as Role });
  setAuthCookie(res, token);
  // The old token's jti is no longer reachable from the cookie; revoking it would
  // require server-side state we don't keep. The new jti supersedes it for any
  // further use by the same browser.
  res.json({ user });
});

export default router;

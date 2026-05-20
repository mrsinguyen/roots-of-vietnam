import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import {
  COOKIE_NAME,
  signToken,
  revokeToken,
  verifyPasswordOrDummy,
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
  // `req.ip` honors `app.set('trust proxy', n)` configured in server.ts.
  // When TRUST_PROXY=0 (default) it returns the direct socket peer, ignoring
  // any client-supplied X-Forwarded-For. This means an internet-exposed
  // instance cannot have its login rate-limit defeated by spoofed XFF.
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function cookieOptions(): import('express').CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

function setAuthCookie(res: import('express').Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000,
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
  // Always spend the bcrypt cost — even when the username is unknown — so the
  // response time doesn't betray which usernames exist.
  const ok = await verifyPasswordOrDummy(password, user?.passwordHash ?? null);
  if (!user || !ok) {
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
  res.clearCookie(COOKIE_NAME, cookieOptions());
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
  // active session keeps rolling forward without re-prompting login. The old
  // jti is revoked at the same time so a stolen token cannot be refreshed in
  // parallel with the legitimate session.
  const oldJti = req.user!.jti;
  const { token } = signToken({ sub: user.id, username: user.username, role: user.role as Role });
  if (oldJti) revokeToken(oldJti);
  setAuthCookie(res, token);
  res.json({ user });
});

export default router;

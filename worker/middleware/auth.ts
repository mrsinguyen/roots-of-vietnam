import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { Role } from '@roots/shared';
import type { AppEnv } from '../types';
import { COOKIE_NAME } from '../lib/cookies';
import { verifyToken } from '../lib/auth';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, COOKIE_NAME);
  const payload = token ? await verifyToken(c.env, token) : null;
  if (!payload) return c.json({ error: 'Chưa đăng nhập' }, 401);
  c.set('user', payload);
  await next();
});

export function requireRole(...roles: Role[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Chưa đăng nhập' }, 401);
    if (!roles.includes(user.role)) return c.json({ error: 'Không có quyền thực hiện' }, 403);
    await next();
  });
}

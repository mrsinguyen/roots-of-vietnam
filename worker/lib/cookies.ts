import { setCookie, deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { AppEnv } from '../types';

export const COOKIE_NAME = 'roots_token';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function secure(c: Context<AppEnv>): boolean {
  return c.env.NODE_ENV === 'production';
}

export function setAuthCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: secure(c),
    path: '/',
    maxAge: MAX_AGE_SECONDS,
    ...(c.env.COOKIE_DOMAIN ? { domain: c.env.COOKIE_DOMAIN } : {}),
  });
}

export function clearAuthCookie(c: Context<AppEnv>): void {
  deleteCookie(c, COOKIE_NAME, {
    path: '/',
    secure: secure(c),
    ...(c.env.COOKIE_DOMAIN ? { domain: c.env.COOKIE_DOMAIN } : {}),
  });
}

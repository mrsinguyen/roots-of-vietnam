import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@roots/shared';
import { env } from '../env.js';

export interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
  jti: string;
}

export const COOKIE_NAME = 'roots_token';
export const BCRYPT_COST = 12;
export const PASSWORD_MIN_LENGTH = 10;

// Process-local denylist of revoked JWT IDs, paired with their absolute
// expiry. Cleared on restart (documented in SECURITY.md). The map grows on
// every sliding refresh in /api/auth/me, so we opportunistically prune
// expired entries on each lookup — otherwise a single long-lived tab could
// accumulate thousands of dead jtis over a week.
const revokedJti = new Map<string, number>();

function pruneExpired(now = Date.now()): void {
  for (const [jti, exp] of revokedJti) {
    if (exp <= now) revokedJti.delete(jti);
  }
}

export function revokeToken(jti: string, expiresAtMs?: number): void {
  // Default to 7 days out — slightly longer than the longest reasonable
  // JWT_EXPIRES_IN — so a stale entry is bounded even if the caller didn't
  // provide an exp claim.
  revokedJti.set(jti, expiresAtMs ?? Date.now() + 7 * 24 * 60 * 60 * 1000);
}

export function isRevoked(jti: string | undefined): boolean {
  if (!jti) return false;
  pruneExpired();
  return revokedJti.has(jti);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Dummy bcrypt hash used to keep the login path constant-time when the
// supplied username is unknown. Without this, the absence of a bcrypt
// compare on the user-not-found branch leaks usernames via response timing.
// The cost matches BCRYPT_COST so verification time is indistinguishable.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

export async function verifyPasswordOrDummy(plain: string, hash: string | null): Promise<boolean> {
  if (hash) return verifyPassword(plain, hash);
  // Still spend the bcrypt time so the response delay matches the
  // user-exists branch. The result is always false.
  await verifyPassword(plain, DUMMY_HASH);
  return false;
}

export function signToken(payload: Omit<JwtPayload, 'jti'>): { token: string; jti: string } {
  const jti = crypto.randomBytes(12).toString('hex');
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  const token = jwt.sign({ ...payload, jti }, env.JWT_SECRET, options);
  return { token, jti };
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string') return null;
    const { sub, username, role, jti } = decoded as JwtPayload;
    if (!sub || !username || !role || !jti) return null;
    if (isRevoked(jti)) return null;
    return { sub, username, role, jti };
  } catch {
    return null;
  }
}

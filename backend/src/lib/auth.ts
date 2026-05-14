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

// Process-local denylist of revoked JWT IDs. Cleared on restart, which is fine
// because the cookie expires within JWT_EXPIRES_IN regardless.
const revokedJti = new Set<string>();

export function revokeToken(jti: string): void {
  revokedJti.add(jti);
}

export function isRevoked(jti: string | undefined): boolean {
  return !!jti && revokedJti.has(jti);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
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

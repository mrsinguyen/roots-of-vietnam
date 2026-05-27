import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@roots/shared';
import type { Env, JwtPayload } from '../types';

// Auth for the Workers runtime:
//   - jose (HS256 over Web Crypto) for JWT sign/verify.
//   - KV (TTL = token lifetime) for the revoked-jti denylist.
//   - bcryptjs is pure JS and runs on workerd. NOTE: cost 12 is ~200-300ms CPU;
//     on low CPU limits this can be tight, but is fine for login-only volume on
//     a family genealogy app. See docs/CLOUDFLARE.md.

// bcryptjs needs a CSPRNG. On workerd, crypto is unavailable during top-level
// module evaluation (it only works inside a request), and bcryptjs's own
// self.crypto detection can miss — so register an explicit Web Crypto fallback.
// Registering only stores the function (no crypto call here); it is invoked
// later, in-request. No-op in Node, where bcryptjs uses node:crypto.
bcrypt.setRandomFallback((len: number): number[] => {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes);
});

export const BCRYPT_COST = 12;
export const PASSWORD_MIN_LENGTH = 10;

// KV requires a minimum TTL of 60s; never write a shorter expiration.
const MIN_KV_TTL = 60;
const DEFAULT_REVOKE_TTL = 7 * 24 * 60 * 60;

function secretKey(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Constant-time-ish login: always spend the bcrypt cost even when the username
// is unknown, so response timing does not betray which usernames exist. Computed
// lazily (NOT at module top level) — workerd forbids crypto during module init.
// Memoized so the dummy verify stays constant-time for the isolate's lifetime.
let dummyHash: string | null = null;
function getDummyHash(): string {
  if (dummyHash === null) dummyHash = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);
  return dummyHash;
}

export async function verifyPasswordOrDummy(plain: string, hash: string | null): Promise<boolean> {
  if (hash) return verifyPassword(plain, hash);
  await verifyPassword(plain, getDummyHash());
  return false;
}

export async function signToken(
  env: Env,
  payload: Omit<JwtPayload, 'jti'>,
): Promise<{ token: string; jti: string }> {
  const jti = crypto.randomUUID();
  const token = await new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN ?? '7d')
    .sign(secretKey(env));
  return { token, jti };
}

export async function verifyToken(env: Env, token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(env));
    const { sub, username, role, jti, exp } = payload as Record<string, unknown>;
    if (
      typeof sub !== 'string' ||
      typeof username !== 'string' ||
      typeof role !== 'string' ||
      typeof jti !== 'string'
    ) {
      return null;
    }
    if (await isRevoked(env, jti)) return null;
    return {
      sub,
      username,
      role: role as Role,
      jti,
      exp: typeof exp === 'number' ? exp : undefined,
    };
  } catch {
    return null;
  }
}

export async function revokeToken(env: Env, jti: string, expEpochSec?: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = expEpochSec ? Math.max(MIN_KV_TTL, expEpochSec - now) : DEFAULT_REVOKE_TTL;
  await env.KV.put(`denylist:${jti}`, '1', { expirationTtl: ttl });
}

export async function isRevoked(env: Env, jti: string | undefined): Promise<boolean> {
  if (!jti) return false;
  const hit = await env.KV.get(`denylist:${jti}`);
  return hit !== null;
}

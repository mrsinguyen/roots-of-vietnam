import type { PrismaClient } from '../prisma/generated';
import type { Role } from '@roots/shared';

// Cloudflare bindings + environment for the Pages Functions deployment.
// D1/KV/R2 are wired in wrangler.toml; secrets via `wrangler pages secret put`.
export interface Env {
  // D1 database binding (SQLite-compatible). Only reachable inside a request.
  DB: D1Database;
  // Single KV namespace, key-prefixed: `ratelimit:` and `denylist:`.
  KV: KVNamespace;
  // R2 bucket for uploaded media + JSON/zip backups.
  MEDIA: R2Bucket;
  // Secret. Set with: wrangler pages secret put JWT_SECRET
  JWT_SECRET: string;
  // Plain vars (wrangler.toml [vars]).
  JWT_EXPIRES_IN?: string;
  CORS_ORIGIN?: string;
  COOKIE_DOMAIN?: string;
  NODE_ENV?: string;
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
  jti: string;
  // Expiry (epoch seconds) — present on verified tokens, used to bound the KV
  // denylist TTL when revoking on logout / sliding refresh.
  exp?: number;
}

// Hono per-request variables.
export interface Variables {
  prisma: PrismaClient;
  user?: JwtPayload;
}

export type AppEnv = { Bindings: Env; Variables: Variables };

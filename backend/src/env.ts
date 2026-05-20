import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  DB_PROVIDER: z.enum(['sqlite', 'postgresql']).default('sqlite'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  UPLOAD_DIR: z.string().default('../uploads'),
  BACKUP_DIR: z.string().default('../backups'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Number of reverse-proxy hops to trust for req.ip / X-Forwarded-For.
  // 0 = direct-exposure (default, safe). 1 = behind a single LB. Higher only
  // if you control every intermediate proxy.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Optional cookie scope (e.g. "example.com" to share between frontend and
  // api subdomains). Leave unset to bind to the exact request Host.
  COOKIE_DOMAIN: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

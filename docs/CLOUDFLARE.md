# Deploying to Cloudflare (D1 + Pages)

Roots of Vietnam runs entirely on Cloudflare: the React PWA is served as static
assets by **Pages**, the API runs as **Pages Functions** (a Hono app on the
Workers runtime), and data lives in **D1** (SQLite), **R2** (media + backups),
and **KV** (login rate-limit + JWT denylist).

| Concern      | Implementation                                                  |
| ------------ | --------------------------------------------------------------- |
| Static UI    | Cloudflare Pages (`frontend/dist`)                              |
| HTTP API     | Hono on Pages Functions (`functions/` → `worker/app.ts`)        |
| Database     | D1 via Prisma 6 + `@prisma/adapter-d1` (per-request client)     |
| File uploads | R2 bucket, key prefix `media/*`                                 |
| Backups      | R2 bucket, key prefix `backups/*` (JSON + zip)                  |
| Rate limit   | KV, key prefix `ratelimit:*`                                    |
| JWT denylist | KV, key prefix `denylist:*`                                     |
| JWT signing  | `jose` (HS256, Web Crypto)                                      |
| media-zip    | `jszip`                                                         |
| auto-backup  | standalone Cron Worker (`wrangler.cron.toml`)                   |

## Layout

```text
functions/api/[[route]].ts      Pages Function → Hono app (handles /api/*)
functions/uploads/[[route]].ts  Pages Function → Hono app (serves /uploads/* from R2)
worker/app.ts                   Hono app: mounts all 8 route modules + /uploads + onError
worker/routes/*.ts              auth, persons, marriages, branches, media, backup, users, audit
worker/lib/*.ts                 prisma, auth(jose), ratelimit(KV), audit, genealogy, media(R2), backup(R2)
worker/scheduled.ts             Cron Worker entry for auto-backup
wrangler.toml                   Pages config (D1/KV/R2 bindings + vars)
wrangler.cron.toml              standalone backup Cron Worker
wrangler.test.toml              local-only config used by the worker test suite
prisma/schema.prisma            D1 Prisma schema (sqlite provider + adapter, custom client output)
prisma/migrations/              SQL applied by `wrangler d1 migrations apply`
prisma/seed.mjs                 admin + demo family → idempotent SQL
prisma/seed-admin.mjs           admin user only → SQL
```

## One-time provisioning

```bash
pnpm install
npx wrangler login

# Create the bindings, then paste the returned ids into wrangler.toml
# (and the same D1 id + R2 bucket into wrangler.cron.toml):
npx wrangler d1 create roots-of-vietnam
npx wrangler kv namespace create roots-kv
npx wrangler r2 bucket create roots-of-vietnam-media

# Production secret (never put JWT_SECRET in wrangler.toml):
npx wrangler pages secret put JWT_SECRET
```

## Database migrations (D1)

D1 is not migrated by `prisma migrate`. The SQL is generated from the schema and
applied by wrangler. The committed migration is `prisma/migrations/0001_init.sql`.

```bash
# Regenerate the SQL after any schema change to prisma/schema.prisma:
pnpm prisma:migrate:diff

# Apply locally, then to the live D1:
pnpm migrate:local      # wrangler d1 migrations apply roots-of-vietnam --local
pnpm migrate:remote     # wrangler d1 migrations apply roots-of-vietnam --remote
```

## Seeding

`prisma/seed.mjs` emits idempotent SQL (`INSERT OR IGNORE`) for an admin user +
the 22-person demo family. `prisma/seed-admin.mjs` emits just the admin (use it
on a production DB you want to populate yourself through the UI).

```bash
pnpm seed:local         # admin/changeme + demo family → local D1
pnpm seed:remote        # → production D1

# Admin only, custom password, production:
SQL=$(ADMIN_USER=admin ADMIN_PASS='choose-a-strong-pass' node prisma/seed-admin.mjs)
npx wrangler d1 execute roots-of-vietnam --remote --command "$SQL"
```

Override the seed admin login with `ADMIN_USER` / `ADMIN_PASS`. Rotate the
password after first login (or via `POST /api/users`).

## Build, run, deploy

```bash
pnpm cf:build     # prisma generate (D1 client) + vite build → frontend/dist
pnpm dev          # wrangler pages dev (local D1/KV/R2 emulation) → :8788
pnpm cf:deploy    # build + wrangler pages deploy
```

When deploying via the Cloudflare Pages Git integration, set the build command to
`pnpm cf:build` and the output directory to `frontend/dist`. The generated Prisma
client (`prisma/generated/`) is git-ignored and rebuilt by `pnpm prisma:generate`
(part of `cf:build`).

### Local development (`pnpm dev`)

`pnpm dev` runs the real Workers runtime against **local** D1/KV/R2, so it needs a
local secret + a migrated, seeded local D1 first:

```bash
echo 'JWT_SECRET=local-dev-secret-min-16-chars' > .dev.vars   # gitignored; dev only
pnpm cf:build
pnpm migrate:local
pnpm seed:local
pnpm dev          # http://localhost:8788  → log in as admin / changeme
```

For frontend HMR, run `pnpm dev:web` (Vite on :5173) in a second terminal — it
proxies `/api` + `/uploads` to `pnpm dev` on :8788.

> **workerd + bcrypt:** bcryptjs cannot run during top-level module evaluation on
> workerd (crypto is request-scoped). `worker/lib/auth.ts` therefore computes its
> constant-time dummy hash lazily and registers a Web Crypto `setRandomFallback`.
> Don't reintroduce a top-level `bcrypt.hashSync` — it crashes worker startup.
>
> The `_redirects` SPA rule (`/* /index.html 200`) triggers a benign wrangler
> "infinite loop" warning; Pages serves real assets first, so deep links
> (`/tree`, `/persons/:id`) still fall back to `index.html`.

### Scheduled backups (optional)

Pages Functions cannot run cron triggers, so auto-backup is a separate Worker:

```bash
# Set the same D1 id + R2 bucket in wrangler.cron.toml, then:
npx wrangler deploy -c wrangler.cron.toml
```

It runs `autoBackupIfStale()` weekly and writes to the same R2 `backups/` prefix.

## Security notes

- **JWT_SECRET** is a Pages secret. Never commit it. Rotate before going live.
- **KV is eventually consistent** (~60s globally). Two effects:
  - *Login rate-limit* counts are approximate; a client hitting multiple edge
    PoPs could briefly exceed the 5-attempts-per-15-min limit. Acceptable for a
    family app. Use Durable Objects if you need strict global counting.
  - *Logout revocation* may take up to ~60s to propagate to every PoP. The TTL on
    each denylist entry is the token's own expiry, so entries self-clean.
- The `/api/auth/me` sliding refresh re-issues the cookie but does **not** revoke
  the prior jti (a single page load can fire `/me` more than once). Revocation is
  logout-only. See `SECURITY.md`.
- **bcrypt cost is 12** (~200–300ms CPU per login). Fine for login-only volume; if
  you hit CPU limits on a constrained plan, lower the cost in `worker/lib/auth.ts`.
- **Uploaded media is public** by random URL, served with `X-Content-Type-Options:
  nosniff` + `Content-Disposition: attachment` so a smuggled blob cannot execute.
- **CSP and security headers** ship in `frontend/public/_headers`. `connect-src` is
  `'self'` for a same-origin deploy; add the API origin if you split origins (and
  set `CORS_ORIGIN` in `wrangler.toml`).

## Tests

```bash
pnpm test           # frontend + component suite (vitest, jsdom)
pnpm test:workers   # API suite vs local D1/KV/R2 (wrangler getPlatformProxy)
pnpm test:e2e       # Playwright journeys vs `wrangler pages dev`
```

`pnpm test:workers` spins a local workerd via `wrangler getPlatformProxy()`,
applies `prisma/migrations/0001_init.sql` to an in-memory D1, and exercises every
route against real D1/KV/R2 emulation — no Cloudflare account required.

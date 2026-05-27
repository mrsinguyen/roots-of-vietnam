# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This project runs **entirely on Cloudflare**: a React PWA on Pages, a Hono API on
Pages Functions (Workers runtime), and D1 + R2 + KV for storage. There is no
Express server and no SQLite/PostgreSQL self-host path.

## 1. Build & Test Commands

pnpm workspace. The root `.env` only feeds the Vite frontend (`envDir: '..'`).
Worker config lives in `wrangler.toml` ([vars] + D1/KV/R2 bindings); secrets in
`.dev.vars` (local) / `wrangler pages secret put` (prod).

```bash
pnpm install

# First-time: provision bindings (see docs/CLOUDFLARE.md), then for local dev:
echo 'JWT_SECRET=local-dev-secret-min-16-chars' > .dev.vars   # gitignored
pnpm cf:build                            # prisma generate (D1 client) + vite build → frontend/dist
pnpm migrate:local                       # wrangler d1 migrations apply --local
pnpm seed:local                          # admin/changeme + 22-person demo family
pnpm dev                                 # wrangler pages dev → http://localhost:8788
pnpm dev:web                             # (optional) Vite HMR :5173, proxies /api → :8788

pnpm typecheck                           # frontend + shared workspaces + worker (tsc)
# pnpm lint exists at the root but no workspace defines a lint script yet.

# Tests
pnpm test                                # vitest: frontend unit + component (jsdom)
pnpm test:workers                        # Hono API vs local D1+KV+R2 (wrangler getPlatformProxy)
pnpm test:e2e                            # Playwright (Chromium + Mobile Chrome) vs `wrangler pages dev`
pnpm test:all                            # coverage + workers + e2e

# Migrations / seed
pnpm prisma:migrate:diff                 # regenerate prisma/migrations/0001_init.sql from the schema
pnpm migrate:remote                      # apply migrations to the live D1
pnpm seed:remote                         # seed the live D1

# Deploy
pnpm cf:deploy                           # cf:build + wrangler pages deploy

# Run a single test file / case
pnpm vitest run tests/component/AdminPage.test.tsx
pnpm vitest run --config vitest.workers.config.ts tests/workers/persons.test.ts
pnpm exec playwright test tests/e2e/journeys.spec.ts:85 --project=chromium
```

## 2. Architecture Overview

Workspaces under `pnpm-workspace.yaml`: `frontend/`, `shared/`. The API
(`worker/`, `functions/`) and database (`prisma/`) live at the repo root and use
the root `package.json` deps.

**API (Workers runtime)** — Hono on Pages Functions. `functions/api/[[route]].ts`
and `functions/uploads/[[route]].ts` are thin Pages Functions that delegate to the
Hono app in `worker/app.ts`. Every input goes through zod.
- `worker/routes/` — one file per resource: `auth`, `persons`, `marriages`, `branches`, `media`, `backup`, `users`, `audit`.
- `worker/middleware/auth.ts` — JWT in `roots_token` httpOnly cookie + `requireAuth` / `requireRole(...)` Hono middleware.
- `worker/lib/` — `prisma` (per-request `PrismaClient` via `@prisma/adapter-d1`), `auth` (`jose` HS256 + bcrypt + KV denylist), `ratelimit` (KV, 5 logins/15min/IP → 429), `audit` (AuditLog with before/after JSON diff; resolves a stale `userId` to null), `genealogy` (`computeGeneration` = `max(parent)+1`; `detectCycle` → 422), `normalize` (diacritic-stripped `Person.nameNormalized`), `media` (R2 + MIME allowlist), `backup` (R2 JSON + `jszip`), `cookies`, `http`.
- `worker/scheduled.ts` — standalone Cron Worker (`wrangler.cron.toml`) for `autoBackupIfStale()`; Pages Functions can't run cron.
- `worker/app.ts` — mounts the 8 route modules under `/api/*`, serves `/uploads/:key` from R2 (nosniff + attachment), and an `onError` that surfaces `err.status ?? 400` + `err.message`.

**Database** — Cloudflare D1 (SQLite) via Prisma 6 + `@prisma/adapter-d1`. The D1
binding is only reachable inside a request, so the client is instantiated
per-request (no module singleton). `prisma/schema.prisma` uses
`provider = "sqlite"` + a custom client output (`prisma/generated/`, git-ignored).
Models: `Person`, `Marriage` (unique `[husbandId,wifeId]`, polygamy via multiple
rows), `Branch`, `Media` (cascade on Person delete), `User`, `AuditLog`. Enums are
stored as TEXT; typed values live in `shared/src/types.ts`.

**Frontend** — Vite 6 + React 18 + Tailwind + Workbox PWA, served as static assets
by Pages. Entry: `frontend/src/main.tsx` → `App.tsx`. Mobile-first; design tokens in
`tailwind.config.js` (`bark` palette, `shadow-{soft,lift}`, `xs` breakpoint) and
component classes in `src/index.css` (`.btn-{primary,secondary,ghost,danger}`, `.input`, `.label`, `.card`, `.chip`).
- `pages/` — `LoginPage`, `TreePage` (react-d3-tree, collapses below 3 generations), `PersonListPage`, `PersonProfilePage`, `PersonEditPage`, `AdminPage`, `AuditLogPage`.
- `components/AppShell.tsx` — sticky gradient header with desktop top nav (`hidden md:flex`), hamburger drawer, and a fixed bottom tab bar (`md:hidden`) whose nav items use `aria-label` only with no visible text so `getByText(<nav label>)` stays unambiguous in tests.
- `lib/api.ts` — single fetch wrapper, always `credentials: 'include'`.
- `lib/offlineCache.ts` — IndexedDB via `idb-keyval`, `lastSyncedAt` meta. Pages read cache-first when offline.
- `lib/buildTree.ts` — denormalizes Person rows into `react-d3-tree`'s recursive shape.
- `lib/registerSW.ts` — SW registration + "Có bản cập nhật mới" toast (never auto-reloads).
- `locales/vi.ts` — all UI strings. Vietnamese-first; English is not maintained.
- Workbox (`vite.config.ts`): SWR `/api/*` (`api-cache-v3`, excludes auth/users/audit/backup), CacheFirst `/uploads/*` (`media-v1`).
- Dev proxy `/api` + `/uploads` → `VITE_PROXY_TARGET` (default `http://localhost:8788`, the `wrangler pages dev` port).

**Shared** — `shared/src/types.ts`. No build step; vitest + the worker alias `@roots/shared` straight to source. **Do not import the Prisma client type here** — mirror the shape so the frontend bundle stays clean.

Roles: `viewer` (read), `editor` (+ person/media), `admin` (+ users + backup/restore + audit view). Enforced via `requireRole(...)`.

## 3. Code Conventions

- **TypeScript strict, no `any`.** zod on every API input. Match existing file style.
- **Naming.** `camelCase` for code, `PascalCase` for React components and Prisma models.
- **IDs.** Prisma cuids on every model. Auth cookie name is `roots_token`.
- **Errors.** Fail fast at API boundaries. Shape: `{ error: 'Vietnamese copy' }` with the right HTTP status (`400` validation, `401` no cookie, `403` role, `404` missing, `409` conflict, `422` cycle/business rule, `429` rate-limit). Hono's `onError` in `worker/app.ts` surfaces `err.status ?? 400` + `err.message`. Don't swallow.
- **UI strings.** New copy goes in `frontend/src/locales/vi.ts`. Vietnamese first.
- **Mobile-first responsive.** Default styles target mobile (≥320 px); add `xs:`/`sm:`/`md:`/`lg:` overrides. CSS-hide (`hidden md:flex`, `md:hidden`) instead of JS-conditional rendering — jsdom has no viewport, so component tests must still find the nodes.
- **Comments.** Default to none. Add one only when the *why* is non-obvious (invariants, workarounds, cache contracts, workerd quirks).
- **`nameNormalized` is application-maintained.** Call `normalizeName()` on every Person create/update or diacritic-insensitive search silently breaks.
- **Polygamy is a feature.** A `Person` can appear in multiple `Marriage` rows. Don't pick a "primary" spouse.
- **Generation mismatches are soft warnings.** Don't add validation that blocks saving.
- **D1 has no interactive transactions.** `prisma.$transaction(async tx => …)` throws on D1; `worker/lib/backup.ts` restore runs sequentially for this reason.
- **workerd forbids crypto at module-init.** Don't put a top-level `bcrypt.hashSync` (or any crypto call) at module scope — it crashes worker startup. `worker/lib/auth.ts` computes its dummy hash lazily and registers a Web Crypto `setRandomFallback`.
- **Sliding refresh does not revoke the old jti.** `/api/auth/me` re-issues the cookie without revoking the previous token (a page load can fire `/me` more than once). Revocation is logout-only.
- **Migrations.** D1 is migrated by wrangler, not `prisma migrate`. Edit `prisma/schema.prisma`, run `pnpm prisma:migrate:diff` to regenerate the SQL, then `pnpm migrate:local` / `pnpm migrate:remote`.
- **Prisma 6, not 7.** Pinned at `6.19.3`. The schema's `datasource.url` is a literal placeholder (unused at runtime — the D1 adapter supplies the connection) but still required by `prisma validate`/`generate`.
- **Commits.** Conventional Commits: `<type>(<scope>): <subject>` — `feat | fix | docs | style | refactor | test | chore | perf`. Imperative, ≤50-char subject.

## 4. Environment

- **Node ≥24 LTS** (enforced by `engines`).
- **pnpm 11.x** (`packageManager: pnpm@11.0.8`). Don't switch to npm/yarn.
- **Cloudflare bindings** (`wrangler.toml`): `DB` (D1), `KV` (rate-limit + denylist), `MEDIA` (R2). `wrangler.cron.toml` binds the same D1 + R2 for the backup Cron Worker. `wrangler.test.toml` is a local-only config for the worker test suite.
- **Secrets / vars.** `JWT_SECRET` → `.dev.vars` (local) / `wrangler pages secret put` (prod). Plain vars (`JWT_EXPIRES_IN`, `NODE_ENV`, optional `CORS_ORIGIN`/`COOKIE_DOMAIN`) → `wrangler.toml [vars]`.
- **`NODE_ENV`** controls the cookie `Secure` flag (`production` → Secure). Local dev / e2e run over http, so they set `NODE_ENV=test`.
- **Frontend env** (root `.env`, optional): `VITE_API_URL` (empty = same-origin), `VITE_PROXY_TARGET` (default `:8788`).
- **Rotate before exposing.** `JWT_SECRET` and the seed `admin/changeme` password.
- Full deploy + provisioning: `docs/CLOUDFLARE.md`.

## 5. Testing Patterns

- **Framework.** Vitest 2 + Testing Library for the frontend; `wrangler getPlatformProxy()` for the API; Playwright for E2E. Coverage via `@vitest/coverage-v8`.
- **Layout** (`tests/`):
  - `unit/frontend/` + `component/` — RTL + jsdom (`vitest.config.ts`, `pnpm test`).
  - `workers/` — the Hono app vs **real local D1/KV/R2** from `wrangler getPlatformProxy()` (`vitest.workers.config.ts`, `pnpm test:workers`). `tests/workers/helpers/app.ts` boots the proxy, applies `prisma/migrations/0001_init.sql` to an in-memory D1, and exposes `api()` / `loginAs()` / `reset()`.
  - `e2e/` — Playwright journeys against `wrangler pages dev` (a per-run isolated local D1 via `--persist-to`, seeded with the demo family; servers spun by `tests/e2e/_setup.ts`).
- **`react-d3-tree` stub.** `vitest.config.ts` aliases the module to `tests/helpers/reactD3TreeStub.tsx` because the real one touches `SVGSVGElement.width.baseVal` (undefined in jsdom) on mount.
- **Bug-fix protocol.** Failing test first; if the fix is small + local, ship in the same change; otherwise `test.skip` with a `// TODO:` referencing an issue. Never delete/skip a failing test to go green — fix the cause or surface the conflict.

## Reference docs

- `README.md` — features + quick start
- `docs/CLOUDFLARE.md` — deploy, provisioning, secrets, migrations, seeding
- `docs/API.md` — REST reference
- `docs/SCHEMA.md` — data model, generation rule, cascade behavior
- `CONTRIBUTING.md` — code style, commit conventions, PR flow
- `tests/README.md` — test layout + how to run each suite

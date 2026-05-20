# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Build & Test Commands

pnpm workspace. Root `.env` is shared (backend reads via `tsx --env-file=../.env`, frontend via `envDir: '..'` in `vite.config.ts`).

```bash
pnpm install
cp .env.example .env
pnpm --filter backend migrate            # prisma migrate dev → database/roots.db
pnpm --filter backend prisma:generate    # regenerate Prisma client
pnpm seed                                # admin/changeme + 22-person demo family (idempotent upsert)
pnpm dev                                 # backend :3001 + frontend :5173 via concurrently
pnpm build                               # both packages (tsc + vite)
pnpm typecheck                           # tsc -b across workspaces
# pnpm lint exists at the root but no workspace defines a lint script yet.

# Tests
pnpm test                                # vitest: unit + integration + component
pnpm test:watch
pnpm test:coverage                       # enforces lines/statements ≥90, branches ≥80, functions ≥75
pnpm test:e2e                            # Playwright (Chromium + Mobile Chrome) vs vite preview :4173
pnpm test:all

# Run a single file / single test
pnpm vitest run tests/integration/persons.test.ts
pnpm vitest run -t "rejects unauthenticated GET"
pnpm exec playwright test tests/e2e/journeys.spec.ts

# Reset DB
rm database/roots.db && pnpm --filter backend migrate && pnpm seed
```

## 2. Architecture Overview

Three workspaces under `pnpm-workspace.yaml`: `backend/`, `frontend/`, `shared/`.

**Backend** — Express 4 + Prisma 6 + SQLite. Entry: `backend/src/server.ts` (JSON 2MB cap, cookie-parser, CORS with credentials, `/uploads` static, `/api/*` route modules, JSON error middleware, `autoBackupIfStale()` on boot).
- `routes/` — one file per resource: `auth`, `persons`, `marriages`, `branches`, `media`, `backup`, `users`, `audit`. Each input goes through zod.
- `middleware/auth.ts` — JWT in `roots_token` httpOnly cookie + sliding refresh + `requireAuth` / `requireRole(...)`.
- `middleware/rateLimit.ts` — 5 failed logins / 15 min / IP → 429. In-memory token denylist on logout.
- `lib/` — `audit` (AuditLog with before/after JSON diff; `writeAudit` resolves stale `userId` to null before insert so a reseeded DB + lingering JWT cookie cannot break logout), `cycle` (refuse ancestry cycles → 422), `generation` (`max(parent.generation)+1`, soft warning only), `normalize` (lowercased + diacritic-stripped `Person.nameNormalized`), `backup` (schema-versioned JSON + SHA-256 per Media, rolling 10).
- `prisma/schema.prisma` — SQLite. Enums stored as TEXT, typed values in `shared/src/types.ts`. Models: `Person`, `Marriage` (unique `[husbandId,wifeId]`, polygamy via multiple rows), `Branch`, `Media` (cascade on Person delete), `User`, `AuditLog`.

**Frontend** — Vite 6 + React 18 + Tailwind + Workbox PWA. Entry: `frontend/src/main.tsx` → `App.tsx`. Mobile-first; design tokens in `tailwind.config.js` (`bark` palette, `shadow-{soft,lift}`, `xs` breakpoint) and component classes in `src/index.css` (`.btn-{primary,secondary,ghost,danger}`, `.input`, `.label`, `.card`, `.chip`).
- `pages/` — `LoginPage`, `TreePage` (react-d3-tree, collapses below 3 generations), `PersonListPage`, `PersonProfilePage`, `PersonEditPage`, `AdminPage`, `AuditLogPage`.
- `components/AppShell.tsx` — sticky gradient header with desktop top nav (`hidden md:flex`), hamburger drawer for mobile menu, and a fixed bottom tab bar (`md:hidden`) whose nav items use `aria-label` only with no visible text so `getByText(<nav label>)` stays unambiguous in tests.
- `lib/api.ts` — single fetch wrapper, always `credentials: 'include'`.
- `lib/offlineCache.ts` — IndexedDB via `idb-keyval`, `lastSyncedAt` meta. Pages read cache-first when offline.
- `lib/buildTree.ts` — denormalizes Person rows into `react-d3-tree`'s recursive shape.
- `lib/registerSW.ts` — SW registration + "Có bản cập nhật mới" toast (never auto-reloads).
- `locales/vi.ts` — all UI strings. Vietnamese-first; English is not maintained.
- `public/fonts/` — self-hosted Be Vietnam Pro (12 woff2 subsets + `be-vietnam-pro.css`), linked from `index.html`. Workbox `globPatterns` includes `woff2` so fonts are precached and the PWA stays offline-clean.
- Workbox (`vite.config.ts`): SWR `/api/*` (`api-cache-v2`), CacheFirst `/uploads/*` (`media-v1`, LRU with `purgeOnQuotaError`).
- Dev/preview proxy `/api` + `/uploads` → `VITE_PROXY_TARGET` (default `http://localhost:3001`).

**Shared** — `shared/src/types.ts`. No build step; vitest aliases `@roots/shared` straight to source. **Do not import Prisma types here** — keep the frontend bundle clean by mirroring the shape.

Roles: `viewer` (read), `editor` (+ person/media), `admin` (+ users + backup/restore + audit view). Enforced server-side via `requireRole(...)`.

## 3. Code Conventions

- **TypeScript strict, no `any`.** zod on every API input. Match existing file style.
- **Naming.** `camelCase` for code, `PascalCase` for React components and Prisma models. File names match the exported symbol where possible.
- **IDs.** Prisma cuids on every model (no prefix scheme — `Person.id`, `Marriage.id`, etc. are bare cuids). Auth cookie name is `roots_token`.
- **Errors.** Fail fast at API boundaries. Shape: `{ error: 'Vietnamese copy' }` with the right HTTP status (`400` validation, `401` no cookie, `403` role, `404` missing, `422` cycle/business rule, `429` rate-limit). The Express error middleware in `server.ts` catches thrown errors and surfaces `err.status ?? 400` with `err.message`. Don't swallow.
- **UI strings.** New copy goes in `frontend/src/locales/vi.ts`. Vietnamese first.
- **Mobile-first responsive.** Default styles target mobile (≥320 px); add `xs:` / `sm:` / `md:` / `lg:` overrides for wider viewports. CSS-hide (`hidden md:flex`, `md:hidden`) instead of JS-conditional rendering — jsdom has no viewport, so component tests must still find the nodes. If the same label would appear on both mobile and desktop nav, expose the mobile copy via `aria-label` only.
- **Comments.** Default to none. Add one only when the *why* is non-obvious (invariants, workarounds, cache contracts).
- **Migrations.** Every Prisma migration ships with a `down.sql` describing the inverse. Data backfills go in `backend/prisma/backfill-*.ts` — idempotent and re-runnable.
- **`nameNormalized` is application-maintained.** Call `normalizeName()` on every Person create/update or diacritic-insensitive search silently breaks.
- **Polygamy is a feature.** A `Person` can appear in multiple `Marriage` rows. Don't pick a "primary" spouse.
- **Generation mismatches are soft warnings.** Don't add validation that blocks saving.
- **Commits.** Conventional Commits: `<type>(<scope>): <subject>` — `feat | fix | docs | style | refactor | test | chore | perf`. Imperative mood, ≤50-char subject.

## 4. Environment

- **Node ≥24 LTS** (enforced by `engines` in both `package.json`s).
- **pnpm 11.x** (`packageManager: pnpm@11.0.8`). Don't switch to npm/yarn.
- **Platform.** Built and tested on macOS and Linux. No bash-version traps; tooling is all Node.
- **System dependencies.** Server-side `zip` binary required for `POST /api/backup/media-zip` (the route shells out). macOS and most Linux distros ship it; CI images may need `apt-get install zip`.
- **No external services.** SQLite file at `database/roots.db`, uploads at `uploads/`, backups at `backups/`. All three are `.gitignored` and host-mounted in `docker/docker-compose.yml`.
- **Docker (optional).** `cd docker && docker compose up --build` runs the full stack with persisted volumes.
- **Required env vars** (see `.env.example`): `PORT`, `DATABASE_URL` (relative to `backend/prisma/schema.prisma`), `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_DOMAIN`, `NODE_ENV`, `UPLOAD_DIR`, `BACKUP_DIR`, `CORS_ORIGIN`. Frontend: `VITE_API_URL` (leave empty for same-origin + proxy in dev).
- **Rotate before exposing.** `JWT_SECRET` and the seed `admin/changeme` password.

## 5. Testing Patterns

- **Framework.** Vitest 2 + Testing Library + supertest for backend; Playwright 1.49 for E2E. Coverage via `@vitest/coverage-v8`.
- **Layout** (`tests/`):
  - `unit/` — pure functions, no DB. `tests/unit/frontend/**` runs under jsdom.
  - `component/` — RTL + jsdom.
  - `integration/` — `buildApp()` + supertest + per-file SQLite.
  - `e2e/` — Playwright against `vite preview` (servers spun by `tests/e2e/_setup.ts`, not Playwright's `webServer`).
- **DB isolation.** Each Vitest fork writes `tmp/test-<hex>.db`, sets `DATABASE_URL` *before* any backend module imports, then runs `prisma migrate deploy`. Pool is `forks` with `singleFork: false` so each file gets its own Prisma singleton. Within a file, `truncateAll()` from `tests/helpers/app.ts` resets rows between cases.
- **Factories.** `tests/factories/index.ts` — `createPerson`, `createBranch`, `createUser`, `createMarriage`. They use the file-scoped Prisma client and pick unique fallback names so identity-agnostic tests can omit overrides.
- **Auth.** `loginAs(app, 'admin' | 'editor' | 'viewer')` from `tests/helpers/auth.ts` returns the `roots_token=…` cookie — pass via `request(app).set('Cookie', a.cookie)`.
- **`react-d3-tree` stub.** `vitest.config.ts` aliases the module to `tests/helpers/reactD3TreeStub.tsx` because the real one touches `SVGSVGElement.width.baseVal` (undefined in jsdom) on mount. Component tests assert against `captured` props.
- **Bug-fix protocol.** Failing test first; if fix is <~20 lines in one file, ship in the same change; otherwise `test.skip` with a `// TODO:` referencing an issue.
- **Coverage thresholds enforced** by `vitest.config.ts`: lines 90, branches 80, functions 75, statements 90. Justified gap in `tests/README.md` (jsdom-unreachable error branches covered by `tests/e2e/journeys.spec.ts`).

## Reference docs

- `README.md` — features + quick start
- `docs/API.md` — REST reference
- `docs/SCHEMA.md` — Prisma model, generation rule, cascade behavior
- `CONTRIBUTING.md` — code style, commit conventions, PR flow
- `tests/README.md` — test layout, fixtures, coverage justification

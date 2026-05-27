# Changelog

All notable changes to this project will be documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — Cloudflare-only

**BREAKING.** The project is now a Cloudflare-native app. The Express self-host
server, the SQLite/PostgreSQL dual-provider tracks, and Docker are removed. There
is no upgrade path from a self-hosted 0.2.0 instance other than exporting your data
(`POST /api/backup`) and restoring it into a fresh D1 (`POST /api/backup/restore`).

### Changed / Removed

- Removed the Express backend (`backend/src`), the SQLite + PostgreSQL Prisma
  tracks + their migrations, `docker/`, and the supertest integration suite.
- Removed deps: `express`, `cors`, `helmet`, `multer`, `cookie-parser`,
  `jsonwebtoken`, `supertest`, `concurrently`.
- Prisma schema promoted to `prisma/schema.prisma` (single D1 schema); `backend/`
  workspace dropped.

### Added

- **Cloudflare deployment**: React PWA on **Pages**, API as **Pages Functions**
  (Hono on the Workers runtime), data in **D1** (Prisma 6 + `@prisma/adapter-d1`),
  media + backups in **R2**, login rate-limit + JWT denylist in **KV**.
- Workers-native swaps: `jose` (HS256) for JWT, `jszip` for media-zip, a standalone
  Cron Worker (`wrangler.cron.toml`) for scheduled backups.
- D1 migration tooling (`prisma migrate diff` → `wrangler d1 migrations apply`),
  `prisma/seed.mjs` (admin + demo family as idempotent SQL).
- Worker test suite (`pnpm test:workers`) against real local D1/KV/R2 via
  `wrangler getPlatformProxy()`; E2E reworked to run against `wrangler pages dev`.

### Fixed

- Auth race: `/api/auth/me` sliding refresh no longer revokes the just-rotated jti,
  so a double `/me` on a page load (StrictMode / SW reclaim / multiple tabs) can't
  log the user out. Revocation is logout-only.

### Ideas

- GEDCOM import / export.
- OCR for scanned hand-written records.
- Real-time multi-user collaboration with conflict resolution.
- Approval workflow before a mutation lands in the public tree.
- Cemetery maps with media pinned to coordinates.
- QR codes on profile pages for headstones.

## [0.2.0] — Phase 2 hardening

### Added

- **VN dates & names**: partial dates (year-only · month+year · full), free-text
  lunar dates, honorifics, diacritic-insensitive search via `nameNormalized`.
  Vietnamese ordinal "Đời thứ N" in profile and tree.
- **AuditLog** table with admin-only viewer at `/admin/audit`. Captures auth
  events, person CRUD, user CRUD, and backup operations with a JSON before/after
  diff.
- **Tree edge cases**: cycle guard (`422` with Vietnamese error), multi-spouse
  rendering, `?root=<id>` URL re-rooting, "Chưa rõ" placeholders for unknown
  parents, default-collapse below 3 generations from root.
- **Backup hardening**: schema-versioned dump (v2), SHA-256 per media file,
  rolling-10 prune, `POST /api/backup/media-zip` for the binary companion,
  `POST /api/backup/restore` with `?force=true` guard, missing/hash-mismatch
  detection on restore, auto-backup on boot if last is older than 7 days.
- **PWA polish**: stale-while-revalidate on `/api/*`, cache-first on `/uploads/*`
  with LRU + quota purge, six-store IndexedDB layout with `lastSyncedAt`,
  empty `pendingMutations` store ready for phase 3, "Có bản cập nhật mới" toast
  with a "Tải lại" button, "Cần kết nối lần đầu" cold-start gate.
- **Auth hardening**: JWT carries `jti`, in-memory denylist on logout, sliding
  refresh on `/api/auth/me`, login rate-limit (5 attempts / 15 min / IP),
  bcrypt cost bumped to 12, password policy ≥ 10 characters on user-management API.

### Migrations

- `20260514060855_vn_dates_names_add` — adds year/month/day triplets, lunar
  fields, honorific, `nameNormalized`. Plus `backend/prisma/backfill-name-normalized.ts`
  for the data fill.
- `20260514061800_vn_dates_drop_legacy` — drops the transitional `birthDate` /
  `deathDate` columns.
- `20260514063000_audit_log` — adds the `AuditLog` table.

Each migration ships with a sibling `down.sql` describing the inverse.

## [0.1.0] — Phase 1 MVP

### Added

- Initial Vite + React + Tailwind PWA shell.
- Express + Prisma backend with cuid-keyed `Person`, `Marriage`, `Branch`,
  `Media`, `User` tables.
- JWT cookie auth with `admin` / `editor` / `viewer` roles.
- Person CRUD, search, multipart photo upload, family-tree view via
  `react-d3-tree`, profile drawer, profile page with lineage breadcrumb.
- Vietnamese-first UI with strings in `frontend/src/locales/vi.ts`.
- Vite-plugin-pwa with NetworkFirst on `/api/*`, IndexedDB cache for persons.
- `POST /api/backup` writing timestamped JSON to `backups/`.
- Seed script for one admin user and 15 sample Nguyễn (demo family) persons across 4
  generations.
- Lighthouse PWA score 100 (measured via `lighthouse@11`).

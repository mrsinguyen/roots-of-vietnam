# Changelog

All notable changes to this project will be documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Ideas

- GEDCOM import / export.
- OCR for scanned hand-written records.
- Real-time multi-user collaboration with conflict resolution.
- Approval workflow before a mutation lands in the public tree.
- PostgreSQL adapter behind an `OPS_DB` env var.
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

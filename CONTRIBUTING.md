# Contributing

Thanks for considering a contribution to **Roots of Vietnam**. The project is
small and Vietnamese-first — keep that in mind when proposing changes.

## Ground rules

- Open an issue **before** sending a PR for anything beyond a typo or doc fix.
  Genealogy is opinionated; surfacing intent first avoids wasted work.
- Keep PRs focused. One logical change per PR. Split refactors from features.
- Match the existing style. TypeScript strict, no `any`, zod on every API input.
- New UI strings go in [`frontend/src/locales/vi.ts`](frontend/src/locales/vi.ts).
  Vietnamese first; English copy is not maintained today.
- Add or update tests for behavior changes (see "Testing" below).

## Local setup

```bash
pnpm install
cp .env.example .env
pnpm --filter backend migrate          # SQLite by default; set DB_PROVIDER=postgresql for Postgres
pnpm seed
pnpm dev   # backend :3001, frontend :5173
```

Sign in with `admin` / `changeme`. Reset the database any time:

- **SQLite:** `rm database/roots.db && pnpm --filter backend migrate && pnpm seed`
- **PostgreSQL:** `dropdb roots_dev && createdb roots_dev && DB_PROVIDER=postgresql pnpm --filter backend migrate && pnpm seed`

When you switch `DB_PROVIDER`, re-run `pnpm --filter backend prisma:generate` so the
Prisma client engine matches the new provider.

## Project layout

See [`README.md` section "Repository layout"](README.md#repository-layout). Cross-package
TypeScript types live in [`shared/`](shared/) — never import a Prisma type into
the frontend bundle.

## Code style

- **Naming.** `camelCase` for code, `PascalCase` for React components and Prisma
  models. File names match the exported symbol where possible.
- **Errors.** Fail fast at API boundaries; return `{ error: "Vietnamese copy" }`
  with the right HTTP status. Don't swallow errors silently.
- **Comments.** Default to none. Only add a comment when the *why* is non-obvious.
- **Migrations.** Every Prisma migration ships with a `down.sql` describing the
  inverse. Data backfills go in `backend/prisma/backfill-*.ts` scripts that are
  idempotent and re-runnable. **Schema changes must land in both provider tracks.**
  After editing either `backend/prisma/schema.prisma` (sqlite) or
  `backend/prisma/postgres/schema.prisma`, run `pnpm check:schemas` to confirm the
  two stay byte-identical outside the `datasource db {}` block, then run
  `pnpm --filter backend migrate` under **both** `DB_PROVIDER=sqlite` and
  `DB_PROVIDER=postgresql` so the migration folders advance together.

## Commit messages

Conventional Commits — `<type>(<scope>): <subject>` in imperative mood.

```text
feat(tree): collapse below depth 3 by default
fix(auth): clear cookie path on logout
docs(api): document /api/backup/media-zip
```

Types: `feat | fix | docs | style | refactor | test | chore | perf`.

## Testing

There's no formal test runner today; instead we lean on:

- `pnpm typecheck` — TypeScript across all workspaces.
- `pnpm --filter frontend build` — production bundle + service-worker generation.
- Manual scripts:
  - `backend/scripts/prune_test.ts` — backup retention.
  - `backend/scripts/stress-seed.ts` — 200-person stress fixture for perf checks.
- Browser smoke via the QA flow described in
  [`docs/SCHEMA.md`](docs/SCHEMA.md) and the acceptance checklists.

If you add a new module that has meaningful logic, drop a `*_test.ts` script in
`backend/scripts/` or under `frontend/src/` next to the unit. Prefer the
existing pattern (plain TS files runnable via `pnpm exec tsx`) until we adopt a
formal test runner.

## Submitting a PR

1. Fork, branch off `main`.
2. Make the change, run `pnpm typecheck && pnpm --filter frontend build`.
3. Update [`CHANGELOG.md`](CHANGELOG.md) under "Unreleased".
4. Open the PR with a short summary (what + why) and a test plan.

## Security

Don't open a public issue for a vulnerability — follow
[`SECURITY.md`](SECURITY.md) instead.

## Code of Conduct

By participating, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

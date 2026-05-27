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

The app runs on the Cloudflare stack locally via `wrangler pages dev` (real D1 /
KV / R2 emulation). First provision the bindings — see
[`docs/CLOUDFLARE.md`](docs/CLOUDFLARE.md) — then:

```bash
pnpm install
echo 'JWT_SECRET=local-dev-secret-min-16-chars' > .dev.vars   # gitignored, dev only
pnpm cf:build        # generate the D1 Prisma client + build the UI
pnpm migrate:local   # apply the schema to the local D1
pnpm seed:local      # admin/changeme + demo family
pnpm dev             # wrangler pages dev → http://localhost:8788
```

Sign in with `admin` / `changeme`. Reset the local database any time:

```bash
rm -rf .wrangler/state && pnpm migrate:local && pnpm seed:local
```

For frontend HMR, run `pnpm dev:web` (Vite :5173, proxies `/api` → :8788) alongside `pnpm dev`.

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
- **Migrations.** Edit `prisma/schema.prisma`, regenerate the SQL with
  `pnpm prisma:migrate:diff`, then apply with `pnpm migrate:local` (and
  `pnpm migrate:remote` for the live D1). D1 is migrated by wrangler, not
  `prisma migrate`.

## Commit messages

Conventional Commits — `<type>(<scope>): <subject>` in imperative mood.

```text
feat(tree): collapse below depth 3 by default
fix(auth): clear cookie path on logout
docs(api): document /api/backup/media-zip
```

Types: `feat | fix | docs | style | refactor | test | chore | perf`.

## Testing

- `pnpm typecheck` — TypeScript across frontend, shared, and the worker.
- `pnpm test` — frontend unit + component (vitest, jsdom).
- `pnpm test:workers` — the Hono API against real local D1/KV/R2 (`wrangler getPlatformProxy`).
- `pnpm test:e2e` — Playwright journeys against `wrangler pages dev`.

Add or update tests in the same change as a behavior change: frontend logic →
`tests/unit/frontend` or `tests/component`; API behavior → `tests/workers`. See
[`tests/README.md`](tests/README.md) for the harness.

## Submitting a PR

1. Fork, branch off `main`.
2. Make the change, run `pnpm typecheck && pnpm test && pnpm test:workers`.
3. Update [`CHANGELOG.md`](CHANGELOG.md).
4. Open the PR with a short summary (what + why) and a test plan.

## Security

Don't open a public issue for a vulnerability — follow
[`SECURITY.md`](SECURITY.md) instead.

## Code of Conduct

By participating, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

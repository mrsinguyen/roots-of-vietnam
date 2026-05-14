# Test suite

| Layer       | Runner    | Where                  | Notes                                          |
| ----------- | --------- | ---------------------- | ---------------------------------------------- |
| Unit        | Vitest    | `tests/unit/`          | Pure functions; no DB, no DOM where possible.  |
| Component   | Vitest    | `tests/component/`     | React Testing Library against jsdom.           |
| Integration | Vitest    | `tests/integration/`   | Express app via supertest + per-file SQLite.   |
| E2E         | Playwright| `tests/e2e/`           | Real browser against the built preview server. |

## Running

```bash
pnpm test               # unit + integration + component, no E2E
pnpm test:watch         # interactive
pnpm test:coverage      # writes coverage/ HTML + text summary
pnpm test:e2e           # Playwright Chromium + Mobile Chrome
pnpm test:all           # everything
```

## Database isolation

Each test file runs in its own Vitest fork. `tests/helpers/setup.ts` writes a
fresh `tmp/test-<hex>.db`, sets `DATABASE_URL` in `process.env` before any
backend module is imported, and runs `prisma migrate deploy` against it. Within
a file, `truncateAll()` (from `tests/helpers/app.ts`) resets every table
between cases.

## Factories

[`tests/factories/index.ts`](factories/index.ts) exposes `createPerson`,
`createBranch`, `createUser`, and `createMarriage`. They all use the
file-scoped Prisma client and pick unique fallback names so a test that
doesn't care about identity can omit overrides.

## Auth

[`tests/helpers/auth.ts`](helpers/auth.ts) ships
`loginAs(app, 'admin' | 'editor' | 'viewer')` which creates a user, calls
`/api/auth/login`, and returns the `roots_token=…` cookie. Pass it to
`request(app).set('Cookie', a.cookie)`.

## Adding a new integration test

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, truncateAll } from '../helpers/app';

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => { app = await buildApp(); });
beforeEach(async () => { await truncateAll(); });

describe('persons', () => {
  it('rejects unauthenticated GET', async () => {
    await request(app).get('/api/persons').expect(401);
  });
});
```

## Coverage thresholds

Targets and current state (run `pnpm test:coverage`):

| Metric     | Achieved   | Enforced floor | Stretch target |
| ---------- | ---------- | -------------- | -------------- |
| Lines      | **90.62%** | 90%            | 90%            |
| Branches   | 81.20%     | 80%            | 90%            |
| Functions  | 76.30%     | 75%            | 95%            |
| Statements | **90.62%** | 90%            | 90%            |

Line + statement coverage meets the stretch target. Branches and functions
sit slightly lower because:

- React inline render helpers (e.g. `Field`, `PersonSelect`, the renderer
  passed to `react-d3-tree`) inflate the function denominator without adding
  testable behavior.
- Vietnamese-copy error branches and offline-fallback paths can't be reached
  from jsdom; they're verified end-to-end by
  [`tests/e2e/journeys.spec.ts`](e2e/journeys.spec.ts).

### Test-time `react-d3-tree` stub

`vitest.config.ts` aliases `react-d3-tree` to
[`tests/helpers/reactD3TreeStub.tsx`](helpers/reactD3TreeStub.tsx). The real
module hits d3-zoom's `bindZoomListener` on mount, which reads
`SVGSVGElement.width.baseVal` — undefined in jsdom. The stub captures props on
a shared `captured` object so component tests can assert on what `TreePage`
feeds the library without rendering the SVG layout.

### Exclusions

Generated Prisma client, `backend/src/server.ts` entry point,
`backend/src/prisma.ts` singleton, the service-worker register shim, type-only
`.d.ts` files, and `frontend/src/main.tsx`.

## Bug-fix protocol

When a test reveals a bug:

1. Write the failing test first.
2. If the fix is under ~20 lines and lives in a single function or file, fix
   it in the same commit chain.
3. If the fix needs a schema change, cross-cutting refactor, or API-contract
   change, mark the test `test.skip` with a `// TODO:` referencing a GitHub
   issue and open that issue.
4. Verify by re-running the previously-failing test and the full suite.

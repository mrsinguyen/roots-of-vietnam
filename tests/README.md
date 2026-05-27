# Test suite

| Layer     | Runner     | Where               | Notes                                                        |
| --------- | ---------- | ------------------- | ------------------------------------------------------------ |
| Unit      | Vitest     | `tests/unit/frontend/` | Pure frontend helpers; jsdom.                             |
| Component | Vitest     | `tests/component/`  | React Testing Library against jsdom.                         |
| API       | Vitest     | `tests/workers/`    | Hono app vs **real local D1/KV/R2** (`wrangler getPlatformProxy`). |
| E2E       | Playwright | `tests/e2e/`        | Real browser against `wrangler pages dev`.                   |

## Running

```bash
pnpm test            # frontend unit + component (jsdom)         — vitest.config.ts
pnpm test:watch      # interactive
pnpm test:coverage   # frontend coverage → coverage/
pnpm test:workers    # API suite vs local D1/KV/R2              — vitest.workers.config.ts
pnpm test:e2e        # Playwright Chromium + Mobile Chrome
pnpm test:all        # coverage + workers + e2e
```

## API tests (`tests/workers/`)

`pnpm test:workers` runs the actual Hono app (`worker/app.ts`) against real local
bindings provided by `wrangler getPlatformProxy()` (Miniflare/workerd): a real D1
(SQLite), KV, and R2 — no Cloudflare account required.

`tests/workers/helpers/app.ts` boots the proxy once, applies
`prisma/migrations/0001_init.sql` to an in-memory D1, and exposes a `Harness`:

```ts
import { harness } from './helpers/app';

let h;
beforeAll(async () => { h = await harness(); });
afterEach(() => h.reset());   // truncates D1 + clears KV + R2 between cases

it('admin creates a person', async () => {
  const cookie = await h.loginAs('admin');          // seeds a user + logs in
  const res = await h.api('POST', '/api/persons', { cookie, body: { fullName: 'X', gender: 'Nam' } });
  expect(res.status).toBe(201);
});
```

`h.api(method, path, { body, cookie, headers })` calls `app.fetch(...)` with the
local bindings; `h.prisma` is a `PrismaClient` bound to the same local D1 for
direct seeding/assertions.

## E2E tests (`tests/e2e/`)

`tests/e2e/_setup.ts` builds the app (`cf:build`), provisions a per-run isolated
local D1 (`--persist-to` a fresh tmp dir) migrated + seeded with the demo family
(admin/changeme), and boots `wrangler pages dev` on a fixed port. `NODE_ENV=test`
keeps the auth cookie non-`Secure` so it works over http. Playwright journeys in
`journeys.spec.ts` drive the full UI + API.

## `react-d3-tree` stub

`vitest.config.ts` aliases `react-d3-tree` to `tests/helpers/reactD3TreeStub.tsx`.
The real module hits d3-zoom's `bindZoomListener` on mount, which reads
`SVGSVGElement.width.baseVal` — undefined in jsdom. The stub captures props on a
shared `captured` object so component tests can assert what `TreePage` feeds the
library without rendering the SVG layout.

## Bug-fix protocol

1. Write the failing test first.
2. If the fix is small + local, ship it in the same change.
3. Otherwise mark the test `test.skip` with a `// TODO:` referencing an issue.
4. Never delete or skip a failing test just to go green — fix the cause or surface
   the conflict.
5. Re-run the previously-failing test and the relevant suite to verify.

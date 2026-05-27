import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Worker test suite — runs the Hono app against real local D1/KV/R2 bindings
// supplied by wrangler getPlatformProxy() (Miniflare/workerd). Kept separate
// from vitest.config.ts: that suite uses the forks pool + jsdom + a Prisma
// per-file SQLite setup that would fight the platform proxy. No coverage
// thresholds here — the worker code is excluded from the main coverage globs.
export default defineConfig({
  resolve: {
    alias: {
      '@roots/shared': path.resolve(__dirname, 'shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/workers/**/*.test.ts'],
    exclude: ['node_modules', '**/dist/**'],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    // getPlatformProxy spawns a workerd process; run files sequentially in one
    // fork to avoid spinning up many runtimes / port contention.
    poolOptions: { forks: { singleFork: true } },
  },
});

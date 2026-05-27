import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Frontend + shared unit/component suite (jsdom). The API is tested separately
// against real local D1/KV/R2 — see vitest.workers.config.ts (`pnpm test:workers`).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@roots/shared': path.resolve(__dirname, 'shared/src/index.ts'),
      // Swap react-d3-tree for a jsdom-friendly stub; the real module pulls
      // in d3-zoom which assumes a live SVG layout.
      'react-d3-tree': path.resolve(__dirname, 'tests/helpers/reactD3TreeStub.tsx'),
    },
  },
  test: {
    server: {
      deps: {
        // Inline react-d3-tree so vi.mock can intercept the bare specifier.
        inline: ['react-d3-tree'],
      },
    },
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/helpers/setup.ts'],
    include: [
      'tests/unit/frontend/**/*.test.ts',
      'tests/unit/frontend/**/*.test.tsx',
      'tests/component/**/*.test.tsx',
    ],
    exclude: ['node_modules', 'tests/e2e/**', 'tests/workers/**', '**/dist/**'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['frontend/src/**/*.{ts,tsx}', 'shared/src/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        'frontend/src/main.tsx',
        'frontend/src/vite-env.d.ts',
        'frontend/src/lib/registerSW.ts',
        '**/node_modules/**',
      ],
    },
  },
});

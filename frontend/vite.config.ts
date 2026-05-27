import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  envDir: '..',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Gia Phả Việt',
        short_name: 'Gia Phả',
        description: 'Hệ thống gia phả mở cho mọi dòng họ Việt Nam — hoạt động ngoại tuyến.',
        lang: 'vi',
        theme_color: '#7c2d12',
        background_color: '#fafaf9',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        navigateFallback: '/index.html',
        // Cap precache so a long-lived install doesn't grow unbounded.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Genealogy data changes rarely; show whatever we have, then refresh
            // in the background. Stale-while-revalidate hides the network when
            // offline. The pattern is intentionally narrow: only the read-only
            // family endpoints are cached. /api/auth/*, /api/users, and
            // /api/audit carry session-scoped or admin-only data and must not
            // persist in Cache Storage where a second user on a shared device
            // could read them via DevTools after the first user logs out.
            urlPattern: ({ url, request }) => {
              if (request.method !== 'GET') return false;
              if (!url.pathname.startsWith('/api/')) return false;
              const blocked = ['/api/auth', '/api/users', '/api/audit', '/api/backup'];
              return !blocked.some((p) => url.pathname.startsWith(p));
            },
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache-v3',
              // Short TTL — long enough to hide a flaky network, short enough
              // that a user who logs out + walks away doesn't leave a week of
              // PII in Cache Storage.
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Uploaded photos/docs. CacheFirst with a ~50MB LRU budget.
            urlPattern: ({ url }) => url.pathname.startsWith('/uploads/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-v1',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 365,
                purgeOnQuotaError: true,
                // Workbox does not enforce an exact byte budget; the maxEntries + LRU
                // policy combined with purgeOnQuotaError keeps the cache under
                // pressure when storage gets tight. ~50MB is the target ceiling.
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8788',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
  // Mirror the dev proxy so `vite preview` (used by E2E + Lighthouse) can also
  // reach the backend without baking an absolute URL into the bundle.
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8788',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
});

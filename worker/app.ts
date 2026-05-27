import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types';
import { getPrisma } from './lib/prisma';
import { getMedia } from './lib/media';
import authRoutes from './routes/auth';
import personRoutes from './routes/persons';
import marriageRoutes from './routes/marriages';
import branchRoutes from './routes/branches';
import mediaRoutes from './routes/media';
import backupRoutes from './routes/backup';
import userRoutes from './routes/users';
import auditRoutes from './routes/audit';

const app = new Hono<AppEnv>();

// One Prisma client per request, bound to this request's D1 instance.
app.use('*', async (c, next) => {
  c.set('prisma', getPrisma(c.env));
  await next();
});

// CORS for the API. Same-origin (frontend + API on one Pages domain) needs no
// special config — we reflect the request origin. Set CORS_ORIGIN to pin a
// specific cross-origin frontend. Credentials are always allowed (cookie auth).
app.use('/api/*', (c, next) =>
  cors({
    origin: (origin) => c.env.CORS_ORIGIN || origin || '*',
    credentials: true,
  })(c, next),
);

app.get('/api/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

app.route('/api/auth', authRoutes);
app.route('/api/persons', personRoutes);
app.route('/api/marriages', marriageRoutes);
app.route('/api/branches', branchRoutes);
app.route('/api/media', mediaRoutes);
app.route('/api/backup', backupRoutes);
app.route('/api/users', userRoutes);
app.route('/api/audit', auditRoutes);

// Public media. nosniff + attachment Content-Disposition together neutralize
// any uploaded blob that lies about its content type — the browser must save
// rather than render, so even a smuggled .svg cannot execute in this origin.
app.get('/uploads/:key', async (c) => {
  const obj = await getMedia(c.env, c.req.param('key'));
  if (!obj) return c.json({ error: 'Không tìm thấy tệp' }, 404);
  const headers = new Headers();
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Disposition', 'attachment');
  const ct = obj.httpMetadata?.contentType;
  if (ct) headers.set('Content-Type', ct);
  if (obj.httpEtag) headers.set('ETag', obj.httpEtag);
  return new Response(obj.body, { headers });
});

// Mirror the Express JSON error middleware: surface err.status ?? 400 + message.
app.onError((err, c) => {
  const status = ((err as { status?: number }).status ?? 400) as 400;
  return c.json({ error: err.message || 'Lỗi máy chủ' }, status);
});

export default app;

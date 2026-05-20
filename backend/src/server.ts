import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { env } from './env.js';
import authRoutes from './routes/auth.js';
import personRoutes from './routes/persons.js';
import marriageRoutes from './routes/marriages.js';
import branchRoutes from './routes/branches.js';
import mediaRoutes from './routes/media.js';
import backupRoutes from './routes/backup.js';
import userRoutes from './routes/users.js';
import auditRoutes from './routes/audit.js';
import { autoBackupIfStale } from './lib/backup.js';

const app = express();

// Trust the immediate reverse proxy (if any) for `req.ip` and protocol
// detection. Operators behind nginx/cloudfront/etc. should set
// `TRUST_PROXY=1` (or higher integer for chained proxies). Defaults to off
// so a directly-exposed instance can't be fooled by spoofed X-Forwarded-For.
if (env.TRUST_PROXY > 0) {
  app.set('trust proxy', env.TRUST_PROXY);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Tailwind injects style attributes at runtime; relax until we extract
        // critical CSS out of inline <style> blocks.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // We serve our own CORS policy below; helmet's CORP defaults can block
    // images requested by a different origin (the dev frontend on :5173).
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

// Static media. nosniff + attachment Content-Disposition together neutralize
// any uploaded blob that lies about its content type — the browser must save
// rather than render, so even a smuggled .svg cannot execute in this origin.
app.use(
  '/uploads',
  express.static(path.resolve(process.cwd(), env.UPLOAD_DIR), {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'attachment');
    },
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/persons', personRoutes);
app.use('/api/marriages', marriageRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit', auditRoutes);

// Surface multer errors and other thrown errors as JSON.
app.use(
  (
    err: Error & { status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const status = err.status ?? 400;
    res.status(status).json({ error: err.message ?? 'Lỗi máy chủ' });
  },
);

app.listen(env.PORT, () => {
  console.log(`[backend] listening on http://localhost:${env.PORT}`);
  // Best-effort: if no backup in the last week, write one and prune to the last 10.
  autoBackupIfStale()
    .then((r) => {
      if (r.ran) console.log(`[backend] auto-backup wrote ${r.filename}`);
    })
    .catch((err) => console.error('[backend] auto-backup failed', err));
});

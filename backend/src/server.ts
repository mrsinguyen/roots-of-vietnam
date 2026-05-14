import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
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

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

// Static media served from /uploads
app.use('/uploads', express.static(path.resolve(process.cwd(), env.UPLOAD_DIR)));

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

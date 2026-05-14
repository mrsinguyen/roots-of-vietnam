// Build a fresh Express app wired to whichever DATABASE_URL is currently set.
// The backend code imports a singleton `prisma` client built from process.env —
// we mutate the env BEFORE importing, so each test process gets its own client
// bound to its own SQLite file. With vitest's per-file fork isolation this is
// race-free.

import type { Express } from 'express';

let cachedApp: Express | null = null;

export async function buildApp(): Promise<Express> {
  if (cachedApp) return cachedApp;
  const express = (await import('express')).default;
  const cookieParser = (await import('cookie-parser')).default;
  const cors = (await import('cors')).default;
  const path = await import('node:path');
  const { env } = await import('../../backend/src/env.js');
  const authRoutes = (await import('../../backend/src/routes/auth.js')).default;
  const personRoutes = (await import('../../backend/src/routes/persons.js')).default;
  const marriageRoutes = (await import('../../backend/src/routes/marriages.js')).default;
  const branchRoutes = (await import('../../backend/src/routes/branches.js')).default;
  const mediaRoutes = (await import('../../backend/src/routes/media.js')).default;
  const backupRoutes = (await import('../../backend/src/routes/backup.js')).default;
  const userRoutes = (await import('../../backend/src/routes/users.js')).default;
  const auditRoutes = (await import('../../backend/src/routes/audit.js')).default;

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use('/uploads', express.static(path.resolve(process.cwd(), env.UPLOAD_DIR)));
  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/persons', personRoutes);
  app.use('/api/marriages', marriageRoutes);
  app.use('/api/branches', branchRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/backup', backupRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/audit', auditRoutes);
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
  cachedApp = app;
  return app;
}

export async function getPrisma(): Promise<import('@prisma/client').PrismaClient> {
  const mod = await import('../../backend/src/prisma.js');
  return mod.prisma;
}

export async function truncateAll(): Promise<void> {
  const prisma = await getPrisma();
  // Order matters: children before parents.
  await prisma.media.deleteMany({});
  await prisma.marriage.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.person.deleteMany({});
  await prisma.branch.deleteMany({});
  await prisma.user.deleteMany({});
}

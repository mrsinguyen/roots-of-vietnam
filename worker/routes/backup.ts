import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { writeBackup, listBackups, writeMediaZip, restoreDump, BACKUP_SCHEMA_VERSION } from '../lib/backup';
import { writeAudit } from '../lib/audit';
import { readJson } from '../lib/http';

const restoreSchema = z.object({
  schemaVersion: z.number(),
  persons: z.array(z.record(z.unknown())).default([]),
  marriages: z.array(z.record(z.unknown())).default([]),
  branches: z.array(z.record(z.unknown())).default([]),
  media: z.array(z.record(z.unknown())).default([]),
});

const backup = new Hono<AppEnv>();
backup.use('*', requireAuth, requireRole('admin'));

backup.post('/', async (c) => {
  const prisma = c.get('prisma');
  const { filename, dump } = await writeBackup(prisma, c.env);
  await writeAudit(prisma, {
    userId: c.get('user')?.sub ?? null,
    action: 'backup.create',
    diff: { filename, counts: dump.counts },
  });
  return c.json({ filename, counts: dump.counts, schemaVersion: dump.schemaVersion });
});

backup.get('/', async (c) => {
  const items = await listBackups(c.env);
  return c.json({ items, schemaVersion: BACKUP_SCHEMA_VERSION });
});

// Binary companion to the JSON backup: zips every uploaded media object into R2.
backup.post('/media-zip', async (c) => {
  const { filename, sizeBytes } = await writeMediaZip(c.env);
  await writeAudit(c.get('prisma'), {
    userId: c.get('user')?.sub ?? null,
    action: 'backup.media-zip',
    diff: { filename, sizeBytes },
  });
  return c.json({ filename, sizeBytes });
});

backup.post('/restore', async (c) => {
  const force = c.req.query('force') === 'true' || c.req.query('force') === '1';
  const parsed = restoreSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: 'Tệp sao lưu sai định dạng' }, 400);
  try {
    const prisma = c.get('prisma');
    const result = await restoreDump(prisma, c.env, parsed.data, { force });
    await writeAudit(prisma, {
      userId: c.get('user')?.sub ?? null,
      action: 'backup.restore',
      diff: { force, counts: result.inserted },
    });
    return c.json(result);
  } catch (err) {
    const status = ((err as { status?: number }).status ?? 500) as 400 | 409 | 500;
    return c.json({ error: err instanceof Error ? err.message : 'Khôi phục thất bại' }, status);
  }
});

export default backup;

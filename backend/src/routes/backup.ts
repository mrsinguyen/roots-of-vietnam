import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { env } from '../env.js';
import { writeBackup, restoreDump, BACKUP_SCHEMA_VERSION } from '../lib/backup.js';
import { writeAudit } from '../lib/audit.js';

const execFileP = promisify(execFile);

const router = Router();

const backupDir = path.resolve(process.cwd(), env.BACKUP_DIR);
const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);

router.use(requireAuth, requireRole('admin'));

router.post('/', async (req, res) => {
  const { filename, dump } = await writeBackup();
  await writeAudit({
    userId: req.user?.sub ?? null,
    action: 'backup.create',
    diff: { filename, counts: dump.counts },
  });
  res.json({ filename, counts: dump.counts, schemaVersion: dump.schemaVersion });
});

router.get('/', async (_req, res) => {
  await fs.mkdir(backupDir, { recursive: true });
  const entries = await fs.readdir(backupDir);
  const items = await Promise.all(
    entries
      .filter(
        (f) =>
          (f.startsWith('backup-') && f.endsWith('.json')) ||
          (f.startsWith('media-') && f.endsWith('.zip')),
      )
      .map(async (filename) => {
        const stat = await fs.stat(path.join(backupDir, filename));
        return { filename, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
      }),
  );
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ items, schemaVersion: BACKUP_SCHEMA_VERSION });
});

const restoreSchema = z.object({
  schemaVersion: z.number(),
  persons: z.array(z.record(z.unknown())).default([]),
  marriages: z.array(z.record(z.unknown())).default([]),
  branches: z.array(z.record(z.unknown())).default([]),
  media: z.array(z.record(z.unknown())).default([]),
});

// Binary companion to the JSON backup: zips the uploads/ directory so a restored
// JSON has matching files on disk. Uses the system `zip` binary (preinstalled on
// macOS/Linux) so we don't pull in another npm dep.
router.post('/media-zip', async (req, res) => {
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/(.+)-\d{3}Z$/, '$1Z');
  const filename = `media-${stamp}.zip`;
  const outPath = path.join(backupDir, filename);
  try {
    // -q quiet, -r recursive. `.` so the zip's top-level matches uploads/ content.
    await execFileP('zip', ['-rq', outPath, '.'], { cwd: uploadDir });
  } catch (err) {
    res.status(500).json({
      error:
        'Không tạo được tệp zip. Đảm bảo lệnh `zip` có sẵn trên hệ thống của máy chủ.',
    });
    return;
  }
  const stat = await fs.stat(outPath).catch(() => null);
  await writeAudit({
    userId: req.user?.sub ?? null,
    action: 'backup.media-zip',
    diff: { filename, sizeBytes: stat?.size ?? null },
  });
  res.json({ filename, sizeBytes: stat?.size ?? null });
});

router.post('/restore', async (req, res) => {
  const force = req.query.force === 'true' || req.query.force === '1';
  const parsed = restoreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Tệp sao lưu sai định dạng' });
    return;
  }
  try {
    const result = await restoreDump(parsed.data, { force });
    await writeAudit({
      userId: req.user?.sub ?? null,
      action: 'backup.restore',
      diff: { force, counts: result.inserted },
    });
    res.json(result);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({
      error: err instanceof Error ? err.message : 'Khôi phục thất bại',
    });
  }
});

export default router;

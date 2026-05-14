import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { env } from '../env.js';
import type { MediaType } from '@roots/shared';

const router = Router();

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const hash = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${hash}${ext}`);
  },
});

const ACCEPTED_MIME: Record<string, MediaType> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'application/pdf': 'pdf',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/mp4': 'audio',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc',
  'text/plain': 'doc',
};

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_MIME[file.mimetype]) cb(null, true);
    else cb(new Error(`Định dạng không hỗ trợ: ${file.mimetype}`));
  },
});

const captionSchema = z.object({ caption: z.string().optional() });

router.use(requireAuth);

router.post(
  '/:personId',
  requireRole('admin', 'editor'),
  upload.single('file'),
  async (req, res) => {
    const personId = req.params.personId;
    if (!personId) {
      res.status(400).json({ error: 'Thiếu personId' });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Thiếu tệp' });
      return;
    }
    const parsedCaption = captionSchema.safeParse(req.body);
    const caption = parsedCaption.success ? parsedCaption.data.caption ?? null : null;
    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      fs.unlink(file.path, () => undefined);
      res.status(404).json({ error: 'Không tìm thấy nhân vật' });
      return;
    }
    const type = ACCEPTED_MIME[file.mimetype] ?? 'doc';
    const media = await prisma.media.create({
      data: {
        personId,
        filePath: `/uploads/${file.filename}`,
        type,
        caption,
      },
    });
    res.status(201).json(media);
  },
);

router.delete('/:id', requireRole('admin', 'editor'), async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'Thiếu id' });
    return;
  }
  const media = await prisma.media.findUnique({ where: { id } });
  if (!media) {
    res.status(404).json({ error: 'Không tìm thấy tệp' });
    return;
  }
  await prisma.media.delete({ where: { id } });
  const filePath = path.join(uploadDir, path.basename(media.filePath));
  // Await the unlink so the response only succeeds after the file is gone.
  // ENOENT is fine — the row's already deleted; nothing to clean up.
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }
  res.json({ ok: true });
});

export default router;

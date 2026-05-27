import { Hono } from 'hono';
import type { AppEnv } from '../types';
import type { MediaType } from '@roots/shared';
import { requireAuth, requireRole } from '../middleware/auth';
import { ACCEPTED_MIME, MAX_MEDIA_BYTES, buildFilename, putMedia, deleteMedia, basename } from '../lib/media';

const media = new Hono<AppEnv>();
media.use('*', requireAuth);

media.post('/:personId', requireRole('admin', 'editor'), async (c) => {
  const personId = c.req.param('personId');
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: 'Thiếu tệp' }, 400);
  }
  // workers-types narrows FormData.get to `string | null`, but workerd returns
  // a File for multipart file fields. Cast through unknown to read it.
  const entry = form.get('file') as unknown;
  if (!entry || typeof entry === 'string') return c.json({ error: 'Thiếu tệp' }, 400);
  const file = entry as File;

  const meta = ACCEPTED_MIME[file.type];
  if (!meta) return c.json({ error: `Định dạng không hỗ trợ: ${file.type}` }, 400);
  if (file.size > MAX_MEDIA_BYTES) return c.json({ error: 'Tệp quá lớn (tối đa 20MB)' }, 400);

  const caption = typeof form.get('caption') === 'string' ? (form.get('caption') as string) : null;
  const prisma = c.get('prisma');
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person) return c.json({ error: 'Không tìm thấy nhân vật' }, 404);

  const filename = buildFilename(file.type)!;
  await putMedia(c.env, filename, await file.arrayBuffer(), file.type);
  const type: MediaType = meta.type;
  const created = await prisma.media.create({
    data: { personId, filePath: `/uploads/${filename}`, type, caption },
  });
  return c.json(created, 201);
});

media.delete('/:id', requireRole('admin', 'editor'), async (c) => {
  const id = c.req.param('id');
  const prisma = c.get('prisma');
  const row = await prisma.media.findUnique({ where: { id } });
  if (!row) return c.json({ error: 'Không tìm thấy tệp' }, 404);
  await prisma.media.delete({ where: { id } });
  await deleteMedia(c.env, basename(row.filePath));
  return c.json({ ok: true });
});

export default media;

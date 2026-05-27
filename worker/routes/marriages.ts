import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { writeAudit } from '../lib/audit';
import { readJson } from '../lib/http';

const createSchema = z.object({
  husbandId: z.string().min(1),
  wifeId: z.string().min(1),
  marriageDate: z.string().optional(),
});

const marriages = new Hono<AppEnv>();
marriages.use('*', requireAuth);

marriages.post('/', requireRole('admin', 'editor'), async (c) => {
  const parsed = createSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: 'Dữ liệu không hợp lệ' }, 400);
  const { husbandId, wifeId, marriageDate } = parsed.data;
  if (husbandId === wifeId) {
    return c.json({ error: 'Chồng và vợ phải là hai người khác nhau' }, 400);
  }
  const prisma = c.get('prisma');
  const existing = await prisma.marriage.findUnique({
    where: { husbandId_wifeId: { husbandId, wifeId } },
  });
  if (existing) return c.json({ error: 'Cặp đôi này đã tồn tại' }, 409);
  const created = await prisma.marriage.create({
    data: { husbandId, wifeId, marriageDate: marriageDate ? new Date(marriageDate) : null },
  });
  await writeAudit(prisma, {
    userId: c.get('user')?.sub ?? null,
    action: 'marriage.create',
    targetType: 'Marriage',
    targetId: created.id,
    diff: { after: created },
  });
  return c.json(created, 201);
});

marriages.delete('/:id', requireRole('admin', 'editor'), async (c) => {
  const id = c.req.param('id');
  const prisma = c.get('prisma');
  const existing = await prisma.marriage.findUnique({ where: { id } });
  await prisma.marriage.delete({ where: { id } });
  await writeAudit(prisma, {
    userId: c.get('user')?.sub ?? null,
    action: 'marriage.delete',
    targetType: 'Marriage',
    targetId: id,
    diff: { before: existing },
  });
  return c.json({ ok: true });
});

export default marriages;

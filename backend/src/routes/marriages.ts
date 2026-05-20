import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../lib/audit.js';

const router = Router();

const createSchema = z.object({
  husbandId: z.string().min(1),
  wifeId: z.string().min(1),
  marriageDate: z.string().optional(),
});

router.use(requireAuth);

router.post('/', requireRole('admin', 'editor'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    return;
  }
  const { husbandId, wifeId, marriageDate } = parsed.data;
  if (husbandId === wifeId) {
    res.status(400).json({ error: 'Chồng và vợ phải là hai người khác nhau' });
    return;
  }
  const existing = await prisma.marriage.findUnique({
    where: { husbandId_wifeId: { husbandId, wifeId } },
  });
  if (existing) {
    res.status(409).json({ error: 'Cặp đôi này đã tồn tại' });
    return;
  }
  const created = await prisma.marriage.create({
    data: {
      husbandId,
      wifeId,
      marriageDate: marriageDate ? new Date(marriageDate) : null,
    },
  });
  await writeAudit({
    userId: req.user?.sub ?? null,
    action: 'marriage.create',
    targetType: 'Marriage',
    targetId: created.id,
    diff: { after: created },
  });
  res.status(201).json(created);
});

router.delete('/:id', requireRole('admin', 'editor'), async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'Thiếu id' });
    return;
  }
  const existing = await prisma.marriage.findUnique({ where: { id } });
  await prisma.marriage.delete({ where: { id } });
  await writeAudit({
    userId: req.user?.sub ?? null,
    action: 'marriage.delete',
    targetType: 'Marriage',
    targetId: id,
    diff: { before: existing },
  });
  res.json({ ok: true });
});

export default router;

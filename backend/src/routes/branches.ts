import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const branchSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
});

router.use(requireAuth);

router.get('/', async (_req, res) => {
  const items = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
  res.json({ items });
});

router.post('/', requireRole('admin', 'editor'), async (req, res) => {
  const parsed = branchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    return;
  }
  const created = await prisma.branch.create({
    data: { name: parsed.data.name, description: parsed.data.description ?? null },
  });
  res.status(201).json(created);
});

export default router;

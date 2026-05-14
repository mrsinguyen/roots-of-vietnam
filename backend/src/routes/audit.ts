import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.string().optional(),
  userId: z.string().optional(),
});

router.use(requireAuth, requireRole('admin'));

router.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Tham số không hợp lệ' });
    return;
  }
  const { limit, offset, action, userId } = parsed.data;
  const where = {
    ...(action ? { action } : {}),
    ...(userId ? { userId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: { user: { select: { username: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({
    items: items.map((it) => ({
      id: it.id,
      action: it.action,
      targetType: it.targetType,
      targetId: it.targetId,
      diff: it.diff ? safeJson(it.diff) : null,
      createdAt: it.createdAt,
      userId: it.userId,
      username: it.user?.username ?? null,
    })),
    total,
  });
});

function safeJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

export default router;

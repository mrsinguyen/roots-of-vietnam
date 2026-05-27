import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.string().optional(),
  userId: z.string().optional(),
});

function safeJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

const audit = new Hono<AppEnv>();
audit.use('*', requireAuth, requireRole('admin'));

audit.get('/', async (c) => {
  const parsed = listSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'Tham số không hợp lệ' }, 400);
  const { limit, offset, action, userId } = parsed.data;
  const where = {
    ...(action ? { action } : {}),
    ...(userId ? { userId } : {}),
  };
  const prisma = c.get('prisma');
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
  return c.json({
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

export default audit;

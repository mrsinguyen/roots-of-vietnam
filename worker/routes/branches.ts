import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { writeAudit } from '../lib/audit';
import { readJson } from '../lib/http';

const branchSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).nullish(),
});

const branches = new Hono<AppEnv>();
branches.use('*', requireAuth);

branches.get('/', async (c) => {
  const items = await c.get('prisma').branch.findMany({ orderBy: { name: 'asc' } });
  return c.json({ items });
});

branches.post('/', requireRole('admin', 'editor'), async (c) => {
  const parsed = branchSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: 'Dữ liệu không hợp lệ' }, 400);
  const prisma = c.get('prisma');
  const created = await prisma.branch.create({
    data: { name: parsed.data.name, description: parsed.data.description ?? null },
  });
  await writeAudit(prisma, {
    userId: c.get('user')?.sub ?? null,
    action: 'branch.create',
    targetType: 'Branch',
    targetId: created.id,
    diff: { after: created },
  });
  return c.json(created, 201);
});

export default branches;

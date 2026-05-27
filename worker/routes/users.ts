import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { hashPassword, PASSWORD_MIN_LENGTH } from '../lib/auth';
import { writeAudit } from '../lib/audit';
import { readJson } from '../lib/http';

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mật khẩu phải tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`);

const createSchema = z.object({
  username: z.string().min(3),
  password: passwordSchema,
  role: z.enum(['admin', 'editor', 'viewer']).default('viewer'),
});

const updateSchema = z.object({
  password: passwordSchema.optional(),
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
});

const users = new Hono<AppEnv>();
users.use('*', requireAuth);

users.get('/', requireRole('admin'), async (c) => {
  const items = await c.get('prisma').user.findMany({
    select: { id: true, username: true, role: true, createdAt: true },
    orderBy: { username: 'asc' },
  });
  return c.json({ items });
});

users.post('/', requireRole('admin'), async (c) => {
  const parsed = createSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: 'Dữ liệu không hợp lệ' }, 400);
  const { username, password, role } = parsed.data;
  const prisma = c.get('prisma');
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return c.json({ error: 'Tên đăng nhập đã tồn tại' }, 409);
  const user = await prisma.user.create({
    data: { username, passwordHash: await hashPassword(password), role },
    select: { id: true, username: true, role: true },
  });
  await writeAudit(prisma, {
    userId: c.get('user')?.sub ?? null,
    action: 'user.create',
    targetType: 'User',
    targetId: user.id,
    diff: { username: user.username, role: user.role },
  });
  return c.json(user, 201);
});

users.patch('/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const parsed = updateSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: 'Dữ liệu không hợp lệ' }, 400);
  const updates: { passwordHash?: string; role?: string } = {};
  if (parsed.data.password) updates.passwordHash = await hashPassword(parsed.data.password);
  if (parsed.data.role) updates.role = parsed.data.role;
  const prisma = c.get('prisma');
  const user = await prisma.user.update({
    where: { id },
    data: updates,
    select: { id: true, username: true, role: true },
  });
  await writeAudit(prisma, {
    userId: c.get('user')?.sub ?? null,
    action: 'user.update',
    targetType: 'User',
    targetId: id,
    diff: { fields: Object.keys(updates) },
  });
  return c.json(user);
});

export default users;

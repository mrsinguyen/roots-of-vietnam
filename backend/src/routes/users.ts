import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { hashPassword, PASSWORD_MIN_LENGTH } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';

const router = Router();

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

router.use(requireAuth);

router.get('/', requireRole('admin'), async (_req, res) => {
  const items = await prisma.user.findMany({
    select: { id: true, username: true, role: true, createdAt: true },
    orderBy: { username: 'asc' },
  });
  res.json({ items });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    return;
  }
  const { username, password, role } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    return;
  }
  const user = await prisma.user.create({
    data: { username, passwordHash: await hashPassword(password), role },
    select: { id: true, username: true, role: true },
  });
  await writeAudit({
    userId: req.user?.sub ?? null,
    action: 'user.create',
    targetType: 'User',
    targetId: user.id,
    diff: { username: user.username, role: user.role },
  });
  res.status(201).json(user);
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'Thiếu id' });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    return;
  }
  const updates: { passwordHash?: string; role?: string } = {};
  if (parsed.data.password) updates.passwordHash = await hashPassword(parsed.data.password);
  if (parsed.data.role) updates.role = parsed.data.role;
  const user = await prisma.user.update({
    where: { id },
    data: updates,
    select: { id: true, username: true, role: true },
  });
  await writeAudit({
    userId: req.user?.sub ?? null,
    action: 'user.update',
    targetType: 'User',
    targetId: id,
    diff: { fields: Object.keys(updates) },
  });
  res.json(user);
});

export default router;

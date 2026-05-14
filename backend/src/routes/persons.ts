import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { computeGeneration } from '../lib/generation.js';
import { normalizeName } from '../lib/normalize.js';
import { writeAudit } from '../lib/audit.js';
import { detectCycle } from '../lib/cycle.js';

const router = Router();

const genderEnum = z.enum(['Nam', 'Nu', 'Khac']);

const yearInt = z.number().int().min(-5000).max(9999);
const monthInt = z.number().int().min(1).max(12);
const dayInt = z.number().int().min(1).max(31);

const nullableInt = (inner: z.ZodNumber) =>
  z.union([inner, z.null()]).optional().transform((v) => (v === undefined ? undefined : v));

const personCreateSchema = z.object({
  fullName: z.string().min(1, 'Họ tên không được để trống'),
  honorific: z.string().max(20).nullish(),
  gender: genderEnum,
  birthYear: nullableInt(yearInt),
  birthMonth: nullableInt(monthInt),
  birthDay: nullableInt(dayInt),
  deathYear: nullableInt(yearInt),
  deathMonth: nullableInt(monthInt),
  deathDay: nullableInt(dayInt),
  birthDateLunar: z.string().max(60).nullish(),
  deathDateLunar: z.string().max(60).nullish(),
  biography: z.string().nullish(),
  occupation: z.string().nullish(),
  burialPlace: z.string().nullish(),
  notes: z.string().nullish(),
  branchId: z.string().nullish(),
  fatherId: z.string().nullish(),
  motherId: z.string().nullish(),
});

const personUpdateSchema = personCreateSchema.partial();

const searchSchema = z.object({
  q: z.string().optional(),
  generation: z.coerce.number().int().optional(),
  branchId: z.string().optional(),
  birthYear: z.coerce.number().int().optional(),
  location: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.use(requireAuth);

router.get('/', async (req, res) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Tham số tìm kiếm không hợp lệ' });
    return;
  }
  const { q, generation, branchId, birthYear, location, limit, offset } = parsed.data;

  const filters: Prisma.PersonWhereInput[] = [];

  if (q) filters.push({ nameNormalized: { contains: normalizeName(q) } });
  if (generation !== undefined) filters.push({ generation });
  if (branchId) filters.push({ branchId });
  if (birthYear) filters.push({ birthYear });
  if (location) {
    filters.push({
      OR: [{ burialPlace: { contains: location } }, { notes: { contains: location } }],
    });
  }
  const where: Prisma.PersonWhereInput = filters.length > 0 ? { AND: filters } : {};

  const [items, total] = await Promise.all([
    prisma.person.findMany({
      where,
      // Generation asc, then birth year asc (nulls last via secondary order).
      orderBy: [{ generation: 'asc' }, { birthYear: 'asc' }, { fullName: 'asc' }],
      skip: offset,
      take: limit,
    }),
    prisma.person.count({ where }),
  ]);
  // Push birthYear-null rows to the end of the page since SQLite sorts NULL first.
  items.sort((a, b) => {
    if (a.generation !== b.generation) return a.generation - b.generation;
    const ay = a.birthYear ?? Number.POSITIVE_INFINITY;
    const by = b.birthYear ?? Number.POSITIVE_INFINITY;
    if (ay !== by) return ay - by;
    return a.fullName.localeCompare(b.fullName);
  });
  res.json({ items, total });
});

router.get('/tree', async (_req, res) => {
  const persons = await prisma.person.findMany({
    orderBy: [{ generation: 'asc' }, { birthYear: 'asc' }, { fullName: 'asc' }],
    include: {
      marriagesAsHusband: { select: { id: true, wifeId: true, marriageDate: true } },
      marriagesAsWife: { select: { id: true, husbandId: true, marriageDate: true } },
    },
  });
  res.json({ items: persons });
});

router.get('/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'Thiếu id' });
    return;
  }
  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      father: true,
      mother: true,
      branch: true,
      media: true,
      childrenAsFather: { orderBy: [{ birthYear: 'asc' }, { fullName: 'asc' }] },
      childrenAsMother: { orderBy: [{ birthYear: 'asc' }, { fullName: 'asc' }] },
      marriagesAsHusband: { include: { wife: true } },
      marriagesAsWife: { include: { husband: true } },
    },
  });
  if (!person) {
    res.status(404).json({ error: 'Không tìm thấy nhân vật' });
    return;
  }
  res.json(person);
});

router.post('/', requireRole('admin', 'editor'), async (req, res) => {
  const parsed = personCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dữ liệu không hợp lệ', issues: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const generation = await computeGeneration(data.fatherId ?? null, data.motherId ?? null);
  const created = await prisma.person.create({
    data: {
      fullName: data.fullName,
      nameNormalized: normalizeName(data.fullName),
      honorific: data.honorific ?? null,
      gender: data.gender,
      birthYear: data.birthYear ?? null,
      birthMonth: data.birthMonth ?? null,
      birthDay: data.birthDay ?? null,
      deathYear: data.deathYear ?? null,
      deathMonth: data.deathMonth ?? null,
      deathDay: data.deathDay ?? null,
      birthDateLunar: data.birthDateLunar ?? null,
      deathDateLunar: data.deathDateLunar ?? null,
      biography: data.biography ?? null,
      occupation: data.occupation ?? null,
      burialPlace: data.burialPlace ?? null,
      notes: data.notes ?? null,
      branchId: data.branchId ?? null,
      fatherId: data.fatherId ?? null,
      motherId: data.motherId ?? null,
      generation,
    },
  });
  await writeAudit({
    userId: req.user?.sub ?? null,
    action: 'person.create',
    targetType: 'Person',
    targetId: created.id,
    diff: { after: created },
  });
  res.status(201).json(created);
});

router.patch('/:id', requireRole('admin', 'editor'), async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'Thiếu id' });
    return;
  }
  const parsed = personUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dữ liệu không hợp lệ', issues: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Không tìm thấy nhân vật' });
    return;
  }
  const data = parsed.data;
  const fatherId = data.fatherId === undefined ? existing.fatherId : data.fatherId ?? null;
  const motherId = data.motherId === undefined ? existing.motherId : data.motherId ?? null;
  if (fatherId === id || motherId === id) {
    res.status(400).json({ error: 'Một người không thể là cha/mẹ của chính mình' });
    return;
  }

  for (const parentId of [fatherId, motherId]) {
    if (!parentId) continue;
    if (await detectCycle(id, parentId)) {
      res
        .status(422)
        .json({ error: 'Cập nhật sẽ tạo vòng quan hệ cha/mẹ — không thể lưu' });
      return;
    }
  }

  const generation =
    fatherId !== existing.fatherId || motherId !== existing.motherId
      ? await computeGeneration(fatherId, motherId)
      : existing.generation;

  const newFullName = data.fullName ?? existing.fullName;
  const updated = await prisma.person.update({
    where: { id },
    data: {
      fullName: newFullName,
      nameNormalized:
        data.fullName !== undefined ? normalizeName(data.fullName) : existing.nameNormalized,
      honorific: data.honorific === undefined ? existing.honorific : data.honorific ?? null,
      gender: data.gender ?? existing.gender,
      birthYear: data.birthYear === undefined ? existing.birthYear : data.birthYear ?? null,
      birthMonth: data.birthMonth === undefined ? existing.birthMonth : data.birthMonth ?? null,
      birthDay: data.birthDay === undefined ? existing.birthDay : data.birthDay ?? null,
      deathYear: data.deathYear === undefined ? existing.deathYear : data.deathYear ?? null,
      deathMonth: data.deathMonth === undefined ? existing.deathMonth : data.deathMonth ?? null,
      deathDay: data.deathDay === undefined ? existing.deathDay : data.deathDay ?? null,
      birthDateLunar:
        data.birthDateLunar === undefined
          ? existing.birthDateLunar
          : data.birthDateLunar ?? null,
      deathDateLunar:
        data.deathDateLunar === undefined
          ? existing.deathDateLunar
          : data.deathDateLunar ?? null,
      biography: data.biography === undefined ? existing.biography : data.biography ?? null,
      occupation: data.occupation === undefined ? existing.occupation : data.occupation ?? null,
      burialPlace: data.burialPlace === undefined ? existing.burialPlace : data.burialPlace ?? null,
      notes: data.notes === undefined ? existing.notes : data.notes ?? null,
      branchId: data.branchId === undefined ? existing.branchId : data.branchId ?? null,
      fatherId,
      motherId,
      generation,
    },
  });
  await writeAudit({
    userId: req.user?.sub ?? null,
    action: 'person.update',
    targetType: 'Person',
    targetId: id,
    diff: { before: existing, after: updated },
  });
  res.json(updated);
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: 'Thiếu id' });
    return;
  }
  const childCount = await prisma.person.count({
    where: { OR: [{ fatherId: id }, { motherId: id }] },
  });
  if (childCount > 0) {
    res.status(400).json({ error: 'Không thể xóa: nhân vật còn con cháu trong cây' });
    return;
  }
  const existing = await prisma.person.findUnique({ where: { id } });
  await prisma.marriage.deleteMany({ where: { OR: [{ husbandId: id }, { wifeId: id }] } });
  await prisma.person.delete({ where: { id } });
  await writeAudit({
    userId: req.user?.sub ?? null,
    action: 'person.delete',
    targetType: 'Person',
    targetId: id,
    diff: { before: existing },
  });
  res.json({ ok: true });
});

export default router;

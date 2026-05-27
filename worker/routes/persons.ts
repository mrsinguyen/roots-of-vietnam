import { Hono } from 'hono';
import { z } from 'zod';
import type { Prisma } from '../../prisma/generated';
import type { AppEnv } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { computeGeneration, detectCycle } from '../lib/genealogy';
import { normalizeName } from '../lib/normalize';
import { writeAudit } from '../lib/audit';
import { readJson } from '../lib/http';

const genderEnum = z.enum(['Nam', 'Nu', 'Khac']);
const yearInt = z.number().int().min(-5000).max(9999);
const monthInt = z.number().int().min(1).max(12);
const dayInt = z.number().int().min(1).max(31);

const nullableInt = (inner: z.ZodNumber) =>
  z.union([inner, z.null()]).optional().transform((v) => (v === undefined ? undefined : v));

const personCreateSchema = z.object({
  fullName: z.string().min(1, 'Họ tên không được để trống').max(200),
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
  biography: z.string().max(10_000).nullish(),
  occupation: z.string().max(200).nullish(),
  burialPlace: z.string().max(500).nullish(),
  notes: z.string().max(5_000).nullish(),
  branchId: z.string().max(50).nullish(),
  fatherId: z.string().max(50).nullish(),
  motherId: z.string().max(50).nullish(),
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

const persons = new Hono<AppEnv>();
persons.use('*', requireAuth);

persons.get('/', async (c) => {
  const parsed = searchSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'Tham số tìm kiếm không hợp lệ' }, 400);
  const { q, generation, branchId, birthYear, location, limit, offset } = parsed.data;
  const prisma = c.get('prisma');

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
  return c.json({ items, total });
});

persons.get('/tree', async (c) => {
  const items = await c.get('prisma').person.findMany({
    orderBy: [{ generation: 'asc' }, { birthYear: 'asc' }, { fullName: 'asc' }],
    include: {
      marriagesAsHusband: { select: { id: true, wifeId: true, marriageDate: true } },
      marriagesAsWife: { select: { id: true, husbandId: true, marriageDate: true } },
    },
  });
  return c.json({ items });
});

persons.get('/:id', async (c) => {
  const id = c.req.param('id');
  const person = await c.get('prisma').person.findUnique({
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
  if (!person) return c.json({ error: 'Không tìm thấy nhân vật' }, 404);
  return c.json(person);
});

persons.post('/', requireRole('admin', 'editor'), async (c) => {
  const parsed = personCreateSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: 'Dữ liệu không hợp lệ', issues: parsed.error.flatten() }, 400);
  const data = parsed.data;
  const prisma = c.get('prisma');
  const generation = await computeGeneration(prisma, data.fatherId ?? null, data.motherId ?? null);
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
  await writeAudit(prisma, {
    userId: c.get('user')?.sub ?? null,
    action: 'person.create',
    targetType: 'Person',
    targetId: created.id,
    diff: { after: created },
  });
  return c.json(created, 201);
});

persons.patch('/:id', requireRole('admin', 'editor'), async (c) => {
  const id = c.req.param('id');
  const parsed = personUpdateSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: 'Dữ liệu không hợp lệ', issues: parsed.error.flatten() }, 400);
  const prisma = c.get('prisma');
  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) return c.json({ error: 'Không tìm thấy nhân vật' }, 404);

  const data = parsed.data;
  const fatherId = data.fatherId === undefined ? existing.fatherId : data.fatherId ?? null;
  const motherId = data.motherId === undefined ? existing.motherId : data.motherId ?? null;
  if (fatherId === id || motherId === id) {
    return c.json({ error: 'Một người không thể là cha/mẹ của chính mình' }, 400);
  }
  for (const parentId of [fatherId, motherId]) {
    if (!parentId) continue;
    if (await detectCycle(prisma, id, parentId)) {
      return c.json({ error: 'Cập nhật sẽ tạo vòng quan hệ cha/mẹ — không thể lưu' }, 422);
    }
  }

  const generation =
    fatherId !== existing.fatherId || motherId !== existing.motherId
      ? await computeGeneration(prisma, fatherId, motherId)
      : existing.generation;

  const updated = await prisma.person.update({
    where: { id },
    data: {
      fullName: data.fullName ?? existing.fullName,
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
        data.birthDateLunar === undefined ? existing.birthDateLunar : data.birthDateLunar ?? null,
      deathDateLunar:
        data.deathDateLunar === undefined ? existing.deathDateLunar : data.deathDateLunar ?? null,
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
  await writeAudit(prisma, {
    userId: c.get('user')?.sub ?? null,
    action: 'person.update',
    targetType: 'Person',
    targetId: id,
    diff: { before: existing, after: updated },
  });
  return c.json(updated);
});

persons.delete('/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const prisma = c.get('prisma');
  const childCount = await prisma.person.count({
    where: { OR: [{ fatherId: id }, { motherId: id }] },
  });
  if (childCount > 0) {
    return c.json({ error: 'Không thể xóa: nhân vật còn con cháu trong cây' }, 400);
  }
  const existing = await prisma.person.findUnique({ where: { id } });
  await prisma.marriage.deleteMany({ where: { OR: [{ husbandId: id }, { wifeId: id }] } });
  await prisma.person.delete({ where: { id } });
  await writeAudit(prisma, {
    userId: c.get('user')?.sub ?? null,
    action: 'person.delete',
    targetType: 'Person',
    targetId: id,
    diff: { before: existing },
  });
  return c.json({ ok: true });
});

export default persons;

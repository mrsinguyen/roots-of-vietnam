import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, getPrisma, truncateAll } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { createBranch, createPerson } from '../factories';

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp();
});
beforeEach(async () => {
  await truncateAll();
});

describe('GET /api/persons', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/persons');
    expect(res.status).toBe(401);
  });

  it('lists all persons with pagination metadata', async () => {
    const admin = await loginAs(app, 'admin');
    await createPerson({ fullName: 'A' });
    await createPerson({ fullName: 'B' });
    const res = await request(app).get('/api/persons').set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('matches diacritic-insensitively on q', async () => {
    const admin = await loginAs(app, 'admin');
    await createPerson({ fullName: 'Nguyễn Văn Á' });
    await createPerson({ fullName: 'Lê Thị B' });
    const res = await request(app)
      .get('/api/persons?q=nguyen')
      .set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].fullName).toBe('Nguyễn Văn Á');
  });

  it('filters by birthYear', async () => {
    const admin = await loginAs(app, 'admin');
    await createPerson({ fullName: 'Old', birthYear: 1900 });
    await createPerson({ fullName: 'New', birthYear: 2000 });
    const res = await request(app)
      .get('/api/persons?birthYear=2000')
      .set('Cookie', admin.cookie);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].fullName).toBe('New');
  });

  it('filters by generation', async () => {
    const admin = await loginAs(app, 'admin');
    await createPerson({ fullName: 'G1', generation: 1 });
    await createPerson({ fullName: 'G2', generation: 2 });
    const res = await request(app)
      .get('/api/persons?generation=2')
      .set('Cookie', admin.cookie);
    expect(res.body.items).toHaveLength(1);
  });

  it('filters by branchId', async () => {
    const admin = await loginAs(app, 'admin');
    const b = await createBranch('Trưởng');
    await createPerson({ fullName: 'In', branchId: b.id });
    await createPerson({ fullName: 'Out' });
    const res = await request(app)
      .get(`/api/persons?branchId=${b.id}`)
      .set('Cookie', admin.cookie);
    expect(res.body.items).toHaveLength(1);
  });

  it('filters by location (matches notes or burialPlace)', async () => {
    const admin = await loginAs(app, 'admin');
    const prisma = await getPrisma();
    await prisma.person.create({
      data: {
        fullName: 'A',
        nameNormalized: 'a',
        gender: 'Nam',
        generation: 1,
        burialPlace: 'Đà Nẵng',
      },
    });
    await prisma.person.create({
      data: {
        fullName: 'B',
        nameNormalized: 'b',
        gender: 'Nam',
        generation: 1,
      },
    });
    const res = await request(app)
      .get('/api/persons?location=Nẵng')
      .set('Cookie', admin.cookie);
    expect(res.body.items).toHaveLength(1);
  });

  it('honors limit + offset', async () => {
    const admin = await loginAs(app, 'admin');
    for (let i = 0; i < 5; i++) await createPerson({ fullName: `P${i}` });
    const res = await request(app)
      .get('/api/persons?limit=2&offset=1')
      .set('Cookie', admin.cookie);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(5);
  });

  it('returns 400 for non-numeric limit', async () => {
    const admin = await loginAs(app, 'admin');
    const res = await request(app)
      .get('/api/persons?limit=abc')
      .set('Cookie', admin.cookie);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/persons', () => {
  it('viewer cannot create (403)', async () => {
    const viewer = await loginAs(app, 'viewer');
    const res = await request(app)
      .post('/api/persons')
      .set('Cookie', viewer.cookie)
      .send({ fullName: 'X', gender: 'Nam' });
    expect(res.status).toBe(403);
  });

  it('editor can create; generation defaults to 1', async () => {
    const editor = await loginAs(app, 'editor');
    const res = await request(app)
      .post('/api/persons')
      .set('Cookie', editor.cookie)
      .send({ fullName: 'Founder', gender: 'Nam' });
    expect(res.status).toBe(201);
    expect(res.body.generation).toBe(1);
    expect(res.body.nameNormalized).toBe('founder');
  });

  it('auto-computes generation from father', async () => {
    const editor = await loginAs(app, 'editor');
    const father = await createPerson({ fullName: 'F', generation: 3 });
    const res = await request(app)
      .post('/api/persons')
      .set('Cookie', editor.cookie)
      .send({ fullName: 'Son', gender: 'Nam', fatherId: father.id });
    expect(res.body.generation).toBe(4);
  });

  it('rejects missing fullName (400)', async () => {
    const editor = await loginAs(app, 'editor');
    const res = await request(app)
      .post('/api/persons')
      .set('Cookie', editor.cookie)
      .send({ gender: 'Nam' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid gender', async () => {
    const editor = await loginAs(app, 'editor');
    const res = await request(app)
      .post('/api/persons')
      .set('Cookie', editor.cookie)
      .send({ fullName: 'X', gender: 'Mystery' });
    expect(res.status).toBe(400);
  });

  it('writes a person.create audit row with after diff', async () => {
    const editor = await loginAs(app, 'editor');
    await request(app)
      .post('/api/persons')
      .set('Cookie', editor.cookie)
      .send({ fullName: 'Audited', gender: 'Nam' });
    const prisma = await getPrisma();
    const rows = await prisma.auditLog.findMany({ where: { action: 'person.create' } });
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.diff!).after.fullName).toBe('Audited');
  });
});

describe('PATCH /api/persons/:id', () => {
  it('rejects setting fatherId equal to self (400)', async () => {
    const admin = await loginAs(app, 'admin');
    const p = await createPerson({ fullName: 'Loop' });
    const res = await request(app)
      .patch(`/api/persons/${p.id}`)
      .set('Cookie', admin.cookie)
      .send({ fatherId: p.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cha\/mẹ của chính mình/);
  });

  it('returns 422 with VN error when the update would close an ancestry cycle', async () => {
    const editor = await loginAs(app, 'editor');
    const a = await createPerson({ fullName: 'A' });
    const b = await createPerson({ fullName: 'B', fatherId: a.id, generation: 2 });
    const res = await request(app)
      .patch(`/api/persons/${a.id}`)
      .set('Cookie', editor.cookie)
      .send({ fatherId: b.id });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/vòng quan hệ/);
  });

  it('updates and re-computes generation when parent changes', async () => {
    const editor = await loginAs(app, 'editor');
    const oldDad = await createPerson({ generation: 2 });
    const newDad = await createPerson({ generation: 5 });
    const child = await createPerson({ fatherId: oldDad.id, generation: 3 });
    const res = await request(app)
      .patch(`/api/persons/${child.id}`)
      .set('Cookie', editor.cookie)
      .send({ fatherId: newDad.id });
    expect(res.status).toBe(200);
    expect(res.body.generation).toBe(6);
  });

  it('returns 404 when target missing', async () => {
    const editor = await loginAs(app, 'editor');
    const res = await request(app)
      .patch('/api/persons/missing-id')
      .set('Cookie', editor.cookie)
      .send({ fullName: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/persons/:id', () => {
  it('editor cannot delete (403)', async () => {
    const editor = await loginAs(app, 'editor');
    const p = await createPerson({});
    const res = await request(app)
      .delete(`/api/persons/${p.id}`)
      .set('Cookie', editor.cookie);
    expect(res.status).toBe(403);
  });

  it('admin can delete a person with no children', async () => {
    const admin = await loginAs(app, 'admin');
    const p = await createPerson({});
    const res = await request(app)
      .delete(`/api/persons/${p.id}`)
      .set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
  });

  it('refuses to delete a person who has children', async () => {
    const admin = await loginAs(app, 'admin');
    const dad = await createPerson({});
    await createPerson({ fatherId: dad.id, generation: 2 });
    const res = await request(app)
      .delete(`/api/persons/${dad.id}`)
      .set('Cookie', admin.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/con cháu/);
  });
});

describe('GET /api/persons/:id', () => {
  it('returns 404 for unknown id', async () => {
    const admin = await loginAs(app, 'admin');
    const res = await request(app)
      .get('/api/persons/no-such')
      .set('Cookie', admin.cookie);
    expect(res.status).toBe(404);
  });

  it('returns the person with father/mother includes', async () => {
    const admin = await loginAs(app, 'admin');
    const dad = await createPerson({ fullName: 'Dad' });
    const mom = await createPerson({ fullName: 'Mom', gender: 'Nu' });
    const child = await createPerson({
      fullName: 'Child',
      fatherId: dad.id,
      motherId: mom.id,
      generation: 2,
    });
    const res = await request(app)
      .get(`/api/persons/${child.id}`)
      .set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body.father.fullName).toBe('Dad');
    expect(res.body.mother.fullName).toBe('Mom');
  });
});

describe('GET /api/persons/tree', () => {
  it('returns all persons with marriage edges', async () => {
    const admin = await loginAs(app, 'admin');
    const dad = await createPerson({});
    const mom = await createPerson({ gender: 'Nu' });
    const prisma = await getPrisma();
    await prisma.marriage.create({
      data: { husbandId: dad.id, wifeId: mom.id },
    });
    const res = await request(app).get('/api/persons/tree').set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    const husband = res.body.items.find(
      (p: { id: string; marriagesAsHusband: unknown[] }) => p.id === dad.id,
    );
    expect(husband.marriagesAsHusband).toHaveLength(1);
  });
});

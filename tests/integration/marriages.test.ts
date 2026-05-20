import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, getPrisma, truncateAll } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { createPerson } from '../factories';

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp();
});
beforeEach(async () => {
  await truncateAll();
});

describe('POST /api/marriages', () => {
  it('viewer is blocked (403)', async () => {
    const viewer = await loginAs(app, 'viewer');
    const res = await request(app)
      .post('/api/marriages')
      .set('Cookie', viewer.cookie)
      .send({ husbandId: 'x', wifeId: 'y' });
    expect(res.status).toBe(403);
  });

  it('rejects husband == wife (400)', async () => {
    const editor = await loginAs(app, 'editor');
    const p = await createPerson({});
    const res = await request(app)
      .post('/api/marriages')
      .set('Cookie', editor.cookie)
      .send({ husbandId: p.id, wifeId: p.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/khác nhau/);
  });

  it('returns 409 when a marriage already exists for the same pair', async () => {
    const editor = await loginAs(app, 'editor');
    const h = await createPerson({});
    const w = await createPerson({ gender: 'Nu' });
    await request(app)
      .post('/api/marriages')
      .set('Cookie', editor.cookie)
      .send({ husbandId: h.id, wifeId: w.id })
      .expect(201);
    const dup = await request(app)
      .post('/api/marriages')
      .set('Cookie', editor.cookie)
      .send({ husbandId: h.id, wifeId: w.id });
    expect(dup.status).toBe(409);
  });

  it('allows polygamy (same husband, two wives)', async () => {
    const editor = await loginAs(app, 'editor');
    const h = await createPerson({});
    const w1 = await createPerson({ gender: 'Nu' });
    const w2 = await createPerson({ gender: 'Nu' });
    const r1 = await request(app)
      .post('/api/marriages')
      .set('Cookie', editor.cookie)
      .send({ husbandId: h.id, wifeId: w1.id });
    const r2 = await request(app)
      .post('/api/marriages')
      .set('Cookie', editor.cookie)
      .send({ husbandId: h.id, wifeId: w2.id });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
  });

  it('accepts an optional marriageDate', async () => {
    const editor = await loginAs(app, 'editor');
    const h = await createPerson({});
    const w = await createPerson({ gender: 'Nu' });
    const res = await request(app)
      .post('/api/marriages')
      .set('Cookie', editor.cookie)
      .send({ husbandId: h.id, wifeId: w.id, marriageDate: '1990-05-12' });
    expect(res.status).toBe(201);
    expect(new Date(res.body.marriageDate).getUTCFullYear()).toBe(1990);
  });
});

describe('DELETE /api/marriages/:id', () => {
  it('editor can delete an existing marriage', async () => {
    const editor = await loginAs(app, 'editor');
    const h = await createPerson({});
    const w = await createPerson({ gender: 'Nu' });
    const prisma = await getPrisma();
    const m = await prisma.marriage.create({ data: { husbandId: h.id, wifeId: w.id } });
    const res = await request(app)
      .delete(`/api/marriages/${m.id}`)
      .set('Cookie', editor.cookie);
    expect(res.status).toBe(200);
    expect(await prisma.marriage.count()).toBe(0);
  });
});

describe('marriage audit', () => {
  it('writes marriage.create and marriage.delete audit rows', async () => {
    const editor = await loginAs(app, 'editor');
    const prisma = await getPrisma();
    const h = await createPerson({});
    const w = await createPerson({ gender: 'Nu' });
    const created = await request(app)
      .post('/api/marriages')
      .set('Cookie', editor.cookie)
      .send({ husbandId: h.id, wifeId: w.id })
      .expect(201);
    await request(app)
      .delete(`/api/marriages/${created.body.id}`)
      .set('Cookie', editor.cookie)
      .expect(200);
    const actions = (
      await prisma.auditLog.findMany({ where: { targetType: 'Marriage' }, orderBy: { createdAt: 'asc' } })
    ).map((r) => r.action);
    expect(actions).toEqual(['marriage.create', 'marriage.delete']);
  });
});

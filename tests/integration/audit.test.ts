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

describe('/api/audit', () => {
  it('non-admin → 403', async () => {
    const viewer = await loginAs(app, 'viewer');
    const res = await request(app).get('/api/audit').set('Cookie', viewer.cookie);
    expect(res.status).toBe(403);
  });

  it('admin sees an audit row after editing a person', async () => {
    const admin = await loginAs(app, 'admin');
    const p = await createPerson({});
    await request(app)
      .patch(`/api/persons/${p.id}`)
      .set('Cookie', admin.cookie)
      .send({ occupation: 'New job' });
    const res = await request(app).get('/api/audit').set('Cookie', admin.cookie);
    const rows = res.body.items as Array<{ action: string; diff: unknown }>;
    const update = rows.find((r) => r.action === 'person.update');
    expect(update).toBeDefined();
    expect(update?.diff).toMatchObject({
      after: expect.objectContaining({ occupation: 'New job' }),
    });
  });

  it('filters by action', async () => {
    const admin = await loginAs(app, 'admin');
    const prisma = await getPrisma();
    await prisma.auditLog.create({ data: { action: 'foo' } });
    await prisma.auditLog.create({ data: { action: 'bar' } });
    const res = await request(app)
      .get('/api/audit?action=foo')
      .set('Cookie', admin.cookie);
    const actions = res.body.items.map((i: { action: string }) => i.action);
    expect(actions).toContain('foo');
    expect(actions).not.toContain('bar');
  });
});

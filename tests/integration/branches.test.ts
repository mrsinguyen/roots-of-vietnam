import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, truncateAll } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { createBranch } from '../factories';

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp();
});
beforeEach(async () => {
  await truncateAll();
});

describe('/api/branches', () => {
  it('GET requires auth', async () => {
    const res = await request(app).get('/api/branches');
    expect(res.status).toBe(401);
  });

  it('GET returns the list sorted by name', async () => {
    const admin = await loginAs(app, 'admin');
    await createBranch('Bravo');
    await createBranch('Alpha');
    const res = await request(app).get('/api/branches').set('Cookie', admin.cookie);
    expect(res.body.items.map((b: { name: string }) => b.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('POST viewer → 403', async () => {
    const viewer = await loginAs(app, 'viewer');
    const res = await request(app)
      .post('/api/branches')
      .set('Cookie', viewer.cookie)
      .send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  it('POST editor creates a branch', async () => {
    const editor = await loginAs(app, 'editor');
    const res = await request(app)
      .post('/api/branches')
      .set('Cookie', editor.cookie)
      .send({ name: 'Chi mới', description: 'desc' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Chi mới');
  });

  it('POST rejects an empty name', async () => {
    const editor = await loginAs(app, 'editor');
    const res = await request(app)
      .post('/api/branches')
      .set('Cookie', editor.cookie)
      .send({ name: '' });
    expect(res.status).toBe(400);
  });
});

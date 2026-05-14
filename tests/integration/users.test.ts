import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, truncateAll } from '../helpers/app';
import { loginAs } from '../helpers/auth';

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp();
});
beforeEach(async () => {
  await truncateAll();
});

describe('/api/users', () => {
  it('non-admin GET → 403', async () => {
    const viewer = await loginAs(app, 'viewer');
    const res = await request(app).get('/api/users').set('Cookie', viewer.cookie);
    expect(res.status).toBe(403);
  });

  it('admin GET lists users', async () => {
    const admin = await loginAs(app, 'admin');
    const res = await request(app).get('/api/users').set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body.items.find((u: { username: string }) => u.username === admin.username)).toBeDefined();
  });

  it('POST rejects passwords shorter than 10 characters', async () => {
    const admin = await loginAs(app, 'admin');
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', admin.cookie)
      .send({ username: 'short', password: 'short1', role: 'viewer' });
    expect(res.status).toBe(400);
  });

  it('POST creates a user with a valid 10+ char password', async () => {
    const admin = await loginAs(app, 'admin');
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', admin.cookie)
      .send({ username: 'newviewer', password: 'longenoughpw1', role: 'viewer' });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('newviewer');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('POST 409 on duplicate username', async () => {
    const admin = await loginAs(app, 'admin');
    await request(app)
      .post('/api/users')
      .set('Cookie', admin.cookie)
      .send({ username: 'dup', password: 'longenoughpw1', role: 'viewer' });
    const dup = await request(app)
      .post('/api/users')
      .set('Cookie', admin.cookie)
      .send({ username: 'dup', password: 'longenoughpw1', role: 'viewer' });
    expect(dup.status).toBe(409);
  });

  it('PATCH updates role', async () => {
    const admin = await loginAs(app, 'admin');
    const create = await request(app)
      .post('/api/users')
      .set('Cookie', admin.cookie)
      .send({ username: 'promote', password: 'longenoughpw1', role: 'viewer' });
    const res = await request(app)
      .patch(`/api/users/${create.body.id}`)
      .set('Cookie', admin.cookie)
      .send({ role: 'editor' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('editor');
  });

  it('PATCH rejects short password', async () => {
    const admin = await loginAs(app, 'admin');
    const create = await request(app)
      .post('/api/users')
      .set('Cookie', admin.cookie)
      .send({ username: 'pw', password: 'longenoughpw1', role: 'viewer' });
    const res = await request(app)
      .patch(`/api/users/${create.body.id}`)
      .set('Cookie', admin.cookie)
      .send({ password: 'short' });
    expect(res.status).toBe(400);
  });
});

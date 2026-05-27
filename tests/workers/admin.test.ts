import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { harness, type Harness } from './helpers/app';

let h: Harness;
beforeAll(async () => {
  h = await harness();
});
afterEach(() => h.reset());

describe('users (admin only)', () => {
  it('editor cannot list users (403)', async () => {
    const cookie = await h.loginAs('editor');
    expect((await h.api('GET', '/api/users', { cookie })).status).toBe(403);
  });

  it('admin lists, creates, rejects short password + duplicate username', async () => {
    const cookie = await h.loginAs('admin');
    expect((await h.api('GET', '/api/users', { cookie })).status).toBe(200);

    const create = await h.api('POST', '/api/users', {
      cookie,
      body: { username: 'newbie', password: 'longenoughpw1', role: 'editor' },
    });
    expect(create.status).toBe(201);
    expect((await create.json()).role).toBe('editor');

    const short = await h.api('POST', '/api/users', { cookie, body: { username: 'shorty', password: 'abc' } });
    expect(short.status).toBe(400);

    const dup = await h.api('POST', '/api/users', { cookie, body: { username: 'newbie', password: 'longenoughpw1' } });
    expect(dup.status).toBe(409);
  });

  it('admin updates a user role', async () => {
    const cookie = await h.loginAs('admin');
    const created = (await (
      await h.api('POST', '/api/users', { cookie, body: { username: 'promote', password: 'longenoughpw1' } })
    ).json()) as { id: string };
    const res = await h.api('PATCH', `/api/users/${created.id}`, { cookie, body: { role: 'admin' } });
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe('admin');
  });
});

describe('audit (admin only)', () => {
  it('editor is blocked (403)', async () => {
    const cookie = await h.loginAs('editor');
    expect((await h.api('GET', '/api/audit', { cookie })).status).toBe(403);
  });

  it('admin lists audit entries with parsed diff + username', async () => {
    const cookie = await h.loginAs('admin');
    // generate an auditable action
    await h.api('POST', '/api/branches', { cookie, body: { name: 'Chi Ghi Log' } });
    const res = await h.api('GET', '/api/audit', { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ action: string; diff: unknown }>; total: number };
    expect(body.total).toBeGreaterThan(0);
    expect(body.items.some((it) => it.action === 'branch.create')).toBe(true);
  });

  it('filters by action', async () => {
    const cookie = await h.loginAs('admin');
    await h.api('POST', '/api/branches', { cookie, body: { name: 'Chi Lọc' } });
    const res = await h.api('GET', '/api/audit?action=branch.create', { cookie });
    const body = (await res.json()) as { items: Array<{ action: string }> };
    expect(body.items.every((it) => it.action === 'branch.create')).toBe(true);
  });
});

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { harness, type Harness } from './helpers/app';

describe('worker smoke', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await harness();
  });
  afterEach(() => h.reset());

  it('health responds', async () => {
    const res = await h.api('GET', '/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('rejects unauthenticated list', async () => {
    const res = await h.api('GET', '/api/persons');
    expect(res.status).toBe(401);
  });

  it('admin can create + read a person against D1', async () => {
    const cookie = await h.loginAs('admin');
    const create = await h.api('POST', '/api/persons', {
      cookie,
      body: { fullName: 'Nguyễn Văn Tổ', gender: 'Nam' },
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string; nameNormalized: string; generation: number };
    expect(created.nameNormalized).toBe('nguyen van to');
    expect(created.generation).toBe(1);

    const get = await h.api('GET', `/api/persons/${created.id}`, { cookie });
    expect(get.status).toBe(200);
  });
});

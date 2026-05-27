import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { harness, type Harness } from './helpers/app';
import { normalizeName } from '../../worker/lib/normalize';

let h: Harness;
beforeAll(async () => {
  h = await harness();
});
afterEach(() => h.reset());

function mkPerson(fullName: string, extra: Record<string, unknown> = {}) {
  return h.prisma.person.create({
    data: { fullName, nameNormalized: normalizeName(fullName), gender: 'Nam', generation: 1, ...extra },
  });
}

describe('GET /api/persons', () => {
  it('401 without auth', async () => {
    expect((await h.api('GET', '/api/persons')).status).toBe(401);
  });

  it('search is diacritic-insensitive on nameNormalized', async () => {
    const cookie = await h.loginAs('viewer');
    await mkPerson('Nguyễn Văn Tèo');
    await mkPerson('Trần Thị Hoa');
    const res = await h.api('GET', '/api/persons?q=teo', { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { fullName: string }[]; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0]!.fullName).toBe('Nguyễn Văn Tèo');
  });

  it('filters by generation', async () => {
    const cookie = await h.loginAs('viewer');
    await mkPerson('A', { generation: 1 });
    await mkPerson('B', { generation: 2 });
    const res = await h.api('GET', '/api/persons?generation=2', { cookie });
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(1);
  });
});

describe('GET /api/persons/tree', () => {
  it('returns persons with marriage relations', async () => {
    const cookie = await h.loginAs('viewer');
    const hus = await mkPerson('Chồng');
    const wife = await mkPerson('Vợ', { gender: 'Nu' });
    await h.prisma.marriage.create({ data: { husbandId: hus.id, wifeId: wife.id } });
    const res = await h.api('GET', '/api/persons/tree', { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; marriagesAsHusband: unknown[] }> };
    const h0 = body.items.find((p) => p.id === hus.id)!;
    expect(h0.marriagesAsHusband).toHaveLength(1);
  });
});

describe('POST /api/persons', () => {
  it('viewer is blocked (403)', async () => {
    const cookie = await h.loginAs('viewer');
    const res = await h.api('POST', '/api/persons', { cookie, body: { fullName: 'X', gender: 'Nam' } });
    expect(res.status).toBe(403);
  });

  it('editor creates; generation = max(parent)+1', async () => {
    const cookie = await h.loginAs('editor');
    const father = await mkPerson('Cha', { generation: 2 });
    const res = await h.api('POST', '/api/persons', {
      cookie,
      body: { fullName: 'Con', gender: 'Nam', fatherId: father.id },
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { generation: number; nameNormalized: string };
    expect(created.generation).toBe(3);
    expect(created.nameNormalized).toBe('con');
  });

  it('400 on invalid body', async () => {
    const cookie = await h.loginAs('editor');
    const res = await h.api('POST', '/api/persons', { cookie, body: { gender: 'Nam' } });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/persons/:id', () => {
  it('404 for unknown id', async () => {
    const cookie = await h.loginAs('viewer');
    expect((await h.api('GET', '/api/persons/nope', { cookie })).status).toBe(404);
  });

  it('200 with relations', async () => {
    const cookie = await h.loginAs('viewer');
    const father = await mkPerson('Cha');
    const child = await mkPerson('Con', { fatherId: father.id, generation: 2 });
    const res = await h.api('GET', `/api/persons/${child.id}`, { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { father: { id: string } };
    expect(body.father.id).toBe(father.id);
  });
});

describe('PATCH /api/persons/:id', () => {
  it('updates fullName + nameNormalized', async () => {
    const cookie = await h.loginAs('editor');
    const p = await mkPerson('Tên Cũ');
    const res = await h.api('PATCH', `/api/persons/${p.id}`, { cookie, body: { fullName: 'Tên Mới' } });
    expect(res.status).toBe(200);
    expect((await res.json()).nameNormalized).toBe('ten moi');
  });

  it('rejects making a person their own parent (400)', async () => {
    const cookie = await h.loginAs('editor');
    const p = await mkPerson('Tự');
    const res = await h.api('PATCH', `/api/persons/${p.id}`, { cookie, body: { fatherId: p.id } });
    expect(res.status).toBe(400);
  });

  it('refuses an ancestry cycle (422)', async () => {
    const cookie = await h.loginAs('editor');
    const a = await mkPerson('A');
    const b = await mkPerson('B', { fatherId: a.id, generation: 2 });
    // Make A's father = B → A <- B <- A cycle.
    const res = await h.api('PATCH', `/api/persons/${a.id}`, { cookie, body: { fatherId: b.id } });
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/persons/:id', () => {
  it('editor is blocked (admin only) → 403', async () => {
    const cookie = await h.loginAs('editor');
    const p = await mkPerson('X');
    expect((await h.api('DELETE', `/api/persons/${p.id}`, { cookie })).status).toBe(403);
  });

  it('refuses deleting a person with children (400)', async () => {
    const cookie = await h.loginAs('admin');
    const parent = await mkPerson('Cha');
    await mkPerson('Con', { fatherId: parent.id, generation: 2 });
    expect((await h.api('DELETE', `/api/persons/${parent.id}`, { cookie })).status).toBe(400);
  });

  it('admin deletes a childless person (200) and clears its marriages', async () => {
    const cookie = await h.loginAs('admin');
    const hus = await mkPerson('Chồng');
    const wife = await mkPerson('Vợ', { gender: 'Nu' });
    await h.prisma.marriage.create({ data: { husbandId: hus.id, wifeId: wife.id } });
    const res = await h.api('DELETE', `/api/persons/${hus.id}`, { cookie });
    expect(res.status).toBe(200);
    expect(await h.prisma.marriage.count()).toBe(0);
  });
});

import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { harness, type Harness } from './helpers/app';
import { normalizeName } from '../../worker/lib/normalize';

let h: Harness;
beforeAll(async () => {
  h = await harness();
});
afterEach(() => h.reset());

function mkPerson(fullName: string, gender: 'Nam' | 'Nu' | 'Khac' = 'Nam') {
  return h.prisma.person.create({
    data: { fullName, nameNormalized: normalizeName(fullName), gender, generation: 1 },
  });
}

describe('marriages', () => {
  it('editor creates a marriage (201)', async () => {
    const cookie = await h.loginAs('editor');
    const a = await mkPerson('Chồng');
    const b = await mkPerson('Vợ', 'Nu');
    const res = await h.api('POST', '/api/marriages', { cookie, body: { husbandId: a.id, wifeId: b.id } });
    expect(res.status).toBe(201);
  });

  it('rejects husband === wife (400)', async () => {
    const cookie = await h.loginAs('editor');
    const a = await mkPerson('Một');
    const res = await h.api('POST', '/api/marriages', { cookie, body: { husbandId: a.id, wifeId: a.id } });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate pair (409)', async () => {
    const cookie = await h.loginAs('editor');
    const a = await mkPerson('Chồng');
    const b = await mkPerson('Vợ', 'Nu');
    await h.prisma.marriage.create({ data: { husbandId: a.id, wifeId: b.id } });
    const res = await h.api('POST', '/api/marriages', { cookie, body: { husbandId: a.id, wifeId: b.id } });
    expect(res.status).toBe(409);
  });

  it('allows polygamy: a husband in multiple marriages', async () => {
    const cookie = await h.loginAs('editor');
    const hus = await mkPerson('Chồng');
    const w1 = await mkPerson('Vợ Cả', 'Nu');
    const w2 = await mkPerson('Vợ Hai', 'Nu');
    expect((await h.api('POST', '/api/marriages', { cookie, body: { husbandId: hus.id, wifeId: w1.id } })).status).toBe(201);
    expect((await h.api('POST', '/api/marriages', { cookie, body: { husbandId: hus.id, wifeId: w2.id } })).status).toBe(201);
    expect(await h.prisma.marriage.count()).toBe(2);
  });

  it('editor deletes a marriage (200)', async () => {
    const cookie = await h.loginAs('editor');
    const a = await mkPerson('Chồng');
    const b = await mkPerson('Vợ', 'Nu');
    const m = await h.prisma.marriage.create({ data: { husbandId: a.id, wifeId: b.id } });
    expect((await h.api('DELETE', `/api/marriages/${m.id}`, { cookie })).status).toBe(200);
    expect(await h.prisma.marriage.count()).toBe(0);
  });
});

describe('branches', () => {
  it('any authed user lists branches', async () => {
    const cookie = await h.loginAs('viewer');
    await h.prisma.branch.create({ data: { name: 'Chi Trưởng' } });
    const res = await h.api('GET', '/api/branches', { cookie });
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(1);
  });

  it('viewer cannot create (403); editor can (201)', async () => {
    const viewer = await h.loginAs('viewer');
    expect((await h.api('POST', '/api/branches', { cookie: viewer, body: { name: 'X' } })).status).toBe(403);
    const editor = await h.loginAs('editor');
    expect((await h.api('POST', '/api/branches', { cookie: editor, body: { name: 'Chi Hai' } })).status).toBe(201);
  });
});

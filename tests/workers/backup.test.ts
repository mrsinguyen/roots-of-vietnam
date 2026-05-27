import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { harness, type Harness } from './helpers/app';
import { normalizeName } from '../../worker/lib/normalize';

let h: Harness;
beforeAll(async () => {
  h = await harness();
});
afterEach(() => h.reset());

async function seedFamily() {
  const branch = await h.prisma.branch.create({ data: { name: 'Chi Trưởng' } });
  const hus = await h.prisma.person.create({
    data: { fullName: 'Chồng', nameNormalized: normalizeName('Chồng'), gender: 'Nam', generation: 1, branchId: branch.id },
  });
  const wife = await h.prisma.person.create({
    data: { fullName: 'Vợ', nameNormalized: normalizeName('Vợ'), gender: 'Nu', generation: 1 },
  });
  await h.prisma.marriage.create({ data: { husbandId: hus.id, wifeId: wife.id } });
}

describe('backup (admin only)', () => {
  it('editor is blocked (403)', async () => {
    const cookie = await h.loginAs('editor');
    expect((await h.api('POST', '/api/backup', { cookie })).status).toBe(403);
  });

  it('creates a JSON backup in R2 and lists it', async () => {
    const cookie = await h.loginAs('admin');
    await seedFamily();
    const create = await h.api('POST', '/api/backup', { cookie });
    expect(create.status).toBe(200);
    const body = (await create.json()) as { filename: string; counts: { persons: number }; schemaVersion: number };
    expect(body.schemaVersion).toBe(2);
    expect(body.counts.persons).toBe(2);
    expect(await h.env.MEDIA.get(`backups/${body.filename}`)).not.toBeNull();

    const list = await h.api('GET', '/api/backup', { cookie });
    const listed = (await list.json()) as { items: Array<{ filename: string }>; schemaVersion: number };
    expect(listed.items.some((i) => i.filename === body.filename)).toBe(true);
  });
});

describe('restore', () => {
  it('rejects an incompatible schemaVersion (400)', async () => {
    const cookie = await h.loginAs('admin');
    const res = await h.api('POST', '/api/backup/restore', { cookie, body: { schemaVersion: 99, persons: [] } });
    expect(res.status).toBe(400);
  });

  it('refuses to overwrite a non-empty DB without force (409)', async () => {
    const cookie = await h.loginAs('admin');
    await seedFamily();
    const dump = await makeDump(cookie);
    const res = await h.api('POST', '/api/backup/restore', { cookie, body: dump });
    expect(res.status).toBe(409);
  });

  it('force-restores a dump (200) preserving counts', async () => {
    const cookie = await h.loginAs('admin');
    await seedFamily();
    const dump = await makeDump(cookie);
    const res = await h.api('POST', '/api/backup/restore?force=true', { cookie, body: dump });
    expect(res.status).toBe(200);
    const result = (await res.json()) as { inserted: { persons: number; marriages: number; branches: number } };
    expect(result.inserted).toEqual({ persons: 2, marriages: 1, branches: 1, media: 0 });
    expect(await h.prisma.person.count()).toBe(2);
    expect(await h.prisma.marriage.count()).toBe(1);
  });

  async function makeDump(cookie: string): Promise<unknown> {
    const create = await h.api('POST', '/api/backup', { cookie });
    const { filename } = (await create.json()) as { filename: string };
    const obj = await h.env.MEDIA.get(`backups/${filename}`);
    return JSON.parse(await obj!.text());
  }
});

describe('media-zip', () => {
  it('zips uploaded media into R2 (200)', async () => {
    const cookie = await h.loginAs('admin');
    const p = await h.prisma.person.create({
      data: { fullName: 'Có Ảnh', nameNormalized: normalizeName('Có Ảnh'), gender: 'Nam', generation: 1 },
    });
    const form = new FormData();
    form.append('file', new File([new Uint8Array([9, 9, 9])], 'pic.png', { type: 'image/png' }));
    await h.api('POST', `/api/media/${p.id}`, { cookie, body: form });

    const res = await h.api('POST', '/api/backup/media-zip', { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { filename: string; sizeBytes: number };
    expect(body.filename).toMatch(/^media-.*\.zip$/);
    expect(body.sizeBytes).toBeGreaterThan(0);
    expect(await h.env.MEDIA.get(`backups/${body.filename}`)).not.toBeNull();
  });
});

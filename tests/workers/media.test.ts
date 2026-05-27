import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { harness, type Harness } from './helpers/app';
import { normalizeName } from '../../worker/lib/normalize';

let h: Harness;
beforeAll(async () => {
  h = await harness();
});
afterEach(() => h.reset());

function mkPerson(fullName = 'Người Có Ảnh') {
  return h.prisma.person.create({
    data: { fullName, nameNormalized: normalizeName(fullName), gender: 'Nam', generation: 1 },
  });
}

function fileForm(filename: string, type: string, caption?: string): FormData {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3, 4])], filename, { type }));
  if (caption !== undefined) form.append('caption', caption);
  return form;
}

describe('POST /api/media/:personId', () => {
  it('viewer is blocked (403)', async () => {
    const cookie = await h.loginAs('viewer');
    const p = await mkPerson();
    const res = await h.api('POST', `/api/media/${p.id}`, { cookie, body: fileForm('pic.png', 'image/png') });
    expect(res.status).toBe(403);
  });

  it('editor uploads a PNG → 201, Media row + R2 object written', async () => {
    const cookie = await h.loginAs('editor');
    const p = await mkPerson();
    const res = await h.api('POST', `/api/media/${p.id}`, { cookie, body: fileForm('pic.png', 'image/png', 'Ảnh thử') });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { type: string; caption: string; filePath: string };
    expect(body.type).toBe('image');
    expect(body.caption).toBe('Ảnh thử');
    expect(await h.prisma.media.count()).toBe(1);
    const key = `media/${body.filePath.split('/').pop()}`;
    expect(await h.env.MEDIA.get(key)).not.toBeNull();
  });

  it('rejects an unknown MIME type (400, Vietnamese)', async () => {
    const cookie = await h.loginAs('editor');
    const p = await mkPerson();
    const res = await h.api('POST', `/api/media/${p.id}`, { cookie, body: fileForm('a.bin', 'application/octet-stream') });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Định dạng/);
  });

  it('404s when the target person does not exist', async () => {
    const cookie = await h.loginAs('editor');
    const res = await h.api('POST', '/api/media/no-such-person', { cookie, body: fileForm('pic.png', 'image/png') });
    expect(res.status).toBe(404);
  });

  it('400s when no file is attached', async () => {
    const cookie = await h.loginAs('editor');
    const p = await mkPerson();
    const res = await h.api('POST', `/api/media/${p.id}`, { cookie, body: new FormData() });
    expect(res.status).toBe(400);
  });

  it('uses the server-controlled extension, ignoring originalname', async () => {
    const cookie = await h.loginAs('editor');
    const p = await mkPerson();
    const res = await h.api('POST', `/api/media/${p.id}`, { cookie, body: fileForm('evil.svg', 'image/png') });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { filePath: string };
    expect(body.filePath).toMatch(/\.png$/);
    expect(body.filePath).not.toMatch(/\.svg/);
  });
});

describe('GET /uploads/:key', () => {
  it('serves the object with nosniff + attachment headers', async () => {
    const cookie = await h.loginAs('editor');
    const p = await mkPerson();
    const created = (await (
      await h.api('POST', `/api/media/${p.id}`, { cookie, body: fileForm('pic.png', 'image/png') })
    ).json()) as { filePath: string };
    const res = await h.api('GET', created.filePath);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-disposition')).toBe('attachment');
  });

  it('404 for a missing key', async () => {
    expect((await h.api('GET', '/uploads/missing.png')).status).toBe(404);
  });
});

describe('DELETE /api/media/:id', () => {
  it('removes the row and the R2 object', async () => {
    const cookie = await h.loginAs('editor');
    const p = await mkPerson();
    const created = (await (
      await h.api('POST', `/api/media/${p.id}`, { cookie, body: fileForm('x.png', 'image/png') })
    ).json()) as { id: string; filePath: string };
    const key = `media/${created.filePath.split('/').pop()}`;
    expect(await h.env.MEDIA.get(key)).not.toBeNull();
    expect((await h.api('DELETE', `/api/media/${created.id}`, { cookie })).status).toBe(200);
    expect(await h.env.MEDIA.get(key)).toBeNull();
    expect(await h.prisma.media.count()).toBe(0);
  });

  it('404s for unknown media id', async () => {
    const cookie = await h.loginAs('editor');
    expect((await h.api('DELETE', '/api/media/no-such', { cookie })).status).toBe(404);
  });
});

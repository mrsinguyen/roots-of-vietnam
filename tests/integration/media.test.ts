import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, getPrisma, truncateAll } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { createPerson } from '../factories';

const REPO_ROOT = path.resolve(__dirname, '../..');
const UPLOAD_DIR = path.resolve(REPO_ROOT, process.env.UPLOAD_DIR ?? './tmp/test-uploads');

function tinyPng(): Buffer {
  // 1x1 transparent PNG.
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crcInput = Buffer.concat([t, data]);
    let crc = 0xffffffff;
    for (const b of crcInput) {
      crc ^= b;
      for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const crcOut = Buffer.alloc(4);
    crcOut.writeUInt32BE(crc, 0);
    return Buffer.concat([len, t, data, crcOut]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.from([0, 0, 0, 0, 0]);
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp();
});
beforeEach(async () => {
  await truncateAll();
  if (fs.existsSync(UPLOAD_DIR)) {
    for (const f of fs.readdirSync(UPLOAD_DIR)) {
      if (f !== '.gitkeep') fs.unlinkSync(path.join(UPLOAD_DIR, f));
    }
  }
});

describe('POST /api/media/:personId', () => {
  it('viewer is blocked (403)', async () => {
    const viewer = await loginAs(app, 'viewer');
    const p = await createPerson({});
    const res = await request(app)
      .post(`/api/media/${p.id}`)
      .set('Cookie', viewer.cookie)
      .attach('file', tinyPng(), { filename: 'pic.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });

  it('editor uploads a PNG and a Media row is written', async () => {
    const editor = await loginAs(app, 'editor');
    const p = await createPerson({});
    const res = await request(app)
      .post(`/api/media/${p.id}`)
      .set('Cookie', editor.cookie)
      .attach('file', tinyPng(), { filename: 'pic.png', contentType: 'image/png' })
      .field('caption', 'Ảnh thử');
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('image');
    expect(res.body.caption).toBe('Ảnh thử');
    const prisma = await getPrisma();
    expect(await prisma.media.count()).toBe(1);
    expect(fs.existsSync(path.join(UPLOAD_DIR, path.basename(res.body.filePath)))).toBe(true);
  });

  it('rejects an unknown MIME type', async () => {
    const editor = await loginAs(app, 'editor');
    const p = await createPerson({});
    const res = await request(app)
      .post(`/api/media/${p.id}`)
      .set('Cookie', editor.cookie)
      .attach('file', Buffer.from('hello'), {
        filename: 'a.bin',
        contentType: 'application/octet-stream',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Định dạng/);
  });

  it('404s when the target person does not exist', async () => {
    const editor = await loginAs(app, 'editor');
    const res = await request(app)
      .post('/api/media/no-such-person')
      .set('Cookie', editor.cookie)
      .attach('file', tinyPng(), { filename: 'pic.png', contentType: 'image/png' });
    expect(res.status).toBe(404);
  });

  it('400s when no file is attached', async () => {
    const editor = await loginAs(app, 'editor');
    const p = await createPerson({});
    const res = await request(app)
      .post(`/api/media/${p.id}`)
      .set('Cookie', editor.cookie);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/media/:id', () => {
  it('removes the row and the file from disk', async () => {
    const editor = await loginAs(app, 'editor');
    const p = await createPerson({});
    const create = await request(app)
      .post(`/api/media/${p.id}`)
      .set('Cookie', editor.cookie)
      .attach('file', tinyPng(), { filename: 'x.png', contentType: 'image/png' });
    const filePath = path.join(UPLOAD_DIR, path.basename(create.body.filePath));
    expect(fs.existsSync(filePath)).toBe(true);
    const res = await request(app)
      .delete(`/api/media/${create.body.id}`)
      .set('Cookie', editor.cookie);
    expect(res.status).toBe(200);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('404s for unknown media id', async () => {
    const editor = await loginAs(app, 'editor');
    const res = await request(app)
      .delete('/api/media/no-such')
      .set('Cookie', editor.cookie);
    expect(res.status).toBe(404);
  });
});

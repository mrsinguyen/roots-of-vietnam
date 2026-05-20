import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, getPrisma, truncateAll } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { createPerson } from '../factories';

const REPO_ROOT = path.resolve(__dirname, '../..');
const BACKUP_DIR = path.resolve(REPO_ROOT, process.env.BACKUP_DIR ?? './tmp/test-backups');

function clearBackups(): void {
  if (!fs.existsSync(BACKUP_DIR)) return;
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (f.startsWith('backup-') || f.startsWith('media-'))
      fs.unlinkSync(path.join(BACKUP_DIR, f));
  }
}

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp();
});
beforeEach(async () => {
  await truncateAll();
  clearBackups();
});

describe('/api/backup', () => {
  it('non-admin is blocked (403)', async () => {
    const editor = await loginAs(app, 'editor');
    const res = await request(app).post('/api/backup').set('Cookie', editor.cookie);
    expect(res.status).toBe(403);
  });

  it('admin can create a backup', async () => {
    const admin = await loginAs(app, 'admin');
    await createPerson({});
    const res = await request(app).post('/api/backup').set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body.schemaVersion).toBe(2);
    expect(res.body.counts.persons).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(path.join(BACKUP_DIR, res.body.filename))).toBe(true);
  });

  it('GET lists backup files', async () => {
    const admin = await loginAs(app, 'admin');
    await request(app).post('/api/backup').set('Cookie', admin.cookie);
    const res = await request(app).get('/api/backup').set('Cookie', admin.cookie);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});

describe('POST /api/backup/restore', () => {
  it('rejects mismatched schema version (400)', async () => {
    const admin = await loginAs(app, 'admin');
    const res = await request(app)
      .post('/api/backup/restore')
      .set('Cookie', admin.cookie)
      .send({ schemaVersion: 99, persons: [], marriages: [], branches: [], media: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Phiên bản/);
  });

  it('refuses to overwrite a non-empty DB without force (409)', async () => {
    const admin = await loginAs(app, 'admin');
    await createPerson({});
    const create = await request(app).post('/api/backup').set('Cookie', admin.cookie);
    const dump = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, create.body.filename), 'utf8'));
    const res = await request(app)
      .post('/api/backup/restore')
      .set('Cookie', admin.cookie)
      .send(dump);
    expect(res.status).toBe(409);
  });

  it('restores with ?force=true; final counts match the dump', async () => {
    const admin = await loginAs(app, 'admin');
    await createPerson({ fullName: 'A' });
    await createPerson({ fullName: 'B' });
    const create = await request(app).post('/api/backup').set('Cookie', admin.cookie);
    const dump = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, create.body.filename), 'utf8'));
    // Wipe & restore
    await truncateAll();
    const res = await request(app)
      .post('/api/backup/restore?force=true')
      .set('Cookie', admin.cookie)
      .send(dump);
    expect(res.status).toBe(200);
    expect(res.body.inserted.persons).toBe(2);
    const prisma = await getPrisma();
    expect(await prisma.person.count()).toBe(2);
  });

  it('rejects shape-invalid bodies (400)', async () => {
    const admin = await loginAs(app, 'admin');
    const res = await request(app)
      .post('/api/backup/restore')
      .set('Cookie', admin.cookie)
      .send({ schemaVersion: 'two' });
    expect(res.status).toBe(400);
  });

  it('refuses to persist media rows whose filePath is not under /uploads/', async () => {
    const admin = await loginAs(app, 'admin');
    const prisma = await getPrisma();
    const person = await createPerson({ fullName: 'Carrier' });
    const malicious = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      counts: { persons: 1, marriages: 0, branches: 0, media: 2 },
      persons: [
        {
          id: person.id,
          fullName: person.fullName,
          nameNormalized: person.nameNormalized,
          gender: person.gender,
          generation: person.generation,
          createdAt: person.createdAt,
          updatedAt: person.updatedAt,
        },
      ],
      marriages: [],
      branches: [],
      media: [
        // Attempted XSS: would render as a clickable javascript: link without the guard.
        { id: 'm-bad', personId: person.id, filePath: 'javascript:alert(1)', type: 'image' },
        // Path-traversal attempt.
        { id: 'm-trav', personId: person.id, filePath: '/uploads/../../etc/passwd', type: 'image' },
        // Legitimate row should still land.
        { id: 'm-ok', personId: person.id, filePath: '/uploads/123-abc.jpg', type: 'image' },
      ],
    };
    const res = await request(app)
      .post('/api/backup/restore?force=true')
      .set('Cookie', admin.cookie)
      .send(malicious);
    expect(res.status).toBe(200);
    const stored = await prisma.media.findMany({ orderBy: { id: 'asc' } });
    expect(stored.map((m) => m.filePath)).toEqual(['/uploads/123-abc.jpg']);
    const missing = res.body.missingMedia.map((m: { id: string }) => m.id);
    expect(missing).toContain('m-bad');
    expect(missing).toContain('m-trav');
  });
});

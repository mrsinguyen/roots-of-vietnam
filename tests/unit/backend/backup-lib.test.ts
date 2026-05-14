import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_KEEP,
  BACKUP_SCHEMA_VERSION,
  autoBackupIfStale,
  buildDump,
  lastBackupAge,
  prune,
  restoreDump,
  writeBackup,
} from '../../../backend/src/lib/backup';
import { createBranch, createMarriage, createPerson } from '../../factories';
import { getPrisma, truncateAll } from '../../helpers/app';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BACKUP_DIR = path.resolve(REPO_ROOT, process.env.BACKUP_DIR ?? './tmp/test-backups');

function clearBackups(): void {
  if (!fs.existsSync(BACKUP_DIR)) return;
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (f.startsWith('backup-') || f.startsWith('media-'))
      fs.unlinkSync(path.join(BACKUP_DIR, f));
  }
}

beforeEach(async () => {
  await truncateAll();
  clearBackups();
});

describe('lib/backup', () => {
  it('exposes the documented schema version and retention', () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(2);
    expect(BACKUP_KEEP).toBe(10);
  });

  describe('buildDump + writeBackup', () => {
    it('captures counts of every table', async () => {
      const branch = await createBranch();
      const father = await createPerson({ fullName: 'F', branchId: branch.id });
      const mother = await createPerson({ fullName: 'M', gender: 'Nu' });
      await createPerson({ fullName: 'C', fatherId: father.id, motherId: mother.id, generation: 2 });
      await createMarriage(father.id, mother.id, '1980-01-01');
      const dump = await buildDump();
      expect(dump.schemaVersion).toBe(2);
      expect(dump.counts).toEqual({ persons: 3, marriages: 1, branches: 1, media: 0 });
      expect(dump.persons).toHaveLength(3);
      expect(dump.marriages).toHaveLength(1);
    });

    it('writes a timestamped JSON file with the dump inside', async () => {
      await createPerson({});
      const { filename, dump } = await writeBackup();
      expect(filename).toMatch(/^backup-.+\.json$/);
      const onDisk = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, filename), 'utf8'));
      expect(onDisk.schemaVersion).toBe(2);
      expect(onDisk.counts.persons).toBe(1);
      expect(dump.exportedAt).toBeDefined();
    });
  });

  describe('prune', () => {
    it('keeps only the N newest backup-*.json files by mtime', async () => {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      for (let i = 0; i < 12; i++) {
        const f = path.join(BACKUP_DIR, `backup-${i.toString().padStart(2, '0')}.json`);
        fs.writeFileSync(f, '{}');
        const t = new Date(Date.now() - (12 - i) * 1000);
        fs.utimesSync(f, t, t);
      }
      await prune(10);
      const remaining = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('backup-'));
      expect(remaining).toHaveLength(10);
      // The two oldest (00, 01) should be gone.
      expect(remaining.find((f) => f.includes('-00.'))).toBeUndefined();
      expect(remaining.find((f) => f.includes('-01.'))).toBeUndefined();
    });
  });

  describe('lastBackupAge', () => {
    it('returns null when no backups exist', async () => {
      expect(await lastBackupAge()).toBeNull();
    });

    it('returns a small number right after writeBackup', async () => {
      await writeBackup();
      const age = await lastBackupAge();
      expect(age).not.toBeNull();
      expect(age!).toBeLessThan(5_000);
    });
  });

  describe('autoBackupIfStale', () => {
    it('writes a backup when none exist', async () => {
      await createPerson({});
      const r = await autoBackupIfStale();
      expect(r.ran).toBe(true);
      expect(r.filename).toMatch(/^backup-/);
    });

    it('does nothing when the newest backup is fresh', async () => {
      await writeBackup();
      const r = await autoBackupIfStale();
      expect(r.ran).toBe(false);
    });
  });

  describe('restoreDump', () => {
    it('refuses a wrong schema version with status 400', async () => {
      await expect(
        restoreDump(
          { schemaVersion: 99, persons: [], marriages: [], branches: [], media: [] },
          { force: false },
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('refuses to overwrite a non-empty database without force (409)', async () => {
      await createPerson({});
      await expect(
        restoreDump(
          {
            schemaVersion: BACKUP_SCHEMA_VERSION,
            persons: [],
            marriages: [],
            branches: [],
            media: [],
          },
          { force: false },
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('restores into an empty database', async () => {
      const father = await createPerson({ fullName: 'F' });
      const mother = await createPerson({ fullName: 'M', gender: 'Nu' });
      await createPerson({ fullName: 'C', fatherId: father.id, motherId: mother.id, generation: 2 });
      const dump = await buildDump();
      await truncateAll();
      const result = await restoreDump(dump, { force: false });
      expect(result.inserted.persons).toBe(3);
      const prisma = await getPrisma();
      expect(await prisma.person.count()).toBe(3);
    });

    it('reports missing media files', async () => {
      const dump = {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        // Include the person inline so the restore (which wipes-then-loads)
        // satisfies the Media FK after the truncation.
        persons: [
          {
            id: 'p1',
            fullName: 'P',
            nameNormalized: 'p',
            gender: 'Nam',
            generation: 1,
          } as Record<string, unknown>,
        ],
        marriages: [],
        branches: [],
        media: [
          {
            id: 'm1',
            personId: 'p1',
            filePath: '/uploads/does-not-exist.png',
            type: 'image',
            sha256: 'abc123',
            caption: null,
          } as Record<string, unknown>,
        ],
      };
      const result = await restoreDump(dump, { force: true });
      expect(result.missingMedia).toHaveLength(1);
      expect(result.missingMedia[0]!.reason).toBe('missing');
    });
  });
});

// Backup helpers shared between the on-demand /api/backup endpoint and the
// startup auto-backup. Single source of truth for schema version + format.

import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { prisma } from '../prisma.js';
import { env } from '../env.js';

export const BACKUP_SCHEMA_VERSION = 2;
export const BACKUP_KEEP = 10;
export const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const backupDir = path.resolve(process.cwd(), env.BACKUP_DIR);
const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);

export interface BackupDump {
  schemaVersion: number;
  exportedAt: string;
  counts: {
    persons: number;
    marriages: number;
    branches: number;
    media: number;
  };
  persons: unknown[];
  marriages: unknown[];
  branches: unknown[];
  // Media entries include sha256 of the on-disk file when reachable, so a
  // later restore can flag binaries that didn't survive the trip.
  media: Array<{
    id: string;
    personId: string;
    filePath: string;
    type: string;
    caption: string | null;
    createdAt: Date;
    sha256: string | null;
  }>;
}

async function sha256File(absolute: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(absolute);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

export async function buildDump(): Promise<BackupDump> {
  const [persons, marriages, branches, media] = await Promise.all([
    prisma.person.findMany(),
    prisma.marriage.findMany(),
    prisma.branch.findMany(),
    prisma.media.findMany(),
  ]);
  const mediaWithHash = await Promise.all(
    media.map(async (m) => ({
      id: m.id,
      personId: m.personId,
      filePath: m.filePath,
      type: m.type,
      caption: m.caption,
      createdAt: m.createdAt,
      sha256: await sha256File(path.join(uploadDir, path.basename(m.filePath))),
    })),
  );
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      persons: persons.length,
      marriages: marriages.length,
      branches: branches.length,
      media: media.length,
    },
    persons,
    marriages,
    branches,
    media: mediaWithHash,
  };
}

function stampFilename(): string {
  return (
    'backup-' +
    new Date().toISOString().replace(/[:.]/g, '-').replace(/(.+)-\d{3}Z$/, '$1Z') +
    '.json'
  );
}

export async function writeBackup(): Promise<{ filename: string; dump: BackupDump }> {
  await fs.mkdir(backupDir, { recursive: true });
  const dump = await buildDump();
  const filename = stampFilename();
  await fs.writeFile(path.join(backupDir, filename), JSON.stringify(dump, null, 2), 'utf8');
  await prune(BACKUP_KEEP);
  return { filename, dump };
}

export async function prune(keep: number): Promise<void> {
  await fs.mkdir(backupDir, { recursive: true });
  const entries = await fs.readdir(backupDir);
  const stats = await Promise.all(
    entries
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .map(async (filename) => {
        const stat = await fs.stat(path.join(backupDir, filename));
        return { filename, mtime: stat.mtime.getTime() };
      }),
  );
  stats.sort((a, b) => b.mtime - a.mtime);
  for (const s of stats.slice(keep)) {
    await fs.unlink(path.join(backupDir, s.filename)).catch(() => undefined);
  }
}

export async function lastBackupAge(): Promise<number | null> {
  await fs.mkdir(backupDir, { recursive: true });
  const entries = await fs.readdir(backupDir);
  let newest = 0;
  for (const f of entries) {
    if (!f.startsWith('backup-') || !f.endsWith('.json')) continue;
    const stat = await fs.stat(path.join(backupDir, f));
    if (stat.mtime.getTime() > newest) newest = stat.mtime.getTime();
  }
  return newest === 0 ? null : Date.now() - newest;
}

export async function autoBackupIfStale(): Promise<{ ran: boolean; filename?: string }> {
  const age = await lastBackupAge();
  if (age !== null && age < BACKUP_INTERVAL_MS) return { ran: false };
  const { filename } = await writeBackup();
  return { ran: true, filename };
}

export interface RestoreInput {
  schemaVersion: number;
  persons: Array<Record<string, unknown>>;
  marriages: Array<Record<string, unknown>>;
  branches: Array<Record<string, unknown>>;
  media: Array<Record<string, unknown>>;
}

export interface RestoreOptions {
  force: boolean;
}

export interface RestoreResult {
  inserted: { persons: number; marriages: number; branches: number; media: number };
  // Media rows whose underlying file is missing on disk, or whose contents
  // hash to something different from the backup. Restore still succeeds; the
  // caller surfaces this as a warning.
  missingMedia: Array<{ id: string; filePath: string; reason: 'missing' | 'hash-mismatch' }>;
}

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') return new Date(v);
  return null;
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function asInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
}

export async function restoreDump(
  input: RestoreInput,
  opts: RestoreOptions,
): Promise<RestoreResult> {
  if (input.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw Object.assign(
      new Error(
        `Phiên bản sao lưu không tương thích (${input.schemaVersion}); cần phiên bản ${BACKUP_SCHEMA_VERSION}`,
      ),
      { status: 400 },
    );
  }

  if (!opts.force) {
    const existing = await prisma.person.count();
    if (existing > 0) {
      throw Object.assign(
        new Error('Cơ sở dữ liệu chưa trống. Dùng ?force=true để ghi đè.'),
        { status: 409 },
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    if (opts.force) {
      await tx.media.deleteMany({});
      await tx.marriage.deleteMany({});
      await tx.person.deleteMany({});
      await tx.branch.deleteMany({});
    }
    for (const b of input.branches) {
      const id = asStr(b['id']);
      const name = asStr(b['name']);
      if (!id || !name) continue;
      await tx.branch.create({
        data: {
          id,
          name,
          description: asStr(b['description']),
          createdAt: toDate(b['createdAt']) ?? new Date(),
        },
      });
    }
    // Persons: insert without parents first, then attach parents — preserves FKs.
    for (const p of input.persons) {
      const id = asStr(p['id']);
      const fullName = asStr(p['fullName']);
      const gender = asStr(p['gender']);
      if (!id || !fullName || !gender) continue;
      await tx.person.create({
        data: {
          id,
          fullName,
          nameNormalized: asStr(p['nameNormalized']) ?? '',
          honorific: asStr(p['honorific']),
          gender,
          birthYear: asInt(p['birthYear']),
          birthMonth: asInt(p['birthMonth']),
          birthDay: asInt(p['birthDay']),
          deathYear: asInt(p['deathYear']),
          deathMonth: asInt(p['deathMonth']),
          deathDay: asInt(p['deathDay']),
          birthDateLunar: asStr(p['birthDateLunar']),
          deathDateLunar: asStr(p['deathDateLunar']),
          biography: asStr(p['biography']),
          occupation: asStr(p['occupation']),
          burialPlace: asStr(p['burialPlace']),
          notes: asStr(p['notes']),
          generation: asInt(p['generation']) ?? 1,
          branchId: asStr(p['branchId']),
          createdAt: toDate(p['createdAt']) ?? new Date(),
          updatedAt: toDate(p['updatedAt']) ?? new Date(),
        },
      });
    }
    for (const p of input.persons) {
      const id = asStr(p['id']);
      const fatherId = asStr(p['fatherId']);
      const motherId = asStr(p['motherId']);
      if (!id || (!fatherId && !motherId)) continue;
      await tx.person.update({ where: { id }, data: { fatherId, motherId } });
    }
    for (const m of input.marriages) {
      const id = asStr(m['id']);
      const husbandId = asStr(m['husbandId']);
      const wifeId = asStr(m['wifeId']);
      if (!id || !husbandId || !wifeId) continue;
      await tx.marriage.create({
        data: {
          id,
          husbandId,
          wifeId,
          marriageDate: toDate(m['marriageDate']),
          createdAt: toDate(m['createdAt']) ?? new Date(),
        },
      });
    }
    const missingMedia: RestoreResult['missingMedia'] = [];
    for (const md of input.media) {
      const id = asStr(md['id']);
      const personId = asStr(md['personId']);
      const filePath = asStr(md['filePath']);
      const type = asStr(md['type']);
      if (!id || !personId || !filePath || !type) continue;
      await tx.media.create({
        data: {
          id,
          personId,
          filePath,
          type,
          caption: asStr(md['caption']),
          createdAt: toDate(md['createdAt']) ?? new Date(),
        },
      });
      // Integrity check: the matching file should exist in uploads/ with the
      // hash recorded in the backup. We surface missing files / mismatches but
      // do not roll back — the user explicitly opted into a restore.
      const expected = asStr(md['sha256']);
      if (expected) {
        const actual = await sha256File(path.join(uploadDir, path.basename(filePath)));
        if (actual === null) missingMedia.push({ id, filePath, reason: 'missing' });
        else if (actual !== expected)
          missingMedia.push({ id, filePath, reason: 'hash-mismatch' });
      }
    }
    return {
      inserted: {
        persons: input.persons.length,
        marriages: input.marriages.length,
        branches: input.branches.length,
        media: input.media.length,
      },
      missingMedia,
    };
  });
}

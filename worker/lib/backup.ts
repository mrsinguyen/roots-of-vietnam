import JSZip from 'jszip';
import type { PrismaClient } from '../../prisma/generated';
import type { Env } from '../types';
import { basename } from './media';

// Backups (JSON + media zip) live in R2 under the `backups/` prefix. media-zip
// uses jszip. Restore runs sequentially rather than in an interactive
// transaction because D1 does not support interactive transactions over the
// binding — a mid-restore failure can leave partial data; re-run with
// ?force=true. See docs/CLOUDFLARE.md.

export const BACKUP_SCHEMA_VERSION = 2;
export const BACKUP_KEEP = 10;
export const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const BACKUP_PREFIX = 'backups/';

export interface BackupDump {
  schemaVersion: number;
  exportedAt: string;
  counts: { persons: number; marriages: number; branches: number; media: number };
  persons: unknown[];
  marriages: unknown[];
  branches: unknown[];
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

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Object(env: Env, filePath: string): Promise<string | null> {
  const obj = await env.MEDIA.get(`media/${basename(filePath)}`);
  if (!obj) return null;
  const digest = await crypto.subtle.digest('SHA-256', await obj.arrayBuffer());
  return toHex(digest);
}

export async function buildDump(prisma: PrismaClient, env: Env): Promise<BackupDump> {
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
      sha256: await sha256Object(env, m.filePath),
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

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/(.+)-\d{3}Z$/, '$1Z');
}

export async function writeBackup(
  prisma: PrismaClient,
  env: Env,
): Promise<{ filename: string; dump: BackupDump }> {
  const dump = await buildDump(prisma, env);
  const filename = `backup-${stamp()}.json`;
  await env.MEDIA.put(`${BACKUP_PREFIX}${filename}`, JSON.stringify(dump, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });
  await prune(env, BACKUP_KEEP);
  return { filename, dump };
}

interface BackupListItem {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

async function listBackupObjects(env: Env): Promise<Array<{ key: string; size: number; uploaded: Date }>> {
  const out: Array<{ key: string; size: number; uploaded: Date }> = [];
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix: BACKUP_PREFIX, cursor });
    for (const o of page.objects) out.push({ key: o.key, size: o.size, uploaded: o.uploaded });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

export async function listBackups(env: Env): Promise<BackupListItem[]> {
  const objects = await listBackupObjects(env);
  const items = objects
    .filter((o) => {
      const f = o.key.slice(BACKUP_PREFIX.length);
      return (f.startsWith('backup-') && f.endsWith('.json')) || (f.startsWith('media-') && f.endsWith('.zip'));
    })
    .map((o) => ({
      filename: o.key.slice(BACKUP_PREFIX.length),
      sizeBytes: o.size,
      createdAt: o.uploaded.toISOString(),
    }));
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return items;
}

export async function prune(env: Env, keep: number): Promise<void> {
  const jsons = (await listBackupObjects(env))
    .filter((o) => {
      const f = o.key.slice(BACKUP_PREFIX.length);
      return f.startsWith('backup-') && f.endsWith('.json');
    })
    .sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
  for (const o of jsons.slice(keep)) {
    await env.MEDIA.delete(o.key);
  }
}

export async function lastBackupAgeMs(env: Env): Promise<number | null> {
  const jsons = (await listBackupObjects(env)).filter((o) => {
    const f = o.key.slice(BACKUP_PREFIX.length);
    return f.startsWith('backup-') && f.endsWith('.json');
  });
  let newest = 0;
  for (const o of jsons) newest = Math.max(newest, o.uploaded.getTime());
  return newest === 0 ? null : Date.now() - newest;
}

export async function autoBackupIfStale(
  prisma: PrismaClient,
  env: Env,
): Promise<{ ran: boolean; filename?: string }> {
  const age = await lastBackupAgeMs(env);
  if (age !== null && age < BACKUP_INTERVAL_MS) return { ran: false };
  const { filename } = await writeBackup(prisma, env);
  return { ran: true, filename };
}

// Zip every uploaded media object into backups/media-<stamp>.zip.
export async function writeMediaZip(env: Env): Promise<{ filename: string; sizeBytes: number }> {
  const zip = new JSZip();
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix: 'media/', cursor });
    for (const o of page.objects) {
      const obj = await env.MEDIA.get(o.key);
      if (!obj) continue;
      zip.file(o.key.slice('media/'.length), await obj.arrayBuffer());
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  const body = await zip.generateAsync({ type: 'arraybuffer' });
  const filename = `media-${stamp()}.zip`;
  await env.MEDIA.put(`${BACKUP_PREFIX}${filename}`, body, {
    httpMetadata: { contentType: 'application/zip' },
  });
  return { filename, sizeBytes: body.byteLength };
}

export interface RestoreInput {
  schemaVersion: number;
  persons: Array<Record<string, unknown>>;
  marriages: Array<Record<string, unknown>>;
  branches: Array<Record<string, unknown>>;
  media: Array<Record<string, unknown>>;
}

export interface RestoreResult {
  inserted: { persons: number; marriages: number; branches: number; media: number };
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
  prisma: PrismaClient,
  env: Env,
  input: RestoreInput,
  opts: { force: boolean },
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
      throw Object.assign(new Error('Cơ sở dữ liệu chưa trống. Dùng ?force=true để ghi đè.'), {
        status: 409,
      });
    }
  }

  // D1 has no interactive transactions — run sequentially.
  if (opts.force) {
    await prisma.media.deleteMany({});
    await prisma.marriage.deleteMany({});
    await prisma.person.deleteMany({});
    await prisma.branch.deleteMany({});
  }
  for (const b of input.branches) {
    const id = asStr(b['id']);
    const name = asStr(b['name']);
    if (!id || !name) continue;
    await prisma.branch.create({
      data: { id, name, description: asStr(b['description']), createdAt: toDate(b['createdAt']) ?? new Date() },
    });
  }
  for (const p of input.persons) {
    const id = asStr(p['id']);
    const fullName = asStr(p['fullName']);
    const gender = asStr(p['gender']);
    if (!id || !fullName || !gender) continue;
    await prisma.person.create({
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
    await prisma.person.update({ where: { id }, data: { fatherId, motherId } });
  }
  for (const m of input.marriages) {
    const id = asStr(m['id']);
    const husbandId = asStr(m['husbandId']);
    const wifeId = asStr(m['wifeId']);
    if (!id || !husbandId || !wifeId) continue;
    await prisma.marriage.create({
      data: { id, husbandId, wifeId, marriageDate: toDate(m['marriageDate']), createdAt: toDate(m['createdAt']) ?? new Date() },
    });
  }
  const missingMedia: RestoreResult['missingMedia'] = [];
  for (const md of input.media) {
    const id = asStr(md['id']);
    const personId = asStr(md['personId']);
    const filePath = asStr(md['filePath']);
    const type = asStr(md['type']);
    if (!id || !personId || !filePath || !type) continue;
    // A backup file is operator-supplied input. Refuse anything that doesn't
    // look like a path produced by our own media route — the only thing between
    // a malicious backup and a stored javascript:/data: href that would render
    // as a clickable link on the profile page.
    if (!/^\/uploads\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(filePath)) {
      missingMedia.push({ id, filePath, reason: 'missing' });
      continue;
    }
    await prisma.media.create({
      data: { id, personId, filePath, type, caption: asStr(md['caption']), createdAt: toDate(md['createdAt']) ?? new Date() },
    });
    const expected = asStr(md['sha256']);
    if (expected) {
      const actual = await sha256Object(env, filePath);
      if (actual === null) missingMedia.push({ id, filePath, reason: 'missing' });
      else if (actual !== expected) missingMedia.push({ id, filePath, reason: 'hash-mismatch' });
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
}

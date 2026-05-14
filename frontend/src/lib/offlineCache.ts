// Offline cache. One idb-keyval database per logical "object store" — sticks to
// the phase-1 dep list while giving us isolated read/write paths for each entity.

import { createStore, get, set, keys, del, clear } from 'idb-keyval';
import type { Marriage, Media, Person, PersonWithRelations } from '@roots/shared';

const personsStore = createStore('roots-persons', 'persons');
const marriagesStore = createStore('roots-marriages', 'marriages');
const branchesStore = createStore('roots-branches', 'branches');
const mediaStore = createStore('roots-media', 'media');
const metaStore = createStore('roots-meta', 'meta');
const pendingMutationsStore = createStore('roots-pending', 'pendingMutations');

const META_LAST_SYNC = 'lastSyncedAt';
const META_RECENT_PERSONS = 'recentPersons';

export async function setLastSyncedAt(iso: string = new Date().toISOString()): Promise<void> {
  await set(META_LAST_SYNC, iso, metaStore);
}
export async function getLastSyncedAt(): Promise<string | null> {
  return (await get<string>(META_LAST_SYNC, metaStore)) ?? null;
}

export async function bulkPutPersons(items: Person[]): Promise<void> {
  // idb-keyval doesn't expose a bulk put; loop is fine for ~thousands of rows.
  for (const p of items) await set(p.id, p, personsStore);
  await setLastSyncedAt();
}
export async function getAllPersons(): Promise<Person[]> {
  const ks = await keys(personsStore);
  const out: Person[] = [];
  for (const k of ks) {
    const v = await get<Person>(String(k), personsStore);
    if (v) out.push(v);
  }
  return out;
}
export async function putPerson(p: PersonWithRelations | Person): Promise<void> {
  await set(p.id, p, personsStore);
  const recent = (await get<string[]>(META_RECENT_PERSONS, metaStore)) ?? [];
  const next = [p.id, ...recent.filter((x) => x !== p.id)].slice(0, 50);
  await set(META_RECENT_PERSONS, next, metaStore);
  // Bump lastSyncedAt so a user who only ever opens a profile (never the tree)
  // is still "primed" enough to bypass the cold-start gate offline.
  await setLastSyncedAt();
}
export async function getPerson<T extends Person | PersonWithRelations = PersonWithRelations>(
  id: string,
): Promise<T | null> {
  return ((await get<T>(id, personsStore)) ?? null) as T | null;
}
export async function listRecentPersonIds(): Promise<string[]> {
  return (await get<string[]>(META_RECENT_PERSONS, metaStore)) ?? [];
}

export async function bulkPutBranches(items: Array<{ id: string; name: string }>): Promise<void> {
  for (const b of items) await set(b.id, b, branchesStore);
}
export async function bulkPutMarriages(items: Marriage[]): Promise<void> {
  for (const m of items) await set(m.id, m, marriagesStore);
}
export async function bulkPutMedia(items: Media[]): Promise<void> {
  for (const m of items) await set(m.id, m, mediaStore);
}

// Phase-3 hook — already wired so syncing offline writes later doesn't need a migration.
export interface PendingMutation {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  url: string;
  body: unknown;
  createdAt: string;
}
export async function listPendingMutations(): Promise<PendingMutation[]> {
  const ks = await keys(pendingMutationsStore);
  const out: PendingMutation[] = [];
  for (const k of ks) {
    const v = await get<PendingMutation>(String(k), pendingMutationsStore);
    if (v) out.push(v);
  }
  return out;
}
export async function clearPendingMutations(): Promise<void> {
  await clear(pendingMutationsStore);
}
export async function deletePendingMutation(id: string): Promise<void> {
  await del(id, pendingMutationsStore);
}

// Back-compat aliases so existing call sites keep working.
export const cacheTree = bulkPutPersons;
export const readTree = getAllPersons;
export const cachePerson = putPerson;
export const readPerson = getPerson;

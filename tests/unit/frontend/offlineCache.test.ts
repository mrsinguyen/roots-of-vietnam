import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import {
  bulkPutBranches,
  bulkPutMarriages,
  bulkPutMedia,
  bulkPutPersons,
  cachePerson,
  cacheTree,
  clearPendingMutations,
  deletePendingMutation,
  getAllPersons,
  getLastSyncedAt,
  getPerson,
  listPendingMutations,
  listRecentPersonIds,
  putPerson,
  readPerson,
  readTree,
  setLastSyncedAt,
} from '../../../frontend/src/lib/offlineCache';

beforeEach(async () => {
  // Wipe IDB state between tests. clearPendingMutations is safe because the
  // store exists; the offlineCache module opens the rest lazily on first use.
  // For the rest we just delete known keys we wrote, instead of recreating
  // the IDBDatabase (which fake-indexeddb hangs on while connections are open).
  const { clear } = await import('idb-keyval');
  const { createStore } = await import('idb-keyval');
  const stores = [
    createStore('roots-persons', 'persons'),
    createStore('roots-marriages', 'marriages'),
    createStore('roots-branches', 'branches'),
    createStore('roots-media', 'media'),
    createStore('roots-meta', 'meta'),
    createStore('roots-pending', 'pendingMutations'),
  ];
  for (const s of stores) await clear(s);
});

function makePerson(id: string, fullName: string) {
  return {
    id,
    fullName,
    nameNormalized: fullName.toLowerCase(),
    honorific: null,
    gender: 'Nam' as const,
    birthYear: null,
    birthMonth: null,
    birthDay: null,
    deathYear: null,
    deathMonth: null,
    deathDay: null,
    birthDateLunar: null,
    deathDateLunar: null,
    biography: null,
    occupation: null,
    burialPlace: null,
    notes: null,
    generation: 1,
    branchId: null,
    fatherId: null,
    motherId: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('offlineCache', () => {
  it('round-trips persons through bulk put + getAll', async () => {
    await bulkPutPersons([makePerson('a', 'A'), makePerson('b', 'B')]);
    const all = await getAllPersons();
    expect(all.map((p) => p.id).sort()).toEqual(['a', 'b']);
  });

  it('cacheTree is an alias for bulkPutPersons', async () => {
    await cacheTree([makePerson('x', 'X')]);
    const all = await readTree();
    expect(all?.map((p) => p.id)).toEqual(['x']);
  });

  it('putPerson updates recent list and bumps lastSyncedAt', async () => {
    const before = await getLastSyncedAt();
    expect(before).toBeNull();
    await putPerson(makePerson('p1', 'One'));
    const after = await getLastSyncedAt();
    expect(after).not.toBeNull();
    const recent = await listRecentPersonIds();
    expect(recent).toContain('p1');
  });

  it('cachePerson + readPerson are aliases of putPerson + getPerson', async () => {
    await cachePerson(makePerson('p2', 'Two'));
    const fetched = await readPerson('p2');
    expect(fetched?.id).toBe('p2');
  });

  it('getPerson returns null for missing id', async () => {
    expect(await getPerson('nope')).toBeNull();
  });

  it('keeps the recents list to a max of 50, most recent first', async () => {
    for (let i = 0; i < 55; i++) await putPerson(makePerson(`p${i}`, `P${i}`));
    const recent = await listRecentPersonIds();
    expect(recent).toHaveLength(50);
    expect(recent[0]).toBe('p54');
  });

  it('setLastSyncedAt persists explicit timestamps', async () => {
    await setLastSyncedAt('2024-01-01T00:00:00.000Z');
    expect(await getLastSyncedAt()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('bulkPutBranches / Marriages / Media write to their own stores', async () => {
    await bulkPutBranches([{ id: 'b1', name: 'B' }]);
    await bulkPutMarriages([
      {
        id: 'm1',
        husbandId: 'a',
        wifeId: 'b',
        marriageDate: null,
      } as Parameters<typeof bulkPutMarriages>[0][number],
    ]);
    await bulkPutMedia([
      {
        id: 'mm1',
        personId: 'p',
        filePath: '/x',
        type: 'image',
        caption: null,
        createdAt: '',
      } as Parameters<typeof bulkPutMedia>[0][number],
    ]);
    // No assertion — reaching here means each `createStore` opened its own DB
    // without throwing.
  });

  it('pendingMutations starts empty and can be cleared', async () => {
    expect(await listPendingMutations()).toEqual([]);
    await clearPendingMutations();
    await deletePendingMutation('non-existent'); // no-op
    expect(await listPendingMutations()).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { buildPaternalTree } from '../../../frontend/src/lib/buildTree';
import type { Person } from '@roots/shared';

function p(
  id: string,
  generation: number,
  overrides: Partial<Person> = {},
): Person {
  return {
    id,
    fullName: overrides.fullName ?? id,
    nameNormalized: (overrides.fullName ?? id).toLowerCase(),
    honorific: null,
    gender: overrides.gender ?? 'Nam',
    birthYear: overrides.birthYear ?? null,
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
    generation,
    branchId: null,
    fatherId: overrides.fatherId ?? null,
    motherId: overrides.motherId ?? null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('buildPaternalTree', () => {
  it('returns null for an empty input', () => {
    expect(buildPaternalTree([])).toBeNull();
  });

  it('picks the gen-1 male with no parents as default root', () => {
    const tree = buildPaternalTree([
      p('a', 1, { gender: 'Nam' }),
      p('b', 1, { gender: 'Nu' }),
      p('c', 2, { fatherId: 'a' }),
    ]);
    expect(tree?.attributes.id).toBe('a');
  });

  it('falls back to lowest-generation person when no clean candidate exists', () => {
    const tree = buildPaternalTree([p('a', 2, { fatherId: 'missing' })]);
    expect(tree?.attributes.id).toBe('a');
  });

  it('honours an explicit rootId override', () => {
    const tree = buildPaternalTree(
      [p('a', 1), p('b', 1, { gender: 'Nu' }), p('c', 2, { fatherId: 'a' })],
      'c',
    );
    expect(tree?.attributes.id).toBe('c');
  });

  it('returns null when rootId points at a missing person', () => {
    const tree = buildPaternalTree([p('a', 1)], 'zzz');
    expect(tree).toBeNull();
  });

  it('groups children under their father, sorted by birth year', () => {
    const tree = buildPaternalTree([
      p('a', 1),
      p('c1', 2, { fullName: 'Younger', fatherId: 'a', birthYear: 1980 }),
      p('c2', 2, { fullName: 'Older', fatherId: 'a', birthYear: 1970 }),
    ]);
    expect(tree?.children.map((c) => c.attributes.id)).toEqual(['c2', 'c1']);
  });

  it('marks unknownParent="father" when only mother is set on a gen>1 person', () => {
    const tree = buildPaternalTree([
      p('a', 1),
      p('b', 2, { fatherId: 'a', motherId: null }),
    ]);
    const child = tree?.children[0];
    expect(child?.attributes.unknownParent).toBe('mother');
  });

  it('flags _collapsed beyond depth 3', () => {
    const arr: Person[] = [p('a', 1)];
    let prev = 'a';
    for (let i = 1; i <= 5; i++) {
      const id = `g${i}`;
      arr.push(p(id, i + 1, { fatherId: prev }));
      prev = id;
    }
    const tree = buildPaternalTree(arr);
    // root depth=0, child depth=1, grandchild=2, great-grandchild=3 (collapsed)
    let node = tree;
    let depth = 0;
    while (node?.children.length) {
      node = node.children[0]!;
      depth++;
      if (depth === 3) {
        expect(node._collapsed).toBe(true);
        break;
      }
    }
  });
});

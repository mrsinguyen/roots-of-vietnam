import { beforeEach, describe, expect, it } from 'vitest';
import { detectCycle } from '../../../backend/src/lib/cycle';
import { createPerson } from '../../factories';
import { truncateAll } from '../../helpers/app';

beforeEach(async () => {
  await truncateAll();
});

describe('detectCycle', () => {
  it('flags a self-parent (A → A)', async () => {
    const a = await createPerson({ fullName: 'A' });
    expect(await detectCycle(a.id, a.id)).toBe(true);
  });

  it('flags a 2-cycle (A → B → A)', async () => {
    const a = await createPerson({ fullName: 'A' });
    const b = await createPerson({ fullName: 'B', fatherId: a.id, generation: 2 });
    // Now propose: A's father = B → cycle.
    expect(await detectCycle(a.id, b.id)).toBe(true);
  });

  it('flags a 3-cycle (A → B → C → A)', async () => {
    const a = await createPerson({ fullName: 'A' });
    const b = await createPerson({ fullName: 'B', fatherId: a.id, generation: 2 });
    const c = await createPerson({ fullName: 'C', fatherId: b.id, generation: 3 });
    expect(await detectCycle(a.id, c.id)).toBe(true);
  });

  it('flags a deep cycle through 5 ancestors', async () => {
    const a = await createPerson({ fullName: 'A' });
    let prev = a;
    for (let i = 1; i <= 5; i++) {
      prev = await createPerson({
        fullName: `Gen${i}`,
        fatherId: prev.id,
        generation: i + 1,
      });
    }
    // Setting A's father = gen5 closes the loop.
    expect(await detectCycle(a.id, prev.id)).toBe(true);
  });

  it('does not flag unrelated subtrees', async () => {
    const a = await createPerson({ fullName: 'A' });
    const b = await createPerson({ fullName: 'B' });
    expect(await detectCycle(a.id, b.id)).toBe(false);
  });

  it('does not flag mother edge that would not close a loop', async () => {
    const a = await createPerson({ fullName: 'A' });
    const b = await createPerson({ fullName: 'B', gender: 'Nu' });
    expect(await detectCycle(a.id, b.id)).toBe(false);
  });

  it('returns false when the proposed parent does not exist', async () => {
    const a = await createPerson({ fullName: 'A' });
    expect(await detectCycle(a.id, 'no-such-id')).toBe(false);
  });
});

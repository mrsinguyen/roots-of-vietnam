import { beforeEach, describe, expect, it } from 'vitest';
import { computeGeneration } from '../../../backend/src/lib/generation';
import { createPerson } from '../../factories';
import { truncateAll } from '../../helpers/app';

beforeEach(async () => {
  await truncateAll();
});

describe('computeGeneration', () => {
  it('defaults to 1 when no parents are known', async () => {
    expect(await computeGeneration(null, null)).toBe(1);
  });

  it('is father.generation + 1 when only father is known', async () => {
    const f = await createPerson({ generation: 3 });
    expect(await computeGeneration(f.id, null)).toBe(4);
  });

  it('is mother.generation + 1 when only mother is known', async () => {
    const m = await createPerson({ generation: 2, gender: 'Nu' });
    expect(await computeGeneration(null, m.id)).toBe(3);
  });

  it('uses max(father, mother) + 1 when both differ', async () => {
    const f = await createPerson({ generation: 5 });
    const m = await createPerson({ generation: 2, gender: 'Nu' });
    expect(await computeGeneration(f.id, m.id)).toBe(6);
  });

  it('falls back to 1 when parent ids point at deleted rows', async () => {
    expect(await computeGeneration('missing-father', 'missing-mother')).toBe(1);
  });
});

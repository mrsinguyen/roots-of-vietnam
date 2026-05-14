// Stress fixture: generates ~200 persons across 5 generations under the existing
// thủy tổ so the tree page can be perf-tested. Idempotent — wipes the previous
// stress cohort (prefix `stress-`) before re-inserting.

import { PrismaClient } from '@prisma/client';
import { normalizeName } from '../src/lib/normalize.js';

const prisma = new PrismaClient();

const TOTAL = 200;

async function main(): Promise<void> {
  // Anchor: first person sorted by generation asc, then fullName — the actual thủy tổ.
  const anchor = await prisma.person.findFirst({
    where: { generation: 1, fatherId: null, motherId: null, gender: 'Nam' },
    orderBy: { fullName: 'asc' },
  });
  if (!anchor) {
    console.error('No anchor person found. Run `pnpm seed` first.');
    process.exit(1);
  }

  await prisma.media.deleteMany({ where: { person: { fullName: { startsWith: 'stress-' } } } });
  await prisma.marriage.deleteMany({});
  await prisma.person.deleteMany({ where: { fullName: { startsWith: 'stress-' } } });

  // Generate 200 stress persons in a binary tree under anchor.
  // gen 2 has 4, gen 3 has 16, gen 4 has 64, gen 5 has 116 — totals ~200.
  const layers = [4, 16, 64, 116];
  const ids: string[][] = [[anchor.id]];
  let counter = 0;
  for (let i = 0; i < layers.length; i++) {
    const want = layers[i]!;
    const parents = ids[i]!;
    const thisGen: string[] = [];
    for (let j = 0; j < want; j++) {
      const father = parents[j % parents.length]!;
      const name = `stress-${i + 2}-${j.toString().padStart(3, '0')}`;
      const person = await prisma.person.create({
        data: {
          fullName: name,
          nameNormalized: normalizeName(name),
          gender: j % 2 === 0 ? 'Nam' : 'Nu',
          generation: i + 2,
          fatherId: father,
          birthYear: 1900 + (i + 2) * 25 + j,
        },
      });
      thisGen.push(person.id);
      counter++;
      if (counter >= TOTAL) break;
    }
    ids.push(thisGen);
    if (counter >= TOTAL) break;
  }
  console.log(`[stress-seed] inserted ${counter} persons under anchor ${anchor.fullName}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

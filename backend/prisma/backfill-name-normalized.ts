// Idempotent helper: refresh Person.nameNormalized from fullName. Safe to re-run any time.
// The original two-step migration also used this script to backfill date triplets, but
// after the legacy DateTime columns were dropped that part is no longer reachable.

import { PrismaClient } from '@prisma/client';
import { normalizeName } from '../src/lib/normalize.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const all = await prisma.person.findMany({ select: { id: true, fullName: true } });
  for (const p of all) {
    await prisma.person.update({
      where: { id: p.id },
      data: { nameNormalized: normalizeName(p.fullName) },
    });
  }
  console.log(`[backfill] refreshed nameNormalized on ${all.length} persons`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

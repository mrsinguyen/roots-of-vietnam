import { prisma } from '../prisma.js';

// Generation = max(parent.generation) + 1, default 1 if no known parent.
export async function computeGeneration(
  fatherId: string | null,
  motherId: string | null,
): Promise<number> {
  if (!fatherId && !motherId) return 1;
  const ids = [fatherId, motherId].filter((id): id is string => Boolean(id));
  const parents = await prisma.person.findMany({
    where: { id: { in: ids } },
    select: { generation: true },
  });
  if (parents.length === 0) return 1;
  return Math.max(...parents.map((p) => p.generation)) + 1;
}

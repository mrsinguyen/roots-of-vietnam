import type { PrismaClient } from '../../prisma/generated';

// Generation = max(parent.generation) + 1, default 1 if no known parent.
export async function computeGeneration(
  prisma: PrismaClient,
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

// Walk up the ancestry of `parentId`. If we reach `id`, the proposed edge
// (id <- parentId) would close a cycle. Bounded so a corrupt tree can't spin
// forever.
const ANCESTOR_LIMIT = 200;

export async function detectCycle(
  prisma: PrismaClient,
  id: string,
  parentId: string,
): Promise<boolean> {
  if (id === parentId) return true;
  const seen = new Set<string>();
  const queue: string[] = [parentId];
  while (queue.length > 0 && seen.size < ANCESTOR_LIMIT) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (current === id) return true;
    const parents = await prisma.person.findUnique({
      where: { id: current },
      select: { fatherId: true, motherId: true },
    });
    if (!parents) continue;
    if (parents.fatherId) queue.push(parents.fatherId);
    if (parents.motherId) queue.push(parents.motherId);
  }
  return false;
}

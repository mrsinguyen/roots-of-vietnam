import { prisma } from '../prisma.js';

// Walk up the ancestry of `parentId`. If we ever reach `id`, the proposed edge
// (id ← parentId) would close a cycle. Bounded by ANCESTOR_LIMIT so a corrupt
// tree can't spin forever.
const ANCESTOR_LIMIT = 200;

export async function detectCycle(id: string, parentId: string): Promise<boolean> {
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

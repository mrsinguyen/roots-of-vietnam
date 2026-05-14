import type { Person } from '@roots/shared';

export interface TreeNode {
  name: string;
  attributes: {
    id: string;
    gender: string;
    generation: number;
    /** spouses joined as a comma-separated list, shown under the node */
    spouses?: string;
    /** "father" or "mother" if exactly one of the rendered person's parents is unknown */
    unknownParent?: 'father' | 'mother' | 'both';
    /** true for synthetic "Chưa rõ" placeholders inserted for unknown parents */
    placeholder?: boolean;
  };
  children: TreeNode[];
  _collapsed?: boolean;
}

type TreeInput = Array<
  Person & {
    marriagesAsHusband?: Array<{ wifeId: string }>;
    marriagesAsWife?: Array<{ husbandId: string }>;
  }
>;

const COLLAPSE_DEPTH = 3;

// Builds a paternal-line tree from the flat person list. Each father becomes the parent
// of his children-as-father. People not appearing as a child (root candidates) live at top.
export function buildPaternalTree(persons: TreeInput, rootId?: string): TreeNode | null {
  if (persons.length === 0) return null;
  const byId = new Map<string, TreeInput[number]>();
  for (const p of persons) byId.set(p.id, p);

  function spouseNamesFor(p: TreeInput[number]): string | undefined {
    const ids = new Set<string>();
    for (const m of p.marriagesAsHusband ?? []) ids.add(m.wifeId);
    for (const m of p.marriagesAsWife ?? []) ids.add(m.husbandId);
    if (ids.size === 0) return undefined;
    return Array.from(ids)
      .map((id) => byId.get(id)?.fullName)
      .filter((n): n is string => Boolean(n))
      .join(', ');
  }

  function nodeFor(p: TreeInput[number], depth: number): TreeNode {
    const kids = persons
      .filter((c) => c.fatherId === p.id)
      .sort(
        (a, b) =>
          (a.birthYear ?? Number.POSITIVE_INFINITY) - (b.birthYear ?? Number.POSITIVE_INFINITY),
      );
    // Tree of unknown-parent stubs: when both father and mother are null on
    // someone past generation 1, surface that as a "Chưa rõ" leaf so the
    // viewer knows the link exists but is unknown.
    const children = kids.map((c) => nodeFor(c, depth + 1));
    let unknownParent: TreeNode['attributes']['unknownParent'];
    if (p.generation > 1) {
      const missingFather = !p.fatherId;
      const missingMother = !p.motherId;
      if (missingFather && missingMother) unknownParent = 'both';
      else if (missingFather) unknownParent = 'father';
      else if (missingMother) unknownParent = 'mother';
    }
    const node: TreeNode = {
      name: p.fullName,
      attributes: {
        id: p.id,
        gender: p.gender,
        generation: p.generation,
        spouses: spouseNamesFor(p),
        unknownParent,
      },
      children,
    };
    // Default-collapse anything more than COLLAPSE_DEPTH levels from the root
    // so a 200-person tree doesn't paint everything at once.
    if (depth >= COLLAPSE_DEPTH && children.length > 0) {
      node._collapsed = true;
    }
    return node;
  }

  if (rootId) {
    const root = byId.get(rootId);
    return root ? nodeFor(root, 0) : null;
  }
  // Default root: generation 1 with no parents. Married-in spouses at gen > 1 are excluded.
  // Prefer males (paternal-line tradition) when there's a tie.
  const candidates = persons
    .filter((p) => p.generation === 1 && !p.fatherId && !p.motherId)
    .sort((a, b) => {
      if (a.gender !== b.gender) return a.gender === 'Nam' ? -1 : 1;
      return a.fullName.localeCompare(b.fullName);
    });
  if (candidates.length === 0) {
    const minGen = Math.min(...persons.map((p) => p.generation));
    const fallback = persons.find((p) => p.generation === minGen);
    return fallback ? nodeFor(fallback, 0) : null;
  }
  const root = candidates[0];
  return root ? nodeFor(root, 0) : null;
}

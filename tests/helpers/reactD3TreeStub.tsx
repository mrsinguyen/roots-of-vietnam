// Replacement for `react-d3-tree` during tests. Vite aliases the bare
// specifier to this file in vitest.config.ts. The real module's SVG/d3-zoom
// internals don't work in jsdom; this stub captures props so component tests
// can assert on them without a real browser.

import type { JSX } from 'react';

export interface CapturedTreeState {
  current: Record<string, unknown> | null;
  renderCalls: Array<Record<string, unknown>>;
}

export const captured: CapturedTreeState = { current: null, renderCalls: [] };

interface Rd3Node {
  nodeDatum: { name: string; attributes?: Record<string, unknown> };
}

function Tree(props: Record<string, unknown>): JSX.Element {
  captured.current = props;
  const data = props.data as { name?: string } | null;
  const render = props.renderCustomNodeElement as ((node: Rd3Node) => unknown) | undefined;
  if (render) {
    const samples: Array<Rd3Node> = [
      { nodeDatum: { name: 'Root', attributes: { id: 'r', gender: 'Nam', generation: 1 } } },
      {
        nodeDatum: {
          name: 'Mother',
          attributes: { id: 'm', gender: 'Nu', generation: 2, spouses: 'X', unknownParent: 'mother' },
        },
      },
      {
        nodeDatum: {
          name: 'Other',
          attributes: { id: 'k', gender: 'Khac', generation: 3, unknownParent: 'both' },
        },
      },
      {
        nodeDatum: {
          name: 'NoFather',
          attributes: { id: 'u', gender: 'Nam', generation: 2, unknownParent: 'father' },
        },
      },
      {
        nodeDatum: { name: 'Synth', attributes: { id: '__root__', gender: 'Khac', generation: 0 } },
      },
    ];
    for (const s of samples) {
      try {
        render(s);
        captured.renderCalls.push(s);
      } catch {
        // Don't let a renderer side effect break the test.
      }
    }
  }
  return <div data-testid="tree-stub">{data?.name ?? 'empty'}</div>;
}

export default Tree;

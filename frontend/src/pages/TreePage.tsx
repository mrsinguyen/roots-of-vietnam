import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Tree from 'react-d3-tree';
import type { Person } from '@roots/shared';
import { api, ApiError } from '../lib/api';
import { buildPaternalTree, type TreeNode } from '../lib/buildTree';
import { cacheTree, readTree } from '../lib/offlineCache';
import { useToast } from '../context/ToastContext';
import { vi } from '../locales/vi';
import ProfileDrawer from '../components/ProfileDrawer';

type TreePerson = Person & {
  marriagesAsHusband: Array<{ id: string; wifeId: string; marriageDate: string | null }>;
  marriagesAsWife: Array<{ id: string; husbandId: string; marriageDate: string | null }>;
};

type Orientation = 'vertical' | 'horizontal';

export default function TreePage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [persons, setPersons] = useState<TreePerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [orientation, setOrientation] = useState<Orientation>('vertical');
  const rootId = searchParams.get('root') ?? '';
  const setRootId = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('root', id);
    else next.delete('root');
    setSearchParams(next, { replace: true });
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setLoading(true);
      try {
        const res = await api.getTree();
        if (cancelled) return;
        setPersons(res.items as TreePerson[]);
        await cacheTree(res.items as Person[]);
      } catch (err) {
        const cached = await readTree();
        if (cached && !cancelled) {
          setPersons(cached as TreePerson[]);
        } else if (!cancelled) {
          toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setDims({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tree: TreeNode | null = useMemo(
    () => buildPaternalTree(persons, rootId || undefined),
    [persons, rootId],
  );

  const rootChoices = useMemo(
    () =>
      [...persons]
        .filter((p) => !p.fatherId || p.generation === 1)
        .sort((a, b) => a.generation - b.generation || a.fullName.localeCompare(b.fullName)),
    [persons],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{vi.tree.title}</h2>
        <div className="flex items-center gap-2 text-sm">
          <div className="inline-flex overflow-hidden rounded-md border border-stone-300">
            <button
              className={`px-3 py-1 ${
                orientation === 'vertical' ? 'bg-bark-600 text-white' : 'bg-white text-stone-700'
              }`}
              onClick={() => setOrientation('vertical')}
            >
              {vi.tree.vertical}
            </button>
            <button
              className={`px-3 py-1 ${
                orientation === 'horizontal'
                  ? 'bg-bark-600 text-white'
                  : 'bg-white text-stone-700'
              }`}
              onClick={() => setOrientation('horizontal')}
            >
              {vi.tree.horizontal}
            </button>
          </div>
          <select
            className="input w-56"
            value={rootId}
            onChange={(e) => setRootId(e.target.value)}
          >
            <option value="">{vi.tree.selectRoot} (mặc định)</option>
            {rootChoices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} · Đời {p.generation}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        ref={containerRef}
        className="card relative h-[70vh] w-full overflow-hidden bg-bark-50/40"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-stone-500">
            {vi.common.loading}
          </div>
        ) : !tree ? (
          <div className="flex h-full items-center justify-center text-stone-500">
            {vi.tree.noRootSelected}
          </div>
        ) : (
          <Tree
            data={tree}
            orientation={orientation}
            translate={{ x: dims.w / 2, y: orientation === 'vertical' ? 80 : dims.h / 2 }}
            collapsible
            initialDepth={3}
            zoom={0.85}
            nodeSize={
              orientation === 'vertical'
                ? { x: 200, y: 120 }
                : { x: 240, y: 80 }
            }
            separation={{ siblings: 1.1, nonSiblings: 1.4 }}
            pathFunc="step"
            renderCustomNodeElement={(rd3) => {
              const id = (rd3.nodeDatum.attributes?.id ?? '') as string;
              const gender = (rd3.nodeDatum.attributes?.gender ?? '') as string;
              const spouses = (rd3.nodeDatum.attributes?.spouses ?? '') as string;
              const unknownParent = rd3.nodeDatum.attributes?.unknownParent as
                | 'father'
                | 'mother'
                | 'both'
                | undefined;
              const unknownLabel =
                unknownParent === 'father'
                  ? 'Chưa rõ cha'
                  : unknownParent === 'mother'
                    ? 'Chưa rõ mẹ'
                    : unknownParent === 'both'
                      ? 'Chưa rõ cha mẹ'
                      : '';
              const fill =
                gender === 'Nam' ? '#bfdbfe' : gender === 'Nu' ? '#fbcfe8' : '#e7e5e4';
              const stroke =
                gender === 'Nam' ? '#1d4ed8' : gender === 'Nu' ? '#be185d' : '#57534e';
              const extraLines = (spouses ? 1 : 0) + (unknownLabel ? 1 : 0);
              const height = 28 + extraLines * 16;
              return (
                <g
                  onClick={() => {
                    if (id && id !== '__root__') setOpenId(id);
                  }}
                  style={{ cursor: id ? 'pointer' : 'default' }}
                >
                  <rect
                    x={-90}
                    y={-height / 2}
                    width={180}
                    height={height}
                    rx={6}
                    ry={6}
                    fill={fill}
                    stroke={stroke}
                  />
                  <text
                    fill="#1c1917"
                    strokeWidth="0"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    y={extraLines === 0 ? 0 : -extraLines * 8}
                    fontSize={13}
                    style={{ fontWeight: 500 }}
                  >
                    {rd3.nodeDatum.name}
                  </text>
                  {spouses && (
                    <text
                      fill="#57534e"
                      strokeWidth="0"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      y={unknownLabel ? -2 : 12}
                      fontSize={11}
                    >
                      ⚭ {spouses}
                    </text>
                  )}
                  {unknownLabel && (
                    <text
                      fill="#a16207"
                      strokeWidth="0"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      y={spouses ? 14 : 14}
                      fontSize={11}
                      style={{ fontStyle: 'italic' }}
                    >
                      {unknownLabel}
                    </text>
                  )}
                </g>
              );
            }}
          />
        )}
      </div>

      <ProfileDrawer personId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            {vi.tree.title}
          </h2>
          <p className="text-sm text-stone-500">
            {loading ? vi.common.loading : `${persons.length} nhân vật`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
          <div className="inline-flex w-full overflow-hidden rounded-lg border border-stone-300 bg-white shadow-soft sm:w-auto">
            <button
              type="button"
              className={`flex-1 px-3 py-2 text-sm transition-colors sm:flex-none ${
                orientation === 'vertical'
                  ? 'bg-bark-600 text-white'
                  : 'bg-white text-stone-700 hover:bg-stone-50'
              }`}
              onClick={() => setOrientation('vertical')}
            >
              {vi.tree.vertical}
            </button>
            <button
              type="button"
              className={`flex-1 px-3 py-2 text-sm transition-colors sm:flex-none ${
                orientation === 'horizontal'
                  ? 'bg-bark-600 text-white'
                  : 'bg-white text-stone-700 hover:bg-stone-50'
              }`}
              onClick={() => setOrientation('horizontal')}
            >
              {vi.tree.horizontal}
            </button>
          </div>
          <select
            className="input w-full sm:w-64"
            value={rootId}
            onChange={(e) => setRootId(e.target.value)}
            aria-label={vi.tree.selectRoot}
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
        className="card relative h-[calc(100vh-260px)] min-h-[420px] w-full overflow-hidden bg-paper"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-4 select-none font-serif text-[8rem] leading-none text-bark-700/[0.05] sm:text-[11rem]"
        >
          譜
        </span>
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
                gender === 'Nam' ? '#dbeafe' : gender === 'Nu' ? '#fce7f3' : '#f5f5f4';
              const stroke =
                gender === 'Nam' ? '#2563eb' : gender === 'Nu' ? '#db2777' : '#78716c';
              const extraLines = (spouses ? 1 : 0) + (unknownLabel ? 1 : 0);
              const height = 30 + extraLines * 16;
              return (
                <g
                  onClick={() => {
                    if (id && id !== '__root__') setOpenId(id);
                  }}
                  style={{ cursor: id ? 'pointer' : 'default' }}
                >
                  <rect
                    x={-92}
                    y={-height / 2}
                    width={184}
                    height={height}
                    rx={10}
                    ry={10}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={1.2}
                  />
                  <text
                    fill="#1c1917"
                    strokeWidth="0"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    y={extraLines === 0 ? 0 : -extraLines * 8}
                    fontSize={13}
                    style={{ fontWeight: 600 }}
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

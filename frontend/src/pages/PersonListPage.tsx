import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Branch, Person } from '@roots/shared';
import { GENDER_LABEL } from '@roots/shared';
import { api, ApiError } from '../lib/api';
import { useDebounced } from '../lib/useDebounced';
import { yearLabel } from '../lib/format';
import { useAuth, hasRole } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { vi } from '../locales/vi';

export default function PersonListPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const [generation, setGeneration] = useState<string>('');
  const [branchId, setBranchId] = useState<string>('');
  const [birthYear, setBirthYear] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [items, setItems] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedQ = useDebounced(q, 300);
  const debouncedLoc = useDebounced(location, 300);

  useEffect(() => {
    api
      .listBranches()
      .then((r) => setBranches(r.items))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listPersons({
        q: debouncedQ || undefined,
        generation: generation ? Number(generation) : undefined,
        branchId: branchId || undefined,
        birthYear: birthYear ? Number(birthYear) : undefined,
        location: debouncedLoc || undefined,
      })
      .then((r) => {
        if (cancelled) return;
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, debouncedLoc, generation, branchId, birthYear, toast]);

  const canEdit = hasRole(user, 'admin', 'editor');
  const branchById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of branches) m.set(b.id, b.name);
    return m;
  }, [branches]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            {vi.nav.persons}
          </h2>
          <p className="text-sm text-stone-500">
            {loading ? vi.common.loading : `${total} nhân vật`}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="btn-primary whitespace-nowrap"
            onClick={() => navigate('/persons/new')}
          >
            <span aria-hidden="true">+</span>
            <span className="hidden sm:inline">{vi.person.addPerson}</span>
            <span className="sm:hidden">Thêm</span>
          </button>
        )}
      </div>

      <div className="card p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <input
            className="input"
            placeholder={vi.common.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary shrink-0 sm:hidden"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            {filtersOpen ? 'Ẩn' : 'Lọc'}
          </button>
        </div>
        <div
          className={`${filtersOpen ? 'grid' : 'hidden'} mt-3 grid-cols-1 gap-3 sm:grid sm:grid-cols-4`}
        >
          <input
            className="input"
            placeholder="Đời"
            inputMode="numeric"
            value={generation}
            onChange={(e) => setGeneration(e.target.value.replace(/\D/g, ''))}
          />
          <select
            className="input"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            aria-label={vi.person.branch}
          >
            <option value="">{vi.person.branch} — tất cả</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Năm sinh"
            inputMode="numeric"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ''))}
          />
          <input
            className="input"
            placeholder="Nơi an táng / ghi chú"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden grid-cols-12 gap-3 border-b border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500 md:grid">
          <div className="col-span-4">{vi.person.fullName}</div>
          <div className="col-span-2">{vi.person.gender}</div>
          <div className="col-span-1">{vi.person.generation}</div>
          <div className="col-span-2">{vi.person.birthDate}</div>
          <div className="col-span-2">{vi.person.branch}</div>
          <div className="col-span-1 text-right" />
        </div>
        <ul className="divide-y divide-stone-100">
          {items.map((p) => (
            <li key={p.id} className="px-4 py-3 transition-colors hover:bg-bark-50/40 md:py-2.5">
              <div className="grid grid-cols-12 items-center gap-3">
                <div className="col-span-12 md:col-span-4">
                  <Link
                    to={`/persons/${p.id}`}
                    className="font-semibold text-bark-700 hover:underline"
                  >
                    {p.fullName}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-500 md:hidden">
                    <span className="chip">{GENDER_LABEL[p.gender]}</span>
                    <span className="chip">Đời {p.generation}</span>
                    {p.birthYear && <span className="chip">{yearLabel(p.birthYear)}</span>}
                    {p.branchId && (
                      <span className="chip">{branchById.get(p.branchId) ?? ''}</span>
                    )}
                  </div>
                </div>
                <div className="hidden md:col-span-2 md:block text-sm text-stone-700">
                  {GENDER_LABEL[p.gender]}
                </div>
                <div className="hidden md:col-span-1 md:block text-sm text-stone-700">
                  {p.generation}
                </div>
                <div className="hidden md:col-span-2 md:block text-sm text-stone-700">
                  {yearLabel(p.birthYear)}
                </div>
                <div className="hidden md:col-span-2 md:block text-sm text-stone-700">
                  {p.branchId ? (branchById.get(p.branchId) ?? '') : '—'}
                </div>
                <div className="col-span-12 mt-1 flex items-center justify-end gap-3 md:col-span-1 md:mt-0">
                  {canEdit && (
                    <Link
                      className="text-sm font-medium text-bark-600 hover:underline"
                      to={`/persons/${p.id}/edit`}
                    >
                      {vi.common.edit}
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
          {!loading && items.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-stone-400">
              {vi.common.empty}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

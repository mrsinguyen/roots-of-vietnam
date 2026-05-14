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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{vi.nav.persons}</h2>
          <p className="text-sm text-stone-500">
            {loading ? vi.common.loading : `${total} nhân vật`}
          </p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => navigate('/persons/new')}>
            + {vi.person.addPerson}
          </button>
        )}
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <input
            className="input md:col-span-2"
            placeholder={vi.common.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <input
            className="input"
            placeholder="Đời"
            inputMode="numeric"
            value={generation}
            onChange={(e) => setGeneration(e.target.value.replace(/\D/g, ''))}
          />
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
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
        </div>
        <div className="mt-3">
          <input
            className="input"
            placeholder="Nơi an táng / ghi chú"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-stone-200">
          <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2">{vi.person.fullName}</th>
              <th className="px-4 py-2">{vi.person.gender}</th>
              <th className="px-4 py-2">{vi.person.generation}</th>
              <th className="px-4 py-2">{vi.person.birthDate}</th>
              <th className="px-4 py-2">{vi.person.branch}</th>
              <th className="px-4 py-2 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 text-sm">
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-bark-50/40">
                <td className="px-4 py-2 font-medium text-bark-700">
                  <Link to={`/persons/${p.id}`} className="hover:underline">
                    {p.fullName}
                  </Link>
                </td>
                <td className="px-4 py-2">{GENDER_LABEL[p.gender]}</td>
                <td className="px-4 py-2">{p.generation}</td>
                <td className="px-4 py-2">{yearLabel(p.birthYear)}</td>
                <td className="px-4 py-2">{p.branchId ? branchById.get(p.branchId) ?? '' : '—'}</td>
                <td className="px-4 py-2 text-right">
                  {canEdit && (
                    <Link className="text-bark-600 hover:underline" to={`/persons/${p.id}/edit`}>
                      {vi.common.edit}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-stone-400">
                  {vi.common.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

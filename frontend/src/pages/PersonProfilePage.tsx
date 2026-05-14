import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Media, PersonWithRelations } from '@roots/shared';
import { GENDER_LABEL } from '@roots/shared';
import { api, ApiError } from '../lib/api';
import { cachePerson, readPerson } from '../lib/offlineCache';
import {
  generationLabel,
  lifespanLabel,
  partialDateLabel,
  yearLabel,
} from '../lib/format';
import { useAuth, hasRole } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useOnline } from '../lib/useOnline';
import { vi } from '../locales/vi';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function PersonProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const online = useOnline();

  const [person, setPerson] = useState<PersonWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lineage, setLineage] = useState<Array<{ id: string; fullName: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const canEdit = hasRole(user, 'admin', 'editor');
  const canDelete = hasRole(user, 'admin');

  async function load(): Promise<void> {
    if (!id) return;
    setLoading(true);
    try {
      const p = await api.getPerson(id);
      setPerson(p);
      await cachePerson(p);
    } catch (err) {
      const cached = await readPerson(id);
      if (cached) {
        setPerson(cached);
      } else {
        toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Lineage breadcrumb: walk fatherId (fallback motherId) up to a root.
  useEffect(() => {
    let cancelled = false;
    async function walk(): Promise<void> {
      if (!person) {
        setLineage([]);
        return;
      }
      const chain: Array<{ id: string; fullName: string }> = [];
      let cursor: PersonWithRelations | null = person;
      const guard = new Set<string>();
      while (cursor && !cancelled && !guard.has(cursor.id)) {
        guard.add(cursor.id);
        const parentId = cursor.fatherId ?? cursor.motherId;
        if (!parentId) break;
        try {
          const parent = await api.getPerson(parentId);
          if (cancelled) return;
          chain.unshift({ id: parent.id, fullName: parent.fullName });
          cursor = parent;
        } catch {
          break;
        }
      }
      if (!cancelled) setLineage(chain);
    }
    void walk();
    return () => {
      cancelled = true;
    };
  }, [person]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      await api.uploadMedia(id, file);
      toast.show(vi.person.saveSuccess, 'success');
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onDeleteMedia(media: Media): Promise<void> {
    if (!confirm(vi.person.deleteConfirm)) return;
    try {
      await api.deleteMedia(media.id);
      toast.show(vi.person.deleteSuccess, 'success');
      await load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error');
    }
  }

  async function onDeletePerson(): Promise<void> {
    if (!id) return;
    if (!confirm(vi.person.deleteConfirm)) return;
    try {
      await api.deletePerson(id);
      toast.show(vi.person.deleteSuccess, 'success');
      navigate('/persons');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error');
    }
  }

  if (loading) {
    return <div className="card p-6 text-stone-500">{vi.common.loading}</div>;
  }
  if (!person) {
    return <div className="card p-6 text-stone-500">{vi.errors.notFound}</div>;
  }

  return (
    <div className="space-y-4">
      <nav className="text-sm text-stone-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link to="/persons" className="hover:underline">
              {vi.nav.persons}
            </Link>
          </li>
          {lineage.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span>›</span>
              <Link to={`/persons/${p.id}`} className="hover:underline">
                {p.fullName}
              </Link>
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span>›</span>
            <span className="text-stone-700">{person.fullName}</span>
          </li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">
            {person.honorific ? `${person.honorific} ` : ''}
            {person.fullName}
          </h2>
          <div className="text-sm text-stone-500">
            {GENDER_LABEL[person.gender]} · {generationLabel(person.generation)}
            {person.branch ? ` · ${person.branch.name}` : ''} · {lifespanLabel(
              { year: person.birthYear, month: person.birthMonth, day: person.birthDay },
              { year: person.deathYear, month: person.deathMonth, day: person.deathDay },
              person.birthDateLunar,
            )}
            {!online && (
              <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                {vi.common.offline}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Link className="btn-secondary" to={`/persons/${person.id}/edit`}>
              {vi.common.edit}
            </Link>
          )}
          {canDelete && (
            <button className="btn-danger" onClick={onDeletePerson}>
              {vi.common.delete}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card space-y-2 p-4 md:col-span-2">
          <DetailRow
            label={vi.person.birthDate}
            value={partialDateLabel({
              year: person.birthYear,
              month: person.birthMonth,
              day: person.birthDay,
            })}
          />
          {person.birthDateLunar && (
            <DetailRow label={vi.person.birthDateLunar} value={person.birthDateLunar} />
          )}
          <DetailRow
            label={vi.person.deathDate}
            value={partialDateLabel({
              year: person.deathYear,
              month: person.deathMonth,
              day: person.deathDay,
            })}
          />
          {person.deathDateLunar && (
            <DetailRow label={vi.person.deathDateLunar} value={person.deathDateLunar} />
          )}
          {person.occupation && (
            <DetailRow label={vi.person.occupation} value={person.occupation} />
          )}
          {person.burialPlace && (
            <DetailRow label={vi.person.burialPlace} value={person.burialPlace} />
          )}
          {person.biography && (
            <DetailRow label={vi.person.biography} value={person.biography} />
          )}
          {person.notes && <DetailRow label={vi.person.notes} value={person.notes} />}
        </div>

        <aside className="card space-y-3 p-4">
          <h3 className="font-semibold">{vi.person.lineage}</h3>
          <RelationList
            label={vi.person.father}
            people={person.father ? [{ id: person.father.id, fullName: person.father.fullName }] : []}
            unknownPlaceholder
          />
          <RelationList
            label={vi.person.mother}
            people={person.mother ? [{ id: person.mother.id, fullName: person.mother.fullName }] : []}
            unknownPlaceholder
          />
          <RelationList
            label={vi.person.spouses}
            people={[
              ...(person.marriagesAsHusband ?? [])
                .map((m) => m.wife)
                .filter((p): p is NonNullable<typeof p> => Boolean(p))
                .map((p) => ({ id: p.id, fullName: p.fullName })),
              ...(person.marriagesAsWife ?? [])
                .map((m) => m.husband)
                .filter((p): p is NonNullable<typeof p> => Boolean(p))
                .map((p) => ({ id: p.id, fullName: p.fullName })),
            ]}
          />
          <RelationList
            label={vi.person.children}
            people={[
              ...(person.childrenAsFather ?? []),
              ...(person.childrenAsMother ?? []),
            ]
              .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
              .map((c) => ({ id: c.id, fullName: `${c.fullName} (${yearLabel(c.birthYear)})` }))}
          />
        </aside>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{vi.person.photos}</h3>
          {canEdit && (
            <label className="btn-secondary cursor-pointer">
              <input
                type="file"
                ref={fileRef}
                className="hidden"
                onChange={onUpload}
                disabled={uploading}
                accept="image/*,application/pdf,audio/*,.doc,.docx,.txt"
              />
              {uploading ? vi.common.loading : vi.person.uploadPhoto}
            </label>
          )}
        </div>
        {person.media && person.media.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {person.media.map((m) => (
              <li key={m.id} className="overflow-hidden rounded-md border border-stone-200 bg-stone-50">
                {m.type === 'image' ? (
                  <a href={`${API_BASE}${m.filePath}`} target="_blank" rel="noreferrer">
                    <img
                      src={`${API_BASE}${m.filePath}`}
                      alt={m.caption ?? ''}
                      className="aspect-square w-full object-cover"
                    />
                  </a>
                ) : (
                  <a
                    href={`${API_BASE}${m.filePath}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex aspect-square items-center justify-center text-xs text-stone-500"
                  >
                    {m.type.toUpperCase()}
                  </a>
                )}
                <div className="flex items-center justify-between gap-1 px-2 py-1 text-xs">
                  <span className="truncate text-stone-600">{m.caption ?? ''}</span>
                  {canEdit && (
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      onClick={() => onDeleteMedia(m)}
                    >
                      {vi.common.delete}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-400">{vi.common.empty}</p>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div className="text-stone-500">{label}</div>
      <div className="col-span-2 whitespace-pre-line text-stone-800">{value}</div>
    </div>
  );
}

function RelationList({
  label,
  people,
  unknownPlaceholder,
}: {
  label: string;
  people: Array<{ id: string; fullName: string }>;
  unknownPlaceholder?: boolean;
}) {
  return (
    <div className="text-sm">
      <div className="text-stone-500">{label}</div>
      {people.length === 0 ? (
        unknownPlaceholder ? (
          <span className="inline-flex items-center rounded border border-dashed border-stone-400 bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
            Chưa rõ
          </span>
        ) : (
          <div className="text-stone-400">—</div>
        )
      ) : (
        <ul>
          {people.map((p) => (
            <li key={p.id}>
              <Link to={`/persons/${p.id}`} className="text-bark-600 hover:underline">
                {p.fullName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

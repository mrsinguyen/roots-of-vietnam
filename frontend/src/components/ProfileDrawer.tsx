import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PersonWithRelations } from '@roots/shared';
import { GENDER_LABEL } from '@roots/shared';
import { api, ApiError } from '../lib/api';
import { generationLabel, lifespanLabel } from '../lib/format';
import { vi } from '../locales/vi';

export default function ProfileDrawer({
  personId,
  onClose,
}: {
  personId: string | null;
  onClose: () => void;
}) {
  const [person, setPerson] = useState<PersonWithRelations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!personId) return;
    setLoading(true);
    setError(null);
    api
      .getPerson(personId)
      .then(setPerson)
      .catch((err) => setError(err instanceof ApiError ? err.message : vi.errors.generic))
      .finally(() => setLoading(false));
  }, [personId]);

  if (!personId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <div
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        aria-label={vi.common.close}
      />
      <aside
        className="relative w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-2xl border border-stone-200 bg-white shadow-lift sm:max-h-none sm:rounded-none sm:rounded-l-2xl sm:border-l"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="hidden h-1 w-10 rounded-full bg-stone-300 sm:inline-block" />
            <h3 className="truncate text-base font-semibold text-stone-900">
              {person?.fullName ?? vi.common.loading}
            </h3>
          </div>
          <button type="button" className="btn-secondary px-2.5 py-1.5 text-xs" onClick={onClose}>
            {vi.common.close}
          </button>
        </div>
        <div className="space-y-3 p-4 text-sm">
          {loading && <p className="text-stone-500">{vi.common.loading}</p>}
          {error && <p className="text-red-600">{error}</p>}
          {person && (
            <>
              <Row label={vi.person.gender} value={GENDER_LABEL[person.gender]} />
              <Row label={vi.person.generation} value={generationLabel(person.generation)} />
              <Row
                label={vi.person.birthDate}
                value={lifespanLabel(
                  { year: person.birthYear, month: person.birthMonth, day: person.birthDay },
                  { year: person.deathYear, month: person.deathMonth, day: person.deathDay },
                  person.birthDateLunar,
                )}
              />
              {person.occupation && <Row label={vi.person.occupation} value={person.occupation} />}
              {person.branch && <Row label={vi.person.branch} value={person.branch.name} />}
              <Row
                label={vi.person.father}
                value={
                  person.father ? (
                    <PersonLink id={person.father.id} name={person.father.fullName} />
                  ) : (
                    <UnknownParent />
                  )
                }
              />
              <Row
                label={vi.person.mother}
                value={
                  person.mother ? (
                    <PersonLink id={person.mother.id} name={person.mother.fullName} />
                  ) : (
                    <UnknownParent />
                  )
                }
              />
              {(person.marriagesAsHusband?.length || person.marriagesAsWife?.length) ? (
                <Row
                  label={vi.person.spouse}
                  value={
                    <ul className="space-y-1">
                      {person.marriagesAsHusband?.map((m) =>
                        m.wife ? (
                          <li key={m.id}>
                            <PersonLink id={m.wife.id} name={m.wife.fullName} />
                          </li>
                        ) : null,
                      )}
                      {person.marriagesAsWife?.map((m) =>
                        m.husband ? (
                          <li key={m.id}>
                            <PersonLink id={m.husband.id} name={m.husband.fullName} />
                          </li>
                        ) : null,
                      )}
                    </ul>
                  }
                />
              ) : null}
              {(person.childrenAsFather?.length || person.childrenAsMother?.length) ? (
                <Row
                  label={vi.person.children}
                  value={
                    <ul className="space-y-1">
                      {[
                        ...(person.childrenAsFather ?? []),
                        ...(person.childrenAsMother ?? []),
                      ]
                        .filter(
                          (c, i, arr) => arr.findIndex((x) => x.id === c.id) === i,
                        )
                        .map((c) => (
                          <li key={c.id}>
                            <PersonLink id={c.id} name={c.fullName} />
                          </li>
                        ))}
                    </ul>
                  }
                />
              ) : null}
              <div className="flex flex-wrap gap-2 pt-3">
                <Link to={`/persons/${person.id}`} className="btn-primary flex-1 justify-center sm:flex-none">
                  {vi.common.open}
                </Link>
                <Link to={`/tree?root=${person.id}`} className="btn-secondary flex-1 justify-center sm:flex-none">
                  Xem từ người này
                </Link>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-stone-100 py-1.5 last:border-b-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="col-span-2 text-stone-800">{value}</div>
    </div>
  );
}

function PersonLink({ id, name }: { id: string; name: string }) {
  return (
    <Link to={`/persons/${id}`} className="text-bark-700 hover:underline">
      {name}
    </Link>
  );
}

function UnknownParent() {
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-stone-400 bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
      Chưa rõ
    </span>
  );
}

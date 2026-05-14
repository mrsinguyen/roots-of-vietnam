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
    <div className="fixed inset-0 z-40 flex">
      <div
        className="flex-1 bg-stone-900/30"
        onClick={onClose}
        role="button"
        aria-label={vi.common.close}
      />
      <aside className="w-full max-w-md overflow-y-auto border-l border-stone-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h3 className="font-semibold">{person?.fullName ?? vi.common.loading}</h3>
          <button className="btn-secondary px-2 py-1" onClick={onClose}>
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
              <div className="flex gap-2 pt-3">
                <Link to={`/persons/${person.id}`} className="btn-primary">
                  {vi.common.open}
                </Link>
                <Link to={`/tree?root=${person.id}`} className="btn-secondary">
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
    <div className="grid grid-cols-3 gap-2">
      <div className="text-stone-500">{label}</div>
      <div className="col-span-2">{value}</div>
    </div>
  );
}

function PersonLink({ id, name }: { id: string; name: string }) {
  return (
    <Link to={`/persons/${id}`} className="text-bark-600 hover:underline">
      {name}
    </Link>
  );
}

function UnknownParent() {
  return (
    <span className="inline-flex items-center rounded border border-dashed border-stone-400 bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
      Chưa rõ
    </span>
  );
}

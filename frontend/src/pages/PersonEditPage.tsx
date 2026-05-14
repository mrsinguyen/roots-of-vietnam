import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Branch, Gender, Person } from '@roots/shared';
import { GENDER_LABEL } from '@roots/shared';
import { api, ApiError } from '../lib/api';
import { intToInput, inputToInt } from '../lib/format';
import { useToast } from '../context/ToastContext';
import { vi } from '../locales/vi';

interface FormState {
  fullName: string;
  honorific: string;
  gender: Gender;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  deathYear: string;
  deathMonth: string;
  deathDay: string;
  birthDateLunar: string;
  deathDateLunar: string;
  biography: string;
  occupation: string;
  burialPlace: string;
  notes: string;
  branchId: string;
  fatherId: string;
  motherId: string;
}

const EMPTY: FormState = {
  fullName: '',
  honorific: '',
  gender: 'Nam',
  birthYear: '',
  birthMonth: '',
  birthDay: '',
  deathYear: '',
  deathMonth: '',
  deathDay: '',
  birthDateLunar: '',
  deathDateLunar: '',
  biography: '',
  occupation: '',
  burialPlace: '',
  notes: '',
  branchId: '',
  fatherId: '',
  motherId: '',
};

function fromPerson(p: Person): FormState {
  return {
    fullName: p.fullName,
    honorific: p.honorific ?? '',
    gender: p.gender,
    birthYear: intToInput(p.birthYear),
    birthMonth: intToInput(p.birthMonth),
    birthDay: intToInput(p.birthDay),
    deathYear: intToInput(p.deathYear),
    deathMonth: intToInput(p.deathMonth),
    deathDay: intToInput(p.deathDay),
    birthDateLunar: p.birthDateLunar ?? '',
    deathDateLunar: p.deathDateLunar ?? '',
    biography: p.biography ?? '',
    occupation: p.occupation ?? '',
    burialPlace: p.burialPlace ?? '',
    notes: p.notes ?? '',
    branchId: p.branchId ?? '',
    fatherId: p.fatherId ?? '',
    motherId: p.motherId ?? '',
  };
}

function toPayload(s: FormState): Partial<Person> {
  return {
    fullName: s.fullName.trim(),
    honorific: s.honorific.trim() || null,
    gender: s.gender,
    birthYear: inputToInt(s.birthYear),
    birthMonth: inputToInt(s.birthMonth),
    birthDay: inputToInt(s.birthDay),
    deathYear: inputToInt(s.deathYear),
    deathMonth: inputToInt(s.deathMonth),
    deathDay: inputToInt(s.deathDay),
    birthDateLunar: s.birthDateLunar.trim() || null,
    deathDateLunar: s.deathDateLunar.trim() || null,
    biography: s.biography.trim() || null,
    occupation: s.occupation.trim() || null,
    burialPlace: s.burialPlace.trim() || null,
    notes: s.notes.trim() || null,
    branchId: s.branchId || null,
    fatherId: s.fatherId || null,
    motherId: s.motherId || null,
  };
}

export default function PersonEditPage() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.listBranches().then((r) => setBranches(r.items));
    void api.listPersons({ limit: 200 }).then((r) => setPersons(r.items));
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getPerson(id)
      .then((p) => setForm(fromPerson(p)))
      .catch((err) =>
        toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error'),
      )
      .finally(() => setLoading(false));
  }, [id, toast]);

  const fathers = useMemo(
    () => persons.filter((p) => p.gender !== 'Nu' && p.id !== id),
    [persons, id],
  );
  const mothers = useMemo(
    () => persons.filter((p) => p.gender !== 'Nam' && p.id !== id),
    [persons, id],
  );

  const expectedGen = useMemo(() => {
    const f = persons.find((p) => p.id === form.fatherId);
    const m = persons.find((p) => p.id === form.motherId);
    const max = Math.max(f?.generation ?? 0, m?.generation ?? 0);
    return max > 0 ? max + 1 : 1;
  }, [persons, form.fatherId, form.motherId]);

  const editedGen = editing ? persons.find((p) => p.id === id)?.generation : undefined;
  const genConflict = editedGen !== undefined && editedGen !== expectedGen;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.fatherId && form.fatherId === id) {
      toast.show(vi.person.parentSamePersonError, 'error');
      return;
    }
    if (form.motherId && form.motherId === id) {
      toast.show(vi.person.parentSamePersonError, 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(form);
      const saved = id
        ? await api.updatePerson(id, payload)
        : await api.createPerson(payload);
      toast.show(vi.person.saveSuccess, 'success');
      navigate(`/persons/${saved.id}`);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : vi.errors.generic, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="card p-6 text-stone-500">{vi.common.loading}</div>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {editing ? vi.person.editPerson : vi.person.addPerson}
        </h2>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            {vi.common.cancel}
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? vi.common.loading : vi.common.save}
          </button>
        </div>
      </div>

      {genConflict && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Đời hiện tại của nhân vật là {editedGen}, nhưng theo cha/mẹ phải là{' '}
          {expectedGen}. Lưu vẫn được nhưng nên kiểm tra lại quan hệ.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={vi.person.fullName}>
          <input
            className="input"
            required
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </Field>
        <Field label={vi.person.honorific}>
          <input
            className="input"
            placeholder="Cụ, Ông, Bà, Cố…"
            value={form.honorific}
            onChange={(e) => setForm({ ...form, honorific: e.target.value })}
          />
        </Field>
        <Field label={vi.person.gender}>
          <select
            className="input"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value as Gender })}
          >
            {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
              <option key={g} value={g}>
                {GENDER_LABEL[g]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={vi.person.occupation}>
          <input
            className="input"
            value={form.occupation}
            onChange={(e) => setForm({ ...form, occupation: e.target.value })}
          />
        </Field>
        <Field label={vi.person.birthDate} full>
          <div className="grid grid-cols-3 gap-2">
            <input
              className="input"
              placeholder="Năm"
              inputMode="numeric"
              value={form.birthYear}
              onChange={(e) => setForm({ ...form, birthYear: e.target.value.replace(/\D/g, '') })}
            />
            <input
              className="input"
              placeholder="Tháng"
              inputMode="numeric"
              value={form.birthMonth}
              onChange={(e) => setForm({ ...form, birthMonth: e.target.value.replace(/\D/g, '') })}
            />
            <input
              className="input"
              placeholder="Ngày"
              inputMode="numeric"
              value={form.birthDay}
              onChange={(e) => setForm({ ...form, birthDay: e.target.value.replace(/\D/g, '') })}
            />
          </div>
        </Field>
        <Field label={vi.person.birthDateLunar}>
          <input
            className="input"
            placeholder="VD: Ất Dậu, mồng 5 tháng 3"
            value={form.birthDateLunar}
            onChange={(e) => setForm({ ...form, birthDateLunar: e.target.value })}
          />
        </Field>
        <Field label={vi.person.deathDate} full>
          <div className="grid grid-cols-3 gap-2">
            <input
              className="input"
              placeholder="Năm"
              inputMode="numeric"
              value={form.deathYear}
              onChange={(e) => setForm({ ...form, deathYear: e.target.value.replace(/\D/g, '') })}
            />
            <input
              className="input"
              placeholder="Tháng"
              inputMode="numeric"
              value={form.deathMonth}
              onChange={(e) => setForm({ ...form, deathMonth: e.target.value.replace(/\D/g, '') })}
            />
            <input
              className="input"
              placeholder="Ngày"
              inputMode="numeric"
              value={form.deathDay}
              onChange={(e) => setForm({ ...form, deathDay: e.target.value.replace(/\D/g, '') })}
            />
          </div>
        </Field>
        <Field label={vi.person.deathDateLunar}>
          <input
            className="input"
            value={form.deathDateLunar}
            onChange={(e) => setForm({ ...form, deathDateLunar: e.target.value })}
          />
        </Field>
        <Field label={vi.person.branch}>
          <select
            className="input"
            value={form.branchId}
            onChange={(e) => setForm({ ...form, branchId: e.target.value })}
          >
            <option value="">{vi.common.selectPlaceholder}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={vi.person.father}>
          <PersonSelect
            value={form.fatherId}
            options={fathers}
            onChange={(v) => setForm({ ...form, fatherId: v })}
          />
        </Field>
        <Field label={vi.person.mother}>
          <PersonSelect
            value={form.motherId}
            options={mothers}
            onChange={(v) => setForm({ ...form, motherId: v })}
          />
        </Field>
        <Field label={vi.person.burialPlace} full>
          <input
            className="input"
            value={form.burialPlace}
            onChange={(e) => setForm({ ...form, burialPlace: e.target.value })}
          />
        </Field>
        <Field label={vi.person.biography} full>
          <textarea
            className="input min-h-24"
            value={form.biography}
            onChange={(e) => setForm({ ...form, biography: e.target.value })}
          />
        </Field>
        <Field label={vi.person.notes} full>
          <textarea
            className="input min-h-16"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

function PersonSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Person[];
  onChange: (v: string) => void;
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{vi.person.none}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.fullName} · Đời {p.generation}
        </option>
      ))}
    </select>
  );
}

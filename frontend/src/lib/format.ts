// Display helpers for partial Vietnamese dates and generation ordinals.

const NONE = '—';

interface PartialDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export function partialDateLabel(d: PartialDate): string {
  if (d.year == null) return NONE;
  if (d.month == null) return String(d.year);
  if (d.day == null) return `${d.month}/${d.year}`;
  return `${d.day}/${d.month}/${d.year}`;
}

export function yearLabel(year: number | null): string {
  return year == null ? NONE : String(year);
}

export function lifespanLabel(birth: PartialDate, death: PartialDate, lunarBirth?: string | null): string {
  const b = partialDateLabel(birth);
  const lunar = lunarBirth ? ` (${lunarBirth})` : '';
  if (death.year == null) return b === NONE ? NONE : `${b}${lunar}`;
  const d = partialDateLabel(death);
  return `${b}${lunar} – ${d}`;
}

// Vietnamese ordinal for generation. "Đời thứ N" — N stays Arabic numeral as is
// customary in modern Vietnamese genealogy publications.
export function generationLabel(generation: number): string {
  return `Đời thứ ${generation}`;
}

// Trim a value for use as an HTML <input type="number"> string.
export function intToInput(value: number | null | undefined): string {
  return value == null ? '' : String(value);
}

export function inputToInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

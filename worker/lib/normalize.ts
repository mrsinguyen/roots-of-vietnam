// Strip Vietnamese (and general) diacritics, fold to lowercase, collapse
// whitespace. Builds the indexed `Person.nameNormalized` column so search is
// diacritic-insensitive. Application-maintained: call this on every write.
const VN_MAP: Record<string, string> = {
  đ: 'd',
  Đ: 'D',
};

export function normalizeName(input: string): string {
  if (!input) return '';
  const swapped = input.replace(/[đĐ]/g, (c) => VN_MAP[c] ?? c);
  return swapped
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

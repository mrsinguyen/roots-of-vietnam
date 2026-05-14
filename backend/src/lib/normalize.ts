// Strip Vietnamese (and general) diacritics, fold to lowercase, collapse whitespace.
// Used to build the indexed `nameNormalized` column so search is diacritic-insensitive.
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

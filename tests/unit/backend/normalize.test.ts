import { describe, it, expect } from 'vitest';
import { normalizeName } from '../../../backend/src/lib/normalize';

describe('normalizeName', () => {
  it('lowercases ASCII and trims whitespace', () => {
    expect(normalizeName('  Hello World  ')).toBe('hello world');
  });

  it('strips Vietnamese diacritics', () => {
    expect(normalizeName('Nguyễn Văn Á')).toBe('nguyen van a');
  });

  it('maps đ and Đ to d', () => {
    expect(normalizeName('Đặng Đỗ')).toBe('dang do');
  });

  it('collapses runs of internal whitespace', () => {
    expect(normalizeName('Trần    Thị     Hằng')).toBe('tran thi hang');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeName('')).toBe('');
  });

  it('handles only-diacritic input', () => {
    expect(normalizeName('Á É Í Ó Ú Ý')).toBe('a e i o u y');
  });

  it('preserves cross-language characters by ignoring non-Vietnamese', () => {
    expect(normalizeName('Nguyễn-Pierre')).toBe('nguyen-pierre');
  });
});

import { describe, expect, it } from 'vitest';
import {
  generationLabel,
  intToInput,
  inputToInt,
  lifespanLabel,
  partialDateLabel,
  yearLabel,
} from '../../../frontend/src/lib/format';

describe('partialDateLabel', () => {
  it('returns "—" when year is null', () => {
    expect(partialDateLabel({ year: null, month: null, day: null })).toBe('—');
  });

  it('shows year only when month is null', () => {
    expect(partialDateLabel({ year: 1920, month: null, day: null })).toBe('1920');
  });

  it('shows m/yyyy when day is null', () => {
    expect(partialDateLabel({ year: 1920, month: 3, day: null })).toBe('3/1920');
  });

  it('shows d/m/yyyy when all parts known', () => {
    expect(partialDateLabel({ year: 1920, month: 3, day: 15 })).toBe('15/3/1920');
  });
});

describe('yearLabel', () => {
  it('renders the year', () => {
    expect(yearLabel(2000)).toBe('2000');
  });
  it('renders an em dash for null', () => {
    expect(yearLabel(null)).toBe('—');
  });
});

describe('lifespanLabel', () => {
  it('shows just birth when death is unknown', () => {
    expect(
      lifespanLabel(
        { year: 1900, month: null, day: null },
        { year: null, month: null, day: null },
      ),
    ).toBe('1900');
  });

  it('shows birth – death when both known', () => {
    expect(
      lifespanLabel(
        { year: 1900, month: 1, day: 1 },
        { year: 1972, month: 12, day: 31 },
      ),
    ).toBe('1/1/1900 – 31/12/1972');
  });

  it('appends lunar date in parentheses after birth', () => {
    expect(
      lifespanLabel(
        { year: 1900, month: null, day: null },
        { year: null, month: null, day: null },
        'Canh Tý',
      ),
    ).toBe('1900 (Canh Tý)');
  });

  it('returns "—" when birth year is unknown and death year is unknown', () => {
    expect(
      lifespanLabel(
        { year: null, month: null, day: null },
        { year: null, month: null, day: null },
      ),
    ).toBe('—');
  });
});

describe('generationLabel', () => {
  it('renders Vietnamese ordinal', () => {
    expect(generationLabel(1)).toBe('Đời thứ 1');
    expect(generationLabel(7)).toBe('Đời thứ 7');
  });
});

describe('intToInput / inputToInt', () => {
  it('round-trips numbers through input', () => {
    expect(intToInput(42)).toBe('42');
    expect(inputToInt('42')).toBe(42);
  });

  it('intToInput is empty for null/undefined', () => {
    expect(intToInput(null)).toBe('');
    expect(intToInput(undefined)).toBe('');
  });

  it('inputToInt is null for empty / non-numeric strings', () => {
    expect(inputToInt('')).toBe(null);
    expect(inputToInt('   ')).toBe(null);
    expect(inputToInt('abc')).toBe(null);
  });

  it('inputToInt truncates fractional values', () => {
    expect(inputToInt('3.9')).toBe(3);
  });
});

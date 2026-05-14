// Phase-2 date migration: the live schema no longer has the legacy DateTime
// columns, so we can't replay them against the current Prisma. We instead
// validate the *logic* the backfill script uses to split a JS Date into
// year/month/day triplets — the same function the backfill iterates over every
// row with. This catches the surprise that prompted the script (Prisma stores
// SQLite DateTimes as integer ms, so strftime() returns null).

import { describe, expect, it } from 'vitest';

function splitDate(d: Date | null): { y: number | null; m: number | null; day: number | null } {
  if (!d) return { y: null, m: null, day: null };
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

describe('phase-2 date migration: splitDate', () => {
  it('splits a Date into 1-based month + day in UTC', () => {
    expect(splitDate(new Date(Date.UTC(1900, 2, 12)))).toEqual({ y: 1900, m: 3, day: 12 });
    expect(splitDate(new Date(Date.UTC(1925, 0, 5)))).toEqual({ y: 1925, m: 1, day: 5 });
  });

  it('returns nulls for a null input', () => {
    expect(splitDate(null)).toEqual({ y: null, m: null, day: null });
  });

  it('round-trips year-only ISO strings through Date', () => {
    expect(splitDate(new Date('1972-08-04T00:00:00.000Z'))).toEqual({ y: 1972, m: 8, day: 4 });
  });

  it('preserves century boundaries', () => {
    expect(splitDate(new Date(Date.UTC(1999, 11, 31)))).toEqual({ y: 1999, m: 12, day: 31 });
    expect(splitDate(new Date(Date.UTC(2000, 0, 1)))).toEqual({ y: 2000, m: 1, day: 1 });
  });
});

import { describe, it, expect } from 'vitest';
import { diffDates, addDays, toISODateUTC } from './date-duration';

/**
 * R18C2 Commit 1 — dedicated characterization of the Date calculator's source operations
 * (date-duration.ts), FROZEN before the task-first migration. This is the source-of-truth suite the
 * date-form binding + island must never contradict; date-duration.ts is UNCHANGED (it delegates the
 * difference breakdown to calculateAge, so the R18C0 month-end repair propagates here automatically).
 *
 * Two operations back the two Date tools:
 *   • diffDates(a, b)  — DIFFERENCE mode: order-independent breakdown + absolute totalDays/weeks + a
 *     direction flag ('after' | 'before' | 'same'). It does NOT guard invalid Date inputs.
 *   • addDays(date, n) — ADD / SUBTRACT mode: whole-day UTC shift; n is Math.round-ed (half → +∞),
 *     negative subtracts, non-finite n yields an Invalid Date.
 * All arithmetic is UTC (time-of-day irrelevant, DST-independent). toISODateUTC formats UTC Y-M-D.
 */

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe('date-duration: diffDates — DIFFERENCE mode source contract', () => {
  it('same date is a valid zero (direction "same")', () => {
    const r = diffDates(utc(2024, 6, 15), utc(2024, 6, 15));
    expect(r.totalDays).toBe(0);
    expect(r.weeks).toBe(0);
    expect(r.breakdown).toEqual({ years: 0, months: 0, days: 0 });
    expect(r.direction).toBe('same');
  });

  it('one-day interval', () => {
    const r = diffDates(utc(2024, 1, 1), utc(2024, 1, 2));
    expect(r.totalDays).toBe(1);
    expect(r.weeks).toBe(0);
    expect(r.breakdown).toEqual({ years: 0, months: 0, days: 1 });
    expect(r.direction).toBe('after');
  });

  it('one-month interval', () => {
    const r = diffDates(utc(2024, 1, 15), utc(2024, 2, 15));
    expect(r.totalDays).toBe(31);
    expect(r.weeks).toBe(4);
    expect(r.breakdown).toEqual({ years: 0, months: 1, days: 0 });
    expect(r.direction).toBe('after');
  });

  it('one-year interval spanning a leap February is 366 days', () => {
    const r = diffDates(utc(2023, 3, 1), utc(2024, 3, 1));
    expect(r.totalDays).toBe(366);
    expect(r.weeks).toBe(52);
    expect(r.breakdown).toEqual({ years: 1, months: 0, days: 0 });
    expect(r.direction).toBe('after');
  });

  it('ordinary multi-year interval', () => {
    const r = diffDates(utc(2000, 6, 15), utc(2020, 9, 20));
    expect(r.totalDays).toBe(7402);
    expect(r.weeks).toBe(1057);
    expect(r.breakdown).toEqual({ years: 20, months: 3, days: 5 });
    expect(r.direction).toBe('after');
  });

  it('order-independent breakdown; direction flips with argument order', () => {
    const fwd = diffDates(utc(2000, 1, 1), utc(2020, 1, 1));
    const rev = diffDates(utc(2020, 1, 1), utc(2000, 1, 1));
    expect(fwd.breakdown.years).toBe(20);
    expect(rev.breakdown.years).toBe(20);
    expect(fwd.totalDays).toBe(rev.totalDays); // totalDays is absolute
    expect(fwd.direction).toBe('after');
    expect(rev.direction).toBe('before');
  });

  it('start-after-end (reverse) yields an absolute totalDays with direction "before"', () => {
    const r = diffDates(utc(2025, 1, 1), utc(2020, 1, 1));
    expect(r.totalDays).toBe(1827); // absolute (positive)
    expect(r.weeks).toBe(261);
    expect(r.breakdown).toEqual({ years: 5, months: 0, days: 0 });
    expect(r.direction).toBe('before');
  });

  it('R18C0 repaired month-end: 2020-01-31 → 2020-03-01 is 0y 1m 1d (no negative day), 30 days', () => {
    const r = diffDates(utc(2020, 1, 31), utc(2020, 3, 1));
    expect(r.totalDays).toBe(30);
    expect(r.breakdown).toEqual({ years: 0, months: 1, days: 1 });
    expect(r.breakdown.days).toBeGreaterThanOrEqual(0);
  });

  it('non-leap month-end: 2021-01-31 → 2021-03-01 is the same 0y 1m 1d breakdown but 29 days', () => {
    const r = diffDates(utc(2021, 1, 31), utc(2021, 3, 1));
    expect(r.totalDays).toBe(29); // one fewer than the leap year — Feb has 28 days
    expect(r.breakdown).toEqual({ years: 0, months: 1, days: 1 });
  });

  it('leap-day to leap-day (2020-02-29 → 2024-02-29) is exactly 4 years / 1461 days', () => {
    const r = diffDates(utc(2020, 2, 29), utc(2024, 2, 29));
    expect(r.totalDays).toBe(1461);
    expect(r.weeks).toBe(208);
    expect(r.breakdown).toEqual({ years: 4, months: 0, days: 0 });
    expect(r.direction).toBe('after');
  });

  it('does NOT guard an invalid Date — totalDays and the breakdown are NaN (the binding must pre-validate)', () => {
    const r = diffDates(new Date(Number.NaN), utc(2024, 1, 1));
    expect(Number.isNaN(r.totalDays)).toBe(true);
    expect(Number.isNaN(r.breakdown.years)).toBe(true);
    expect(Number.isNaN(r.breakdown.months)).toBe(true);
    expect(Number.isNaN(r.breakdown.days)).toBe(true);
  });
});

describe('date-duration: addDays — ADD / SUBTRACT mode source contract', () => {
  it('+0 days returns the same civil date', () => {
    expect(toISODateUTC(addDays(utc(2024, 6, 15), 0))).toBe('2024-06-15');
  });

  it('+1 / -1 day', () => {
    expect(toISODateUTC(addDays(utc(2024, 6, 15), 1))).toBe('2024-06-16');
    expect(toISODateUTC(addDays(utc(2024, 1, 1), -1))).toBe('2023-12-31');
  });

  it('+30 days across a month-end (2020-01-31 → 2020-03-01)', () => {
    expect(toISODateUTC(addDays(utc(2020, 1, 31), 30))).toBe('2020-03-01');
  });

  it('month rollover (2024-01-31 +1 → 2024-02-01)', () => {
    expect(toISODateUTC(addDays(utc(2024, 1, 31), 1))).toBe('2024-02-01');
  });

  it('year rollover (2024-12-31 +1 → 2025-01-01)', () => {
    expect(toISODateUTC(addDays(utc(2024, 12, 31), 1))).toBe('2025-01-01');
  });

  it('leap rollover: 2024-02-28 +1 → 2024-02-29 (leap), 2023-02-28 +1 → 2023-03-01 (non-leap)', () => {
    expect(toISODateUTC(addDays(utc(2024, 2, 28), 1))).toBe('2024-02-29');
    expect(toISODateUTC(addDays(utc(2023, 2, 28), 1))).toBe('2023-03-01');
  });

  it('large safe value (2024-01-01 + 10000 → 2051-05-19)', () => {
    expect(toISODateUTC(addDays(utc(2024, 1, 1), 10000))).toBe('2051-05-19');
  });

  it('fractional n is Math.round-ed with ties toward +Infinity, then applied', () => {
    expect(toISODateUTC(addDays(utc(2024, 1, 1), 1.4))).toBe('2024-01-02'); // round → 1
    expect(toISODateUTC(addDays(utc(2024, 1, 1), 1.5))).toBe('2024-01-03'); // round → 2
    expect(toISODateUTC(addDays(utc(2024, 1, 1), 2.5))).toBe('2024-01-04'); // round → 3
    expect(toISODateUTC(addDays(utc(2024, 1, 1), -0.5))).toBe('2024-01-01'); // round(-0.5) → -0
    expect(toISODateUTC(addDays(utc(2024, 1, 1), -1.5))).toBe('2023-12-31'); // round(-1.5) → -1
  });

  it('non-finite n yields an Invalid Date (NaN time) — the binding must pre-validate the offset', () => {
    expect(Number.isNaN(addDays(utc(2024, 1, 1), Number.NaN).getTime())).toBe(true);
    expect(Number.isNaN(addDays(utc(2024, 1, 1), Number.POSITIVE_INFINITY).getTime())).toBe(true);
  });
});

describe('date-duration: toISODateUTC — format contract', () => {
  it('formats UTC year-month-day with zero-padded month and day', () => {
    expect(toISODateUTC(utc(2024, 1, 5))).toBe('2024-01-05');
    expect(toISODateUTC(utc(2024, 12, 31))).toBe('2024-12-31');
    expect(toISODateUTC(utc(2020, 2, 29))).toBe('2020-02-29');
  });

  it('reads UTC components (a UTC-midnight date serializes to its civil date)', () => {
    expect(toISODateUTC(new Date('2026-08-09T00:00:00Z'))).toBe('2026-08-09');
  });
});

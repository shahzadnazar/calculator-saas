import { describe, it, expect } from 'vitest';
import { calculateAge, parseISODateUTC } from './age';

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe('age calculator', () => {
  it('computes whole years', () => {
    const r = calculateAge(utc(2000, 1, 1), utc(2020, 1, 1));
    expect(r.valid).toBe(true);
    expect(r.years).toBe(20);
    expect(r.months).toBe(0);
    expect(r.days).toBe(0);
    expect(r.totalDays).toBe(7305); // includes 5 leap days
  });

  it('handles day/month borrowing', () => {
    const r = calculateAge(utc(2000, 3, 15), utc(2001, 3, 14));
    expect(r.years).toBe(0);
    expect(r.months).toBe(11);
    expect(r.days).toBe(27);
  });

  it('counts days to the next birthday', () => {
    const r = calculateAge(utc(2000, 6, 1), utc(2020, 5, 30));
    expect(r.nextBirthdayInDays).toBe(2);
  });

  it('rejects a future birth date', () => {
    const r = calculateAge(utc(2030, 1, 1), utc(2020, 1, 1));
    expect(r.valid).toBe(false);
  });

  it('parses ISO dates without timezone drift', () => {
    const d = parseISODateUTC('1995-07-04');
    expect(d?.getUTCFullYear()).toBe(1995);
    expect(d?.getUTCMonth()).toBe(6);
    expect(d?.getUTCDate()).toBe(4);
    expect(parseISODateUTC('not-a-date')).toBeNull();
  });
});

/**
 * R18C0 — month-end decomposition (Commit 2, repaired). The month-end borrow defect (a birth
 * day-of-month exceeding the length of the month `at` borrowed from — e.g. a 31st borrowing from a
 * 28/29-day February — left the day component NEGATIVE) is fixed by the relativedelta anchor
 * method: take the whole-month gap, advance `birth` by that many months with the birth day CLAMPED
 * into the anchor month, back off one month if the anchor overshoots `at`, then count the remaining
 * civil days. Reaching the clamped month-end anniversary now correctly credits a full month/year.
 * Every case is proven by the reconstruction invariant birth + years + months (clamped) + days === at.
 */
type YMD = readonly [number, number, number];
const ymd = (b: YMD, a: YMD) => {
  const r = calculateAge(utc(b[0], b[1], b[2]), utc(a[0], a[1], a[2]));
  return { y: r.years, m: r.months, d: r.days };
};

// Independent reconstruction oracle (does NOT use age.ts internals): birth + years + months with
// the birth day clamped into the anchor month, then + days, using the same civil-date semantics.
const DAY = 86_400_000;
const dimT = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
const reconstruct = (birth: Date, y: number, m: number, days: number): Date => {
  const total = birth.getUTCMonth() + y * 12 + m;
  const ay = birth.getUTCFullYear() + Math.floor(total / 12);
  const am = ((total % 12) + 12) % 12;
  const anchor = Date.UTC(ay, am, Math.min(birth.getUTCDate(), dimT(ay, am)));
  return new Date(anchor + days * DAY);
};

describe('age month-end — the reported defect is fixed (R18C0)', () => {
  it('2020-01-31 → 2020-03-01 is now 0y 1m 1d (was an impossible 0y 1m −1d)', () => {
    const birth = utc(2020, 1, 31), at = utc(2020, 3, 1);
    const r = calculateAge(birth, at);
    expect({ y: r.years, m: r.months, d: r.days }).toEqual({ y: 0, m: 1, d: 1 });
    expect(r.days).toBeGreaterThanOrEqual(0);
    // Reconstruction: Jan-31 + 1 month → Feb-29 (clamped), + 1 day → Mar-01.
    expect(reconstruct(birth, r.years, r.months, r.days).getTime()).toBe(at.getTime());
  });

  it('2021-01-31 → 2021-03-01 (non-leap) is now 0y 1m 1d (was −2d) — same root cause', () => {
    const birth = utc(2021, 1, 31), at = utc(2021, 3, 1);
    const r = calculateAge(birth, at);
    expect({ y: r.years, m: r.months, d: r.days }).toEqual({ y: 0, m: 1, d: 1 });
    // Jan-31 + 1 month → Feb-28 (clamped), + 1 day → Mar-01.
    expect(reconstruct(birth, r.years, r.months, r.days).getTime()).toBe(at.getTime());
  });
});

describe('age month-end matrix — repaired (R18C0)', () => {
  it('31st-of-month into a shorter month credits the clamped month; the remainder counts civil days', () => {
    expect(ymd([2020, 1, 31], [2020, 2, 28])).toEqual({ y: 0, m: 0, d: 28 }); // < 1 clamped month (Feb-29)
    expect(ymd([2020, 1, 31], [2020, 2, 29])).toEqual({ y: 0, m: 1, d: 0 }); // exactly the clamped anniversary → 1 month
    expect(ymd([2020, 1, 30], [2020, 3, 1])).toEqual({ y: 0, m: 1, d: 1 });
    expect(ymd([2020, 1, 29], [2020, 3, 1])).toEqual({ y: 0, m: 1, d: 1 });
    expect(ymd([2021, 1, 31], [2021, 2, 28])).toEqual({ y: 0, m: 1, d: 0 }); // non-leap clamped anniversary
    expect(ymd([2021, 1, 31], [2021, 3, 1])).toEqual({ y: 0, m: 1, d: 1 });
    expect(ymd([2020, 3, 31], [2020, 4, 30])).toEqual({ y: 0, m: 1, d: 0 }); // Apr-30 = clamped anniversary
    expect(ymd([2020, 3, 31], [2020, 5, 1])).toEqual({ y: 0, m: 1, d: 1 });
    expect(ymd([2020, 5, 31], [2020, 6, 30])).toEqual({ y: 0, m: 1, d: 0 });
    expect(ymd([2020, 5, 31], [2020, 7, 1])).toEqual({ y: 0, m: 1, d: 1 });
    expect(ymd([2020, 8, 31], [2020, 9, 30])).toEqual({ y: 0, m: 1, d: 0 });
    expect(ymd([2020, 8, 31], [2020, 10, 1])).toEqual({ y: 0, m: 1, d: 1 });
    expect(ymd([2019, 12, 31], [2020, 1, 31])).toEqual({ y: 0, m: 1, d: 0 });
    expect(ymd([2019, 12, 31], [2020, 2, 1])).toEqual({ y: 0, m: 1, d: 1 });
  });
});

describe('age leap-day — repaired (R18C0)', () => {
  it('a Feb-29 birth reaches its clamped Feb-28 anniversary in common years as a full year', () => {
    expect(ymd([2020, 2, 29], [2021, 2, 28])).toEqual({ y: 1, m: 0, d: 0 }); // Feb-29 → Feb-28 (clamped) = 1 year
    expect(ymd([2020, 2, 29], [2024, 2, 29])).toEqual({ y: 4, m: 0, d: 0 }); // true leap anniversary
    expect(ymd([2020, 2, 29], [2020, 3, 1])).toEqual({ y: 0, m: 0, d: 1 });
    expect(ymd([2019, 2, 28], [2020, 2, 29])).toEqual({ y: 1, m: 0, d: 1 });
    expect(ymd([2016, 2, 29], [2017, 3, 1])).toEqual({ y: 1, m: 0, d: 1 }); // Feb-29 +1y → Feb-28, +1 day → Mar-01
  });
});

describe('age ordinary borrow + base cases — unchanged by the repair', () => {
  it('ordinary borrowing (birth day fits the previous month) is identical to before', () => {
    expect(ymd([2000, 3, 15], [2001, 3, 14])).toEqual({ y: 0, m: 11, d: 27 });
    expect(ymd([1990, 1, 20], [2020, 3, 10])).toEqual({ y: 30, m: 1, d: 19 });
  });

  it('base cases', () => {
    expect(ymd([2020, 6, 15], [2020, 6, 15])).toEqual({ y: 0, m: 0, d: 0 }); // same date
    expect(ymd([2020, 6, 15], [2020, 6, 16])).toEqual({ y: 0, m: 0, d: 1 }); // one day
    expect(ymd([2020, 6, 15], [2020, 7, 15])).toEqual({ y: 0, m: 1, d: 0 }); // one month
    expect(ymd([2020, 6, 15], [2021, 6, 15])).toEqual({ y: 1, m: 0, d: 0 }); // one year
    expect(ymd([2000, 1, 1], [2020, 1, 1])).toEqual({ y: 20, m: 0, d: 0 }); // ordinary multi-year
  });
});

describe('age decomposition invariants — no impossible components, exact reconstruction (R18C0)', () => {
  const PAIRS: ReadonlyArray<readonly [YMD, YMD]> = [
    [[2020, 1, 31], [2020, 2, 28]], [[2020, 1, 31], [2020, 2, 29]], [[2020, 1, 31], [2020, 3, 1]],
    [[2020, 1, 30], [2020, 3, 1]], [[2020, 1, 29], [2020, 3, 1]], [[2021, 1, 31], [2021, 2, 28]],
    [[2021, 1, 31], [2021, 3, 1]], [[2020, 3, 31], [2020, 4, 30]], [[2020, 3, 31], [2020, 5, 1]],
    [[2020, 5, 31], [2020, 6, 30]], [[2020, 5, 31], [2020, 7, 1]], [[2020, 8, 31], [2020, 9, 30]],
    [[2020, 8, 31], [2020, 10, 1]], [[2019, 12, 31], [2020, 1, 31]], [[2019, 12, 31], [2020, 2, 1]],
    [[2020, 2, 29], [2021, 2, 28]], [[2020, 2, 29], [2024, 2, 29]], [[2020, 2, 29], [2020, 3, 1]],
    [[2019, 2, 28], [2020, 2, 29]], [[2016, 2, 29], [2017, 3, 1]], [[2000, 3, 15], [2001, 3, 14]],
    [[1990, 1, 20], [2020, 3, 10]], [[2020, 6, 15], [2020, 6, 15]], [[2000, 1, 1], [2020, 1, 1]],
  ];

  it('every ordered pair yields non-negative years/months/days, months < 12, and reconstructs to `at`', () => {
    for (const [b, a] of PAIRS) {
      const birth = utc(b[0], b[1], b[2]);
      const at = utc(a[0], a[1], a[2]);
      const r = calculateAge(birth, at);
      expect(r.valid).toBe(true);
      expect(r.years).toBeGreaterThanOrEqual(0);
      expect(r.months).toBeGreaterThanOrEqual(0);
      expect(r.months).toBeLessThan(12);
      expect(r.days).toBeGreaterThanOrEqual(0);
      expect(r.totalMonths).toBe(r.years * 12 + r.months);
      // The decomposition reconstructs exactly to the destination date (independent oracle).
      expect(reconstruct(birth, r.years, r.months, r.days).getTime()).toBe(at.getTime());
    }
  });

  it('same date is 0y 0m 0d', () => {
    const r = calculateAge(utc(2020, 2, 29), utc(2020, 2, 29));
    expect({ y: r.years, m: r.months, d: r.days }).toEqual({ y: 0, m: 0, d: 0 });
  });
});

/* ------------------------------------------------------------------ */
/* Smaller units + the week remainder (derived, never re-derived maths) */
/* ------------------------------------------------------------------ */

describe('calculateAge — hours, minutes and seconds', () => {
  const at = (iso: string) => parseISODateUTC(iso)!;

  it('derives them as exact multiples of the day count', () => {
    const r = calculateAge(at('1991-06-15'), at('2026-08-26'));
    expect(r.totalHours).toBe(r.totalDays * 24);
    expect(r.totalMinutes).toBe(r.totalDays * 24 * 60);
    expect(r.totalSeconds).toBe(r.totalDays * 24 * 60 * 60);
  });

  it('pins a known span end to end', () => {
    // 2006-02-03 → 2026-08-26 is the reference span: 7,509 days.
    const r = calculateAge(at('2006-02-03'), at('2026-08-26'));
    expect(r.totalDays).toBe(7_509);
    expect(r.totalHours).toBe(180_216);
    expect(r.totalMinutes).toBe(10_812_960);
    expect(r.totalSeconds).toBe(648_777_600);
  });

  it('splits the week total into whole weeks plus leftover days', () => {
    const r = calculateAge(at('2006-02-03'), at('2026-08-26'));
    expect(r.totalWeeks).toBe(1_072);
    expect(r.totalWeeksRemainderDays).toBe(5);
    expect(r.totalWeeks * 7 + r.totalWeeksRemainderDays).toBe(r.totalDays);
  });

  it('keeps the remainder inside 0–6 and reconciles for many spans', () => {
    for (let d = 0; d < 400; d++) {
      const end = new Date(Date.UTC(2020, 0, 1 + d));
      const r = calculateAge(at('2020-01-01'), end);
      expect(r.totalWeeksRemainderDays).toBeGreaterThanOrEqual(0);
      expect(r.totalWeeksRemainderDays).toBeLessThanOrEqual(6);
      expect(r.totalWeeks * 7 + r.totalWeeksRemainderDays).toBe(r.totalDays);
      expect(r.totalSeconds).toBe(r.totalDays * 86_400);
    }
  });

  it('is all zero for a same-date age, never NaN', () => {
    const r = calculateAge(at('2026-08-26'), at('2026-08-26'));
    expect(r.totalDays).toBe(0);
    expect(r.totalHours).toBe(0);
    expect(r.totalMinutes).toBe(0);
    expect(r.totalSeconds).toBe(0);
    expect(r.totalWeeksRemainderDays).toBe(0);
  });

  it('leaves the existing years/months/days figures untouched', () => {
    const r = calculateAge(at('1991-06-15'), at('2026-08-26'));
    expect([r.years, r.months, r.days]).toEqual([35, 2, 11]);
  });
});

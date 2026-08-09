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
 * R18C0 — month-end decomposition characterization (Commit 1, TEST-ONLY; no age.ts change).
 *
 * Pins the CURRENT `calculateAge` contract around a month-end borrow defect: when the birth
 * day-of-month exceeds the length of the month `at` borrows from (e.g. a 31st borrowing from a
 * 28/29-day February), the single borrow leaves the day component NEGATIVE — an impossible
 * decomposition. These `DEFECT (pre-fix)` assertions record that broken output as the pre-repair
 * baseline; they are NOT desired behavior and are corrected in Commit 2. The surrounding
 * month-end / leap matrix pins the rest of the current contract so every Commit-2 change is
 * explicit and attributable.
 */
type YMD = readonly [number, number, number];
const ymd = (b: YMD, a: YMD) => {
  const r = calculateAge(utc(b[0], b[1], b[2]), utc(a[0], a[1], a[2]));
  return { y: r.years, m: r.months, d: r.days };
};

describe('age month-end — KNOWN DEFECT (pre-fix baseline, R18C0)', () => {
  it('DEFECT: 2020-01-31 → 2020-03-01 yields an IMPOSSIBLE negative day component', () => {
    const r = calculateAge(utc(2020, 1, 31), utc(2020, 3, 1));
    expect(r.valid).toBe(true);
    expect({ y: r.years, m: r.months, d: r.days }).toEqual({ y: 0, m: 1, d: -1 }); // −1 day: impossible (pre-fix)
    expect(r.totalDays).toBe(30); // the true interval is 30 days
    expect(r.totalMonths).toBe(1);
  });

  it('DEFECT: 2021-01-31 → 2021-03-01 (non-leap) yields −2 days — same root cause', () => {
    const r = calculateAge(utc(2021, 1, 31), utc(2021, 3, 1));
    expect({ y: r.years, m: r.months, d: r.days }).toEqual({ y: 0, m: 1, d: -2 }); // −2 days: impossible (pre-fix)
    expect(r.totalDays).toBe(29);
  });
});

describe('age month-end matrix — pre-fix baseline (R18C0)', () => {
  it('pins the current 31st-of-month decompositions (leap Feb)', () => {
    expect(ymd([2020, 1, 31], [2020, 2, 28])).toEqual({ y: 0, m: 0, d: 28 });
    expect(ymd([2020, 1, 31], [2020, 2, 29])).toEqual({ y: 0, m: 0, d: 29 }); // pre-fix: month not credited
    expect(ymd([2020, 1, 30], [2020, 3, 1])).toEqual({ y: 0, m: 1, d: 0 }); // pre-fix: reconstructs to Feb-29, not Mar-01
    expect(ymd([2020, 1, 29], [2020, 3, 1])).toEqual({ y: 0, m: 1, d: 1 });
  });

  it('pins the current 31st-of-month decompositions (non-leap Feb + other short months)', () => {
    expect(ymd([2021, 1, 31], [2021, 2, 28])).toEqual({ y: 0, m: 0, d: 28 }); // pre-fix: month not credited
    expect(ymd([2020, 3, 31], [2020, 4, 30])).toEqual({ y: 0, m: 0, d: 30 }); // pre-fix: month not credited
    expect(ymd([2020, 3, 31], [2020, 5, 1])).toEqual({ y: 0, m: 1, d: 0 }); // pre-fix: reconstructs to Apr-30, not May-01
    expect(ymd([2020, 5, 31], [2020, 6, 30])).toEqual({ y: 0, m: 0, d: 30 });
    expect(ymd([2020, 5, 31], [2020, 7, 1])).toEqual({ y: 0, m: 1, d: 0 });
    expect(ymd([2020, 8, 31], [2020, 9, 30])).toEqual({ y: 0, m: 0, d: 30 });
    expect(ymd([2020, 8, 31], [2020, 10, 1])).toEqual({ y: 0, m: 1, d: 0 });
  });

  it('pins the current December year-boundary decompositions (already correct)', () => {
    expect(ymd([2019, 12, 31], [2020, 1, 31])).toEqual({ y: 0, m: 1, d: 0 });
    expect(ymd([2019, 12, 31], [2020, 2, 1])).toEqual({ y: 0, m: 1, d: 1 });
  });
});

describe('age leap-day — pre-fix baseline (R18C0)', () => {
  it('pins the current leap-day decompositions', () => {
    expect(ymd([2020, 2, 29], [2021, 2, 28])).toEqual({ y: 0, m: 11, d: 30 }); // pre-fix: anniversary not credited as 1y
    expect(ymd([2020, 2, 29], [2024, 2, 29])).toEqual({ y: 4, m: 0, d: 0 });
    expect(ymd([2020, 2, 29], [2020, 3, 1])).toEqual({ y: 0, m: 0, d: 1 });
    expect(ymd([2019, 2, 28], [2020, 2, 29])).toEqual({ y: 1, m: 0, d: 1 });
    expect(ymd([2016, 2, 29], [2017, 3, 1])).toEqual({ y: 1, m: 0, d: 0 }); // pre-fix: reconstructs to Feb-28, not Mar-01
  });
});

describe('age ordinary borrow + base cases — already correct (retained through the repair)', () => {
  it('ordinary borrowing (birth day fits the previous month)', () => {
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

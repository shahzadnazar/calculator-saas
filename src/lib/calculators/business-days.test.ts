import { describe, it, expect } from 'vitest';
import {
  businessDaysBetween,
  addBusinessDays,
  isBusinessDay,
  BUSINESS_DAY_MAX,
} from './business-days';
import { observedHolidayDays } from './us-holidays';
import { toISODateUTC, addDays } from './date-duration';

/**
 * Business-day counting and shifting.
 *
 * Both operations are also checked against a deliberately naive reference implemented here in
 * the test — one that just walks the calendar and asks "is this a working day?" — over a few
 * thousand generated cases. The production code walks too, so the value of the cross-check is in
 * the boundaries: which end of the range is counted, how `includeEnd` behaves on a weekend, and
 * whether the start day of a shift is ever counted.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = toISODateUTC;
const NONE = { excludeHolidays: false };
const HOLIDAYS = { excludeHolidays: true };

/* A naive reference, written for clarity rather than speed. */
function refBetween(a: Date, b: Date, opts: { includeEnd: boolean; excludeHolidays: boolean }) {
  const holidays = opts.excludeHolidays
    ? observedHolidayDays(a.getUTCFullYear(), b.getUTCFullYear())
    : new Set<number>();
  const working = (x: Date) => {
    const day = x.getUTCDay();
    if (day === 0 || day === 6) return false;
    return !holidays.has(Math.round(x.getTime() / 86_400_000));
  };
  const start = a.getTime() <= b.getTime() ? a : b;
  const end = a.getTime() <= b.getTime() ? b : a;
  let count = 0;
  for (let t = start.getTime(); t < end.getTime(); t += 86_400_000) {
    if (working(new Date(t))) count += 1;
  }
  if (opts.includeEnd && working(end)) count += 1;
  return count;
}

function refAdd(start: Date, n: number, opts: { excludeHolidays: boolean }) {
  if (n === 0) return new Date(start.getTime());
  const holidays = opts.excludeHolidays
    ? observedHolidayDays(start.getUTCFullYear() - 6, start.getUTCFullYear() + 6)
    : new Set<number>();
  const working = (x: Date) => {
    const day = x.getUTCDay();
    if (day === 0 || day === 6) return false;
    return !holidays.has(Math.round(x.getTime() / 86_400_000));
  };
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let cur = start;
  while (remaining > 0) {
    cur = addDays(cur, step);
    if (working(cur)) remaining -= 1;
  }
  return cur;
}

/* ------------------------------------------------------------------ */
/* isBusinessDay                                                       */
/* ------------------------------------------------------------------ */

describe('isBusinessDay', () => {
  it('accepts Monday to Friday and rejects the weekend', () => {
    // 2026-08-24 is a Monday.
    const expected = [true, true, true, true, true, false, false];
    for (let i = 0; i < 7; i += 1) {
      expect(isBusinessDay(addDays(d('2026-08-24'), i), new Set())).toBe(expected[i]);
    }
  });
  it('rejects an observed holiday when one is supplied', () => {
    const holidays = observedHolidayDays(2026, 2026);
    expect(isBusinessDay(d('2026-07-03'), holidays)).toBe(false); // Independence Day observed
    expect(isBusinessDay(d('2026-07-03'), new Set())).toBe(true); // a Friday otherwise
  });
});

/* ------------------------------------------------------------------ */
/* businessDaysBetween                                                 */
/* ------------------------------------------------------------------ */

describe('businessDaysBetween — the plain weekday count', () => {
  it('counts a working week as five', () => {
    // Monday to the following Monday, end day not counted.
    expect(businessDaysBetween(d('2026-08-24'), d('2026-08-31'), { ...NONE, includeEnd: false })).toBe(5);
  });
  it('counts nothing across a weekend alone', () => {
    // Saturday to Monday, end day not counted.
    expect(businessDaysBetween(d('2026-08-29'), d('2026-08-31'), { ...NONE, includeEnd: false })).toBe(0);
  });
  it('is zero for the same day, and one when that day is included and is a weekday', () => {
    expect(businessDaysBetween(d('2026-08-25'), d('2026-08-25'), { ...NONE, includeEnd: false })).toBe(0);
    expect(businessDaysBetween(d('2026-08-25'), d('2026-08-25'), { ...NONE, includeEnd: true })).toBe(1);
  });
  it('does not gain a working day when the range ends on a weekend', () => {
    // Monday to Saturday: Mon-Fri counted, and including the Saturday adds nothing.
    const args = { ...NONE };
    expect(businessDaysBetween(d('2026-08-24'), d('2026-08-29'), { ...args, includeEnd: false })).toBe(5);
    expect(businessDaysBetween(d('2026-08-24'), d('2026-08-29'), { ...args, includeEnd: true })).toBe(5);
  });
  it('is order-independent', () => {
    const a = d('2026-01-05');
    const b = d('2026-03-17');
    for (const includeEnd of [false, true]) {
      expect(businessDaysBetween(a, b, { ...NONE, includeEnd })).toBe(
        businessDaysBetween(b, a, { ...NONE, includeEnd }),
      );
    }
  });
  it('drops the observed holidays when asked', () => {
    // The week containing Independence Day 2026, observed Friday 2026-07-03.
    const mon = d('2026-06-29');
    const nextMon = d('2026-07-06');
    expect(businessDaysBetween(mon, nextMon, { ...NONE, includeEnd: false })).toBe(5);
    expect(businessDaysBetween(mon, nextMon, { ...HOLIDAYS, includeEnd: false })).toBe(4);
  });
  it('rejects an unparseable date rather than counting from a NaN', () => {
    expect(
      Number.isNaN(businessDaysBetween(new Date(Number.NaN), d('2026-01-01'), { ...NONE, includeEnd: false })),
    ).toBe(true);
  });
});

describe('businessDaysBetween — against a naive reference', () => {
  it('agrees over a few thousand generated ranges, holidays on and off', () => {
    const base = d('2019-01-01').getTime();
    for (let i = 0; i < 1200; i += 1) {
      const a = new Date(base + ((i * 37) % 2600) * 86_400_000);
      const b = new Date(a.getTime() + ((i * 53) % 900) * 86_400_000);
      for (const excludeHolidays of [false, true]) {
        for (const includeEnd of [false, true]) {
          const opts = { excludeHolidays, includeEnd };
          expect(businessDaysBetween(a, b, opts)).toBe(refBetween(a, b, opts));
        }
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* addBusinessDays                                                     */
/* ------------------------------------------------------------------ */

describe('addBusinessDays', () => {
  it('never counts the start day itself', () => {
    // 3 business days from Friday 2026-08-28 is Wednesday 2026-09-02.
    expect(iso(addBusinessDays(d('2026-08-28'), 3, NONE))).toBe('2026-09-02');
    // From the Sunday in between, the same Wednesday.
    expect(iso(addBusinessDays(d('2026-08-30'), 3, NONE))).toBe('2026-09-02');
  });
  it('leaves a zero shift exactly where it is, weekend or not', () => {
    expect(iso(addBusinessDays(d('2026-08-29'), 0, NONE))).toBe('2026-08-29'); // a Saturday
  });
  it('steps backwards with a negative count', () => {
    // 1 business day before Monday 2026-08-31 is Friday 2026-08-28.
    expect(iso(addBusinessDays(d('2026-08-31'), -1, NONE))).toBe('2026-08-28');
  });
  it('skips an observed holiday when asked', () => {
    // From Wednesday 2026-07-01: one business day is the 2nd either way; two business days is
    // Friday the 3rd normally, but Monday the 6th once Independence Day (observed) is skipped.
    expect(iso(addBusinessDays(d('2026-07-01'), 2, NONE))).toBe('2026-07-03');
    expect(iso(addBusinessDays(d('2026-07-01'), 2, HOLIDAYS))).toBe('2026-07-06');
  });
  it('refuses a count too large to walk rather than locking up', () => {
    expect(Number.isNaN(addBusinessDays(d('2026-01-01'), BUSINESS_DAY_MAX + 1, NONE).getTime())).toBe(true);
    expect(Number.isFinite(addBusinessDays(d('2026-01-01'), BUSINESS_DAY_MAX, NONE).getTime())).toBe(true);
  });
  it('rejects an unparseable start', () => {
    expect(Number.isNaN(addBusinessDays(new Date(Number.NaN), 5, NONE).getTime())).toBe(true);
  });
  it('round-trips: adding n then subtracting n returns to a business day n back', () => {
    const start = d('2026-03-02'); // a Monday
    for (const n of [1, 5, 23, 260]) {
      const there = addBusinessDays(start, n, HOLIDAYS);
      expect(iso(addBusinessDays(there, -n, HOLIDAYS))).toBe(iso(start));
    }
  });
});

describe('addBusinessDays — against a naive reference', () => {
  it('agrees over hundreds of generated shifts, holidays on and off', () => {
    const base = d('2021-01-01').getTime();
    for (let i = 0; i < 300; i += 1) {
      const start = new Date(base + ((i * 29) % 1500) * 86_400_000);
      const n = (((i * 17) % 260) + 1) * (i % 2 === 0 ? 1 : -1);
      for (const excludeHolidays of [false, true]) {
        expect(iso(addBusinessDays(start, n, { excludeHolidays }))).toBe(
          iso(refAdd(start, n, { excludeHolidays })),
        );
      }
    }
  });
});

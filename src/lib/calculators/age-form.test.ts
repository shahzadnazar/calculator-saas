import { describe, it, expect } from 'vitest';
import {
  ageBinding,
  validateAgeValues,
  computeAge,
  completeAgeValue,
  describeAgeResult,
  interpretAge,
  todayISO,
  isStrictCalendarDate,
  MSG,
  type AgeValues,
  type AgeComputed,
} from './age-form';
import { calculateAge, parseISODateUTC } from './age';
import { ageDate, weeksAndDays } from './age-form';

/**
 * Age binding unit tests (R18C1). Validation, computation (delegating to the FROZEN calculateAge —
 * incl. the R18C0 month-end repair, whose full matrix stays age.test.ts's authority), the
 * complete-result guard (incl. tamper + reconciliation), description/announcement, and the DOM
 * read/reset helpers via a mock root. No age arithmetic is reimplemented here.
 */

const vals = (v: Partial<AgeValues> = {}): AgeValues => ({ dob: '1990-06-15', at: '2020-06-15', ...v });

function mockRoot(v: Partial<AgeValues> = {}) {
  const store: Record<string, { value: string }> = {
    dob: { value: v.dob ?? '' },
    at: { value: v.at ?? '' },
  };
  const root = {
    querySelector(sel: string) {
      const m = sel.match(/\[name="(\w+)"\]/);
      return m && store[m[1]] ? store[m[1]] : null;
    },
  } as unknown as HTMLElement;
  return { root, store };
}

describe('age binding — contract', () => {
  it('does NOT implement isUsableResult (the guard lives in resultValue)', () => {
    expect(ageBinding.isUsableResult).toBeUndefined();
  });

  it('resultValue is the complete-result guard: finite totalDays when coherent, NaN when tampered', () => {
    const c = computeAge(vals());
    expect(ageBinding.resultValue(c)).toBe(c.totalDays);
    expect(Number.isNaN(ageBinding.resultValue({ ...c, days: c.days + 1 }))).toBe(true);
  });
});

describe('age binding — strict civil-date validation', () => {
  it('ordinary input is valid', () => {
    expect(validateAgeValues(vals()).ok).toBe(true);
  });

  it('requires both dates when empty', () => {
    const a = validateAgeValues(vals({ dob: '' }));
    if (!a.ok) expect(a.fieldErrors?.dob).toBe(MSG.dobRequired);
    const b = validateAgeValues(vals({ at: '' }));
    if (!b.ok) expect(b.fieldErrors?.at).toBe(MSG.atRequired);
    const both = validateAgeValues({ dob: '', at: '' });
    expect(both.ok).toBe(false);
    if (!both.ok) {
      expect(both.fieldErrors?.dob).toBe(MSG.dobRequired);
      expect(both.fieldErrors?.at).toBe(MSG.atRequired);
    }
  });

  it('rejects malformed and IMPOSSIBLE dates without rolling them over', () => {
    for (const bad of ['2025-02-29', '2024-02-30', '2024-13-01', '2026-1-2', 'not-a-date', '19900615']) {
      const v = validateAgeValues(vals({ dob: bad }));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.fieldErrors?.dob).toBe(MSG.dobInvalid);
    }
    const atBad = validateAgeValues(vals({ at: '2023-04-31' }));
    if (!atBad.ok) expect(atBad.fieldErrors?.at).toBe(MSG.atInvalid);
  });

  it('accepts a calendar-valid leap day and a same-date pair', () => {
    expect(validateAgeValues(vals({ dob: '2020-02-29', at: '2021-03-01' })).ok).toBe(true);
    expect(validateAgeValues(vals({ dob: '2020-06-15', at: '2020-06-15' })).ok).toBe(true);
  });

  it('rejects a date of birth AFTER the as-of date on the DOB field (never swapped)', () => {
    const v = validateAgeValues(vals({ dob: '2020-06-15', at: '1990-06-15' }));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.fieldErrors?.dob).toBe(MSG.order);
      expect(v.fieldErrors?.at).toBeUndefined();
    }
  });

  it('isStrictCalendarDate round-trips through the unchanged primitive', () => {
    expect(isStrictCalendarDate('2020-02-29')).toBe(true); // real leap day
    expect(isStrictCalendarDate('2021-02-29')).toBe(false); // not a leap year
    expect(isStrictCalendarDate('2020-2-9')).toBe(false); // non-canonical
  });
});

describe('age binding — computation + guard (delegating to the frozen calculateAge)', () => {
  const ref = (v: AgeValues) => calculateAge(parseISODateUTC(v.dob)!, parseISODateUTC(v.at)!);

  it('delegates to calculateAge unchanged and echoes the ISO inputs', () => {
    const v = vals();
    const c = computeAge(v);
    const r = ref(v);
    expect({ y: c.years, m: c.months, d: c.days }).toEqual({ y: r.years, m: r.months, d: r.days });
    expect(c.totalDays).toBe(r.totalDays);
    expect(c.totalWeeks).toBe(r.totalWeeks);
    expect(c.totalMonths).toBe(r.totalMonths);
    expect(c.nextBirthdayInDays).toBe(r.nextBirthdayInDays);
    expect(c.dobISO).toBe('1990-06-15');
    expect(c.atISO).toBe('2020-06-15');
    expect(completeAgeValue(c)).toBe(c.totalDays);
  });

  it('an ordinary age passes the guard with a positive totalDays', () => {
    const c = computeAge(vals());
    expect(c.years).toBe(30);
    expect(completeAgeValue(c)).toBeGreaterThan(0);
  });

  it('preserves the R18C0 month-end repair: 2020-01-31 → 2020-03-01 = 0y 1m 1d', () => {
    const c = computeAge({ dob: '2020-01-31', at: '2020-03-01' });
    expect({ y: c.years, m: c.months, d: c.days }).toEqual({ y: 0, m: 1, d: 1 });
    expect(completeAgeValue(c)).toBe(30); // finite totalDays sentinel
  });

  it('preserves the non-leap Jan-31 case and a leap-day year boundary', () => {
    const nonLeap = computeAge({ dob: '2021-01-31', at: '2021-03-01' });
    expect({ y: nonLeap.years, m: nonLeap.months, d: nonLeap.days }).toEqual({ y: 0, m: 1, d: 1 });
    const leap = computeAge({ dob: '2020-02-29', at: '2021-02-28' });
    expect({ y: leap.years, m: leap.months, d: leap.days }).toEqual({ y: 1, m: 0, d: 0 });
    expect(Number.isNaN(completeAgeValue(nonLeap))).toBe(false);
    expect(Number.isNaN(completeAgeValue(leap))).toBe(false);
  });

  it('a same-date pair is a VALID zero result: resultValue = 0, not NaN', () => {
    const c = computeAge(vals({ dob: '2020-06-15', at: '2020-06-15' }));
    expect({ y: c.years, m: c.months, d: c.days }).toEqual({ y: 0, m: 0, d: 0 });
    expect(c.totalDays).toBe(0);
    expect(completeAgeValue(c)).toBe(0);
    expect(Number.isNaN(completeAgeValue(c))).toBe(false);
    expect(ageBinding.resultValue(c)).toBe(0);
  });

  it('a one-day interval is valid', () => {
    const c = computeAge(vals({ dob: '2020-06-15', at: '2020-06-16' }));
    expect({ y: c.years, m: c.months, d: c.days }).toEqual({ y: 0, m: 0, d: 1 });
    expect(completeAgeValue(c)).toBe(1);
  });

  it('rejects tampered / inconsistent results (guard reconciles via a recompute)', () => {
    const c = computeAge(vals());
    expect(Number.isNaN(completeAgeValue({ ...c, months: c.months + 1 }))).toBe(true);
    expect(Number.isNaN(completeAgeValue({ ...c, days: -1 } as AgeComputed))).toBe(true);
    expect(Number.isNaN(completeAgeValue({ ...c, months: 12 } as AgeComputed))).toBe(true);
    expect(Number.isNaN(completeAgeValue({ ...c, totalDays: c.totalDays + 5 } as AgeComputed))).toBe(true);
    expect(Number.isNaN(completeAgeValue({ ...c, valid: false } as AgeComputed))).toBe(true);
    // DOB after as-of, or an impossible echoed ISO, both fail the guard.
    expect(Number.isNaN(completeAgeValue({ ...c, dobISO: '2025-06-15', atISO: '2020-06-15' } as AgeComputed))).toBe(true);
    expect(Number.isNaN(completeAgeValue({ ...c, dobISO: '2025-02-29' } as AgeComputed))).toBe(true);
  });
});

describe('age binding — description + interpretation + DOM', () => {
  it('announces the dominant exact age', () => {
    const c = computeAge(vals({ dob: '1995-03-10', at: '2020-06-15' }));
    expect(describeAgeResult(c)).toBe(`Exact age: ${c.years} years, ${c.months} months, ${c.days} days.`);
  });

  it('announces a same-date zero age as 0 years, 0 months, 0 days', () => {
    const c = computeAge(vals({ dob: '2020-06-15', at: '2020-06-15' }));
    expect(describeAgeResult(c)).toBe('Exact age: 0 years, 0 months, 0 days.');
  });

  it('singularises 1 year / 1 month / 1 day', () => {
    const c = computeAge({ dob: '2019-05-14', at: '2020-06-15' }); // 1y 1m 1d
    expect({ y: c.years, m: c.months, d: c.days }).toEqual({ y: 1, m: 1, d: 1 });
    expect(describeAgeResult(c)).toBe('Exact age: 1 year, 1 month, 1 day.');
    expect(interpretAge(c)).toContain('until the next birthday');
  });

  it('readValues reads both dates; todayISO is a canonical ISO date', () => {
    const { root } = mockRoot({ dob: '1990-06-15', at: '2020-06-15' });
    expect(ageBinding.readValues(root)).toEqual({ dob: '1990-06-15', at: '2020-06-15' });
    expect(isStrictCalendarDate(todayISO())).toBe(true);
  });

  it('resetValues clears both dates (the island restores the today default)', () => {
    const { root, store } = mockRoot({ dob: '1990-06-15', at: '2010-01-01' });
    ageBinding.resetValues(root, 'personal');
    expect(store.dob.value).toBe('');
    expect(store.at.value).toBe('');
  });
});


/* ------------------------------------------------------------------ */
/* Period covered + the finer units (presentation)                     */
/* ------------------------------------------------------------------ */

describe('the span the age covers', () => {
  it('formats each civil date in long form, in UTC (no timezone drift)', () => {
    expect(ageDate('1991-06-15')).toBe('15 June 1991');
    expect(ageDate('2026-08-26')).toBe('26 August 2026');
    // A date that would roll backwards a day under a negative-offset local zone.
    expect(ageDate('2024-01-01')).toBe('1 January 2024');
  });

  it('renders the pair the result shows as start and end', () => {
    const r = computeAge({ dob: '1991-06-15', at: '2026-08-26' });
    expect([ageDate(r.dobISO), ageDate(r.atISO)]).toEqual(['15 June 1991', '26 August 2026']);
  });
});

describe('weeks with the leftover days', () => {
  it('adds the remainder when there is one', () => {
    const r = computeAge({ dob: '2006-02-03', at: '2026-08-26' });
    expect(weeksAndDays(r)).toBe('1,072 + 5 days');
  });

  it('drops the remainder on an exact number of weeks', () => {
    const r = computeAge({ dob: '2026-08-05', at: '2026-08-26' }); // exactly 3 weeks
    expect(weeksAndDays(r)).toBe('3');
  });

  it('says "1 day", not "1 days"', () => {
    const r = computeAge({ dob: '2026-08-04', at: '2026-08-26' }); // 22 days = 3w 1d
    expect(weeksAndDays(r)).toBe('3 + 1 day');
  });

  it('never repeats the unit already carried by the row label', () => {
    const r = computeAge({ dob: '2006-02-03', at: '2026-08-26' });
    expect(weeksAndDays(r)).not.toMatch(/weeks/);
  });
});

describe('the complete-result guard covers the new fields', () => {
  it('accepts a coherent result carrying hours, minutes and seconds', () => {
    const r = computeAge({ dob: '1991-06-15', at: '2026-08-26' });
    expect(Number.isFinite(completeAgeValue(r))).toBe(true);
  });

  it('rejects a result whose finer units were tampered with', () => {
    const r = computeAge({ dob: '1991-06-15', at: '2026-08-26' });
    expect(Number.isNaN(completeAgeValue({ ...r, totalHours: r.totalHours + 1 }))).toBe(true);
    expect(Number.isNaN(completeAgeValue({ ...r, totalSeconds: 0 }))).toBe(true);
    expect(Number.isNaN(completeAgeValue({ ...r, totalWeeksRemainderDays: 9 }))).toBe(true);
  });
});

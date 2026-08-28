import { describe, it, expect } from 'vitest';
import { toISODateUTC, addDays } from './date-duration';
import {
  dateBinding,
  validateDateValues,
  computeDate,
  completeDiffValue,
  completeAddValue,
  describeDateResult,
  interpretDiff,
  interpretAdd,
  diffPhrase,
  isStrictCalendarDate,
  parseWholeNonNegative,
  DEFAULT_MODE,
  DEFAULT_OP,
  MSG,
  type DateValues,
  type DiffComputed,
  type AddComputed,
  weeksAndDays,
  alternativeUnits,
  shiftPhrase,
  COMMON_YEAR_DAYS,
} from './date-form';

/**
 * Date binding unit tests (R18C2). Two calculator-owned structural modes on the UNCHANGED
 * standard-form runtime, wrapping the FROZEN date-duration primitives (whose full matrix stays
 * date-duration.test.ts's authority). Covers strict validation, the day-offset domain, mode-scoped
 * computation, the per-mode complete-result guards (tamper + source reconciliation),
 * description/announcement, and the DOM read/reset helpers via a mock root. No date arithmetic is
 * reimplemented here.
 */

const BASE: DateValues = {
  mode: 'diff',
  from: '',
  to: '',
  includeEnd: false,
  start: '',
  op: 'add',
  years: '',
  months: '',
  weeks: '',
  days: '',
  businessOnly: false,
  excludeHolidays: false,
};
const diffVals = (v: Partial<DateValues> = {}): DateValues => ({
  ...BASE,
  mode: 'diff',
  from: '2020-01-01',
  to: '2025-01-01',
  ...v,
});
const addVals = (v: Partial<DateValues> = {}): DateValues => ({
  ...BASE,
  mode: 'add',
  start: '2024-01-01',
  op: 'add',
  days: '90',
  ...v,
});

type MockField = 'mode' | 'from' | 'to' | 'start' | 'op' | 'years' | 'months' | 'weeks' | 'days';
type MockToggle = 'includeEnd' | 'businessOnly' | 'excludeHolidays';

function mockRoot(
  v: Partial<Record<MockField, string>> = {},
  toggles: Partial<Record<MockToggle, boolean>> = {},
) {
  const store: Record<string, { value: string; checked?: boolean }> = {
    mode: { value: v.mode ?? DEFAULT_MODE },
    from: { value: v.from ?? '' },
    to: { value: v.to ?? '' },
    start: { value: v.start ?? '' },
    op: { value: v.op ?? DEFAULT_OP },
    years: { value: v.years ?? '' },
    months: { value: v.months ?? '' },
    weeks: { value: v.weeks ?? '' },
    days: { value: v.days ?? '' },
    includeEnd: { value: 'on', checked: !!toggles.includeEnd },
    businessOnly: { value: 'on', checked: !!toggles.businessOnly },
    excludeHolidays: { value: 'on', checked: !!toggles.excludeHolidays },
  };
  const root = {
    querySelector(sel: string) {
      const m = sel.match(/\[name="(\w+)"\]/);
      return m && store[m[1]] ? store[m[1]] : null;
    },
  } as unknown as HTMLElement;
  return { root, store };
}

describe('date binding — contract', () => {
  it('does NOT implement isUsableResult (each mode guards in resultValue)', () => {
    expect(dateBinding.isUsableResult).toBeUndefined();
  });

  it('default mode is difference; default operation is add', () => {
    expect(DEFAULT_MODE).toBe('diff');
    expect(DEFAULT_OP).toBe('add');
  });

  it('resultValue dispatches to the active mode guard', () => {
    const d = computeDate(diffVals()) as DiffComputed;
    expect(dateBinding.resultValue(d)).toBe(d.diff.totalDays);
    const a = computeDate(addVals()) as AddComputed;
    expect(dateBinding.resultValue(a)).toBe(completeAddValue(a));
  });
});

describe('date binding — strict date validation helpers', () => {
  it('isStrictCalendarDate round-trips through the unchanged primitive', () => {
    expect(isStrictCalendarDate('2020-02-29')).toBe(true); // real leap day
    expect(isStrictCalendarDate('2021-02-29')).toBe(false); // not a leap year
    expect(isStrictCalendarDate('2024-13-01')).toBe(false); // impossible month
    expect(isStrictCalendarDate('2026-1-2')).toBe(false); // non-canonical
  });

  it('parseWholeNonNegative: empty vs invalid vs a whole non-negative number (0 valid)', () => {
    expect(parseWholeNonNegative('')).toBe('empty');
    expect(parseWholeNonNegative('   ')).toBe('empty');
    expect(parseWholeNonNegative('0')).toBe(0);
    expect(parseWholeNonNegative('90')).toBe(90);
    expect(parseWholeNonNegative('1.5')).toBe('invalid');
    expect(parseWholeNonNegative('-3')).toBe('invalid');
    expect(parseWholeNonNegative('abc')).toBe('invalid');
    expect(parseWholeNonNegative('Infinity')).toBe('invalid');
  });
});

describe('date binding — DIFFERENCE mode validation', () => {
  it('ordinary two-date input is valid', () => {
    expect(validateDateValues(diffVals()).ok).toBe(true);
  });

  it('requires both dates when empty', () => {
    const empty = validateDateValues(diffVals({ from: '', to: '' }));
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.fieldErrors?.from).toBe(MSG.fromRequired);
      expect(empty.fieldErrors?.to).toBe(MSG.toRequired);
    }
  });

  it('rejects a missing start or end individually', () => {
    const noFrom = validateDateValues(diffVals({ from: '' }));
    if (!noFrom.ok) expect(noFrom.fieldErrors?.from).toBe(MSG.fromRequired);
    const noTo = validateDateValues(diffVals({ to: '' }));
    if (!noTo.ok) expect(noTo.fieldErrors?.to).toBe(MSG.toRequired);
  });

  it('rejects malformed and IMPOSSIBLE dates without rolling them over', () => {
    for (const bad of ['2025-02-29', '2024-13-01', '2026-1-2', 'not-a-date']) {
      const v = validateDateValues(diffVals({ from: bad }));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.fieldErrors?.from).toBe(MSG.fromInvalid);
    }
    const toBad = validateDateValues(diffVals({ to: '2023-04-31' }));
    if (!toBad.ok) expect(toBad.fieldErrors?.to).toBe(MSG.toInvalid);
  });

  it('accepts a same-date pair, a leap day and a REVERSE pair (never swapped, no order error)', () => {
    expect(validateDateValues(diffVals({ from: '2020-06-15', to: '2020-06-15' })).ok).toBe(true);
    expect(validateDateValues(diffVals({ from: '2020-02-29', to: '2021-03-01' })).ok).toBe(true);
    expect(validateDateValues(diffVals({ from: '2025-01-01', to: '2020-01-01' })).ok).toBe(true);
  });
});

describe('date binding — DIFFERENCE computation + guard', () => {
  it('an ordinary forward interval is valid with a finite totalDays sentinel', () => {
    const d = computeDate(diffVals()) as DiffComputed;
    expect(d.diff.breakdown).toEqual({ years: 5, months: 0, days: 0 });
    expect(d.diff.direction).toBe('after');
    expect(completeDiffValue(d)).toBe(d.diff.totalDays);
    expect(completeDiffValue(d)).toBeGreaterThan(0);
  });

  it('a same-date pair is a VALID zero: totalDays 0, direction "same", resultValue 0', () => {
    const d = computeDate(diffVals({ from: '2024-06-15', to: '2024-06-15' })) as DiffComputed;
    expect(d.diff.totalDays).toBe(0);
    expect(d.diff.breakdown).toEqual({ years: 0, months: 0, days: 0 });
    expect(d.diff.direction).toBe('same');
    expect(completeDiffValue(d)).toBe(0);
    expect(Number.isNaN(completeDiffValue(d))).toBe(false);
  });

  it('a REVERSE pair is valid: absolute totalDays with direction "before" (no swap)', () => {
    const d = computeDate(diffVals({ from: '2025-01-01', to: '2020-01-01' })) as DiffComputed;
    expect(d.diff.totalDays).toBe(1827);
    expect(d.diff.direction).toBe('before');
    expect(completeDiffValue(d)).toBe(1827);
  });

  it('preserves the R18C0 repaired month-end (2020-01-31 → 2020-03-01 = 0y 1m 1d, 30 days)', () => {
    const d = computeDate(diffVals({ from: '2020-01-31', to: '2020-03-01' })) as DiffComputed;
    expect(d.diff.breakdown).toEqual({ years: 0, months: 1, days: 1 });
    expect(completeDiffValue(d)).toBe(30);
  });

  it('leap-day to leap-day is exactly 4 years / 1461 days', () => {
    const d = computeDate(diffVals({ from: '2020-02-29', to: '2024-02-29' })) as DiffComputed;
    expect(d.diff.breakdown).toEqual({ years: 4, months: 0, days: 0 });
    expect(completeDiffValue(d)).toBe(1461);
  });

  it('rejects tampered / inconsistent difference results (guard reconciles via a diffDates recompute)', () => {
    const d = computeDate(diffVals()) as DiffComputed;
    expect(Number.isNaN(completeDiffValue({ ...d, diff: { ...d.diff, totalDays: d.diff.totalDays + 5 } }))).toBe(true);
    expect(Number.isNaN(completeDiffValue({ ...d, diff: { ...d.diff, weeks: d.diff.weeks + 1 } }))).toBe(true);
    expect(Number.isNaN(completeDiffValue({ ...d, diff: { ...d.diff, breakdown: { years: -1, months: 0, days: 0 } } }))).toBe(true);
    expect(Number.isNaN(completeDiffValue({ ...d, diff: { ...d.diff, breakdown: { years: 0, months: 12, days: 0 } } }))).toBe(true);
    expect(Number.isNaN(completeDiffValue({ ...d, diff: { ...d.diff, direction: 'sideways' as unknown as DiffComputed['diff']['direction'] } }))).toBe(true);
    expect(Number.isNaN(completeDiffValue({ ...d, fromISO: '2025-02-29' }))).toBe(true); // impossible echoed ISO
  });
});

describe('date binding — ADD / SUBTRACT mode validation', () => {
  it('ordinary input is valid', () => {
    expect(validateDateValues(addVals()).ok).toBe(true);
  });

  it('requires the date and the day count', () => {
    const noStart = validateDateValues(addVals({ start: '' }));
    if (!noStart.ok) expect(noStart.fieldErrors?.start).toBe(MSG.startRequired);
    // Every amount box blank is the error; any one of them filled is enough.
    const noAmount = validateDateValues(addVals({ days: '' }));
    expect(noAmount.ok).toBe(false);
    if (!noAmount.ok) expect(noAmount.fieldErrors?.amount).toBe(MSG.amountRequired);
    expect(validateDateValues(addVals({ days: '', months: '3' })).ok).toBe(true);
  });

  it('rejects a malformed date and a malformed / fractional / negative day count', () => {
    const badDate = validateDateValues(addVals({ start: '2024-02-30' }));
    if (!badDate.ok) expect(badDate.fieldErrors?.start).toBe(MSG.startInvalid);
    for (const bad of ['abc', '1.5', '-3']) {
      for (const unit of ['years', 'months', 'weeks', 'days'] as const) {
        const v = validateDateValues(addVals({ days: '0', [unit]: bad }));
        expect(v.ok).toBe(false);
        if (!v.ok) expect(v.fieldErrors?.amount).toBe(MSG.amountInvalid);
      }
    }
  });

  it('zero days is valid (the same date)', () => {
    expect(validateDateValues(addVals({ days: '0' })).ok).toBe(true);
    const d = computeDate(addVals({ start: '2024-06-15', days: '0' })) as AddComputed;
    expect(d.resultISO).toBe('2024-06-15');
    expect(Number.isNaN(completeAddValue(d))).toBe(false);
  });
});

describe('date binding — ADD / SUBTRACT computation + guard', () => {
  it('adds whole days (2024-01-01 + 90 → 2024-03-31)', () => {
    const d = computeDate(addVals({ start: '2024-01-01', op: 'add', days: '90' })) as AddComputed;
    expect(d.resultISO).toBe('2024-03-31');
    expect(d.signedDays).toBe(90);
    expect(Number.isNaN(completeAddValue(d))).toBe(false);
  });

  it('subtracts on the structural op (2024-01-01 - 1 → 2023-12-31)', () => {
    const d = computeDate(addVals({ start: '2024-01-01', op: 'sub', days: '1' })) as AddComputed;
    expect(d.resultISO).toBe('2023-12-31');
    expect(d.signedDays).toBe(-1);
    expect(Number.isNaN(completeAddValue(d))).toBe(false);
  });

  it('handles month, year and leap rollovers', () => {
    expect((computeDate(addVals({ start: '2024-01-31', days: '1' })) as AddComputed).resultISO).toBe('2024-02-01');
    expect((computeDate(addVals({ start: '2024-12-31', days: '1' })) as AddComputed).resultISO).toBe('2025-01-01');
    expect((computeDate(addVals({ start: '2024-02-28', days: '1' })) as AddComputed).resultISO).toBe('2024-02-29');
    expect((computeDate(addVals({ start: '2023-02-28', days: '1' })) as AddComputed).resultISO).toBe('2023-03-01');
  });

  it('rejects tampered / inconsistent add results (guard reconciles via an addDays recompute)', () => {
    const d = computeDate(addVals({ start: '2024-01-01', op: 'add', days: '90' })) as AddComputed;
    expect(Number.isNaN(completeAddValue({ ...d, resultISO: '2024-04-01' }))).toBe(true); // wrong output
    expect(Number.isNaN(completeAddValue({ ...d, days: 1.5 }))).toBe(true); // non-integer magnitude
    expect(Number.isNaN(completeAddValue({ ...d, days: -1 }))).toBe(true); // negative magnitude
    expect(Number.isNaN(completeAddValue({ ...d, signedDays: 91 }))).toBe(true); // sign/magnitude mismatch
    expect(Number.isNaN(completeAddValue({ ...d, startISO: '2025-02-29' }))).toBe(true); // impossible start
  });

  it('a day count that overflows the Date is rejected by the guard (no arbitrary cap needed)', () => {
    const d = computeDate(addVals({ start: '2024-01-01', op: 'add', days: '1000000000' })) as AddComputed;
    expect(Number.isNaN(completeAddValue(d))).toBe(true);
  });
});

describe('date binding — description + interpretation', () => {
  it('announces the dominant difference breakdown', () => {
    const d = computeDate(diffVals({ from: '2020-01-01', to: '2022-04-05' })) as DiffComputed;
    expect(describeDateResult(d)).toBe(`Date difference: ${diffPhrase(d.diff)}.`);
    expect(describeDateResult(d)).toContain('Date difference:');
  });

  it('announces the dominant resulting date (long form without weekday)', () => {
    const d = computeDate(addVals({ start: '2026-08-01', op: 'add', days: '24' })) as AddComputed;
    expect(d.resultISO).toBe('2026-08-25');
    expect(describeDateResult(d)).toBe('Resulting date: August 25, 2026.');
  });

  it('difference interpretation names the direction; same-date reads "same day"', () => {
    const after = computeDate(diffVals({ from: '2020-01-01', to: '2021-01-01' })) as DiffComputed;
    expect(interpretDiff(after)).toContain('after');
    const before = computeDate(diffVals({ from: '2021-01-01', to: '2020-01-01' })) as DiffComputed;
    expect(interpretDiff(before)).toContain('before');
    const same = computeDate(diffVals({ from: '2020-06-15', to: '2020-06-15' })) as DiffComputed;
    expect(interpretDiff(same)).toContain('same day');
  });

  it('add interpretation names the operation, magnitude and original date', () => {
    const add = computeDate(addVals({ start: '2024-01-01', op: 'add', days: '90' })) as AddComputed;
    expect(interpretAdd(add)).toContain('Adding 90 days');
    const sub = computeDate(addVals({ start: '2024-01-01', op: 'sub', days: '1' })) as AddComputed;
    expect(interpretAdd(sub)).toContain('Subtracting 1 day');
  });
});

describe('date binding — DOM read / reset (mock root)', () => {
  it('readValues reads the active mode plus every field name', () => {
    const { root } = mockRoot(
      { mode: 'add', start: '2024-01-01', op: 'sub', years: '1', months: '2', weeks: '3', days: '5', from: '2020-01-01', to: '2020-02-01' },
      { includeEnd: true, businessOnly: true, excludeHolidays: true },
    );
    expect(dateBinding.readValues(root)).toEqual({
      mode: 'add',
      from: '2020-01-01',
      to: '2020-02-01',
      includeEnd: true,
      start: '2024-01-01',
      op: 'sub',
      years: '1',
      months: '2',
      weeks: '3',
      days: '5',
      businessOnly: true,
      excludeHolidays: true,
    });
  });

  it('readValues defaults mode to diff and op to add when the controls are absent/blank', () => {
    const { root } = mockRoot({ mode: '', op: '' });
    const v = dateBinding.readValues(root);
    expect(v.mode).toBe('diff');
    expect(v.op).toBe('add');
  });

  it('resetValues restores the default mode + op and clears every field across BOTH modes', () => {
    const { root, store } = mockRoot({ mode: 'add', from: '2020-01-01', to: '2021-01-01', start: '2024-01-01', op: 'sub', days: '30' });
    dateBinding.resetValues(root, 'personal');
    expect(store.mode.value).toBe('diff');
    expect(store.op.value).toBe('add');
    expect(store.from.value).toBe('');
    expect(store.to.value).toBe('');
    expect(store.start.value).toBe('');
    expect(store.days.value).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/* Include the end day                                                 */
/* ------------------------------------------------------------------ */

describe('date binding — include the end day', () => {
  const counted = (v: Partial<DateValues>) =>
    (computeDate(diffVals(v)) as DiffComputed).countedDays;

  it('adds exactly one day, and only when asked', () => {
    expect(counted({ from: '2026-01-01', to: '2026-01-03' })).toBe(2);
    expect(counted({ from: '2026-01-01', to: '2026-01-03', includeEnd: true })).toBe(3);
  });

  it('makes a same-day range one day rather than zero', () => {
    expect(counted({ from: '2026-01-01', to: '2026-01-01' })).toBe(0);
    expect(counted({ from: '2026-01-01', to: '2026-01-01', includeEnd: true })).toBe(1);
  });

  it('leaves the calendar breakdown alone — it is the span, not the count', () => {
    const r = computeDate(diffVals({ from: '2026-01-01', to: '2026-03-01', includeEnd: true })) as DiffComputed;
    expect(r.diff.breakdown).toEqual({ years: 0, months: 2, days: 0 });
    expect(r.countedDays).toBe(r.diff.totalDays + 1);
  });

  it('is reflected in the sentence, and passes the completeness guard', () => {
    const r = computeDate(diffVals({ from: '2026-01-01', to: '2026-01-03', includeEnd: true })) as DiffComputed;
    expect(interpretDiff(r)).toContain('end day included');
    expect(Number.isNaN(completeDiffValue(r))).toBe(false);
  });

  it('rejects a tampered counted total that does not follow from the span', () => {
    const r = computeDate(diffVals({ from: '2026-01-01', to: '2026-01-03' })) as DiffComputed;
    expect(Number.isNaN(completeDiffValue({ ...r, countedDays: 99 }))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Business days                                                       */
/* ------------------------------------------------------------------ */

describe('date binding — business days', () => {
  it('counts only weekdays over the span', () => {
    // Monday 2026-08-24 to the following Monday.
    const r = computeDate(
      diffVals({ from: '2026-08-24', to: '2026-08-31', businessOnly: true }),
    ) as DiffComputed;
    expect(r.diff.totalDays).toBe(7);
    expect(r.businessDays).toBe(5);
  });

  it('drops the observed federal holidays when asked, and says so', () => {
    const base = { from: '2026-06-29', to: '2026-07-06', businessOnly: true };
    const plain = computeDate(diffVals(base)) as DiffComputed;
    const noHol = computeDate(diffVals({ ...base, excludeHolidays: true })) as DiffComputed;
    expect(plain.businessDays).toBe(5);
    expect(noHol.businessDays).toBe(4); // Independence Day, observed Friday 2026-07-03
    expect(interpretDiff(noHol)).toContain('excluding US federal holidays');
  });

  it('makes the working-day count the dominant answer, and announces it', () => {
    const r = computeDate(
      diffVals({ from: '2026-08-24', to: '2026-08-31', businessOnly: true }),
    ) as DiffComputed;
    expect(describeDateResult(r)).toBe('Business days: 5.');
    expect(completeDiffValue(r)).toBe(5); // the guard returns the figure on show
  });

  it('never reports more working days than calendar days', () => {
    for (const span of [0, 1, 3, 7, 30, 365, 4000]) {
      const from = '2026-01-01';
      const to = toISODateUTC(addDays(new Date('2026-01-01T00:00:00Z'), span));
      for (const includeEnd of [false, true]) {
        const r = computeDate(
          diffVals({ from, to, includeEnd, businessOnly: true, excludeHolidays: true }),
        ) as DiffComputed;
        expect(r.businessDays).toBeLessThanOrEqual(r.countedDays);
        expect(Number.isNaN(completeDiffValue(r))).toBe(false);
      }
    }
  });

  it('rejects a tampered business-day figure', () => {
    const r = computeDate(
      diffVals({ from: '2026-08-24', to: '2026-08-31', businessOnly: true }),
    ) as DiffComputed;
    expect(Number.isNaN(completeDiffValue({ ...r, businessDays: 4 }))).toBe(true);
    expect(Number.isNaN(completeDiffValue({ ...r, businessDays: 99 }))).toBe(true);
  });

  it('ignores the holiday option entirely unless business days are on', () => {
    const { root } = mockRoot({ mode: 'diff' }, { businessOnly: false, excludeHolidays: true });
    expect(dateBinding.readValues(root).excludeHolidays).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Years, months, weeks and days                                       */
/* ------------------------------------------------------------------ */

describe('date binding — add or subtract in four units', () => {
  const at = (v: Partial<DateValues>) => (computeDate(addVals(v)) as AddComputed).resultISO;

  it('adds each unit', () => {
    expect(at({ start: '2026-01-15', years: '1', days: '' })).toBe('2027-01-15');
    expect(at({ start: '2026-01-15', months: '2', days: '' })).toBe('2026-03-15');
    expect(at({ start: '2026-01-15', weeks: '3', days: '' })).toBe('2026-02-05');
    expect(at({ start: '2026-01-15', days: '10' })).toBe('2026-01-25');
  });

  it('subtracts each unit', () => {
    expect(at({ start: '2026-01-15', op: 'sub', years: '1', days: '' })).toBe('2025-01-15');
    expect(at({ start: '2026-01-15', op: 'sub', months: '2', days: '' })).toBe('2025-11-15');
    expect(at({ start: '2026-01-15', op: 'sub', weeks: '3', days: '' })).toBe('2025-12-25');
    expect(at({ start: '2026-01-15', op: 'sub', days: '10' })).toBe('2026-01-05');
  });

  it('combines them and clamps a month step to the end of the month', () => {
    expect(at({ start: '2026-01-15', years: '1', months: '2', weeks: '1', days: '3' })).toBe('2027-03-25');
    expect(at({ start: '2026-01-31', months: '1', days: '' })).toBe('2026-02-28');
    expect(at({ start: '2024-01-31', months: '1', days: '' })).toBe('2024-02-29');
  });

  it('treats a blank box as zero rather than as an error', () => {
    expect(at({ start: '2026-01-15', years: '', months: '', weeks: '', days: '7' })).toBe('2026-01-22');
  });

  it('names only the units actually given', () => {
    const r = computeDate(addVals({ start: '2026-01-15', years: '1', months: '0', weeks: '', days: '3' })) as AddComputed;
    expect(shiftPhrase(r)).toBe('1 year and 3 days');
    expect(interpretAdd(r)).toContain('Adding 1 year and 3 days to');
    const one = computeDate(addVals({ start: '2026-01-15', days: '1' })) as AddComputed;
    expect(shiftPhrase(one)).toBe('1 day');
    const three = computeDate(addVals({ start: '2026-01-15', years: '2', months: '3', days: '4' })) as AddComputed;
    expect(shiftPhrase(three)).toBe('2 years, 3 months and 4 days');
  });

  it('shifts by business days instead when that is asked for', () => {
    // 3 business days from Friday 2026-08-28 is Wednesday 2026-09-02.
    expect(at({ start: '2026-08-28', days: '3', businessOnly: true })).toBe('2026-09-02');
    // Two business days from Wednesday 2026-07-01, skipping the observed holiday, is Monday.
    expect(at({ start: '2026-07-01', days: '2', businessOnly: true, excludeHolidays: true })).toBe('2026-07-06');
  });

  it('refuses to mix calendar units into a business-day shift', () => {
    const v = validateDateValues(addVals({ days: '5', months: '1', businessOnly: true }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.fieldErrors?.amount).toBe(MSG.businessDaysOnly);
    // ...and the guard refuses one that reached it anyway.
    const r = computeDate(addVals({ start: '2026-01-15', days: '5', businessOnly: true })) as AddComputed;
    expect(Number.isNaN(completeAddValue({ ...r, months: 1 }))).toBe(true);
  });

  it('rejects a result that does not follow from the inputs on screen', () => {
    const r = computeDate(addVals({ start: '2026-01-15', months: '1', days: '' })) as AddComputed;
    expect(Number.isNaN(completeAddValue({ ...r, resultISO: '2026-03-15' }))).toBe(true);
    expect(Number.isNaN(completeAddValue({ ...r, months: 2 }))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Alternative units                                                   */
/* ------------------------------------------------------------------ */

describe('alternativeUnits', () => {
  it('converts a day count into every unit it offers', () => {
    const rows = alternativeUnits(10);
    const by = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(by.seconds).toBe('864,000');
    expect(by.minutes).toBe('14,400');
    expect(by.hours).toBe('240');
    expect(by.days).toBe('10');
    expect(by.weeks).toBe('1 week and 3 days');
    expect(by['year-pct']).toBe('2.74%');
  });

  it('reads 100% of a common year at exactly 365 days', () => {
    const by = Object.fromEntries(alternativeUnits(COMMON_YEAR_DAYS).map((r) => [r.key, r.value]));
    expect(by['year-pct']).toBe('100.00%');
  });

  it('handles zero without a stray unit or a NaN', () => {
    for (const row of alternativeUnits(0)) expect(row.value).not.toMatch(/NaN|Infinity|undefined/);
    const by = Object.fromEntries(alternativeUnits(0).map((r) => [r.key, r.value]));
    expect(by.weeks).toBe('0 days');
    expect(by['year-pct']).toBe('0.00%');
  });
});

describe('weeksAndDays', () => {
  it('drops the part that is zero rather than printing "0 weeks"', () => {
    expect(weeksAndDays(0)).toBe('0 days');
    expect(weeksAndDays(3)).toBe('3 days');
    expect(weeksAndDays(7)).toBe('1 week');
    expect(weeksAndDays(14)).toBe('2 weeks');
    expect(weeksAndDays(10)).toBe('1 week and 3 days');
    expect(weeksAndDays(228)).toBe('32 weeks and 4 days');
  });
});

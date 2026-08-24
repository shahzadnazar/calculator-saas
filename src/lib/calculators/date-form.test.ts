import { describe, it, expect } from 'vitest';
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
} from './date-form';

/**
 * Date binding unit tests (R18C2). Two calculator-owned structural modes on the UNCHANGED
 * standard-form runtime, wrapping the FROZEN date-duration primitives (whose full matrix stays
 * date-duration.test.ts's authority). Covers strict validation, the day-offset domain, mode-scoped
 * computation, the per-mode complete-result guards (tamper + source reconciliation),
 * description/announcement, and the DOM read/reset helpers via a mock root. No date arithmetic is
 * reimplemented here.
 */

const diffVals = (v: Partial<DateValues> = {}): DateValues => ({
  mode: 'diff',
  from: '2020-01-01',
  to: '2025-01-01',
  start: '',
  op: 'add',
  days: '',
  ...v,
});
const addVals = (v: Partial<DateValues> = {}): DateValues => ({
  mode: 'add',
  from: '',
  to: '',
  start: '2024-01-01',
  op: 'add',
  days: '90',
  ...v,
});

function mockRoot(v: Partial<Record<'mode' | 'from' | 'to' | 'start' | 'op' | 'days', string>> = {}) {
  const store: Record<string, { value: string }> = {
    mode: { value: v.mode ?? DEFAULT_MODE },
    from: { value: v.from ?? '' },
    to: { value: v.to ?? '' },
    start: { value: v.start ?? '' },
    op: { value: v.op ?? DEFAULT_OP },
    days: { value: v.days ?? '' },
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
    const noDays = validateDateValues(addVals({ days: '' }));
    if (!noDays.ok) expect(noDays.fieldErrors?.days).toBe(MSG.daysRequired);
  });

  it('rejects a malformed date and a malformed / fractional / negative day count', () => {
    const badDate = validateDateValues(addVals({ start: '2024-02-30' }));
    if (!badDate.ok) expect(badDate.fieldErrors?.start).toBe(MSG.startInvalid);
    for (const bad of ['abc', '1.5', '-3']) {
      const v = validateDateValues(addVals({ days: bad }));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.fieldErrors?.days).toBe(MSG.daysInvalid);
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
    const { root } = mockRoot({ mode: 'add', start: '2024-01-01', op: 'sub', days: '5', from: '2020-01-01', to: '2020-02-01' });
    expect(dateBinding.readValues(root)).toEqual({
      mode: 'add',
      from: '2020-01-01',
      to: '2020-02-01',
      start: '2024-01-01',
      op: 'sub',
      days: '5',
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

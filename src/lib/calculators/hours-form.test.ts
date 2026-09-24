import { describe, it, expect } from 'vitest';
import {
  hoursBinding,
  validateHours,
  computeHours,
  completeHoursValue,
  presentHours,
  describeHours,
  readHoursValues,
  resetHoursValues,
  MSG,
  type HoursFormValues,
} from './hours-form';

/**
 * Hours binding tests (R17B2). The binding wraps the UNCHANGED parseTimeToMinutes / calculateHours;
 * these pin the visitor-facing layer — required + strict time validation, a strict non-negative break (whole or decimal),
 * the complete-result guard (a NaN sentinel; NO isUsableResult), presentation and Reset. Overnight is
 * supported; a valid zero duration (equal times or a break ≥ the interval) is a finite 0.
 */

const V = (o: Partial<HoursFormValues> = {}): HoursFormValues => ({ start: '09:00', end: '17:30', breakMin: '30', ...o });
const errs = (v: HoursFormValues) => {
  const r = validateHours(v);
  return r.ok ? {} : (r.fieldErrors ?? {});
};
const value = (v: HoursFormValues) => completeHoursValue(computeHours(v));

/* ---- contract ---- */

describe('hours binding — contract', () => {
  it('exposes no isUsableResult; resultValue is the complete-result guard', () => {
    expect('isUsableResult' in hoursBinding).toBe(false);
    expect(hoursBinding.resultValue).toBe(completeHoursValue);
  });
});

/* ---- validation ---- */

describe('hours binding — validation', () => {
  it('an all-empty form requires start and end (an empty break is the neutral 0)', () => {
    expect(errs({ start: '', end: '', breakMin: '' })).toEqual({ start: MSG.startRequired, end: MSG.endRequired });
  });

  it('start and end are independently required', () => {
    expect(errs(V({ start: '' })).start).toBe(MSG.startRequired);
    expect(errs(V({ end: '' })).end).toBe(MSG.endRequired);
  });

  it('a malformed or out-of-range time is invalid', () => {
    expect(errs(V({ start: '25:00' })).start).toBe(MSG.startInvalid);
    expect(errs(V({ end: '12:60' })).end).toBe(MSG.endInvalid);
    expect(errs(V({ start: '9:5' })).start).toBe(MSG.startInvalid); // MM must be two digits
    expect(errs(V({ end: 'nonsense' })).end).toBe(MSG.endInvalid);
  });

  it('the boundary times 00:00 and 23:59 are valid', () => {
    expect(validateHours(V({ start: '00:00', end: '23:59' })).ok).toBe(true);
  });

  it('an empty break is valid (means 0); whole AND decimal breaks are valid', () => {
    expect(validateHours(V({ breakMin: '' })).ok).toBe(true);
    expect(validateHours(V({ breakMin: '45' })).ok).toBe(true);
    expect(validateHours(V({ breakMin: '0' })).ok).toBe(true);
    // the frozen source honours a decimal break — the binding must not reject it
    expect(validateHours(V({ breakMin: '30.5' })).ok).toBe(true);
    expect(validateHours(V({ breakMin: '0.5' })).ok).toBe(true);
    expect(validateHours(V({ breakMin: '.5' })).ok).toBe(true);
  });

  it('a malformed break is invalid; a negative break (whole or decimal) is rejected (not clamped)', () => {
    expect(errs(V({ breakMin: 'abc' })).breakMin).toBe(MSG.breakInvalid);
    expect(errs(V({ breakMin: '30.5.5' })).breakMin).toBe(MSG.breakInvalid);
    expect(errs(V({ breakMin: '3e2' })).breakMin).toBe(MSG.breakInvalid); // no exponent form
    expect(errs(V({ breakMin: '30min' })).breakMin).toBe(MSG.breakInvalid);
    expect(errs(V({ breakMin: '-10' })).breakMin).toBe(MSG.breakNegative);
    expect(errs(V({ breakMin: '-0.5' })).breakMin).toBe(MSG.breakNegative);
  });
});

/* ---- computation + complete-result guard ---- */

describe('hours binding — computation + guard', () => {
  it('an ordinary same-day shift minus a break returns totalMinutes (09:00–17:30, 30m → 480)', () => {
    const c = computeHours(V());
    expect(c.result).toEqual({ totalMinutes: 480, hours: 8, minutes: 0, decimalHours: 8 });
    expect(completeHoursValue(c)).toBe(480);
  });

  it('an overnight shift is supported (22:00–06:00 → 480)', () => {
    const c = computeHours(V({ start: '22:00', end: '06:00', breakMin: '0' }));
    expect(c.overnight).toBe(true);
    expect(c.result.totalMinutes).toBe(480);
    expect(completeHoursValue(c)).toBe(480);
  });

  it('equal start/end is a valid ZERO duration (a finite 0 the gate accepts)', () => {
    const c = computeHours(V({ start: '09:00', end: '09:00', breakMin: '' }));
    expect(c.span).toBe(0);
    expect(c.result.totalMinutes).toBe(0);
    expect(completeHoursValue(c)).toBe(0);
    expect(Number.isFinite(completeHoursValue(c))).toBe(true);
  });

  it('a zero break leaves the elapsed time; an ordinary break is subtracted', () => {
    expect(value(V({ start: '09:00', end: '17:00', breakMin: '0' }))).toBe(480);
    expect(value(V({ start: '09:00', end: '17:00', breakMin: '60' }))).toBe(420);
  });

  it('a break equal to or longer than the interval clamps to a valid 0', () => {
    expect(value(V({ start: '09:00', end: '17:00', breakMin: '480' }))).toBe(0);
    expect(value(V({ start: '09:00', end: '17:00', breakMin: '600' }))).toBe(0);
  });

  it('reports fractional hours (09:00–09:45 → 45m, 0.75 decimal)', () => {
    const c = computeHours(V({ start: '09:00', end: '09:45', breakMin: '0' }));
    expect(c.result).toEqual({ totalMinutes: 45, hours: 0, minutes: 45, decimalHours: 0.75 });
    expect(completeHoursValue(c)).toBe(45);
  });

  it('a DECIMAL break yields a valid fractional result (09:00–17:00 minus 30.5m → 449.5 total, 7h 29.5m, 7.49)', () => {
    const c = computeHours(V({ start: '09:00', end: '17:00', breakMin: '30.5' }));
    expect(c.result).toEqual({ totalMinutes: 449.5, hours: 7, minutes: 29.5, decimalHours: 7.49 });
    expect(completeHoursValue(c)).toBe(449.5);
    expect(Number.isFinite(completeHoursValue(c))).toBe(true);
  });

  it('a small decimal break is honoured (0.5m off a whole hour → 59.5 remaining minutes)', () => {
    const c = computeHours(V({ start: '09:00', end: '10:00', breakMin: '0.5' }));
    expect(c.result.totalMinutes).toBe(59.5);
    expect(c.result.minutes).toBe(59.5);
    expect(completeHoursValue(c)).toBe(59.5);
  });

  it('a decimal break at least as long as the interval is still a valid zero', () => {
    expect(value(V({ start: '09:00', end: '17:00', breakMin: '480.5' }))).toBe(0);
  });

  it('the guard rejects a malformed-input path (invalid time / malformed / negative break → NaN)', () => {
    expect(Number.isNaN(value(V({ start: '99:99' })))).toBe(true);
    expect(Number.isNaN(value(V({ breakMin: 'abc' })))).toBe(true);
    expect(Number.isNaN(value(V({ breakMin: '-10' })))).toBe(true);
  });

  it('the guard rejects a tampered result (mismatched decomposition, out-of-range minute, bad decimal, bad recompute)', () => {
    const good = computeHours(V());
    // hours*60 + minutes must reconcile with totalMinutes (beyond the FP tolerance)
    expect(Number.isNaN(completeHoursValue({ ...good, result: { ...good.result, minutes: 29.5, totalMinutes: 449.5 } }))).toBe(true);
    expect(Number.isNaN(completeHoursValue({ ...good, result: { ...good.result, hours: 7 } }))).toBe(true);
    // a minute component of 60 or more is out of range even for a decimal
    expect(Number.isNaN(completeHoursValue({ ...good, result: { totalMinutes: 480, hours: 7, minutes: 60, decimalHours: 8 } }))).toBe(true);
    // decimalHours must reconcile with totalMinutes/60
    expect(Number.isNaN(completeHoursValue({ ...good, result: { ...good.result, decimalHours: 9.99 } }))).toBe(true);
    // a self-consistent result that does not reconcile with a recompute of the inputs
    expect(Number.isNaN(completeHoursValue({ ...good, result: { totalMinutes: 120, hours: 2, minutes: 0, decimalHours: 2 } }))).toBe(true);
  });
});

/* ---- presentation ---- */

describe('hours binding — presentation + announcement', () => {
  it('an ordinary result: compact primary + spoken a11y + decimal + interpretation', () => {
    const p = presentHours(computeHours(V()));
    expect(p.primary).toBe('8h 0m');
    expect(p.a11y).toBe('8 hours');
    expect(p.decimal).toBe('8');
    expect(p.interpretation).toBe('9:00 AM to 5:30 PM, minus a 30-minute break.');
  });

  it('an overnight result notes the midnight crossing', () => {
    const p = presentHours(computeHours(V({ start: '22:00', end: '06:00', breakMin: '0' })));
    expect(p.primary).toBe('8h 0m');
    expect(p.interpretation).toBe('10:00 PM to 6:00 AM, crossing midnight.');
  });

  it('a fractional result formats hours + minutes + decimal (8h 15m, 8.25)', () => {
    const p = presentHours(computeHours(V({ start: '09:00', end: '17:15', breakMin: '0' })));
    expect(p.primary).toBe('8h 15m');
    expect(p.a11y).toBe('8 hours 15 minutes');
    expect(p.decimal).toBe('8.25');
  });

  it('a DECIMAL-break result shows fractional minutes without truncation (7h 29.5m, 7.49)', () => {
    const p = presentHours(computeHours(V({ start: '09:00', end: '17:00', breakMin: '30.5' })));
    expect(p.primary).toBe('7h 29.5m');
    expect(p.a11y).toBe('7 hours 29.5 minutes');
    expect(p.decimal).toBe('7.49');
    expect(p.interpretation).toBe('9:00 AM to 5:00 PM, minus a 30.5-minute break.');
  });

  it('a zero result from equal times, and from a break covering the interval, explain themselves', () => {
    expect(presentHours(computeHours(V({ start: '09:00', end: '09:00', breakMin: '' }))).interpretation).toContain('same');
    expect(presentHours(computeHours(V({ start: '09:00', end: '17:00', breakMin: '600' }))).interpretation).toContain('at least as long');
  });

  it('announces the total in words', () => {
    expect(describeHours(computeHours(V()))).toBe('Total time: 8 hours.');
    expect(describeHours(computeHours(V({ start: '09:00', end: '17:15', breakMin: '0' })))).toBe('Total time: 8 hours 15 minutes.');
    expect(describeHours(computeHours(V({ start: '09:00', end: '09:00', breakMin: '' })))).toBe('Total time: 0 hours.');
    // a decimal break announces the fractional minutes
    expect(describeHours(computeHours(V({ start: '09:00', end: '17:00', breakMin: '30.5' })))).toBe('Total time: 7 hours 29.5 minutes.');
  });
});

/* ---- readValues / resetValues (mock DOM) ---- */

function mockRoot(values: Record<string, string>): HTMLElement {
  const store: Record<string, { value: string }> = {};
  for (const [k, v] of Object.entries(values)) store[k] = { value: v };
  return {
    querySelector(sel: string) {
      const m = sel.match(/\[name="([^"]+)"\]/);
      return m ? (store[m[1]] ?? null) : null;
    },
  } as unknown as HTMLElement;
}

describe('hours binding — readValues / resetValues', () => {
  it('reads the two times and the break', () => {
    const root = mockRoot({ start: '08:00', end: '16:30', breakMin: '45' });
    expect(readHoursValues(root)).toEqual({ start: '08:00', end: '16:30', breakMin: '45' });
  });

  it('reset clears both times and the break (empty = neutral no-break)', () => {
    const root = mockRoot({ start: '08:00', end: '16:30', breakMin: '45' });
    resetHoursValues(root, 'all');
    expect(readHoursValues(root)).toEqual({ start: '', end: '', breakMin: '' });
  });
});

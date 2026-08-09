import { describe, it, expect } from 'vitest';
import {
  timeBinding,
  validateTime,
  computeTime,
  completeTimeValue,
  presentTime,
  describeTime,
  readTimeValues,
  resetTimeValues,
  MSG,
  type TimeFormValues,
} from './time-form';

/**
 * Time binding tests (R17B3). The binding wraps the UNCHANGED toSeconds / combineDurations /
 * breakdownDuration; these pin the visitor-facing layer — required + strict whole non-negative
 * components, the SIGNED complete-result guard (a signed finite sentinel; NO isUsableResult), the
 * signed presentation and Reset. A subtraction may be negative; equal operands are an exact zero.
 */

const V = (o: Partial<TimeFormValues> = {}): TimeFormValues => ({
  op: 'add',
  a_days: '', a_hours: '', a_minutes: '', a_seconds: '',
  b_days: '', b_hours: '', b_minutes: '', b_seconds: '',
  ...o,
});
const errs = (v: TimeFormValues) => {
  const r = validateTime(v);
  return r.ok ? {} : (r.fieldErrors ?? {});
};
const formError = (v: TimeFormValues) => {
  const r = validateTime(v);
  return r.ok ? undefined : r.formError;
};
const value = (v: TimeFormValues) => completeTimeValue(computeTime(v));

/* ---- contract ---- */

describe('time binding — contract', () => {
  it('exposes no isUsableResult; resultValue is the complete-result guard', () => {
    expect('isUsableResult' in timeBinding).toBe(false);
    expect(timeBinding.resultValue).toBe(completeTimeValue);
  });
});

/* ---- validation ---- */

describe('time binding — validation', () => {
  it('an all-empty form is a form-level "enter a duration" error (no field errors)', () => {
    const r = validateTime(V());
    expect(r.ok).toBe(false);
    expect(formError(V())).toBe(MSG.required);
    expect(errs(V())).toEqual({});
  });

  it('a partial operand is valid — empty components are the neutral 0', () => {
    expect(validateTime(V({ a_hours: '2' })).ok).toBe(true);
    expect(validateTime(V({ a_minutes: '30', b_minutes: '15' })).ok).toBe(true);
  });

  it('an explicit-zero entry is valid (a typed 0 is "present")', () => {
    expect(validateTime(V({ a_seconds: '0' })).ok).toBe(true);
  });

  it('a decimal or malformed component is a whole-number error on that field', () => {
    expect(errs(V({ a_hours: '2.5' })).a_hours).toBe(MSG.componentWhole);
    expect(errs(V({ a_minutes: 'abc' })).a_minutes).toBe(MSG.componentWhole);
    expect(errs(V({ b_seconds: '0.5' })).b_seconds).toBe(MSG.componentWhole);
    expect(errs(V({ a_days: 'Infinity' })).a_days).toBe(MSG.componentWhole);
    expect(errs(V({ b_hours: '1e2' })).b_hours).toBe(MSG.componentWhole);
  });

  it('a negative component is rejected on that field (the sign is the operation)', () => {
    expect(errs(V({ a_hours: '-1' })).a_hours).toBe(MSG.componentNegative);
    expect(errs(V({ b_minutes: '-30' })).b_minutes).toBe(MSG.componentNegative);
  });

  it('an oversized component is VALID (the source normalizes it)', () => {
    expect(validateTime(V({ a_minutes: '90' })).ok).toBe(true);
    expect(validateTime(V({ a_seconds: '3661' })).ok).toBe(true);
    expect(validateTime(V({ a_hours: '100' })).ok).toBe(true);
  });

  it('an unsupported operation is a form-level error', () => {
    expect(formError(V({ op: 'multiply', a_hours: '1' }))).toBe(MSG.opInvalid);
  });
});

/* ---- computation + guard ---- */

describe('time binding — computation + guard', () => {
  it('adds two durations (2h30m + 1h45m → 4h15m, 15300s)', () => {
    const c = computeTime(V({ a_hours: '2', a_minutes: '30', b_hours: '1', b_minutes: '45' }));
    expect(c.result).toMatchObject({ days: 0, hours: 4, minutes: 15, seconds: 0, negative: false });
    expect(c.totalSeconds).toBe(15300);
    expect(completeTimeValue(c)).toBe(15300);
  });

  it('subtracts to a positive difference (2h30m − 1h45m → 45m, 2700s)', () => {
    const c = computeTime(V({ op: 'subtract', a_hours: '2', a_minutes: '30', b_hours: '1', b_minutes: '45' }));
    expect(c.result).toMatchObject({ hours: 0, minutes: 45, seconds: 0, negative: false });
    expect(completeTimeValue(c)).toBe(2700);
  });

  it('equal operands subtract to an exact zero (a finite 0 the gate accepts)', () => {
    const c = computeTime(V({ op: 'subtract', a_hours: '1', b_hours: '1' }));
    expect(c.totalSeconds).toBe(0);
    expect(c.result).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 0, negative: false });
    expect(completeTimeValue(c)).toBe(0);
    expect(Number.isFinite(completeTimeValue(c))).toBe(true);
  });

  it('subtracts to a NEGATIVE result (1m − 2m30s → −1m30s, −90s finite)', () => {
    const c = computeTime(V({ op: 'subtract', a_minutes: '1', b_minutes: '2', b_seconds: '30' }));
    expect(c.result).toMatchObject({ minutes: 1, seconds: 30, negative: true });
    expect(c.totalSeconds).toBe(-90);
    expect(completeTimeValue(c)).toBe(-90); // finite negative → passes the default gate
    expect(Number.isFinite(completeTimeValue(c))).toBe(true);
  });

  it('carries oversized components (90m + 90m → 3h)', () => {
    expect(value(V({ a_minutes: '90', b_minutes: '90' }))).toBe(10800);
    const c = computeTime(V({ a_minutes: '90', b_minutes: '90' }));
    expect(c.result).toMatchObject({ hours: 3, minutes: 0, seconds: 0 });
  });

  it('borrows across units (1d − 1s → 23h 59m 59s)', () => {
    const c = computeTime(V({ op: 'subtract', a_days: '1', b_seconds: '1' }));
    expect(c.result).toMatchObject({ days: 0, hours: 23, minutes: 59, seconds: 59, negative: false });
    expect(completeTimeValue(c)).toBe(86399);
  });

  it('the guard rejects malformed / negative / all-empty inputs (→ NaN)', () => {
    expect(Number.isNaN(value(V({ a_hours: '2.5', a_minutes: '30' })))).toBe(true);
    expect(Number.isNaN(value(V({ a_hours: '-1', a_minutes: '30' })))).toBe(true);
    expect(Number.isNaN(value(V()))).toBe(true); // all-empty → not present
  });

  it('the guard rejects a tampered result (decomposition, sign, out-of-range, negative-zero, recompute)', () => {
    const good = computeTime(V({ a_hours: '2', a_minutes: '30', b_hours: '1', b_minutes: '45' })); // 15300
    // decomposition must reconcile with totalSeconds
    expect(Number.isNaN(completeTimeValue({ ...good, result: { ...good.result, minutes: 14 } }))).toBe(true);
    // a sign flip makes the signed decomposition disagree with totalSeconds
    expect(Number.isNaN(completeTimeValue({ ...good, result: { ...good.result, negative: true } }))).toBe(true);
    // a component out of its normalized range
    expect(Number.isNaN(completeTimeValue({ ...good, result: { days: 0, hours: 4, minutes: 75, seconds: 0, negative: false } }))).toBe(true);
    // no negative-zero presentation leak
    const zero = computeTime(V({ op: 'subtract', a_hours: '1', b_hours: '1' }));
    expect(Number.isNaN(completeTimeValue({ ...zero, result: { days: 0, hours: 0, minutes: 0, seconds: 0, negative: true } }))).toBe(true);
    // a result that does not reconcile with a recompute of the inputs
    expect(Number.isNaN(completeTimeValue({ ...good, totalSeconds: 120, result: { days: 0, hours: 0, minutes: 2, seconds: 0, negative: false } }))).toBe(true);
  });
});

/* ---- presentation ---- */

describe('time binding — presentation + announcement', () => {
  it('an ordinary Add: compact primary + spoken a11y + formatted total + interpretation', () => {
    const p = presentTime(computeTime(V({ a_hours: '2', a_minutes: '30', b_hours: '1', b_minutes: '45' })));
    expect(p.primary).toBe('4h 15m 0s');
    expect(p.a11y).toBe('4 hours, 15 minutes');
    expect(p.totalSeconds).toBe('15,300');
    expect(p.interpretation).toBe('The two durations were added together.');
  });

  it('a Subtract to a positive difference', () => {
    const p = presentTime(computeTime(V({ op: 'subtract', a_hours: '2', a_minutes: '30', b_hours: '1', b_minutes: '45' })));
    expect(p.primary).toBe('45m 0s');
    expect(p.interpretation).toBe('The second duration was subtracted from the first.');
  });

  it('a NEGATIVE result is signed everywhere (primary, spoken, total, interpretation)', () => {
    const p = presentTime(computeTime(V({ op: 'subtract', a_minutes: '1', b_minutes: '2', b_seconds: '30' })));
    expect(p.primary).toBe('−1m 30s');
    expect(p.a11y).toBe('minus 1 minute, 30 seconds');
    expect(p.totalSeconds).toBe('−90');
    expect(p.interpretation).toContain('negative because the second duration is longer');
  });

  it('a zero result reads "0s" and explains equality', () => {
    const p = presentTime(computeTime(V({ op: 'subtract', a_hours: '1', b_hours: '1' })));
    expect(p.primary).toBe('0s');
    expect(p.a11y).toBe('0 seconds');
    expect(p.totalSeconds).toBe('0');
    expect(p.interpretation).toContain('equal');
  });

  it('a multi-day result shows days through seconds', () => {
    const p = presentTime(computeTime(V({ a_days: '1', a_hours: '2' })));
    expect(p.primary).toBe('1d 2h 0m 0s');
  });

  it('announces the calculated time in words (positive, negative, zero)', () => {
    expect(describeTime(computeTime(V({ a_hours: '2', a_minutes: '30', b_hours: '1', b_minutes: '45' })))).toBe('Calculated time: 4 hours, 15 minutes.');
    expect(describeTime(computeTime(V({ op: 'subtract', a_minutes: '1', b_minutes: '2', b_seconds: '30' })))).toBe('Calculated time: minus 1 minute, 30 seconds.');
    expect(describeTime(computeTime(V({ op: 'subtract', a_hours: '1', b_hours: '1' })))).toBe('Calculated time: 0 seconds.');
  });
});

/* ---- readValues / resetValues (mock DOM) ---- */

function mockRoot(op: string, values: Record<string, string>): HTMLElement {
  const store: Record<string, { value: string }> = {};
  for (const [k, v] of Object.entries(values)) store[k] = { value: v };
  return {
    querySelector(sel: string) {
      if (sel === '[name="tc_op"]:checked') return { value: op };
      const m = sel.match(/\[name="([^"]+)"\]/);
      return m ? (store[m[1]] ?? null) : null;
    },
  } as unknown as HTMLElement;
}

describe('time binding — readValues / resetValues', () => {
  it('reads the operation and every component', () => {
    const root = mockRoot('subtract', { a_days: '1', a_hours: '2', a_minutes: '3', a_seconds: '4', b_days: '0', b_hours: '5', b_minutes: '6', b_seconds: '7' });
    expect(readTimeValues(root)).toEqual({
      op: 'subtract',
      a_days: '1', a_hours: '2', a_minutes: '3', a_seconds: '4',
      b_days: '0', b_hours: '5', b_minutes: '6', b_seconds: '7',
    });
  });

  it('reset clears every component and restores Add', () => {
    const comps: Record<string, { value: string }> = {};
    for (const n of ['a_days', 'a_hours', 'a_minutes', 'a_seconds', 'b_days', 'b_hours', 'b_minutes', 'b_seconds']) comps[n] = { value: '9' };
    const add = { checked: false };
    const sub = { checked: true };
    const root = {
      querySelector(sel: string) {
        const m = sel.match(/\[name="([^"]+)"\]/);
        if (m && comps[m[1]]) return comps[m[1]];
        if (sel.includes('value="add"')) return add;
        if (sel.includes('value="subtract"')) return sub;
        return null;
      },
    } as unknown as HTMLElement;

    resetTimeValues(root, 'all');
    for (const n of Object.keys(comps)) expect(comps[n].value).toBe('');
    expect(add.checked).toBe(true);
    expect(sub.checked).toBe(false);
  });
});

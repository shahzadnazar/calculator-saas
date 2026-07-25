import { describe, it, expect } from 'vitest';
import {
  validateTipValues,
  computeTip,
  describeTipResult,
  interpretTip,
  peoplePhrase,
  spokenUSD,
  tipBinding,
  type TipValues,
} from './tip-form';
import { calculateTip } from './tip';

const vals = (over: Partial<TipValues> = {}): TipValues => ({
  bill: '50',
  tipPct: '20',
  people: '2',
  ...over,
});

const errs = (r: ReturnType<typeof validateTipValues>) => (r as { fieldErrors: Record<string, string> }).fieldErrors;

/** Minimal DOM-free root stub so readValues / resetValues are unit-testable under node. */
function stubRoot(v: Record<string, string>) {
  const inputs: Record<string, { value: string }> = {};
  for (const [k, val] of Object.entries(v)) inputs[k] = { value: val };
  return {
    querySelector(sel: string) {
      const m = sel.match(/\[name="(.+?)"\]/);
      return m ? (inputs[m[1]] ?? null) : null;
    },
  } as unknown as HTMLElement;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('tip-form — validation', () => {
  it('accepts a valid ordinary calculation', () => {
    expect(validateTipValues(vals())).toEqual({ ok: true });
  });

  it('all fields empty → three required errors', () => {
    const e = errs(validateTipValues({ bill: '', tipPct: '', people: '' }));
    expect(e.bill).toBe('Enter a bill amount.');
    expect(e.tipPct).toBe('Enter a tip percentage.');
    expect(e.people).toBe('Enter the number of people.');
  });

  it('bill: required, 0 valid, negative and non-finite invalid', () => {
    expect(errs(validateTipValues(vals({ bill: '' }))).bill).toBe('Enter a bill amount.');
    expect(validateTipValues(vals({ bill: '0' }))).toEqual({ ok: true });
    expect(errs(validateTipValues(vals({ bill: '-5' }))).bill).toBe('Enter a bill amount of zero or more.');
    expect(errs(validateTipValues(vals({ bill: 'abc' }))).bill).toBe('Enter a bill amount of zero or more.');
  });

  it('tip percentage: required, 0 valid, negative and non-finite invalid, no maximum', () => {
    expect(errs(validateTipValues(vals({ tipPct: '' }))).tipPct).toBe('Enter a tip percentage.');
    expect(validateTipValues(vals({ tipPct: '0' }))).toEqual({ ok: true });
    expect(validateTipValues(vals({ tipPct: '100' }))).toEqual({ ok: true }); // no arbitrary max
    expect(errs(validateTipValues(vals({ tipPct: '-20' }))).tipPct).toBe('Enter a tip percentage of zero or more.');
    expect(errs(validateTipValues(vals({ tipPct: 'Infinity' }))).tipPct).toBe('Enter a tip percentage of zero or more.');
  });

  it('people: required whole number >= 1 — 0 / fractional / negative / non-finite rejected', () => {
    expect(errs(validateTipValues(vals({ people: '' }))).people).toBe('Enter the number of people.');
    expect(validateTipValues(vals({ people: '1' }))).toEqual({ ok: true });
    expect(errs(validateTipValues(vals({ people: '0' }))).people).toBe('Enter a whole number of at least 1.');
    expect(errs(validateTipValues(vals({ people: '2.5' }))).people).toBe('Enter a whole number of at least 1.');
    expect(errs(validateTipValues(vals({ people: '-3' }))).people).toBe('Enter a whole number of at least 1.');
    expect(errs(validateTipValues(vals({ people: 'NaN' }))).people).toBe('Enter a whole number of at least 1.');
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('tip-form — compute', () => {
  it('valid ordinary calculation carries all four outputs + the normalized people count', () => {
    expect(computeTip(vals())).toEqual({ tipAmount: 10, total: 60, perPersonTip: 5, perPersonTotal: 30, people: 2 });
  });

  it('a decimal bill keeps full precision', () => {
    const r = computeTip(vals({ bill: '85.75', tipPct: '18', people: '3' }));
    expect(r.tipAmount).toBeCloseTo(15.435, 10);
    expect(r.perPersonTotal).toBeCloseTo(33.728333, 5);
  });

  it('a decimal tip percentage', () => {
    expect(computeTip(vals({ bill: '100', tipPct: '15.5', people: '4' }))).toMatchObject({ tipAmount: 15.5, perPersonTotal: 28.875 });
  });

  it('people = 1 is the whole bill plus tip', () => {
    expect(computeTip(vals({ bill: '50', tipPct: '18', people: '1' }))).toMatchObject({ total: 59, perPersonTotal: 59 });
  });

  it('preserves the pure formula output exactly (delegation, no re-implementation)', () => {
    for (const c of [vals(), vals({ bill: '85.75', tipPct: '18', people: '3' }), vals({ bill: '250.5', tipPct: '22', people: '6' })]) {
      const r = computeTip(c);
      const pure = calculateTip({ bill: Number(c.bill), tipPct: Number(c.tipPct), people: Number(c.people) });
      expect(r.tipAmount).toBe(pure.tipAmount);
      expect(r.total).toBe(pure.total);
      expect(r.perPersonTip).toBe(pure.perPersonTip);
      expect(r.perPersonTotal).toBe(pure.perPersonTotal);
    }
  });

  it('bill = 0 → all outputs 0 (valid)', () => {
    expect(computeTip(vals({ bill: '0' }))).toMatchObject({ tipAmount: 0, total: 0, perPersonTip: 0, perPersonTotal: 0 });
  });

  it('tip rate = 0 → no tip, total = bill split evenly (valid)', () => {
    expect(computeTip(vals({ tipPct: '0' }))).toMatchObject({ tipAmount: 0, total: 50, perPersonTotal: 25 });
  });

  it('reconciliation holds and outputs are finite, >= 0 across the validated domain', () => {
    for (const c of [vals({ bill: '0', tipPct: '0', people: '1' }), vals(), vals({ bill: '250.5', tipPct: '22', people: '6' })]) {
      const r = computeTip(c);
      expect(r.total).toBeCloseTo(Number(c.bill) + r.tipAmount, 9);
      expect(r.perPersonTotal).toBeCloseTo(r.total / r.people, 9);
      expect(r.perPersonTip).toBeCloseTo(r.tipAmount / r.people, 9);
      for (const v of [r.tipAmount, r.total, r.perPersonTip, r.perPersonTotal]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Guarded magnitude (default finite gate; no isUsableResult)          */
/* ------------------------------------------------------------------ */

describe('tip-form — resultValue + gate', () => {
  it('the guarded magnitude is the DOMINANT total per person', () => {
    expect(tipBinding.resultValue({ tipAmount: 10, total: 60, perPersonTip: 5, perPersonTotal: 30, people: 2 })).toBe(30);
    expect(tipBinding.resultValue({ tipAmount: 0, total: 0, perPersonTip: 0, perPersonTotal: 0, people: 2 })).toBe(0);
  });

  it('does not implement isUsableResult (no non-finite outcome in the validated domain)', () => {
    expect(tipBinding.isUsableResult).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('tip-form — announcement + interpretation', () => {
  it('announces the dominant total per person only, in USD (plural people)', () => {
    expect(describeTipResult({ tipAmount: 10, total: 60, perPersonTip: 5, perPersonTotal: 29.5, people: 2 })).toBe(
      'Each person pays 29 dollars and 50 cents.',
    );
  });

  it('announces "the total per person" for a single diner', () => {
    expect(describeTipResult({ tipAmount: 9, total: 59, perPersonTip: 9, perPersonTotal: 59, people: 1 })).toBe(
      'The total per person is 59 dollars.',
    );
  });

  it('single-person interpretation states the total including tip', () => {
    expect(interpretTip({ tipAmount: 9, total: 59, perPersonTip: 9, perPersonTotal: 59, people: 1 })).toBe(
      'The total including tip is $59.00.',
    );
  });

  it('multi-person interpretation states the split and per-person amount', () => {
    expect(interpretTip({ tipAmount: 10, total: 60, perPersonTip: 5, perPersonTotal: 29.5, people: 2 })).toBe(
      'Split between 2 people, each person pays $29.50.',
    );
  });

  it('zero-bill interpretation explains the $0 total (valid, not invalid)', () => {
    const s = interpretTip({ tipAmount: 0, total: 0, perPersonTip: 0, perPersonTotal: 0, people: 3 });
    expect(s).toContain('$0 bill');
    expect(s).toContain('$0.00');
  });

  it('zero-tip result uses the normal split interpretation (total = bill / people)', () => {
    expect(interpretTip({ tipAmount: 0, total: 50, perPersonTip: 0, perPersonTotal: 25, people: 2 })).toBe(
      'Split between 2 people, each person pays $25.00.',
    );
  });

  it('peoplePhrase is singular only for exactly one person', () => {
    expect(peoplePhrase(1)).toBe('1 person');
    expect(peoplePhrase(2)).toBe('2 people');
  });

  it('spokenUSD reads dollars and cents with correct singular/plural', () => {
    expect(spokenUSD(59)).toBe('59 dollars');
    expect(spokenUSD(29.5)).toBe('29 dollars and 50 cents');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(0)).toBe('0 dollars');
  });
});

/* ------------------------------------------------------------------ */
/* readValues + resetValues (DOM-free stub)                            */
/* ------------------------------------------------------------------ */

describe('tip-form — readValues / resetValues', () => {
  it('reads the three named fields', () => {
    const root = stubRoot({ bill: '50', tipPct: '20', people: '2' });
    expect(tipBinding.readValues(root)).toEqual({ bill: '50', tipPct: '20', people: '2' });
  });

  it('reset clears bill + tip percentage and RESTORES people to 1', () => {
    const root = stubRoot({ bill: '50', tipPct: '20', people: '4' });
    tipBinding.resetValues(root, 'personal');
    expect(tipBinding.readValues(root)).toEqual({ bill: '', tipPct: '', people: '1' });
  });
});

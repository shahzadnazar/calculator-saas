import { describe, it, expect } from 'vitest';
import {
  validatePercentOf,
  validateWhatPercent,
  validatePercentChange,
  describeAmount,
  describePercentage,
  describePercentChange,
  changeDirection,
  percentOfBinding,
  whatPercentBinding,
  percentChangeBinding,
  percentOfWhatBinding,
  percentDifferenceBinding,
  applyChangeBinding,
  validatePercentOfWhat,
  validatePercentDifference,
  validateApplyChange,
  percentExamples,
  PERCENT_EXAMPLES,
} from './percent-form';
import { percentOf, whatPercent, percentChange } from './percent';

/**
 * Percentage equation bindings. The numeric core (percentOf/whatPercent/
 * percentChange) is tested in percent.test.ts; here we pin the form-facing
 * behaviour: explicit presence/finiteness validation (no `Number(v) || 0`),
 * the zero-denominator / zero-start guards, preserved negative semantics, and
 * the accessible result descriptions.
 */

/* ---- Validation --------------------------------------------------------- */

describe('validatePercentOf ("What is X% of Y?")', () => {
  it('accepts finite X and Y, including zero and negatives', () => {
    expect(validatePercentOf({ percent: '15', value: '200' })).toEqual({ ok: true });
    expect(validatePercentOf({ percent: '0', value: '200' })).toEqual({ ok: true });
    expect(validatePercentOf({ percent: '-5', value: '200' })).toEqual({ ok: true });
  });
  it('flags empty or non-finite operands', () => {
    expect(validatePercentOf({ percent: '', value: '200' })).toMatchObject({
      fieldErrors: { percent: 'Enter the percentage.' },
    });
    expect(validatePercentOf({ percent: '15', value: '' })).toMatchObject({
      fieldErrors: { value: 'Enter the value.' },
    });
    expect(validatePercentOf({ percent: 'abc', value: '200' })).toMatchObject({
      fieldErrors: { percent: 'Enter the percentage.' },
    });
  });
});

describe('validateWhatPercent ("X is what % of Y?")', () => {
  it('accepts finite X and non-zero Y', () => {
    expect(validateWhatPercent({ part: '50', whole: '200' })).toEqual({ ok: true });
    expect(validateWhatPercent({ part: '0', whole: '200' })).toEqual({ ok: true });
  });
  it('rejects a zero total (denominator)', () => {
    expect(validateWhatPercent({ part: '50', whole: '0' })).toMatchObject({
      fieldErrors: { whole: 'The total value must not be zero.' },
    });
  });
  it('flags empty operands with distinct messages', () => {
    expect(validateWhatPercent({ part: '', whole: '200' })).toMatchObject({
      fieldErrors: { part: 'Enter the value.' },
    });
    expect(validateWhatPercent({ part: '50', whole: '' })).toMatchObject({
      fieldErrors: { whole: 'Enter the total value.' },
    });
  });
});

describe('validatePercentChange ("Change from X to Y?") — R3.1: positive start', () => {
  it('accepts a positive start with any finite new value (zero or negative Y OK)', () => {
    expect(validatePercentChange({ from: '100', to: '150' })).toEqual({ ok: true });
    expect(validatePercentChange({ from: '100', to: '0' })).toEqual({ ok: true });
    expect(validatePercentChange({ from: '100', to: '-50' })).toEqual({ ok: true });
  });
  it('rejects a zero or negative starting value (would invert apparent direction)', () => {
    for (const from of ['0', '-100', '-0.5']) {
      expect(validatePercentChange({ from, to: '100' })).toMatchObject({
        fieldErrors: { from: 'Enter a starting value greater than zero.' },
      });
    }
  });
  it('flags empty / non-finite operands with distinct messages', () => {
    expect(validatePercentChange({ from: '', to: '100' })).toMatchObject({
      fieldErrors: { from: 'Enter the starting value.' },
    });
    expect(validatePercentChange({ from: '100', to: '' })).toMatchObject({
      fieldErrors: { to: 'Enter the ending value.' },
    });
  });
});

/* ---- Compute (through the bindings) ------------------------------------- */

describe('binding.compute', () => {
  it('computes a percentage of a value, with decimals, negatives and large values', () => {
    expect(percentOfBinding.compute({ percent: '15', value: '200' })).toBe(30);
    expect(percentOfBinding.compute({ percent: '12.5', value: '80' })).toBe(10);
    expect(percentOfBinding.compute({ percent: '-10', value: '200' })).toBe(-20);
    expect(percentOfBinding.compute({ percent: '50', value: '1000000' })).toBe(500000);
  });
  it('computes what percentage one number is of another', () => {
    expect(whatPercentBinding.compute({ part: '50', whole: '200' })).toBe(25);
    expect(whatPercentBinding.compute({ part: '1', whole: '3' })).toBeCloseTo(33.333, 2);
  });
  it('computes percentage change with a direction derived from the operands', () => {
    // R3.1 cases — direction from comparing new vs start, not the percent sign.
    expect(percentChangeBinding.compute({ from: '100', to: '150' })).toEqual({ percent: 50, direction: 'increase' });
    expect(percentChangeBinding.compute({ from: '100', to: '50' })).toEqual({ percent: -50, direction: 'decrease' });
    expect(percentChangeBinding.compute({ from: '100', to: '100' })).toEqual({ percent: 0, direction: 'no change' });
    expect(percentChangeBinding.compute({ from: '100', to: '-50' })).toEqual({ percent: -150, direction: 'decrease' });
  });
  it('exposes the primary value for the non-finite guard', () => {
    expect(percentOfBinding.resultValue(30)).toBe(30);
    expect(percentChangeBinding.resultValue({ percent: -20, direction: 'decrease' })).toBe(-20);
  });
});

/* ---- Accessible descriptions -------------------------------------------- */

describe('descriptions', () => {
  it('describes an amount as a bare number', () => {
    expect(describeAmount(30)).toBe('30');
    expect(describeAmount(33.333)).toBe('33.33');
  });
  it('describes a percentage with the spoken unit', () => {
    expect(describePercentage(25)).toBe('25 percent');
  });
  it('describes a change with direction as words, not symbols', () => {
    expect(describePercentChange({ percent: 25, direction: 'increase' })).toBe('25 percent increase');
    expect(describePercentChange({ percent: -20, direction: 'decrease' })).toBe('20 percent decrease');
    expect(describePercentChange({ percent: -150, direction: 'decrease' })).toBe('150 percent decrease');
    expect(describePercentChange({ percent: 0, direction: 'no change' })).toBe('No change');
  });
  it('derives direction from comparing the new value with the start', () => {
    expect(changeDirection(100, 150)).toBe('increase');
    expect(changeDirection(100, 50)).toBe('decrease');
    expect(changeDirection(100, 100)).toBe('no change');
    expect(changeDirection(100, -50)).toBe('decrease'); // new < start → decrease
  });
});

/* ------------------------------------------------------------------ */
/* Worked examples (the labelled Example result state, per equation)   */
/* ------------------------------------------------------------------ */

describe('percentExamples — the labelled Example each equation shows on first load', () => {
  it('pins the three published scenarios', () => {
    expect(PERCENT_EXAMPLES).toEqual({
      percentOf: { percent: 15, value: 200 },
      whatPercent: { part: 50, whole: 200 },
      percentChange: { from: 80, to: 100 },
    });
  });

  it('derives every figure from the reviewed engines, never from hand-written copy', () => {
    const ex = percentExamples();
    expect(ex.percentOf.amount).toBe(describeAmount(percentOf(15, 200)));
    expect(ex.whatPercent.percentage).toBe(describeAmount(whatPercent(50, 200)));
    expect(ex.percentChange.magnitude).toBe(describeAmount(Math.abs(percentChange(80, 100))));
  });

  it('echoes its own operands so each example can state the question it answers', () => {
    const ex = percentExamples();
    expect([ex.percentOf.percent, ex.percentOf.value]).toEqual([15, 200]);
    expect([ex.whatPercent.part, ex.whatPercent.whole]).toEqual([50, 200]);
    expect([ex.percentChange.from, ex.percentChange.to]).toEqual([80, 100]);
  });

  it('reports the change direction with the same token the valid region uses', () => {
    const ex = percentExamples();
    expect(ex.percentChange.direction).toBe('increase');
    expect(ex.percentChange.directionToken).toBe('increase');
  });

  it('renders realistic finite figures (never NaN / Infinity)', () => {
    const ex = percentExamples();
    for (const text of [ex.percentOf.amount, ex.whatPercent.percentage, ex.percentChange.magnitude]) {
      expect(text).not.toMatch(/NaN|Infinity/);
    }
    expect(ex.percentOf.amount).toBe('30');
    expect(ex.whatPercent.percentage).toBe('25');
    expect(ex.percentChange.magnitude).toBe('25');
  });
});


/* ------------------------------------------------------------------ */
/* The three added equations                                           */
/* ------------------------------------------------------------------ */

describe('"X is Y% of what?" — solving for the total', () => {
  it('computes the whole from the part and the percentage', () => {
    expect(percentOfWhatBinding.compute({ part: '30', percent: '15' })).toBeCloseTo(200, 10);
  });

  it('requires both operands', () => {
    expect(validatePercentOfWhat({ part: '', percent: '15' })).toEqual({
      ok: false,
      fieldErrors: { part: 'Enter the value.' },
    });
    expect(validatePercentOfWhat({ part: '30', percent: '' })).toEqual({
      ok: false,
      fieldErrors: { percent: 'Enter the percentage.' },
    });
  });

  it('rejects 0%, which no single total can satisfy', () => {
    const v = validatePercentOfWhat({ part: '30', percent: '0' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.fieldErrors?.percent).toMatch(/other than zero/i);
  });
});

describe('percentage difference', () => {
  it('measures the gap against the average of the two', () => {
    expect(percentDifferenceBinding.compute({ a: '10', b: '6' })).toBeCloseTo(50, 10);
  });

  it('gives the same answer whichever order they are entered', () => {
    const ab = percentDifferenceBinding.compute({ a: '10', b: '6' });
    const ba = percentDifferenceBinding.compute({ a: '6', b: '10' });
    expect(ab).toBeCloseTo(ba, 10);
  });

  it('rejects a pair that averages zero — there is nothing to measure against', () => {
    const v = validatePercentDifference({ a: '5', b: '-5' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.fieldErrors?.b).toMatch(/average zero/i);
  });

  it('requires both values', () => {
    expect(validatePercentDifference({ a: '', b: '' }).ok).toBe(false);
  });
});

describe('applying an increase or a decrease', () => {
  it('adds the percentage on an increase and subtracts it on a decrease', () => {
    expect(applyChangeBinding.compute({ value: '500', direction: 'increase', percent: '10' })).toBeCloseTo(550, 10);
    expect(applyChangeBinding.compute({ value: '500', direction: 'decrease', percent: '10' })).toBeCloseTo(450, 10);
  });

  it('treats an unknown direction as an increase rather than throwing', () => {
    expect(applyChangeBinding.compute({ value: '500', direction: 'sideways', percent: '10' })).toBeCloseTo(550, 10);
  });

  it('rejects a direction outside the two the select offers', () => {
    const v = validateApplyChange({ value: '500', direction: 'sideways', percent: '10' });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.fieldErrors?.direction).toMatch(/increase or decrease/i);
  });

  it('requires the value and the percentage', () => {
    expect(validateApplyChange({ value: '', direction: 'increase', percent: '10' }).ok).toBe(false);
    expect(validateApplyChange({ value: '500', direction: 'increase', percent: '' }).ok).toBe(false);
  });
});

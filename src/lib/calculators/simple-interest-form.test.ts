import { describe, it, expect } from 'vitest';
import {
  validateSimpleInterestValues,
  computeSimpleInterest,
  describeSimpleInterestResult,
  interpretSimpleInterest,
  yearsPhrase,
  spokenUSD,
  simpleInterestBinding,
  type SimpleInterestValues,
} from './simple-interest-form';
import { calculateSimpleInterest } from './simple-interest';

const vals = (over: Partial<SimpleInterestValues> = {}): SimpleInterestValues => ({
  principal: '1000',
  annualRatePct: '5',
  years: '3',
  ...over,
});

const errs = (r: ReturnType<typeof validateSimpleInterestValues>) =>
  (r as { fieldErrors: Record<string, string> }).fieldErrors;

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

describe('simple-interest-form — validation', () => {
  it('accepts a valid ordinary calculation', () => {
    expect(validateSimpleInterestValues(vals())).toEqual({ ok: true });
  });

  it('all fields empty → three required errors', () => {
    const e = errs(validateSimpleInterestValues({ principal: '', annualRatePct: '', years: '' }));
    expect(e.principal).toBe('Enter a principal amount.');
    expect(e.annualRatePct).toBe('Enter an annual interest rate.');
    expect(e.years).toBe('Enter a time period in years.');
  });

  it('principal: required, 0 valid, negative and non-finite invalid', () => {
    expect(errs(validateSimpleInterestValues(vals({ principal: '' }))).principal).toBe('Enter a principal amount.');
    expect(validateSimpleInterestValues(vals({ principal: '0' }))).toEqual({ ok: true });
    expect(errs(validateSimpleInterestValues(vals({ principal: '-1000' }))).principal).toBe(
      'Enter a principal amount of zero or more.',
    );
    expect(errs(validateSimpleInterestValues(vals({ principal: 'abc' }))).principal).toBe(
      'Enter a principal amount of zero or more.',
    );
  });

  it('annual rate: required, 0 valid, negative and non-finite invalid, no maximum', () => {
    expect(errs(validateSimpleInterestValues(vals({ annualRatePct: '' }))).annualRatePct).toBe(
      'Enter an annual interest rate.',
    );
    expect(validateSimpleInterestValues(vals({ annualRatePct: '0' }))).toEqual({ ok: true });
    expect(validateSimpleInterestValues(vals({ annualRatePct: '25' }))).toEqual({ ok: true });
    expect(errs(validateSimpleInterestValues(vals({ annualRatePct: '-5' }))).annualRatePct).toBe(
      'Enter an annual interest rate of zero or more.',
    );
    expect(errs(validateSimpleInterestValues(vals({ annualRatePct: 'Infinity' }))).annualRatePct).toBe(
      'Enter an annual interest rate of zero or more.',
    );
  });

  it('time: required, 0 valid, FRACTIONAL valid, negative and non-finite invalid', () => {
    expect(errs(validateSimpleInterestValues(vals({ years: '' }))).years).toBe('Enter a time period in years.');
    expect(validateSimpleInterestValues(vals({ years: '0' }))).toEqual({ ok: true });
    expect(validateSimpleInterestValues(vals({ years: '2.5' }))).toEqual({ ok: true }); // fractional allowed
    expect(validateSimpleInterestValues(vals({ years: '0.25' }))).toEqual({ ok: true });
    expect(errs(validateSimpleInterestValues(vals({ years: '-3' }))).years).toBe('Enter a time period of zero years or more.');
    expect(errs(validateSimpleInterestValues(vals({ years: 'NaN' }))).years).toBe('Enter a time period of zero years or more.');
  });

  it('an all-zero entry is valid (explicit zeros, not empties)', () => {
    expect(validateSimpleInterestValues({ principal: '0', annualRatePct: '0', years: '0' })).toEqual({ ok: true });
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('simple-interest-form — compute', () => {
  it('valid ordinary calculation carries the inputs and the exact interest/total', () => {
    expect(computeSimpleInterest(vals())).toEqual({
      principal: 1000,
      annualRatePct: 5,
      years: 3,
      interest: 150,
      total: 1150,
    });
  });

  it('decimal principal and decimal rate keep full precision', () => {
    const r = computeSimpleInterest(vals({ principal: '2500.50', annualRatePct: '3.75', years: '2.5' }));
    expect(r.interest).toBe(234.421875);
    expect(r.total).toBe(2734.921875);
  });

  it('a fractional duration computes proportionally', () => {
    const r = computeSimpleInterest(vals({ principal: '1000', annualRatePct: '4.2', years: '0.5' }));
    expect(r.interest).toBe(21);
    expect(r.total).toBe(1021);
  });

  it('preserves the pure formula output exactly (delegation, no re-implementation)', () => {
    for (const c of [vals(), vals({ principal: '5000', annualRatePct: '5', years: '3' }), vals({ principal: '99999', annualRatePct: '6.125', years: '1.5' })]) {
      const r = computeSimpleInterest(c);
      const pure = calculateSimpleInterest({ principal: Number(c.principal), annualRatePct: Number(c.annualRatePct), years: Number(c.years) });
      expect(r.interest).toBe(pure.interest);
      expect(r.total).toBe(pure.total);
    }
  });

  it('zero principal → valid $0 interest and $0 total (not treated as invalid)', () => {
    expect(computeSimpleInterest(vals({ principal: '0' }))).toMatchObject({ interest: 0, total: 0 });
  });

  it('zero rate → no interest, total = principal', () => {
    expect(computeSimpleInterest(vals({ annualRatePct: '0' }))).toMatchObject({ interest: 0, total: 1000 });
  });

  it('zero duration → no interest, total = principal', () => {
    expect(computeSimpleInterest(vals({ years: '0' }))).toMatchObject({ interest: 0, total: 1000 });
  });

  it('the validated domain is always finite, interest >= 0 and total >= principal', () => {
    for (const c of [vals({ principal: '0', annualRatePct: '0', years: '0' }), vals(), vals({ principal: '1000000', annualRatePct: '25', years: '40' }), vals({ principal: '0.01', annualRatePct: '0.01', years: '0.01' })]) {
      const r = computeSimpleInterest(c);
      expect(Number.isFinite(r.interest)).toBe(true);
      expect(Number.isFinite(r.total)).toBe(true);
      expect(r.interest).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeGreaterThanOrEqual(r.principal);
      expect(r.total).toBeCloseTo(r.principal + r.interest, 9);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Guarded magnitude (default finite gate; no isUsableResult)          */
/* ------------------------------------------------------------------ */

describe('simple-interest-form — resultValue + gate', () => {
  it('the guarded magnitude is the DOMINANT interest earned', () => {
    expect(simpleInterestBinding.resultValue({ principal: 1000, annualRatePct: 5, years: 3, interest: 150, total: 1150 })).toBe(150);
    expect(simpleInterestBinding.resultValue({ principal: 0, annualRatePct: 5, years: 3, interest: 0, total: 0 })).toBe(0); // finite $0 is real
  });

  it('does not implement isUsableResult (no non-finite outcome in the validated domain)', () => {
    expect(simpleInterestBinding.isUsableResult).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('simple-interest-form — announcement + interpretation', () => {
  it('announces the dominant result (interest) only, in USD', () => {
    expect(describeSimpleInterestResult({ principal: 5000, annualRatePct: 5, years: 3, interest: 750, total: 5750 })).toBe(
      'Your simple interest is 750 dollars.',
    );
  });

  it('ordinary interpretation states the rate, duration and earned interest', () => {
    const s = interpretSimpleInterest({ principal: 5000, annualRatePct: 5, years: 3, interest: 750, total: 5750 });
    expect(s).toBe('At 5% simple interest for 3 years, the interest earned is $750.00.');
  });

  it('zero-duration interpretation explains that no interest accrues over zero years', () => {
    const s = interpretSimpleInterest({ principal: 1000, annualRatePct: 5, years: 0, interest: 0, total: 1000 });
    expect(s).toContain('0 years');
    expect(s).toContain('no interest accrues');
    expect(s).toContain('$1,000.00');
  });

  it('zero-rate interpretation explains that a 0% rate produces no interest', () => {
    const s = interpretSimpleInterest({ principal: 1000, annualRatePct: 0, years: 3, interest: 0, total: 1000 });
    expect(s).toContain('0% rate');
    expect(s).toContain('no interest accrues');
  });

  it('zero-principal interpretation shows a $0 result without being invalid', () => {
    const s = interpretSimpleInterest({ principal: 0, annualRatePct: 5, years: 3, interest: 0, total: 0 });
    expect(s).toContain('$0.00');
  });

  it('yearsPhrase uses singular only for exactly one year', () => {
    expect(yearsPhrase(1)).toBe('1 year');
    expect(yearsPhrase(3)).toBe('3 years');
    expect(yearsPhrase(1.5)).toBe('1.5 years');
    expect(yearsPhrase(0)).toBe('0 years');
  });

  it('spokenUSD reads dollars and cents with correct singular/plural', () => {
    expect(spokenUSD(750)).toBe('750 dollars');
    expect(spokenUSD(103.33)).toBe('103 dollars and 33 cents');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(0)).toBe('0 dollars');
  });
});

/* ------------------------------------------------------------------ */
/* readValues + resetValues (DOM-free stub)                            */
/* ------------------------------------------------------------------ */

describe('simple-interest-form — readValues / resetValues', () => {
  it('reads the three named fields', () => {
    const root = stubRoot({ principal: '5000', annualRatePct: '5', years: '3' });
    expect(simpleInterestBinding.readValues(root)).toEqual({ principal: '5000', annualRatePct: '5', years: '3' });
  });

  it('reset clears every personal value', () => {
    const root = stubRoot({ principal: '5000', annualRatePct: '5', years: '3' });
    simpleInterestBinding.resetValues(root, 'personal');
    expect(simpleInterestBinding.readValues(root)).toEqual({ principal: '', annualRatePct: '', years: '' });
  });
});

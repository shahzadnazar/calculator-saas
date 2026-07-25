import { describe, it, expect } from 'vitest';
import {
  validateInflationValues,
  computeInflation,
  describeInflationResult,
  interpretInflation,
  isInflationResultUsable,
  spokenUSD,
  inflationBinding,
  type InflationValues,
  type InflationComputed,
} from './inflation-form';
import { adjustForInflation } from './inflation';

const vals = (over: Partial<InflationValues> = {}): InflationValues => ({
  amount: '100',
  annualRatePct: '3',
  years: '10',
  ...over,
});

const errs = (r: ReturnType<typeof validateInflationValues>) => (r as { fieldErrors: Record<string, string> }).fieldErrors;

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

const result = (over: Partial<InflationComputed> = {}): InflationComputed => ({
  amount: 100,
  annualRatePct: 3,
  years: 10,
  futureCost: 134.39,
  buyingPower: 74.41,
  totalInflationPct: 34.39,
  ...over,
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('inflation-form — validation', () => {
  it('accepts an ordinary inflation calculation', () => {
    expect(validateInflationValues(vals())).toEqual({ ok: true });
  });

  it('accepts ordinary deflation (a negative rate above -100)', () => {
    expect(validateInflationValues(vals({ annualRatePct: '-2' }))).toEqual({ ok: true });
  });

  it('all fields empty → three required errors', () => {
    const e = errs(validateInflationValues({ amount: '', annualRatePct: '', years: '' }));
    expect(e.amount).toBe('Enter an amount.');
    expect(e.annualRatePct).toBe('Enter an annual rate.');
    expect(e.years).toBe('Enter a time period in years.');
  });

  it('amount: required, 0 valid, negative and non-finite invalid', () => {
    expect(validateInflationValues(vals({ amount: '0' }))).toEqual({ ok: true });
    expect(errs(validateInflationValues(vals({ amount: '-1' }))).amount).toBe('Enter an amount of zero or more.');
    expect(errs(validateInflationValues(vals({ amount: 'abc' }))).amount).toBe('Enter an amount of zero or more.');
  });

  it('rate: 0 valid, negative-above-(-100) valid, -100 and below invalid, non-finite invalid', () => {
    expect(validateInflationValues(vals({ annualRatePct: '0' }))).toEqual({ ok: true });
    expect(validateInflationValues(vals({ annualRatePct: '-99.99' }))).toEqual({ ok: true }); // just above -100
    expect(validateInflationValues(vals({ annualRatePct: '250' }))).toEqual({ ok: true }); // no positive max
    expect(errs(validateInflationValues(vals({ annualRatePct: '-100' }))).annualRatePct).toBe('Enter an annual rate greater than -100%.');
    expect(errs(validateInflationValues(vals({ annualRatePct: '-150' }))).annualRatePct).toBe('Enter an annual rate greater than -100%.');
    expect(errs(validateInflationValues(vals({ annualRatePct: 'Infinity' }))).annualRatePct).toBe('Enter an annual rate greater than -100%.');
  });

  it('years: required, 0 valid, fractional valid, negative and non-finite invalid', () => {
    expect(validateInflationValues(vals({ years: '0' }))).toEqual({ ok: true });
    expect(validateInflationValues(vals({ years: '1.25' }))).toEqual({ ok: true });
    expect(errs(validateInflationValues(vals({ years: '-3' }))).years).toBe('Enter a time period of zero years or more.');
    expect(errs(validateInflationValues(vals({ years: 'NaN' }))).years).toBe('Enter a time period of zero years or more.');
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('inflation-form — compute', () => {
  it('ordinary inflation carries inputs + the exact outputs', () => {
    const r = computeInflation(vals());
    expect(r.futureCost).toBeCloseTo(134.39163793, 6);
    expect(r.buyingPower).toBeCloseTo(74.40939149, 6);
    expect(r.totalInflationPct).toBeCloseTo(34.39163793, 6);
    expect(r).toMatchObject({ amount: 100, annualRatePct: 3, years: 10 });
  });

  it('ordinary deflation: lower future cost, higher buying power, negative cumulative change', () => {
    const r = computeInflation(vals({ annualRatePct: '-2' }));
    expect(r.futureCost).toBeCloseTo(81.70728069, 6);
    expect(r.buyingPower).toBeCloseTo(122.3881142, 6);
    expect(r.totalInflationPct).toBeCloseTo(-18.29271931, 6);
  });

  it('preserves the pure formula output exactly (delegation)', () => {
    for (const c of [vals(), vals({ annualRatePct: '-2' }), vals({ amount: '2500.5', annualRatePct: '3.5', years: '12.5' })]) {
      const r = computeInflation(c);
      const pure = adjustForInflation({ amount: Number(c.amount), annualRatePct: Number(c.annualRatePct), years: Number(c.years) });
      expect(r.futureCost).toBe(pure.futureCost);
      expect(r.buyingPower).toBe(pure.buyingPower);
      expect(r.totalInflationPct).toBe(pure.totalInflationPct);
    }
  });

  it('zero amount → $0 currency (valid); zero rate / zero years → no change', () => {
    expect(computeInflation(vals({ amount: '0' }))).toMatchObject({ futureCost: 0, buyingPower: 0 });
    expect(computeInflation(vals({ annualRatePct: '0' }))).toMatchObject({ futureCost: 100, buyingPower: 100, totalInflationPct: 0 });
    expect(computeInflation(vals({ years: '0' }))).toMatchObject({ futureCost: 100, buyingPower: 100, totalInflationPct: 0 });
  });

  it('the relationships hold: futureCost = amount·factor, buyingPower = amount/factor, pct = (factor-1)·100', () => {
    for (const c of [vals(), vals({ annualRatePct: '-5', years: '8' }), vals({ amount: '250.75', annualRatePct: '7', years: '4.5' })]) {
      const f = Math.pow(1 + Number(c.annualRatePct) / 100, Number(c.years));
      const r = computeInflation(c);
      expect(r.futureCost).toBeCloseTo(Number(c.amount) * f, 6);
      expect(r.buyingPower).toBeCloseTo(Number(c.amount) / f, 6);
      expect(r.totalInflationPct).toBeCloseTo((f - 1) * 100, 6);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Result guard (default finite gate via resultValue; no isUsableResult) */
/* ------------------------------------------------------------------ */

describe('inflation-form — resultValue guard', () => {
  it('the guarded magnitude is the dominant future cost for a usable result', () => {
    expect(inflationBinding.resultValue(result({ futureCost: 134.39 }))).toBe(134.39);
    expect(inflationBinding.resultValue(result({ futureCost: 0, buyingPower: 0 }))).toBe(0); // zero amount is usable
  });

  it('a negative cumulative percentage (deflation) is USABLE, not rejected', () => {
    expect(isInflationResultUsable(result({ futureCost: 81.71, buyingPower: 122.39, totalInflationPct: -18.29 }))).toBe(true);
    expect(inflationBinding.resultValue(result({ futureCost: 81.71, totalInflationPct: -18.29 }))).toBe(81.71);
  });

  it('returns a NON-FINITE sentinel for any malformed output → default gate rejects it', () => {
    expect(Number.isNaN(inflationBinding.resultValue(result({ buyingPower: NaN })))).toBe(true); // NaN buying power (factor underflow)
    expect(Number.isNaN(inflationBinding.resultValue(result({ futureCost: Infinity })))).toBe(true); // overflow
    expect(Number.isNaN(inflationBinding.resultValue(result({ totalInflationPct: Infinity })))).toBe(true);
    expect(Number.isNaN(inflationBinding.resultValue(result({ futureCost: -10 })))).toBe(true); // negative currency
  });

  it('does not implement isUsableResult (the guard lives in resultValue)', () => {
    expect(inflationBinding.isUsableResult).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('inflation-form — announcement + interpretation', () => {
  it('announces the dominant future cost only, in USD', () => {
    expect(describeInflationResult(result({ futureCost: 134.39 }))).toBe('The projected future cost is 134 dollars and 39 cents.');
  });

  it('positive-rate interpretation states inflation, rate, duration and future cost', () => {
    const r = computeInflation(vals());
    expect(interpretInflation(r)).toBe(
      'At an annual inflation rate of 3% for 10 years, an amount costing $100.00 today would cost approximately $134.39.',
    );
  });

  it('deflation interpretation uses the ABSOLUTE rate + "deflation" + a decrease (never "increase")', () => {
    const r = computeInflation(vals({ annualRatePct: '-2' }));
    const s = interpretInflation(r);
    expect(s).toBe('At an annual deflation rate of 2% for 10 years, the projected cost decreases to approximately $81.71.');
    expect(s).not.toMatch(/increase/i);
  });

  it('zero-rate and zero-years interpretations state no price change', () => {
    expect(interpretInflation(computeInflation(vals({ annualRatePct: '0' })))).toBe(
      'With no price change over 10 years, the projected cost remains $100.00.',
    );
    expect(interpretInflation(computeInflation(vals({ years: '0' })))).toBe(
      'With no price change over 0 years, the projected cost remains $100.00.',
    );
  });

  it('zero-amount interpretation shows a $0 future cost (valid)', () => {
    expect(interpretInflation(computeInflation(vals({ amount: '0' })))).toBe('With a $0.00 amount, the projected future cost is $0.00.');
  });

  it('spokenUSD reads dollars and cents with correct singular/plural', () => {
    expect(spokenUSD(134.39)).toBe('134 dollars and 39 cents');
    expect(spokenUSD(81)).toBe('81 dollars');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(0)).toBe('0 dollars');
  });
});

/* ------------------------------------------------------------------ */
/* readValues + resetValues (DOM-free stub)                            */
/* ------------------------------------------------------------------ */

describe('inflation-form — readValues / resetValues', () => {
  it('reads the three named fields', () => {
    const root = stubRoot({ amount: '100', annualRatePct: '3', years: '10' });
    expect(inflationBinding.readValues(root)).toEqual({ amount: '100', annualRatePct: '3', years: '10' });
  });

  it('reset clears every personal value', () => {
    const root = stubRoot({ amount: '100', annualRatePct: '3', years: '10' });
    inflationBinding.resetValues(root, 'personal');
    expect(inflationBinding.readValues(root)).toEqual({ amount: '', annualRatePct: '', years: '' });
  });
});

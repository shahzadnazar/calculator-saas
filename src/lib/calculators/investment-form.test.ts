import { describe, it, expect } from 'vitest';
import {
  validateInvestmentValues,
  computeInvestment,
  completeResultValue,
  describeInvestmentResult,
  interpretInvestment,
  investmentBinding,
  MIN_YEARS,
  MAX_YEARS,
  FUNDING_ERROR,
  type InvestmentValues,
  type InvestmentComputed,
} from './investment-form';

const values = (over: Partial<InvestmentValues> = {}): InvestmentValues => ({
  startingAmount: '10000',
  monthlyContribution: '300',
  annualReturnPct: '7',
  years: '25',
  ...over,
});
const good = () => computeInvestment(values());
const rejects = (r: InvestmentComputed) => Number.isNaN(completeResultValue(r));

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

describe('investment binding — contract', () => {
  it('the projection horizon is 1..100 years', () => {
    expect(MIN_YEARS).toBe(1);
    expect(MAX_YEARS).toBe(100);
  });
  it('does NOT define isUsableResult (guard lives in resultValue)', () => {
    expect(investmentBinding.isUsableResult).toBeUndefined();
    expect(investmentBinding.resultValue).toBe(completeResultValue);
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('validateInvestmentValues — funding (collective)', () => {
  it('accepts a starting amount alone, a contribution alone, or both', () => {
    expect(validateInvestmentValues(values({ monthlyContribution: '' })).ok).toBe(true);
    expect(validateInvestmentValues(values({ startingAmount: '' })).ok).toBe(true);
    expect(validateInvestmentValues(values()).ok).toBe(true);
  });
  it('rejects both empty / both zero / one empty & one zero with the FORM-level funding error', () => {
    for (const over of [
      { startingAmount: '', monthlyContribution: '' },
      { startingAmount: '0', monthlyContribution: '0' },
      { startingAmount: '', monthlyContribution: '0' },
      { startingAmount: '0', monthlyContribution: '' },
    ]) {
      const r = validateInvestmentValues(values(over));
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.formError).toBe(FUNDING_ERROR);
        expect(r.fieldErrors?.startingAmount).toBeUndefined(); // no single field blamed
        expect(r.fieldErrors?.monthlyContribution).toBeUndefined();
      }
    }
  });
  it('a negative or non-finite amount is a FIELD error (not the funding error)', () => {
    expect(validateInvestmentValues(values({ startingAmount: '-5' }))).toMatchObject({ ok: false, fieldErrors: { startingAmount: 'Enter a starting investment of zero or more.' } });
    expect(validateInvestmentValues(values({ monthlyContribution: '-1' }))).toMatchObject({ ok: false, fieldErrors: { monthlyContribution: 'Enter a monthly contribution of zero or more.' } });
    expect(validateInvestmentValues(values({ startingAmount: 'abc' })).ok).toBe(false);
  });
});

describe('validateInvestmentValues — annual return', () => {
  it('requires a return; accepts 0%, positive, and negative above -100%', () => {
    expect(validateInvestmentValues(values({ annualReturnPct: '' }))).toMatchObject({ ok: false, fieldErrors: { annualReturnPct: 'Enter an expected annual return.' } });
    for (const annualReturnPct of ['0', '7', '-5', '-99.9']) expect(validateInvestmentValues(values({ annualReturnPct })).ok).toBe(true);
  });
  it('rejects -100, below -100, and non-finite', () => {
    for (const annualReturnPct of ['-100', '-150', 'NaN', 'Infinity']) {
      expect(validateInvestmentValues(values({ annualReturnPct }))).toMatchObject({ ok: false, fieldErrors: { annualReturnPct: 'Enter an annual return greater than -100%.' } });
    }
  });
});

describe('validateInvestmentValues — projection period', () => {
  it('accepts whole 1 and 100', () => {
    expect(validateInvestmentValues(values({ years: '1' })).ok).toBe(true);
    expect(validateInvestmentValues(values({ years: '100' })).ok).toBe(true);
  });
  it('rejects empty / zero / fractional / above 100 / non-finite with the single message', () => {
    for (const years of ['', '0', '2.5', '101', 'NaN', 'Infinity']) {
      expect(validateInvestmentValues(values({ years }))).toMatchObject({ ok: false, fieldErrors: { years: 'Enter a whole projection period from 1 to 100 years.' } });
    }
  });
});

/* ------------------------------------------------------------------ */
/* Computation — pass-through preservation                             */
/* ------------------------------------------------------------------ */

describe('computeInvestment — preserves the formula outputs', () => {
  it('ordinary projection matches the frozen result', () => {
    const r = good();
    expect(r.futureValue).toBeCloseTo(300275.69, 2);
    expect(r.startingAmount).toBe(10000);
    expect(r.totalContributions).toBe(90000);
    expect(r.totalEarnings).toBeCloseTo(200275.69, 2);
    expect(r.years).toBe(25);
    expect(r.series.length).toBe(26);
    expect(r.negativeGrowth).toBe(false);
  });
  it('starting-only, contribution-only and mixed', () => {
    expect(computeInvestment(values({ monthlyContribution: '0', years: '10' })).totalContributions).toBe(0);
    expect(computeInvestment(values({ startingAmount: '0', monthlyContribution: '100', years: '10' })).totalContributions).toBe(12000);
    expect(computeInvestment(values({ startingAmount: '5000', monthlyContribution: '200', annualReturnPct: '7', years: '10' })).futureValue).toBeGreaterThan(0);
  });
  it('zero return: future value = starting + contributions, growth 0', () => {
    const r = computeInvestment(values({ annualReturnPct: '0', years: '10' }));
    expect(r.futureValue).toBe(46000);
    expect(r.totalEarnings).toBe(0);
  });
  it('negative return: growth negative, flagged', () => {
    const r = computeInvestment(values({ annualReturnPct: '-5', years: '10' }));
    expect(r.totalEarnings).toBeCloseTo(-11565.6405, 2);
    expect(r.negativeGrowth).toBe(true);
  });
  it('decimal amount + decimal return carry precision', () => {
    const r = computeInvestment(values({ startingAmount: '3333.33', monthlyContribution: '77.77', annualReturnPct: '5.5', years: '8' }));
    expect(Number.isFinite(r.futureValue)).toBe(true);
    expect(r.futureValue).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Complete-result guard                                               */
/* ------------------------------------------------------------------ */

describe('completeResultValue guard', () => {
  it('returns the projected value for a well-formed result', () => {
    expect(completeResultValue(good())).toBeCloseTo(300275.69, 2);
  });
  it('ACCEPTS a negative-growth result (value stays finite/non-negative)', () => {
    const r = computeInvestment(values({ annualReturnPct: '-5', years: '10' }));
    expect(Number.isNaN(completeResultValue(r))).toBe(false);
    expect(completeResultValue(r)).toBeCloseTo(34434.3595, 2);
  });
  it('rejects non-finite / negative projected value, negative contributions, non-finite growth', () => {
    expect(rejects({ ...good(), futureValue: Infinity })).toBe(true);
    expect(rejects({ ...good(), futureValue: -1 })).toBe(true);
    expect(rejects({ ...good(), totalContributions: -1 })).toBe(true);
    expect(rejects({ ...good(), totalEarnings: NaN })).toBe(true);
  });
  it('rejects a broken future value = starting + contributions + growth identity', () => {
    expect(rejects({ ...good(), futureValue: good().futureValue + 1000 })).toBe(true);
  });
  it('rejects a series whose length ≠ years + 1, is unordered, or does not reconcile', () => {
    const r = good();
    expect(rejects({ ...r, series: r.series.slice(0, r.series.length - 1) })).toBe(true);
    expect(rejects({ ...r, series: r.series.map((s, i) => (i === 3 ? { ...s, year: 99 } : s)) })).toBe(true);
    expect(rejects({ ...r, series: r.series.map((s, i) => (i === r.series.length - 1 ? { ...s, balance: 0 } : s)) })).toBe(true);
  });
  it('rejects an out-of-range years field', () => {
    expect(rejects({ ...good(), years: 0 })).toBe(true);
    expect(rejects({ ...good(), years: 2.5 })).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Descriptions + interpretation                                       */
/* ------------------------------------------------------------------ */

describe('descriptions + interpretation', () => {
  it('announces only the dominant projected value (whole dollars)', () => {
    expect(describeInvestmentResult(good())).toBe('The projected investment value is 300276 dollars.');
  });
  it('positive-growth interpretation states the assumed nominal return', () => {
    expect(interpretInvestment(good())).toContain('assumed annual return of 7% for 25 years, the projected nominal value');
  });
  it('zero-return interpretation', () => {
    expect(interpretInvestment(computeInvestment(values({ annualReturnPct: '0', years: '10' })))).toContain('At a 0% return, the projected value equals the starting investment plus the monthly contributions');
  });
  it('negative-return interpretation states the loss relative to contributions', () => {
    expect(interpretInvestment(computeInvestment(values({ annualReturnPct: '-5', years: '10' })))).toContain('projected to lose value relative to');
  });
});

/* ------------------------------------------------------------------ */
/* Reset                                                               */
/* ------------------------------------------------------------------ */

describe('resetValues', () => {
  it('clears all four personal fields', () => {
    const fields: Record<string, { value: string }> = {};
    for (const n of ['startingAmount', 'monthlyContribution', 'annualReturnPct', 'years']) fields[n] = { value: '9' };
    const root = { querySelector: (sel: string) => fields[sel.replace(/^\[name="(.+)"\]$/, '$1')] ?? null } as unknown as HTMLElement;
    investmentBinding.resetValues(root, 'personal');
    for (const n of Object.keys(fields)) expect(fields[n].value).toBe('');
  });
});

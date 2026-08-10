import { describe, it, expect } from 'vitest';
import {
  interestBinding,
  validateInterestValues,
  computeInterest,
  completeInterestValue,
  describeInterestResult,
  parseNonNegative,
  DEFAULT_FREQUENCY,
  COMPOUND_FREQUENCIES,
  MSG,
  type InterestValues,
} from './interest-form';
import { calculateSimpleInterest } from './simple-interest';
import { calculateCompoundInterest } from './compound-interest';

/**
 * Interest binding unit tests (R20A1). Validation, the COMPOSITION over the two FROZEN engines
 * (whose full matrices stay simple-interest.test.ts / compound-interest.test.ts / interest.test.ts's
 * authority), the complete-result guard (tamper + dual-engine reconciliation), the announcement, and
 * the DOM read/reset helpers via a mock root. No interest math is reimplemented here.
 */

const vals = (v: Partial<InterestValues> = {}): InterestValues => ({
  principal: '10000',
  annualRatePct: '5',
  years: '10',
  compoundsPerYear: '12',
  ...v,
});

function mockRoot(v: Partial<Record<keyof InterestValues, string>> = {}) {
  const store: Record<string, { value: string }> = {
    principal: { value: v.principal ?? '' },
    annualRatePct: { value: v.annualRatePct ?? '' },
    years: { value: v.years ?? '' },
    compoundsPerYear: { value: v.compoundsPerYear ?? DEFAULT_FREQUENCY },
  };
  const root = {
    querySelector(sel: string) {
      const m = sel.match(/\[name="(\w+)"\]/);
      return m && store[m[1]] ? store[m[1]] : null;
    },
  } as unknown as HTMLElement;
  return { root, store };
}

describe('interest binding — contract', () => {
  it('does NOT implement isUsableResult (the guard lives in resultValue)', () => {
    expect(interestBinding.isUsableResult).toBeUndefined();
  });

  it('the default compounding frequency is Monthly (12)', () => {
    expect(DEFAULT_FREQUENCY).toBe('12');
    expect(COMPOUND_FREQUENCIES.map((f) => f.value)).toEqual(['1', '4', '12', '365']);
  });

  it('resultValue is the complete-result guard: the dominant COMPOUND interest when coherent', () => {
    const c = computeInterest(vals());
    expect(interestBinding.resultValue(c)).toBe(c.compoundInterest);
    expect(interestBinding.resultValue(c)).toBeCloseTo(6470.09497690279, 6);
  });
});

describe('interest binding — strict validation', () => {
  it('parseNonNegative: empty vs invalid vs a finite non-negative number (0 valid, negative invalid)', () => {
    expect(parseNonNegative('')).toBe('empty');
    expect(parseNonNegative('0')).toBe(0);
    expect(parseNonNegative('10000.50')).toBe(10000.5);
    expect(parseNonNegative('-1')).toBe('invalid');
    expect(parseNonNegative('abc')).toBe('invalid');
    expect(parseNonNegative('Infinity')).toBe('invalid');
  });

  it('ordinary input is valid; zeros are valid; negatives are field errors (UI policy)', () => {
    expect(validateInterestValues(vals()).ok).toBe(true);
    expect(validateInterestValues(vals({ principal: '0' })).ok).toBe(true);
    expect(validateInterestValues(vals({ annualRatePct: '0' })).ok).toBe(true);
    expect(validateInterestValues(vals({ years: '0' })).ok).toBe(true);
    const negP = validateInterestValues(vals({ principal: '-5' }));
    expect(negP.ok).toBe(false);
    if (!negP.ok) expect(negP.fieldErrors?.principal).toBe(MSG.principalInvalid);
    const negR = validateInterestValues(vals({ annualRatePct: '-1' }));
    if (!negR.ok) expect(negR.fieldErrors?.annualRatePct).toBe(MSG.rateInvalid);
    const negY = validateInterestValues(vals({ years: '-2' }));
    if (!negY.ok) expect(negY.fieldErrors?.years).toBe(MSG.yearsInvalid);
  });

  it('requires principal, rate and years, keyed to the field', () => {
    const empty = validateInterestValues({ principal: '', annualRatePct: '', years: '', compoundsPerYear: '12' });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.fieldErrors?.principal).toBe(MSG.principalRequired);
      expect(empty.fieldErrors?.annualRatePct).toBe(MSG.rateRequired);
      expect(empty.fieldErrors?.years).toBe(MSG.yearsRequired);
    }
  });

  it('rejects non-finite numeric entries', () => {
    const bad = validateInterestValues(vals({ principal: 'abc' }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.fieldErrors?.principal).toBe(MSG.principalInvalid);
  });
});

describe('interest binding — composition over the two frozen engines', () => {
  const refSimple = (v: InterestValues) =>
    calculateSimpleInterest({ principal: Number(v.principal), annualRatePct: Number(v.annualRatePct), years: Number(v.years) });
  const refCompound = (v: InterestValues) =>
    calculateCompoundInterest({ principal: Number(v.principal), annualRatePct: Number(v.annualRatePct), years: Number(v.years), compoundsPerYear: Number(v.compoundsPerYear) });

  it('delegates to both engines unchanged and echoes the parsed inputs + advantage', () => {
    const v = vals();
    const c = computeInterest(v);
    expect(c.simpleInterest).toBe(refSimple(v).interest);
    expect(c.simpleFinal).toBe(refSimple(v).total);
    expect(c.compoundInterest).toBe(refCompound(v).totalInterest);
    expect(c.compoundFinal).toBe(refCompound(v).futureValue);
    expect(c.advantage).toBe(refCompound(v).totalInterest - refSimple(v).interest);
    expect({ principal: c.principal, annualRatePct: c.annualRatePct, years: c.years, compoundsPerYear: c.compoundsPerYear }).toEqual({ principal: 10000, annualRatePct: 5, years: 10, compoundsPerYear: 12 });
  });

  it('each frequency parses and changes only the compound side; simple is frequency-independent', () => {
    const results = (['1', '4', '12', '365'] as const).map((f) => computeInterest(vals({ compoundsPerYear: f })));
    for (const r of results) expect(r.simpleInterest).toBe(5000); // simple unchanged
    const compoundEarned = results.map((r) => r.compoundInterest);
    // strictly increasing with frequency (annually < quarterly < monthly < daily)
    for (let i = 1; i < compoundEarned.length; i++) expect(compoundEarned[i]).toBeGreaterThan(compoundEarned[i - 1]);
    for (const r of results) expect(completeInterestValue(r)).toBe(r.compoundInterest);
  });

  it('the compounding advantage equals compound.totalInterest − simple.interest', () => {
    const c = computeInterest(vals());
    expect(c.advantage).toBeCloseTo(c.compoundInterest - c.simpleInterest, 10);
    expect(c.advantage).toBeCloseTo(1470.0949769027902, 6);
  });

  it('zero principal / zero rate / zero years each yield a VALID $0 dominant (0, not NaN)', () => {
    for (const v of [vals({ principal: '0' }), vals({ annualRatePct: '0' }), vals({ years: '0' })]) {
      const c = computeInterest(v);
      expect(c.compoundInterest).toBe(0);
      expect(completeInterestValue(c)).toBe(0);
      expect(Number.isNaN(completeInterestValue(c))).toBe(false);
    }
  });

  it('rejects tampered / inconsistent results (guard reconciles via a fresh dual-engine recompute)', () => {
    const c = computeInterest(vals());
    expect(Number.isNaN(completeInterestValue({ ...c, compoundInterest: c.compoundInterest + 1 }))).toBe(true);
    expect(Number.isNaN(completeInterestValue({ ...c, simpleInterest: c.simpleInterest + 1 }))).toBe(true);
    expect(Number.isNaN(completeInterestValue({ ...c, compoundFinal: c.compoundFinal + 1 }))).toBe(true);
    expect(Number.isNaN(completeInterestValue({ ...c, advantage: c.advantage + 1 }))).toBe(true);
    expect(Number.isNaN(completeInterestValue({ ...c, principal: -1 }))).toBe(true);
    expect(Number.isNaN(completeInterestValue({ ...c, annualRatePct: -1 }))).toBe(true);
    expect(Number.isNaN(completeInterestValue({ ...c, years: -1 }))).toBe(true);
    expect(Number.isNaN(completeInterestValue({ ...c, compoundInterest: Number.POSITIVE_INFINITY }))).toBe(true);
    expect(Number.isNaN(completeInterestValue({ ...c, compoundsPerYear: 6 }))).toBe(true); // unsupported frequency
  });
});

describe('interest binding — description + DOM', () => {
  it('announces the dominant compound interest earned + the final balance', () => {
    const c = computeInterest(vals());
    expect(describeInterestResult(c)).toBe('Compound interest earned: $6,470.09; final balance $16,470.09.');
  });

  it('a zero result announces normally', () => {
    const c = computeInterest(vals({ principal: '0' }));
    expect(describeInterestResult(c)).toBe('Compound interest earned: $0.00; final balance $0.00.');
  });

  it('readValues reads the principal, rate, years and frequency', () => {
    const { root } = mockRoot({ principal: '5000', annualRatePct: '3.5', years: '20', compoundsPerYear: '4' });
    expect(interestBinding.readValues(root)).toEqual({ principal: '5000', annualRatePct: '3.5', years: '20', compoundsPerYear: '4' });
  });

  it('readValues defaults an absent/invalid frequency to Monthly (12)', () => {
    const { root } = mockRoot({ compoundsPerYear: '7' });
    expect(interestBinding.readValues(root).compoundsPerYear).toBe('12');
  });

  it('resetValues clears principal/rate/years and restores Monthly (12)', () => {
    const { root, store } = mockRoot({ principal: '99999', annualRatePct: '9', years: '40', compoundsPerYear: '365' });
    interestBinding.resetValues(root, 'personal');
    expect(store.principal.value).toBe('');
    expect(store.annualRatePct.value).toBe('');
    expect(store.years.value).toBe('');
    expect(store.compoundsPerYear.value).toBe('12');
  });
});

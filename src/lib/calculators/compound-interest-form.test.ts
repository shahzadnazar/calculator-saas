import { describe, it, expect } from 'vitest';
import {
  compoundInterestBinding,
  validateCompoundValues,
  computeCompound,
  completeCompoundValue,
  describeCompoundResult,
  proportion,
  parseNonNegative,
  parseWholeYears,
  parseOptionalNonNegative,
  DEFAULT_FREQUENCY,
  COMPOUND_FREQUENCIES,
  MAX_YEARS,
  MSG,
  type CompoundValues,
} from './compound-interest-form';
import { calculateCompoundInterest } from './compound-interest';

/**
 * Compound Interest binding unit tests (R21A1 — final migration). Validation, the pass-through to the
 * FROZEN calculateCompoundInterest (whose full matrix stays compound-interest.test.ts's authority), the
 * complete-result guard (tamper + engine reconciliation), the proportion split, the announcement, and
 * the DOM read/reset helpers via a mock root. No compound math is reimplemented here.
 */

const vals = (v: Partial<CompoundValues> = {}): CompoundValues => ({
  principal: '10000',
  annualRatePct: '7',
  years: '20',
  compoundsPerYear: '12',
  contribution: '200',
  ...v,
});

function mockRoot(v: Partial<Record<keyof CompoundValues, string>> = {}) {
  const store: Record<string, { value: string }> = {
    principal: { value: v.principal ?? '' },
    annualRatePct: { value: v.annualRatePct ?? '' },
    years: { value: v.years ?? '' },
    compoundsPerYear: { value: v.compoundsPerYear ?? DEFAULT_FREQUENCY },
    contribution: { value: v.contribution ?? '' },
  };
  const root = {
    querySelector(sel: string) {
      const m = sel.match(/\[name="(\w+)"\]/);
      return m && store[m[1]] ? store[m[1]] : null;
    },
  } as unknown as HTMLElement;
  return { root, store };
}

describe('compound-interest binding — contract', () => {
  it('does NOT implement isUsableResult (the guard lives in resultValue)', () => {
    expect(compoundInterestBinding.isUsableResult).toBeUndefined();
  });

  it('the default frequency is Monthly (12) and exposes all FIVE UI options incl. Semi-annually', () => {
    expect(DEFAULT_FREQUENCY).toBe('12');
    expect(COMPOUND_FREQUENCIES.map((f) => f.value)).toEqual(['1', '2', '4', '12', '365']);
    expect(COMPOUND_FREQUENCIES.find((f) => f.value === '2')?.label).toBe('Semi-annually');
  });

  it('resultValue is the complete-result guard: the dominant FUTURE VALUE when coherent', () => {
    const c = computeCompound(vals());
    expect(compoundInterestBinding.resultValue(c)).toBe(c.futureValue);
    expect(compoundInterestBinding.resultValue(c)).toBeCloseTo(144572.72045492515, 6);
  });
});

describe('compound-interest binding — strict validation', () => {
  it('parseNonNegative / parseWholeYears / parseOptionalNonNegative', () => {
    expect(parseNonNegative('')).toBe('empty');
    expect(parseNonNegative('0')).toBe(0);
    expect(parseNonNegative('-1')).toBe('invalid');
    expect(parseWholeYears('20')).toBe(20);
    expect(parseWholeYears('0')).toBe('invalid');
    expect(parseWholeYears('1.5')).toBe('invalid');
    expect(parseWholeYears(String(MAX_YEARS + 1))).toBe('invalid');
    expect(parseOptionalNonNegative('')).toBe(0); // blank → 0
    expect(parseOptionalNonNegative('200')).toBe(200);
    expect(parseOptionalNonNegative('-5')).toBe('invalid');
  });

  it('ordinary input is valid; zeros (principal/rate) valid; blank contribution valid', () => {
    expect(validateCompoundValues(vals()).ok).toBe(true);
    expect(validateCompoundValues(vals({ principal: '0' })).ok).toBe(true);
    expect(validateCompoundValues(vals({ annualRatePct: '0' })).ok).toBe(true);
    expect(validateCompoundValues(vals({ contribution: '' })).ok).toBe(true);
  });

  it('requires principal, rate and years, keyed to the field', () => {
    const empty = validateCompoundValues({ principal: '', annualRatePct: '', years: '', compoundsPerYear: '12', contribution: '' });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.fieldErrors?.principal).toBe(MSG.principalRequired);
      expect(empty.fieldErrors?.annualRatePct).toBe(MSG.rateRequired);
      expect(empty.fieldErrors?.years).toBe(MSG.yearsRequired);
    }
  });

  it('rejects negative principal / rate and a negative contribution (UI policy)', () => {
    const negP = validateCompoundValues(vals({ principal: '-1' }));
    if (!negP.ok) expect(negP.fieldErrors?.principal).toBe(MSG.principalInvalid);
    const negR = validateCompoundValues(vals({ annualRatePct: '-2' }));
    if (!negR.ok) expect(negR.fieldErrors?.annualRatePct).toBe(MSG.rateInvalid);
    const negC = validateCompoundValues(vals({ contribution: '-100' }));
    expect(negC.ok).toBe(false);
    if (!negC.ok) expect(negC.fieldErrors?.contribution).toBe(MSG.contributionInvalid);
  });

  it('years must be a WHOLE number in [1, 100]: 0, fractional and >100 are rejected', () => {
    for (const bad of ['0', '1.5', '101', '-3']) {
      const r = validateCompoundValues(vals({ years: bad }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors?.years).toBe(MSG.yearsInvalid);
    }
    expect(validateCompoundValues(vals({ years: '1' })).ok).toBe(true);
    expect(validateCompoundValues(vals({ years: '100' })).ok).toBe(true);
  });
});

describe('compound-interest binding — computation (delegating to the frozen engine)', () => {
  const ref = (v: CompoundValues) =>
    calculateCompoundInterest({ principal: Number(v.principal), annualRatePct: Number(v.annualRatePct), years: Number(v.years), compoundsPerYear: Number(v.compoundsPerYear), contribution: v.contribution.trim() === '' ? 0 : Number(v.contribution) });

  it('delegates to calculateCompoundInterest and echoes the parsed inputs + series', () => {
    const v = vals();
    const c = computeCompound(v);
    const r = ref(v);
    expect(c.futureValue).toBe(r.futureValue);
    expect(c.totalPrincipal).toBe(r.totalPrincipal);
    expect(c.totalContributions).toBe(r.totalContributions);
    expect(c.totalInterest).toBe(r.totalInterest);
    expect(c.series).toEqual(r.series); // passed through unchanged (no reconstruction)
    expect({ principal: c.principal, annualRatePct: c.annualRatePct, years: c.years, compoundsPerYear: c.compoundsPerYear, contribution: c.contribution }).toEqual({ principal: 10000, annualRatePct: 7, years: 20, compoundsPerYear: 12, contribution: 200 });
  });

  it('every UI frequency computes and passes the guard (incl. Semi-annually)', () => {
    for (const f of ['1', '2', '4', '12', '365'] as const) {
      const c = computeCompound(vals({ compoundsPerYear: f }));
      expect(Number.isNaN(completeCompoundValue(c))).toBe(false);
      expect(completeCompoundValue(c)).toBe(c.futureValue);
    }
  });

  it('a blank contribution is treated as 0 (no deposits)', () => {
    const c = computeCompound(vals({ contribution: '' }));
    expect(c.contribution).toBe(0);
    expect(c.totalContributions).toBe(0);
    expect(c.futureValue).toBeCloseTo(40387.38848982184, 6);
  });

  it('a zero-principal + zero-contribution result is a VALID $0 (0, not NaN)', () => {
    const c = computeCompound(vals({ principal: '0', contribution: '' }));
    // principal 0, contribution 0 → future value 0
    expect(c.futureValue).toBe(0);
    expect(completeCompoundValue(c)).toBe(0);
    expect(Number.isNaN(completeCompoundValue(c))).toBe(false);
  });

  it('rejects tampered / inconsistent results (guard reconciles via a fresh engine recompute)', () => {
    const c = computeCompound(vals());
    expect(Number.isNaN(completeCompoundValue({ ...c, futureValue: c.futureValue + 1 }))).toBe(true);
    expect(Number.isNaN(completeCompoundValue({ ...c, totalInterest: c.totalInterest + 1 }))).toBe(true);
    expect(Number.isNaN(completeCompoundValue({ ...c, series: c.series.slice(0, -1) }))).toBe(true); // wrong length
    expect(Number.isNaN(completeCompoundValue({ ...c, principal: -1 }))).toBe(true);
    expect(Number.isNaN(completeCompoundValue({ ...c, years: 0 }))).toBe(true);
    expect(Number.isNaN(completeCompoundValue({ ...c, years: 1.5 }))).toBe(true);
    expect(Number.isNaN(completeCompoundValue({ ...c, years: MAX_YEARS + 1 }))).toBe(true);
    expect(Number.isNaN(completeCompoundValue({ ...c, compoundsPerYear: 6 }))).toBe(true); // unsupported frequency
    expect(Number.isNaN(completeCompoundValue({ ...c, futureValue: Number.POSITIVE_INFINITY }))).toBe(true);
  });
});

describe('compound-interest binding — proportion split', () => {
  it('principal / contributions / interest percentages sum to ~100 for a positive result', () => {
    const p = proportion(computeCompound(vals()));
    expect(p.principal + p.contributions + p.interest).toBeCloseTo(100, 6);
  });

  it('guards division by zero: a $0 future value gives all-zero widths (never NaN)', () => {
    const p = proportion(computeCompound(vals({ principal: '0', contribution: '' })));
    expect(p).toEqual({ principal: 0, contributions: 0, interest: 0 });
  });
});

describe('compound-interest binding — description + DOM', () => {
  it('announces the future value, horizon and interest earned', () => {
    const c = computeCompound(vals());
    expect(describeCompoundResult(c)).toBe('Future value after 20 years: $144,572.72, including $86,572.72 in interest earned.');
  });

  it('readValues reads all five controls; defaults an unknown frequency to Monthly', () => {
    const { root } = mockRoot({ principal: '5000', annualRatePct: '6', years: '30', compoundsPerYear: '2', contribution: '100' });
    expect(compoundInterestBinding.readValues(root)).toEqual({ principal: '5000', annualRatePct: '6', years: '30', compoundsPerYear: '2', contribution: '100' });
    const { root: r2 } = mockRoot({ compoundsPerYear: '7' });
    expect(compoundInterestBinding.readValues(r2).compoundsPerYear).toBe('12');
  });

  it('resetValues clears principal/rate/years/contribution and restores Monthly', () => {
    const { root, store } = mockRoot({ principal: '99999', annualRatePct: '9', years: '40', compoundsPerYear: '365', contribution: '500' });
    compoundInterestBinding.resetValues(root, 'personal');
    expect(store.principal.value).toBe('');
    expect(store.annualRatePct.value).toBe('');
    expect(store.years.value).toBe('');
    expect(store.compoundsPerYear.value).toBe('12');
    expect(store.contribution.value).toBe('');
  });
});

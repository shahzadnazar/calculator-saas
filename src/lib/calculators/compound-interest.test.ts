import { describe, it, expect } from 'vitest';
import { calculateCompoundInterest } from './compound-interest';

describe('compound interest', () => {
  it('compounds annually', () => {
    const r = calculateCompoundInterest({
      principal: 1000,
      annualRatePct: 10,
      years: 2,
      compoundsPerYear: 1,
    });
    expect(r.futureValue).toBeCloseTo(1210, 6);
    expect(r.totalInterest).toBeCloseTo(210, 6);
  });

  it('compounds monthly', () => {
    const r = calculateCompoundInterest({
      principal: 1000,
      annualRatePct: 12,
      years: 1,
      compoundsPerYear: 12,
    });
    expect(r.futureValue).toBeCloseTo(1126.83, 2);
  });

  it('adds regular contributions', () => {
    const r = calculateCompoundInterest({
      principal: 0,
      annualRatePct: 0,
      years: 1,
      compoundsPerYear: 12,
      contribution: 100,
    });
    expect(r.futureValue).toBeCloseTo(1200, 6);
    expect(r.totalContributions).toBeCloseTo(1200, 6);
    expect(r.totalInterest).toBeCloseTo(0, 6);
  });

  it('builds a yearly series', () => {
    const r = calculateCompoundInterest({
      principal: 500,
      annualRatePct: 5,
      years: 3,
      compoundsPerYear: 12,
    });
    expect(r.series[0].year).toBe(0);
    expect(r.series[r.series.length - 1].year).toBe(3);
    expect(r.series[r.series.length - 1].balance).toBeCloseTo(r.futureValue, 6);
  });
});

/**
 * Investment-relevant invariants (R11D1 characterization). Freezes the shared-engine behaviours the
 * Investment calculator depends on that were not previously covered — END-of-period contribution
 * timing, a negative rate producing negative interest, and the series length being years + 1 (a
 * leading year-0 seed row). Test-only: the engine is UNCHANGED and stays shared with Savings,
 * Retirement, Interest, Compound Interest and the reference tables.
 */
describe('compound interest — Investment-relevant invariants', () => {
  it('contributions are added at the END of each period (ordinary annuity)', () => {
    // 100/period at 12%/yr monthly for 1 year: an ordinary (end-of-period) annuity → 1268.25, not the
    // annuity-due 1280.93. Only 68.25 interest because the last deposit earns nothing in its period.
    const r = calculateCompoundInterest({ principal: 0, annualRatePct: 12, years: 1, compoundsPerYear: 12, contribution: 100 });
    expect(r.futureValue).toBeCloseTo(1268.2503, 2);
    expect(r.totalContributions).toBe(1200);
    expect(r.totalInterest).toBeCloseTo(68.2503, 2);
  });

  it('a negative rate produces a shrinking balance and NEGATIVE interest', () => {
    const r = calculateCompoundInterest({ principal: 1000, annualRatePct: -10, years: 5, compoundsPerYear: 12 });
    expect(r.futureValue).toBeCloseTo(605.2613, 2);
    expect(r.totalInterest).toBeCloseTo(-394.7387, 2);
    expect(r.futureValue).toBeGreaterThan(0);
  });

  it('the yearly series carries a year-0 seed row, so its length is years + 1', () => {
    for (const years of [1, 3, 25]) {
      const r = calculateCompoundInterest({ principal: 500, annualRatePct: 5, years, compoundsPerYear: 12 });
      expect(r.series.length).toBe(years + 1);
      expect(r.series[0].year).toBe(0);
      expect(r.series[years].year).toBe(years);
      expect(r.series[years].balance).toBeCloseTo(r.futureValue, 6);
    }
  });
});

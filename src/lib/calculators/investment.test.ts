import { describe, it, expect } from 'vitest';
import { calculateInvestment } from './investment';

/**
 * Investment formula characterization (R11D1 Commit 1). Freezes the EXACT behaviour of the UNCHANGED
 * calculateInvestment, which delegates to the shared calculateCompoundInterest engine with monthly
 * compounding (compoundsPerYear = 12) and END-of-period monthly contributions. Test-only: no change to
 * calculateInvestment, calculateCompoundInterest, the production compound formulas, the output shape,
 * contribution timing, series behaviour or formatting.
 *
 * Frozen model: futureValue compounds the starting amount + monthly contributions (added at the end of
 * each period) at annualReturnPct/12 per month; startingAmount = max(0, entered); totalContributions =
 * monthlyContribution × 12 × years; totalEarnings = futureValue − startingAmount − totalContributions
 * (MAY be negative for a negative return); the yearly `series` carries a leading YEAR-0 seed row, so
 * series.length = years + 1 and series[years].balance = futureValue for whole years. Inputs are
 * normalized with `|| 0`, principal + years clamp to >= 0 — the future binding rejects malformed fields
 * and collective zero funding while preserving supported economics (a negative return above −100%).
 */

/* ------------------------------------------------------------------ */
/* Ordinary projection — every output                                  */
/* ------------------------------------------------------------------ */

describe('investment — ordinary projection', () => {
  const r = calculateInvestment({ startingAmount: 10000, monthlyContribution: 300, annualReturnPct: 7, years: 25 });
  it('freezes all outputs for 10000 + 300/mo at 7% over 25 years', () => {
    expect(r.futureValue).toBeCloseTo(300275.69, 2);
    expect(r.startingAmount).toBe(10000);
    expect(r.totalContributions).toBe(90000); // 300 × 12 × 25
    expect(r.totalEarnings).toBeCloseTo(200275.69, 2);
  });
  it('is internally consistent + a year-0 seed row (series length = years + 1)', () => {
    expect(r.futureValue).toBeCloseTo(r.startingAmount + r.totalContributions + r.totalEarnings, 6);
    expect(r.series.length).toBe(26);
    expect(r.series[0].year).toBe(0);
    expect(r.series[25].year).toBe(25);
    expect(r.series[25].balance).toBeCloseTo(r.futureValue, 6);
  });
});

/* ------------------------------------------------------------------ */
/* Funding composition                                                 */
/* ------------------------------------------------------------------ */

describe('investment — funding composition', () => {
  it('a starting amount only grows with zero contributions', () => {
    const r = calculateInvestment({ startingAmount: 10000, monthlyContribution: 0, annualReturnPct: 7, years: 10 });
    expect(r.futureValue).toBeCloseTo(20096.6138, 2);
    expect(r.totalContributions).toBe(0);
    expect(r.totalEarnings).toBeCloseTo(10096.6138, 2);
  });
  it('monthly contributions only (end-of-period): count = monthly × 12 × years', () => {
    const r = calculateInvestment({ startingAmount: 0, monthlyContribution: 100, annualReturnPct: 7, years: 10 });
    expect(r.startingAmount).toBe(0);
    expect(r.totalContributions).toBe(12000); // 100 × 120 periods
    expect(r.futureValue).toBeCloseTo(17308.4807, 2);
    expect(r.totalEarnings).toBeCloseTo(5308.4807, 2);
  });
});

/* ------------------------------------------------------------------ */
/* Zero return                                                         */
/* ------------------------------------------------------------------ */

describe('investment — zero return', () => {
  it('future value equals starting + contributions, growth is exactly zero', () => {
    const r = calculateInvestment({ startingAmount: 10000, monthlyContribution: 300, annualReturnPct: 0, years: 10 });
    expect(r.futureValue).toBe(46000); // 10000 + 36000
    expect(r.totalEarnings).toBe(0);
    expect(r.futureValue).toBe(r.startingAmount + r.totalContributions);
  });
  it('holds for starting-only and contribution-only at 0%', () => {
    expect(calculateInvestment({ startingAmount: 5000, monthlyContribution: 0, annualReturnPct: 0, years: 5 }).futureValue).toBe(5000);
    expect(calculateInvestment({ startingAmount: 0, monthlyContribution: 50, annualReturnPct: 0, years: 3 }).futureValue).toBe(1800);
  });
});

/* ------------------------------------------------------------------ */
/* Negative return (supported above -100%)                             */
/* ------------------------------------------------------------------ */

describe('investment — negative return (growth may be negative)', () => {
  it('a negative return yields NEGATIVE growth and a value below the zero-return result', () => {
    const neg = calculateInvestment({ startingAmount: 10000, monthlyContribution: 300, annualReturnPct: -5, years: 10 });
    expect(neg.totalEarnings).toBeCloseTo(-11565.6405, 2);
    expect(neg.futureValue).toBeCloseTo(34434.3595, 2);
    expect(neg.futureValue).toBeLessThan(46000); // below the 0% result
    expect(neg.futureValue).toBeGreaterThan(0);
  });
  it('contribution-only negative return stays positive but loses to the amount contributed', () => {
    const r = calculateInvestment({ startingAmount: 0, monthlyContribution: 100, annualReturnPct: -5, years: 10 });
    expect(r.futureValue).toBeCloseTo(9458.4617, 2);
    expect(r.totalEarnings).toBeCloseTo(-2541.5383, 2);
    expect(r.futureValue).toBeLessThan(r.totalContributions);
  });
});

/* ------------------------------------------------------------------ */
/* Rate boundaries (frozen; the binding rejects <= -100 and non-finite) */
/* ------------------------------------------------------------------ */

describe('investment — rate boundaries (frozen source behaviour)', () => {
  it('at exactly -100% the formula still produces a positive shrinking value (binding rejects it)', () => {
    const r = calculateInvestment({ startingAmount: 1000, monthlyContribution: 100, annualReturnPct: -100, years: 5 });
    expect(r.futureValue).toBeCloseTo(1198.9193, 2);
    expect(r.totalEarnings).toBeCloseTo(-5801.0807, 2);
  });
  it('below -100% is degenerate but finite; a NaN rate normalizes to 0%', () => {
    expect(calculateInvestment({ startingAmount: 1000, monthlyContribution: 100, annualReturnPct: -1200, years: 5 }).futureValue).toBe(100);
    expect(calculateInvestment({ startingAmount: 1000, monthlyContribution: 100, annualReturnPct: NaN, years: 5 }).futureValue).toBe(7000); // 0%
  });
  it('an infinite rate yields a non-finite (malformed) value', () => {
    expect(Number.isFinite(calculateInvestment({ startingAmount: 1000, monthlyContribution: 100, annualReturnPct: Infinity, years: 5 }).futureValue)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Duration (frozen; the binding accepts whole 1..100)                  */
/* ------------------------------------------------------------------ */

describe('investment — duration', () => {
  it('series length is years + 1 for whole years', () => {
    expect(calculateInvestment({ startingAmount: 1000, monthlyContribution: 0, annualReturnPct: 5, years: 1 }).series.length).toBe(2);
    expect(calculateInvestment({ startingAmount: 1000, monthlyContribution: 0, annualReturnPct: 5, years: 100 }).series.length).toBe(101);
  });
  it('a FRACTIONAL year runs round(years×12) periods but the series only carries full years (quirk)', () => {
    const r = calculateInvestment({ startingAmount: 10000, monthlyContribution: 100, annualReturnPct: 6, years: 1.5 });
    expect(r.series.length).toBe(2); // year 0 + year 1 only
    expect(r.series[r.series.length - 1].year).toBe(1);
    // The final series balance (year 1) does NOT equal futureValue (18 periods) — the binding rejects fractional years.
    expect(r.series[r.series.length - 1].balance).not.toBeCloseTo(r.futureValue, 2);
  });
  it('zero / negative years clamp to no periods (future value = starting, series = [year 0])', () => {
    for (const years of [0, -3]) {
      const r = calculateInvestment({ startingAmount: 10000, monthlyContribution: 100, annualReturnPct: 6, years });
      expect(r.futureValue).toBe(10000);
      expect(r.series.length).toBe(1);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Amount edges + collective zero funding                              */
/* ------------------------------------------------------------------ */

describe('investment — amount edges', () => {
  it('a negative starting amount clamps to zero', () => {
    const r = calculateInvestment({ startingAmount: -5000, monthlyContribution: 100, annualReturnPct: 6, years: 5 });
    expect(r.startingAmount).toBe(0);
    expect(r.futureValue).toBeCloseTo(6977.0031, 2);
  });
  it('both amounts zero is an all-zero projection (the binding rejects collective zero funding)', () => {
    const r = calculateInvestment({ startingAmount: 0, monthlyContribution: 0, annualReturnPct: 6, years: 5 });
    expect(r.futureValue).toBe(0);
    expect(r.totalEarnings).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Relationships + precision                                           */
/* ------------------------------------------------------------------ */

describe('investment — relationships + precision', () => {
  it('total contributions = monthly × 12 × years across several inputs', () => {
    expect(calculateInvestment({ startingAmount: 0, monthlyContribution: 250, annualReturnPct: 4, years: 7 }).totalContributions).toBe(21000);
    expect(calculateInvestment({ startingAmount: 500, monthlyContribution: 0, annualReturnPct: 4, years: 7 }).totalContributions).toBe(0);
  });
  it('future value = starting + contributions + growth, and series reconciles (whole years)', () => {
    const r = calculateInvestment({ startingAmount: 5000, monthlyContribution: 200, annualReturnPct: 7, years: 10 });
    expect(r.futureValue).toBeCloseTo(r.startingAmount + r.totalContributions + r.totalEarnings, 6);
    expect(r.series[r.series.length - 1].balance).toBeCloseTo(r.futureValue, 6);
    for (let i = 0; i < r.series.length; i++) expect(r.series[i].year).toBe(i); // ordered
  });
  it('keeps full float precision (fractional-cent outputs, not pre-rounded)', () => {
    const r = calculateInvestment({ startingAmount: 3333.33, monthlyContribution: 77.77, annualReturnPct: 5.5, years: 8 });
    expect(r.futureValue).not.toBe(Math.round(r.futureValue * 100) / 100);
  });
});

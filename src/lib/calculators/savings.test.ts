import { describe, it, expect } from 'vitest';
import { projectSavings, requiredMonthlyForGoal } from './savings';

/**
 * Savings formula characterization (R8D1 Commit 1).
 *
 * Locks the EXACT current behaviour of `projectSavings` (start + monthly deposit + rate +
 * years → future value + total deposited + interest + a yearly series) and
 * `requiredMonthlyForGoal` (goal + start + rate + years → required monthly deposit), which
 * delegate to the shared `calculateCompoundInterest` (monthly compounding, end-of-period
 * deposits). The yearly `series` is characterized here so its current shape is frozen even
 * though R8D1 keeps the calculator SUMMARY-ONLY (the series is not rendered).
 *
 * Characterization only: no production code changes, no output changes.
 */

describe('projectSavings — future value + total deposited + interest', () => {
  it('representative: starting balance + monthly deposit at a decimal rate', () => {
    const r = projectSavings({ startingAmount: 10000, monthlyContribution: 300, annualRatePct: 5, years: 10 });
    expect(r.futureValue).toBeCloseTo(63054.78, 1);
    expect(r.totalContributions).toBe(46000); // 10,000 start + 300 × 120
    expect(r.totalInterest).toBeCloseTo(r.futureValue - 46000, 6);
  });

  it('zero interest sums the deposits (start + monthly × months)', () => {
    expect(projectSavings({ startingAmount: 0, monthlyContribution: 100, annualRatePct: 0, years: 2 })).toMatchObject({
      futureValue: 2400,
      totalContributions: 2400,
      totalInterest: 0,
    });
  });

  it('zero monthly deposit is valid — a lump-sum projection', () => {
    const r = projectSavings({ startingAmount: 1000, monthlyContribution: 0, annualRatePct: 0, years: 5 });
    expect(r).toMatchObject({ futureValue: 1000, totalContributions: 1000, totalInterest: 0 });
  });

  it('zero start AND zero deposit is a valid all-zero projection', () => {
    expect(projectSavings({ startingAmount: 0, monthlyContribution: 0, annualRatePct: 5, years: 10 })).toMatchObject({
      futureValue: 0,
      totalContributions: 0,
      totalInterest: 0,
    });
  });

  it('a lump sum grows by monthly compounding (end-of-period)', () => {
    // 1,000 at 12% for 1 year, no deposits → 1000 × (1.01)^12.
    const r = projectSavings({ startingAmount: 1000, monthlyContribution: 0, annualRatePct: 12, years: 1 });
    expect(r.futureValue).toBeCloseTo(1000 * Math.pow(1.01, 12), 6);
    expect(r.totalContributions).toBe(1000);
    expect(r.totalInterest).toBeCloseTo(r.futureValue - 1000, 6);
  });

  it('negative inputs are clamped (start → 0) and non-finite years collapse to a lump sum', () => {
    expect(projectSavings({ startingAmount: -5000, monthlyContribution: 0, annualRatePct: 0, years: 1 }).futureValue).toBe(0);
    // NaN years → round(NaN·... ) via the engine's `years || 0` → 0 periods → just the principal.
    expect(projectSavings({ startingAmount: 1000, monthlyContribution: 100, annualRatePct: 5, years: NaN }).futureValue).toBe(1000);
  });

  it('every finite input yields a finite future value (no NaN/Infinity)', () => {
    for (const yrs of [1, 5, 10, 30]) {
      const r = projectSavings({ startingAmount: 2000, monthlyContribution: 150, annualRatePct: 6, years: yrs });
      expect(Number.isFinite(r.futureValue)).toBe(true);
      expect(Number.isFinite(r.totalInterest)).toBe(true);
    }
  });
});

describe('projectSavings — yearly series (latent; frozen, not rendered in R8D1)', () => {
  it('has one row per year plus a year-0 row, ending at the future value', () => {
    const r = projectSavings({ startingAmount: 0, monthlyContribution: 100, annualRatePct: 0, years: 2 });
    expect(r.series.map((s) => s.year)).toEqual([0, 1, 2]); // year 0..N
    expect(r.series[0]).toEqual({ year: 0, balance: 0, contributed: 0, interest: 0 });
    expect(r.series[1]).toMatchObject({ year: 1, balance: 1200, contributed: 1200, interest: 0 });
    expect(r.series[r.series.length - 1].balance).toBeCloseTo(r.futureValue, 6); // final row = FV
  });

  it('row cumulative relationships hold (interest = balance − start − contributed)', () => {
    const start = 3000;
    const r = projectSavings({ startingAmount: start, monthlyContribution: 200, annualRatePct: 6, years: 5 });
    expect(r.series).toHaveLength(6); // years 0..5
    for (const row of r.series) {
      expect(row.interest).toBeCloseTo(row.balance - start - row.contributed, 6);
    }
    expect(r.series.at(-1)!.balance).toBeCloseTo(r.futureValue, 6);
  });

  it('a fractional year rounds the total months but still emits whole-year rows', () => {
    // years 2.5 → round(2.5 × 12) = 30 months; whole-year rows at 12/24 months → years 0,1,2.
    const r = projectSavings({ startingAmount: 0, monthlyContribution: 100, annualRatePct: 0, years: 2.5 });
    expect(r.series.map((s) => s.year)).toEqual([0, 1, 2]);
    expect(r.futureValue).toBeCloseTo(3000, 6); // 30 × 100
  });

  it('zero / negative years produce only the year-0 row', () => {
    expect(projectSavings({ startingAmount: 500, monthlyContribution: 100, annualRatePct: 5, years: 0 }).series).toEqual([
      { year: 0, balance: 500, contributed: 0, interest: 0 },
    ]);
    expect(projectSavings({ startingAmount: 500, monthlyContribution: 100, annualRatePct: 5, years: -3 }).series).toHaveLength(1);
  });
});

describe('requiredMonthlyForGoal — solve the monthly deposit', () => {
  it('zero interest: (goal − start) / months', () => {
    expect(requiredMonthlyForGoal({ goal: 12000, startingAmount: 0, annualRatePct: 0, years: 1 })).toBeCloseTo(1000, 6);
    expect(requiredMonthlyForGoal({ goal: 24000, startingAmount: 6000, annualRatePct: 0, years: 1 })).toBeCloseTo(1500, 6);
  });

  it('representative with interest is positive and finite', () => {
    const m = requiredMonthlyForGoal({ goal: 100000, startingAmount: 20000, annualRatePct: 6, years: 10 });
    expect(m).toBeGreaterThan(0);
    expect(Number.isFinite(m)).toBe(true);
  });

  it('goal already reached by the grown starting balance → 0', () => {
    expect(requiredMonthlyForGoal({ goal: 1000, startingAmount: 5000, annualRatePct: 5, years: 5 })).toBe(0);
  });

  it('goal below or at the grown-start boundary → 0', () => {
    // 10,000 at 0% stays 10,000; a goal of 10,000 is exactly reached, 8,000 is below.
    expect(requiredMonthlyForGoal({ goal: 10000, startingAmount: 10000, annualRatePct: 0, years: 5 })).toBe(0);
    expect(requiredMonthlyForGoal({ goal: 8000, startingAmount: 10000, annualRatePct: 0, years: 5 })).toBe(0);
  });

  it('zero and negative years clamp to 0 (via max(0, round(years·12)))', () => {
    expect(requiredMonthlyForGoal({ goal: 5000, startingAmount: 0, annualRatePct: 5, years: 0 })).toBe(0);
    expect(requiredMonthlyForGoal({ goal: 5000, startingAmount: 0, annualRatePct: 5, years: -2 })).toBe(0);
  });

  it('zero and negative goal → 0 (nothing to save toward)', () => {
    expect(requiredMonthlyForGoal({ goal: 0, startingAmount: 0, annualRatePct: 5, years: 5 })).toBe(0);
    expect(requiredMonthlyForGoal({ goal: -100, startingAmount: 0, annualRatePct: 5, years: 5 })).toBe(0);
  });

  it('a fractional year rounds to whole months before solving', () => {
    // years 1.04 → round(12.48) = 12 months → same as 1 year.
    const oneYear = requiredMonthlyForGoal({ goal: 12000, startingAmount: 0, annualRatePct: 0, years: 1 });
    expect(requiredMonthlyForGoal({ goal: 12000, startingAmount: 0, annualRatePct: 0, years: 1.04 })).toBeCloseTo(oneYear, 6);
  });

  it('the result is never negative and never non-finite for finite inputs', () => {
    for (const goal of [0, 1000, 50000, 250000]) {
      const m = requiredMonthlyForGoal({ goal, startingAmount: 3000, annualRatePct: 4, years: 8 });
      expect(m).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(m)).toBe(true);
    }
  });
});

describe('savings — cross-mode consistency', () => {
  it('the required deposit for a target, fed into a projection, lands near the target', () => {
    const goal = 100000;
    const m = requiredMonthlyForGoal({ goal, startingAmount: 20000, annualRatePct: 6, years: 10 });
    const r = projectSavings({ startingAmount: 20000, monthlyContribution: m, annualRatePct: 6, years: 10 });
    expect(r.futureValue).toBeCloseTo(goal, 0); // within a dollar (same monthly engine both ways)
  });

  it('zero-interest round trip is exact', () => {
    const m = requiredMonthlyForGoal({ goal: 30000, startingAmount: 6000, annualRatePct: 0, years: 5 });
    const r = projectSavings({ startingAmount: 6000, monthlyContribution: m, annualRatePct: 0, years: 5 });
    expect(r.futureValue).toBeCloseTo(30000, 6);
  });
});

import { describe, it, expect } from 'vitest';
import { calculateRetirement } from './retirement';
import { calculateCompoundInterest } from './compound-interest';

/**
 * Retirement characterization (R18B3, Commit 1 — test-only). Freezes the exact frozen
 * contract of `calculateRetirement` before the task-first migration; no module change.
 * Retirement is a thin wrapper over the SHARED `calculateCompoundInterest` engine (monthly
 * compounding, monthly end-of-period contributions) plus a withdrawal-rate step. The
 * wrapper's delegation is frozen by RECONCILING against a direct engine call rather than
 * hand-computing compound floating-point values; the withdrawal + horizon math is pinned
 * exactly. The compound engine + Investment + Savings stay untouched (regressions run in
 * the same suite).
 *
 * Contract recap: years = max(0, retirementAge − currentAge); the engine runs with
 * principal = currentSavings, rate = annualReturnPct, compoundsPerYear = 12,
 * contribution = monthlyContribution; nestEgg = futureValue; totalContributions /
 * totalEarnings pass through; estimatedAnnualIncome = nestEgg × (withdrawalRatePct ?? 4)/100;
 * estimatedMonthlyIncome = annual/12; a latent yearly series (length years+1) is produced
 * but the UI does not render it. The source clamps a below-current horizon to 0 and treats
 * NaN inputs as 0 (|| 0) — the visitor binding validates these more strictly.
 */

describe('retirement — time horizon', () => {
  it('years to retirement is the age difference', () => {
    expect(calculateRetirement({ currentAge: 30, retirementAge: 65, currentSavings: 0, monthlyContribution: 100, annualReturnPct: 5 }).yearsToRetirement).toBe(35);
  });

  it('already-at-retirement age → 0 years, nest egg = current savings', () => {
    const r = calculateRetirement({ currentAge: 65, retirementAge: 65, currentSavings: 50000, monthlyContribution: 0, annualReturnPct: 5 });
    expect(r.yearsToRetirement).toBe(0);
    expect(r.nestEgg).toBeCloseTo(50000, 6);
  });

  it('retirement age below current age clamps the horizon to 0 (pure source)', () => {
    const r = calculateRetirement({ currentAge: 65, retirementAge: 60, currentSavings: 50000, monthlyContribution: 0, annualReturnPct: 5 });
    expect(r.yearsToRetirement).toBe(0);
    expect(r.nestEgg).toBeCloseTo(50000, 6);
  });

  it('a one-year horizon accumulates 12 monthly periods', () => {
    const r = calculateRetirement({ currentAge: 64, retirementAge: 65, currentSavings: 0, monthlyContribution: 100, annualReturnPct: 0 });
    expect(r.yearsToRetirement).toBe(1);
    expect(r.totalContributions).toBeCloseTo(1200, 6); // 12 × 100
  });
});

describe('retirement — delegation to the shared compound engine', () => {
  it('reconciles every field against a direct engine call (monthly compounding + contributions)', () => {
    const input = { currentAge: 30, retirementAge: 65, currentSavings: 20000, monthlyContribution: 500, annualReturnPct: 6, withdrawalRatePct: 4 };
    const r = calculateRetirement(input);
    const ci = calculateCompoundInterest({ principal: 20000, annualRatePct: 6, years: 35, compoundsPerYear: 12, contribution: 500 });
    expect(r.nestEgg).toBe(ci.futureValue);
    expect(r.totalContributions).toBe(ci.totalContributions);
    expect(r.totalEarnings).toBe(ci.totalInterest);
    expect(r.estimatedAnnualIncome).toBe(ci.futureValue * 0.04);
    expect(r.estimatedMonthlyIncome).toBe(r.estimatedAnnualIncome / 12);
    expect(r.series).toEqual(ci.series);
  });

  it('nest egg = current savings + total contributions + total earnings', () => {
    const r = calculateRetirement({ currentAge: 25, retirementAge: 60, currentSavings: 15000, monthlyContribution: 300, annualReturnPct: 7 });
    expect(r.nestEgg).toBeCloseTo(15000 + r.totalContributions + r.totalEarnings, 4);
  });

  it('produces a yearly series (length years + 1) whose last balance equals the nest egg', () => {
    const r = calculateRetirement({ currentAge: 30, retirementAge: 35, currentSavings: 10000, monthlyContribution: 0, annualReturnPct: 5 });
    expect(r.series.length).toBe(5 + 1); // year-0 seed + 5 years
    expect(r.series[0].year).toBe(0);
    expect(r.series[r.series.length - 1].balance).toBeCloseTo(r.nestEgg, 6);
  });
});

describe('retirement — balance + contributions', () => {
  it('zero current savings projects from contributions alone', () => {
    const r = calculateRetirement({ currentAge: 30, retirementAge: 40, currentSavings: 0, monthlyContribution: 100, annualReturnPct: 5 });
    expect(r.nestEgg).toBeGreaterThan(0);
    expect(r.totalContributions).toBeCloseTo(12000, 6); // 10 yr × 12 × 100
  });

  it('zero contribution grows only the current savings', () => {
    const r = calculateRetirement({ currentAge: 30, retirementAge: 40, currentSavings: 50000, monthlyContribution: 0, annualReturnPct: 5 });
    expect(r.totalContributions).toBe(0);
    expect(r.nestEgg).toBeGreaterThan(50000);
  });

  it('contributions accumulate monthly (12 per year)', () => {
    const r = calculateRetirement({ currentAge: 30, retirementAge: 40, currentSavings: 0, monthlyContribution: 200, annualReturnPct: 0 });
    expect(r.totalContributions).toBeCloseTo(24000, 6); // 10 × 12 × 200
  });
});

describe('retirement — return / compounding', () => {
  it('zero return → no earnings, nest egg = savings + contributions', () => {
    const r = calculateRetirement({ currentAge: 40, retirementAge: 50, currentSavings: 50000, monthlyContribution: 200, annualReturnPct: 0 });
    expect(r.totalEarnings).toBeCloseTo(0, 6);
    expect(r.nestEgg).toBeCloseTo(50000 + 24000, 6);
  });

  it('a positive return produces positive earnings above contributions + savings', () => {
    const r = calculateRetirement({ currentAge: 30, retirementAge: 65, currentSavings: 20000, monthlyContribution: 500, annualReturnPct: 6 });
    expect(r.totalEarnings).toBeGreaterThan(0);
    expect(r.nestEgg).toBeGreaterThan(r.totalContributions + 20000);
  });

  it('a negative return is accepted by the source (nest egg loses value) — pure source', () => {
    // The engine supports negative rates; the visitor binding restricts return to >= 0.
    const r = calculateRetirement({ currentAge: 30, retirementAge: 40, currentSavings: 100000, monthlyContribution: 0, annualReturnPct: -5 });
    expect(r.nestEgg).toBeLessThan(100000);
    expect(r.totalEarnings).toBeLessThan(0);
  });
});

describe('retirement — withdrawal', () => {
  it('estimated income = nest egg × withdrawal rate, defaulting to 4% when omitted', () => {
    const base = { currentAge: 40, retirementAge: 60, currentSavings: 100000, monthlyContribution: 0, annualReturnPct: 0 };
    const def = calculateRetirement(base); // withdrawalRatePct omitted → 4%
    expect(def.nestEgg).toBeCloseTo(100000, 6);
    expect(def.estimatedAnnualIncome).toBeCloseTo(4000, 6);
    expect(def.estimatedMonthlyIncome).toBeCloseTo(333.33, 1);
    const custom = calculateRetirement({ ...base, withdrawalRatePct: 3.5 });
    expect(custom.estimatedAnnualIncome).toBeCloseTo(100000 * 0.035, 6);
    expect(custom.estimatedMonthlyIncome).toBe(custom.estimatedAnnualIncome / 12);
  });

  it('zero withdrawal rate → zero estimated income', () => {
    const r = calculateRetirement({ currentAge: 40, retirementAge: 60, currentSavings: 100000, monthlyContribution: 0, annualReturnPct: 0, withdrawalRatePct: 0 });
    expect(r.estimatedAnnualIncome).toBe(0);
    expect(r.estimatedMonthlyIncome).toBe(0);
  });

  it('a negative withdrawal rate → negative estimated income (pure source)', () => {
    const r = calculateRetirement({ currentAge: 40, retirementAge: 60, currentSavings: 100000, monthlyContribution: 0, annualReturnPct: 0, withdrawalRatePct: -4 });
    expect(r.estimatedAnnualIncome).toBeCloseTo(-4000, 6);
  });
});

describe('retirement — result contract + pure-source edges', () => {
  it('returns exactly the seven-field result contract, all scalars finite', () => {
    const r = calculateRetirement({ currentAge: 30, retirementAge: 65, currentSavings: 20000, monthlyContribution: 500, annualReturnPct: 6 });
    expect(Object.keys(r).sort()).toEqual([
      'estimatedAnnualIncome', 'estimatedMonthlyIncome', 'nestEgg', 'series', 'totalContributions', 'totalEarnings', 'yearsToRetirement',
    ]);
    for (const k of ['nestEgg', 'totalContributions', 'totalEarnings', 'estimatedAnnualIncome', 'estimatedMonthlyIncome', 'yearsToRetirement'] as const) {
      expect(Number.isFinite(r[k])).toBe(true);
    }
    expect(Array.isArray(r.series)).toBe(true);
  });

  it('treats a NaN age as 0 (via || 0)', () => {
    const r = calculateRetirement({ currentAge: Number.NaN, retirementAge: 30, currentSavings: 1000, monthlyContribution: 0, annualReturnPct: 0 });
    expect(r.yearsToRetirement).toBe(30); // 30 − 0
  });

  it('a decimal age produces a fractional horizon the engine rounds into periods', () => {
    const r = calculateRetirement({ currentAge: 30, retirementAge: 65.5, currentSavings: 1000, monthlyContribution: 0, annualReturnPct: 0 });
    expect(r.yearsToRetirement).toBeCloseTo(35.5, 6);
  });

  it('is deterministic', () => {
    const input = { currentAge: 33, retirementAge: 67, currentSavings: 42000, monthlyContribution: 650, annualReturnPct: 5.5, withdrawalRatePct: 3.8 };
    expect(calculateRetirement(input)).toEqual(calculateRetirement(input));
  });
});

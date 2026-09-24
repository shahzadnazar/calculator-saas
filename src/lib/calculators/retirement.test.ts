import { describe, it, expect } from 'vitest';
import {
  calculateRetirement,
  calculateMoneyLasts,
  sustainableWithdrawal,
  MAX_LASTS_MONTHS,
} from './retirement';
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
 *
 * R18B3.1 additions (still test-only, no module change): freeze that the pure source treats a
 * ZERO-FUNDED projection (0 savings + 0 contribution) over a valid horizon as an ordinary
 * all-zero result — NOT a degenerate/error case — and that it applies NO upper age cap (ages
 * above any UI hint compute normally). These pin the source behaviour the R18B3.1 binding stops
 * over-restricting; pure-source behaviour stays distinct from visitor validation.
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

describe('retirement — zero-funded projection is an ordinary all-zero result (pure source, R18B3.1)', () => {
  it('zero savings AND zero contribution over a valid horizon → every field is a finite 0, not degenerate', () => {
    const r = calculateRetirement({ currentAge: 30, retirementAge: 65, currentSavings: 0, monthlyContribution: 0, annualReturnPct: 6, withdrawalRatePct: 4 });
    const ci = calculateCompoundInterest({ principal: 0, annualRatePct: 6, years: 35, compoundsPerYear: 12, contribution: 0 });
    expect(r.yearsToRetirement).toBe(35); // horizon is unaffected by funding
    expect(r.nestEgg).toBe(0);
    expect(r.totalContributions).toBe(0);
    expect(r.totalEarnings).toBe(0);
    expect(r.estimatedAnnualIncome).toBe(0);
    expect(r.estimatedMonthlyIncome).toBe(0);
    expect(r.series).toEqual(ci.series); // year-0 seed + 35 yearly points
    expect(r.series.length).toBe(36);
    expect(r.series.every((y) => y.balance === 0 && y.contributed === 0 && y.interest === 0)).toBe(true);
  });

  it('a zero-return, zero-funded projection is still all-zero (no NaN / negative leak)', () => {
    const r = calculateRetirement({ currentAge: 40, retirementAge: 60, currentSavings: 0, monthlyContribution: 0, annualReturnPct: 0, withdrawalRatePct: 4 });
    for (const k of ['nestEgg', 'totalContributions', 'totalEarnings', 'estimatedAnnualIncome', 'estimatedMonthlyIncome'] as const) {
      expect(r[k]).toBe(0);
    }
    expect(r.yearsToRetirement).toBe(20);
  });
});

describe('retirement — no upper age cap in the pure source (R18B3.1)', () => {
  it('a current age above 120 computes normally — the horizon is the age difference', () => {
    const r = calculateRetirement({ currentAge: 130, retirementAge: 140, currentSavings: 1000, monthlyContribution: 0, annualReturnPct: 5 });
    const ci = calculateCompoundInterest({ principal: 1000, annualRatePct: 5, years: 10, compoundsPerYear: 12, contribution: 0 });
    expect(r.yearsToRetirement).toBe(10);
    expect(r.nestEgg).toBe(ci.futureValue);
  });

  it('a retirement age above 120 computes normally', () => {
    const r = calculateRetirement({ currentAge: 60, retirementAge: 200, currentSavings: 0, monthlyContribution: 100, annualReturnPct: 3 });
    expect(r.yearsToRetirement).toBe(140);
    expect(r.nestEgg).toBeGreaterThan(0);
  });

  it('both ages above 120 with retirementAge > currentAge reconcile with a direct engine call', () => {
    const r = calculateRetirement({ currentAge: 125, retirementAge: 130, currentSavings: 5000, monthlyContribution: 50, annualReturnPct: 4 });
    const ci = calculateCompoundInterest({ principal: 5000, annualRatePct: 4, years: 5, compoundsPerYear: 12, contribution: 50 });
    expect(r.yearsToRetirement).toBe(5);
    expect(r.nestEgg).toBe(ci.futureValue);
    expect(r.totalContributions).toBe(ci.totalContributions);
  });
});

/* ------------------------------------------------------------------ */
/* How long can your money last — the boundary, in detail              */
/* ------------------------------------------------------------------ */

/**
 * This is the mode where a wrong answer is worst: telling someone their money
 * never runs out when it does. Withdrawals come out at the START of the month
 * and the remainder earns for that month, so the balance holds at
 * `d = B·rm/(1+rm)` — NOT at `B·rm`, which is the end-of-month answer and the
 * more generous of the two. The band between them is small in percentage terms
 * and enormous in consequence, so it is pinned here from both sides.
 */
describe('money lasts — the sustainable-withdrawal boundary', () => {
  const POT = 600000;
  const RATE = 6;
  const rm = RATE / 100 / 12;

  it('the hold point is B·rm/(1+rm), and it is BELOW the naive B·rm', () => {
    const hold = sustainableWithdrawal(POT, RATE);
    expect(hold).toBeCloseTo((POT * rm) / (1 + rm), 9);
    expect(hold).toBeCloseTo(2985.0746, 3);
    expect(hold).toBeLessThan(POT * rm); // the naive threshold would over-promise
  });
  it('is zero when there is nothing to draw on, or nothing being earned', () => {
    expect(sustainableWithdrawal(0, RATE)).toBe(0);
    expect(sustainableWithdrawal(POT, 0)).toBe(0);
    expect(sustainableWithdrawal(-1, RATE)).toBe(0);
  });

  it('AT the hold point the balance holds and the money never runs out', () => {
    const r = calculateMoneyLasts({ amount: POT, monthlyWithdrawal: sustainableWithdrawal(POT, RATE), annualReturnPct: RATE });
    expect(r.neverRunsOut).toBe(true);
    expect(r.reachedLimit).toBe(true);
    expect(r.endingBalance).toBeCloseTo(POT, 0);
  });
  it('BELOW the hold point the balance grows, and it never runs out', () => {
    const r = calculateMoneyLasts({ amount: POT, monthlyWithdrawal: 2000, annualReturnPct: RATE });
    expect(r.neverRunsOut).toBe(true);
    expect(r.endingBalance).toBeGreaterThan(POT);
  });

  it('JUST ABOVE the hold point the balance falls — never promised as permanent', () => {
    // Every one of these sits inside the band the naive B·rm threshold would have
    // called sustainable. None of them is.
    for (const draw of [2986, 2990, 2995, 3000]) {
      const r = calculateMoneyLasts({ amount: POT, monthlyWithdrawal: draw, annualReturnPct: RATE });
      expect(r.neverRunsOut).toBe(false);
      expect(r.endingBalance).toBeLessThan(POT);
    }
  });
  it('...and two of those actually empty the account inside the projection', () => {
    expect(calculateMoneyLasts({ amount: POT, monthlyWithdrawal: 2995, annualReturnPct: RATE }).months).toBe(1145);
    expect(calculateMoneyLasts({ amount: POT, monthlyWithdrawal: 3000, annualReturnPct: RATE }).months).toBe(1064);
    for (const draw of [2995, 3000]) {
      const r = calculateMoneyLasts({ amount: POT, monthlyWithdrawal: draw, annualReturnPct: RATE });
      expect(r.reachedLimit).toBe(false);
      expect(r.endingBalance).toBeLessThanOrEqual(0.01);
    }
  });
  it('a pot still shrinking at the cap is reported by duration, not as permanent', () => {
    const r = calculateMoneyLasts({ amount: POT, monthlyWithdrawal: 2990, annualReturnPct: RATE });
    expect(r.reachedLimit).toBe(true);
    expect(r.neverRunsOut).toBe(false); // the distinction that keeps the claim honest
    expect(r.months).toBe(MAX_LASTS_MONTHS);
  });
});

describe('money lasts — ordinary and edge cases', () => {
  it('reproduces the reference case', () => {
    const r = calculateMoneyLasts({ amount: 600000, monthlyWithdrawal: 5000, annualReturnPct: 6 });
    expect(r.months).toBe(183);
    expect(r.years).toBe(15);
    expect(r.remainingMonths).toBe(3);
    expect(r.neverRunsOut).toBe(false);
    expect(r.reachedLimit).toBe(false);
  });
  it('the parts always reconstruct the whole', () => {
    for (const draw of [1000, 2500, 5000, 20000]) {
      const r = calculateMoneyLasts({ amount: 600000, monthlyWithdrawal: draw, annualReturnPct: 6 });
      expect(r.years * 12 + r.remainingMonths).toBe(r.months);
      expect(r.months).toBeLessThanOrEqual(MAX_LASTS_MONTHS);
      expect(Number.isInteger(r.months)).toBe(true);
    }
  });
  it('the total withdrawn is SUMMED, never assumed from the month count', () => {
    // The final month pays out only what is left, so the total is below draw × months.
    const r = calculateMoneyLasts({ amount: 600000, monthlyWithdrawal: 5000, annualReturnPct: 6 });
    expect(r.totalWithdrawn).toBeLessThanOrEqual(5000 * r.months);
    expect(r.totalWithdrawn).toBeGreaterThan(5000 * (r.months - 1));
    expect(r.totalWithdrawn).toBeCloseTo(911128.18, 2);
  });
  it('a 0% return is simple division, rounded up for the part-month', () => {
    expect(calculateMoneyLasts({ amount: 600000, monthlyWithdrawal: 5000, annualReturnPct: 0 }).months).toBe(120);
    expect(calculateMoneyLasts({ amount: 10000, monthlyWithdrawal: 3000, annualReturnPct: 0 }).months).toBe(4);
    const partial = calculateMoneyLasts({ amount: 10000, monthlyWithdrawal: 3000, annualReturnPct: 0 });
    expect(partial.totalWithdrawn).toBeCloseTo(10000, 6); // never pays out more than there was
    expect(partial.neverRunsOut).toBe(false);
  });
  it('a withdrawal larger than the pot empties it in one month', () => {
    const r = calculateMoneyLasts({ amount: 1000, monthlyWithdrawal: 5000, annualReturnPct: 6 });
    expect(r.months).toBe(1);
    expect(r.totalWithdrawn).toBe(1000);
    expect(r.endingBalance).toBe(0);
  });
  it('an empty pot lasts no time at all, and claims nothing', () => {
    const r = calculateMoneyLasts({ amount: 0, monthlyWithdrawal: 5000, annualReturnPct: 6 });
    expect(r.months).toBe(0);
    expect(r.totalWithdrawn).toBe(0);
    expect(r.neverRunsOut).toBe(false);
    expect(r.reachedLimit).toBe(false);
  });
  it('a zero withdrawal never depletes the pot and never claims a payout', () => {
    const r = calculateMoneyLasts({ amount: 600000, monthlyWithdrawal: 0, annualReturnPct: 6 });
    expect(r.totalWithdrawn).toBe(0);
    expect(r.neverRunsOut).toBe(true);
    expect(r.reachedLimit).toBe(true);
  });
  it('the yearly series tracks the balance and stops with it', () => {
    const r = calculateMoneyLasts({ amount: 600000, monthlyWithdrawal: 5000, annualReturnPct: 6 });
    expect(r.series.length).toBe(Math.floor(r.months / 12));
    for (let i = 1; i < r.series.length; i++) {
      expect(r.series[i].balance).toBeLessThan(r.series[i - 1].balance);
      expect(r.series[i].balance).toBeGreaterThanOrEqual(0);
    }
  });
  it('a higher withdrawal never lasts longer than a lower one', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const draw of [2000, 3000, 4000, 5000, 8000, 20000]) {
      const months = calculateMoneyLasts({ amount: 600000, monthlyWithdrawal: draw, annualReturnPct: 6 }).months;
      expect(months).toBeLessThanOrEqual(previous);
      previous = months;
    }
  });
  it('a higher return never lasts shorter than a lower one', () => {
    let previous = 0;
    for (const rate of [0, 2, 4, 6, 8]) {
      const months = calculateMoneyLasts({ amount: 600000, monthlyWithdrawal: 5000, annualReturnPct: rate }).months;
      expect(months).toBeGreaterThanOrEqual(previous);
      previous = months;
    }
  });
  it('never loops beyond the cap, whatever it is given', () => {
    for (const input of [
      { amount: 1e12, monthlyWithdrawal: 1, annualReturnPct: 20 },
      { amount: 600000, monthlyWithdrawal: 0.01, annualReturnPct: 0 },
      { amount: 600000, monthlyWithdrawal: 1, annualReturnPct: 0 },
    ]) {
      const r = calculateMoneyLasts(input);
      expect(r.months).toBeLessThanOrEqual(MAX_LASTS_MONTHS);
      expect(Number.isFinite(r.totalWithdrawn)).toBe(true);
    }
  });
});

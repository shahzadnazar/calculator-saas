/**
 * Savings projections: grow regular deposits, or solve for the monthly deposit
 * needed to hit a goal. Pure and unit-tested. Reuses the compound engine.
 */
import { calculateCompoundInterest, type CompoundYear } from '@lib/calculators/compound-interest';

export interface SavingsInput {
  startingAmount: number;
  monthlyContribution: number;
  annualRatePct: number;
  years: number;
}

export interface SavingsResult {
  futureValue: number;
  totalContributions: number;
  totalInterest: number;
  series: CompoundYear[];
}

export function projectSavings(input: SavingsInput): SavingsResult {
  const r = calculateCompoundInterest({
    principal: input.startingAmount,
    annualRatePct: input.annualRatePct,
    years: input.years,
    compoundsPerYear: 12,
    contribution: input.monthlyContribution,
  });
  return {
    futureValue: r.futureValue,
    totalContributions: r.totalPrincipal + r.totalContributions,
    totalInterest: r.totalInterest,
    series: r.series,
  };
}

export interface SavingsGoalInput {
  goal: number;
  startingAmount: number;
  annualRatePct: number;
  years: number;
}

/** Monthly deposit required to reach `goal` in `years`, given a starting sum. */
export function requiredMonthlyForGoal(input: SavingsGoalInput): number {
  const i = (input.annualRatePct || 0) / 100 / 12;
  const n = Math.max(0, Math.round((input.years || 0) * 12));
  if (n === 0) return 0;
  const grownStart =
    i === 0 ? input.startingAmount || 0 : (input.startingAmount || 0) * Math.pow(1 + i, n);
  const remaining = (input.goal || 0) - grownStart;
  if (remaining <= 0) return 0; // already there
  if (i === 0) return remaining / n;
  const annuityFactor = (Math.pow(1 + i, n) - 1) / i;
  return remaining / annuityFactor;
}

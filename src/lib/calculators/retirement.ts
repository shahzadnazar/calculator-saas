/**
 * Retirement projection: grow current savings + monthly contributions to
 * retirement age, then estimate sustainable income via a withdrawal rate.
 * Reuses the compound-interest engine. Pure and unit-tested.
 */
import { calculateCompoundInterest, type CompoundYear } from '@lib/calculators/compound-interest';

export interface RetirementInput {
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  monthlyContribution: number;
  annualReturnPct: number;
  /** Safe withdrawal rate in retirement (default 4%). */
  withdrawalRatePct?: number;
}

export interface RetirementResult {
  yearsToRetirement: number;
  nestEgg: number;
  totalContributions: number;
  totalEarnings: number;
  estimatedAnnualIncome: number;
  estimatedMonthlyIncome: number;
  series: CompoundYear[];
}

export function calculateRetirement(input: RetirementInput): RetirementResult {
  const years = Math.max(0, (input.retirementAge || 0) - (input.currentAge || 0));
  const r = calculateCompoundInterest({
    principal: input.currentSavings,
    annualRatePct: input.annualReturnPct,
    years,
    compoundsPerYear: 12,
    contribution: input.monthlyContribution,
  });
  const withdrawalRate = (input.withdrawalRatePct ?? 4) / 100;
  const estimatedAnnualIncome = r.futureValue * withdrawalRate;
  return {
    yearsToRetirement: years,
    nestEgg: r.futureValue,
    totalContributions: r.totalContributions,
    totalEarnings: r.totalInterest,
    estimatedAnnualIncome,
    estimatedMonthlyIncome: estimatedAnnualIncome / 12,
    series: r.series,
  };
}

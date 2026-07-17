/**
 * Investment growth: lump sum + monthly contributions compounding monthly.
 * Reuses the compound-interest engine. Pure and unit-tested.
 */
import { calculateCompoundInterest, type CompoundYear } from '@lib/calculators/compound-interest';

export interface InvestmentInput {
  startingAmount: number;
  monthlyContribution: number;
  annualReturnPct: number;
  years: number;
}

export interface InvestmentResult {
  futureValue: number;
  startingAmount: number;
  totalContributions: number;
  totalEarnings: number;
  series: CompoundYear[];
}

export function calculateInvestment(input: InvestmentInput): InvestmentResult {
  const r = calculateCompoundInterest({
    principal: input.startingAmount,
    annualRatePct: input.annualReturnPct,
    years: input.years,
    compoundsPerYear: 12,
    contribution: input.monthlyContribution,
  });
  return {
    futureValue: r.futureValue,
    startingAmount: r.totalPrincipal,
    totalContributions: r.totalContributions,
    totalEarnings: r.totalInterest,
    series: r.series,
  };
}

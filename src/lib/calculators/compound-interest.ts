/**
 * Compound interest with optional regular contributions. Pure and unit-tested.
 *
 * Interest compounds `compoundsPerYear` times per year. Contributions are added
 * at the same frequency (end of period). Produces a yearly balance series for
 * charting/tables.
 */

export interface CompoundInput {
  principal: number;
  annualRatePct: number;
  years: number;
  compoundsPerYear: number; // 1, 4, 12, 365...
  contribution?: number; // amount added each compounding period
}

export interface CompoundYear {
  year: number;
  balance: number;
  contributed: number; // cumulative contributions (excl. principal)
  interest: number; // cumulative interest earned
}

export interface CompoundResult {
  futureValue: number;
  totalPrincipal: number;
  totalContributions: number;
  totalInterest: number;
  series: CompoundYear[];
}

export function calculateCompoundInterest(input: CompoundInput): CompoundResult {
  const principal = Math.max(0, input.principal || 0);
  const n = Math.max(1, Math.round(input.compoundsPerYear || 1));
  const years = Math.max(0, input.years || 0);
  const ratePerPeriod = (input.annualRatePct || 0) / 100 / n;
  const contribution = input.contribution || 0;
  const totalPeriods = Math.round(years * n);

  let balance = principal;
  let contributed = 0;
  const series: CompoundYear[] = [
    { year: 0, balance: principal, contributed: 0, interest: 0 },
  ];

  for (let period = 1; period <= totalPeriods; period++) {
    balance = balance * (1 + ratePerPeriod) + contribution;
    contributed += contribution;
    if (period % n === 0) {
      const year = period / n;
      series.push({
        year,
        balance,
        contributed,
        interest: balance - principal - contributed,
      });
    }
  }

  return {
    futureValue: balance,
    totalPrincipal: principal,
    totalContributions: contributed,
    totalInterest: balance - principal - contributed,
    series,
  };
}

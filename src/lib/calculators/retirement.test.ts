import { describe, it, expect } from 'vitest';
import { calculateRetirement } from './retirement';

describe('retirement calculator', () => {
  it('projects a nest egg over the accumulation period', () => {
    const r = calculateRetirement({
      currentAge: 30,
      retirementAge: 65,
      currentSavings: 20000,
      monthlyContribution: 500,
      annualReturnPct: 6,
    });
    expect(r.yearsToRetirement).toBe(35);
    expect(r.nestEgg).toBeGreaterThan(r.totalContributions + 20000);
  });

  it('estimates income from the default 4% withdrawal rate', () => {
    const r = calculateRetirement({
      currentAge: 40,
      retirementAge: 60,
      currentSavings: 100000,
      monthlyContribution: 0,
      annualReturnPct: 0,
      withdrawalRatePct: 4,
    });
    // no growth, no contributions -> nest egg stays 100000
    expect(r.nestEgg).toBeCloseTo(100000, 0);
    expect(r.estimatedAnnualIncome).toBeCloseTo(4000, 0);
    expect(r.estimatedMonthlyIncome).toBeCloseTo(333.33, 1);
  });

  it('handles already-at-retirement age', () => {
    const r = calculateRetirement({ currentAge: 65, retirementAge: 65, currentSavings: 50000, monthlyContribution: 0, annualReturnPct: 5 });
    expect(r.yearsToRetirement).toBe(0);
    expect(r.nestEgg).toBeCloseTo(50000, 6);
  });
});

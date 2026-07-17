import { describe, it, expect } from 'vitest';
import { calculateInvestment } from './investment';

describe('investment calculator', () => {
  it('grows a lump sum with no contributions', () => {
    const r = calculateInvestment({ startingAmount: 10000, monthlyContribution: 0, annualReturnPct: 12, years: 1 });
    expect(r.futureValue).toBeCloseTo(11268.25, 1); // 10000 * (1.01)^12
    expect(r.totalContributions).toBe(0);
  });

  it('accounts for monthly contributions', () => {
    const r = calculateInvestment({ startingAmount: 0, monthlyContribution: 100, annualReturnPct: 0, years: 2 });
    expect(r.futureValue).toBeCloseTo(2400, 6);
    expect(r.totalContributions).toBeCloseTo(2400, 6);
    expect(r.totalEarnings).toBeCloseTo(0, 6);
  });

  it('separates earnings from contributions', () => {
    const r = calculateInvestment({ startingAmount: 5000, monthlyContribution: 200, annualReturnPct: 7, years: 10 });
    expect(r.futureValue).toBeGreaterThan(r.startingAmount + r.totalContributions);
    expect(r.totalEarnings).toBeCloseTo(r.futureValue - r.startingAmount - r.totalContributions, 4);
  });
});

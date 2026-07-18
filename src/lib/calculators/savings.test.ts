import { describe, it, expect } from 'vitest';
import { projectSavings, requiredMonthlyForGoal } from './savings';

describe('savings', () => {
  it('projects regular deposits', () => {
    const r = projectSavings({ startingAmount: 0, monthlyContribution: 100, annualRatePct: 0, years: 2 });
    expect(r.futureValue).toBeCloseTo(2400, 6);
    expect(r.totalContributions).toBeCloseTo(2400, 6);
  });

  it('solves the monthly deposit needed for a goal (no interest)', () => {
    const m = requiredMonthlyForGoal({ goal: 12000, startingAmount: 0, annualRatePct: 0, years: 1 });
    expect(m).toBeCloseTo(1000, 6);
  });

  it('accounts for a starting balance and growth', () => {
    const m = requiredMonthlyForGoal({ goal: 100000, startingAmount: 20000, annualRatePct: 6, years: 10 });
    expect(m).toBeGreaterThan(0);
    // Depositing that amount monthly should land near the goal
    const r = projectSavings({ startingAmount: 20000, monthlyContribution: m, annualRatePct: 6, years: 10 });
    expect(r.futureValue).toBeCloseTo(100000, 0);
  });

  it('requires nothing if the goal is already met by growth', () => {
    const m = requiredMonthlyForGoal({ goal: 1000, startingAmount: 5000, annualRatePct: 5, years: 5 });
    expect(m).toBe(0);
  });
});

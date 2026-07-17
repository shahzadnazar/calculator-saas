import { describe, it, expect } from 'vitest';
import { calculateLoan } from './loan';

describe('loan calculator', () => {
  it('computes the monthly payment for a fixed-rate loan', () => {
    const r = calculateLoan({ amount: 20000, annualInterestRate: 5, termYears: 5 });
    expect(r.monthlyPayment).toBeCloseTo(377.42, 1);
    expect(r.payoffMonths).toBe(60);
    expect(r.totalPaid).toBeCloseTo(r.monthlyPayment * 60, 2);
  });

  it('handles a zero-interest loan', () => {
    const r = calculateLoan({ amount: 12000, annualInterestRate: 0, termYears: 1 });
    expect(r.monthlyPayment).toBeCloseTo(1000, 6);
    expect(r.totalInterest).toBeCloseTo(0, 6);
  });

  it('fully amortizes to zero', () => {
    const r = calculateLoan({ amount: 35000, annualInterestRate: 6.9, termYears: 6 });
    expect(r.schedule[r.schedule.length - 1].balance).toBeCloseTo(0, 2);
  });
});

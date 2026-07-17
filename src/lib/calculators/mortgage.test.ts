import { describe, it, expect } from 'vitest';
import { calculateMortgage, toYearlySchedule } from './mortgage';

describe('mortgage calculator', () => {
  it('computes the standard monthly payment', () => {
    const r = calculateMortgage({
      homePrice: 300000,
      downPayment: 0,
      loanTermYears: 30,
      annualInterestRate: 6,
    });
    expect(r.loanAmount).toBe(300000);
    expect(r.monthlyPrincipalInterest).toBeCloseTo(1798.65, 1);
    expect(r.payoffMonths).toBe(360);
  });

  it('handles a zero-interest loan', () => {
    const r = calculateMortgage({
      homePrice: 240000,
      downPayment: 0,
      loanTermYears: 20,
      annualInterestRate: 0,
    });
    expect(r.monthlyPrincipalInterest).toBeCloseTo(1000, 6);
    expect(r.totalInterest).toBeCloseTo(0, 6);
  });

  it('fully amortizes to a zero balance', () => {
    const r = calculateMortgage({
      homePrice: 500000,
      downPayment: 100000,
      loanTermYears: 15,
      annualInterestRate: 5.5,
    });
    const last = r.schedule[r.schedule.length - 1];
    expect(last.balance).toBeCloseTo(0, 2);
    // total principal repaid equals the loan amount
    const principalPaid = r.schedule.reduce((s, row) => s + row.principal, 0);
    expect(principalPaid).toBeCloseTo(r.loanAmount, 2);
  });

  it('applies PMI only while LTV exceeds 80%', () => {
    const withPmi = calculateMortgage({
      homePrice: 400000,
      downPayment: 40000, // 10% down -> PMI applies initially
      loanTermYears: 30,
      annualInterestRate: 6,
      pmiAnnualRate: 0.5,
    });
    expect(withPmi.monthlyPmi).toBeGreaterThan(0);
    // PMI must eventually drop to 0 as the balance passes the 80% threshold
    const lastRow = withPmi.schedule[withPmi.schedule.length - 1];
    expect(lastRow.pmi).toBe(0);

    const noPmi = calculateMortgage({
      homePrice: 400000,
      downPayment: 80000, // 20% down -> no PMI
      loanTermYears: 30,
      annualInterestRate: 6,
      pmiAnnualRate: 0.5,
    });
    expect(noPmi.monthlyPmi).toBe(0);
  });

  it('rolls up a yearly schedule matching the monthly totals', () => {
    const r = calculateMortgage({
      homePrice: 300000,
      downPayment: 60000,
      loanTermYears: 30,
      annualInterestRate: 6,
    });
    const yearly = toYearlySchedule(r.schedule);
    expect(yearly.length).toBe(30);
    const yearlyInterest = yearly.reduce((s, row) => s + row.interest, 0);
    expect(yearlyInterest).toBeCloseTo(r.totalInterest, 2);
  });
});

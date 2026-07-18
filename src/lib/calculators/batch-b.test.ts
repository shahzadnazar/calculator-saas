import { describe, it, expect } from 'vitest';
import { solveAnnualRate } from './interest-rate';
import { payoffByPayment, payoffByMonths } from './credit-card';
import { calculateHomeEquity } from './home-equity';
import { convertSalary } from './salary';
import { calculateIncomeTax } from './income-tax';

describe('interest rate solver', () => {
  it('recovers a known rate', () => {
    // A $20,000 loan over 60 months at 5% has a payment of ~377.42
    expect(solveAnnualRate(20000, 377.42, 60)).toBeCloseTo(5, 1);
  });
  it('returns ~0 when payments barely exceed principal', () => {
    expect(solveAnnualRate(12000, 1000, 12)).toBeCloseTo(0, 4);
  });
});

describe('credit card payoff', () => {
  it('computes payoff time and interest for a payment', () => {
    const r = payoffByPayment(5000, 18, 200);
    expect(Number.isFinite(r.months)).toBe(true);
    expect(r.totalInterest).toBeGreaterThan(0);
    expect(r.totalPaid).toBeGreaterThan(5000);
  });
  it('flags a payment that never clears the balance', () => {
    // 18% APR on 5000 is ~75/mo interest; a 50/mo payment never wins
    expect(payoffByPayment(5000, 18, 50).months).toBe(Infinity);
  });
  it('solves the payment for a target number of months', () => {
    const r = payoffByMonths(5000, 18, 24);
    expect(r.monthlyPayment).toBeGreaterThan(200);
    expect(r.totalPaid).toBeCloseTo(r.monthlyPayment * 24, 4);
  });
});

describe('home equity', () => {
  it('computes equity and max borrow at an LTV cap', () => {
    const r = calculateHomeEquity({ homeValue: 400000, mortgageBalance: 250000, maxLtvPct: 85, loanAmount: 50000, annualRatePct: 8, termYears: 10 });
    expect(r.equity).toBe(150000);
    expect(r.maxBorrow).toBe(90000); // 400000*0.85 - 250000
    expect(r.exceedsMax).toBe(false);
    expect(r.monthlyPayment).toBeGreaterThan(0);
  });
  it('flags borrowing above the cap', () => {
    const r = calculateHomeEquity({ homeValue: 400000, mortgageBalance: 250000, maxLtvPct: 85, loanAmount: 120000, annualRatePct: 8, termYears: 10 });
    expect(r.exceedsMax).toBe(true);
  });
});

describe('salary conversion', () => {
  it('converts hourly to annual and back', () => {
    const r = convertSalary({ amount: 25, unit: 'hourly', hoursPerWeek: 40, daysPerWeek: 5, weeksPerYear: 52 });
    expect(r.annual).toBeCloseTo(52000, 6);
    expect(r.weekly).toBeCloseTo(1000, 6);
    expect(r.monthly).toBeCloseTo(4333.33, 1);
  });
  it('converts annual down to hourly', () => {
    const r = convertSalary({ amount: 52000, unit: 'annual', hoursPerWeek: 40, daysPerWeek: 5, weeksPerYear: 52 });
    expect(r.hourly).toBeCloseTo(25, 6);
  });
});

describe('income tax (2024)', () => {
  it('computes tax for a single filer', () => {
    const r = calculateIncomeTax({ grossIncome: 60000, filingStatus: 'single' });
    expect(r.taxableIncome).toBe(45400); // 60000 - 14600
    expect(r.tax).toBeCloseTo(5216, 0); // 10% of 11600 + 12% of 33800
    expect(r.marginalRate).toBe(12);
    expect(r.effectiveRate).toBeCloseTo(8.69, 1);
  });
  it('computes tax for married filing jointly', () => {
    const r = calculateIncomeTax({ grossIncome: 100000, filingStatus: 'married' });
    expect(r.taxableIncome).toBe(70800);
    expect(r.tax).toBeCloseTo(8032, 0);
  });
  it('applies additional deductions', () => {
    const r = calculateIncomeTax({ grossIncome: 60000, filingStatus: 'single', additionalDeductions: 5000 });
    expect(r.taxableIncome).toBe(40400);
  });
});

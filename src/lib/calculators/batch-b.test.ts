import { describe, it, expect } from 'vitest';
import { convertSalary } from './salary';
import { calculateIncomeTax } from './income-tax';

// Interest-rate coverage now lives in the dedicated characterization suite
// `interest-rate.test.ts` (R15B3); home-equity moved to `home-equity.test.ts` (R15B2).
// batch-b now holds salary / income-tax only.

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

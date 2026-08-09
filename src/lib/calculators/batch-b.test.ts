import { describe, it, expect } from 'vitest';
import { convertSalary } from './salary';

// Interest-rate coverage now lives in the dedicated characterization suite
// `interest-rate.test.ts` (R15B3); home-equity moved to `home-equity.test.ts` (R15B2);
// income-tax moved to the dedicated `income-tax.test.ts` (R18B1). batch-b now holds
// salary only.

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

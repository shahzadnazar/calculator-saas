import { describe, it, expect } from 'vitest';
import { calculateSimpleInterest } from './simple-interest';

describe('simple interest', () => {
  it('computes interest and total', () => {
    const r = calculateSimpleInterest({ principal: 1000, annualRatePct: 5, years: 3 });
    expect(r.interest).toBeCloseTo(150, 6);
    expect(r.total).toBeCloseTo(1150, 6);
  });

  it('is zero at zero rate or time', () => {
    expect(calculateSimpleInterest({ principal: 1000, annualRatePct: 0, years: 5 }).interest).toBe(0);
    expect(calculateSimpleInterest({ principal: 1000, annualRatePct: 5, years: 0 }).interest).toBe(0);
  });
});

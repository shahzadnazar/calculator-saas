import { describe, it, expect } from 'vitest';
import { loanPayment, solveMonths } from './payment';

describe('payment calculator', () => {
  it('computes the monthly payment for a term', () => {
    expect(loanPayment(300000, 6, 360)).toBeCloseTo(1798.65, 1);
    expect(loanPayment(12000, 0, 12)).toBeCloseTo(1000, 6);
  });

  it('solves the number of months for a fixed payment', () => {
    // zero interest: 12000 / 1000 = 12 months
    expect(solveMonths(12000, 0, 1000)).toBeCloseTo(12, 6);
    // a payment that pays off a 6% loan should be finite and reasonable
    const n = solveMonths(300000, 6, 1798.65);
    expect(n).toBeCloseTo(360, 0);
  });

  it('returns Infinity when the payment cannot cover interest', () => {
    expect(solveMonths(100000, 12, 500)).toBe(Infinity); // interest alone is 1000/mo
    expect(solveMonths(1000, 5, 0)).toBe(Infinity);
  });
});

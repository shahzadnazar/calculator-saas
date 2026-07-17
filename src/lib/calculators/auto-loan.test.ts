import { describe, it, expect } from 'vitest';
import { calculateAutoLoan } from './auto-loan';

const base = {
  autoPrice: 30000,
  loanTermMonths: 60,
  interestRatePct: 5,
  downPayment: 3000,
  tradeInValue: 0,
  amountOwedOnTradeIn: 0,
  salesTaxRatePct: 7,
  fees: 300,
};

describe('auto loan', () => {
  it('finances taxes and fees when selected', () => {
    const r = calculateAutoLoan({ ...base, includeTaxesFeesInLoan: true });
    expect(r.salesTax).toBeCloseTo(2100, 6);
    expect(r.loanAmount).toBeCloseTo(29400, 6); // 30000 + 2100 + 300 - 3000
    expect(r.monthlyPayment).toBeGreaterThan(500);
    expect(r.monthlyPayment).toBeLessThan(600);
    expect(r.upfrontPayment).toBeCloseTo(3000, 6);
  });

  it('pays taxes and fees upfront when not financed', () => {
    const r = calculateAutoLoan({ ...base, includeTaxesFeesInLoan: false });
    expect(r.loanAmount).toBeCloseTo(27000, 6); // 30000 - 3000
    expect(r.upfrontPayment).toBeCloseTo(5400, 6); // 3000 + 2100 + 300
  });

  it('applies trade-in equity to reduce the loan', () => {
    const r = calculateAutoLoan({
      ...base,
      tradeInValue: 8000,
      amountOwedOnTradeIn: 2000,
      includeTaxesFeesInLoan: false,
    });
    // loan = 30000 - (3000 + (8000 - 2000)) = 21000
    expect(r.loanAmount).toBeCloseTo(21000, 6);
  });

  it('never produces a negative loan', () => {
    const r = calculateAutoLoan({ ...base, downPayment: 50000, includeTaxesFeesInLoan: false });
    expect(r.loanAmount).toBe(0);
    expect(r.monthlyPayment).toBe(0);
  });
});

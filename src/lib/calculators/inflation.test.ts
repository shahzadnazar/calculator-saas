import { describe, it, expect } from 'vitest';
import { adjustForInflation } from './inflation';

describe('inflation', () => {
  it('computes future cost and buying power', () => {
    const r = adjustForInflation({ amount: 100, annualRatePct: 3, years: 10 });
    expect(r.futureCost).toBeCloseTo(134.39, 1); // 100 * 1.03^10
    expect(r.buyingPower).toBeCloseTo(74.41, 1); // 100 / 1.03^10
    expect(r.totalInflationPct).toBeCloseTo(34.39, 1);
  });

  it('is a no-op at zero inflation', () => {
    const r = adjustForInflation({ amount: 500, annualRatePct: 0, years: 20 });
    expect(r.futureCost).toBe(500);
    expect(r.buyingPower).toBe(500);
  });
});

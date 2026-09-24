import { describe, it, expect } from 'vitest';
import { calculateBorrowingPower } from './home-equity';

/**
 * Borrowing power, frozen against the published reference case: a $600,000 home with
 * $250,000 still owed and an 80% lender cap leaves $230,000 of room, at a current
 * loan-to-value of 41.7%.
 */

describe('the reference case', () => {
  const r = calculateBorrowingPower({ homeValue: 600000, mortgageBalance: 250000, maxLtvPct: 80 });

  it('reports the room under the lender’s cap', () => {
    expect(r.maxBorrow).toBe(230000);
    expect(r.atCap).toBe(false);
  });

  it('reports the equity held and the current loan-to-value', () => {
    expect(r.equity).toBe(350000);
    expect(r.currentLtvPct).toBeCloseTo(41.6667, 4);
  });
});

describe('equity and borrowing power are different questions', () => {
  it('the cap, not the equity, is what limits the loan', () => {
    const r = calculateBorrowingPower({ homeValue: 600000, mortgageBalance: 250000, maxLtvPct: 80 });
    // $350,000 of equity, but only $230,000 of it is borrowable at 80%.
    expect(r.equity).toBeGreaterThan(r.maxBorrow);
  });

  it('a 100% cap lets the whole equity be borrowed', () => {
    const r = calculateBorrowingPower({ homeValue: 600000, mortgageBalance: 250000, maxLtvPct: 100 });
    expect(r.maxBorrow).toBe(r.equity);
  });

  it('an unmortgaged home can borrow the full capped fraction', () => {
    const r = calculateBorrowingPower({ homeValue: 400000, mortgageBalance: 0, maxLtvPct: 85 });
    expect(r.maxBorrow).toBe(340000);
    expect(r.equity).toBe(400000);
    expect(r.currentLtvPct).toBe(0);
  });
});

describe('when there is no room left', () => {
  it('a mortgage already at the cap leaves nothing to borrow', () => {
    const r = calculateBorrowingPower({ homeValue: 500000, mortgageBalance: 400000, maxLtvPct: 80 });
    expect(r.maxBorrow).toBe(0);
    expect(r.atCap).toBe(true);
    // There is still real equity — it just is not borrowable at this cap.
    expect(r.equity).toBe(100000);
  });

  it('a mortgage above the cap is clamped to zero, never negative', () => {
    const r = calculateBorrowingPower({ homeValue: 500000, mortgageBalance: 450000, maxLtvPct: 80 });
    expect(r.maxBorrow).toBe(0);
    expect(r.atCap).toBe(true);
    expect(r.currentLtvPct).toBe(90);
  });

  it('owing more than the home is worth is zero equity, not negative equity', () => {
    const r = calculateBorrowingPower({ homeValue: 300000, mortgageBalance: 340000, maxLtvPct: 80 });
    expect(r.equity).toBe(0);
    expect(r.maxBorrow).toBe(0);
    expect(r.currentLtvPct).toBeCloseTo(113.333, 3);
  });
});

describe('degenerate inputs never produce a nonsense figure', () => {
  it('a zero-value home has no loan-to-value to report', () => {
    const r = calculateBorrowingPower({ homeValue: 0, mortgageBalance: 0, maxLtvPct: 80 });
    expect(r.currentLtvPct).toBe(0);
    expect(r.maxBorrow).toBe(0);
    expect(Number.isFinite(r.currentLtvPct)).toBe(true);
  });

  it('negative inputs are floored rather than propagated', () => {
    const r = calculateBorrowingPower({ homeValue: -100, mortgageBalance: -50, maxLtvPct: -10 });
    for (const v of [r.equity, r.maxBorrow, r.currentLtvPct]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('a zero cap lends nothing however much equity there is', () => {
    const r = calculateBorrowingPower({ homeValue: 600000, mortgageBalance: 0, maxLtvPct: 0 });
    expect(r.maxBorrow).toBe(0);
    expect(r.equity).toBe(600000);
  });
});

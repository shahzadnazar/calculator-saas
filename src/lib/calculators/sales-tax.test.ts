import { describe, it, expect } from 'vitest';
import { addSalesTax, removeSalesTax } from './sales-tax';
import { formatCurrency } from '@lib/format';

/**
 * Sales-tax CHARACTERIZATION suite (R8A1, commit 1 of 2).
 *
 * The module already had a dedicated file (3 assertions); this EXPANDS it to freeze
 * the exact current behaviour of both equations BEFORE the task-first migration, so
 * the migration's new validation (amount/rate finite & >= 0) is a visible
 * binding-level decision — not a silent formula change. No change to addSalesTax /
 * removeSalesTax / formatCurrency.
 *
 * Confirmed from source (src/lib/calculators/sales-tax.ts), not assumed:
 *   - add:    net = Math.max(0, amount||0); tax = net·(ratePct||0)/100; gross = net+tax;
 *   - remove: g = Math.max(0, gross||0); net = g/(1 + (ratePct||0)/100); tax = g − net;
 *   - shape {net, tax, gross}; full-float precision; USD display via formatCurrency.
 *
 * Negative amounts / rates and non-finite inputs are FROZEN quirks here; the migration
 * rejects them at the binding, but the pure functions are unchanged.
 */
describe('addSalesTax — frozen behaviour', () => {
  it('adds tax to a whole-number amount + rate', () => {
    const r = addSalesTax(100, 8.25);
    expect(r.net).toBe(100);
    expect(r.tax).toBeCloseTo(8.25, 10);
    expect(r.gross).toBeCloseTo(108.25, 10);
  });

  it('handles decimal amount and decimal rate', () => {
    const r = addSalesTax(59.99, 7);
    expect(r.tax).toBeCloseTo(4.1993, 10);
    expect(r.gross).toBeCloseTo(64.1893, 10);
  });

  it('a zero rate is a valid tax-free result', () => {
    expect(addSalesTax(100, 0)).toEqual({ net: 100, tax: 0, gross: 100 });
  });

  it('a zero amount is a valid all-zero result', () => {
    expect(addSalesTax(0, 8.25)).toEqual({ net: 0, tax: 0, gross: 0 });
  });

  it('a high but valid rate computes normally', () => {
    expect(addSalesTax(100, 100)).toEqual({ net: 100, tax: 100, gross: 200 });
  });

  it('floors a negative amount to 0 (frozen quirk)', () => {
    expect(addSalesTax(-50, 8.25)).toEqual({ net: 0, tax: 0, gross: 0 });
  });

  it('a negative rate produces a negative tax and reduced gross (frozen quirk)', () => {
    const r = addSalesTax(100, -5);
    expect(r.tax).toBeCloseTo(-5, 10);
    expect(r.gross).toBeCloseTo(95, 10);
  });

  it('treats NaN amount / rate as 0', () => {
    expect(addSalesTax(NaN, 8.25)).toEqual({ net: 0, tax: 0, gross: 0 });
    expect(addSalesTax(100, NaN)).toEqual({ net: 100, tax: 0, gross: 100 });
  });

  it('Infinity amount / rate propagates to Infinity (frozen quirk)', () => {
    expect(addSalesTax(Infinity, 8.25).gross).toBe(Infinity);
    expect(addSalesTax(100, Infinity).tax).toBe(Infinity);
  });
});

describe('removeSalesTax — frozen behaviour', () => {
  it('extracts the included tax from a whole-number total + rate', () => {
    const r = removeSalesTax(108.25, 8.25);
    expect(r.net).toBeCloseTo(100, 10);
    expect(r.tax).toBeCloseTo(8.25, 10);
    expect(r.gross).toBe(108.25);
  });

  it('handles decimal total and decimal rate', () => {
    const r = removeSalesTax(64.1893, 7);
    expect(r.net).toBeCloseTo(59.99, 10);
    expect(r.tax).toBeCloseTo(4.1993, 10);
  });

  it('a zero rate returns the total unchanged as net (valid)', () => {
    expect(removeSalesTax(100, 0)).toEqual({ net: 100, tax: 0, gross: 100 });
  });

  it('a zero amount is a valid all-zero result', () => {
    expect(removeSalesTax(0, 8.25)).toEqual({ net: 0, tax: 0, gross: 0 });
  });

  it('a high but valid rate computes normally (rate 100% → net = total/2)', () => {
    expect(removeSalesTax(200, 100)).toEqual({ net: 100, tax: 100, gross: 200 });
  });

  it('floors a negative total to 0 (frozen quirk)', () => {
    expect(removeSalesTax(-50, 8.25)).toEqual({ net: 0, tax: 0, gross: 0 });
  });

  it('a negative rate inflates net above gross (frozen quirk)', () => {
    const r = removeSalesTax(100, -5);
    expect(r.net).toBeCloseTo(105.26315789, 6); // 100 / 0.95
    expect(r.tax).toBeCloseTo(-5.26315789, 6);
  });

  it('the denominator edge rate of −100% divides by zero → Infinity net (frozen quirk)', () => {
    expect(removeSalesTax(100, -100).net).toBe(Infinity);
  });

  it('treats NaN as 0 (NaN total → all zero; NaN rate → net = total)', () => {
    expect(removeSalesTax(NaN, 8.25)).toEqual({ net: 0, tax: 0, gross: 0 });
    expect(removeSalesTax(108.25, NaN)).toEqual({ net: 108.25, tax: 0, gross: 108.25 });
  });

  it('Infinity total yields Infinity net and a NaN tax (frozen quirk)', () => {
    const r = removeSalesTax(Infinity, 8.25);
    expect(r.net).toBe(Infinity);
    expect(Number.isNaN(r.tax)).toBe(true);
  });
});

describe('sales-tax — rounding + reversibility + currency display', () => {
  it('round-trips add → remove at full precision (no drift)', () => {
    const gross = addSalesTax(59.99, 7).gross;
    expect(removeSalesTax(gross, 7).net).toBeCloseTo(59.99, 10);
  });

  it('keeps sub-cent internal precision (rounding is a display concern)', () => {
    const r = addSalesTax(19.99, 6.5);
    expect(r.tax).toBeCloseTo(1.29935, 10); // not pre-rounded to 1.30
  });

  it('formatCurrency renders USD to two decimals and rounds display to cents', () => {
    expect(formatCurrency(108.25)).toBe('$108.25');
    expect(formatCurrency(64.1893)).toBe('$64.19'); // display-rounded
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('re-entering a display-rounded value drifts by at most a cent', () => {
    const shownGross = Number(formatCurrency(addSalesTax(59.99, 7).gross).replace(/[$,]/g, '')); // 64.19
    const back = removeSalesTax(shownGross, 7).net;
    expect(Math.abs(back - 59.99)).toBeLessThanOrEqual(0.01);
  });

  it('formatCurrency returns an em-dash for non-finite values', () => {
    expect(formatCurrency(NaN)).toBe('—');
    expect(formatCurrency(Infinity)).toBe('—');
  });
});

/* ------------------------------------------------------------------ */
/* Solving for whichever of the three is missing                       */
/* ------------------------------------------------------------------ */

import { solveSalesTax, unknownOf, type SalesTaxSolveInput } from './sales-tax';

/**
 * Frozen against the published reference case: $100 before tax at 6.5% is $6.50 of tax and
 * $106.50 after.
 */
const solve = (over: Partial<SalesTaxSolveInput> = {}) =>
  solveSalesTax({ beforeTax: 100, ratePct: 6.5, afterTax: null, ...over });
const money = (n: number) => Math.round(n * 100) / 100;

describe('which field is missing decides what is solved', () => {
  it('finds the one blank of the three', () => {
    expect(unknownOf({ beforeTax: 100, ratePct: 6.5, afterTax: null })).toBe('afterTax');
    expect(unknownOf({ beforeTax: null, ratePct: 6.5, afterTax: 106.5 })).toBe('beforeTax');
    expect(unknownOf({ beforeTax: 100, ratePct: null, afterTax: 106.5 })).toBe('ratePct');
  });

  it('refuses to guess when it is not exactly one', () => {
    expect(unknownOf({ beforeTax: 100, ratePct: 6.5, afterTax: 106.5 })).toBeNull();
    expect(unknownOf({ beforeTax: null, ratePct: null, afterTax: 106.5 })).toBeNull();
    expect(solveSalesTax({ beforeTax: 100, ratePct: 6.5, afterTax: 106.5 }).unsolvable).toBe(true);
  });
});

describe('the published reference case', () => {
  const r = solve();

  it('computes the tax and the after-tax price', () => {
    expect(money(r.beforeTax)).toBe(100);
    expect(money(r.ratePct)).toBe(6.5);
    expect(money(r.taxAmount)).toBe(6.5);
    expect(money(r.afterTax)).toBe(106.5);
    expect(r.solvedFor).toBe('afterTax');
    expect(r.unsolvable).toBe(false);
  });

  it('the three figures always reconcile', () => {
    expect(money(r.beforeTax + r.taxAmount)).toBe(money(r.afterTax));
  });
});

describe('the three directions agree with one another', () => {
  it('solving for the before-tax price returns the price it came from', () => {
    const r = solveSalesTax({ beforeTax: null, ratePct: 6.5, afterTax: 106.5 });
    expect(money(r.beforeTax)).toBe(100);
    expect(money(r.taxAmount)).toBe(6.5);
  });

  it('solving for the rate returns the rate it came from', () => {
    const r = solveSalesTax({ beforeTax: 100, ratePct: null, afterTax: 106.5 });
    expect(money(r.ratePct)).toBe(6.5);
    expect(money(r.taxAmount)).toBe(6.5);
  });

  it('round-trips through all three directions', () => {
    const forward = solve();
    const back = solveSalesTax({ beforeTax: null, ratePct: 6.5, afterTax: forward.afterTax });
    const rate = solveSalesTax({ beforeTax: 100, ratePct: null, afterTax: forward.afterTax });
    expect(money(back.beforeTax)).toBe(100);
    expect(money(rate.ratePct)).toBe(6.5);
  });

  it('handles an awkward rate without drifting', () => {
    const f = solveSalesTax({ beforeTax: 19.99, ratePct: 8.875, afterTax: null });
    const b = solveSalesTax({ beforeTax: null, ratePct: 8.875, afterTax: f.afterTax });
    expect(b.beforeTax).toBeCloseTo(19.99, 9);
  });
});

describe('edges', () => {
  it('a zero rate leaves the price alone', () => {
    const r = solve({ ratePct: 0 });
    expect(money(r.taxAmount)).toBe(0);
    expect(money(r.afterTax)).toBe(100);
  });

  it('a zero price is a real answer', () => {
    const r = solve({ beforeTax: 0 });
    expect(r.unsolvable).toBe(false);
    expect(r.afterTax).toBe(0);
  });

  it('a negative rate is a discount, not an error', () => {
    const r = solve({ ratePct: -10 });
    expect(money(r.afterTax)).toBe(90);
    expect(money(r.taxAmount)).toBe(-10);
  });

  it('refuses a rate at or below the -100% cliff', () => {
    expect(solve({ ratePct: -100 }).unsolvable).toBe(true);
    expect(solveSalesTax({ beforeTax: null, ratePct: -100, afterTax: 100 }).unsolvable).toBe(true);
  });

  it('refuses a negative price', () => {
    expect(solve({ beforeTax: -1 }).unsolvable).toBe(true);
    expect(solveSalesTax({ beforeTax: null, ratePct: 5, afterTax: -1 }).unsolvable).toBe(true);
  });

  it('cannot find a rate against a before-tax price of nothing', () => {
    // No percentage of zero is anything but zero, so the question has no answer.
    expect(solveSalesTax({ beforeTax: 0, ratePct: null, afterTax: 10 }).unsolvable).toBe(true);
  });

  it('an after-tax price below the before-tax one is a negative rate, not an error', () => {
    const r = solveSalesTax({ beforeTax: 100, ratePct: null, afterTax: 90 });
    expect(r.unsolvable).toBe(false);
    expect(money(r.ratePct)).toBe(-10);
  });

  it('refuses a non-finite entry', () => {
    expect(solve({ beforeTax: Number.NaN }).unsolvable).toBe(true);
    expect(solve({ ratePct: Number.POSITIVE_INFINITY }).unsolvable).toBe(true);
  });

  it('carries no figures to print when unsolvable', () => {
    const r = solve({ ratePct: -100 });
    for (const v of [r.beforeTax, r.ratePct, r.taxAmount, r.afterTax]) expect(Number.isNaN(v)).toBe(true);
  });
});

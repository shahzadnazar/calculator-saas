import { describe, it, expect } from 'vitest';
import { addSalesTax, removeSalesTax } from './sales-tax';

describe('sales tax', () => {
  it('adds tax to a net amount', () => {
    const r = addSalesTax(100, 8.25);
    expect(r.tax).toBeCloseTo(8.25, 6);
    expect(r.gross).toBeCloseTo(108.25, 6);
  });

  it('extracts tax from a gross amount', () => {
    const r = removeSalesTax(108.25, 8.25);
    expect(r.net).toBeCloseTo(100, 6);
    expect(r.tax).toBeCloseTo(8.25, 6);
  });

  it('round-trips add then remove', () => {
    const gross = addSalesTax(59.99, 7).gross;
    expect(removeSalesTax(gross, 7).net).toBeCloseTo(59.99, 6);
  });
});

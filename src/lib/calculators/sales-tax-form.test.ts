import { describe, it, expect } from 'vitest';
import {
  validateSalesTaxValues,
  computeSalesTax,
  describeSalesTaxResult,
  isUsableTax,
  spokenUSD,
  salesTaxBinding,
  type SalesTaxValues,
} from './sales-tax-form';

const v = (over: Partial<SalesTaxValues> = {}): SalesTaxValues => ({
  mode: 'add',
  amount: '100',
  rate: '8.25',
  ...over,
});

describe('sales-tax-form — validation (amount + rate finite, >= 0; 0 is valid)', () => {
  it('accepts a valid add / remove calculation', () => {
    expect(validateSalesTaxValues(v())).toEqual({ ok: true });
    expect(validateSalesTaxValues(v({ mode: 'remove', amount: '108.25' })).ok).toBe(true);
  });

  it('treats an entered 0 amount and 0 rate as VALID', () => {
    expect(validateSalesTaxValues(v({ amount: '0' })).ok).toBe(true);
    expect(validateSalesTaxValues(v({ rate: '0' })).ok).toBe(true);
  });

  it('requires amount and rate (empty → field error)', () => {
    expect((validateSalesTaxValues(v({ amount: '' })) as any).fieldErrors.amount).toBe('Enter an amount.');
    expect((validateSalesTaxValues(v({ rate: '' })) as any).fieldErrors.rate).toBe('Enter a sales-tax rate.');
  });

  it('rejects negative and non-finite amount / rate', () => {
    expect((validateSalesTaxValues(v({ amount: '-5' })) as any).fieldErrors.amount).toBe(
      'Enter an amount of zero or more.',
    );
    expect((validateSalesTaxValues(v({ amount: 'abc' })) as any).fieldErrors.amount).toBe(
      'Enter an amount of zero or more.',
    );
    expect((validateSalesTaxValues(v({ rate: '-1' })) as any).fieldErrors.rate).toBe(
      'Enter a sales-tax rate of zero or more.',
    );
    expect((validateSalesTaxValues(v({ rate: 'x' })) as any).fieldErrors.rate).toBe(
      'Enter a sales-tax rate of zero or more.',
    );
  });
});

describe('sales-tax-form — compute + mode-owned dominant', () => {
  it('add mode: preserves the reviewed figures and makes gross the dominant', () => {
    const r = computeSalesTax(v());
    expect(r.mode).toBe('add');
    expect(r.net).toBe(100);
    expect(r.tax).toBeCloseTo(8.25, 10);
    expect(r.gross).toBeCloseTo(108.25, 10);
    expect(salesTaxBinding.resultValue(r)).toBeCloseTo(108.25, 10); // dominant = gross
  });

  it('remove mode: preserves the reviewed figures and makes net the dominant', () => {
    const r = computeSalesTax(v({ mode: 'remove', amount: '108.25' }));
    expect(r.mode).toBe('remove');
    expect(r.net).toBeCloseTo(100, 10);
    expect(r.tax).toBeCloseTo(8.25, 10);
    expect(salesTaxBinding.resultValue(r)).toBeCloseTo(100, 10); // dominant = net
  });

  it('a valid zero amount computes an all-zero result (finite, usable)', () => {
    const r = computeSalesTax(v({ amount: '0' }));
    expect(r).toMatchObject({ net: 0, tax: 0, gross: 0 });
    expect(salesTaxBinding.resultValue(r)).toBe(0); // finite → the runtime shows $0.00
  });

  it('a valid zero rate leaves the amount untaxed', () => {
    expect(computeSalesTax(v({ rate: '0' }))).toMatchObject({ net: 100, tax: 0, gross: 100 });
  });
});

describe('sales-tax-form — result guard', () => {
  it('accepts finite, non-negative, ordered, self-consistent results', () => {
    expect(isUsableTax({ net: 100, tax: 8.25, gross: 108.25 })).toBe(true);
    expect(isUsableTax({ net: 0, tax: 0, gross: 0 })).toBe(true);
  });

  it('rejects the frozen quirks (negative tax, inflated net, non-finite)', () => {
    expect(isUsableTax({ net: 100, tax: -5, gross: 95 })).toBe(false); // negative-rate add
    expect(isUsableTax({ net: 105.26, tax: -5.26, gross: 100 })).toBe(false); // negative-rate remove
    expect(isUsableTax({ net: Infinity, tax: NaN, gross: Infinity })).toBe(false);
    expect(Number.isNaN(salesTaxBinding.resultValue({ net: Infinity, tax: NaN, gross: Infinity, mode: 'add', rate: 0 }))).toBe(
      true,
    );
  });
});

describe('sales-tax-form — announcement (dominant only, USD spoken)', () => {
  it('add mode announces the total; remove mode announces the pre-tax amount', () => {
    expect(describeSalesTaxResult(computeSalesTax(v()))).toBe('Total including sales tax is 108 dollars and 25 cents.');
    expect(describeSalesTaxResult(computeSalesTax(v({ mode: 'remove', amount: '108.25' })))).toBe(
      'Amount before sales tax is 100 dollars.',
    );
  });

  it('spokenUSD reads dollars and cents with correct singular/plural', () => {
    expect(spokenUSD(108.25)).toBe('108 dollars and 25 cents');
    expect(spokenUSD(100)).toBe('100 dollars');
    expect(spokenUSD(1)).toBe('1 dollar');
    expect(spokenUSD(0)).toBe('0 dollars');
    expect(spokenUSD(0.5)).toBe('0 dollars and 50 cents');
    expect(spokenUSD(7.01)).toBe('7 dollars and 1 cent');
  });
});

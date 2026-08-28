import { describe, it, expect } from 'vitest';
import {
  FIELD_LABELS,
  MSG,
  SALES_TAX_EXAMPLE_VALUES,
  completeSalesTaxValue,
  computeSalesTax,
  describeSalesTaxResult,
  formatRate,
  interpretSalesTax,
  parsePrice,
  parseRate,
  salesTaxBinding,
  spokenUSD,
  summaryLabel,
  summaryValue,
  taxLine,
  validateSalesTaxValues,
  type SalesTaxValues,
} from './sales-tax-form';

/** The published reference case: $100 at 6.5% is $6.50 of tax and $106.50 after. */
const REF: SalesTaxValues = { beforeTax: '100', rate: '6.5', afterTax: '' };
const vals = (over: Partial<SalesTaxValues> = {}): SalesTaxValues => ({ ...REF, ...over });
const errs = (v: SalesTaxValues) =>
  (validateSalesTaxValues(v) as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
const formError = (v: SalesTaxValues) => (validateSalesTaxValues(v) as { formError?: string }).formError;
const money = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

describe('parsing', () => {
  it('reads a blank as "solve for this one", never as zero', () => {
    expect(parsePrice('')).toBe('blank');
    expect(parseRate('   ')).toBe('blank');
    expect(parsePrice('')).not.toBe(0);
  });

  it('never turns a bad entry into zero', () => {
    expect(parsePrice('abc')).toBe('invalid');
    expect(parseRate('abc')).toBe('invalid');
  });

  it('accepts a typed dollar sign, comma or percent', () => {
    expect(parsePrice('$1,234.50')).toBe(1234.5);
    expect(parseRate('6.5%')).toBe(6.5);
  });

  it('rejects a negative price but allows a negative rate', () => {
    expect(parsePrice('-1')).toBe('invalid');
    expect(parseRate('-10')).toBe(-10);
    expect(parseRate('-100')).toBe('invalid');
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('validation', () => {
  it('accepts the reference entry', () => {
    expect(validateSalesTaxValues(REF)).toEqual({ ok: true });
  });

  it('accepts each of the three directions', () => {
    expect(validateSalesTaxValues({ beforeTax: '', rate: '6.5', afterTax: '106.5' })).toEqual({ ok: true });
    expect(validateSalesTaxValues({ beforeTax: '100', rate: '', afterTax: '106.5' })).toEqual({ ok: true });
  });

  it('asks for two when fewer are given', () => {
    expect(formError({ beforeTax: '100', rate: '', afterTax: '' })).toBe(MSG.needTwo);
    expect(formError({ beforeTax: '', rate: '', afterTax: '' })).toBe(MSG.needTwo);
  });

  it('asks for a blank when all three are given', () => {
    expect(formError({ beforeTax: '100', rate: '6.5', afterTax: '106.5' })).toBe(MSG.tooMany);
  });

  it('rejects a negative price and a rate at the cliff', () => {
    expect(errs(vals({ beforeTax: '-1' })).beforeTax).toBe(MSG.price);
    expect(errs(vals({ rate: '-100' })).rate).toBe(MSG.rate);
    expect(errs({ beforeTax: '', rate: '5', afterTax: '-1' }).afterTax).toBe(MSG.price);
  });

  it('will not look for a rate against a before-tax price of nothing', () => {
    expect(errs({ beforeTax: '0', rate: '', afterTax: '10' }).beforeTax).toBe(MSG.noRate);
  });

  it('a zero price is otherwise a real entry', () => {
    expect(validateSalesTaxValues({ beforeTax: '0', rate: '6.5', afterTax: '' })).toEqual({ ok: true });
  });
});

/* ------------------------------------------------------------------ */
/* Computation                                                         */
/* ------------------------------------------------------------------ */

describe('computation', () => {
  it('reproduces the published reference case', () => {
    const r = computeSalesTax(REF);
    expect(money(r.beforeTax)).toBe(100);
    expect(money(r.ratePct)).toBe(6.5);
    expect(money(r.taxAmount)).toBe(6.5);
    expect(money(r.afterTax)).toBe(106.5);
    expect(r.solvedFor).toBe('afterTax');
  });

  it('solves each of the three directions', () => {
    expect(money(computeSalesTax({ beforeTax: '', rate: '6.5', afterTax: '106.5' }).beforeTax)).toBe(100);
    expect(money(computeSalesTax({ beforeTax: '100', rate: '', afterTax: '106.5' }).ratePct)).toBe(6.5);
    expect(money(computeSalesTax(REF).afterTax)).toBe(106.5);
  });

  it('the guarded value is whichever field was solved for', () => {
    expect(money(salesTaxBinding.resultValue(computeSalesTax(REF)))).toBe(106.5);
    expect(money(salesTaxBinding.resultValue(computeSalesTax({ beforeTax: '', rate: '6.5', afterTax: '106.5' })))).toBe(100);
    expect(money(salesTaxBinding.resultValue(computeSalesTax({ beforeTax: '100', rate: '', afterTax: '106.5' })))).toBe(6.5);
  });
});

describe('the complete-result guard', () => {
  const base = computeSalesTax(REF);
  const broken = (mutate: (r: typeof base) => void) => {
    const copy = { ...base };
    mutate(copy);
    return copy;
  };

  it('rejects an unsolvable entry', () => {
    expect(Number.isNaN(completeSalesTaxValue(computeSalesTax({ beforeTax: '100', rate: '6.5', afterTax: '106.5' })))).toBe(true);
  });

  it('rejects a trio that does not add up', () => {
    expect(Number.isNaN(completeSalesTaxValue(broken((c) => (c.afterTax = 999))))).toBe(true);
  });

  it('rejects a non-finite or negative figure', () => {
    expect(Number.isNaN(completeSalesTaxValue(broken((c) => (c.taxAmount = Number.NaN))))).toBe(true);
    expect(Number.isNaN(completeSalesTaxValue(broken((c) => (c.beforeTax = -1))))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

describe('presentation', () => {
  const after = computeSalesTax(REF);
  const before = computeSalesTax({ beforeTax: '', rate: '6.5', afterTax: '106.5' });
  const rate = computeSalesTax({ beforeTax: '100', rate: '', afterTax: '106.5' });

  it('names the three fields as the reference names them', () => {
    expect(FIELD_LABELS).toEqual({
      beforeTax: 'Before Tax Price',
      ratePct: 'Sales Tax Rate',
      afterTax: 'After Tax Price',
    });
  });

  it('heads the panel with whichever field was worked out', () => {
    expect(summaryLabel(after)).toBe('After Tax Price');
    expect(summaryValue(after)).toBe('$106.50');
    expect(summaryLabel(before)).toBe('Before Tax Price');
    expect(summaryValue(before)).toBe('$100.00');
    expect(summaryLabel(rate)).toBe('Sales Tax Rate');
    expect(summaryValue(rate)).toBe('6.50%');
  });

  it('writes the tax line the way the reference writes it', () => {
    expect(taxLine(after)).toBe('6.50% or $6.50');
  });

  it('quotes a rate to two decimals', () => {
    expect(formatRate(6.5)).toBe('6.50%');
    expect(formatRate(8.875)).toBe('8.88%');
    expect(formatRate(Number.NaN)).toBe('—');
  });

  it('explains each direction in its own words', () => {
    expect(interpretSalesTax(after)).toBe('6.50% on $100.00 adds $6.50, so the price at the till is $106.50.');
    expect(interpretSalesTax(before)).toContain('so the price before tax was $100.00');
    expect(interpretSalesTax(rate)).toContain('a rate of 6.50%');
  });

  it('announces the figure that was asked for', () => {
    expect(describeSalesTaxResult(after)).toBe('After Tax Price: 106 dollars and 50 cents.');
    expect(describeSalesTaxResult(rate)).toBe('The sales tax rate is 6.50%.');
  });

  it('speaks an amount', () => {
    expect(spokenUSD(106.5)).toBe('106 dollars and 50 cents');
    expect(spokenUSD(100)).toBe('100 dollars');
    expect(spokenUSD(1.01)).toBe('1 dollar and 1 cent');
  });
});

/* ------------------------------------------------------------------ */
/* The example and the binding surface                                 */
/* ------------------------------------------------------------------ */

describe('the example and the binding', () => {
  it('the example is the reference case', () => {
    expect(SALES_TAX_EXAMPLE_VALUES).toEqual(REF);
    expect(validateSalesTaxValues(SALES_TAX_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(money(salesTaxBinding.resultValue(computeSalesTax(SALES_TAX_EXAMPLE_VALUES)))).toBe(106.5);
  });

  it('has no isUsableResult — the guard is resultValue', () => {
    expect(salesTaxBinding.isUsableResult).toBeUndefined();
  });

  /** Vitest runs without a DOM, so the root is a stub answering the binding's selectors. */
  const stubRoot = (v: Record<string, string>) => {
    const controls: Record<string, { value: string }> = {};
    for (const [k, val] of Object.entries(v)) controls[k] = { value: val };
    return {
      querySelector(sel: string) {
        const m = sel.match(/\[name="(.+?)"\]$/);
        return m ? (controls[m[1]] ?? null) : null;
      },
    } as unknown as HTMLElement;
  };

  it('reads all three fields', () => {
    expect(salesTaxBinding.readValues(stubRoot({ ...REF }))).toEqual(REF);
  });

  it('reads a missing control as blank', () => {
    expect(salesTaxBinding.readValues(stubRoot({})).beforeTax).toBe('');
  });

  it('reset empties all three', () => {
    const root = stubRoot({ beforeTax: '100', rate: '6.5', afterTax: '106.5' });
    salesTaxBinding.resetValues(root, 'personal');
    expect(salesTaxBinding.readValues(root)).toEqual({ beforeTax: '', rate: '', afterTax: '' });
  });
});

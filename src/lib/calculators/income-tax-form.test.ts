import { describe, it, expect } from 'vitest';
import {
  incomeTaxBinding,
  validateIncomeTaxValues,
  computeIncomeTax,
  isCompleteIncomeTax,
  describeIncomeTax,
  isFilingStatus,
  FILING_STATUSES,
  DEFAULT_FILING_STATUS,
  MSG,
  type IncomeTaxValues,
  type IncomeTaxComputed,
} from './income-tax-form';

/**
 * Income-tax binding unit tests (R18B1, Commit 2). Validation, computation, the
 * complete-result guard (reconciled against the frozen source), description, and the
 * DOM read/reset helpers via a mock root. The bracket math is never reproduced here —
 * pinned figures live in income-tax.test.ts; this suite asserts the binding boundary.
 */

const vals = (v: Partial<IncomeTaxValues> = {}): IncomeTaxValues => ({
  filingStatus: 'single',
  grossIncome: '',
  additionalDeductions: '',
  ...v,
});

/** Minimal root: resolves the three named controls + the checked filing-status radio. */
function mockRoot(v: Partial<IncomeTaxValues> = {}) {
  const store: Record<string, { value: string }> = {
    grossIncome: { value: v.grossIncome ?? '' },
    additionalDeductions: { value: v.additionalDeductions ?? '' },
  };
  const status = v.filingStatus ?? 'single';
  const root = {
    querySelector(sel: string) {
      if (sel === '[name="filingStatus"]:checked') return status === '' ? null : { value: status };
      const m = sel.match(/\[name="(\w+)"\]/);
      return m && store[m[1]] ? store[m[1]] : null;
    },
  } as unknown as HTMLElement;
  return { root, store };
}

describe('income-tax binding — contract', () => {
  it('does NOT implement isUsableResult (the guard lives in resultValue)', () => {
    expect(incomeTaxBinding.isUsableResult).toBeUndefined();
  });

  it('resultValue mirrors the complete-result guard: tax when complete, NaN otherwise', () => {
    const complete = computeIncomeTax(vals({ grossIncome: '60000' }));
    expect(incomeTaxBinding.resultValue(complete)).toBeCloseTo(5216, 6);
    const tampered = { ...complete, tax: 999999 };
    expect(Number.isNaN(incomeTaxBinding.resultValue(tampered))).toBe(true);
  });

  it('exposes exactly the two supported filing statuses with single as default', () => {
    expect([...FILING_STATUSES]).toEqual(['single', 'married']);
    expect(DEFAULT_FILING_STATUS).toBe('single');
    expect(isFilingStatus('single')).toBe(true);
    expect(isFilingStatus('married')).toBe(true);
    expect(isFilingStatus('head-of-household')).toBe(false);
    expect(isFilingStatus('')).toBe(false);
  });
});

describe('income-tax binding — validation', () => {
  it('all-empty (default status present) → income is the required field error', () => {
    const v = validateIncomeTaxValues(vals());
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.fieldErrors?.grossIncome).toBe(MSG.incomeRequired);
  });

  it('an unsupported filing status is a form-level error', () => {
    const v = validateIncomeTaxValues(vals({ filingStatus: 'head-of-household', grossIncome: '50000' }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.formError).toBe(MSG.statusInvalid);
  });

  it('an empty filing status is rejected form-level', () => {
    const v = validateIncomeTaxValues(vals({ filingStatus: '', grossIncome: '50000' }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.formError).toBe(MSG.statusInvalid);
  });

  it('accepts each supported status with a valid income', () => {
    for (const status of FILING_STATUSES) {
      expect(validateIncomeTaxValues(vals({ filingStatus: status, grossIncome: '50000' })).ok).toBe(true);
    }
  });

  it('zero income is VALID (a genuine $0 result)', () => {
    expect(validateIncomeTaxValues(vals({ grossIncome: '0' })).ok).toBe(true);
  });

  it('income below the deduction is valid (produces $0 tax)', () => {
    expect(validateIncomeTaxValues(vals({ grossIncome: '10000' })).ok).toBe(true);
  });

  it('a decimal (cents) income is valid — the source accepts decimals', () => {
    expect(validateIncomeTaxValues(vals({ grossIncome: '60000.50' })).ok).toBe(true);
  });

  it('an empty additional deduction is valid (a verified neutral 0)', () => {
    expect(validateIncomeTaxValues(vals({ grossIncome: '60000', additionalDeductions: '' })).ok).toBe(true);
  });

  it('an explicit zero additional deduction is valid', () => {
    expect(validateIncomeTaxValues(vals({ grossIncome: '60000', additionalDeductions: '0' })).ok).toBe(true);
  });

  it('rejects malformed / negative / non-finite income', () => {
    for (const bad of ['abc', '-1', '-0.01', '1e999', 'NaN', '1.2.3']) {
      const v = validateIncomeTaxValues(vals({ grossIncome: bad }));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.fieldErrors?.grossIncome).toBe(MSG.incomeInvalid);
    }
  });

  it('rejects a malformed / negative additional deduction', () => {
    for (const bad of ['abc', '-100', '1e999']) {
      const v = validateIncomeTaxValues(vals({ grossIncome: '60000', additionalDeductions: bad }));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.fieldErrors?.additionalDeductions).toBe(MSG.deductionInvalid);
    }
  });
});

describe('income-tax binding — computation + complete-result guard', () => {
  it('ordinary single filer carries every result metric + the echoed inputs', () => {
    const r = computeIncomeTax(vals({ grossIncome: '60000' }));
    expect(r.filingStatus).toBe('single');
    expect(r.grossIncome).toBe(60000);
    expect(r.additionalDeductions).toBe(0);
    expect(r.taxableIncome).toBe(45400);
    expect(r.tax).toBeCloseTo(5216, 6);
    expect(r.afterTax).toBeCloseTo(54784, 6);
    expect(r.effectiveRate).toBeCloseTo(8.693333, 4);
    expect(r.marginalRate).toBe(12);
    expect(isCompleteIncomeTax(r)).toBe(true);
  });

  it('married filing jointly computes and is complete', () => {
    const r = computeIncomeTax(vals({ filingStatus: 'married', grossIncome: '100000' }));
    expect(r.tax).toBeCloseTo(8032, 6);
    expect(isCompleteIncomeTax(r)).toBe(true);
  });

  it('applies an additional deduction ($60k + $5k → $4,616 tax)', () => {
    const r = computeIncomeTax(vals({ grossIncome: '60000', additionalDeductions: '5000' }));
    expect(r.taxableIncome).toBe(40400);
    expect(r.tax).toBeCloseTo(4616, 6);
    expect(isCompleteIncomeTax(r)).toBe(true);
  });

  it('a decimal income computes and is complete', () => {
    const r = computeIncomeTax(vals({ grossIncome: '60000.50' }));
    expect(r.grossIncome).toBe(60000.5);
    expect(isCompleteIncomeTax(r)).toBe(true);
  });

  it('zero income is a COMPLETE valid $0 result (not empty)', () => {
    const r = computeIncomeTax(vals({ grossIncome: '0' }));
    expect(r.tax).toBe(0);
    expect(r.taxableIncome).toBe(0);
    expect(isCompleteIncomeTax(r)).toBe(true);
    expect(incomeTaxBinding.resultValue(r)).toBe(0);
  });

  it('below-deduction income is a complete $0-tax result', () => {
    const r = computeIncomeTax(vals({ grossIncome: '10000' }));
    expect(r.tax).toBe(0);
    expect(r.afterTax).toBe(10000);
    expect(isCompleteIncomeTax(r)).toBe(true);
  });

  it('rejects a tampered result whose tax does not reconcile with the source', () => {
    const r = computeIncomeTax(vals({ grossIncome: '60000' }));
    expect(isCompleteIncomeTax({ ...r, tax: r.tax + 500 })).toBe(false);
    expect(isCompleteIncomeTax({ ...r, taxableIncome: 0 })).toBe(false);
  });

  it('rejects results with non-finite or negative inner fields', () => {
    const r = computeIncomeTax(vals({ grossIncome: '60000' }));
    expect(isCompleteIncomeTax({ ...r, tax: Number.NaN } as IncomeTaxComputed)).toBe(false);
    expect(isCompleteIncomeTax({ ...r, afterTax: Number.POSITIVE_INFINITY } as IncomeTaxComputed)).toBe(false);
    expect(isCompleteIncomeTax({ ...r, grossIncome: Number.NaN } as IncomeTaxComputed)).toBe(false);
    expect(isCompleteIncomeTax({ ...r, tax: -1 } as IncomeTaxComputed)).toBe(false);
  });
});

describe('income-tax binding — description', () => {
  it('announces the estimated tax only', () => {
    const r = computeIncomeTax(vals({ grossIncome: '60000' }));
    expect(describeIncomeTax(r)).toBe('Estimated income tax: $5,216.00.');
  });

  it('announces a valid $0 tax normally', () => {
    const r = computeIncomeTax(vals({ grossIncome: '0' }));
    expect(describeIncomeTax(r)).toBe('Estimated income tax: $0.00.');
  });
});

describe('income-tax binding — DOM read / reset', () => {
  it('readValues reads the checked status + both money fields', () => {
    const { root } = mockRoot({ filingStatus: 'married', grossIncome: '80000', additionalDeductions: '3000' });
    expect(incomeTaxBinding.readValues(root)).toEqual({
      filingStatus: 'married',
      grossIncome: '80000',
      additionalDeductions: '3000',
    });
  });

  it('readValues yields an empty filing status when none is checked (rejected by validate)', () => {
    const { root } = mockRoot({ filingStatus: '', grossIncome: '80000' });
    expect(incomeTaxBinding.readValues(root).filingStatus).toBe('');
  });

  it('resetValues clears both money fields (status restored by the island)', () => {
    const { root, store } = mockRoot({ grossIncome: '80000', additionalDeductions: '3000' });
    incomeTaxBinding.resetValues(root, 'personal');
    expect(store.grossIncome.value).toBe('');
    expect(store.additionalDeductions.value).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { calculateIncomeTax, STANDARD_DEDUCTION, type FilingStatus } from './income-tax';

/**
 * Income-tax characterization (R18B1, Commit 1 — test-only). Freezes the EXACT
 * frozen public contract of `calculateIncomeTax` / `STANDARD_DEDUCTION` before the
 * task-first migration; no module change. Moved out of batch-b.test.ts (salary
 * stays there). Every expectation is DERIVED INDEPENDENTLY from the published 2024
 * brackets — never by echoing the function's own output.
 *
 * Contract recap (2024): taxable = max(0, gross − (standardDeduction + max(0, extra)));
 * progressive brackets are applied to TAXABLE income; the marginal rate is the top
 * bracket the taxable income reaches. A taxable amount sitting EXACTLY on a bracket
 * boundary keeps the LOWER bracket's rate (the accumulation loop breaks when
 * `taxable === lower`). afterTax = gross − tax; effectiveRate = tax/gross×100 (0 when
 * gross is 0); marginalRate = topRate×100. gross / extra deductions are clamped to
 * ≥ 0 by the source (`Math.max(0, … || 0)`), so the source is NOT finite-safe for a
 * genuinely non-finite gross — the visitor-facing binding is what rejects those.
 */

describe('income tax — standard deduction constants (2024)', () => {
  it('freezes the exact per-status standard deduction', () => {
    expect(STANDARD_DEDUCTION.single).toBe(14600);
    expect(STANDARD_DEDUCTION.married).toBe(29200);
  });
});

describe('income tax — pinned full results (2024)', () => {
  it('single filer, $60,000 gross → $5,216 tax (10% of 11,600 + 12% of 33,800)', () => {
    const r = calculateIncomeTax({ grossIncome: 60000, filingStatus: 'single' });
    expect(r.taxableIncome).toBe(45400); // 60000 − 14600
    expect(r.tax).toBeCloseTo(5216, 6); // 1160 + 4056
    expect(r.afterTax).toBeCloseTo(54784, 6); // 60000 − 5216
    expect(r.effectiveRate).toBeCloseTo(8.693333, 4); // 5216 / 60000 × 100
    expect(r.marginalRate).toBe(12);
  });

  it('married filing jointly, $100,000 gross → $8,032 tax', () => {
    const r = calculateIncomeTax({ grossIncome: 100000, filingStatus: 'married' });
    expect(r.taxableIncome).toBe(70800); // 100000 − 29200
    expect(r.tax).toBeCloseTo(8032, 6); // 10% of 23200 + 12% of 47600
    expect(r.afterTax).toBeCloseTo(91968, 6);
    expect(r.marginalRate).toBe(12);
  });

  it('single filer spanning four brackets, $200,000 gross → $37,538.50 tax', () => {
    const r = calculateIncomeTax({ grossIncome: 200000, filingStatus: 'single' });
    expect(r.taxableIncome).toBe(185400); // 200000 − 14600
    // 1160 + 4266 + 11742.5 + 24% of (185400 − 100525 = 84875) = 20370
    expect(r.tax).toBeCloseTo(37538.5, 6);
    expect(r.marginalRate).toBe(24);
    expect(r.effectiveRate).toBeCloseTo(18.76925, 4);
  });

  it('single filer in the top bracket, $2,000,000 gross → $692,785.75 tax at 37% marginal', () => {
    const r = calculateIncomeTax({ grossIncome: 2000000, filingStatus: 'single' });
    expect(r.taxableIncome).toBe(1985400);
    // 1160 + 4266 + 11742.5 + 21942 + 16568 + 127968.75 + 37% of (1985400 − 609350)
    expect(r.tax).toBeCloseTo(692785.75, 4);
    expect(r.marginalRate).toBe(37);
  });

  it('a low income taxed entirely in the 10% bracket, $20,000 single → $540 tax', () => {
    const r = calculateIncomeTax({ grossIncome: 20000, filingStatus: 'single' });
    expect(r.taxableIncome).toBe(5400); // 20000 − 14600
    expect(r.tax).toBeCloseTo(540, 6); // 10% of 5400
    expect(r.marginalRate).toBe(10);
  });
});

describe('income tax — marginal rate at every 2024 bracket transition', () => {
  // Bracket upper bounds (taxable-income space), per status, derived from the
  // published 2024 tables — NOT read back from the module (BRACKETS is private).
  const CASES = [
    { status: 'single' as FilingStatus, deduction: 14600, boundaries: [11600, 47150, 100525, 191950, 243725, 609350] },
    { status: 'married' as FilingStatus, deduction: 29200, boundaries: [23200, 94300, 201050, 383900, 487450, 731200] },
  ];
  const RATES = [10, 12, 22, 24, 32, 35, 37];

  for (const { status, deduction, boundaries } of CASES) {
    boundaries.forEach((b, i) => {
      it(`${status}: taxable exactly ${b} stays at the ${RATES[i]}% bracket`, () => {
        const r = calculateIncomeTax({ grossIncome: b + deduction, filingStatus: status });
        expect(r.taxableIncome).toBe(b);
        expect(r.marginalRate).toBe(RATES[i]);
      });
      it(`${status}: taxable ${b + 1} crosses into the ${RATES[i + 1]}% bracket`, () => {
        const r = calculateIncomeTax({ grossIncome: b + 1 + deduction, filingStatus: status });
        expect(r.taxableIncome).toBe(b + 1);
        expect(r.marginalRate).toBe(RATES[i + 1]);
      });
    });

    it(`${status}: income below the standard deduction → 0 taxable, 0% marginal, $0 tax`, () => {
      const r = calculateIncomeTax({ grossIncome: deduction - 1000, filingStatus: status });
      expect(r.taxableIncome).toBe(0);
      expect(r.marginalRate).toBe(0);
      expect(r.tax).toBe(0);
    });

    it(`${status}: a very-high income tops out at the 37% marginal bracket`, () => {
      const r = calculateIncomeTax({ grossIncome: 5_000_000, filingStatus: status });
      expect(r.marginalRate).toBe(37);
    });
  }
});

describe('income tax — deductions', () => {
  it('applies the standard deduction only when no extra is supplied', () => {
    const r = calculateIncomeTax({ grossIncome: 60000, filingStatus: 'single' });
    expect(r.taxableIncome).toBe(45400);
  });

  it('subtracts additional pre-tax deductions on top of the standard deduction', () => {
    const r = calculateIncomeTax({ grossIncome: 60000, filingStatus: 'single', additionalDeductions: 5000 });
    expect(r.taxableIncome).toBe(40400); // 60000 − (14600 + 5000)
    expect(r.tax).toBeCloseTo(4616, 6); // 1160 + 12% of 28800
  });

  it('treats an explicit zero additional deduction as the standard-only case', () => {
    const r = calculateIncomeTax({ grossIncome: 60000, filingStatus: 'single', additionalDeductions: 0 });
    expect(r.taxableIncome).toBe(45400);
  });

  it('deductions reducing taxable income to exactly zero produce $0 tax', () => {
    const r = calculateIncomeTax({ grossIncome: 14600, filingStatus: 'single' });
    expect(r.taxableIncome).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.marginalRate).toBe(0);
    expect(r.afterTax).toBe(14600);
    expect(r.effectiveRate).toBe(0); // gross > 0 but tax 0
  });

  it('deductions exceeding gross income floor taxable income at zero', () => {
    const r = calculateIncomeTax({ grossIncome: 10000, filingStatus: 'single', additionalDeductions: 50000 });
    expect(r.taxableIncome).toBe(0);
    expect(r.tax).toBe(0);
  });
});

describe('income tax — result contract at the edges', () => {
  it('gross income of 0 → all-zero result with a 0 effective rate', () => {
    const r = calculateIncomeTax({ grossIncome: 0, filingStatus: 'single' });
    expect(r).toEqual({ taxableIncome: 0, tax: 0, afterTax: 0, effectiveRate: 0, marginalRate: 0 });
  });

  it('income below the standard deduction → 0 tax but full after-tax income', () => {
    const r = calculateIncomeTax({ grossIncome: 10000, filingStatus: 'single' });
    expect(r.taxableIncome).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.afterTax).toBe(10000);
    expect(r.effectiveRate).toBe(0);
  });

  it('is deterministic — identical inputs give a deeply-equal result', () => {
    const input = { grossIncome: 83250, filingStatus: 'married' as FilingStatus, additionalDeductions: 6000 };
    expect(calculateIncomeTax(input)).toEqual(calculateIncomeTax(input));
  });
});

describe('income tax — pure-source behavior beyond the visitor domain', () => {
  // Characterizes the frozen source's own tolerance; the binding validates more
  // strictly (rejecting these before they ever reach the source).
  it('clamps a negative gross income to 0', () => {
    const r = calculateIncomeTax({ grossIncome: -5000, filingStatus: 'single' });
    expect(r.taxableIncome).toBe(0);
    expect(r.tax).toBe(0);
  });

  it('treats a NaN gross income as 0 (via `|| 0`)', () => {
    const r = calculateIncomeTax({ grossIncome: Number.NaN, filingStatus: 'single' });
    expect(r.taxableIncome).toBe(0);
    expect(r.tax).toBe(0);
  });

  it('clamps a negative additional deduction to 0 (no deduction added)', () => {
    const r = calculateIncomeTax({ grossIncome: 60000, filingStatus: 'single', additionalDeductions: -5000 });
    expect(r.taxableIncome).toBe(45400); // same as no extra deduction
    expect(r.tax).toBeCloseTo(5216, 6);
  });

  it('is NOT finite-safe for an infinite gross income — tax → Infinity, afterTax/effective → NaN', () => {
    const r = calculateIncomeTax({ grossIncome: Number.POSITIVE_INFINITY, filingStatus: 'single' });
    expect(r.tax).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(r.afterTax)).toBe(true);
    expect(Number.isNaN(r.effectiveRate)).toBe(true);
    expect(r.marginalRate).toBe(37);
  });

  it('throws for an unsupported filing status (no bracket table) — the binding must guard', () => {
    expect(() => calculateIncomeTax({ grossIncome: 50000, filingStatus: 'head-of-household' as unknown as FilingStatus })).toThrow();
  });
});

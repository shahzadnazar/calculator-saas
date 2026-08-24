import { describe, it, expect } from 'vitest';
import { calculateHomeEquity } from './home-equity';
import { pmt } from '@lib/finance';

/**
 * Dedicated Home Equity Loan characterization (R15B2 Commit 1 — Loan family
 * follow-on, 2 of 3). FREEZES the current behaviour of `calculateHomeEquity`
 * ahead of the task-first migration; it does NOT change any module. The Home
 * Equity binding (home-equity-loan-form.ts) layers required + cross-field
 * validation and a complete-result guard ON TOP of these unchanged functions —
 * this file pins exactly what it wraps:
 *
 *   • equity      = max(0, homeValue − mortgageBalance);
 *   • maxBorrow   = max(0, homeValue · maxLtvPct/100 − mortgageBalance);
 *   • monthlyPayment = pmt(loanAmount, annualRatePct/100/12, round(termYears·12));
 *   • exceedsMax  = loanAmount > maxBorrow + 0.005.
 *
 * It wraps only the shared `pmt` primitive (no loan.ts, no amortization schedule).
 * The 2 home-equity cases previously in batch-b.test.ts are consolidated here and
 * expanded; batch-b keeps its interest-rate / salary / income-tax coverage.
 *
 * The pure function CLAMPS `Math.max(0, x || 0)` and never rejects; the stricter
 * visitor-facing validation lives in the Commit-2 binding.
 */

const HE = (over: Partial<Parameters<typeof calculateHomeEquity>[0]> = {}) =>
  calculateHomeEquity({ homeValue: 400000, mortgageBalance: 250000, maxLtvPct: 85, loanAmount: 50000, annualRatePct: 8, termYears: 10, ...over });

describe('home equity — equity, max-borrow (LTV cap) and payment', () => {
  it('computes equity and max borrow at an LTV cap (moved from batch-b)', () => {
    const r = HE();
    expect(r.equity).toBe(150000); // 400000 − 250000
    expect(r.maxBorrow).toBe(90000); // 400000 * 0.85 − 250000
    expect(r.exceedsMax).toBe(false);
    expect(r.monthlyPayment).toBeGreaterThan(0);
  });

  it('the monthly payment IS pmt(loan, rate/100/12, round(term·12)) — a pass-through', () => {
    const r = HE();
    expect(r.monthlyPayment).toBe(pmt(50000, 8 / 100 / 12, 120));
  });

  it('flags borrowing above the cap (moved from batch-b)', () => {
    expect(HE({ loanAmount: 120000 }).exceedsMax).toBe(true);
  });

  it('equity = max(0, value − owed); a decimal LTV cap resolves exactly', () => {
    expect(HE({ homeValue: 500000, mortgageBalance: 200000, maxLtvPct: 82.5 }).equity).toBe(300000);
    expect(HE({ homeValue: 500000, mortgageBalance: 200000, maxLtvPct: 82.5 }).maxBorrow).toBe(500000 * 0.825 - 200000); // 212500
  });
});

describe('home equity — exceedsMax boundary (loan > maxBorrow + 0.005)', () => {
  it('loan exactly at maxBorrow is NOT over the cap', () => {
    expect(HE({ loanAmount: 90000 }).exceedsMax).toBe(false);
  });
  it('loan a cent over maxBorrow IS over the cap; a half-cent is within tolerance', () => {
    expect(HE({ loanAmount: 90000.01 }).exceedsMax).toBe(true);
    expect(HE({ loanAmount: 90000.004 }).exceedsMax).toBe(false); // ≤ +0.005 tolerance
  });
});

describe('home equity — degenerate equity scenarios (clamped, never rejected)', () => {
  it('zero property value → zero equity and zero max borrow', () => {
    const r = HE({ homeValue: 0 });
    expect(r.equity).toBe(0);
    expect(r.maxBorrow).toBe(0);
  });
  it('mortgage at or above property value (underwater) → zero equity, zero borrow', () => {
    const r = HE({ homeValue: 300000, mortgageBalance: 350000 });
    expect(r.equity).toBe(0); // max(0, 300000 − 350000)
    expect(r.maxBorrow).toBe(0); // max(0, 300000*0.85 − 350000) = max(0, −95000)
  });
  it('a mortgage above the LTV allowance but below the value → equity but zero borrow', () => {
    const r = HE({ homeValue: 400000, mortgageBalance: 345000, maxLtvPct: 85 });
    expect(r.equity).toBe(55000); // 400000 − 345000
    expect(r.maxBorrow).toBe(0); // max(0, 340000 − 345000)
  });
});

describe('home equity — rate & term conversion, zero-interest', () => {
  it('zero-interest loan: payment = loan ÷ months (straight-line)', () => {
    const r = HE({ loanAmount: 12000, annualRatePct: 0, termYears: 1 });
    expect(r.monthlyPayment).toBe(1000); // 12000 / 12
  });
  it('the term is rounded to whole months (term·12); a fractional term rounds', () => {
    expect(HE({ termYears: 10 }).monthlyPayment).toBe(pmt(50000, 8 / 100 / 12, 120));
    expect(HE({ loanAmount: 10000, annualRatePct: 5, termYears: 2.5 }).monthlyPayment).toBe(pmt(10000, 5 / 100 / 12, 30));
  });
});

describe('home equity — malformed / non-finite / negative source inputs (clamped; not sanitized-to-valid)', () => {
  it('a NaN money field clamps to 0 (Math.max(0, x || 0))', () => {
    expect(HE({ homeValue: Number.NaN }).equity).toBe(0);
    expect(HE({ mortgageBalance: Number.NaN }).equity).toBe(400000); // owed 0
    expect(HE({ loanAmount: Number.NaN }).monthlyPayment).toBe(0); // loan 0
  });
  it('negative money fields clamp to 0', () => {
    expect(HE({ homeValue: -400000 }).equity).toBe(0);
    expect(HE({ loanAmount: -50000 }).monthlyPayment).toBe(0);
  });
  it('an INFINITE home value propagates to a non-finite equity (frozen — the binding guard rejects it)', () => {
    const r = HE({ homeValue: Number.POSITIVE_INFINITY });
    expect(Number.isFinite(r.equity)).toBe(false);
  });
  it('is deterministic for identical input', () => {
    expect(HE({ loanAmount: 60000 })).toEqual(HE({ loanAmount: 60000 }));
  });
});

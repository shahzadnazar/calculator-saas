import { describe, it, expect } from 'vitest';
import { payoffByPayment, payoffByMonths } from './credit-card';
import { solveMonths } from './payment';

/**
 * Credit-card payoff formula characterization (R8C1 Commit 1).
 *
 * Locks the EXACT current behaviour of the two pure functions the calculator relies
 * on — `payoffByPayment` (balance + APR + monthly payment → payoff time + interest +
 * total paid) and `payoffByMonths` (balance + APR + target months → required payment +
 * interest + total paid) — before the task-first migration. Both delegate the core
 * math to the shared `solveMonths` / `pmt`; the credit-card layer adds the whole-month
 * ceiling, the total-paid = payment × whole-count relationship, the total-interest =
 * total-paid − balance relationship, and the all-Infinity "never" propagation.
 *
 * Consolidated here from batch-b.test.ts. This commit is characterization only: no
 * production code changes and no output changes.
 */

describe('payoffByPayment — balance + APR + payment → payoff', () => {
  it('representative: whole-month ceiling drives an exact total paid + interest', () => {
    const r = payoffByPayment(5000, 19.99, 200);
    expect(r.months).toBe(33); // ceil of ~32.6 raw months
    expect(r.totalPaid).toBe(6600); // 200 × 33 (whole payments)
    expect(r.totalInterest).toBe(1600); // 6600 − 5000
  });

  it('zero APR divides the balance, still ceiling the month count', () => {
    // 6,000 / 500 = 12 months exactly.
    expect(payoffByPayment(6000, 0, 500)).toEqual({ months: 12, totalInterest: 0, totalPaid: 6000 });
    // 5,000 / 400 = 12.5 → ceil 13; total paid 400 × 13 = 5,200; interest 200.
    expect(payoffByPayment(5000, 0, 400)).toEqual({ months: 13, totalInterest: 200, totalPaid: 5200 });
  });

  it('a payment ABOVE the monthly interest is a finite payoff', () => {
    const r = payoffByPayment(5000, 18, 200); // interest is 75/mo
    expect(Number.isFinite(r.months)).toBe(true);
    expect(r.totalInterest).toBeGreaterThan(0);
    expect(r.totalPaid).toBeGreaterThan(5000);
    expect(r.totalPaid).toBe(200 * r.months); // total paid = payment × whole count
    expect(r.totalInterest).toBe(r.totalPaid - 5000);
  });

  it('a payment EQUAL to the monthly interest → all-Infinity never', () => {
    // interest = 5,000 × 18%/12 = 75; paying exactly 75 never reduces the balance.
    expect(payoffByPayment(5000, 18, 75)).toEqual({
      months: Infinity,
      totalInterest: Infinity,
      totalPaid: Infinity,
    });
  });

  it('a payment BELOW the monthly interest → all-Infinity never', () => {
    expect(payoffByPayment(5000, 18, 50)).toEqual({
      months: Infinity,
      totalInterest: Infinity,
      totalPaid: Infinity,
    });
  });

  it('zero and negative payment → all-Infinity never', () => {
    expect(payoffByPayment(5000, 18, 0).months).toBe(Infinity);
    expect(payoffByPayment(5000, 18, -50).months).toBe(Infinity);
  });

  it('zero and negative balance collapse to an all-zero payoff', () => {
    expect(payoffByPayment(0, 18, 200)).toEqual({ months: 0, totalInterest: 0, totalPaid: 0 });
    expect(payoffByPayment(-5000, 18, 200)).toEqual({ months: 0, totalInterest: 0, totalPaid: 0 });
  });

  it('NaN inputs degrade safely (never a thrown error)', () => {
    expect(payoffByPayment(NaN, 18, 200)).toEqual({ months: 0, totalInterest: 0, totalPaid: 0 }); // balance→0
    expect(payoffByPayment(5000, NaN, 200).months).toBe(25); // APR→0 → 5000/200 = 25
    expect(payoffByPayment(5000, 18, NaN).months).toBe(Infinity); // payment→0 → never
  });

  it('non-finite balance / APR propagate to the never result', () => {
    expect(payoffByPayment(Infinity, 18, 200).months).toBe(Infinity);
    expect(payoffByPayment(5000, Infinity, 200).months).toBe(Infinity);
  });
});

describe('payoffByMonths — balance + APR + months → required payment', () => {
  it('representative: a finite required payment with interest', () => {
    const r = payoffByMonths(5000, 19.99, 24);
    expect(r.monthlyPayment).toBeCloseTo(254.47, 1);
    expect(r.totalPaid).toBeCloseTo(r.monthlyPayment * 24, 6);
    expect(r.totalInterest).toBeCloseTo(r.totalPaid - 5000, 6);
  });

  it('zero APR spreads the balance evenly with no interest', () => {
    // 6,000 / 24 = 250; total paid 6,000; interest 0.
    expect(payoffByMonths(6000, 0, 24)).toEqual({ monthlyPayment: 250, totalInterest: 0, totalPaid: 6000 });
  });

  it('a one-month payoff is balance + one month of interest', () => {
    // pmt(5000, 1%/mo, 1) = 5,050 (± float dust); interest = 50.
    const r = payoffByMonths(5000, 12, 1);
    expect(r.monthlyPayment).toBeCloseTo(5050, 6);
    expect(r.totalInterest).toBeCloseTo(50, 6);
    expect(r.totalPaid).toBeCloseTo(5050, 6);
  });

  it('fractional months round to the nearest whole month before solving', () => {
    const base = payoffByMonths(5000, 12, 24).monthlyPayment;
    expect(payoffByMonths(5000, 12, 24.4).monthlyPayment).toBe(base); // 24.4 → 24
    expect(payoffByMonths(5000, 12, 24.6).monthlyPayment).not.toBe(base); // 24.6 → 25
  });

  it('zero and negative months clamp to one month (max(1, round))', () => {
    const oneMonth = payoffByMonths(5000, 12, 1);
    expect(payoffByMonths(5000, 12, 0)).toEqual(oneMonth);
    expect(payoffByMonths(5000, 12, -5)).toEqual(oneMonth);
  });

  it('zero and negative balance collapse to an all-zero payment', () => {
    expect(payoffByMonths(0, 12, 24)).toEqual({ monthlyPayment: 0, totalInterest: 0, totalPaid: 0 });
    expect(payoffByMonths(-5000, 12, 24)).toEqual({ monthlyPayment: 0, totalInterest: 0, totalPaid: 0 });
  });

  it('NaN inputs degrade safely', () => {
    expect(payoffByMonths(NaN, 12, 24)).toEqual({ monthlyPayment: 0, totalInterest: 0, totalPaid: 0 }); // balance→0
    expect(payoffByMonths(5000, NaN, 24).monthlyPayment).toBeCloseTo(5000 / 24, 6); // APR→0
    expect(payoffByMonths(5000, 12, NaN)).toEqual(payoffByMonths(5000, 12, 1)); // months→0→clamp 1
  });

  it('non-finite balance / APR do not produce a usable finite payment', () => {
    expect(Number.isFinite(payoffByMonths(Infinity, 12, 24).monthlyPayment)).toBe(false);
    expect(Number.isFinite(payoffByMonths(5000, Infinity, 24).monthlyPayment)).toBe(false);
  });
});

describe('credit-card — cross-mode consistency (with the ceil/round caveat)', () => {
  it('the required payment for N months, fed back, RAW-solves near N; payoffByPayment then ceils', () => {
    const N = 24;
    const P = payoffByMonths(5000, 18, N).monthlyPayment;
    // The raw solve is within a rounding whisker of N…
    expect(solveMonths(5000, 18, P)).toBeCloseTo(N, 1);
    // …but payoffByPayment CEILs, so a raw 24.0x lands at 24 or 25 — never below N.
    const backMonths = payoffByPayment(5000, 18, P).months;
    expect(backMonths).toBeGreaterThanOrEqual(N);
    expect(backMonths).toBeLessThanOrEqual(N + 1);
  });
});

describe('credit-card — presentation inputs the migration consumes', () => {
  it('the whole payment count is an integer that total paid is derived from', () => {
    const r = payoffByPayment(5000, 19.99, 200);
    expect(Number.isInteger(r.months)).toBe(true);
    expect(r.totalPaid).toBe(200 * r.months); // "may slightly overstate" the final partial month
  });

  it('never surfaces a fractional or non-finite month for a finite payoff', () => {
    for (const pay of [150, 200, 300, 500, 1000]) {
      const r = payoffByPayment(5000, 19.99, pay);
      if (Number.isFinite(r.months)) expect(Number.isInteger(r.months)).toBe(true);
    }
  });
});

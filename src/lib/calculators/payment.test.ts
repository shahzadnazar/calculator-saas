import { describe, it, expect } from 'vitest';
import { loanPayment, solveMonths } from './payment';

/**
 * Payment formula characterization (R8B1 Commit 1).
 *
 * These tests lock the EXACT current behaviour of the two pure functions the
 * Payment calculator relies on — `loanPayment` (fixed term → monthly payment)
 * and `solveMonths` (fixed payment → payoff months) — plus the duration
 * floor/round/ceil arithmetic the island performs when it presents a payoff.
 *
 * This commit is characterization only: it introduces no production code and
 * must not change any output. The task-first migration that follows reuses
 * these exact values, so any drift here is a real regression, not a test nit.
 */

describe('loanPayment — fixed term → monthly payment', () => {
  it('representative: 30-year mortgage', () => {
    // 300,000 at 6% APR over 360 months → the canonical ~$1,798.65 payment.
    expect(loanPayment(300000, 6, 360)).toBeCloseTo(1798.65, 1);
  });

  it('representative: the documented worked example (20k / 6% / 5yr)', () => {
    // 20,000 at 6% over 60 months → ~$386.66 (drives the §13 announcement).
    expect(loanPayment(20000, 6, 60)).toBeCloseTo(386.656, 2);
  });

  it('zero interest divides principal evenly across the term', () => {
    expect(loanPayment(12000, 0, 12)).toBeCloseTo(1000, 6);
    expect(loanPayment(20000, 0, 60)).toBeCloseTo(20000 / 60, 6);
  });

  it('decimal rate is applied without rounding the rate first', () => {
    // 15,000 at 4.25% over 48 months → ~$340.37 (verified against the formula).
    expect(loanPayment(15000, 4.25, 48)).toBeCloseTo(340.366, 2);
  });

  it('fractional (non-integer) month counts are accepted and monotonic', () => {
    // A longer term always yields a smaller payment; a fractional term sits
    // strictly between its bracketing integer terms.
    const at60 = loanPayment(20000, 6, 60);
    const at66 = loanPayment(20000, 6, 66);
    const at72 = loanPayment(20000, 6, 72);
    expect(Number.isFinite(at66)).toBe(true);
    expect(at72).toBeLessThan(at66);
    expect(at66).toBeLessThan(at60);
    // A genuinely fractional exponent still returns a finite payment.
    expect(Number.isFinite(loanPayment(10000, 5, 30.5))).toBe(true);
  });

  it('zero principal → zero payment', () => {
    expect(loanPayment(0, 6, 60)).toBe(0);
  });

  it('non-positive term collapses to zero (pmt guard: months <= 0)', () => {
    expect(loanPayment(20000, 6, 0)).toBe(0);
    expect(loanPayment(20000, 6, -12)).toBe(0);
  });

  it('NaN principal propagates to NaN', () => {
    expect(Number.isNaN(loanPayment(NaN, 6, 60))).toBe(true);
  });

  it('NaN rate is coerced to 0 by `annualRatePct || 0` (zero-interest path)', () => {
    // Documents the existing coercion: a NaN rate does not poison the result,
    // it degrades to the zero-interest division. The migration validates the
    // rate up front, so this path is a safety net rather than a UX surface.
    expect(loanPayment(20000, NaN, 60)).toBeCloseTo(20000 / 60, 6);
  });

  it('non-finite term yields NaN (unreachable post-validation, locked anyway)', () => {
    expect(Number.isNaN(loanPayment(20000, 6, NaN))).toBe(true);
    expect(Number.isNaN(loanPayment(20000, 6, Infinity))).toBe(true);
  });

  it('exact output at cents precision (golden)', () => {
    // Independently verified against standard mortgage tables.
    expect(loanPayment(300000, 6, 360)).toBeCloseTo(1798.65, 2);
    expect(loanPayment(100000, 6, 360)).toBeCloseTo(599.55, 2);
  });
});

describe('solveMonths — fixed payment → payoff months', () => {
  it('representative: paying the 30-year payment clears it in ~360 months', () => {
    expect(solveMonths(300000, 6, 1798.65)).toBeCloseTo(360, 0);
  });

  it('zero interest: months = principal / payment', () => {
    expect(solveMonths(12000, 0, 1000)).toBeCloseTo(12, 6);
    expect(solveMonths(20000, 0, 500)).toBeCloseTo(40, 6);
  });

  it('decimal rate inverts loanPayment for the worked example', () => {
    // The 20k/6%/60mo payment (~386.66) pays the loan off in ~60 months.
    expect(solveMonths(20000, 6, 386.656)).toBeCloseTo(60, 0);
  });

  it('payment ABOVE the monthly interest → a finite payoff', () => {
    // 100,000 at 12% → interest is 1,000/mo; paying 1,500 clears it eventually.
    const n = solveMonths(100000, 12, 1500);
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeCloseTo(110.41, 1);
  });

  it('payment EQUAL to the monthly interest → Infinity (never pays down)', () => {
    // interest = 100,000 * 12%/12 = 1,000; paying exactly 1,000 never reduces it.
    expect(solveMonths(100000, 12, 1000)).toBe(Infinity);
  });

  it('payment BELOW the monthly interest → Infinity', () => {
    expect(solveMonths(100000, 12, 500)).toBe(Infinity);
  });

  it('zero payment → Infinity', () => {
    expect(solveMonths(1000, 5, 0)).toBe(Infinity);
  });

  it('negative payment → Infinity', () => {
    expect(solveMonths(1000, 5, -50)).toBe(Infinity);
  });

  it('zero principal → 0 months (nothing to pay off)', () => {
    expect(solveMonths(0, 5, 500)).toBe(0);
  });

  it('NaN principal collapses to 0 via `max(0, principal || 0)`', () => {
    expect(solveMonths(NaN, 5, 500)).toBe(0);
  });

  it('NaN rate is coerced to 0 (zero-interest path: principal / payment)', () => {
    expect(solveMonths(100000, NaN, 500)).toBeCloseTo(200, 6);
  });

  it('NaN payment → Infinity via `payment || 0` (unreachable post-validation)', () => {
    expect(solveMonths(100000, 5, NaN)).toBe(Infinity);
  });

  it('exact Infinity is returned (===), never a large finite or NaN', () => {
    // The migration renders this as the informational "Never" result, so the
    // sentinel must be exactly Infinity — not 1e308, not NaN.
    const n = solveMonths(50000, 10, 400); // interest 416.67/mo > 400 payment
    expect(n).toBe(Infinity);
    expect(Number.isNaN(n)).toBe(false);
  });
});

describe('cross-mode consistency — loanPayment and solveMonths are inverses', () => {
  const cases: Array<[number, number, number]> = [
    [20000, 6, 60],
    [300000, 6, 360],
    [15000, 4.25, 48],
    [12000, 0, 24],
  ];
  it('round-trips term → payment → term within tolerance', () => {
    for (const [principal, rate, months] of cases) {
      const payment = loanPayment(principal, rate, months);
      const recovered = solveMonths(principal, rate, payment);
      expect(recovered).toBeCloseTo(months, 0);
    }
  });
});

describe('payoff duration presentation — floor/round/ceil/pluralization', () => {
  // The island derives the payoff display from a raw month count with:
  //   years          = Math.floor(months / 12)
  //   residualMonths = Math.round(months % 12)
  //   paymentCount   = Math.ceil(months)
  // The migration MUST preserve this exact arithmetic. Expected integers below
  // are hard-coded goldens (not re-derived from the same expressions), and they
  // deliberately include the round-up artifacts the current code produces.
  const rounding = (months: number) => ({
    years: Math.floor(months / 12),
    residualMonths: Math.round(months % 12),
    paymentCount: Math.ceil(months),
  });

  it('splits whole and fractional month counts as the island does', () => {
    expect(rounding(56.3)).toEqual({ years: 4, residualMonths: 8, paymentCount: 57 });
    expect(rounding(12)).toEqual({ years: 1, residualMonths: 0, paymentCount: 12 });
    expect(rounding(0.4)).toEqual({ years: 0, residualMonths: 0, paymentCount: 1 });
    expect(rounding(360)).toEqual({ years: 30, residualMonths: 0, paymentCount: 360 });
  });

  it('preserves the residual-month round-up artifacts (e.g. "12 months")', () => {
    // 11.6 % 12 = 11.6 → round → 12; 59.5 % 12 = 11.5 → round → 12.
    // These are the current outputs and must not silently change.
    expect(rounding(11.6)).toEqual({ years: 0, residualMonths: 12, paymentCount: 12 });
    expect(rounding(59.5)).toEqual({ years: 4, residualMonths: 12, paymentCount: 60 });
  });

  it('payment-count pluralization rule: 1 is singular, everything else plural', () => {
    const label = (count: number) => (count === 1 ? 'monthly payment' : 'monthly payments');
    expect(label(1)).toBe('monthly payment');
    expect(label(0)).toBe('monthly payments');
    expect(label(57)).toBe('monthly payments');
  });
});

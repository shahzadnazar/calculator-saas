import { describe, it, expect } from 'vitest';
import { solveAnnualRate } from './interest-rate';
import { pmt } from '@lib/finance';

/**
 * Dedicated Interest Rate characterization (R15B3 Commit 1 — Loan family
 * follow-on, 3 of 3). FREEZES the current behaviour of `solveAnnualRate` ahead of
 * the task-first migration; it does NOT change any module. The Interest Rate
 * binding (interest-rate-form.ts) layers required + cross-field feasibility
 * validation and a complete-result guard ON TOP of this unchanged function — this
 * file pins exactly what it wraps.
 *
 * `solveAnnualRate(principal, payment, months)` has no closed form: it bisects the
 * monotonic `pmt` for the monthly rate (lo=0, hi=1 doubled ≤60× to bracket, then
 * 200 iterations) and returns the ANNUAL rate as a PERCENT — `((lo+hi)/2)·12·100`.
 * It depends only on the shared `pmt` primitive (no loan.ts). It returns:
 *   • NaN            when principal ≤ 0, round(months) ≤ 0, or payment ≤ 0;
 *   • exactly 0      when payment·months ≤ principal (the zero-interest branch);
 *   • a positive %   otherwise (solved to the bisection tolerance).
 *
 * The 2 interest-rate cases previously in batch-b.test.ts are consolidated here and
 * expanded; batch-b keeps its salary / income-tax coverage. Pure-formula behaviour
 * is pinned SEPARATELY from the visitor-facing validation the binding adds.
 */

/** Generate the exact payment for a known annual rate, then solve back (round-trip through pmt). */
const payFor = (principal: number, annualPct: number, months: number) =>
  pmt(principal, annualPct / 100 / 12, months);

describe('interest rate — round-trips a pmt-generated payment back to its rate', () => {
  it('recovers a known ~5% rate (moved from batch-b)', () => {
    expect(solveAnnualRate(20000, 377.42, 60)).toBeCloseTo(5, 1);
  });

  it('returns the ANNUAL rate as a percent, to high precision, across the ordinary band', () => {
    for (const rate of [0.5, 3, 5, 6.5, 7, 12, 24]) {
      const payment = payFor(20000, rate, 60);
      expect(solveAnnualRate(20000, payment, 60)).toBeCloseTo(rate, 6);
    }
  });

  it('recovers a high supported rate (100% annual)', () => {
    const payment = payFor(20000, 100, 60);
    expect(solveAnnualRate(20000, payment, 60)).toBeCloseTo(100, 4);
  });

  it("matches the page's worked example — $12,000 at $238/mo for 60mo ≈ 7%", () => {
    expect(solveAnnualRate(12000, 238, 60)).toBeCloseTo(7, 0);
  });

  it('the monthly rate is the annual result ÷ 12 (annual is a straight ·12 of the solved monthly rate)', () => {
    const annual = solveAnnualRate(20000, payFor(20000, 9, 48), 48);
    expect(annual / 12).toBeCloseTo(9 / 12, 6);
  });
});

describe('interest rate — term (months) handling', () => {
  it('a short 1-month term resolves (pmt(P,r,1) = P·(1+r) → r solved)', () => {
    // pmt(1000, r, 1) = 1000·(1+r); 1100 ⇒ r = 0.1/mo ⇒ 120% annual.
    expect(solveAnnualRate(1000, 1100, 1)).toBeCloseTo(120, 4);
  });
  it('a long 360-month term resolves', () => {
    const payment = payFor(200000, 5, 360);
    expect(solveAnnualRate(200000, payment, 360)).toBeCloseTo(5, 6);
  });
  it('a fractional term is ROUNDED to whole months (Math.round) — the frozen rule', () => {
    expect(solveAnnualRate(20000, 377.42, 60.4)).toBe(solveAnnualRate(20000, 377.42, 60));
    expect(solveAnnualRate(20000, 377.42, 60.6)).toBe(solveAnnualRate(20000, 377.42, 61));
  });
});

describe('interest rate — zero-interest boundary (payment·months ≤ principal ⇒ 0)', () => {
  it('payment barely covering principal returns ~0 (moved from batch-b)', () => {
    expect(solveAnnualRate(12000, 1000, 12)).toBeCloseTo(0, 4);
  });
  it('principal exactly equal to total payments is exactly 0', () => {
    expect(solveAnnualRate(60000, 1000, 60)).toBe(0); // 1000·60 = 60000
    expect(solveAnnualRate(12000, 1000, 12)).toBe(0);
  });
  it('a payment BELOW the zero-interest minimum still returns 0 (frozen; the binding rejects it as infeasible)', () => {
    // 100·12 = 1200 < 20000 — cannot repay even at 0%, yet the pure function floors to 0.
    expect(solveAnnualRate(20000, 100, 12)).toBe(0);
  });
  it('just ABOVE the boundary yields a small positive rate', () => {
    // p/n = 1000; pay a touch more ⇒ a small positive solved rate.
    expect(solveAnnualRate(60000, 1001, 60)).toBeGreaterThan(0);
  });
});

describe('interest rate — extreme / unsupported payments (no throw, no non-convergence)', () => {
  it('a very high payment returns a finite positive rate (bisection brackets it)', () => {
    const r = solveAnnualRate(1000, 100000, 12);
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThan(0);
  });
  it('is deterministic for identical input', () => {
    expect(solveAnnualRate(20000, 377.42, 60)).toBe(solveAnnualRate(20000, 377.42, 60));
  });
});

describe('interest rate — guard: non-positive / malformed / non-finite inputs', () => {
  it('non-positive principal / payment / term ⇒ NaN', () => {
    expect(Number.isNaN(solveAnnualRate(0, 377, 60))).toBe(true); // zero principal
    expect(Number.isNaN(solveAnnualRate(20000, 0, 60))).toBe(true); // zero payment
    expect(Number.isNaN(solveAnnualRate(20000, 377, 0))).toBe(true); // zero term
    expect(Number.isNaN(solveAnnualRate(-20000, 377, 60))).toBe(true); // negative principal
    expect(Number.isNaN(solveAnnualRate(20000, -377, 60))).toBe(true); // negative payment
    expect(Number.isNaN(solveAnnualRate(20000, 377, -60))).toBe(true); // negative term
  });
  it('NaN money fields coerce (x||0) then hit the non-positive guard ⇒ NaN', () => {
    expect(Number.isNaN(solveAnnualRate(Number.NaN, 377, 60))).toBe(true); // principal → 0 → NaN
    expect(Number.isNaN(solveAnnualRate(20000, Number.NaN, 60))).toBe(true); // payment → 0 → NaN
  });
  it('an INFINITE principal makes payment·months ≤ principal true ⇒ the frozen 0 (binding rejects non-finite input)', () => {
    expect(solveAnnualRate(Number.POSITIVE_INFINITY, 377, 60)).toBe(0);
  });
});

describe('interest rate — solver convergence / tolerance', () => {
  it('the solved rate reproduces the submitted payment through pmt to within a cent', () => {
    for (const rate of [4.25, 8, 15.75]) {
      const payment = payFor(30000, rate, 72);
      const solved = solveAnnualRate(30000, payment, 72);
      const recomputed = pmt(30000, solved / 100 / 12, 72);
      expect(Math.abs(recomputed - payment)).toBeLessThan(0.01);
    }
  });
});

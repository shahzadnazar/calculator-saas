import { describe, it, expect } from 'vitest';
import { calculateSimpleInterest } from './simple-interest';
import { formatCurrency } from '@lib/format';

/**
 * Simple-interest formula characterization (R9A1 Commit 1).
 *
 * Locks the EXACT current behaviour of `calculateSimpleInterest` — I = P · r · t with
 * `principal = Math.max(0, principal || 0)` (principal clamped to ≥ 0) and rate/years passed
 * through `|| 0` (NOT clamped) — before the task-first binding adds its own validation.
 *
 * Three layers are kept deliberately separate and only the FIRST is frozen here:
 *   • frozen formula behaviour — this file (no production change in Commit 1),
 *   • binding validation — simple-interest-form.ts (Commit 2) may REJECT negatives / non-finite
 *     inputs even though the pure formula tolerates them, so those cases never reach compute,
 *   • displayed USD rounding — presentation-only (`formatCurrency`), shown here to be independent
 *     of the full-precision math.
 *
 * Characterization only: no production code changes, no output changes.
 */

describe('calculateSimpleInterest — ordinary cases', () => {
  it('representative principal, rate and years: exact interest and total', () => {
    const r = calculateSimpleInterest({ principal: 1000, annualRatePct: 5, years: 3 });
    expect(r.interest).toBe(150); // 1000 × 0.05 × 3
    expect(r.total).toBe(1150); // principal + interest
  });

  it('the island default sample (5,000 / 5% / 3y) earns 750 for a 5,750 total', () => {
    expect(calculateSimpleInterest({ principal: 5000, annualRatePct: 5, years: 3 })).toEqual({
      interest: 750,
      total: 5750,
    });
  });

  it('decimal principal and decimal rate keep full precision', () => {
    const r = calculateSimpleInterest({ principal: 2500.5, annualRatePct: 3.75, years: 2.5 });
    expect(r.interest).toBe(234.421875); // 2500.5 × 0.0375 × 2.5, exactly representable
    expect(r.total).toBe(2734.921875);
  });

  it('a fractional duration is linear in time (half a year is half the interest)', () => {
    const full = calculateSimpleInterest({ principal: 1000, annualRatePct: 4.2, years: 1 });
    const half = calculateSimpleInterest({ principal: 1000, annualRatePct: 4.2, years: 0.5 });
    expect(half.interest).toBeCloseTo(full.interest / 2, 10);
    expect(half.interest).toBe(21); // 1000 × 0.042 × 0.5
    expect(half.total).toBe(1021);
  });

  it('formula identity holds: interest = principal × rate/100 × years, total = principal + interest', () => {
    for (const c of [
      { principal: 1000, annualRatePct: 5, years: 3 },
      { principal: 250, annualRatePct: 2.5, years: 7 },
      { principal: 99999, annualRatePct: 6.125, years: 1.5 },
    ]) {
      const r = calculateSimpleInterest(c);
      expect(r.interest).toBeCloseTo(c.principal * (c.annualRatePct / 100) * c.years, 9);
      expect(r.total).toBeCloseTo(c.principal + r.interest, 9);
    }
  });
});

describe('calculateSimpleInterest — zero cases', () => {
  it('zero principal → no interest, zero total', () => {
    expect(calculateSimpleInterest({ principal: 0, annualRatePct: 5, years: 3 })).toEqual({ interest: 0, total: 0 });
  });

  it('zero rate with a positive principal and duration → no interest, total = principal', () => {
    expect(calculateSimpleInterest({ principal: 1000, annualRatePct: 0, years: 3 })).toEqual({
      interest: 0,
      total: 1000,
    });
  });

  it('zero duration with a positive principal and rate → no interest, total = principal', () => {
    expect(calculateSimpleInterest({ principal: 1000, annualRatePct: 5, years: 0 })).toEqual({
      interest: 0,
      total: 1000,
    });
  });

  it('all inputs zero → an all-zero result', () => {
    expect(calculateSimpleInterest({ principal: 0, annualRatePct: 0, years: 0 })).toEqual({ interest: 0, total: 0 });
  });
});

describe('calculateSimpleInterest — current negative behaviour (frozen; the binding rejects these)', () => {
  it('negative principal is CLAMPED to zero (Math.max(0, …)) → all-zero result', () => {
    expect(calculateSimpleInterest({ principal: -1000, annualRatePct: 5, years: 3 })).toEqual({
      interest: 0,
      total: 0,
    });
  });

  it('negative rate is NOT clamped → negative interest, total below principal', () => {
    expect(calculateSimpleInterest({ principal: 1000, annualRatePct: -5, years: 3 })).toEqual({
      interest: -150,
      total: 850,
    });
  });

  it('negative duration is NOT clamped → negative interest', () => {
    expect(calculateSimpleInterest({ principal: 1000, annualRatePct: 5, years: -3 })).toEqual({
      interest: -150,
      total: 850,
    });
  });

  it('a negative rate AND a negative duration multiply to POSITIVE interest', () => {
    expect(calculateSimpleInterest({ principal: 1000, annualRatePct: -5, years: -3 })).toEqual({
      interest: 150,
      total: 1150,
    });
  });

  it('an all-negative input still clamps principal first → all-zero result', () => {
    expect(calculateSimpleInterest({ principal: -1000, annualRatePct: -5, years: -3 })).toEqual({
      interest: 0,
      total: 0,
    });
  });
});

describe('calculateSimpleInterest — non-finite inputs (frozen; the binding rejects these)', () => {
  it('NaN principal collapses via `|| 0` to a zero principal → all-zero result (finite)', () => {
    const r = calculateSimpleInterest({ principal: NaN, annualRatePct: 5, years: 3 });
    expect(r).toEqual({ interest: 0, total: 0 });
    expect(Number.isFinite(r.interest)).toBe(true);
  });

  it('NaN rate collapses via `|| 0` → no interest, total = principal (finite)', () => {
    expect(calculateSimpleInterest({ principal: 1000, annualRatePct: NaN, years: 3 })).toEqual({
      interest: 0,
      total: 1000,
    });
  });

  it('NaN years collapses via `|| 0` → no interest, total = principal (finite)', () => {
    expect(calculateSimpleInterest({ principal: 1000, annualRatePct: 5, years: NaN })).toEqual({
      interest: 0,
      total: 1000,
    });
  });

  it('Infinity principal with a positive rate and duration → Infinity interest and total', () => {
    const r = calculateSimpleInterest({ principal: Infinity, annualRatePct: 5, years: 3 });
    expect(r.interest).toBe(Infinity);
    expect(r.total).toBe(Infinity);
  });

  it('Infinity principal with a ZERO rate produces NaN (Infinity × 0)', () => {
    const r = calculateSimpleInterest({ principal: Infinity, annualRatePct: 0, years: 3 });
    expect(Number.isNaN(r.interest)).toBe(true);
    expect(Number.isNaN(r.total)).toBe(true);
  });

  it('Infinity principal with a ZERO duration produces NaN (Infinity × 0)', () => {
    const r = calculateSimpleInterest({ principal: Infinity, annualRatePct: 5, years: 0 });
    expect(Number.isNaN(r.interest)).toBe(true);
    expect(Number.isNaN(r.total)).toBe(true);
  });

  it('Infinity rate or Infinity duration → Infinity interest and total', () => {
    expect(calculateSimpleInterest({ principal: 1000, annualRatePct: Infinity, years: 3 }).interest).toBe(Infinity);
    expect(calculateSimpleInterest({ principal: 1000, annualRatePct: 5, years: Infinity }).interest).toBe(Infinity);
  });

  it('-Infinity principal clamps to 0 (Math.max) → all-zero result; -Infinity rate stays -Infinity', () => {
    expect(calculateSimpleInterest({ principal: -Infinity, annualRatePct: 5, years: 3 })).toEqual({
      interest: 0,
      total: 0,
    });
    expect(calculateSimpleInterest({ principal: 1000, annualRatePct: -Infinity, years: 3 }).interest).toBe(-Infinity);
  });
});

describe('calculateSimpleInterest — precision vs. displayed USD rounding', () => {
  it('retains full binary precision internally, including float dust', () => {
    const r = calculateSimpleInterest({ principal: 100, annualRatePct: 3.33, years: 1 });
    expect(r.interest).toBeCloseTo(3.33, 10);
    expect(r.interest).not.toBe(3.33); // 3.3300000000000005 — dust is preserved, not pre-rounded
  });

  it('currency rounding is presentation-only: `formatCurrency` rounds to the cent, the math does not', () => {
    const r = calculateSimpleInterest({ principal: 100, annualRatePct: 3.33, years: 1 });
    expect(formatCurrency(r.interest)).toBe('$3.33'); // display rounds
    const r2 = calculateSimpleInterest({ principal: 2500.5, annualRatePct: 3.75, years: 2.5 });
    expect(r2.interest).toBe(234.421875); // full precision retained
    expect(formatCurrency(r2.interest)).toBe('$234.42'); // display rounds to the cent
  });

  it('every finite, non-negative input yields finite interest and total (the binding-validated domain)', () => {
    for (const c of [
      { principal: 0, annualRatePct: 0, years: 0 },
      { principal: 5000, annualRatePct: 5, years: 3 },
      { principal: 0.01, annualRatePct: 0.01, years: 0.01 },
      { principal: 1_000_000, annualRatePct: 25, years: 40 },
    ]) {
      const r = calculateSimpleInterest(c);
      expect(Number.isFinite(r.interest)).toBe(true);
      expect(Number.isFinite(r.total)).toBe(true);
      expect(r.interest).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeGreaterThanOrEqual(c.principal);
    }
  });
});

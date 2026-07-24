import { describe, it, expect } from 'vitest';
import { adjustForInflation } from './inflation';
import { formatCurrency, formatPercent } from '@lib/format';

/**
 * Inflation formula characterization (R9C1 Commit 1).
 *
 * Freezes the EXACT current behaviour of `adjustForInflation` before the task-first binding is
 * added:
 *   factor            = Math.pow(1 + (rate||0)/100, years||0)
 *   futureCost        = (amount||0) * factor
 *   buyingPower       = factor === 0 ? NaN : (amount||0) / factor
 *   totalInflationPct = (factor - 1) * 100
 *
 * Three layers are kept separate and only the FIRST is frozen here:
 *   • frozen formula behaviour — this file (no production change in Commit 1),
 *   • binding validation — inflation-form.ts (Commit 2) accepts a NEGATIVE rate as valid deflation
 *     but rejects `rate <= -100` (the non-finite cliff) and a negative amount, so those inputs
 *     never reach the formula in production,
 *   • display formatting — presentation-only (`formatCurrency` / `formatPercent`).
 *
 * Characterization only: no production code changes, no output changes.
 */
const factorOf = (rate: number, years: number) => Math.pow(1 + rate / 100, years);

describe('adjustForInflation — ordinary inflation', () => {
  it('representative amount, positive rate and years: exact outputs', () => {
    const r = adjustForInflation({ amount: 100, annualRatePct: 3, years: 10 });
    expect(r.futureCost).toBeCloseTo(134.39163793, 6); // 100 × 1.03^10
    expect(r.buyingPower).toBeCloseTo(74.40939149, 6); // 100 / 1.03^10
    expect(r.totalInflationPct).toBeCloseTo(34.39163793, 6);
  });

  it('the legacy default sample (1,000 / 3% / 20y)', () => {
    const r = adjustForInflation({ amount: 1000, annualRatePct: 3, years: 20 });
    expect(r.futureCost).toBeCloseTo(1806.11123, 4);
    expect(r.buyingPower).toBeCloseTo(553.675754, 4);
    expect(r.totalInflationPct).toBeCloseTo(80.6111235, 4);
  });

  it('decimal amount, decimal rate and fractional years compound continuously', () => {
    const r = adjustForInflation({ amount: 2500.5, annualRatePct: 3.5, years: 12.5 });
    expect(r.futureCost).toBeCloseTo(3843.98099, 4);
    expect(r.buyingPower).toBeCloseTo(1626.56898, 4);
  });

  it('formula relationships hold (futureCost = amount·factor, buyingPower = amount/factor, pct = (factor-1)·100)', () => {
    for (const c of [
      { amount: 100, annualRatePct: 3, years: 10 },
      { amount: 5000, annualRatePct: 2.5, years: 30 },
      { amount: 250.75, annualRatePct: 7, years: 4.5 },
    ]) {
      const f = factorOf(c.annualRatePct, c.years);
      const r = adjustForInflation(c);
      expect(r.futureCost).toBeCloseTo(c.amount * f, 6);
      expect(r.buyingPower).toBeCloseTo(c.amount / f, 6);
      expect(r.totalInflationPct).toBeCloseTo((f - 1) * 100, 6);
      expect(f).toBeGreaterThan(0); // rate > -100, years >= 0 → positive factor
    }
  });
});

describe('adjustForInflation — zero cases', () => {
  it('a zero amount → $0 future cost and buying power (price change still reflects the rate)', () => {
    const r = adjustForInflation({ amount: 0, annualRatePct: 3, years: 10 });
    expect(r.futureCost).toBe(0);
    expect(r.buyingPower).toBe(0);
    expect(r.totalInflationPct).toBeCloseTo(34.39163793, 6);
  });

  it('a zero rate is a no-op (factor 1): future cost = buying power = amount, 0% change', () => {
    expect(adjustForInflation({ amount: 100, annualRatePct: 0, years: 10 })).toMatchObject({
      futureCost: 100,
      buyingPower: 100,
      totalInflationPct: 0,
    });
  });

  it('zero years is a no-op (factor 1)', () => {
    expect(adjustForInflation({ amount: 100, annualRatePct: 3, years: 0 })).toMatchObject({
      futureCost: 100,
      buyingPower: 100,
      totalInflationPct: 0,
    });
  });

  it('all inputs zero → $0 future cost and buying power, 0% change', () => {
    expect(adjustForInflation({ amount: 0, annualRatePct: 0, years: 0 })).toMatchObject({
      futureCost: 0,
      buyingPower: 0,
      totalInflationPct: 0,
    });
  });
});

describe('adjustForInflation — valid deflation (rate > -100)', () => {
  it('an ordinary negative rate lowers the future cost and raises buying power', () => {
    const r = adjustForInflation({ amount: 100, annualRatePct: -2, years: 10 });
    expect(r.futureCost).toBeCloseTo(81.70728069, 6); // below the original 100
    expect(r.buyingPower).toBeCloseTo(122.3881142, 6); // above the original 100
    expect(r.totalInflationPct).toBeCloseTo(-18.29271931, 6); // NEGATIVE cumulative change
  });

  it('deflation with a fractional duration', () => {
    const r = adjustForInflation({ amount: 100, annualRatePct: -2, years: 10.5 });
    expect(r.futureCost).toBeCloseTo(80.8860811, 5);
    expect(r.totalInflationPct).toBeLessThan(0);
  });

  it('a rate close to but greater than -100 stays finite (extreme but valid)', () => {
    const r = adjustForInflation({ amount: 100, annualRatePct: -99, years: 5 });
    expect(Number.isFinite(r.futureCost)).toBe(true);
    expect(Number.isFinite(r.buyingPower)).toBe(true);
    expect(r.futureCost).toBeCloseTo(1e-8, 12);
    expect(r.buyingPower).toBeCloseTo(1e12, 2);
    expect(r.totalInflationPct).toBeCloseTo(-100, 6);
  });
});

describe('adjustForInflation — non-finite cliff (frozen; the binding rejects rate <= -100)', () => {
  it('rate = -100 with positive years → factor 0, $0 future cost, NaN buying power (guard), -100% change', () => {
    const r = adjustForInflation({ amount: 100, annualRatePct: -100, years: 20 });
    expect(r.futureCost).toBe(0);
    expect(Number.isNaN(r.buyingPower)).toBe(true); // factor === 0 guard returns NaN
    expect(r.totalInflationPct).toBe(-100);
  });

  it('rate below -100 with fractional years → NaN everywhere (negative base ^ fractional power)', () => {
    const r = adjustForInflation({ amount: 100, annualRatePct: -150, years: 20.5 });
    expect(Number.isNaN(r.futureCost)).toBe(true);
    expect(Number.isNaN(r.buyingPower)).toBe(true);
    expect(Number.isNaN(r.totalInflationPct)).toBe(true);
  });

  it('rate below -100 with an ODD whole year → NEGATIVE factor and negative outputs', () => {
    const r = adjustForInflation({ amount: 100, annualRatePct: -150, years: 3 });
    expect(r.futureCost).toBe(-12.5); // 100 × (-0.5)^3
    expect(r.buyingPower).toBe(-800);
    expect(r.totalInflationPct).toBe(-112.5);
  });

  it('rate below -100 with an EVEN whole year → tiny positive factor, astronomically large buying power', () => {
    const r = adjustForInflation({ amount: 100, annualRatePct: -150, years: 20 });
    expect(r.futureCost).toBeGreaterThan(0);
    expect(r.buyingPower).toBeCloseTo(104857600, 0); // absurd but finite
  });
});

describe('adjustForInflation — current negative-amount behaviour (frozen; the binding rejects these)', () => {
  it('a negative amount with a positive rate → negative future cost and buying power', () => {
    const r = adjustForInflation({ amount: -100, annualRatePct: 3, years: 10 });
    expect(r.futureCost).toBeCloseTo(-134.39163793, 6);
    expect(r.buyingPower).toBeCloseTo(-74.40939149, 6);
    expect(r.totalInflationPct).toBeCloseTo(34.39163793, 6); // pct is amount-independent
  });

  it('a negative amount with a negative rate', () => {
    const r = adjustForInflation({ amount: -100, annualRatePct: -2, years: 10 });
    expect(r.futureCost).toBeCloseTo(-81.70728069, 6);
    expect(r.buyingPower).toBeCloseTo(-122.3881142, 6);
  });
});

describe('adjustForInflation — non-finite inputs (frozen; the binding rejects these)', () => {
  it('NaN amount collapses via `|| 0` → $0 future cost and buying power (finite)', () => {
    const r = adjustForInflation({ amount: NaN, annualRatePct: 3, years: 10 });
    expect(r.futureCost).toBe(0);
    expect(r.buyingPower).toBe(0);
    expect(Number.isFinite(r.totalInflationPct)).toBe(true);
  });

  it('NaN rate collapses via `|| 0` → factor 1 (no-op)', () => {
    expect(adjustForInflation({ amount: 100, annualRatePct: NaN, years: 10 })).toMatchObject({
      futureCost: 100,
      buyingPower: 100,
      totalInflationPct: 0,
    });
  });

  it('NaN years collapses via `|| 0` → factor 1 (no-op)', () => {
    expect(adjustForInflation({ amount: 100, annualRatePct: 3, years: NaN })).toMatchObject({ futureCost: 100, buyingPower: 100 });
  });

  it('Infinity amount → Infinity future cost and buying power', () => {
    const r = adjustForInflation({ amount: Infinity, annualRatePct: 3, years: 10 });
    expect(r.futureCost).toBe(Infinity);
    expect(r.buyingPower).toBe(Infinity);
  });

  it('Infinity rate or Infinity years → Infinity factor: Infinity future cost, 0 buying power, Infinity pct', () => {
    const r = adjustForInflation({ amount: 100, annualRatePct: Infinity, years: 10 });
    expect(r.futureCost).toBe(Infinity);
    expect(r.buyingPower).toBe(0); // 100 / Infinity
    expect(r.totalInflationPct).toBe(Infinity);
    expect(adjustForInflation({ amount: 100, annualRatePct: 3, years: Infinity }).futureCost).toBe(Infinity);
  });
});

describe('adjustForInflation — precision vs. displayed rounding', () => {
  it('retains full binary precision internally, including fractional cents and percentages', () => {
    const r = adjustForInflation({ amount: 100, annualRatePct: 3, years: 10 });
    expect(r.futureCost).toBe(134.39163793441222);
    expect(r.buyingPower).toBe(74.4093914896725);
    expect(r.totalInflationPct).toBe(34.39163793441222);
  });

  it('USD and percentage rounding are presentation-only', () => {
    const r = adjustForInflation({ amount: 100, annualRatePct: 3, years: 10 });
    expect(formatCurrency(r.futureCost)).toBe('$134.39');
    expect(formatCurrency(r.buyingPower)).toBe('$74.41');
    expect(formatPercent(r.totalInflationPct, 1)).toBe('34.4%');
    const d = adjustForInflation({ amount: 100, annualRatePct: -2, years: 10 });
    expect(formatCurrency(d.futureCost)).toBe('$81.71'); // deflation, still positive currency
    expect(formatPercent(d.totalInflationPct, 1)).toBe('-18.3%'); // signed percentage
  });

  it('every finite input with rate > -100, years >= 0 and amount >= 0 yields finite, non-negative currency', () => {
    for (const c of [
      { amount: 0, annualRatePct: 0, years: 0 },
      { amount: 100, annualRatePct: 3, years: 10 },
      { amount: 100, annualRatePct: -2, years: 10 }, // deflation
      { amount: 5000, annualRatePct: 0.5, years: 40 },
    ]) {
      const r = adjustForInflation(c);
      expect(Number.isFinite(r.futureCost)).toBe(true);
      expect(Number.isFinite(r.buyingPower)).toBe(true);
      expect(r.futureCost).toBeGreaterThanOrEqual(0);
      expect(r.buyingPower).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.totalInflationPct)).toBe(true);
    }
  });
});

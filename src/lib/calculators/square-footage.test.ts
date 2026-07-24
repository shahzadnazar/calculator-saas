import { describe, it, expect } from 'vitest';
import { calculateSquareFootage } from './square-footage';
import { formatCurrency, formatNumber } from '@lib/format';

/**
 * Square-footage formula characterization (R10B1 Commit 1) — consolidated out of the shared
 * gaps.test.ts into a dedicated file, ahead of the task-first migration.
 *
 * Freezes the EXACT current behaviour of `calculateSquareFootage`:
 *   lengthFt = max(0, length||0) × TO_FEET[unit];  widthFt = max(0, width||0) × TO_FEET[unit]
 *   areaSqFt = lengthFt × widthFt;  qty = max(1, floor(quantity||1));  totalSqFt = areaSqFt × qty
 *   totalSqM = totalSqFt / 10.7639104;  totalSqYd = totalSqFt / 9;  cost = totalSqFt × max(0, price||0)
 *   TO_FEET = { ft:1, in:1/12, yd:3, m:3.280839895 }
 *
 * Three layers are kept separate and only the FIRST is frozen here:
 *   • frozen formula behaviour — this file (no production change in Commit 1),
 *   • binding validation — square-footage-form.ts (Commit 2) rejects zero / negative / non-finite
 *     dimensions, a fractional / <1 quantity and a negative price even though the pure formula
 *     clamps or floors them,
 *   • display formatting — presentation-only (`formatNumber` / `formatCurrency`).
 *
 * Characterization only: no production code changes, no output changes.
 */
const TO_FEET = { ft: 1, in: 1 / 12, yd: 3, m: 3.280839895 } as const;

describe('calculateSquareFootage — ordinary feet cases', () => {
  it('representative length × width, quantity 1, no price', () => {
    const r = calculateSquareFootage({ length: 10, width: 12, unit: 'ft' });
    expect(r.areaSqFt).toBe(120);
    expect(r.totalSqFt).toBe(120);
    expect(r.totalSqM).toBeCloseTo(11.14836482, 6);
    expect(r.totalSqYd).toBeCloseTo(13.33333333, 6);
    expect(r.cost).toBe(0);
  });

  it('multiple quantity multiplies the single-area total, and a price gives a cost', () => {
    const r = calculateSquareFootage({ length: 10, width: 12, unit: 'ft', quantity: 2, pricePerSqFt: 5 });
    expect(r.areaSqFt).toBe(120);
    expect(r.totalSqFt).toBe(240);
    expect(r.cost).toBe(1200);
  });

  it('decimal dimensions and a decimal price keep full precision', () => {
    const r = calculateSquareFootage({ length: 12.5, width: 10.25, unit: 'ft', pricePerSqFt: 3.75 });
    expect(r.areaSqFt).toBe(128.125);
    expect(r.totalSqFt).toBe(128.125);
    expect(r.cost).toBe(480.46875);
  });
});

describe('calculateSquareFootage — every input unit (TO_FEET constants)', () => {
  it('exposes the exact conversion constants', () => {
    expect(TO_FEET).toEqual({ ft: 1, in: 1 / 12, yd: 3, m: 3.280839895 });
  });

  it('a single unit square: 1×1 in each unit → that unit² in feet²', () => {
    expect(calculateSquareFootage({ length: 1, width: 1, unit: 'ft' }).areaSqFt).toBe(1);
    expect(calculateSquareFootage({ length: 1, width: 1, unit: 'in' }).areaSqFt).toBeCloseTo((1 / 12) ** 2, 12);
    expect(calculateSquareFootage({ length: 1, width: 1, unit: 'yd' }).areaSqFt).toBe(9);
    expect(calculateSquareFootage({ length: 1, width: 1, unit: 'm' }).areaSqFt).toBeCloseTo(3.280839895 ** 2, 9);
  });

  it('the SAME physical 120 sq ft rectangle expressed in each unit yields ~120 sq ft', () => {
    expect(calculateSquareFootage({ length: 10, width: 12, unit: 'ft' }).totalSqFt).toBe(120);
    expect(calculateSquareFootage({ length: 120, width: 144, unit: 'in' }).totalSqFt).toBeCloseTo(120, 6); // 10ft=120in, 12ft=144in
    expect(calculateSquareFootage({ length: 10 / 3, width: 4, unit: 'yd' }).totalSqFt).toBeCloseTo(120, 6); // 10ft=3.33yd, 12ft=4yd
    expect(calculateSquareFootage({ length: 3.048, width: 3.6576, unit: 'm' }).totalSqFt).toBeCloseTo(120, 6); // metres drift ~1e-9
  });
});

describe('calculateSquareFootage — output relationships', () => {
  it('totalSqM = totalSqFt/10.7639104, totalSqYd = totalSqFt/9, cost = totalSqFt×price, total = area×qty', () => {
    for (const c of [
      { length: 10, width: 12, unit: 'ft' as const, quantity: 1, pricePerSqFt: 0 },
      { length: 8.5, width: 6.25, unit: 'ft' as const, quantity: 3, pricePerSqFt: 4.2 },
      { length: 5, width: 4, unit: 'm' as const, quantity: 2, pricePerSqFt: 10 },
    ]) {
      const r = calculateSquareFootage(c);
      expect(r.totalSqM).toBeCloseTo(r.totalSqFt / 10.7639104, 9);
      expect(r.totalSqYd).toBeCloseTo(r.totalSqFt / 9, 9);
      expect(r.cost).toBeCloseTo(r.totalSqFt * c.pricePerSqFt, 9);
      expect(r.totalSqFt).toBeCloseTo(r.areaSqFt * Math.max(1, Math.floor(c.quantity)), 9);
    }
  });
});

describe('calculateSquareFootage — current quantity behaviour (frozen; the binding rejects fractional/<1)', () => {
  it('quantity 1 and a whole quantity multiply the area', () => {
    expect(calculateSquareFootage({ length: 10, width: 10, unit: 'ft', quantity: 1 }).totalSqFt).toBe(100);
    expect(calculateSquareFootage({ length: 10, width: 10, unit: 'ft', quantity: 3 }).totalSqFt).toBe(300);
  });

  it('a fractional quantity FLOORS (2.9 → 2); 0 / negative / NaN collapse to 1', () => {
    expect(calculateSquareFootage({ length: 10, width: 10, unit: 'ft', quantity: 2.9 }).totalSqFt).toBe(200); // floor 2
    expect(calculateSquareFootage({ length: 10, width: 10, unit: 'ft', quantity: 0 }).totalSqFt).toBe(100); // → 1
    expect(calculateSquareFootage({ length: 10, width: 10, unit: 'ft', quantity: -3 }).totalSqFt).toBe(100); // → 1
    expect(calculateSquareFootage({ length: 10, width: 10, unit: 'ft', quantity: NaN }).totalSqFt).toBe(100); // → 1
  });

  it('Infinity quantity → Infinity total (max(1, floor(Infinity)) = Infinity)', () => {
    expect(calculateSquareFootage({ length: 10, width: 10, unit: 'ft', quantity: Infinity }).totalSqFt).toBe(Infinity);
  });
});

describe('calculateSquareFootage — current price behaviour (frozen; the binding rejects negative/non-finite)', () => {
  it('price 0 → $0 cost; a positive/decimal price scales the total', () => {
    expect(calculateSquareFootage({ length: 10, width: 10, unit: 'ft', pricePerSqFt: 0 }).cost).toBe(0);
    expect(calculateSquareFootage({ length: 10, width: 10, unit: 'ft', pricePerSqFt: 2.5 }).cost).toBe(250);
  });

  it('a negative price is CLAMPED to 0; NaN price → 0', () => {
    expect(calculateSquareFootage({ length: 10, width: 10, unit: 'ft', pricePerSqFt: -5 }).cost).toBe(0);
    expect(calculateSquareFootage({ length: 10, width: 10, unit: 'ft', pricePerSqFt: NaN }).cost).toBe(0);
  });

  it('Infinity price → Infinity cost (with a positive area)', () => {
    expect(calculateSquareFootage({ length: 10, width: 10, unit: 'ft', pricePerSqFt: Infinity }).cost).toBe(Infinity);
  });
});

describe('calculateSquareFootage — dimension edges (frozen; the binding rejects these)', () => {
  it('zero or negative length/width → $0 area (clamped to 0)', () => {
    expect(calculateSquareFootage({ length: 0, width: 12, unit: 'ft' }).totalSqFt).toBe(0);
    expect(calculateSquareFootage({ length: 10, width: 0, unit: 'ft' }).totalSqFt).toBe(0);
    expect(calculateSquareFootage({ length: -10, width: 12, unit: 'ft' }).areaSqFt).toBe(0);
  });

  it('NaN dimensions collapse via `|| 0` to a zero area', () => {
    expect(calculateSquareFootage({ length: NaN, width: 12, unit: 'ft' }).totalSqFt).toBe(0);
  });

  it('Infinity dimension → Infinity area; with price 0 the cost is the Infinity×0 = NaN edge', () => {
    const r = calculateSquareFootage({ length: Infinity, width: 12, unit: 'ft', pricePerSqFt: 0 });
    expect(r.totalSqFt).toBe(Infinity);
    expect(Number.isNaN(r.cost)).toBe(true); // Infinity × 0
  });
});

describe('calculateSquareFootage — precision vs. displayed rounding', () => {
  it('retains full precision internally (incl. the metre-conversion drift)', () => {
    expect(calculateSquareFootage({ length: 10, width: 12, unit: 'ft' }).totalSqM).toBe(11.148364817306543);
    // The metre round-trip does not perfectly invert — a documented ~1e-9 artifact.
    expect(calculateSquareFootage({ length: 3.048, width: 3.6576, unit: 'm' }).totalSqFt).toBe(119.99999999904001);
  });

  it('area and currency rounding are presentation-only', () => {
    const r = calculateSquareFootage({ length: 10.1, width: 10.1, unit: 'ft', pricePerSqFt: 3.33 });
    expect(r.cost).toBe(339.69329999999997); // full precision
    expect(formatCurrency(r.cost)).toBe('$339.69'); // display rounds to the cent
    expect(formatNumber(r.totalSqM, 2)).toBe('9.48'); // display rounds the area (102.01 sq ft → 9.48 m²)
  });

  it('every finite, positive dimension with a whole quantity ≥1 and a finite price ≥0 yields finite, ≥0 outputs', () => {
    for (const c of [
      { length: 1, width: 1, unit: 'ft' as const, quantity: 1, pricePerSqFt: 0 },
      { length: 10, width: 12, unit: 'yd' as const, quantity: 5, pricePerSqFt: 8 },
      { length: 0.5, width: 0.25, unit: 'm' as const, quantity: 1, pricePerSqFt: 2.5 },
    ]) {
      const r = calculateSquareFootage(c);
      for (const v of [r.areaSqFt, r.totalSqFt, r.totalSqM, r.totalSqYd, r.cost]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

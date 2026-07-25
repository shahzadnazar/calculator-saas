import { describe, it, expect } from 'vitest';
import { calculateConcrete } from './concrete';

/**
 * Concrete formula characterization (R10C1 Commit 1) — consolidated out of the shared
 * batch-d.test.ts into a dedicated file, ahead of the task-first migration.
 *
 * Freezes the EXACT current behaviour of `calculateConcrete` (one rectangular-prism volume for
 * slabs / walls / footings):
 *   l,w,d   = max(0, ·||0);  waste = 1 + max(0, wastePct||0)/100
 *   cf      = l·w·d·waste  (× 35.3146667 if unit==='m')          [the UNROUNDED local]
 *   cubicFeet   = round(cf, 3)
 *   cubicYards  = round(cf/27, 3)          ← derived from the UNROUNDED cf, not the rounded return
 *   cubicMeters = round(cf/35.3146667, 3)  ← UNROUNDED cf
 *   bags{40,60,80} = ceil(cf / {0.30,0.45,0.60})  ← UNROUNDED cf
 *
 * NOTE (verified discrepancy vs the R10C1 §3 wording): cubicYards / cubicMeters / bag counts are
 * derived from the UNROUNDED cubic feet, NOT from the 3-dp-rounded return value. At a boundary this
 * diverges — e.g. 1×1×0.60025 ft rounds cubicFeet to 0.6 yet bags80 = ceil(0.60025/0.6) = 2, not 1.
 * This suite freezes the ACTUAL behaviour; the formula is unchanged.
 *
 * Three layers are kept separate and only the FIRST is frozen here:
 *   • frozen formula behaviour — this file (no production change in Commit 1),
 *   • binding validation — concrete-form.ts (Commit 2) rejects zero / negative / non-finite
 *     dimensions and a negative / non-finite waste even though the pure formula clamps them,
 *   • display formatting — presentation-only.
 *
 * Characterization only: no production code changes, no output changes.
 */
const FT3_PER_M3 = 35.3146667;

describe('calculateConcrete — ordinary feet cases', () => {
  it('representative slab: exact volumes and all three bag counts', () => {
    const r = calculateConcrete({ length: 10, width: 10, depth: 0.5, unit: 'ft' });
    expect(r.cubicFeet).toBe(50);
    expect(r.cubicYards).toBe(1.852);
    expect(r.cubicMeters).toBe(1.416);
    expect(r.bags40lb).toBe(167); // ceil(50 / 0.30)
    expect(r.bags60lb).toBe(112); // ceil(50 / 0.45)
    expect(r.bags80lb).toBe(84); // ceil(50 / 0.60)
  });

  it('a waste allowance scales the volume before every output', () => {
    const r = calculateConcrete({ length: 10, width: 10, depth: 0.5, unit: 'ft', wastePct: 10 });
    expect(r.cubicFeet).toBe(55);
    expect(r.cubicYards).toBe(2.037);
    expect(r.bags80lb).toBe(92); // ceil(55 / 0.60)
    const base = calculateConcrete({ length: 10, width: 10, depth: 0.5, unit: 'ft' });
    expect(r.cubicFeet).toBeCloseTo(base.cubicFeet * 1.1, 3);
  });

  it('decimal dimensions and a decimal waste', () => {
    const r = calculateConcrete({ length: 12.5, width: 8.25, depth: 0.33, unit: 'ft', wastePct: 7.5 });
    expect(r.cubicFeet).toBe(36.584);
    expect(r.cubicYards).toBe(1.355);
    expect(r.bags80lb).toBe(61);
  });

  it('zero waste equals a blank (no allowance)', () => {
    const zero = calculateConcrete({ length: 10, width: 10, depth: 0.5, unit: 'ft', wastePct: 0 });
    const blank = calculateConcrete({ length: 10, width: 10, depth: 0.5, unit: 'ft' });
    expect(zero).toEqual(blank);
    expect(zero.cubicFeet).toBe(50);
  });
});

describe('calculateConcrete — metre cases', () => {
  it('metres convert to cubic feet via 35.3146667, then to the other units', () => {
    const r = calculateConcrete({ length: 3, width: 3, depth: 0.15, unit: 'm' });
    expect(r.cubicFeet).toBe(47.675);
    expect(r.cubicYards).toBe(1.766);
    expect(r.cubicMeters).toBe(1.35);
    expect(r.bags80lb).toBe(80);
  });

  it('a physically equivalent slab in feet and metres agrees within tolerance', () => {
    const ft = calculateConcrete({ length: 10, width: 10, depth: 0.5, unit: 'ft' });
    const m = calculateConcrete({ length: 3.048, width: 3.048, depth: 0.1524, unit: 'm' }); // 10ft, 10ft, 0.5ft
    expect(m.cubicFeet).toBeCloseTo(ft.cubicFeet, 3);
    expect(m.bags80lb).toBe(ft.bags80lb);
  });
});

describe('calculateConcrete — output derivation order (frozen: derived from UNROUNDED cubic feet)', () => {
  it('cubicYards/cubicMeters/bags come from the unrounded cf; only the returned cubicFeet is rounded', () => {
    // cf = 0.60025 → returned cubicFeet rounds to 0.6, but bags80 = ceil(0.60025/0.6) = 2 (NOT ceil(0.6/0.6)=1).
    const r = calculateConcrete({ length: 1, width: 1, depth: 0.60025, unit: 'ft' });
    expect(r.cubicFeet).toBe(0.6); // rounded return
    expect(r.bags80lb).toBe(2); // derived from the unrounded 0.60025 — the divergence
  });

  it('matches the exact derivation for representative inputs', () => {
    for (const c of [
      { length: 10, width: 10, depth: 0.5, unit: 'ft' as const, wastePct: 0 },
      { length: 8, width: 6, depth: 0.4, unit: 'ft' as const, wastePct: 12 },
      { length: 3, width: 3, depth: 0.15, unit: 'm' as const, wastePct: 5 },
    ]) {
      const cf = Math.max(0, c.length) * Math.max(0, c.width) * Math.max(0, c.depth) * (1 + c.wastePct / 100) * (c.unit === 'm' ? FT3_PER_M3 : 1);
      const r = calculateConcrete(c);
      expect(r.cubicFeet).toBe(Math.round(cf * 1000) / 1000);
      expect(r.cubicYards).toBe(Math.round((cf / 27) * 1000) / 1000);
      expect(r.cubicMeters).toBe(Math.round((cf / FT3_PER_M3) * 1000) / 1000);
      expect(r.bags40lb).toBe(Math.ceil(cf / 0.3));
      expect(r.bags60lb).toBe(Math.ceil(cf / 0.45));
      expect(r.bags80lb).toBe(Math.ceil(cf / 0.6));
    }
  });
});

describe('calculateConcrete — bag yields (0.30 / 0.45 / 0.60 ft³) with ceil', () => {
  it('an exact multiple of the 80 lb yield is a whole number of bags', () => {
    expect(calculateConcrete({ length: 1, width: 1, depth: 0.6, unit: 'ft' }).bags80lb).toBe(1); // cf 0.6 → ceil(1.0)=1
    expect(calculateConcrete({ length: 1, width: 1, depth: 1.2, unit: 'ft' }).bags80lb).toBe(2); // cf 1.2 → ceil(2.0)=2
  });

  it('just above a whole-bag boundary rounds UP', () => {
    expect(calculateConcrete({ length: 1, width: 1, depth: 0.61, unit: 'ft' }).bags80lb).toBe(2); // ceil(1.016…)=2
  });

  it('the three yields give the expected counts for a 9 ft³ slab', () => {
    const r = calculateConcrete({ length: 3, width: 3, depth: 1, unit: 'ft' }); // cf 9
    expect(r.bags40lb).toBe(30); // ceil(9/0.30)
    expect(r.bags60lb).toBe(20); // ceil(9/0.45)
    expect(r.bags80lb).toBe(15); // ceil(9/0.60)
  });

  it('zero volume → zero bags', () => {
    expect(calculateConcrete({ length: 0, width: 10, depth: 0.5, unit: 'ft' })).toMatchObject({ bags40lb: 0, bags60lb: 0, bags80lb: 0 });
  });
});

describe('calculateConcrete — waste behaviour (frozen; the binding rejects negatives)', () => {
  it('a negative or NaN waste is clamped to 0 (no allowance)', () => {
    expect(calculateConcrete({ length: 10, width: 10, depth: 0.5, unit: 'ft', wastePct: -5 }).cubicFeet).toBe(50);
    expect(calculateConcrete({ length: 10, width: 10, depth: 0.5, unit: 'ft', wastePct: NaN }).cubicFeet).toBe(50);
  });

  it('Infinity waste → Infinity volume', () => {
    expect(calculateConcrete({ length: 10, width: 10, depth: 0.5, unit: 'ft', wastePct: Infinity }).cubicFeet).toBe(Infinity);
  });
});

describe('calculateConcrete — dimension edges (frozen; the binding rejects these)', () => {
  it('zero or negative dimensions → all-zero result (clamped)', () => {
    expect(calculateConcrete({ length: 0, width: 10, depth: 0.5, unit: 'ft' })).toMatchObject({ cubicFeet: 0, cubicYards: 0, bags80lb: 0 });
    expect(calculateConcrete({ length: -10, width: 10, depth: 0.5, unit: 'ft' }).cubicFeet).toBe(0);
  });

  it('NaN dimensions collapse via `|| 0` to a zero volume', () => {
    expect(calculateConcrete({ length: NaN, width: 10, depth: 0.5, unit: 'ft' }).cubicFeet).toBe(0);
  });

  it('an Infinity dimension → Infinity volume and Infinity bag counts', () => {
    const r = calculateConcrete({ length: 10, width: 10, depth: Infinity, unit: 'ft' });
    expect(r.cubicFeet).toBe(Infinity);
    expect(r.bags80lb).toBe(Infinity);
  });
});

describe('calculateConcrete — every finite, positive input yields finite, ≥0 whole bag counts', () => {
  it('bag counts are whole numbers ≥ 0 across the validated domain', () => {
    for (const c of [
      { length: 10, width: 10, depth: 0.5, unit: 'ft' as const },
      { length: 4, width: 3, depth: 0.33, unit: 'ft' as const, wastePct: 10 },
      { length: 2.5, width: 2, depth: 0.1, unit: 'm' as const },
    ]) {
      const r = calculateConcrete(c);
      for (const v of [r.cubicFeet, r.cubicYards, r.cubicMeters]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      for (const b of [r.bags40lb, r.bags60lb, r.bags80lb]) {
        expect(Number.isInteger(b)).toBe(true);
        expect(b).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

import { describe, it, expect } from 'vitest';
import { calculateVolume, VOLUME_SHAPES, type VolumeShapeKey } from './volume';

/**
 * Volume formula characterization (R12C1 Commit 1). Freezes the EXACT behaviour of the UNCHANGED
 * `calculateVolume` and the `VOLUME_SHAPES` config ahead of the task-first migration (geometry
 * shape-picker family, follow-on). Test-only: no change to shape identifiers, per-shape formulas, the
 * `Math.max(0, d[k]||0)` normalization, or the number return shape. Consolidated out of the shared
 * `gaps.test.ts` (whose last remaining block this was) into a dedicated file; coverage is EXPANDED to
 * ALL seven shapes — pyramid and capsule were previously unasserted.
 *
 * Two contracts worth stating explicitly (frozen from source, not assumed):
 *   • PYRAMID is a RECTANGULAR-base pyramid: (1/3) × length × width × height (no π). Its fields are
 *     "Base length" (length), "Base width" (width) and "Height" (height).
 *   • CAPSULE = a cylinder of length `height` capped by two hemispheres (a full sphere) of the same
 *     radius: π·r² × ((4/3)·r + height). The `height` field is the CYLINDRICAL-section length (labelled
 *     "Cylinder height"), NOT the total end-to-end length.
 *
 * Frozen normalization — `v(k) = Math.max(0, d[k] || 0)`: 0 / negative / NaN / undefined / missing key
 * → 0; −Infinity → 0 (Math.max floor); +Infinity PROPAGATES (truthy, survives Math.max) → an infinite
 * dimension yields an infinite volume; an unknown shape → NaN (the default branch, unreachable from the
 * typed <select>). The future binding will REJECT the domains the pure formula silently clamps.
 */

/* ------------------------------------------------------------------ */
/* Shape config                                                        */
/* ------------------------------------------------------------------ */

describe('VOLUME_SHAPES config', () => {
  it('is exactly the seven supported shapes, in order', () => {
    expect(VOLUME_SHAPES.map((s) => s.key)).toEqual([
      'cube', 'box', 'sphere', 'cylinder', 'cone', 'pyramid', 'capsule',
    ]);
  });
  it('freezes each shape label and its required input keys + labels', () => {
    const matrix = VOLUME_SHAPES.map((s) => [s.key, s.label, s.inputs.map((i) => `${i.key}:${i.label}`).join(',')]);
    expect(matrix).toEqual([
      ['cube', 'Cube', 'side:Side'],
      ['box', 'Box (rectangular)', 'length:Length,width:Width,height:Height'],
      ['sphere', 'Sphere', 'radius:Radius'],
      ['cylinder', 'Cylinder', 'radius:Radius,height:Height'],
      ['cone', 'Cone', 'radius:Radius,height:Height'],
      ['pyramid', 'Pyramid (rectangular base)', 'length:Base length,width:Base width,height:Height'],
      ['capsule', 'Capsule', 'radius:Radius,height:Cylinder height'],
    ]);
  });
  it('reuses dimension keys across shapes with distinct labels', () => {
    const label = (shape: VolumeShapeKey, key: string) =>
      VOLUME_SHAPES.find((s) => s.key === shape)!.inputs.find((i) => i.key === key)!.label;
    expect(label('box', 'length')).toBe('Length');
    expect(label('pyramid', 'length')).toBe('Base length'); // same key 'length', different meaning
    expect(label('box', 'height')).toBe('Height');
    expect(label('capsule', 'height')).toBe('Cylinder height'); // same key 'height', different meaning
  });
});

/* ------------------------------------------------------------------ */
/* Per-shape formulas — ordinary + decimal + irrelevant keys ignored    */
/* ------------------------------------------------------------------ */

describe('calculateVolume — per shape', () => {
  it('cube = side³', () => {
    expect(calculateVolume('cube', { side: 4 })).toBe(64);
    expect(calculateVolume('cube', { side: 2.5 })).toBe(15.625);
    expect(calculateVolume('cube', { side: 3, radius: 99 })).toBe(27); // irrelevant key ignored
  });
  it('box = length × width × height', () => {
    expect(calculateVolume('box', { length: 8, width: 5, height: 2 })).toBe(80);
    expect(calculateVolume('box', { length: 2, width: 3, height: 4 })).toBe(24);
  });
  it('sphere = 4/3 × π × radius³', () => {
    expect(calculateVolume('sphere', { radius: 3 })).toBeCloseTo(113.097336, 5);
    expect(calculateVolume('sphere', { radius: 2 })).toBeCloseTo(33.510322, 5);
    expect(calculateVolume('sphere', { radius: 3, height: 99 })).toBeCloseTo(113.097336, 5); // height ignored
  });
  it('cylinder = π × radius² × height', () => {
    expect(calculateVolume('cylinder', { radius: 2, height: 5 })).toBeCloseTo(62.831853, 5);
    expect(calculateVolume('cylinder', { radius: 3, height: 6 })).toBeCloseTo(169.646003, 5);
  });
  it('cone = 1/3 × π × radius² × height', () => {
    expect(calculateVolume('cone', { radius: 3, height: 6 })).toBeCloseTo(56.548668, 5);
    expect(calculateVolume('cone', { radius: 2, height: 5 })).toBeCloseTo(20.943951, 5);
  });
  it('pyramid (rectangular base) = 1/3 × length × width × height (no π)', () => {
    expect(calculateVolume('pyramid', { length: 6, width: 4, height: 9 })).toBe(72);
    expect(calculateVolume('pyramid', { length: 2, width: 3, height: 4 })).toBe(8);
  });
  it('capsule = π × radius² × (4/3 × radius + cylinder height)', () => {
    // radius 3, cylinder height 6 → π·9·(4 + 6) = 90π
    expect(calculateVolume('capsule', { radius: 3, height: 6 })).toBeCloseTo(90 * Math.PI, 9);
    // radius 2, cylinder height 5 → π·4·(8/3 + 5) = 92π/3
    expect(calculateVolume('capsule', { radius: 2, height: 5 })).toBeCloseTo((92 * Math.PI) / 3, 9);
    // a capsule with a zero cylinder height is exactly a sphere: π·r²·(4/3·r) = 4/3·π·r³
    expect(calculateVolume('capsule', { radius: 3, height: 0 })).toBeCloseTo(calculateVolume('sphere', { radius: 3 }), 9);
  });
  it('returns a plain finite number > 0 for valid input (every shape)', () => {
    for (const s of VOLUME_SHAPES) {
      const dims = Object.fromEntries(s.inputs.map((i) => [i.key, 3]));
      const vol = calculateVolume(s.key, dims);
      expect(typeof vol).toBe('number');
      expect(Number.isFinite(vol)).toBe(true);
      expect(vol).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Normalization — the Math.max(0, d[k] || 0) clamp                     */
/* ------------------------------------------------------------------ */

describe('calculateVolume — normalization (frozen; the binding will reject these)', () => {
  it('a zero dimension yields 0', () => {
    expect(calculateVolume('box', { length: 0, width: 3, height: 4 })).toBe(0);
    expect(calculateVolume('sphere', { radius: 0 })).toBe(0);
  });
  it('a negative dimension is clamped to 0', () => {
    expect(calculateVolume('box', { length: -8, width: 5, height: 2 })).toBe(0);
    expect(calculateVolume('cube', { side: -4 })).toBe(0);
  });
  it('a missing / undefined dimension is treated as 0', () => {
    expect(calculateVolume('box', { length: 8, width: 5 })).toBe(0); // height missing
    expect(calculateVolume('pyramid', { length: 6, width: 4 })).toBe(0); // height missing
    expect(calculateVolume('cube', { side: undefined as unknown as number })).toBe(0);
  });
  it('NaN is treated as 0', () => {
    expect(calculateVolume('sphere', { radius: NaN })).toBe(0);
    expect(calculateVolume('cylinder', { radius: 2, height: NaN })).toBe(0);
  });
  it('−Infinity is clamped to 0', () => {
    expect(calculateVolume('box', { length: -Infinity, width: 5, height: 2 })).toBe(0);
  });
  it('+Infinity PROPAGATES (not clamped) — an infinite dimension yields an infinite volume', () => {
    expect(calculateVolume('box', { length: Infinity, width: 5, height: 2 })).toBe(Infinity);
    expect(calculateVolume('sphere', { radius: Infinity })).toBe(Infinity);
  });
  it('an all-empty object yields 0 for every shape', () => {
    for (const s of VOLUME_SHAPES) expect(calculateVolume(s.key, {})).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Default / unknown-shape branch                                      */
/* ------------------------------------------------------------------ */

describe('calculateVolume — unknown shape', () => {
  it('an unknown shape key returns NaN (the default branch, unreachable from the typed select)', () => {
    expect(Number.isNaN(calculateVolume('tetrahedron' as VolumeShapeKey, { side: 3 }))).toBe(true);
    expect(Number.isNaN(calculateVolume('' as VolumeShapeKey, {}))).toBe(true);
  });
});

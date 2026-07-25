import { describe, it, expect } from 'vitest';
import { calculateArea, AREA_SHAPES, type AreaShapeKey } from './area';

/**
 * Area formula characterization (R12B1 Commit 1). Freezes the EXACT behaviour of the UNCHANGED
 * `calculateArea` and the `AREA_SHAPES` config ahead of the task-first migration (geometry shape-picker
 * pilot). Test-only: no change to the shape identifiers, the per-shape formulas, the `Math.max(0, d[k]||0)`
 * normalization, or the return shape (a plain number). Consolidated out of the shared `gaps.test.ts`
 * (which keeps its `volume` block); coverage is EXPANDED, never reduced (parallelogram + ellipse were
 * previously unasserted).
 *
 * Frozen normalization — `v(k) = Math.max(0, d[k] || 0)`:
 *   • 0 / negative / NaN / undefined / missing key → 0;
 *   • −Infinity → 0 (Math.max floor);
 *   • +Infinity → +Infinity (truthy, survives Math.max) → the area propagates to Infinity, NOT clamped;
 *   • an unknown shape key → NaN (the default branch; unreachable from the typed <select>, frozen directly).
 * The future binding will REJECT the domains the pure formula silently clamps (0 / negative / non-finite);
 * this suite freezes the formula as-is, not the future field validation.
 */

/* ------------------------------------------------------------------ */
/* Shape config                                                        */
/* ------------------------------------------------------------------ */

describe('AREA_SHAPES config', () => {
  it('is exactly the seven supported shapes, in order', () => {
    expect(AREA_SHAPES.map((s) => s.key)).toEqual([
      'rectangle', 'square', 'triangle', 'circle', 'trapezoid', 'parallelogram', 'ellipse',
    ]);
  });
  it('freezes each shape label and its required input keys + labels', () => {
    const matrix = AREA_SHAPES.map((s) => [s.key, s.label, s.inputs.map((i) => `${i.key}:${i.label}`).join(',')]);
    expect(matrix).toEqual([
      ['rectangle', 'Rectangle', 'length:Length,width:Width'],
      ['square', 'Square', 'side:Side'],
      ['triangle', 'Triangle', 'base:Base,height:Height'],
      ['circle', 'Circle', 'radius:Radius'],
      ['trapezoid', 'Trapezoid', 'a:Base a,b:Base b,height:Height'],
      ['parallelogram', 'Parallelogram', 'base:Base,height:Height'],
      ['ellipse', 'Ellipse', 'a:Semi-axis a,b:Semi-axis b'],
    ]);
  });
  it('reuses dimension keys across shapes with distinct labels (base/height/a/b)', () => {
    const label = (shape: AreaShapeKey, key: string) =>
      AREA_SHAPES.find((s) => s.key === shape)!.inputs.find((i) => i.key === key)!.label;
    expect(label('trapezoid', 'a')).toBe('Base a');
    expect(label('ellipse', 'a')).toBe('Semi-axis a'); // same key 'a', different meaning
    expect(label('triangle', 'base')).toBe('Base');
    expect(label('parallelogram', 'base')).toBe('Base');
  });
});

/* ------------------------------------------------------------------ */
/* Per-shape formulas — ordinary + decimal + irrelevant keys ignored    */
/* ------------------------------------------------------------------ */

describe('calculateArea — per shape', () => {
  it('rectangle = length × width', () => {
    expect(calculateArea('rectangle', { length: 8, width: 5 })).toBe(40);
    expect(calculateArea('rectangle', { length: 2.5, width: 4 })).toBe(10);
    // ignores any dimension it does not use
    expect(calculateArea('rectangle', { length: 8, width: 5, height: 99, radius: 99 })).toBe(40);
  });
  it('square = side²', () => {
    expect(calculateArea('square', { side: 4 })).toBe(16);
    expect(calculateArea('square', { side: 2.5 })).toBe(6.25);
  });
  it('triangle = ½ × base × height', () => {
    expect(calculateArea('triangle', { base: 6, height: 4 })).toBe(12);
    expect(calculateArea('triangle', { base: 3.5, height: 4 })).toBe(7);
  });
  it('circle = π × radius²', () => {
    expect(calculateArea('circle', { radius: 5 })).toBeCloseTo(78.539816, 5);
    expect(calculateArea('circle', { radius: 2 })).toBeCloseTo(12.566371, 5);
  });
  it('trapezoid = ½ × (a + b) × height', () => {
    expect(calculateArea('trapezoid', { a: 6, b: 4, height: 3 })).toBe(15);
    expect(calculateArea('trapezoid', { a: 3, b: 5, height: 4 })).toBe(16);
  });
  it('parallelogram = base × height', () => {
    expect(calculateArea('parallelogram', { base: 6, height: 4 })).toBe(24);
    expect(calculateArea('parallelogram', { base: 2.5, height: 4 })).toBe(10);
  });
  it('ellipse = π × a × b (semi-axes)', () => {
    expect(calculateArea('ellipse', { a: 5, b: 3 })).toBeCloseTo(47.123890, 5);
    expect(calculateArea('ellipse', { a: 3, b: 2 })).toBeCloseTo(18.849556, 5);
    // 'height' is not part of the ellipse formula and is ignored
    expect(calculateArea('ellipse', { a: 5, b: 3, height: 99 })).toBeCloseTo(47.123890, 5);
  });
  it('returns a plain finite number for valid input', () => {
    for (const s of AREA_SHAPES) {
      const dims = Object.fromEntries(s.inputs.map((i) => [i.key, 3]));
      const area = calculateArea(s.key, dims);
      expect(typeof area).toBe('number');
      expect(Number.isFinite(area)).toBe(true);
      expect(area).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Normalization — the Math.max(0, d[k] || 0) clamp                     */
/* ------------------------------------------------------------------ */

describe('calculateArea — normalization (frozen; the binding will reject these)', () => {
  it('a zero dimension yields 0', () => {
    expect(calculateArea('rectangle', { length: 0, width: 4 })).toBe(0);
    expect(calculateArea('circle', { radius: 0 })).toBe(0);
  });
  it('a negative dimension is clamped to 0', () => {
    expect(calculateArea('rectangle', { length: -5, width: 4 })).toBe(0);
    expect(calculateArea('triangle', { base: -6, height: 4 })).toBe(0);
  });
  it('a missing / undefined dimension is treated as 0', () => {
    expect(calculateArea('rectangle', { length: 5 })).toBe(0); // width missing
    expect(calculateArea('rectangle', { length: 5, width: undefined as unknown as number })).toBe(0);
    expect(calculateArea('trapezoid', { a: 6, b: 4 })).toBe(0); // height missing
  });
  it('NaN is treated as 0', () => {
    expect(calculateArea('rectangle', { length: NaN, width: 4 })).toBe(0);
    expect(calculateArea('square', { side: NaN })).toBe(0);
  });
  it('−Infinity is clamped to 0', () => {
    expect(calculateArea('rectangle', { length: -Infinity, width: 4 })).toBe(0);
  });
  it('+Infinity PROPAGATES (not clamped) — a positive infinity dimension yields an infinite area', () => {
    expect(calculateArea('rectangle', { length: Infinity, width: 4 })).toBe(Infinity);
    expect(calculateArea('circle', { radius: Infinity })).toBe(Infinity);
  });
  it('an all-empty object yields 0 for every shape', () => {
    for (const s of AREA_SHAPES) expect(calculateArea(s.key, {})).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Default / unknown-shape branch                                      */
/* ------------------------------------------------------------------ */

describe('calculateArea — unknown shape', () => {
  it('an unknown shape key returns NaN (the default branch, unreachable from the typed select)', () => {
    expect(Number.isNaN(calculateArea('hexagon' as AreaShapeKey, { side: 3 }))).toBe(true);
    expect(Number.isNaN(calculateArea('' as AreaShapeKey, {}))).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { solveTriangleSSS, type TriangleResult } from './triangle';

/**
 * Dedicated characterization of the pure SSS triangle solver (R10D1), consolidated out of the
 * shared batch-d.test.ts. Freezes the EXACT behaviour of solveTriangleSSS — law-of-cosines angles,
 * Heron's-formula area, perimeter, side/angle classification, the strict triangle inequality and the
 * invalid sentinel — so the migration binding (Commit 2) is a visible validation/presentation layer
 * over an unchanged formula. Test-only: no change to solveTriangleSSS, its equations, tolerances,
 * rounding or output shape.
 *
 * Precision notes frozen here: angles round to 2 dp, area to 3 dp, PERIMETER is returned UNROUNDED
 * (a + b + c); angleC is 180 − angleA − angleB (from the UNROUNDED law-of-cosines angles); side
 * equality uses a 1e-9 tolerance and the right-angle test a 1e-6 tolerance on the max UNROUNDED angle.
 */

const SIDE_TYPES = ['Equilateral', 'Isosceles', 'Scalene'];
const ANGLE_TYPES = ['Acute', 'Right', 'Obtuse'];

/* ------------------------------------------------------------------ */
/* Ordinary valid triangles                                            */
/* ------------------------------------------------------------------ */

describe('triangle — ordinary valid triangles', () => {
  it('3-4-5 is a right scalene triangle (area 6, perimeter 12, 90° opposite the longest side)', () => {
    expect(solveTriangleSSS(3, 4, 5)).toEqual({
      valid: true, angleA: 36.87, angleB: 53.13, angleC: 90,
      area: 6, perimeter: 12, sideType: 'Scalene', angleType: 'Right',
    });
  });

  it('an equilateral triangle has three 60° angles (Acute, Equilateral)', () => {
    expect(solveTriangleSSS(5, 5, 5)).toEqual({
      valid: true, angleA: 60, angleB: 60, angleC: 60,
      area: 10.825, perimeter: 15, sideType: 'Equilateral', angleType: 'Acute',
    });
  });

  it('an isosceles acute triangle (5-5-6)', () => {
    expect(solveTriangleSSS(5, 5, 6)).toEqual({
      valid: true, angleA: 53.13, angleB: 53.13, angleC: 73.74,
      area: 12, perimeter: 16, sideType: 'Isosceles', angleType: 'Acute',
    });
  });

  it('an isosceles obtuse triangle (5-5-9)', () => {
    expect(solveTriangleSSS(5, 5, 9)).toEqual({
      valid: true, angleA: 25.84, angleB: 25.84, angleC: 128.32,
      area: 9.808, perimeter: 19, sideType: 'Isosceles', angleType: 'Obtuse',
    });
  });

  it('a scalene acute triangle (6-7-8)', () => {
    expect(solveTriangleSSS(6, 7, 8)).toEqual({
      valid: true, angleA: 46.57, angleB: 57.91, angleC: 75.52,
      area: 20.333, perimeter: 21, sideType: 'Scalene', angleType: 'Acute',
    });
  });

  it('decimal side lengths (3.5-4.5-5.5): angles to 2 dp, area to 3 dp, perimeter unrounded', () => {
    expect(solveTriangleSSS(3.5, 4.5, 5.5)).toEqual({
      valid: true, angleA: 39.4, angleB: 54.7, angleC: 85.9,
      area: 7.855, perimeter: 13.5, sideType: 'Scalene', angleType: 'Acute',
    });
  });

  it('the returned angles sum to ~180° for representative triangles', () => {
    for (const [a, b, c] of [[3, 4, 5], [5, 5, 5], [5, 5, 6], [6, 7, 8], [3.5, 4.5, 5.5]] as const) {
      const r = solveTriangleSSS(a, b, c);
      expect(r.angleA + r.angleB + r.angleC).toBeCloseTo(180, 1);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Side ordering                                                       */
/* ------------------------------------------------------------------ */

describe('triangle — side ordering', () => {
  it('reordering the same sides preserves area/perimeter/classification; angles follow their sides', () => {
    const abc = solveTriangleSSS(3, 4, 5); // angleA opposite 3, angleC opposite 5 (=90)
    const cba = solveTriangleSSS(5, 4, 3); // angleA opposite 5 (=90)
    const bca = solveTriangleSSS(4, 5, 3); // angleB opposite 5 (=90)
    for (const r of [abc, cba, bca]) {
      expect(r.area).toBe(6);
      expect(r.perimeter).toBe(12);
      expect(r.sideType).toBe('Scalene');
      expect(r.angleType).toBe('Right');
      expect([r.angleA, r.angleB, r.angleC].slice().sort((x, y) => x - y)).toEqual([36.87, 53.13, 90]);
    }
    expect(abc.angleC).toBe(90); // 90° is opposite side c
    expect(cba.angleA).toBe(90); // now opposite side a
    expect(bca.angleB).toBe(90); // now opposite side b
  });
});

/* ------------------------------------------------------------------ */
/* Triangle inequality (strict; degenerate equality is invalid)         */
/* ------------------------------------------------------------------ */

describe('triangle — strict triangle inequality', () => {
  const invalid = (a: number, b: number, c: number) => expect(solveTriangleSSS(a, b, c).valid).toBe(false);

  it('rejects every degenerate equality (sum of two sides EQUALS the third)', () => {
    invalid(1, 1, 2); // a + b = c
    invalid(1, 2, 1); // a + c = b
    invalid(2, 1, 1); // b + c = a
  });

  it('rejects every strict violation (sum of two sides LESS than the third)', () => {
    invalid(1, 1, 3); // a + b < c
    invalid(1, 3, 1); // a + c < b
    invalid(3, 1, 1); // b + c < a
  });

  it('accepts a triangle just inside the boundary and rejects one just outside', () => {
    expect(solveTriangleSSS(1, 1, 1.999)).toEqual({
      valid: true, angleA: 1.81, angleB: 1.81, angleC: 176.38,
      area: 0.032, perimeter: 3.999, sideType: 'Isosceles', angleType: 'Obtuse',
    });
    expect(solveTriangleSSS(1, 1, 2.0001).valid).toBe(false);
  });

  it('accepts the spec valid examples 3-4-5 and 5-5-8', () => {
    expect(solveTriangleSSS(3, 4, 5).valid).toBe(true);
    expect(solveTriangleSSS(5, 5, 8)).toEqual({
      valid: true, angleA: 36.87, angleB: 36.87, angleC: 106.26,
      area: 12, perimeter: 18, sideType: 'Isosceles', angleType: 'Obtuse',
    });
  });
});

/* ------------------------------------------------------------------ */
/* Invalid dimensions + the invalid-result shape                        */
/* ------------------------------------------------------------------ */

describe('triangle — invalid dimensions and the invalid sentinel', () => {
  it('a non-positive side is invalid (zero or negative, in any position)', () => {
    for (const [a, b, c] of [[0, 4, 5], [3, 0, 5], [3, 4, 0], [-3, 4, 5], [3, -4, 5], [3, 4, -5]] as const) {
      expect(solveTriangleSSS(a, b, c).valid).toBe(false);
    }
  });

  it('the invalid sentinel has NaN geometry and default (Scalene / Acute) classifications', () => {
    const r = solveTriangleSSS(1, 1, 3);
    expect(r.valid).toBe(false);
    for (const v of [r.angleA, r.angleB, r.angleC, r.area, r.perimeter]) expect(Number.isNaN(v)).toBe(true);
    expect(r.sideType).toBe('Scalene');
    expect(r.angleType).toBe('Acute');
  });

  it('an INFINITE side is rejected by the inequality (9 ≤ Infinity), so it hits the invalid sentinel', () => {
    for (const [a, b, c] of [[Infinity, 4, 5], [3, 4, Infinity], [Infinity, Infinity, Infinity]] as const) {
      expect(solveTriangleSSS(a, b, c).valid).toBe(false);
    }
  });

  it('DANGER: a NaN side slips both guards and returns valid:true with all-NaN geometry', () => {
    // NaN comparisons are always false, so neither `<= 0` nor the inequality fires; acos(NaN) → NaN
    // cascades. This is the exact reason the migration binding rejects non-finite sides at the field
    // layer (so the formula is never called) AND guards the finished result before rendering.
    for (const [a, b, c] of [[NaN, 4, 5], [3, NaN, 5], [3, 4, NaN]] as const) {
      const r = solveTriangleSSS(a, b, c);
      expect(r.valid).toBe(true); // <- misleading flag, frozen as the ACTUAL behaviour
      for (const v of [r.angleA, r.angleB, r.angleC, r.area, r.perimeter]) expect(Number.isNaN(v)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Heron / angle boundaries / rounding                                  */
/* ------------------------------------------------------------------ */

describe('triangle — Heron, angle boundaries and rounding', () => {
  it('area comes from the semiperimeter radicand s(s−a)(s−b)(s−c), rounded to 3 dp', () => {
    const [a, b, c] = [6, 7, 8];
    const s = (a + b + c) / 2; // 10.5
    const radicand = s * (s - a) * (s - b) * (s - c); // 413.4375
    expect(Math.sqrt(radicand)).toBeCloseTo(20.33316, 4);
    expect(solveTriangleSSS(a, b, c).area).toBe(20.333); // rounded to 3 dp
  });

  it('the right-angle tolerance classifies an EXACT Pythagorean triple as Right', () => {
    expect(solveTriangleSSS(3, 4, 5).angleType).toBe('Right');
    expect(solveTriangleSSS(6, 8, 10).angleType).toBe('Right');
    expect(solveTriangleSSS(5, 12, 13).angleType).toBe('Right');
  });

  it('acute / right / obtuse boundary around the largest angle', () => {
    expect(solveTriangleSSS(6, 7, 8).angleType).toBe('Acute'); // largest angle 75.52°
    expect(solveTriangleSSS(3, 4, 5).angleType).toBe('Right'); // largest angle 90°
    expect(solveTriangleSSS(5, 5, 9).angleType).toBe('Obtuse'); // largest angle 128.32°
  });

  it('classifications only ever take the documented enum values', () => {
    for (const [a, b, c] of [[3, 4, 5], [5, 5, 5], [5, 5, 6], [5, 5, 9], [6, 7, 8]] as const) {
      const r = solveTriangleSSS(a, b, c);
      expect(SIDE_TYPES).toContain(r.sideType);
      expect(ANGLE_TYPES).toContain(r.angleType);
    }
  });

  it('perimeter is the exact unrounded sum of the three sides', () => {
    expect(solveTriangleSSS(3.5, 4.5, 5.5).perimeter).toBe(13.5);
    expect(solveTriangleSSS(1, 1, 1.999).perimeter).toBe(3.999);
    expect(solveTriangleSSS(3, 4, 5).perimeter).toBe(12);
  });

  it('exposes the documented result contract (type surface)', () => {
    const r: TriangleResult = solveTriangleSSS(3, 4, 5);
    expect(Object.keys(r).sort()).toEqual(
      ['angleA', 'angleB', 'angleC', 'angleType', 'area', 'perimeter', 'sideType', 'valid'].sort(),
    );
  });
});

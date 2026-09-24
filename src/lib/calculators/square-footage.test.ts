import { describe, it, expect } from 'vitest';
import {
  toFeet,
  fromSqFt,
  toRadians,
  SQFT_PER,
  LENGTH_UNITS,
  AREA_UNITS,
  ANGLE_UNITS,
  areaRectangle,
  areaRectangleBorder,
  areaCircle,
  areaRing,
  areaTriangleEdges,
  areaTriangleBaseHeight,
  areaTrapezoid,
  areaSector,
  areaParallelogram,
  formatExactArea,
  type LengthUnit,
} from './square-footage';

/**
 * The nine areas and the conversions under them.
 *
 * The reference figures at the bottom are the load-bearing part of this file: each one is a value
 * the reference prints for a stated input, so they pin down the two things a reimplementation is
 * most likely to get wrong — that the border of a "Rectangle Border" lies INSIDE the given
 * dimensions, and that the square-foot-per-square-metre factor is exact rather than the truncated
 * 10.7639104 this calculator used to ship.
 */

describe('length conversion', () => {
  it('derives every unit from the exactly-defined foot', () => {
    expect(toFeet(1, 'ft')).toBe(1);
    expect(toFeet(12, 'in')).toBeCloseTo(1, 12);
    expect(toFeet(1, 'yd')).toBeCloseTo(3, 12);
    expect(toFeet(1, 'm')).toBeCloseTo(1 / 0.3048, 12);
    expect(toFeet(100, 'cm')).toBeCloseTo(1 / 0.3048, 12);
  });

  it('is exact for a metre, not the rounded 3.28084', () => {
    expect(toFeet(1, 'm')).toBe(1 / 0.3048);
  });

  it('round-trips every unit through feet', () => {
    for (const u of LENGTH_UNITS) {
      const ft = toFeet(7.5, u.value);
      expect(Number.isFinite(ft)).toBe(true);
      expect(ft).toBeGreaterThan(0);
    }
  });

  it('refuses a non-finite length', () => {
    expect(toFeet(Number.NaN, 'ft')).toBeNaN();
    expect(toFeet(Number.POSITIVE_INFINITY, 'm')).toBeNaN();
  });
});

describe('area conversion', () => {
  it('uses the exact square-foot factors', () => {
    expect(SQFT_PER.sqft).toBe(1);
    expect(SQFT_PER.sqyd).toBeCloseTo(9, 12);
    expect(SQFT_PER.acre).toBe(43_560);
    // The truncated 10.7639104 this calculator used to ship is wrong in the 8th digit.
    expect(SQFT_PER.sqm).toBe(1 / (0.3048 * 0.3048));
    expect(SQFT_PER.sqm).not.toBe(10.7639104);
    expect(SQFT_PER.sqm).toBeCloseTo(10.763910416709722, 12);
  });

  it('converts a square-foot figure into each unit', () => {
    expect(fromSqFt(9, 'sqyd')).toBeCloseTo(1, 12);
    expect(fromSqFt(43_560, 'acre')).toBe(1);
    expect(fromSqFt(1, 'sqin')).toBeCloseTo(144, 10);
    expect(fromSqFt(1, 'sqft')).toBe(1);
  });

  it('refuses a non-finite area', () => {
    expect(fromSqFt(Number.NaN, 'sqm')).toBeNaN();
  });

  it('offers square feet first, since that is the answer on show', () => {
    expect(AREA_UNITS[0].value).toBe('sqft');
    expect(AREA_UNITS.map((u) => u.value)).toEqual(['sqft', 'sqin', 'sqyd', 'sqm', 'acre']);
  });
});

describe('angle conversion', () => {
  it('converts degrees and passes radians through', () => {
    expect(toRadians(180, 'deg')).toBeCloseTo(Math.PI, 12);
    expect(toRadians(90, 'deg')).toBeCloseTo(Math.PI / 2, 12);
    expect(toRadians(1.5, 'rad')).toBe(1.5);
    expect(ANGLE_UNITS.map((u) => u.value)).toEqual(['deg', 'rad']);
  });

  it('refuses a non-finite angle', () => {
    expect(toRadians(Number.NaN, 'deg')).toBeNaN();
  });
});

describe('the nine areas', () => {
  it('rectangle', () => {
    expect(areaRectangle(30, 20)).toBe(600);
  });

  it('rectangle border lies INSIDE the given dimensions', () => {
    // 30 × 20 with a 2-wide border: 600 − 26 × 16 = 184, NOT 816 − 600 = 216.
    expect(areaRectangleBorder(30, 20, 2)).toBe(184);
    expect(areaRectangleBorder(10, 10, 1)).toBe(100 - 64);
  });

  it('rectangle border cannot go negative when the border swallows the shape', () => {
    expect(areaRectangleBorder(10, 10, 6)).toBe(100);
    expect(areaRectangleBorder(10, 10, 5)).toBe(100);
  });

  it('circle', () => {
    expect(areaCircle(30)).toBeCloseTo(Math.PI * 225, 10);
    expect(areaCircle(2)).toBeCloseTo(Math.PI, 12);
  });

  it('ring', () => {
    expect(areaRing(30, 2)).toBeCloseTo(Math.PI * (225 - 169), 10);
  });

  it('ring is the whole disc once the border reaches the centre', () => {
    expect(areaRing(30, 15)).toBeCloseTo(Math.PI * 225, 10);
    expect(areaRing(30, 40)).toBeCloseTo(Math.PI * 225, 10);
  });

  it('triangle from three edges, by Heron', () => {
    expect(areaTriangleEdges(3, 4, 5)).toBeCloseTo(6, 12);
    expect(areaTriangleEdges(30, 45, 50)).toBeCloseTo(666.5852814907, 8);
  });

  it('triangle from three edges refuses an impossible triangle', () => {
    expect(areaTriangleEdges(1, 2, 10)).toBeNaN();
    expect(areaTriangleEdges(1, 2, 3)).toBeNaN(); // degenerate: zero area
  });

  it('triangle from base and height', () => {
    expect(areaTriangleBaseHeight(30, 20)).toBe(300);
  });

  it('trapezoid', () => {
    expect(areaTrapezoid(30, 45, 20)).toBe(750);
    // A trapezoid with equal bases is a parallelogram.
    expect(areaTrapezoid(10, 10, 4)).toBe(areaParallelogram(10, 4));
  });

  it('sector', () => {
    expect(areaSector(30, Math.PI / 2)).toBeCloseTo(Math.PI * 900 * 0.25, 10);
    // A full turn is the whole circle.
    expect(areaSector(5, 2 * Math.PI)).toBeCloseTo(Math.PI * 25, 12);
  });

  it('parallelogram', () => {
    expect(areaParallelogram(30, 20)).toBe(600);
    // Two congruent triangles.
    expect(areaParallelogram(8, 3)).toBe(2 * areaTriangleBaseHeight(8, 3));
  });
});

describe('formatExactArea', () => {
  it('prints fourteen significant figures with trailing zeros stripped', () => {
    expect(formatExactArea(600)).toBe('600');
    expect(formatExactArea(1980.5595166746)).toBe('1980.5595166746');
    expect(formatExactArea(0.5)).toBe('0.5');
  });

  it('shares one rounding rule with the area and volume calculators', () => {
    // Ten decimal places and fourteen significant figures agree on every reference figure this
    // calculator was built against, because each has a four-digit whole part. They part company
    // on a small number, where significant figures keep the precision that matters.
    expect(formatExactArea(900 / 43_560)).toBe('0.020661157024793');
    expect(formatExactArea(900 / 43_560)).not.toBe('0.020661157');
    // And on a long one, where they keep a different number of digits.
    expect(formatExactArea(Math.sqrt(444335.9375))).toBe('666.58528149067');
  });

  it('never prints a non-finite figure', () => {
    expect(formatExactArea(Number.NaN)).toBe('—');
    expect(formatExactArea(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('the reference figures', () => {
  /** Every dimension in metres, as the reference had them, converted then measured. */
  const m = (n: number) => toFeet(n, 'm' as LengthUnit);

  const cases: [string, number, number][] = [
    ['rectangle border 30 × 20, border 2', areaRectangleBorder(m(30), m(20), m(2)), 1980.5595166746],
    ['circle, diameter 30', areaCircle(m(30)), 7608.5599250326],
    ['ring, outer 30, border 2', areaRing(m(30), m(2)), 1893.6860257859],
    ['triangle, edges 30 / 45 / 50', areaTriangleEdges(m(30), m(45), m(50)), 7175.0642550628],
    ['triangle, base 30 height 20', areaTriangleBaseHeight(m(30), m(20)), 3229.1731250129],
    ['trapezoid, bases 30 and 45, height 20', areaTrapezoid(m(30), m(45), m(20)), 8072.9328125323],
    ['sector, radius 30, 90°', areaSector(m(30), toRadians(90, 'deg')), 7608.5599250326],
    ['parallelogram, base 30 height 20', areaParallelogram(m(30), m(20)), 6458.3462500258],
  ];

  it.each(cases)('%s', (_name, actual, expected) => {
    expect(formatExactArea(actual)).toBe(String(expected));
  });
});

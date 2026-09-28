import { describe, it, expect } from 'vitest';
import {
  formatArea,
  squaredLabel,
  areaRectangle,
  areaTriangle,
  semiPerimeter,
  areaTrapezoid,
  areaCircle,
  areaSector,
  areaEllipse,
  areaParallelogram,
  areaSteps,
  type AreaShapeKey,
} from './area';

/**
 * The seven areas, the working they show, and the number format.
 *
 * The reference-figure block at the end is the load-bearing part: each is a value the reference
 * prints for the stated inputs. The triangle in particular pins down the rounding rule — fourteen
 * significant figures, not ten decimal places, which would print 666.5852814907 instead.
 */

describe('formatArea', () => {
  it('prints fourteen significant figures with trailing zeros stripped', () => {
    expect(formatArea(600)).toBe('600');
    expect(formatArea(Math.PI * 900)).toBe('2827.4333882308');
    expect(formatArea(Math.sqrt(444335.9375))).toBe('666.58528149067');
  });

  it('strips a trailing zero at the fourteenth figure', () => {
    // 225π is 706.858347057703…, whose 14th significant figure is a zero.
    expect(formatArea(225 * Math.PI)).toBe('706.8583470577');
  });

  it('is not ten decimal places', () => {
    expect(formatArea(Math.sqrt(444335.9375))).not.toBe('666.5852814907');
  });

  it('handles zero and never prints a non-finite figure', () => {
    expect(formatArea(0)).toBe('0');
    expect(formatArea(Number.NaN)).toBe('—');
    expect(formatArea(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatArea(Number.NEGATIVE_INFINITY)).toBe('—');
  });

  it('keeps small numbers readable', () => {
    expect(formatArea(0.5)).toBe('0.5');
    expect(formatArea(0.0001)).toBe('0.0001');
  });
});

describe('squaredLabel', () => {
  it('names the unit the answer is in', () => {
    expect(squaredLabel('m')).toBe('meters²');
    expect(squaredLabel('ft')).toBe('feet²');
    expect(squaredLabel('in')).toBe('inches²');
    expect(squaredLabel('yd')).toBe('yards²');
    expect(squaredLabel('cm')).toBe('centimeters²');
  });
});

describe('the seven areas', () => {
  it('rectangle', () => {
    expect(areaRectangle(30, 20)).toBe(600);
  });

  it('triangle, by Heron from three edges', () => {
    expect(areaTriangle(3, 4, 5)).toBeCloseTo(6, 12);
    expect(areaTriangle(30, 45, 50)).toBeCloseTo(666.5852814906732, 9);
  });

  it('triangle refuses an impossible or degenerate triangle', () => {
    expect(areaTriangle(1, 2, 10)).toBeNaN();
    expect(areaTriangle(1, 2, 3)).toBeNaN();
  });

  it('semi-perimeter', () => {
    expect(semiPerimeter(30, 45, 50)).toBe(62.5);
    expect(semiPerimeter(3, 4, 5)).toBe(6);
  });

  it('trapezoid', () => {
    expect(areaTrapezoid(30, 45, 20)).toBe(750);
    // Equal bases make it a parallelogram.
    expect(areaTrapezoid(10, 10, 4)).toBe(areaParallelogram(10, 4));
  });

  it('circle, from the RADIUS', () => {
    expect(areaCircle(30)).toBeCloseTo(Math.PI * 900, 10);
    expect(areaCircle(1)).toBeCloseTo(Math.PI, 12);
  });

  it('sector, with the angle in degrees', () => {
    expect(areaSector(30, 90)).toBeCloseTo(225 * Math.PI, 10);
    // A full turn is the whole circle.
    expect(areaSector(30, 360)).toBeCloseTo(areaCircle(30), 10);
    expect(areaSector(30, 180)).toBeCloseTo(areaCircle(30) / 2, 10);
  });

  it('ellipse', () => {
    expect(areaEllipse(30, 20)).toBeCloseTo(600 * Math.PI, 10);
    // Equal semi-axes make it a circle.
    expect(areaEllipse(7, 7)).toBeCloseTo(areaCircle(7), 12);
  });

  it('parallelogram', () => {
    expect(areaParallelogram(30, 20)).toBe(600);
  });
});

describe('the working', () => {
  const steps = (key: AreaShapeKey, dims: number[], area: number) =>
    areaSteps(key, dims, 'm', area).map((s) => `${s.label ? `${s.label} ` : ''}= ${s.expression}${s.unit ? ` ${s.unit}` : ''}`);

  it('shows the rectangle formula, the substitution and the answer', () => {
    expect(steps('rectangle', [30, 20], 600)).toEqual([
      'Area = l × w',
      '= 30 × 20',
      '= 600 meters²',
    ]);
  });

  it('shows the triangle semi-perimeter as its own step, as the reference does', () => {
    expect(steps('triangle', [30, 45, 50], 666.5852814906732)).toEqual([
      's = (a + b + c) / 2',
      '= (30 + 45 + 50) / 2',
      '= 62.5 meters',
      'Area = √(s(s − a)(s − b)(s − c))',
      '= √(62.5 × (62.5 − 30) × (62.5 − 45) × (62.5 − 50))',
      '= 666.58528149067 meters²',
    ]);
  });

  it('shows the trapezoid formula', () => {
    expect(steps('trapezoid', [30, 45, 20], 750)).toEqual([
      'Area = (b₁ + b₂) / 2 × h',
      '= (30 + 45) / 2 × 20',
      '= 750 meters²',
    ]);
  });

  it('shows the multiple of pi on its own line for the circle', () => {
    expect(steps('circle', [30], Math.PI * 900)).toEqual([
      'Area = π r²',
      '= π × 30²',
      '= 900π',
      '= 2827.4333882308 meters²',
    ]);
  });

  it('shows the multiple of pi for the sector', () => {
    expect(steps('sector', [30, 90], 225 * Math.PI)).toEqual([
      'Area = A / 360 × π × r²',
      '= 90 / 360 × π × 30²',
      '= 225π',
      '= 706.8583470577 meters²',
    ]);
  });

  it('shows the multiple of pi for the ellipse', () => {
    expect(steps('ellipse', [30, 20], 600 * Math.PI)).toEqual([
      'Area = π a b',
      '= π × 30 × 20',
      '= 600π',
      '= 1884.9555921539 meters²',
    ]);
  });

  it('shows the parallelogram formula', () => {
    expect(steps('parallelogram', [30, 20], 600)).toEqual([
      'Area = b × h',
      '= 30 × 20',
      '= 600 meters²',
    ]);
  });

  it('omits a bare 1 as the multiple of pi, which would read as "1π"', () => {
    expect(steps('circle', [1], Math.PI)).toEqual([
      'Area = π r²',
      '= π × 1²',
      '= 3.1415926535898 meters²',
    ]);
  });

  it('marks exactly one final step, and it carries the squared unit', () => {
    for (const [key, dims] of [
      ['rectangle', [3, 4]],
      ['triangle', [3, 4, 5]],
      ['trapezoid', [3, 4, 5]],
      ['circle', [3]],
      ['sector', [3, 90]],
      ['ellipse', [3, 4]],
      ['parallelogram', [3, 4]],
    ] as [AreaShapeKey, number[]][]) {
      const all = areaSteps(key, dims, 'ft', 12);
      const finals = all.filter((s) => s.final);
      expect(finals).toHaveLength(1);
      expect(finals[0].unit).toBe('feet²');
      expect(all[all.length - 1].final).toBe(true);
    }
  });

  it('names the unit the visitor actually chose', () => {
    const inFeet = areaSteps('rectangle', [30, 20], 'ft', 600);
    expect(inFeet[inFeet.length - 1].unit).toBe('feet²');
  });

  it('never emits NaN, Infinity or undefined into a step', () => {
    const broken = areaSteps('triangle', [Number.NaN, 4, 5], 'm', Number.NaN);
    for (const s of broken) {
      expect(s.expression).not.toMatch(/NaN|Infinity|undefined/);
      expect(s.label ?? '').not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

describe('the reference figures', () => {
  const cases: [string, number, string][] = [
    ['triangle 30/45/50', areaTriangle(30, 45, 50), '666.58528149067'],
    ['trapezoid 30/45 h20', areaTrapezoid(30, 45, 20), '750'],
    ['circle r30', areaCircle(30), '2827.4333882308'],
    ['sector r30 90°', areaSector(30, 90), '706.8583470577'],
    ['ellipse 30/20', areaEllipse(30, 20), '1884.9555921539'],
    ['parallelogram 30×20', areaParallelogram(30, 20), '600'],
    ['rectangle 30×20', areaRectangle(30, 20), '600'],
  ];

  it.each(cases)('%s', (_name, actual, expected) => {
    expect(formatArea(actual)).toBe(expected);
  });
});

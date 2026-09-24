import { describe, it, expect } from 'vitest';
import {
  roundHalfUp,
  formatQuantity,
  formatWeight,
  volumeSlab,
  volumeFooting,
  volumeTube,
  volumeCurb,
  volumeStairs,
  concreteAmount,
  toFeet,
  DENSITY_KG_PER_M3,
  DENSITY_LB_PER_FT3,
  REFERENCE_PI,
} from './concrete';

/**
 * The five pours and the numbers that follow from them.
 *
 * The reference-figure block is the load-bearing part: each row is a full result the reference
 * prints for the stated inputs — volume in three units, weight in two, and both bag counts.
 */

const m = (v: number) => toFeet(v, 'm');
const cm = (v: number) => toFeet(v, 'cm');

describe('rounding', () => {
  it('rounds half UP, despite what binary does to 92.655', () => {
    // 92.655 is held as 92.65499999999999, so a naive round gives 92.65.
    expect(roundHalfUp(92.655, 2)).toBe(92.66);
    expect(roundHalfUp(0.0435, 3)).toBe(0.044);
    expect(roundHalfUp(2.5, 0)).toBe(3);
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
  });

  it('leaves a number that is not on a half alone', () => {
    expect(roundHalfUp(1.234, 2)).toBe(1.23);
    expect(roundHalfUp(1.236, 2)).toBe(1.24);
    expect(roundHalfUp(100, 2)).toBe(100);
  });

  it('refuses a non-finite value', () => {
    expect(roundHalfUp(Number.NaN, 2)).toBeNaN();
  });
});

describe('formatting', () => {
  it('gives two decimals above one', () => {
    expect(formatQuantity(22.0716667)).toBe('22.07');
    expect(formatQuantity(1040.1)).toBe('1,040.1');
    expect(formatQuantity(3.0371)).toBe('3.04');
  });

  it('keeps two significant figures below one, rather than collapsing to nothing', () => {
    expect(formatQuantity(0.085995)).toBe('0.086');
    expect(formatQuantity(0.0569)).toBe('0.057');
    expect(formatQuantity(0.0435)).toBe('0.044');
    expect(formatQuantity(0.8175)).toBe('0.82');
    expect(formatQuantity(0.11)).toBe('0.11');
  });

  it('separates thousands in a weight and always shows two decimals', () => {
    expect(formatWeight(138333.55)).toBe('138,333.55');
    expect(formatWeight(1331.25)).toBe('1,331.25');
    expect(formatWeight(92.655)).toBe('92.66');
  });

  it('never prints a non-finite figure', () => {
    expect(formatQuantity(Number.NaN)).toBe('—');
    expect(formatQuantity(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatWeight(Number.NaN)).toBe('—');
    expect(formatQuantity(0)).toBe('0');
  });
});

describe('the five volumes', () => {
  it('slab is length by width by thickness', () => {
    expect(volumeSlab(10, 4, 0.5)).toBe(20);
  });

  it('footing is a cylinder from its diameter', () => {
    expect(volumeFooting(2, 10)).toBeCloseTo(REFERENCE_PI * 10, 12);
    // Within a part in ten million of the real thing.
    expect(volumeFooting(2, 10)).toBeCloseTo(Math.PI * 10, 4);
  });

  it('tube is the outer cylinder less its bore', () => {
    expect(volumeTube(4, 2, 3)).toBeCloseTo((REFERENCE_PI / 4) * (16 - 4) * 3, 12);
    // No bore at all is a plain circular slab.
    expect(volumeTube(4, 0, 3)).toBeCloseTo(volumeFooting(4, 3), 9);
  });

  it('curb is the flag plus the curb standing on it, along the run', () => {
    // A flag 1 ft by 1 ft by 1 ft, with no curb standing on it, is a cubic foot per foot of run.
    expect(volumeCurb(0.5, 0.5, 0, 1, 10)).toBeCloseTo(10, 9);
    expect(volumeCurb(1, 2, 3, 0.5, 10)).toBeCloseTo((3 * 0.5 + 3 * 1) * 10, 9);
  });

  it('stairs is the platform plus a triangular stack of treads', () => {
    // One riser has no tread stacked beneath it, so only the platform counts.
    expect(volumeStairs(1, 0.5, 3, 0.5, 1)).toBeCloseTo(3 * (0.5 * 1 * 0.5), 9);
    // Two risers add one run of tread.
    expect(volumeStairs(1, 0.5, 3, 0.5, 2)).toBeCloseTo(3 * (0.5 * 2 * 0.5 + 1 * 0.5 * 1), 9);
  });

  it('stairs grows faster than linearly with the number of risers', () => {
    const five = volumeStairs(1, 0.5, 3, 0.5, 5);
    const ten = volumeStairs(1, 0.5, 3, 0.5, 10);
    expect(ten / five).toBeGreaterThan(2);
  });
});

describe('what follows from a volume', () => {
  it('converts one cubic yard correctly', () => {
    const a = concreteAmount(27);
    expect(a.cubicYards).toBe(1);
    expect(a.cubicMeters).toBeCloseTo(0.764554857984, 12);
    expect(a.pounds).toBe(27 * DENSITY_LB_PER_FT3);
    expect(a.kilograms).toBeCloseTo(0.764554857984 * DENSITY_KG_PER_M3, 9);
  });

  it('counts both bag sizes from the weight', () => {
    const a = concreteAmount(10);
    expect(a.bags.map((b) => b.size)).toEqual([60, 80]);
    expect(a.bags[0].bags).toBeCloseTo(1330 / 60, 9);
    expect(a.bags[1].bags).toBeCloseTo(1330 / 80, 9);
    // A bigger bag means fewer of them.
    expect(a.bags[1].bags).toBeLessThan(a.bags[0].bags);
  });

  it('scales everything linearly with the pour', () => {
    const one = concreteAmount(5);
    const two = concreteAmount(10);
    expect(two.cubicMeters / one.cubicMeters).toBeCloseTo(2, 12);
    expect(two.kilograms / one.kilograms).toBeCloseTo(2, 12);
    expect(two.bags[0].bags / one.bags[0].bags).toBeCloseTo(2, 12);
  });
});

describe('the reference figures', () => {
  const report = (cubicFeet: number) => {
    const a = concreteAmount(cubicFeet);
    return {
      ft3: formatQuantity(a.cubicFeet),
      yd3: formatQuantity(a.cubicYards),
      m3: formatQuantity(a.cubicMeters),
      lbs: formatWeight(a.pounds),
      kg: formatWeight(a.kilograms),
      b60: formatQuantity(a.bags[0].bags),
      b80: formatQuantity(a.bags[1].bags),
    };
  };

  it('slab: 5 m by 2.5 m by 5 cm', () => {
    expect(report(volumeSlab(m(5), m(2.5), cm(5)))).toEqual({
      ft3: '22.07', yd3: '0.82', m3: '0.63',
      lbs: '2,935.53', kg: '1,331.25', b60: '48.93', b80: '36.69',
    });
  });

  it('circular slab or tube: outer 5 m, inner 4 m, 6 cm thick', () => {
    expect(report(volumeTube(m(5), m(4), cm(6)))).toEqual({
      ft3: '14.98', yd3: '0.55', m3: '0.42',
      lbs: '1,992', kg: '903.36', b60: '33.2', b80: '24.9',
    });
  });

  it('curb and gutter: 4 cm deep, 10 cm gutter, 4 cm curb, 5 cm flag, 10 m long', () => {
    expect(report(volumeCurb(cm(4), cm(10), cm(4), cm(5), m(10)))).toEqual({
      ft3: '3.04', yd3: '0.11', m3: '0.086',
      lbs: '403.93', kg: '183.18', b60: '6.73', b80: '5.05',
    });
  });

  it('stairs: 12 cm run, 6 cm rise, 50 cm wide, 5 cm platform, 5 risers', () => {
    expect(report(volumeStairs(cm(12), cm(6), cm(50), cm(5), 5))).toEqual({
      ft3: '1.54', yd3: '0.057', m3: '0.044',
      lbs: '204.31', kg: '92.66', b60: '3.41', b80: '2.55',
    });
  });

  it('hole or column: 2.5 m across, 6 m deep', () => {
    expect(report(volumeFooting(m(2.5), m(6)))).toEqual({
      ft3: '1,040.1', yd3: '38.52', m3: '29.45',
      lbs: '138,333.55', kg: '62,733.63', b60: '2,305.56', b80: '1,729.17',
    });
  });

  it('stays within a part in ten million of the real pi', () => {
    const withRealPi = Math.PI * (m(2.5) / 2) ** 2 * m(6);
    const ours = volumeFooting(m(2.5), m(6));
    expect(Math.abs(ours - withRealPi) / withRealPi).toBeLessThan(1e-6);
  });
});

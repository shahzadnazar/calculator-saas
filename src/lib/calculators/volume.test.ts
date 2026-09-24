import { describe, it, expect } from 'vitest';
import {
  formatVolume,
  cubedLabel,
  volumeSphere,
  volumeCone,
  volumeCube,
  volumeCylinder,
  volumeRectangularTank,
  volumeCapsule,
  volumeSphericalCap,
  volumeConicalFrustum,
  volumeEllipsoid,
  volumeSquarePyramid,
  volumeTube,
  capHeightsFromRadii,
  capBallRadiusFromBaseAndHeight,
  capBaseRadiusFromBallAndHeight,
  volumeSolution,
  type VolumeShapeKey,
} from './volume';

/**
 * The eleven volumes and the working they show.
 *
 * The reference-figure block at the end is the load-bearing part: each is a value the reference
 * prints for the stated inputs, matched digit for digit.
 */

describe('the eleven volumes', () => {
  it('sphere', () => {
    expect(volumeSphere(33)).toBeCloseTo((4 / 3) * Math.PI * 35937, 6);
    expect(volumeSphere(1)).toBeCloseTo((4 / 3) * Math.PI, 12);
  });

  it('cone is a third of the cylinder on the same base', () => {
    expect(volumeCone(11, 22)).toBeCloseTo(volumeCylinder(11, 22) / 3, 9);
  });

  it('cube', () => {
    expect(volumeCube(5)).toBe(125);
    expect(volumeCube(2)).toBe(8);
  });

  it('cylinder', () => {
    expect(volumeCylinder(22, 7)).toBeCloseTo(Math.PI * 3388, 8);
  });

  it('rectangular tank', () => {
    expect(volumeRectangularTank(8, 34, 66)).toBe(17952);
    // A tank with equal sides is a cube.
    expect(volumeRectangularTank(5, 5, 5)).toBe(volumeCube(5));
  });

  it('capsule is a sphere plus a cylinder', () => {
    expect(volumeCapsule(5, 8)).toBeCloseTo(volumeSphere(5) + volumeCylinder(5, 8), 9);
    // With no barrel it is exactly a sphere.
    expect(volumeCapsule(5, 0)).toBeCloseTo(volumeSphere(5), 12);
  });

  it('spherical cap of full height is the whole ball', () => {
    expect(volumeSphericalCap(9, 18)).toBeCloseTo(volumeSphere(9), 9);
    // Half height is half the ball.
    expect(volumeSphericalCap(9, 9)).toBeCloseTo(volumeSphere(9) / 2, 9);
  });

  it('conical frustum collapses to a cone and to a cylinder', () => {
    // A zero top radius is a cone.
    expect(volumeConicalFrustum(0, 4, 5)).toBeCloseTo(volumeCone(4, 5), 12);
    // Equal radii make a cylinder.
    expect(volumeConicalFrustum(3, 3, 5)).toBeCloseTo(volumeCylinder(3, 5), 9);
  });

  it('ellipsoid with three equal axes is a sphere', () => {
    expect(volumeEllipsoid(7, 7, 7)).toBeCloseTo(volumeSphere(7), 9);
    expect(volumeEllipsoid(4, 6, 5)).toBeCloseTo((4 / 3) * Math.PI * 120, 9);
  });

  it('square pyramid is a third of the box around it', () => {
    expect(volumeSquarePyramid(3, 5)).toBe(15);
    expect(volumeSquarePyramid(3, 5)).toBeCloseTo(volumeRectangularTank(3, 3, 5) / 3, 12);
  });

  it('tube is the outer cylinder less the bore', () => {
    expect(volumeTube(4, 1, 6)).toBeCloseTo(volumeCylinder(2, 6) - volumeCylinder(0.5, 6), 9);
    // No bore at all is a plain cylinder.
    expect(volumeTube(4, 0, 6)).toBeCloseTo(volumeCylinder(2, 6), 9);
  });
});

describe('the spherical cap solves for its missing value', () => {
  it('finds both cap heights from the two radii', () => {
    const [h1, h2] = capHeightsFromRadii(7, 9);
    expect(h1).toBeCloseTo(9 - Math.sqrt(32), 12);
    expect(h2).toBeCloseTo(9 + Math.sqrt(32), 12);
    // The two caps together make the whole ball.
    expect(h1 + h2).toBeCloseTo(18, 12);
  });

  it('gives one height when the base is the ball equator', () => {
    expect(capHeightsFromRadii(9, 9)).toEqual([9]);
  });

  it('gives no height when the base is wider than the ball', () => {
    expect(capHeightsFromRadii(10, 9)).toEqual([]);
  });

  it('recovers the ball radius from a base radius and a height', () => {
    const R = capBallRadiusFromBaseAndHeight(7, 9 - Math.sqrt(32));
    expect(R).toBeCloseTo(9, 10);
  });

  it('recovers the base radius from a ball radius and a height', () => {
    expect(capBaseRadiusFromBallAndHeight(9, 9 - Math.sqrt(32))).toBeCloseTo(7, 10);
    // A height past the far side of the ball has no cap.
    expect(capBaseRadiusFromBallAndHeight(9, 19)).toBeNaN();
  });

  it('round-trips: solving for R then back for r returns the base radius', () => {
    const h = 4;
    const R = capBallRadiusFromBaseAndHeight(7, h);
    expect(capBaseRadiusFromBallAndHeight(R, h)).toBeCloseTo(7, 9);
  });
});

describe('formatting', () => {
  it('prints fourteen significant figures with trailing zeros stripped', () => {
    expect(formatVolume(125)).toBe('125');
    expect(formatVolume(volumeSphere(33))).toBe('150532.55358941');
  });

  it('never prints a non-finite figure', () => {
    expect(formatVolume(Number.NaN)).toBe('—');
    expect(formatVolume(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('names the cubed unit', () => {
    expect(cubedLabel('m')).toBe('meters³');
    expect(cubedLabel('ft')).toBe('feet³');
  });
});

describe('the working', () => {
  const lines = (key: VolumeShapeKey, dims: (number | null)[]) =>
    volumeSolution(key, dims, 'm').steps.map((s) =>
      s.kind === 'note' || s.kind === 'heading'
        ? s.expression
        : `${s.label ? `${s.label} ` : ''}= ${s.lead ?? ''}${s.expression}${s.unit ? ` ${s.unit}` : ''}`,
    );

  it('sphere shows the multiple of pi, as the reference does', () => {
    expect(lines('sphere', [33])).toEqual([
      'Volume = 4/3 πr³',
      '= 4/3 × π × 33³',
      '= 47916π',
      '= 150532.55358941 meters³',
    ]);
  });

  it('cone OMITS the pi line, because its coefficient does not terminate', () => {
    expect(lines('cone', [11, 22])).toEqual([
      'Volume = 1/3 πr²h',
      '= 1/3 × π × 11² × 22',
      '= 2787.6398812853 meters³',
    ]);
  });

  it('cube prints on a single line', () => {
    expect(lines('cube', [5])).toEqual(['Volume = 5³ = 125 meters³']);
  });

  it('cylinder shows the multiple of pi', () => {
    expect(lines('cylinder', [22, 7])).toEqual([
      'Volume = πr²h',
      '= π × 22² × 7',
      '= 3388π',
      '= 10643.715910362 meters³',
    ]);
  });

  it('rectangular tank', () => {
    expect(lines('rectangular-tank', [8, 34, 66])).toEqual([
      'Volume = lwh',
      '= 8 × 34 × 66',
      '= 17952 meters³',
    ]);
  });

  it('capsule', () => {
    expect(lines('capsule', [5, 8])).toEqual([
      'Volume = 4/3 πr³ + πr²h',
      '= 4/3 × π × 5³ + π × 5² × 8',
      '= 1151.9173063163 meters³',
    ]);
  });

  it('conical frustum', () => {
    expect(lines('conical-frustum', [2, 4, 5])).toEqual([
      'Volume = 1/3 πh(r² + rR + R²)',
      '= 1/3 × π × 5(2² + 2×4 + 4²)',
      '= 146.60765716752 meters³',
    ]);
  });

  it('ellipsoid shows the multiple of pi', () => {
    expect(lines('ellipsoid', [4, 6, 5])).toEqual([
      'Volume = 4/3 πabc',
      '= 4/3 × π × 4 × 6 × 5',
      '= 160π',
      '= 502.65482457437 meters³',
    ]);
  });

  it('square pyramid has no pi at all', () => {
    expect(lines('square-pyramid', [3, 5])).toEqual([
      'Volume = 1/3 a²h',
      '= 1/3 × 3² × 5',
      '= 15 meters³',
    ]);
  });

  it('tube shows a NON-INTEGER multiple of pi', () => {
    // 22.5 is not a whole number but still writes out exactly, so the reference shows it.
    expect(lines('tube', [4, 1, 6])).toEqual([
      'Volume = π (d1² − d2²)/4 × l',
      '= π × (4² − 1²)/4 × 6',
      '= 22.5π',
      '= 70.68583470577 meters³',
    ]);
  });

  it('spherical cap from two radii shows both answers and works each through', () => {
    expect(lines('spherical-cap', [7, 9, null])).toEqual([
      'Two possible results:',
      'Volume = 276.88296304275 meters³',
      'Or',
      'Volume = 2776.7450962465 meters³',
      'Steps:',
      'Height (h) = R ± √(R² − r²)',
      '= 9 ± √(9² − 7²)',
      '= 3.3431457505076 or 14.656854249492 meters',
      'If height (h) = 3.3431457505076',
      'Volume = 1/3 πh²(3R − h)',
      '= 1/3 × π × 3.3431457505076²(3×9 − 3.3431457505076)',
      '= 276.88296304275 meters³',
      'If height (h) = 14.656854249492',
      'Volume = 1/3 πh²(3R − h)',
      '= 1/3 × π × 14.656854249492²(3×9 − 14.656854249492)',
      '= 2776.7450962465 meters³',
    ]);
  });

  it('spherical cap says which two values it used when all three are given', () => {
    const first = volumeSolution('spherical-cap', [7, 9, 5], 'm').steps[0];
    expect(first.kind).toBe('note');
    expect(first.expression).toContain('only needs two values');
  });

  it('spherical cap from a base radius and a height has ONE answer', () => {
    const s = volumeSolution('spherical-cap', [7, null, 4], 'm');
    expect(s.volumes).toHaveLength(1);
    expect(s.volumes[0]).toBeCloseTo(volumeSphericalCap(capBallRadiusFromBaseAndHeight(7, 4), 4), 9);
  });

  it('spherical cap from a ball radius and a height has ONE answer', () => {
    const s = volumeSolution('spherical-cap', [null, 9, 4], 'm');
    expect(s.volumes).toHaveLength(1);
    expect(s.volumes[0]).toBeCloseTo(volumeSphericalCap(9, 4), 12);
  });

  it('marks every headline answer and carries the cubed unit on each', () => {
    for (const [key, dims] of [
      ['sphere', [2]],
      ['cone', [2, 3]],
      ['cube', [2]],
      ['cylinder', [2, 3]],
      ['rectangular-tank', [2, 3, 4]],
      ['capsule', [2, 3]],
      ['spherical-cap', [7, 9, null]],
      ['conical-frustum', [2, 3, 4]],
      ['ellipsoid', [2, 3, 4]],
      ['square-pyramid', [2, 3]],
      ['tube', [4, 1, 6]],
    ] as [VolumeShapeKey, (number | null)[]][]) {
      const s = volumeSolution(key, dims, 'ft');
      const finals = s.steps.filter((x) => x.final);
      expect(finals.length).toBeGreaterThanOrEqual(1);
      for (const step of finals) expect(step.unit).toBe('feet³');
      // A cap given both radii is the only shape allowed more than one.
      if (key !== 'spherical-cap') expect(finals).toHaveLength(1);
    }
  });

  it('never emits NaN, Infinity or undefined into a step', () => {
    const broken = volumeSolution('cone', [Number.NaN, 3], 'm');
    for (const s of broken.steps) {
      expect(s.expression).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

describe('the reference figures', () => {
  const cases: [string, number, string][] = [
    ['sphere r33', volumeSphere(33), '150532.55358941'],
    ['cone r11 h22', volumeCone(11, 22), '2787.6398812853'],
    ['cube a5', volumeCube(5), '125'],
    ['cylinder r22 h7', volumeCylinder(22, 7), '10643.715910362'],
    ['capsule r5 h8', volumeCapsule(5, 8), '1151.9173063163'],
    ['conical frustum r2 R4 h5', volumeConicalFrustum(2, 4, 5), '146.60765716752'],
    ['ellipsoid 4/6/5', volumeEllipsoid(4, 6, 5), '502.65482457437'],
    ['square pyramid a3 h5', volumeSquarePyramid(3, 5), '15'],
    ['tube d1=4 d2=1 l6', volumeTube(4, 1, 6), '70.68583470577'],
    ['spherical cap r7 R9, shallow', volumeSphericalCap(9, 9 - Math.sqrt(32)), '276.88296304275'],
    ['spherical cap r7 R9, deep', volumeSphericalCap(9, 9 + Math.sqrt(32)), '2776.7450962465'],
  ];

  it.each(cases)('%s', (_name, actual, expected) => {
    expect(formatVolume(actual)).toBe(expected);
  });
});

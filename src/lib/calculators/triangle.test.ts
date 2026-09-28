import { describe, it, expect } from 'vitest';
import {
  solveTriangle,
  triangleMetrics,
  triangleKind,
  piFraction,
  formatTriangle,
  toDegrees,
  toRadians,
  type Triangle,
  type TriangleInput,
} from './triangle';

/**
 * The solver, and everything derived from a solved triangle.
 *
 * The load-bearing test here is the ROUND TRIP: build a triangle, hand the solver any three of its
 * six values, and check it returns the triangle it came from. That covers every case at once and
 * catches the errors a hand-picked example would not — an index rotated the wrong way, a law of
 * sines applied to the wrong pair.
 */

const D = toRadians;
const input = (over: Partial<TriangleInput> = {}): TriangleInput => ({
  sides: [null, null, null],
  angles: [null, null, null],
  ...over,
});

/** A triangle from three sides, for building test cases. */
const fromSides = (a: number, b: number, c: number): Triangle =>
  solveTriangle(input({ sides: [a, b, c] })).triangles[0];

const close = (x: number, y: number, tol = 1e-9) => expect(Math.abs(x - y)).toBeLessThan(tol);

describe('the reference case: an equilateral triangle from two sides and the angle between them', () => {
  // The reference's own worked example: side a = 1, side b = 1, angle C = 60°.
  const solved = solveTriangle(input({ sides: [1, 1, null], angles: [null, null, D(60)] }));
  const t = solved.triangles[0];
  const m = triangleMetrics(t);

  it('recognises this as SAS and finds one triangle', () => {
    expect(solved.method).toBe('SAS');
    expect(solved.triangles).toHaveLength(1);
  });

  it('gives all three sides as 1', () => {
    for (const s of t.sides) close(s, 1);
  });

  it('gives all three angles as 60 degrees', () => {
    for (const a of t.angles) close(toDegrees(a), 60, 1e-9);
  });

  it('reproduces every figure the reference prints', () => {
    expect(formatTriangle(m.area)).toBe('0.43301');
    expect(formatTriangle(m.perimeter)).toBe('3');
    expect(formatTriangle(m.semiperimeter)).toBe('1.5');
    for (const h of m.heights) expect(formatTriangle(h)).toBe('0.86603');
    for (const md of m.medians) expect(formatTriangle(md)).toBe('0.86603');
    expect(formatTriangle(m.inradius)).toBe('0.28868');
    expect(formatTriangle(m.circumradius)).toBe('0.57735');
    expect(formatTriangle(t.angles[0])).toBe('1.0472');
    expect(piFraction(t.angles[0])).toBe('π/3');
  });

  it('places the vertices where the reference places them', () => {
    const [A, B, C] = m.vertices;
    expect(A.map(formatTriangle)).toEqual(['0', '0']);
    expect(B.map(formatTriangle)).toEqual(['1', '0']);
    expect(C.map(formatTriangle)).toEqual(['0.5', '0.86603']);
    expect(m.centroid.map(formatTriangle)).toEqual(['0.5', '0.28868']);
    expect(m.incenter.map(formatTriangle)).toEqual(['0.5', '0.28868']);
    expect(m.circumcenter.map(formatTriangle)).toEqual(['0.5', '0.28868']);
  });

  it('names it as the reference names it', () => {
    expect(triangleKind(t)).toBe('Equilateral Triangle');
  });
});

describe('the five cases', () => {
  it('SSS', () => {
    const r = solveTriangle(input({ sides: [3, 4, 5] }));
    expect(r.method).toBe('SSS');
    close(toDegrees(r.triangles[0].angles[2]), 90, 1e-9);
  });

  it('SAS, whichever side is the missing one', () => {
    for (const missing of [0, 1, 2]) {
      const t = fromSides(4, 5, 6);
      const sides: [number | null, number | null, number | null] = [...t.sides];
      sides[missing] = null;
      const angles: [number | null, number | null, number | null] = [null, null, null];
      angles[missing] = t.angles[missing];
      const r = solveTriangle({ sides, angles });
      expect(r.method).toBe('SAS');
      expect(r.triangles).toHaveLength(1);
      for (let i = 0; i < 3; i += 1) close(r.triangles[0].sides[i], t.sides[i], 1e-9);
    }
  });

  it('ASA and AAS from one side and two angles', () => {
    const t = fromSides(4, 5, 6);
    for (let side = 0; side < 3; side += 1) {
      for (const pair of [[0, 1], [1, 2], [0, 2]]) {
        const sides: [number | null, number | null, number | null] = [null, null, null];
        sides[side] = t.sides[side];
        const angles: [number | null, number | null, number | null] = [null, null, null];
        for (const i of pair) angles[i] = t.angles[i];
        const r = solveTriangle({ sides, angles });
        expect(r.triangles).toHaveLength(1);
        for (let i = 0; i < 3; i += 1) close(r.triangles[0].sides[i], t.sides[i], 1e-7);
      }
    }
  });

  it('tells ASA from AAS by whether the side lies between the given angles', () => {
    const t = fromSides(4, 5, 6);
    // Side 0 with angles 1 and 2: the side is NOT one of the given angles' own, so ASA.
    expect(
      solveTriangle({
        sides: [t.sides[0], null, null],
        angles: [null, t.angles[1], t.angles[2]],
      }).method,
    ).toBe('ASA');
    // Side 0 with angles 0 and 1: the side belongs to a given angle, so AAS.
    expect(
      solveTriangle({
        sides: [t.sides[0], null, null],
        angles: [t.angles[0], t.angles[1], null],
      }).method,
    ).toBe('AAS');
  });
});

describe('SSA, the ambiguous case', () => {
  it('finds TWO triangles when the numbers describe two', () => {
    // a = 5 opposite A = 30°, b = 8: the classic ambiguous set.
    const r = solveTriangle(input({ sides: [5, 8, null], angles: [D(30), null, null] }));
    expect(r.method).toBe('SSA');
    expect(r.ambiguous).toBe(true);
    expect(r.triangles).toHaveLength(2);
    // Both really are triangles with the given parts.
    for (const t of r.triangles) {
      close(t.sides[0], 5, 1e-9);
      close(t.sides[1], 8, 1e-9);
      close(toDegrees(t.angles[0]), 30, 1e-7);
      close(t.angles[0] + t.angles[1] + t.angles[2], Math.PI, 1e-9);
    }
    // And they are genuinely different.
    expect(Math.abs(r.triangles[0].sides[2] - r.triangles[1].sides[2])).toBeGreaterThan(0.1);
  });

  it('finds ONE triangle when the side opposite the angle is long enough to reach only once', () => {
    const r = solveTriangle(input({ sides: [9, 8, null], angles: [D(30), null, null] }));
    expect(r.triangles).toHaveLength(1);
    expect(r.ambiguous).toBeFalsy();
  });

  it('finds NO triangle when the side cannot reach', () => {
    const r = solveTriangle(input({ sides: [2, 8, null], angles: [D(30), null, null] }));
    expect(r.triangles).toHaveLength(0);
    expect(r.failure).toBe('no-such-triangle');
  });

  it('finds exactly one right triangle at the boundary', () => {
    // b sin A = 8 × sin 30° = 4, so a = 4 touches the base exactly once.
    const r = solveTriangle(input({ sides: [4, 8, null], angles: [D(30), null, null] }));
    expect(r.triangles).toHaveLength(1);
    close(toDegrees(r.triangles[0].angles[1]), 90, 1e-6);
  });
});

describe('what it refuses', () => {
  it('needs exactly three values', () => {
    expect(solveTriangle(input({ sides: [3, 4, null] })).failure).toBe('need-three');
    expect(
      solveTriangle(input({ sides: [3, 4, 5], angles: [D(60), null, null] })).failure,
    ).toBe('need-three');
  });

  it('needs at least one side, since three angles fix only the shape', () => {
    const r = solveTriangle(input({ angles: [D(60), D(60), D(60)] }));
    expect(r.failure).toBe('need-a-side');
  });

  it('refuses angles that cannot fit in a triangle', () => {
    expect(
      solveTriangle(input({ sides: [5, null, null], angles: [D(120), D(70), null] })).failure,
    ).toBe('angles-too-big');
    expect(
      solveTriangle(input({ sides: [5, null, null], angles: [D(90), D(90), null] })).failure,
    ).toBe('angles-too-big');
  });

  it('refuses three sides that cannot meet', () => {
    expect(solveTriangle(input({ sides: [1, 2, 10] })).failure).toBe('no-such-triangle');
    // A degenerate, zero-area triangle is refused too.
    expect(solveTriangle(input({ sides: [1, 2, 3] })).failure).toBe('no-such-triangle');
  });
});

describe('the round trip: any three values recover the triangle', () => {
  const originals = [
    fromSides(3, 4, 5),
    fromSides(4, 5, 6),
    fromSides(7, 7, 3),
    fromSides(2, 3, 4),
    fromSides(10, 10, 10),
    fromSides(5, 12, 13),
    fromSides(8, 15, 17),
    fromSides(6, 7, 11),
  ];

  it('recovers every triangle from every valid choice of three of its six values', () => {
    let checked = 0;
    for (const t of originals) {
      const values = [...t.sides, ...t.angles];
      // Every way of choosing three of the six.
      for (let mask = 0; mask < 64; mask += 1) {
        const chosen = [0, 1, 2, 3, 4, 5].filter((i) => mask & (1 << i));
        if (chosen.length !== 3) continue;
        if (chosen.every((i) => i >= 3)) continue; // three angles: shape only, no size

        const sides: [number | null, number | null, number | null] = [null, null, null];
        const angles: [number | null, number | null, number | null] = [null, null, null];
        for (const i of chosen) {
          if (i < 3) sides[i] = values[i];
          else angles[i - 3] = values[i];
        }

        const r = solveTriangle({ sides, angles });
        expect(r.failure).toBeUndefined();
        expect(r.triangles.length).toBeGreaterThanOrEqual(1);

        // The original must be among the solutions returned.
        const matches = r.triangles.some((s) =>
          s.sides.every((x, i) => Math.abs(x - t.sides[i]) < 1e-6) &&
          s.angles.every((x, i) => Math.abs(x - t.angles[i]) < 1e-6),
        );
        expect(matches).toBe(true);
        checked += 1;
      }
    }
    // 6 choose 3 is 20, less the one all-angles choice, over eight triangles.
    expect(checked).toBe(8 * 19);
  });

  it('every returned triangle is internally consistent', () => {
    for (const t of originals) {
      const r = solveTriangle({ sides: [t.sides[0], t.sides[1], null], angles: [t.angles[0], null, null] });
      for (const s of r.triangles) {
        close(s.angles[0] + s.angles[1] + s.angles[2], Math.PI, 1e-9);
        // Law of sines holds for every pair.
        const k = s.sides[0] / Math.sin(s.angles[0]);
        close(s.sides[1] / Math.sin(s.angles[1]), k, 1e-7);
        close(s.sides[2] / Math.sin(s.angles[2]), k, 1e-7);
      }
    }
  });
});

describe('metrics', () => {
  it('matches the classic 3-4-5 triangle', () => {
    const m = triangleMetrics(fromSides(3, 4, 5));
    close(m.area, 6);
    close(m.perimeter, 12);
    close(m.semiperimeter, 6);
    close(m.inradius, 1);
    close(m.circumradius, 2.5);
    // The altitude to the hypotenuse of a 3-4-5 is 2.4.
    close(m.heights[2], 2.4, 1e-9);
    // The median to the hypotenuse is half of it.
    close(m.medians[2], 2.5, 1e-9);
  });

  it('places A at the origin and B along the axis', () => {
    const m = triangleMetrics(fromSides(4, 5, 6));
    expect(m.vertices[0]).toEqual([0, 0]);
    close(m.vertices[1][0], 6);
    close(m.vertices[1][1], 0);
    expect(m.vertices[2][1]).toBeGreaterThan(0);
  });

  it('puts the circumcentre equidistant from all three vertices', () => {
    for (const t of [fromSides(3, 4, 5), fromSides(4, 5, 6), fromSides(7, 7, 3)]) {
      const m = triangleMetrics(t);
      const d = (p: [number, number]) => Math.hypot(p[0] - m.circumcenter[0], p[1] - m.circumcenter[1]);
      close(d(m.vertices[0]), m.circumradius, 1e-7);
      close(d(m.vertices[1]), m.circumradius, 1e-7);
      close(d(m.vertices[2]), m.circumradius, 1e-7);
    }
  });

  it('puts the incentre one inradius from every side', () => {
    const t = fromSides(4, 5, 6);
    const m = triangleMetrics(t);
    // Distance from the incentre to side c, which lies on the x-axis, is its y coordinate.
    close(m.incenter[1], m.inradius, 1e-9);
  });

  it('agrees with the area computed from a base and its own height', () => {
    for (const t of [fromSides(3, 4, 5), fromSides(4, 5, 6), fromSides(2, 3, 4)]) {
      const m = triangleMetrics(t);
      for (let i = 0; i < 3; i += 1) close((t.sides[i] * m.heights[i]) / 2, m.area, 1e-9);
    }
  });
});

describe('naming', () => {
  it('names each kind', () => {
    expect(triangleKind(fromSides(1, 1, 1))).toBe('Equilateral Triangle');
    expect(triangleKind(fromSides(3, 4, 5))).toBe('Right Scalene Triangle');
    expect(triangleKind(fromSides(4, 5, 6))).toBe('Acute Scalene Triangle');
    expect(triangleKind(fromSides(2, 3, 4))).toBe('Obtuse Scalene Triangle');
    expect(triangleKind(fromSides(7, 7, 3))).toBe('Acute Isosceles Triangle');
    expect(triangleKind(fromSides(2, 2, 3.8))).toBe('Obtuse Isosceles Triangle');
    expect(triangleKind(fromSides(1, 1, Math.SQRT2))).toBe('Right Isosceles Triangle');
  });
});

describe('angles as fractions of pi', () => {
  it('recognises the fractions a reader knows on sight', () => {
    expect(piFraction(Math.PI / 3)).toBe('π/3');
    expect(piFraction(Math.PI / 2)).toBe('π/2');
    expect(piFraction(Math.PI / 4)).toBe('π/4');
    expect(piFraction((3 * Math.PI) / 4)).toBe('3π/4');
    expect(piFraction((2 * Math.PI) / 3)).toBe('2π/3');
    expect(piFraction(Math.PI / 6)).toBe('π/6');
  });

  it('says nothing when the angle is not a neat fraction', () => {
    expect(piFraction(1)).toBeNull();
    expect(piFraction(toRadians(37))).toBeNull();
    expect(piFraction(0)).toBeNull();
    expect(piFraction(Number.NaN)).toBeNull();
  });
});

describe('formatting', () => {
  it('prints five significant figures, as the reference does', () => {
    expect(formatTriangle(Math.sqrt(3) / 4)).toBe('0.43301');
    expect(formatTriangle(1)).toBe('1');
    expect(formatTriangle(1.5)).toBe('1.5');
  });

  it('never prints a non-finite figure', () => {
    expect(formatTriangle(Number.NaN)).toBe('—');
    expect(formatTriangle(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

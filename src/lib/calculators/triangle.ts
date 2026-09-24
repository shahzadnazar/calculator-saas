/**
 * The triangle solver: any three values including at least one side, and every figure that follows.
 *
 * This is a different kind of tool from the area and volume calculators. Those apply one formula to
 * measurements you already have; this one RECONSTRUCTS a triangle from partial information and then
 * reports twenty derived quantities. Two consequences shape everything below:
 *
 *  - The five classical cases (SSS, SAS, ASA, AAS, SSA) each need a different route, and one of them
 *    — SSA, two sides and an angle NOT between them — is genuinely ambiguous: the same three numbers
 *    can describe two different triangles, or none at all. That is not an error to be papered over;
 *    it is a property of the geometry, so `solveTriangle` returns a LIST.
 *  - Angles and sides are interchangeable in position but not in role. Rather than write five
 *    solvers, the input is rotated so the known values sit in a canonical position, solved once, and
 *    rotated back. Side i is always opposite angle i.
 *
 * Angles are RADIANS throughout. Degrees exist only at the form boundary.
 */
import { formatDigits } from './formula-steps';

/** Sides [a, b, c] and angles [A, B, C], where side i is opposite angle i. */
export interface Triangle {
  sides: [number, number, number];
  angles: [number, number, number];
}

/** A partially specified triangle. `null` means "not given". */
export interface TriangleInput {
  sides: [number | null, number | null, number | null];
  angles: [number | null, number | null, number | null];
}

export type SolveFailure =
  | 'need-three'
  | 'need-a-side'
  | 'angles-too-big'
  | 'no-such-triangle'
  | 'degenerate';

export interface SolveResult {
  /** One triangle, two for an ambiguous SSA, or none when the failure explains why. */
  triangles: Triangle[];
  failure?: SolveFailure;
  /** Which classical case was solved, for the working. */
  method?: 'SSS' | 'SAS' | 'ASA' | 'AAS' | 'SSA';
  /** True when SSA produced two genuinely different triangles. */
  ambiguous?: boolean;
}

/** The reference prints five significant figures. */
export const formatTriangle = (value: number): string => formatDigits(value, 5);

const TAU_HALF = Math.PI;
/** Angles closer together than this are the same angle; sides likewise, relative to their size. */
const EPS = 1e-9;

/* ------------------------------------------------------------------ */
/* Solving                                                             */
/* ------------------------------------------------------------------ */

const rotate = <T>(xs: [T, T, T], by: number): [T, T, T] => [
  xs[(0 + by) % 3],
  xs[(1 + by) % 3],
  xs[(2 + by) % 3],
];

/** Law of cosines: the angle opposite `opp` in a triangle with the other two sides `x` and `y`. */
const angleFromSides = (opp: number, x: number, y: number): number =>
  Math.acos(Math.min(1, Math.max(-1, (x * x + y * y - opp * opp) / (2 * x * y))));

/**
 * Solve a triangle from any three of its six values.
 *
 * Returns every triangle consistent with the input — two when the input is an ambiguous SSA, one
 * normally, none when the numbers describe no triangle at all.
 */
export function solveTriangle(input: TriangleInput): SolveResult {
  const known = [...input.sides, ...input.angles].filter((v) => v !== null).length;
  const sideCount = input.sides.filter((v) => v !== null).length;
  const angleCount = input.angles.filter((v) => v !== null).length;

  if (known !== 3) return { triangles: [], failure: 'need-three' };
  if (sideCount === 0) return { triangles: [], failure: 'need-a-side' };

  // Two angles determine the third, so fill it in before choosing a route.
  const angles: (number | null)[] = [...input.angles];
  if (angleCount === 2) {
    const i = angles.findIndex((x) => x === null);
    const sum = angles.reduce<number>((t, x) => t + (x ?? 0), 0);
    if (sum >= TAU_HALF - EPS) return { triangles: [], failure: 'angles-too-big' };
    angles[i] = TAU_HALF - sum;
  }
  if (angles.every((x) => x !== null)) {
    const sum = (angles[0] as number) + (angles[1] as number) + (angles[2] as number);
    if (Math.abs(sum - TAU_HALF) > 1e-7) return { triangles: [], failure: 'angles-too-big' };
  }

  const sides = input.sides;

  /* ---- SSS ---- */
  if (sideCount === 3) {
    const [a, b, c] = sides as [number, number, number];
    if (a + b <= c + EPS || a + c <= b + EPS || b + c <= a + EPS) {
      return { triangles: [], failure: 'no-such-triangle' };
    }
    return {
      triangles: [
        {
          sides: [a, b, c],
          angles: [angleFromSides(a, b, c), angleFromSides(b, a, c), angleFromSides(c, a, b)],
        },
      ],
      method: 'SSS',
    };
  }

  /* ---- two sides and one angle: SAS if the angle is between them, else SSA ---- */
  if (sideCount === 2) {
    const missingSide = sides.findIndex((x) => x === null);
    const givenAngle = input.angles.findIndex((x) => x !== null);

    // The angle opposite the missing side is the one BETWEEN the two known sides.
    if (givenAngle === missingSide) {
      const r = rotate(
        [0, 1, 2] as [number, number, number],
        missingSide === 2 ? 0 : missingSide === 0 ? 1 : 2,
      );
      // Work in a frame where the unknown side is c and the known angle is C.
      const idx = missingSide;
      const i = (idx + 1) % 3;
      const j = (idx + 2) % 3;
      const x = sides[i] as number;
      const y = sides[j] as number;
      const C = input.angles[idx] as number;
      if (C <= 0 || C >= TAU_HALF) return { triangles: [], failure: 'no-such-triangle' };
      const z = Math.sqrt(x * x + y * y - 2 * x * y * Math.cos(C));
      if (!(z > 0)) return { triangles: [], failure: 'degenerate' };
      const out: [number, number, number] = [0, 0, 0];
      out[idx] = z;
      out[i] = x;
      out[j] = y;
      void r;
      return {
        triangles: [
          {
            sides: out,
            angles: [
              angleFromSides(out[0], out[1], out[2]),
              angleFromSides(out[1], out[0], out[2]),
              angleFromSides(out[2], out[0], out[1]),
            ],
          },
        ],
        method: 'SAS',
      };
    }

    /* ---- SSA: the ambiguous case ---- */
    // `p` is the side opposite the known angle; `q` is the other known side.
    const p = givenAngle;
    const q = sides.findIndex((x, k) => x !== null && k !== p);
    const A = input.angles[p] as number;
    const sideP = sides[p] as number;
    const sideQ = sides[q] as number;
    if (A <= 0 || A >= TAU_HALF) return { triangles: [], failure: 'no-such-triangle' };

    const sinQ = (sideQ * Math.sin(A)) / sideP;
    if (sinQ > 1 + 1e-12) return { triangles: [], failure: 'no-such-triangle' };
    const base = Math.asin(Math.min(1, sinQ));
    // Both a Q and its supplement can be the second angle; only those leaving a positive third
    // angle describe a real triangle.
    const candidates = [base, TAU_HALF - base].filter(
      (angleQ, k, arr) =>
        angleQ > EPS &&
        A + angleQ < TAU_HALF - EPS &&
        (k === 0 || Math.abs(angleQ - arr[0]) > 1e-7),
    );
    if (candidates.length === 0) return { triangles: [], failure: 'no-such-triangle' };

    const triangles = candidates.map((angleQ) => {
      const third = TAU_HALF - A - angleQ;
      const outAngles: [number, number, number] = [0, 0, 0];
      const outSides: [number, number, number] = [0, 0, 0];
      const r = 3 - p - q; // the remaining index
      outAngles[p] = A;
      outAngles[q] = angleQ;
      outAngles[r] = third;
      outSides[p] = sideP;
      outSides[q] = sideQ;
      outSides[r] = (sideP * Math.sin(third)) / Math.sin(A);
      return { sides: outSides, angles: outAngles };
    });

    return { triangles, method: 'SSA', ambiguous: triangles.length > 1 };
  }

  /* ---- one side and two angles: ASA or AAS ---- */
  const sideIndex = sides.findIndex((x) => x !== null);
  const full = angles as [number, number, number];
  if (full.some((x) => x <= EPS)) return { triangles: [], failure: 'angles-too-big' };
  const s = sides[sideIndex] as number;
  const k = s / Math.sin(full[sideIndex]);
  const outSides: [number, number, number] = [
    k * Math.sin(full[0]),
    k * Math.sin(full[1]),
    k * Math.sin(full[2]),
  ];
  // ASA when the known side lies between the two GIVEN angles; AAS when it does not.
  const givenAngleIndices = input.angles
    .map((x, i) => (x !== null ? i : -1))
    .filter((i) => i >= 0);
  const method = givenAngleIndices.includes(sideIndex) ? 'AAS' : 'ASA';
  return { triangles: [{ sides: outSides, angles: full }], method };
}

/* ------------------------------------------------------------------ */
/* Everything that follows from a solved triangle                      */
/* ------------------------------------------------------------------ */

export type Point = [number, number];

export interface TriangleMetrics {
  area: number;
  perimeter: number;
  semiperimeter: number;
  /** The altitude to each side. */
  heights: [number, number, number];
  /** The median to each side. */
  medians: [number, number, number];
  inradius: number;
  circumradius: number;
  /** A at the origin, B along the positive x-axis, C above it. */
  vertices: [Point, Point, Point];
  centroid: Point;
  incenter: Point;
  circumcenter: Point;
}

export function triangleMetrics(t: Triangle): TriangleMetrics {
  const [a, b, c] = t.sides;
  const perimeter = a + b + c;
  const s = perimeter / 2;
  const area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));

  const heights: [number, number, number] = [(2 * area) / a, (2 * area) / b, (2 * area) / c];
  const median = (x: number, y: number, z: number) =>
    0.5 * Math.sqrt(Math.max(0, 2 * y * y + 2 * z * z - x * x));
  const medians: [number, number, number] = [median(a, b, c), median(b, a, c), median(c, a, b)];

  // A at the origin and B at (c, 0): side c joins them, so it lies along the axis.
  const A: Point = [0, 0];
  const B: Point = [c, 0];
  const C: Point = [b * Math.cos(t.angles[0]), b * Math.sin(t.angles[0])];

  const centroid: Point = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
  // The incenter is the side-weighted average of the vertices.
  const incenter: Point = [
    (a * A[0] + b * B[0] + c * C[0]) / perimeter,
    (a * A[1] + b * B[1] + c * C[1]) / perimeter,
  ];
  // With A at the origin and B on the axis the circumcentre falls out directly.
  const cx = c / 2;
  const cy =
    Math.abs(C[1]) < 1e-15
      ? Number.NaN
      : (C[0] * C[0] + C[1] * C[1] - c * C[0]) / (2 * C[1]);

  return {
    area,
    perimeter,
    semiperimeter: s,
    heights,
    medians,
    inradius: area / s,
    circumradius: (a * b * c) / (4 * area),
    vertices: [A, B, C],
    centroid,
    incenter,
    circumcenter: [cx, cy],
  };
}

/* ------------------------------------------------------------------ */
/* Naming                                                              */
/* ------------------------------------------------------------------ */

/**
 * What kind of triangle this is, as the reference names it — "Equilateral Triangle".
 *
 * Side equality is judged relative to the triangle's own size, so a triangle measured in millimetres
 * is not called scalene because of a rounding difference in the twelfth digit.
 */
export function triangleKind(t: Triangle): string {
  const [a, b, c] = t.sides;
  const scale = Math.max(a, b, c);
  const same = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * scale;
  const equal = [same(a, b), same(b, c), same(a, c)].filter(Boolean).length;

  if (equal === 3) return 'Equilateral Triangle';

  const right = t.angles.some((x) => Math.abs(x - Math.PI / 2) <= 1e-9);
  const obtuse = t.angles.some((x) => x > Math.PI / 2 + 1e-9);
  const shape = equal >= 1 ? 'Isosceles' : 'Scalene';
  if (right) return `Right ${shape} Triangle`;
  if (obtuse) return `Obtuse ${shape} Triangle`;
  return `Acute ${shape} Triangle`;
}

/* ------------------------------------------------------------------ */
/* Angles as fractions of pi                                           */
/* ------------------------------------------------------------------ */

/**
 * An angle written as an exact fraction of π, when it is one — the reference prints "= π/3".
 *
 * Only small denominators are worth recognising: π/3 and 3π/4 are the shapes a reader knows on
 * sight, while 17π/53 would be a coincidence dressed up as insight.
 */
export function piFraction(radians: number): string | null {
  if (!Number.isFinite(radians) || radians <= 0) return null;
  const ratio = radians / Math.PI;
  for (const denominator of [1, 2, 3, 4, 5, 6, 8, 10, 12]) {
    const numerator = ratio * denominator;
    const rounded = Math.round(numerator);
    if (rounded >= 1 && Math.abs(numerator - rounded) < 1e-9) {
      const n = rounded === 1 ? '' : String(rounded);
      return denominator === 1 ? `${n || '1'}π` : `${n}π/${denominator}`;
    }
  }
  return null;
}

export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;
export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

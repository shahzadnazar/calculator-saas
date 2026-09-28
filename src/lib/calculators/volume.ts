/**
 * Volume of the eleven shapes the reference offers, with the working shown. Pure and unit-tested.
 *
 * Like the area calculator, the answer is in the unit you MEASURED in, cubed — "125 meters³" — and
 * the result shows its working: the formula, the formula with your numbers in it, sometimes the
 * exact multiple of π, then the answer. The number format and the π rule are shared with area in
 * `formula-steps.ts`, so the two calculators can never disagree on a digit.
 *
 * Two shapes break the common pattern, and both do so in the reference:
 *
 *  - The CUBE prints on a single line — `Volume = 5³ = 125 meters³` — because the formula and the
 *    substitution are the same length as the answer, and three lines would be ceremony.
 *  - The SPHERICAL CAP takes any TWO of base radius, ball radius and height and solves for the
 *    third. From a base radius and a ball radius the height is `R ± √(R² − r²)`, which has two
 *    roots — a shallow cap and a deep one — so that case genuinely has TWO answers and the
 *    reference prints both.
 */
import { type LengthUnit, UNIT_NOUN } from './area-units';
import { formatSignificant, piStep, type FormulaStep } from './formula-steps';

export type VolumeShapeKey =
  | 'sphere'
  | 'cone'
  | 'cube'
  | 'cylinder'
  | 'rectangular-tank'
  | 'capsule'
  | 'spherical-cap'
  | 'conical-frustum'
  | 'ellipsoid'
  | 'square-pyramid'
  | 'tube';

/** A figure as the reference prints it — the rule is shared with area. */
export const formatVolume = formatSignificant;

/** "meters³", for the unit the answer is in. */
export const cubedLabel = (unit: LengthUnit): string => `${UNIT_NOUN[unit]}³`;

/* ------------------------------------------------------------------ */
/* The eleven volumes — every dimension already in ONE unit            */
/* ------------------------------------------------------------------ */

export const volumeSphere = (r: number): number => (4 / 3) * Math.PI * r ** 3;
export const volumeCone = (r: number, h: number): number => (1 / 3) * Math.PI * r ** 2 * h;
export const volumeCube = (a: number): number => a ** 3;
export const volumeCylinder = (r: number, h: number): number => Math.PI * r ** 2 * h;
export const volumeRectangularTank = (l: number, w: number, h: number): number => l * w * h;
export const volumeCapsule = (r: number, h: number): number =>
  (4 / 3) * Math.PI * r ** 3 + Math.PI * r ** 2 * h;
/** A cap of height h cut from a ball of radius R. */
export const volumeSphericalCap = (R: number, h: number): number =>
  (1 / 3) * Math.PI * h ** 2 * (3 * R - h);
export const volumeConicalFrustum = (r: number, R: number, h: number): number =>
  (1 / 3) * Math.PI * h * (r ** 2 + r * R + R ** 2);
export const volumeEllipsoid = (a: number, b: number, c: number): number =>
  (4 / 3) * Math.PI * a * b * c;
export const volumeSquarePyramid = (a: number, h: number): number => (1 / 3) * a ** 2 * h;
/** A pipe: the outer cylinder less the bore, from DIAMETERS rather than radii. */
export const volumeTube = (d1: number, d2: number, l: number): number =>
  Math.PI * ((d1 ** 2 - d2 ** 2) / 4) * l;

/* ------------------------------------------------------------------ */
/* Spherical cap — solving for the missing third value                 */
/* ------------------------------------------------------------------ */

/**
 * The heights of the caps whose base radius is r on a ball of radius R.
 *
 * A chord at distance √(R² − r²) from the centre cuts the ball twice, so there are two caps with
 * the same base circle: the shallow one and everything above it. Both are real answers, which is
 * why the reference prints two volumes rather than picking one.
 */
export const capHeightsFromRadii = (r: number, R: number): number[] => {
  const inner = R ** 2 - r ** 2;
  if (!(inner >= 0)) return [];
  const d = Math.sqrt(inner);
  return d === 0 ? [R] : [R - d, R + d];
};

/** The ball radius implied by a base radius and a height. */
export const capBallRadiusFromBaseAndHeight = (r: number, h: number): number =>
  (r ** 2 + h ** 2) / (2 * h);

/** The base radius implied by a ball radius and a height. */
export const capBaseRadiusFromBallAndHeight = (R: number, h: number): number => {
  const inner = h * (2 * R - h);
  return inner >= 0 ? Math.sqrt(inner) : Number.NaN;
};

/* ------------------------------------------------------------------ */
/* The working                                                         */
/* ------------------------------------------------------------------ */

const n = (v: number) => formatSignificant(v);

/** What a shape's working looks like, and what it works out to. */
export interface VolumeSolution {
  /** One volume, or two for a spherical cap given both radii. */
  volumes: number[];
  steps: FormulaStep[];
}

const answer = (v: number, unit: LengthUnit): FormulaStep => ({
  expression: n(v),
  unit: cubedLabel(unit),
  final: true,
});

/** The common three-line shape: formula, substitution, optional π multiple, answer. */
const working = (
  formula: string,
  substitution: string,
  piCoefficient: number | null,
  value: number,
  unit: LengthUnit,
): FormulaStep[] => [
  { label: 'Volume', expression: formula },
  { expression: substitution },
  ...(piCoefficient === null ? [] : piStep(piCoefficient)),
  answer(value, unit),
];

/**
 * The steps for a spherical cap, which is the only shape that can produce two answers.
 *
 * `known` says which two values the visitor supplied; when all three are given the reference uses
 * the two radii and says so rather than silently preferring one.
 */
function sphericalCapSolution(
  r: number | null,
  R: number | null,
  h: number | null,
  unit: LengthUnit,
): VolumeSolution {
  const steps: FormulaStep[] = [];
  const hasAll = r !== null && R !== null && h !== null;

  // From the two radii: two heights, so two caps.
  if (r !== null && R !== null) {
    if (hasAll) {
      steps.push({
        kind: 'note',
        expression:
          'The calculator only needs two values. The following result is based on the base radius and the ball radius.',
      });
    }
    const heights = capHeightsFromRadii(r, R);
    if (heights.length === 0) return { volumes: [], steps };
    const volumes = heights.map((height) => volumeSphericalCap(R, height));

    if (volumes.length > 1) steps.push({ kind: 'note', expression: 'Two possible results:' });
    volumes.forEach((v, i) => {
      if (i > 0) steps.push({ kind: 'note', expression: 'Or' });
      steps.push({ label: 'Volume', expression: n(v), unit: cubedLabel(unit), final: true });
    });

    steps.push({ kind: 'heading', expression: 'Steps:' });
    steps.push({ label: 'Height (h)', expression: 'R ± √(R² − r²)' });
    steps.push({ expression: `${n(R)} ± √(${n(R)}² − ${n(r)}²)` });
    steps.push({
      expression: heights.map(n).join(' or '),
      unit: UNIT_NOUN[unit],
    });

    heights.forEach((height, i) => {
      steps.push({ kind: 'note', expression: `If height (h) = ${n(height)}` });
      steps.push({ label: 'Volume', expression: '1/3 πh²(3R − h)' });
      steps.push({
        expression: `1/3 × π × ${n(height)}²(3×${n(R)} − ${n(height)})`,
      });
      steps.push(answer(volumes[i], unit));
    });

    return { volumes, steps };
  }

  // From a base radius and a height: the ball radius follows, and there is one cap.
  if (r !== null && h !== null) {
    const ball = capBallRadiusFromBaseAndHeight(r, h);
    const v = volumeSphericalCap(ball, h);
    steps.push({ label: 'Ball radius (R)', expression: '(r² + h²) / 2h' });
    steps.push({ expression: `(${n(r)}² + ${n(h)}²) / (2 × ${n(h)})` });
    steps.push({ expression: n(ball), unit: UNIT_NOUN[unit] });
    steps.push(...working('1/3 πh²(3R − h)', `1/3 × π × ${n(h)}²(3×${n(ball)} − ${n(h)})`, null, v, unit));
    return { volumes: [v], steps };
  }

  // From a ball radius and a height: the base radius follows, and there is one cap.
  if (R !== null && h !== null) {
    const base = capBaseRadiusFromBallAndHeight(R, h);
    const v = volumeSphericalCap(R, h);
    steps.push({ label: 'Base radius (r)', expression: '√(h(2R − h))' });
    steps.push({ expression: `√(${n(h)}(2×${n(R)} − ${n(h)}))` });
    steps.push({ expression: n(base), unit: UNIT_NOUN[unit] });
    steps.push(...working('1/3 πh²(3R − h)', `1/3 × π × ${n(h)}²(3×${n(R)} − ${n(h)})`, null, v, unit));
    return { volumes: [v], steps };
  }

  return { volumes: [], steps };
}

/**
 * The working for a shape, with the entered numbers substituted.
 *
 * `dims` arrive already converted into `unit`, so the numbers shown are the numbers used — a line
 * the visitor cannot reproduce is worse than no line at all. A `null` is a field left blank, which
 * only the spherical cap allows.
 */
export function volumeSolution(
  shape: VolumeShapeKey,
  dims: (number | null)[],
  unit: LengthUnit,
): VolumeSolution {
  const d = (i: number) => dims[i] as number;
  const one = (v: number, formula: string, substitution: string, piCoefficient: number | null) => ({
    volumes: [v],
    steps: working(formula, substitution, piCoefficient, v, unit),
  });

  switch (shape) {
    case 'sphere': {
      const r = d(0);
      return one(volumeSphere(r), '4/3 πr³', `4/3 × π × ${n(r)}³`, (4 / 3) * r ** 3);
    }
    case 'cone': {
      const [r, h] = [d(0), d(1)];
      return one(volumeCone(r, h), '1/3 πr²h', `1/3 × π × ${n(r)}² × ${n(h)}`, (1 / 3) * r ** 2 * h);
    }
    case 'cube': {
      const a = d(0);
      const v = volumeCube(a);
      // The reference prints this one on a single line: `Volume = 5³ = 125 meters³`.
      return {
        volumes: [v],
        steps: [
          { label: 'Volume', lead: `${n(a)}³ = `, expression: n(v), unit: cubedLabel(unit), final: true },
        ],
      };
    }
    case 'cylinder': {
      const [r, h] = [d(0), d(1)];
      return one(volumeCylinder(r, h), 'πr²h', `π × ${n(r)}² × ${n(h)}`, r ** 2 * h);
    }
    case 'rectangular-tank': {
      const [l, w, h] = [d(0), d(1), d(2)];
      return one(volumeRectangularTank(l, w, h), 'lwh', `${n(l)} × ${n(w)} × ${n(h)}`, null);
    }
    case 'capsule': {
      const [r, h] = [d(0), d(1)];
      return one(
        volumeCapsule(r, h),
        '4/3 πr³ + πr²h',
        `4/3 × π × ${n(r)}³ + π × ${n(r)}² × ${n(h)}`,
        (4 / 3) * r ** 3 + r ** 2 * h,
      );
    }
    case 'spherical-cap':
      return sphericalCapSolution(dims[0], dims[1], dims[2], unit);
    case 'conical-frustum': {
      const [r, R, h] = [d(0), d(1), d(2)];
      return one(
        volumeConicalFrustum(r, R, h),
        '1/3 πh(r² + rR + R²)',
        `1/3 × π × ${n(h)}(${n(r)}² + ${n(r)}×${n(R)} + ${n(R)}²)`,
        (1 / 3) * h * (r ** 2 + r * R + R ** 2),
      );
    }
    case 'ellipsoid': {
      const [a, b, c] = [d(0), d(1), d(2)];
      return one(
        volumeEllipsoid(a, b, c),
        '4/3 πabc',
        `4/3 × π × ${n(a)} × ${n(b)} × ${n(c)}`,
        (4 / 3) * a * b * c,
      );
    }
    case 'square-pyramid': {
      const [a, h] = [d(0), d(1)];
      return one(volumeSquarePyramid(a, h), '1/3 a²h', `1/3 × ${n(a)}² × ${n(h)}`, null);
    }
    case 'tube': {
      const [d1, d2, l] = [d(0), d(1), d(2)];
      return one(
        volumeTube(d1, d2, l),
        'π (d1² − d2²)/4 × l',
        `π × (${n(d1)}² − ${n(d2)}²)/4 × ${n(l)}`,
        ((d1 ** 2 - d2 ** 2) / 4) * l,
      );
    }
    default:
      return { volumes: [], steps: [] };
  }
}

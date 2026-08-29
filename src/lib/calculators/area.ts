/**
 * Area of the seven shapes the reference offers, with the working shown. Pure and unit-tested.
 *
 * Two things separate this from the square-footage calculator, and both come from the reference:
 *
 *  1. The answer is in the unit you MEASURED in, squared — "600 meters²" — not converted to a
 *     canonical square foot. Square footage answers "how much flooring do I buy"; this answers
 *     "what is the area of this shape", and converting that to feet would be an imposition.
 *  2. It shows its working. `Area = π r²` then `= π × 30²` then `= 900π` then the number. That is
 *     the difference between a calculator a student can check and one they have to trust, so the
 *     steps are generated here, beside the formula they describe, rather than assembled in a view.
 *
 * Formatting matches the reference exactly: fourteen significant figures, trailing zeros stripped.
 * The triangle is what pins that down — ten decimal places would print 666.5852814907 where the
 * reference prints 666.58528149067.
 */
import { type LengthUnit, SQUARED_UNIT_LABEL } from './area-units';

export type AreaShapeKey =
  | 'rectangle'
  | 'triangle'
  | 'trapezoid'
  | 'circle'
  | 'sector'
  | 'ellipse'
  | 'parallelogram';

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * A figure as the reference prints it: fourteen significant figures, trailing zeros stripped.
 * Never a placeholder-free NaN — an unusable number returns an em dash so no view can leak one.
 */
export function formatArea(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  return String(Number(value.toPrecision(14)));
}

/** A number inside a shown step — the same rule, so the working and the answer agree. */
export const stepNumber = (value: number): string => formatArea(value);

/** "meters²", for the unit the answer is in. */
export const squaredLabel = (unit: LengthUnit): string => `${SQUARED_UNIT_LABEL[unit]}²`;

/* ------------------------------------------------------------------ */
/* The seven areas — every dimension already in ONE unit               */
/* ------------------------------------------------------------------ */

export const areaRectangle = (length: number, width: number): number => length * width;

/**
 * Heron's formula — the reference asks for three edges, not a base and a height, because three
 * edges are what you can actually measure on the ground.
 */
export const areaTriangle = (a: number, b: number, c: number): number => {
  const s = (a + b + c) / 2;
  const sq = s * (s - a) * (s - b) * (s - c);
  return sq <= 0 ? Number.NaN : Math.sqrt(sq);
};

/** The semi-perimeter, shown as its own step because the reference shows it. */
export const semiPerimeter = (a: number, b: number, c: number): number => (a + b + c) / 2;

export const areaTrapezoid = (base1: number, base2: number, height: number): number =>
  ((base1 + base2) / 2) * height;

/** The reference's circle takes a RADIUS, unlike the square-footage circle's diameter. */
export const areaCircle = (radius: number): number => Math.PI * radius ** 2;

/** A wedge of a circle, the angle in degrees as the reference's formula states it. */
export const areaSector = (radius: number, degrees: number): number =>
  (degrees / 360) * Math.PI * radius ** 2;

export const areaEllipse = (semiMajor: number, semiMinor: number): number =>
  Math.PI * semiMajor * semiMinor;

export const areaParallelogram = (base: number, height: number): number => base * height;

/* ------------------------------------------------------------------ */
/* The working                                                         */
/* ------------------------------------------------------------------ */

/** One line of the shown working: `Area =` / `= π × 30²` / `= 900π`. */
export interface AreaStep {
  /** The label on the left, only on the first line of a formula ("Area", "s"). */
  label?: string;
  /** The expression on the right of the equals sign. */
  expression: string;
  /** The unit shown after this line, when the line is a quantity rather than an expression. */
  unit?: string;
  /** True for the final answer, so a view can weight it. */
  final?: boolean;
}

/**
 * The multiple of π on its own line — the reference prints `900π` before `2827.4333882308`.
 * Only worth showing when it is not a bare 1, which would read as "1π".
 */
const piStep = (coefficient: number): AreaStep[] =>
  Number.isFinite(coefficient) && coefficient !== 1
    ? [{ expression: `${stepNumber(coefficient)}π` }]
    : [];

/**
 * The working for a shape, with the entered numbers substituted.
 *
 * `dims` arrive already converted into `unit`, so the numbers shown are the numbers used. That is
 * the whole point of showing the working: a line the visitor cannot reproduce is worse than none.
 */
export function areaSteps(
  shape: AreaShapeKey,
  dims: number[],
  unit: LengthUnit,
  area: number,
): AreaStep[] {
  const n = (i: number) => stepNumber(dims[i]);
  const u = squaredLabel(unit);
  const answer: AreaStep = { expression: stepNumber(area), unit: u, final: true };

  switch (shape) {
    case 'rectangle':
      return [
        { label: 'Area', expression: 'l × w' },
        { expression: `${n(0)} × ${n(1)}` },
        answer,
      ];

    case 'triangle': {
      const s = semiPerimeter(dims[0], dims[1], dims[2]);
      return [
        { label: 's', expression: '(a + b + c) / 2' },
        { expression: `(${n(0)} + ${n(1)} + ${n(2)}) / 2` },
        { expression: stepNumber(s), unit: SQUARED_UNIT_LABEL[unit] },
        { label: 'Area', expression: '√(s(s − a)(s − b)(s − c))' },
        {
          expression: `√(${stepNumber(s)} × (${stepNumber(s)} − ${n(0)}) × (${stepNumber(s)} − ${n(1)}) × (${stepNumber(s)} − ${n(2)}))`,
        },
        answer,
      ];
    }

    case 'trapezoid':
      return [
        { label: 'Area', expression: '(b₁ + b₂) / 2 × h' },
        { expression: `(${n(0)} + ${n(1)}) / 2 × ${n(2)}` },
        answer,
      ];

    case 'circle':
      return [
        { label: 'Area', expression: 'π r²' },
        { expression: `π × ${n(0)}²` },
        ...piStep(dims[0] ** 2),
        answer,
      ];

    case 'sector':
      return [
        { label: 'Area', expression: 'A / 360 × π × r²' },
        { expression: `${n(1)} / 360 × π × ${n(0)}²` },
        ...piStep((dims[1] / 360) * dims[0] ** 2),
        answer,
      ];

    case 'ellipse':
      return [
        { label: 'Area', expression: 'π a b' },
        { expression: `π × ${n(0)} × ${n(1)}` },
        ...piStep(dims[0] * dims[1]),
        answer,
      ];

    case 'parallelogram':
      return [
        { label: 'Area', expression: 'b × h' },
        { expression: `${n(0)} × ${n(1)}` },
        answer,
      ];

    default:
      return [answer];
  }
}

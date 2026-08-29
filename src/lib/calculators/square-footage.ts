/**
 * Square footage for the nine shapes the reference offers, with per-dimension units, a
 * quantity and an optional price. Pure and unit-tested.
 *
 * Every shape reduces to the same three steps: convert each dimension to feet, apply that
 * shape's area formula, then multiply by the quantity. Keeping the formulas here — one small
 * function each, none of them reaching for a unit or a form — is what lets nine calculators
 * share one binding instead of being written nine times.
 *
 * The units themselves live in `area-units.ts`, shared with the area calculator, and are
 * re-exported here so this module stays the one import a square-footage consumer needs.
 */
export {
  LENGTH_UNITS,
  METRES_PER,
  SQFT_PER,
  AREA_UNITS,
  ANGLE_UNITS,
  toFeet,
  fromSqFt,
  toRadians,
  isLengthUnit,
  convertLength,
  type LengthUnit,
  type AreaUnit,
  type AngleUnit,
} from './area-units';

/* ------------------------------------------------------------------ */
/* The nine areas — every dimension already in feet                    */
/* ------------------------------------------------------------------ */

export const areaRectangle = (length: number, width: number): number => length * width;

/**
 * The border lies INSIDE the given length and width, which is what the reference computes:
 * a 30 × 20 rectangle with a 2-wide border is 600 − 26 × 16 = 184, not 816 − 600 = 216.
 * Getting this backwards silently overstates a patio or a walkway by a fifth.
 */
export const areaRectangleBorder = (length: number, width: number, border: number): number =>
  length * width - Math.max(0, length - 2 * border) * Math.max(0, width - 2 * border);

export const areaCircle = (diameter: number): number => Math.PI * (diameter / 2) ** 2;

/** A ring: the outer disc less the disc left inside the border. */
export const areaRing = (outerDiameter: number, border: number): number => {
  const r = outerDiameter / 2;
  return Math.PI * (r ** 2 - Math.max(0, r - border) ** 2);
};

/** Heron's formula — the only route to an area from three edges alone. */
export const areaTriangleEdges = (a: number, b: number, c: number): number => {
  const s = (a + b + c) / 2;
  const sq = s * (s - a) * (s - b) * (s - c);
  return sq <= 0 ? Number.NaN : Math.sqrt(sq);
};

export const areaTriangleBaseHeight = (base: number, height: number): number => (base * height) / 2;

export const areaTrapezoid = (base1: number, base2: number, height: number): number =>
  ((base1 + base2) / 2) * height;

/** A sector, with the angle already in radians. */
export const areaSector = (radius: number, radians: number): number => (radians / 2) * radius ** 2;

export const areaParallelogram = (base: number, height: number): number => base * height;

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * The reference prints an area unrounded to ten decimal places, trailing zeros stripped —
 * "1980.5595166746 Square Feet". Matching that exactly is what makes the two calculators
 * comparable figure for figure.
 */
export function formatExactArea(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return String(Number(value.toFixed(10)));
}

/**
 * Square footage for the nine shapes the reference offers, with per-dimension units, a
 * quantity and an optional price. Pure and unit-tested.
 *
 * Every shape reduces to the same three steps: convert each dimension to feet, apply that
 * shape's area formula, then multiply by the quantity. Keeping the formulas here — one small
 * function each, none of them reaching for a unit or a form — is what lets nine calculators
 * share one binding instead of being written nine times.
 *
 * The foot is defined as exactly 0.3048 m, so every conversion here derives from that one
 * number rather than from a rounded factor. A truncated 10.7639104 is out by a part in ten
 * million, which is invisible on a room and wrong on an acreage.
 */

export type LengthUnit = 'in' | 'ft' | 'yd' | 'cm' | 'm';

/** Metres per unit, from the exact definition of the foot. */
const METRES_PER: Record<LengthUnit, number> = {
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
  cm: 0.01,
  m: 1,
};

export const LENGTH_UNITS: { value: LengthUnit; label: string }[] = [
  { value: 'ft', label: 'feet' },
  { value: 'in', label: 'inches' },
  { value: 'yd', label: 'yards' },
  { value: 'cm', label: 'centimeters' },
  { value: 'm', label: 'meters' },
];

/** Feet per unit. */
export function toFeet(value: number, unit: LengthUnit): number {
  const m = METRES_PER[unit];
  if (!Number.isFinite(value) || m === undefined) return Number.NaN;
  return (value * m) / METRES_PER.ft;
}

export type AreaUnit = 'sqin' | 'sqft' | 'sqyd' | 'sqm' | 'acre';

/** Square feet per square unit — every one exact, from the same 0.3048. */
export const SQFT_PER: Record<AreaUnit, number> = {
  sqin: (0.0254 * 0.0254) / (0.3048 * 0.3048),
  sqft: 1,
  sqyd: (0.9144 * 0.9144) / (0.3048 * 0.3048),
  sqm: 1 / (0.3048 * 0.3048),
  acre: 43_560,
};

export const AREA_UNITS: {
  value: AreaUnit;
  /** How the unit reads in the price select: "per square feet". */
  label: string;
  /** How ONE of it reads: "$3.50 per square foot". */
  singular: string;
  /** The row heading in the other-units table. */
  plural: string;
}[] = [
  { value: 'sqft', label: 'square feet', singular: 'square foot', plural: 'Square Feet' },
  { value: 'sqin', label: 'square inches', singular: 'square inch', plural: 'Square Inches' },
  { value: 'sqyd', label: 'square yards', singular: 'square yard', plural: 'Square Yards' },
  { value: 'sqm', label: 'square meters', singular: 'square meter', plural: 'Square Meters' },
  { value: 'acre', label: 'acres', singular: 'acre', plural: 'Acres' },
];

/** A square-foot figure expressed in another area unit. */
export function fromSqFt(areaSqFt: number, unit: AreaUnit): number {
  const f = SQFT_PER[unit];
  if (!Number.isFinite(areaSqFt) || f === undefined) return Number.NaN;
  return areaSqFt / f;
}

export type AngleUnit = 'deg' | 'rad';
export const ANGLE_UNITS: { value: AngleUnit; label: string }[] = [
  { value: 'deg', label: 'degree °' },
  { value: 'rad', label: 'radian' },
];

export function toRadians(value: number, unit: AngleUnit): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return unit === 'rad' ? value : (value * Math.PI) / 180;
}

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

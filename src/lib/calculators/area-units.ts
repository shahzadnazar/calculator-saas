/**
 * The unit layer shared by the area and square-footage calculators.
 *
 * Both tools ask the same question of a measurement — what unit is this in, and what is the answer
 * worth in the others — so the conversions live here once rather than in each calculator. It was
 * extracted when the second consumer arrived, not before.
 *
 * The foot is defined as exactly 0.3048 m, so every factor below derives from that one number
 * rather than from a rounded constant. A truncated 10.7639104 is out by a part in ten million,
 * which is invisible on a room and wrong on an acreage.
 */

export type LengthUnit = 'in' | 'ft' | 'yd' | 'cm' | 'm';

/** Metres per unit, from the exact definition of the foot. */
export const METRES_PER: Record<LengthUnit, number> = {
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

export const isLengthUnit = (raw: string): raw is LengthUnit =>
  Object.prototype.hasOwnProperty.call(METRES_PER, raw);

/** Feet per unit. */
export function toFeet(value: number, unit: LengthUnit): number {
  const m = METRES_PER[unit];
  if (!Number.isFinite(value) || m === undefined) return Number.NaN;
  return (value * m) / METRES_PER.ft;
}

/**
 * A length converted between any two units.
 *
 * The area calculator needs this because each measurement carries its own unit but one shape has
 * only one answer: every dimension is brought to the first field's unit before the formula runs,
 * so the result is in that unit squared, exactly as the reference prints it.
 */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  const a = METRES_PER[from];
  const b = METRES_PER[to];
  if (!Number.isFinite(value) || a === undefined || b === undefined) return Number.NaN;
  return (value * a) / b;
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
  /** How the unit reads in a price select: "per square feet". */
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

/**
 * An area given in some length unit SQUARED, expressed in square feet.
 *
 * The ratio is squared before it multiplies the area rather than applied twice: one rounding
 * instead of two, which is what keeps the fourteenth significant figure stable.
 */
export function squaredUnitToSqFt(area: number, unit: LengthUnit): number {
  const m = METRES_PER[unit];
  if (!Number.isFinite(area) || m === undefined) return Number.NaN;
  return area * (m / METRES_PER.ft) ** 2;
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

/** How a unit reads beside a squared figure: "600 meters²". */
export const SQUARED_UNIT_LABEL: Record<LengthUnit, string> = {
  in: 'inches',
  ft: 'feet',
  yd: 'yards',
  cm: 'centimeters',
  m: 'meters',
};

/**
 * Concrete: how much a pour needs, and what it weighs. Pure and unit-tested.
 *
 * Five shapes — a slab, a round footing, a circular slab or tube, a curb-and-gutter barrier and a
 * flight of stairs — each reducing to one volume, from which everything else follows: the same
 * volume in three units, the weight at pre-mixed density, and how many 60-lb and 80-lb bags that
 * is. That last part is the point of the tool. A cubic yard figure does not tell a person standing
 * in a builders' merchant what to put in the trolley; a bag count does.
 *
 * Volumes are computed in FEET throughout, because that is the unit the answer leads with and it
 * keeps the bag arithmetic — which is defined per cubic foot — free of a round trip through metres.
 *
 * The displayed rounding deliberately differs from the rest of the site. Ordering concrete is not a
 * precision exercise: two decimals is enough for anything above a cubic foot, and below that two
 * significant figures keep a small pour from collapsing to "0.09" when it is really 0.086.
 */
import { convertLength, type LengthUnit } from './area-units';
import { roundHalfUp } from './formula-steps';

export type ConcreteShapeKey =
  | 'slab'
  | 'footing'
  | 'tube'
  | 'curb'
  | 'stairs';

/** Pre-mixed concrete, as the reference states it. */
export const DENSITY_KG_PER_M3 = 2130;
export const DENSITY_LB_PER_FT3 = 133;
export const BAG_SIZES_LB = [60, 80] as const;

const FT3_PER_M3 = 1 / (0.3048 * 0.3048 * 0.3048);
const FT3_PER_YD3 = 27;

/**
 * The reference computes its round pours with pi to five decimals, and this calculator matches it
 * so the two agree figure for figure — which is the whole point of the exercise.
 *
 * It costs nothing that matters. Against the real pi the difference is about one part in ten
 * million: on the reference's own 2.5 m by 6 m column, 62,733.63 kg rather than 62,733.68 — fifty
 * grams of concrete in sixty-two tonnes, which is far inside the error of the density assumption
 * this whole estimate rests on.
 */
export const REFERENCE_PI = 3.14159;

/* ------------------------------------------------------------------ */
/* Rounding                                                            */
/* ------------------------------------------------------------------ */

/**
 * Round half UP at `digits` decimals.
 *
 * The nudge is not superstition. 92.655 is held as 92.65499999999999, so an honest round-half-up
 * gives 92.65 where every person reading it expects 92.66. Scaling by a part in a million million
 * before rounding restores the decimal intent without disturbing any figure that was not already
 * sitting exactly on a half.
 */
export { roundHalfUp };

/**
 * A quantity as this calculator prints it: two decimals, or enough decimals to keep two
 * significant figures when the number is smaller than one.
 */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  let rounded = roundHalfUp(value, 2);
  if (Math.abs(value) < 1) {
    let digits = 2;
    while (Math.abs(roundHalfUp(value, digits)) * Math.pow(10, digits) < 10 && digits < 8) {
      digits += 1;
    }
    rounded = roundHalfUp(value, digits);
  }
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

/** A weight, always to two decimals with thousands separators. */
export function formatWeight(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return roundHalfUp(value, 2).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/* ------------------------------------------------------------------ */
/* The five volumes — every dimension already in FEET                  */
/* ------------------------------------------------------------------ */

export const volumeSlab = (length: number, width: number, thickness: number): number =>
  length * width * thickness;

/** A hole, column or round footing: a cylinder measured across. */
export const volumeFooting = (diameter: number, depth: number): number =>
  REFERENCE_PI * (diameter / 2) ** 2 * depth;

/** A circular slab or tube: the outer cylinder less its bore. */
export const volumeTube = (outerDiameter: number, innerDiameter: number, height: number): number =>
  (REFERENCE_PI / 4) * (outerDiameter ** 2 - innerDiameter ** 2) * height;

/**
 * A curb and gutter barrier, poured as one run.
 *
 * The cross-section is the flag — the flat slab spanning the curb's depth and the gutter's width —
 * plus the curb standing on it. Multiplied along the run, that is the pour.
 */
export const volumeCurb = (
  curbDepth: number,
  gutterWidth: number,
  curbHeight: number,
  flagThickness: number,
  length: number,
): number => ((curbDepth + gutterWidth) * flagThickness + curbHeight * curbDepth) * length;

/**
 * A flight of stairs.
 *
 * Each step sits on the one below it, so the nth step up carries n−1 runs of concrete beneath its
 * tread, and the platform runs the full rise. Summing the steps gives the platform slab plus a
 * triangular stack of treads.
 */
export const volumeStairs = (
  run: number,
  rise: number,
  width: number,
  platformDepth: number,
  risers: number,
): number =>
  width * (platformDepth * risers * rise + run * rise * ((risers * (risers - 1)) / 2));

/* ------------------------------------------------------------------ */
/* What follows from a volume                                          */
/* ------------------------------------------------------------------ */

export interface BagCount {
  /** Pounds per bag. */
  size: number;
  bags: number;
}

export interface ConcreteAmount {
  cubicFeet: number;
  cubicYards: number;
  cubicMeters: number;
  pounds: number;
  kilograms: number;
  bags: BagCount[];
}

/** Everything the reference reports, from a volume in cubic feet. */
export function concreteAmount(cubicFeet: number): ConcreteAmount {
  const cubicMeters = cubicFeet / FT3_PER_M3;
  const pounds = cubicFeet * DENSITY_LB_PER_FT3;
  return {
    cubicFeet,
    cubicYards: cubicFeet / FT3_PER_YD3,
    cubicMeters,
    pounds,
    kilograms: cubicMeters * DENSITY_KG_PER_M3,
    bags: BAG_SIZES_LB.map((size) => ({ size, bags: pounds / size })),
  };
}

/** A dimension in feet, whatever it was measured in. */
export const toFeet = (value: number, unit: LengthUnit): number => convertLength(value, unit, 'ft');

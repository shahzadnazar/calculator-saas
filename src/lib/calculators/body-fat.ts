/**
 * Body fat percentage — U.S. Navy circumference method. Pure and unit-tested.
 * Uses the metric form of the formula; imperial inputs are converted to cm.
 */

export type Sex = 'male' | 'female';
export type UnitSystem = 'metric' | 'imperial';
export type BodyFatCategory =
  | 'Essential fat'
  | 'Athletes'
  | 'Fitness'
  | 'Average'
  | 'Obese';

export interface BodyFatInput {
  sex: Sex;
  system: UnitSystem;
  // metric (cm)
  heightCm?: number;
  neckCm?: number;
  waistCm?: number;
  hipCm?: number; // women
  // imperial (inches)
  heightIn?: number;
  neckIn?: number;
  waistIn?: number;
  hipIn?: number; // women
}

export interface BodyFatResult {
  bodyFatPct: number;
  category: BodyFatCategory;
}

const CM_PER_IN = 2.54;
const log10 = (x: number) => Math.log10(x);

function classify(sex: Sex, bf: number): BodyFatCategory {
  if (sex === 'male') {
    if (bf < 6) return 'Essential fat';
    if (bf < 14) return 'Athletes';
    if (bf < 18) return 'Fitness';
    if (bf < 25) return 'Average';
    return 'Obese';
  }
  if (bf < 14) return 'Essential fat';
  if (bf < 21) return 'Athletes';
  if (bf < 25) return 'Fitness';
  if (bf < 32) return 'Average';
  return 'Obese';
}

export function calculateBodyFat(input: BodyFatInput): BodyFatResult {
  const toCm = (n?: number) => (input.system === 'imperial' ? (n || 0) * CM_PER_IN : n || 0);
  const height = toCm(input.system === 'imperial' ? input.heightIn : input.heightCm);
  const neck = toCm(input.system === 'imperial' ? input.neckIn : input.neckCm);
  const waist = toCm(input.system === 'imperial' ? input.waistIn : input.waistCm);
  const hip = toCm(input.system === 'imperial' ? input.hipIn : input.hipCm);

  const nan: BodyFatResult = { bodyFatPct: NaN, category: 'Average' };
  if (height <= 0 || neck <= 0 || waist <= 0) return nan;

  let bf: number;
  if (input.sex === 'male') {
    if (waist - neck <= 0) return nan;
    bf = 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(height)) - 450;
  } else {
    if (hip <= 0 || waist + hip - neck <= 0) return nan;
    bf =
      495 / (1.29579 - 0.35004 * log10(waist + hip - neck) + 0.221 * log10(height)) - 450;
  }

  if (!Number.isFinite(bf)) return nan;
  const rounded = Math.round(bf * 10) / 10;
  return { bodyFatPct: rounded, category: classify(input.sex, rounded) };
}

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

/**
 * The Navy percentage, UNROUNDED, from metric measurements. Returns NaN when the
 * measurements cannot produce one.
 *
 * The unrounded value matters: rounding to a tenth before multiplying it by a body weight
 * moves the fat and lean masses by around a tenth of a kilogram, which is the difference
 * between agreeing with the published figures and being visibly out by one in the last
 * digit. Display rounds; arithmetic does not.
 */
export function navyBodyFatPct(
  sex: Sex,
  heightCm: number,
  neckCm: number,
  waistCm: number,
  hipCm?: number,
): number {
  if (!(heightCm > 0) || !(neckCm > 0) || !(waistCm > 0)) return Number.NaN;
  let bf: number;
  if (sex === 'male') {
    if (waistCm - neckCm <= 0) return Number.NaN;
    bf = 495 / (1.0324 - 0.19077 * log10(waistCm - neckCm) + 0.15456 * log10(heightCm)) - 450;
  } else {
    const hip = hipCm ?? 0;
    if (hip <= 0 || waistCm + hip - neckCm <= 0) return Number.NaN;
    bf = 495 / (1.29579 - 0.35004 * log10(waistCm + hip - neckCm) + 0.221 * log10(heightCm)) - 450;
  }
  // The formula is a fit, not a law: push the measurements far enough apart and it returns
  // zero or a negative percentage, which is not a lean person but a question outside its
  // domain. Refuse rather than print a body made of less than no fat.
  return Number.isFinite(bf) && bf > 0 ? bf : Number.NaN;
}

export function calculateBodyFat(input: BodyFatInput): BodyFatResult {
  const toCm = (n?: number) => (input.system === 'imperial' ? (n || 0) * CM_PER_IN : n || 0);
  const height = toCm(input.system === 'imperial' ? input.heightIn : input.heightCm);
  const neck = toCm(input.system === 'imperial' ? input.neckIn : input.neckCm);
  const waist = toCm(input.system === 'imperial' ? input.waistIn : input.waistCm);
  const hip = toCm(input.system === 'imperial' ? input.hipIn : input.hipCm);

  const bf = navyBodyFatPct(input.sex, height, neck, waist, hip);
  if (!Number.isFinite(bf)) return { bodyFatPct: NaN, category: 'Average' };
  const rounded = Math.round(bf * 10) / 10;
  return { bodyFatPct: rounded, category: classify(input.sex, rounded) };
}

/* ------------------------------------------------------------------ */
/* The full report                                                     */
/* ------------------------------------------------------------------ */

/**
 * The Navy percentage on its own does not tell anyone what to do with it, so the report
 * puts it next to what it means in kilograms, what is typical for someone that age, and a
 * second estimate from an entirely different method.
 *
 * Two estimates that disagree is the honest picture. The Navy method measures where fat
 * actually sits; the BMI method only knows height, weight and age and cannot tell muscle
 * from fat. Showing both, and their gap, says more than either alone.
 */

/** The band edges the gauge is drawn from, and the categories between them. */
export const CATEGORY_BANDS: Record<Sex, { edges: number[]; labels: BodyFatCategory[] }> = {
  male: {
    edges: [2, 6, 14, 18, 25],
    labels: ['Essential fat', 'Athletes', 'Fitness', 'Average', 'Obese'],
  },
  female: {
    edges: [10, 14, 21, 25, 32],
    labels: ['Essential fat', 'Athletes', 'Fitness', 'Average', 'Obese'],
  },
};

/**
 * Jackson & Pollock's ideal body fat by age, the table the reference reports against.
 * Values between the anchors are interpolated; outside them the nearest anchor holds.
 */
const IDEAL_BY_AGE: Record<Sex, [number, number][]> = {
  male: [
    [20, 8.5], [25, 10.5], [30, 12.7], [35, 13.7],
    [40, 15.3], [45, 16.4], [50, 18.9], [55, 20.9],
  ],
  female: [
    [20, 17.7], [25, 18.4], [30, 19.3], [35, 21.5],
    [40, 22.2], [45, 22.9], [50, 25.2], [55, 26.3],
  ],
};

export function idealBodyFatPct(sex: Sex, age: number): number {
  const table = IDEAL_BY_AGE[sex];
  if (!Number.isFinite(age)) return Number.NaN;
  if (age <= table[0][0]) return table[0][1];
  if (age >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 1; i < table.length; i += 1) {
    const [a1, v1] = table[i];
    if (age <= a1) {
      const [a0, v0] = table[i - 1];
      return v0 + ((age - a0) / (a1 - a0)) * (v1 - v0);
    }
  }
  return table[table.length - 1][1];
}

/**
 * Body fat estimated from BMI alone (Deurenberg). Adults and children use different
 * constants, because the relationship between BMI and fat changes while someone is growing.
 */
export function bodyFatFromBmi(sex: Sex, bmi: number, age: number): number {
  if (!Number.isFinite(bmi) || !Number.isFinite(age)) return Number.NaN;
  const male = sex === 'male';
  if (age >= 18) return 1.2 * bmi + 0.23 * age - (male ? 16.2 : 5.4);
  return 1.51 * bmi - 0.7 * age + (male ? -2.2 : 1.4);
}

export interface BodyFatReportInput {
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  /** Women only; the female formula needs it. */
  hipCm?: number;
}

export interface BodyFatReport {
  bodyFatPct: number;
  category: BodyFatCategory;
  fatMassKg: number;
  leanMassKg: number;
  bmi: number;
  bmiBodyFatPct: number;
  idealPct: number;
  /** Fat to shed to reach the ideal percentage. Negative means already below it. */
  fatToLoseKg: number;
  unsolvable: boolean;
}

const NO_REPORT: BodyFatReport = {
  bodyFatPct: Number.NaN,
  category: 'Average',
  fatMassKg: Number.NaN,
  leanMassKg: Number.NaN,
  bmi: Number.NaN,
  bmiBodyFatPct: Number.NaN,
  idealPct: Number.NaN,
  fatToLoseKg: Number.NaN,
  unsolvable: true,
};

/**
 * The whole report from one set of metric measurements.
 *
 * Returns `unsolvable`, with every figure NaN, rather than a zero or an Infinity when the
 * measurements cannot produce a percentage — a waist no bigger than the neck, a missing hip
 * measurement for a woman, or anything non-finite.
 */
export function bodyFatReport(input: BodyFatReportInput): BodyFatReport {
  const { sex, age, weightKg, heightCm, neckCm, waistCm, hipCm } = input;
  const numbers = [age, weightKg, heightCm, neckCm, waistCm, ...(sex === 'female' ? [hipCm ?? Number.NaN] : [])];
  if (numbers.some((n) => !Number.isFinite(n))) return NO_REPORT;
  if (weightKg <= 0 || heightCm <= 0 || age < 0) return NO_REPORT;

  const rawPct = navyBodyFatPct(sex, heightCm, neckCm, waistCm, hipCm);
  if (!Number.isFinite(rawPct)) return NO_REPORT;

  // Masses come off the UNROUNDED percentage; only the display rounds.
  const fatMassKg = weightKg * (rawPct / 100);
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const idealPct = idealBodyFatPct(sex, age);

  return {
    bodyFatPct: rawPct,
    category: classify(sex, rawPct),
    fatMassKg,
    leanMassKg: weightKg - fatMassKg,
    bmi,
    bmiBodyFatPct: bodyFatFromBmi(sex, bmi, age),
    idealPct,
    // The reference measures the gap against current weight rather than solving for the
    // weight at which the percentage would be reached. Kept the same so the two agree.
    fatToLoseKg: fatMassKg - weightKg * (idealPct / 100),
    unsolvable: false,
  };
}

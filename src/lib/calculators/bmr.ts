/**
 * Basal Metabolic Rate. Pure and unit-tested.
 *
 * Three published equations, because they disagree and the visitor should be able to say
 * which one they want. Mifflin-St Jeor is the default and the one the calorie/TDEE
 * calculator consumes directly — `mifflinStJeorBMR` is deliberately its own export and must
 * not change shape.
 *
 *   Mifflin-St Jeor       men   10·kg + 6.25·cm − 5·age + 5
 *                         women 10·kg + 6.25·cm − 5·age − 161
 *   Revised Harris-Benedict (Roza & Shizgal, 1984)
 *                         men   88.362 + 13.397·kg + 4.799·cm − 5.677·age
 *                         women 447.593 + 9.247·kg + 3.098·cm − 4.330·age
 *   Katch-McArdle         370 + 21.6 · lean body mass, LBM = kg · (1 − bodyFat%/100)
 *
 * Katch-McArdle uses no height and no age: it works from lean mass, so it needs a body-fat
 * percentage instead. That is why it is the only one that can be asked for and refused.
 */

export type Sex = 'male' | 'female';
export type UnitSystem = 'metric' | 'imperial';

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

/** Energy in kilojoules per dietary Calorie (kcal). */
export const KJ_PER_KCAL = 4.184;

export type BmrFormula = 'mifflin' | 'harris-benedict' | 'katch-mcardle';

/** The three equations, in the order the settings panel offers them. */
export const BMR_FORMULAS: { value: BmrFormula; label: string }[] = [
  { value: 'mifflin', label: 'Mifflin St Jeor' },
  { value: 'harris-benedict', label: 'Revised Harris-Benedict' },
  { value: 'katch-mcardle', label: 'Katch-McArdle' },
];

/** The one equation that needs a body-fat percentage rather than height and age. */
export function needsBodyFat(formula: BmrFormula): boolean {
  return formula === 'katch-mcardle';
}

/** The age span the calculator accepts, matching the reference's "ages 15 - 80". */
export const BMR_AGE_MIN = 15;
export const BMR_AGE_MAX = 80;

/** Mifflin-St Jeor BMR from metric inputs. */
export function mifflinStJeorBMR(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

/** Revised Harris-Benedict (Roza & Shizgal, 1984) BMR from metric inputs. */
export function revisedHarrisBenedictBMR(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return sex === 'male'
    ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
    : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
}

/**
 * Katch-McArdle BMR from weight and body-fat percentage. Sex, height and age do not appear:
 * the equation works from lean mass, which is the point of it.
 */
export function katchMcArdleBMR(weightKg: number, bodyFatPct: number): number {
  const lean = weightKg * (1 - bodyFatPct / 100);
  return 370 + 21.6 * lean;
}

/**
 * The chosen equation, unrounded. Returns NaN rather than a number built from an input the
 * equation cannot use — Katch-McArdle without a usable body-fat percentage has no answer.
 */
export function bmrFor(
  formula: BmrFormula,
  sex: Sex,
  weightKg: number,
  heightCm: number,
  age: number,
  bodyFatPct?: number,
): number {
  if (formula === 'katch-mcardle') {
    if (bodyFatPct === undefined || !Number.isFinite(bodyFatPct) || bodyFatPct < 0 || bodyFatPct >= 100) {
      return Number.NaN;
    }
    return katchMcArdleBMR(weightKg, bodyFatPct);
  }
  return formula === 'harris-benedict'
    ? revisedHarrisBenedictBMR(sex, weightKg, heightCm, age)
    : mifflinStJeorBMR(sex, weightKg, heightCm, age);
}

/** Calories (kcal) → the visitor's chosen result unit. */
export function toResultUnit(kcal: number, unit: 'kcal' | 'kj'): number {
  return unit === 'kj' ? kcal * KJ_PER_KCAL : kcal;
}

export interface BmrInput {
  sex: Sex;
  age: number;
  system: UnitSystem;
  heightCm?: number;
  weightKg?: number;
  heightFt?: number;
  heightIn?: number;
  weightLb?: number;
  /** Defaults to Mifflin-St Jeor, the equation this module has always used. */
  formula?: BmrFormula;
  /** Only read by Katch-McArdle. */
  bodyFatPct?: number;
}

/** Normalise mixed-unit body metrics to metric (kg, cm). */
export function toMetricBody(input: BmrInput): { kg: number; cm: number } {
  if (input.system === 'imperial') {
    return {
      kg: (input.weightLb || 0) / LB_PER_KG,
      cm: ((input.heightFt || 0) * 12 + (input.heightIn || 0)) * CM_PER_IN,
    };
  }
  return { kg: input.weightKg || 0, cm: input.heightCm || 0 };
}

export function calculateBmr(input: BmrInput): { bmr: number } {
  const { kg, cm } = toMetricBody(input);
  const age = input.age || 0;
  if (kg <= 0 || cm <= 0 || age <= 0) return { bmr: NaN };
  const raw = bmrFor(input.formula ?? 'mifflin', input.sex, kg, cm, age, input.bodyFatPct);
  return { bmr: Number.isFinite(raw) ? Math.round(raw) : Number.NaN };
}

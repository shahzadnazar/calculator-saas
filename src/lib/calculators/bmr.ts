/**
 * Basal Metabolic Rate (Mifflin-St Jeor). Pure and unit-tested.
 * The core formula lives here and is reused by the calorie/TDEE calculator.
 *
 *   men:   10·kg + 6.25·cm − 5·age + 5
 *   women: 10·kg + 6.25·cm − 5·age − 161
 */

export type Sex = 'male' | 'female';
export type UnitSystem = 'metric' | 'imperial';

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

/** Mifflin-St Jeor BMR from metric inputs. */
export function mifflinStJeorBMR(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
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
  return { bmr: Math.round(mifflinStJeorBMR(input.sex, kg, cm, age)) };
}

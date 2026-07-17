/**
 * Daily calorie needs via the Mifflin-St Jeor equation (BMR) × activity level,
 * with common goal adjustments. Pure and unit-tested.
 *
 * BMR (Mifflin-St Jeor):
 *   men:   10·kg + 6.25·cm − 5·age + 5
 *   women: 10·kg + 6.25·cm − 5·age − 161
 */

export type Sex = 'male' | 'female';
export type UnitSystem = 'metric' | 'imperial';

export interface CalorieInput {
  sex: Sex;
  age: number;
  system: UnitSystem;
  heightCm?: number;
  weightKg?: number;
  heightFt?: number;
  heightIn?: number;
  weightLb?: number;
  activity: number; // multiplier, e.g. 1.2 sedentary ... 1.9 very active
}

export interface CalorieResult {
  bmr: number;
  maintenance: number;
  mildLoss: number; // -250 kcal (~0.25 kg/week)
  loss: number; // -500 kcal (~0.5 kg/week)
  mildGain: number; // +250
  gain: number; // +500
}

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Sedentary (little or no exercise)' },
  { value: 1.375, label: 'Light (exercise 1–3 days/week)' },
  { value: 1.55, label: 'Moderate (exercise 3–5 days/week)' },
  { value: 1.725, label: 'Active (exercise 6–7 days/week)' },
  { value: 1.9, label: 'Very active (hard exercise / physical job)' },
] as const;

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

export function calculateCalories(input: CalorieInput): CalorieResult {
  let kg: number;
  let cm: number;
  if (input.system === 'imperial') {
    kg = (input.weightLb || 0) / LB_PER_KG;
    cm = ((input.heightFt || 0) * 12 + (input.heightIn || 0)) * CM_PER_IN;
  } else {
    kg = input.weightKg || 0;
    cm = input.heightCm || 0;
  }
  const age = input.age || 0;

  if (kg <= 0 || cm <= 0 || age <= 0) {
    return { bmr: NaN, maintenance: NaN, mildLoss: NaN, loss: NaN, mildGain: NaN, gain: NaN };
  }

  const base = 10 * kg + 6.25 * cm - 5 * age;
  const bmr = input.sex === 'male' ? base + 5 : base - 161;
  const maintenance = bmr * (input.activity || 1.2);

  const round = (v: number) => Math.round(v);
  return {
    bmr: round(bmr),
    maintenance: round(maintenance),
    mildLoss: round(maintenance - 250),
    loss: round(maintenance - 500),
    mildGain: round(maintenance + 250),
    gain: round(maintenance + 500),
  };
}

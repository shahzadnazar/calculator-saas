/**
 * Daily calorie needs = BMR (Mifflin-St Jeor) × activity level, with common
 * goal adjustments. Pure and unit-tested. The BMR formula + unit handling are
 * shared with the BMR calculator via src/lib/calculators/bmr.ts.
 */
import { mifflinStJeorBMR, toMetricBody, type Sex, type UnitSystem } from '@lib/calculators/bmr';

export type { Sex, UnitSystem };

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

// The activity multipliers are a shared health-domain constant (R7B.1). Re-exported
// here so existing `@lib/calculators/calorie` importers are unchanged; the values,
// labels and output are identical.
export { ACTIVITY_LEVELS, type ActivityLevel } from '../health/activity-levels';

export function calculateCalories(input: CalorieInput): CalorieResult {
  const { kg, cm } = toMetricBody(input);
  const age = input.age || 0;

  if (kg <= 0 || cm <= 0 || age <= 0) {
    return { bmr: NaN, maintenance: NaN, mildLoss: NaN, loss: NaN, mildGain: NaN, gain: NaN };
  }

  const bmr = mifflinStJeorBMR(input.sex, kg, cm, age);
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

/**
 * Ideal body weight via four established formulas, plus a healthy-BMI range.
 * Pure and unit-tested. All formulas take height over 5 ft (60 in).
 */

export type Sex = 'male' | 'female';
export type UnitSystem = 'metric' | 'imperial';

export interface IdealWeightInput {
  sex: Sex;
  system: UnitSystem;
  heightCm?: number;
  heightFt?: number;
  heightIn?: number;
}

export interface IdealWeightResult {
  unit: 'kg' | 'lb';
  robinson: number;
  miller: number;
  devine: number;
  hamwi: number;
  /** Healthy weight range from BMI 18.5–24.9. */
  bmiMin: number;
  bmiMax: number;
}

const CM_PER_IN = 2.54;
const LB_PER_KG = 2.2046226218;

export function calculateIdealWeight(input: IdealWeightInput): IdealWeightResult {
  const heightCm =
    input.system === 'imperial'
      ? ((input.heightFt || 0) * 12 + (input.heightIn || 0)) * CM_PER_IN
      : input.heightCm || 0;
  const inches = heightCm / CM_PER_IN;
  const over60 = Math.max(0, inches - 60);
  const male = input.sex === 'male';
  const toUnit = (kg: number) => (input.system === 'imperial' ? kg * LB_PER_KG : kg);
  const round = (v: number) => Math.round(v * 10) / 10;

  const meters = heightCm / 100;
  const bmiMinKg = 18.5 * meters * meters;
  const bmiMaxKg = 24.9 * meters * meters;

  if (heightCm <= 0) {
    return { unit: input.system === 'imperial' ? 'lb' : 'kg', robinson: NaN, miller: NaN, devine: NaN, hamwi: NaN, bmiMin: NaN, bmiMax: NaN };
  }

  return {
    unit: input.system === 'imperial' ? 'lb' : 'kg',
    robinson: round(toUnit((male ? 52 : 49) + (male ? 1.9 : 1.7) * over60)),
    miller: round(toUnit((male ? 56.2 : 53.1) + (male ? 1.41 : 1.36) * over60)),
    devine: round(toUnit((male ? 50 : 45.5) + 2.3 * over60)),
    hamwi: round(toUnit((male ? 48 : 45.5) + (male ? 2.7 : 2.2) * over60)),
    bmiMin: round(toUnit(bmiMinKg)),
    bmiMax: round(toUnit(bmiMaxKg)),
  };
}

/**
 * Body Mass Index (WHO adult classification). Pure and unit-tested.
 * BMI = weight(kg) / height(m)^2. Healthy range = BMI 18.5–24.9.
 */

export type UnitSystem = 'metric' | 'imperial';
export type BmiCategory = 'Underweight' | 'Normal weight' | 'Overweight' | 'Obesity';
export type BmiSeverity = 'low' | 'normal' | 'high' | 'danger';

export interface BmiInput {
  system: UnitSystem;
  heightCm?: number; // metric
  weightKg?: number; // metric
  heightFt?: number; // imperial
  heightIn?: number; // imperial
  weightLb?: number; // imperial
}

export interface BmiResult {
  bmi: number;
  category: BmiCategory;
  severity: BmiSeverity;
  /** Healthy weight range for the given height, in the user's unit system. */
  healthyMin: number;
  healthyMax: number;
  unitLabel: string; // 'kg' | 'lb'
}

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

export function classifyBmi(bmi: number): { category: BmiCategory; severity: BmiSeverity } {
  if (bmi < 18.5) return { category: 'Underweight', severity: 'low' };
  if (bmi < 25) return { category: 'Normal weight', severity: 'normal' };
  if (bmi < 30) return { category: 'Overweight', severity: 'high' };
  return { category: 'Obesity', severity: 'danger' };
}

export function calculateBmi(input: BmiInput): BmiResult {
  let heightM: number;
  let weightKg: number;
  let unitLabel: string;

  if (input.system === 'imperial') {
    const totalInches = (input.heightFt || 0) * 12 + (input.heightIn || 0);
    heightM = (totalInches * CM_PER_IN) / 100;
    weightKg = (input.weightLb || 0) / LB_PER_KG;
    unitLabel = 'lb';
  } else {
    heightM = (input.heightCm || 0) / 100;
    weightKg = input.weightKg || 0;
    unitLabel = 'kg';
  }

  if (heightM <= 0 || weightKg <= 0) {
    return {
      bmi: NaN,
      category: 'Normal weight',
      severity: 'normal',
      healthyMin: NaN,
      healthyMax: NaN,
      unitLabel,
    };
  }

  const bmi = weightKg / (heightM * heightM);
  const { category, severity } = classifyBmi(bmi);

  // Healthy weight range for this height (BMI 18.5–24.9), in kg then converted.
  const minKg = 18.5 * heightM * heightM;
  const maxKg = 24.9 * heightM * heightM;
  const healthyMin = input.system === 'imperial' ? minKg * LB_PER_KG : minKg;
  const healthyMax = input.system === 'imperial' ? maxKg * LB_PER_KG : maxKg;

  return {
    bmi: Math.round(bmi * 10) / 10,
    category,
    severity,
    healthyMin: Math.round(healthyMin * 10) / 10,
    healthyMax: Math.round(healthyMax * 10) / 10,
    unitLabel,
  };
}

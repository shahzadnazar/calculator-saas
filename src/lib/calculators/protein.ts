/**
 * Daily protein needs based on body weight and activity/goal.
 * Pure and unit-tested. Factors are grams of protein per kg of body weight.
 */

export type UnitSystem = 'metric' | 'imperial';

export interface ProteinGoal {
  key: string;
  label: string;
  factor: number; // g protein per kg
}

export const PROTEIN_GOALS: readonly ProteinGoal[] = [
  { key: 'sedentary', label: 'Sedentary (minimal exercise)', factor: 0.8 },
  { key: 'active', label: 'Active / general fitness', factor: 1.2 },
  { key: 'endurance', label: 'Endurance athlete', factor: 1.4 },
  { key: 'strength', label: 'Strength training / muscle gain', factor: 1.8 },
  { key: 'cutting', label: 'Preserving muscle while dieting', factor: 2.2 },
] as const;

const LB_PER_KG = 2.2046226218;

export interface ProteinInput {
  system: UnitSystem;
  weightKg?: number;
  weightLb?: number;
  goalKey: string;
}

export interface ProteinResult {
  grams: number;
  perGoal: { key: string; label: string; grams: number }[];
}

export function calculateProtein(input: ProteinInput): ProteinResult {
  const kg = input.system === 'imperial' ? (input.weightLb || 0) / LB_PER_KG : input.weightKg || 0;
  const perGoal = PROTEIN_GOALS.map((g) => ({
    key: g.key,
    label: g.label,
    grams: kg > 0 ? Math.round(kg * g.factor) : NaN,
  }));
  const selected = perGoal.find((g) => g.key === input.goalKey) ?? perGoal[0];
  return { grams: selected.grams, perGoal };
}

/**
 * Recommended daily fat intake from a calorie target, using the Acceptable
 * Macronutrient Distribution Range (20–35% of calories). Fat = 9 kcal/g.
 * Pure and unit-tested.
 */
export interface FatIntakeResult {
  minGrams: number; // 20% of calories
  moderateGrams: number; // ~27.5%
  maxGrams: number; // 35% of calories
}

const KCAL_PER_GRAM_FAT = 9;

export function calculateFatIntake(calories: number): FatIntakeResult {
  const cal = Math.max(0, calories || 0);
  const grams = (pct: number) => Math.round((cal * pct) / 100 / KCAL_PER_GRAM_FAT);
  return {
    minGrams: grams(20),
    moderateGrams: grams(27.5),
    maxGrams: grams(35),
  };
}

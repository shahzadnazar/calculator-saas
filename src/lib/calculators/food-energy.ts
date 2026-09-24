/**
 * Food energy conversion. Pure and unit-tested.
 *
 * Small, factor-based, and deliberately its own module rather than a category in
 * `conversion.ts`: adding an energy category there would put it in the general converter
 * and in every "Other Units" panel on the site, which is not what any of them is for.
 *
 * The unit list names the two calorie definitions explicitly, because they differ and the
 * difference is the whole reason people get confused:
 *
 *   - the International Table calorie is 4.1868 J, and the dietary "Calorie" (kcal) that
 *     appears on food labels is 1,000 of those — 4,186.8 J;
 *   - the thermochemical calorie is 4.184 J.
 *
 * They are 0.07% apart, so nothing turns on it in a kitchen, but a converter that silently
 * picked one and called it "calories" would be hiding a real distinction. Naming both is
 * also why this module can sit beside the BMR calculator's kilojoule option, which uses the
 * thermochemical constant, without the two contradicting each other.
 */
export interface FoodEnergyUnit {
  key: string;
  label: string;
  /** Joules in one of this unit. */
  toJoules: number;
}

export const FOOD_ENERGY_UNITS: readonly FoodEnergyUnit[] = [
  { key: 'kcal', label: 'Calorie [Nutritional, kcal]', toJoules: 4186.8 },
  { key: 'cal-it', label: 'Calorie [International Table, cal]', toJoules: 4.1868 },
  { key: 'cal-th', label: 'Calorie [Thermochemical, cal]', toJoules: 4.184 },
  { key: 'kj', label: 'Kilojoules [kJ]', toJoules: 1000 },
  { key: 'j', label: 'Joules [J]', toJoules: 1 },
  { key: 'kwh', label: 'Kilowatt-hours [kWh]', toJoules: 3_600_000 },
  { key: 'btu', label: 'British thermal units [BTU]', toJoules: 1055.05585262 },
] as const;

export const DEFAULT_FOOD_ENERGY_FROM = 'kcal';
export const DEFAULT_FOOD_ENERGY_TO = 'kj';

export function foodEnergyUnit(key: string): FoodEnergyUnit | undefined {
  return FOOD_ENERGY_UNITS.find((u) => u.key === key);
}

/**
 * Convert between two food-energy units. Returns NaN rather than a number for an unknown
 * unit or a non-finite input, so a caller can never print a figure it did not compute.
 */
export function convertFoodEnergy(value: number, fromKey: string, toKey: string): number {
  const from = foodEnergyUnit(fromKey);
  const to = foodEnergyUnit(toKey);
  if (!from || !to || !Number.isFinite(value)) return Number.NaN;
  return (value * from.toJoules) / to.toJoules;
}

/**
 * The converted value as the reference prints it: up to six decimals, with trailing zeros
 * dropped, so 1 Calorie reads "4.1868" rather than "4.186800".
 */
export function formatFoodEnergy(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 1e6) / 1e6;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(rounded);
}

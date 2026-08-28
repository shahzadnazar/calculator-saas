/**
 * Daily protein needs. Pure and unit-tested.
 *
 * The reference asks for age, gender, height, weight and activity, and hides a BMR-equation
 * choice behind Settings — which only makes sense because it reports protein on TWO bases,
 * not one. Body weight gives grams per kilogram; total energy gives a share of the calories
 * you actually burn, and that second basis is what needs height, activity and the equation.
 *
 * Every figure below comes from a stated recommendation, none is invented:
 *
 *   - 0.8 g/kg is the recommended dietary allowance (RDA) for adults;
 *   - 0.8–1.8 g/kg is the range the recommendation spans once activity and goals are
 *     accounted for;
 *   - 1.8–2.0 g/kg is what is generally suggested for the highly active;
 *   - 10–35% of total calories is the Acceptable Macronutrient Distribution Range (AMDR),
 *     converted at protein's 4 Calories per gram.
 *
 * The BMR itself and its three equations are shared with the BMR and calorie calculators
 * via `bmr.ts`; the activity bands come from the shared `@lib/health/activity-levels`, so
 * the same activity is worth the same number on every page that asks for one.
 */
import { bmrFor, toMetricBody, type BmrFormula, type BmrInput, type Sex, type UnitSystem } from './bmr';
import { ACTIVITY_BANDS, DEFAULT_ACTIVITY } from '../health/activity-levels';

export type { Sex, UnitSystem };
export { ACTIVITY_BANDS, DEFAULT_ACTIVITY, type ActivityLevel } from '../health/activity-levels';

/** The reference accepts adults only — the recommendations behind it are adult ones. */
export const PROTEIN_AGE_MIN = 18;
export const PROTEIN_AGE_MAX = 80;

/** Protein carries 4 Calories per gram. */
export const KCAL_PER_GRAM_PROTEIN = 4;

/** The recommended dietary allowance, in grams per kilogram of body weight. */
export const RDA_G_PER_KG = 0.8;

/** The Acceptable Macronutrient Distribution Range for protein, as a share of calories. */
export const AMDR_MIN_PCT = 10;
export const AMDR_MAX_PCT = 35;

export interface ProteinInput extends Omit<BmrInput, 'formula'> {
  /** Activity multiplier, e.g. 1.2 sedentary … 1.9 extra active. */
  activity: number;
  /** Defaults to Mifflin-St Jeor, as the reference does. */
  formula?: BmrFormula;
}

/** One row of the report: what the figure is based on, and the figure itself. */
export interface ProteinBasis {
  key: string;
  label: string;
  /** How the basis is stated — "0.8 g/kg", "10-35% of Calories". */
  basis: string;
  /** Grams per day. When `high` is present the row is a range. */
  low: number;
  high?: number;
}

export interface ProteinResult {
  bmr: number;
  /** TDEE = BMR × activity — the calorie base the percentage row is a share of. */
  calories: number;
  /** Body weight in kilograms, the base the g/kg rows are a multiple of. */
  weightKg: number;
  /** The RDA figure: the single number the whole report is anchored on. */
  rda: number;
  /** Every row, in the order they are shown. */
  bases: ProteinBasis[];
}

const EMPTY: ProteinResult = {
  bmr: Number.NaN,
  calories: Number.NaN,
  weightKg: Number.NaN,
  rda: Number.NaN,
  bases: [],
};

/** grams = kg × g/kg, rounded. */
export function gramsFromWeight(weightKg: number, gPerKg: number): number {
  return Math.round(weightKg * gPerKg);
}

/** grams = (calories × share) ÷ 4, rounded. */
export function gramsFromCalories(calories: number, percent: number): number {
  // Multiply BEFORE dividing: `percent / 100` is not exact in binary, so 2610 × 0.35 comes
  // out as 913.4999999999999 and a figure sitting exactly on a rounding boundary falls the
  // wrong way. 2610 × 35 is an integer, and 91350 / 100 / 9 lands on 101.5 as it should.
  return Math.round((calories * percent) / 100 / KCAL_PER_GRAM_PROTEIN);
}

export function calculateProtein(input: ProteinInput): ProteinResult {
  const { kg, cm } = toMetricBody(input);
  const age = input.age || 0;
  if (kg <= 0 || cm <= 0 || age <= 0) return EMPTY;

  const rawBmr = bmrFor(input.formula ?? 'mifflin', input.sex, kg, cm, age, input.bodyFatPct);
  if (!Number.isFinite(rawBmr)) return EMPTY;

  const activity = ACTIVITY_BANDS.some((b) => b.value === input.activity) ? input.activity : DEFAULT_ACTIVITY;
  const calories = Math.round(rawBmr * activity);

  const bases: ProteinBasis[] = [
    {
      key: 'rda',
      label: 'Recommended dietary allowance',
      basis: `${RDA_G_PER_KG} g/kg`,
      low: gramsFromWeight(kg, RDA_G_PER_KG),
    },
    {
      key: 'range',
      label: 'Recommended range',
      basis: '0.8 - 1.8 g/kg',
      low: gramsFromWeight(kg, 0.8),
      high: gramsFromWeight(kg, 1.8),
    },
    {
      key: 'highly-active',
      label: 'Highly active',
      basis: '1.8 - 2 g/kg',
      low: gramsFromWeight(kg, 1.8),
      high: gramsFromWeight(kg, 2),
    },
    {
      key: 'amdr',
      label: 'Share of your daily Calories',
      basis: `${AMDR_MIN_PCT} - ${AMDR_MAX_PCT}% of Calories`,
      low: gramsFromCalories(calories, AMDR_MIN_PCT),
      high: gramsFromCalories(calories, AMDR_MAX_PCT),
    },
  ];

  return {
    bmr: Math.round(rawBmr),
    calories,
    weightKg: kg,
    rda: bases[0].low,
    bases,
  };
}

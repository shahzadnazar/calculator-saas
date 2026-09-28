/**
 * Recommended daily fat intake. Pure and unit-tested.
 *
 * The reference asks for age, gender, height, weight and activity, and hides a BMR-equation
 * choice behind Settings, because every figure it reports is a share of the Calories the
 * visitor actually burns — not a function of body weight. That is the whole model: work out
 * the daily calorie need, then take the recommended shares of it at fat's 9 Calories per
 * gram.
 *
 * Every share below is a stated recommendation, none is invented:
 *
 *   - 20-35% of Calories is the Acceptable Macronutrient Distribution Range for total fat;
 *   - under 10% of Calories is the Dietary Guidelines' cap on saturated fat;
 *   - under 6% of Calories is the American Heart Association's tighter cap, for people
 *     lowering cholesterol;
 *   - trans fat has no recommended level at all, which is why it is a note and not a row.
 *
 * The BMR and its three equations are shared with the BMR, calorie and protein calculators
 * via `bmr.ts`; the activity bands come from the shared `@lib/health/activity-levels`, so
 * the same activity is worth the same number on every page that asks for one.
 */
import { bmrFor, toMetricBody, type BmrFormula, type BmrInput, type Sex, type UnitSystem } from './bmr';
import { ACTIVITY_BANDS, DEFAULT_ACTIVITY } from '../health/activity-levels';

export type { Sex, UnitSystem };
export { ACTIVITY_BANDS, DEFAULT_ACTIVITY, type ActivityLevel } from '../health/activity-levels';

/** The reference accepts adults only — the recommendations behind it are adult ones. */
export const FAT_AGE_MIN = 18;
export const FAT_AGE_MAX = 80;

/** Fat carries 9 Calories per gram — the reason a gram of it goes further than protein. */
export const KCAL_PER_GRAM_FAT = 9;

/** The Acceptable Macronutrient Distribution Range for total fat. */
export const AMDR_MIN_PCT = 20;
export const AMDR_MAX_PCT = 35;

/** The two published caps on saturated fat, as a share of Calories. */
export const SATURATED_GUIDELINES_PCT = 10;
export const SATURATED_AHA_PCT = 6;

export interface FatIntakeInput extends Omit<BmrInput, 'formula'> {
  /** Activity multiplier, e.g. 1.2 sedentary … 1.9 extra active. */
  activity: number;
  /** Defaults to Mifflin-St Jeor, as the reference does. */
  formula?: BmrFormula;
}

/** One row of the report: what it is, the share it is, and the grams that come to. */
export interface FatBasis {
  key: string;
  label: string;
  /** How the share is stated — "20 - 35% of Calories", "up to 10% of Calories". */
  basis: string;
  /** Grams per day. When `high` is present the row is a range; otherwise it is a ceiling. */
  low: number;
  high?: number;
  /** A ceiling row reads "up to N", not "N". */
  ceiling: boolean;
}

export interface FatIntakeResult {
  bmr: number;
  /** TDEE = BMR × activity — the calorie base every row is a share of. */
  calories: number;
  /** The total-fat range: the headline, in grams per day. */
  totalLow: number;
  totalHigh: number;
  /** Every row, in the order they are shown. */
  bases: FatBasis[];
}

const EMPTY: FatIntakeResult = {
  bmr: Number.NaN,
  calories: Number.NaN,
  totalLow: Number.NaN,
  totalHigh: Number.NaN,
  bases: [],
};

/** grams = (calories × share) ÷ 9, rounded. */
export function gramsFromCalories(calories: number, percent: number): number {
  // Multiply BEFORE dividing: `percent / 100` is not exact in binary, so 2610 × 0.35 comes
  // out as 913.4999999999999 and a figure sitting exactly on a rounding boundary falls the
  // wrong way. 2610 × 35 is an integer, and 91350 / 100 / 9 lands on 101.5 as it should.
  return Math.round((calories * percent) / 100 / KCAL_PER_GRAM_FAT);
}

export function calculateFatIntake(input: FatIntakeInput): FatIntakeResult {
  const { kg, cm } = toMetricBody(input);
  const age = input.age || 0;
  if (kg <= 0 || cm <= 0 || age <= 0) return EMPTY;

  const rawBmr = bmrFor(input.formula ?? 'mifflin', input.sex, kg, cm, age, input.bodyFatPct);
  if (!Number.isFinite(rawBmr)) return EMPTY;

  const activity = ACTIVITY_BANDS.some((b) => b.value === input.activity) ? input.activity : DEFAULT_ACTIVITY;
  const calories = Math.round(rawBmr * activity);

  const totalLow = gramsFromCalories(calories, AMDR_MIN_PCT);
  const totalHigh = gramsFromCalories(calories, AMDR_MAX_PCT);

  const bases: FatBasis[] = [
    {
      key: 'total',
      label: 'Total fat',
      basis: `${AMDR_MIN_PCT} - ${AMDR_MAX_PCT}% of Calories`,
      low: totalLow,
      high: totalHigh,
      ceiling: false,
    },
    {
      key: 'saturated-guidelines',
      label: 'Saturated fat, Dietary Guidelines',
      basis: `under ${SATURATED_GUIDELINES_PCT}% of Calories`,
      low: gramsFromCalories(calories, SATURATED_GUIDELINES_PCT),
      ceiling: true,
    },
    {
      key: 'saturated-aha',
      label: 'Saturated fat, American Heart Association',
      basis: `under ${SATURATED_AHA_PCT}% of Calories`,
      low: gramsFromCalories(calories, SATURATED_AHA_PCT),
      ceiling: true,
    },
  ];

  return { bmr: Math.round(rawBmr), calories, totalLow, totalHigh, bases };
}

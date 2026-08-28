/**
 * Daily calorie needs — the reference's report. Pure and unit-tested.
 *
 * TDEE = BMR × activity, then seven guideline targets around it: maintain, three rates of
 * loss and three of gain. The BMR itself, the three equations behind it and the unit
 * handling are shared with the BMR calculator via `bmr.ts`; the activity bands come from
 * the shared `@lib/health/activity-levels`, so the same activity is worth the same number
 * on both pages.
 *
 * The rates are stated in weight per week and applied as a fixed daily calorie delta:
 * 250 kcal/day for the mild rate, 500 for the standard one, 1000 for the extreme one. That
 * is the long-standing "3,500 kcal ≈ 1 lb" convention, which is why the same three deltas
 * are labelled 0.5/1/2 lb per week in US units and 0.25/0.5/1 kg per week in metric — the
 * two labellings are the same arithmetic, not two different models.
 */
import { bmrFor, toMetricBody, type BmrFormula, type BmrInput, type Sex, type UnitSystem } from './bmr';
import { ACTIVITY_BANDS, DEFAULT_ACTIVITY } from '../health/activity-levels';

export type { Sex, UnitSystem };
export { ACTIVITY_BANDS, DEFAULT_ACTIVITY, type ActivityLevel } from '../health/activity-levels';

/** Below this, the reference tells the visitor to involve a doctor. */
export const MINIMUM_DAILY_CALORIES = 1500;

export interface CalorieInput extends Omit<BmrInput, 'formula'> {
  /** Activity multiplier, e.g. 1.2 sedentary … 1.9 extra active. */
  activity: number;
  /** Defaults to Mifflin-St Jeor, as the reference does. */
  formula?: BmrFormula;
}

/** One guideline row: what it is called, how far it sits from maintenance, and at what rate. */
export interface CalorieGoalRow {
  key: string;
  /** "Maintain weight", "Mild weight loss", … */
  label: string;
  /** The rate under the label, in each unit system. Empty for "Maintain weight". */
  rateMetric: string;
  rateImperial: string;
  /** Daily calorie delta from maintenance. Negative loses weight. */
  delta: number;
  /** Which half of the report this row belongs to. */
  direction: 'maintain' | 'loss' | 'gain';
}

/**
 * The seven rows, in the reference's order. Loss is shown first and gain is behind a
 * disclosure, because the visitor who wants to gain is the rarer one — but both halves are
 * the same three deltas, mirrored.
 */
export const CALORIE_GOAL_ROWS: readonly CalorieGoalRow[] = [
  { key: 'maintain', label: 'Maintain weight', rateMetric: '', rateImperial: '', delta: 0, direction: 'maintain' },
  { key: 'mild-loss', label: 'Mild weight loss', rateMetric: '0.25 kg/week', rateImperial: '0.5 lb/week', delta: -250, direction: 'loss' },
  { key: 'loss', label: 'Weight loss', rateMetric: '0.5 kg/week', rateImperial: '1 lb/week', delta: -500, direction: 'loss' },
  { key: 'extreme-loss', label: 'Extreme weight loss', rateMetric: '1 kg/week', rateImperial: '2 lb/week', delta: -1000, direction: 'loss' },
  { key: 'mild-gain', label: 'Mild weight gain', rateMetric: '0.25 kg/week', rateImperial: '0.5 lb/week', delta: 250, direction: 'gain' },
  { key: 'gain', label: 'Weight gain', rateMetric: '0.5 kg/week', rateImperial: '1 lb/week', delta: 500, direction: 'gain' },
  { key: 'fast-gain', label: 'Fast weight gain', rateMetric: '1 kg/week', rateImperial: '2 lb/week', delta: 1000, direction: 'gain' },
] as const;

export interface CalorieGoalValue extends CalorieGoalRow {
  /** Daily calories for this row, rounded. */
  calories: number;
  /** Share of maintenance, rounded to a whole percent. */
  percent: number;
}

/**
 * A zigzag week: seven days that average to the target but do not all equal it.
 *
 * Two schedules, as the reference describes them — one with two higher days and five
 * lower, one that moves gradually — and BOTH sum to exactly seven times the target, so
 * cycling never quietly changes the weekly total. The offsets are ours: they keep the
 * high-to-low gap inside the 200–300 calorie band the method is usually described with,
 * and they are integers, so the week adds up exactly rather than to within a rounding error.
 */
export interface ZigzagSchedule {
  key: string;
  title: string;
  /** Sunday-first daily calories. */
  days: { day: string; calories: number }[];
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Two higher days at the weekend, five lower ones: +200 ×2, −80 ×5 — nets to zero. */
const ZIGZAG_WEEKEND = [200, -80, -80, -80, -80, -80, 200];
/** A gradual rise and fall across the week: +150 … −150 … +75 — also nets to zero. */
const ZIGZAG_GRADUAL = [150, 75, 0, -75, -150, -75, 75];

export function zigzagSchedules(target: number): ZigzagSchedule[] {
  if (!Number.isFinite(target)) return [];
  const build = (key: string, title: string, offsets: number[]): ZigzagSchedule => ({
    key,
    title,
    days: WEEKDAYS.map((day, i) => ({ day, calories: Math.round(target) + offsets[i] })),
  });
  return [
    build('weekend', 'Two higher days, five lower', ZIGZAG_WEEKEND),
    build('gradual', 'A gradual rise and fall', ZIGZAG_GRADUAL),
  ];
}

export interface CalorieResult {
  bmr: number;
  /** TDEE = BMR × activity. The 100% row. */
  maintenance: number;
  /** All seven rows, valued. */
  goals: CalorieGoalValue[];
  /** Both zigzag schedules, built on maintenance. */
  zigzag: ZigzagSchedule[];
  /** Whether the extreme-loss row falls below the minimum the reference warns about. */
  belowMinimum: boolean;
}

const EMPTY: CalorieResult = {
  bmr: Number.NaN,
  maintenance: Number.NaN,
  goals: [],
  zigzag: [],
  belowMinimum: false,
};

export function calculateCalories(input: CalorieInput): CalorieResult {
  const { kg, cm } = toMetricBody(input);
  const age = input.age || 0;
  if (kg <= 0 || cm <= 0 || age <= 0) return EMPTY;

  const rawBmr = bmrFor(input.formula ?? 'mifflin', input.sex, kg, cm, age, input.bodyFatPct);
  if (!Number.isFinite(rawBmr)) return EMPTY;

  const activity = ACTIVITY_BANDS.some((b) => b.value === input.activity) ? input.activity : DEFAULT_ACTIVITY;
  const maintenance = Math.round(rawBmr * activity);

  const goals = CALORIE_GOAL_ROWS.map((row) => {
    const calories = maintenance + row.delta;
    return { ...row, calories, percent: Math.round((calories / maintenance) * 100) };
  });

  const extreme = goals.find((g) => g.key === 'extreme-loss');
  return {
    bmr: Math.round(rawBmr),
    maintenance,
    goals,
    zigzag: zigzagSchedules(maintenance),
    belowMinimum: extreme !== undefined && extreme.calories < MINIMUM_DAILY_CALORIES,
  };
}

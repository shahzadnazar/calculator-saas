/**
 * Physical-activity multipliers — a neutral health-domain constant (R7B.1).
 *
 * These map a Basal Metabolic Rate to estimated Total Daily Energy Expenditure
 * (TDEE = BMR × multiplier). They are shared, not calculator-specific: the calorie
 * calculator offers them as a select, the BMR calculator prints all six as a table, and
 * both must mean the same thing — the same activity can never be worth two different
 * numbers depending on which page you opened. Consumers must treat the result of
 * `BMR × value` as an ESTIMATED DAILY CALORIE NEED (TDEE), never as another BMR.
 *
 * Each band carries two wordings because the two surfaces need different ones: a dropdown
 * names the band ("Moderate: exercise 4-5 times/week"), while a table whose column already
 * says "Activity Level" does not ("Exercise 4-5 times/week").
 */
export interface ActivityLevel {
  /** TDEE multiplier applied to BMR, 1.2 (sedentary) … 1.9 (extra active). */
  readonly value: number;
  /** Row wording, for a table that is already headed "Activity Level". */
  readonly label: string;
  /** Option wording, for a dropdown that must name the band on its own. */
  readonly selectLabel: string;
}

export const ACTIVITY_BANDS: readonly ActivityLevel[] = [
  { value: 1.2, label: 'Sedentary: little or no exercise', selectLabel: 'Sedentary: little or no exercise' },
  { value: 1.375, label: 'Exercise 1-3 times/week', selectLabel: 'Light: exercise 1-3 times/week' },
  { value: 1.465, label: 'Exercise 4-5 times/week', selectLabel: 'Moderate: exercise 4-5 times/week' },
  {
    value: 1.55,
    label: 'Daily exercise or intense exercise 3-4 times/week',
    selectLabel: 'Active: daily exercise or intense exercise 3-4 times/week',
  },
  {
    value: 1.725,
    label: 'Intense exercise 6-7 times/week',
    selectLabel: 'Very Active: intense exercise 6-7 times/week',
  },
  {
    value: 1.9,
    label: 'Very intense exercise daily, or physical job',
    selectLabel: 'Extra Active: very intense exercise daily, or physical job',
  },
] as const;

/** The default band — "Moderate", the middle of the six. */
export const DEFAULT_ACTIVITY = 1.465;

/** The footnotes printed under the calculator, defining the terms the bands use. */
export const ACTIVITY_BAND_NOTES: readonly string[] = [
  'Exercise: 15-30 minutes of elevated heart rate activity.',
  'Intense exercise: 45-120 minutes of elevated heart rate activity.',
  'Very intense exercise: 2+ hours of elevated heart rate activity.',
] as const;

/** The band a multiplier belongs to, or undefined if it is not one of the six. */
export function activityBand(value: number): ActivityLevel | undefined {
  return ACTIVITY_BANDS.find((b) => b.value === value);
}

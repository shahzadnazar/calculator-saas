/**
 * Physical-activity multipliers — a neutral health-domain constant (R7B.1).
 *
 * These map a Basal Metabolic Rate to estimated Total Daily Energy Expenditure
 * (TDEE = BMR × multiplier). They are shared, not calculator-specific: the
 * Calorie calculator uses them for its goal maths and the BMR calculator uses
 * them for its "estimated daily calorie needs" table. The values and labels are
 * the long-standing Mifflin-St Jeor activity factors — unchanged from their
 * previous home in the calorie module. Consumers must treat the result of
 * `BMR × value` as an ESTIMATED DAILY CALORIE NEED (TDEE), never as another BMR.
 */
export interface ActivityLevel {
  /** TDEE multiplier applied to BMR, 1.2 (sedentary) … 1.9 (very active). */
  readonly value: number;
  /** Human label describing the activity band. */
  readonly label: string;
}

export const ACTIVITY_LEVELS: readonly ActivityLevel[] = [
  { value: 1.2, label: 'Sedentary (little or no exercise)' },
  { value: 1.375, label: 'Light (exercise 1–3 days/week)' },
  { value: 1.55, label: 'Moderate (exercise 3–5 days/week)' },
  { value: 1.725, label: 'Active (exercise 6–7 days/week)' },
  { value: 1.9, label: 'Very active (hard exercise / physical job)' },
] as const;

/**
 * The six-band activity table, as the reference product publishes it.
 *
 * `ACTIVITY_LEVELS` above is a five-option SELECT — one activity the visitor picks. This is
 * a six-row TABLE shown all at once, so it is a different shape for a different job, and it
 * carries the reference's own wording rather than the select's.
 *
 * The two agree on every multiplier they share (1.2, 1.375, 1.55, 1.725, 1.9); the table
 * adds one band the select does not offer, 1.465 for exercise 4–5 times a week. A test pins
 * that agreement so the two can never drift into disagreeing about the same activity.
 */
export const ACTIVITY_BANDS: readonly ActivityLevel[] = [
  { value: 1.2, label: 'Sedentary: little or no exercise' },
  { value: 1.375, label: 'Exercise 1-3 times/week' },
  { value: 1.465, label: 'Exercise 4-5 times/week' },
  { value: 1.55, label: 'Daily exercise or intense exercise 3-4 times/week' },
  { value: 1.725, label: 'Intense exercise 6-7 times/week' },
  { value: 1.9, label: 'Very intense exercise daily, or physical job' },
] as const;

/** The footnotes the reference prints under the table, defining its terms. */
export const ACTIVITY_BAND_NOTES: readonly string[] = [
  'Exercise: 15-30 minutes of elevated heart rate activity.',
  'Intense exercise: 45-120 minutes of elevated heart rate activity.',
  'Very intense exercise: 2+ hours of elevated heart rate activity.',
] as const;

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

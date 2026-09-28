/**
 * Body-measurement primitives — neutral, calculator-agnostic (R7B.1).
 *
 * The lowest-level Metric/Imperial arithmetic + imperial-height CLASSIFICATION
 * shared by BMI and BMR (and future personal-health calculators). Deliberately
 * NARROW: only proven numeric conversions and a message-free height classifier
 * live here. Field-error MESSAGES, result rendering, reset policies, medical
 * interpretation and full calculator bindings stay in each calculator — this
 * module never decides wording or UX, only numbers and validity.
 *
 * The conversions are raw (no rounding); callers apply their own display
 * precision (e.g. `round1`) so this module imposes no presentation policy.
 */

export const LB_PER_KG = 2.2046226218;
export const CM_PER_IN = 2.54;

/** Round to one decimal place — the shared display precision for converted fields. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;

/* ---- raw unit conversions ------------------------------------------------ */

export const kilogramsToPounds = (kg: number): number => kg * LB_PER_KG;
export const poundsToKilograms = (lb: number): number => lb / LB_PER_KG;
export const centimetresToTotalInches = (cm: number): number => cm / CM_PER_IN;
export const totalInchesToCentimetres = (inches: number): number => inches * CM_PER_IN;
export const feetAndInchesToTotalInches = (feet: number, inches: number): number => feet * 12 + inches;

/** Whole inches → {feet, inches}. Rounds to the nearest inch first (matches the
 *  established BMI conversion), so 5 ft 11 in ↔ 180 cm stays stable. */
export function totalInchesToFeetAndInches(totalInches: number): { feet: number; inches: number } {
  const t = Math.round(totalInches);
  return { feet: Math.floor(t / 12), inches: t % 12 };
}

/* ---- imperial-height validity (message-free) ----------------------------- */

/** Feet must be a finite, non-negative whole number. */
export const isNonNegativeInteger = (n: number): boolean => Number.isFinite(n) && n >= 0 && Number.isInteger(n);

/** Inches must be finite and 0 ≤ inches < 12 (12+ is invalid, never normalized). */
export const isValidInches = (n: number): boolean => Number.isFinite(n) && n >= 0 && n < 12;

/**
 * Classify a raw feet/inches height pair WITHOUT choosing a message. Each
 * calculator maps the status to its own wording. Semantics match the accepted
 * BMI rules: both empty → `empty`; inches out of 0–11 → `inches-out-of-range`;
 * feet not a non-negative whole number → `feet-not-integer`; total ≤ 0 →
 * `nonpositive`; otherwise `ok`. Check order is fixed so messages are stable.
 */
export type ImperialHeightStatus = 'ok' | 'empty' | 'inches-out-of-range' | 'feet-not-integer' | 'nonpositive';

export function classifyImperialHeight(feetRaw: string, inchesRaw: string): ImperialHeightStatus {
  const ft = feetRaw.trim();
  const inch = inchesRaw.trim();
  if (ft === '' && inch === '') return 'empty';

  const ftNum = ft === '' ? 0 : Number(ft);
  const inNum = inch === '' ? 0 : Number(inch);

  if (inch !== '' && !isValidInches(inNum)) return 'inches-out-of-range';
  if (ft !== '' && !isNonNegativeInteger(ftNum)) return 'feet-not-integer';
  if (feetAndInchesToTotalInches(ftNum, inNum) <= 0) return 'nonpositive';
  return 'ok';
}

/* ------------------------------------------------------------------ */
/* Age                                                                 */
/* ------------------------------------------------------------------ */

/**
 * What is wrong with an age entry, if anything — the same shape as
 * `classifyImperialHeight`, and for the same reason: four calculators ask for an age, they
 * accept different spans (2–80 for ideal weight, 15–80 for BMR and calories, 18–80 for
 * protein), and every one of them wants a whole number of years. The SPAN is the caller's
 * because it is a product decision; the parsing is not, so it lives here once.
 *
 * MESSAGES stay with each calculator per the R7B.1 policy — this returns a status, never
 * prose.
 */
export type AgeStatus = 'ok' | 'empty' | 'not-whole' | 'out-of-range';

export function classifyAge(raw: string, min: number, max: number): AgeStatus {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return 'not-whole';
  if (n < min || n > max) return 'out-of-range';
  return 'ok';
}

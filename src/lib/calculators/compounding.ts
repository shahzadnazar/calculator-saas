/**
 * Compounding frequency — the one primitive every accumulation calculator shares.
 *
 * Savings and Interest both let a visitor choose how often interest is credited, and
 * both then run a month-by-month projection. Rather than each owning its own copy of
 * the frequency list and the conversion, they share this: the list the selectors
 * render, and the single factor a month of growth multiplies a balance by.
 */

/** How often interest is credited. The nine options the frequency selector offers. */
export type CompoundFrequency =
  | 'annually'
  | 'semiannually'
  | 'quarterly'
  | 'monthly'
  | 'semimonthly'
  | 'biweekly'
  | 'weekly'
  | 'daily'
  | 'continuously';

/** Compounding periods per year. Continuous is the limit of this sequence, not a member. */
export const COMPOUND_PERIODS: Readonly<Record<Exclude<CompoundFrequency, 'continuously'>, number>> =
  {
    annually: 1,
    semiannually: 2,
    quarterly: 4,
    monthly: 12,
    semimonthly: 24,
    biweekly: 26,
    weekly: 52,
    daily: 365,
  };

/** Every frequency, in the order the selector renders them. */
export const COMPOUND_FREQUENCIES: readonly CompoundFrequency[] = [
  'annually',
  'semiannually',
  'quarterly',
  'monthly',
  'semimonthly',
  'biweekly',
  'weekly',
  'daily',
  'continuously',
];

/** True when `value` names one of the nine frequencies. */
export function isCompoundFrequency(value: string): value is CompoundFrequency {
  return (COMPOUND_FREQUENCIES as readonly string[]).includes(value);
}

/**
 * The factor one month of growth multiplies a balance by.
 *
 * Reducing every compounding frequency to a monthly factor is the whole trick: a
 * daily-compounded account and an annually-compounded one then differ only in this
 * number, and the projection loop never learns which it is running.
 */
export function monthlyGrowthFactor(annualRatePct: number, compound: CompoundFrequency): number {
  const r = (annualRatePct || 0) / 100;
  if (compound === 'continuously') return Math.exp(r / 12);
  const n = COMPOUND_PERIODS[compound];
  return Math.pow(1 + r / n, n / 12);
}


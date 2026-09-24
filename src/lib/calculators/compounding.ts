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


/* ------------------------------------------------------------------ */
/* Converting a rate between compounding frequencies                   */
/* ------------------------------------------------------------------ */

/**
 * The EFFECTIVE annual rate a nominal rate actually earns at a given compounding
 * frequency, as a fraction. 6% compounded monthly earns 6.16778% a year, because
 * each month's interest starts earning interest of its own.
 */
export function effectiveAnnualRate(nominalPct: number, compound: CompoundFrequency): number {
  const r = (nominalPct || 0) / 100;
  if (compound === 'continuously') return Math.exp(r) - 1;
  const n = COMPOUND_PERIODS[compound];
  return Math.pow(1 + r / n, n) - 1;
}

/**
 * The inverse: the NOMINAL rate (as a percent) that compounds to a given effective
 * annual rate at a frequency. Together with `effectiveAnnualRate` this converts a
 * rate between any two frequencies, because the effective annual rate is the common
 * ground they both reduce to.
 */
export function nominalRateFor(effective: number, compound: CompoundFrequency): number {
  if (compound === 'continuously') return Math.log(1 + effective) * 100;
  const n = COMPOUND_PERIODS[compound];
  return n * (Math.pow(1 + effective, 1 / n) - 1) * 100;
}

/**
 * Convert a rate from one compounding frequency to the equivalent rate at another —
 * two rates that grow money at exactly the same speed.
 *
 * Converting to the SAME frequency returns the rate unchanged rather than routing it
 * through the effective rate and back: the round trip is mathematically an identity
 * but not a floating-point one, and 6% must never come back as 5.999999999999872%.
 */
export function convertCompoundRate(
  nominalPct: number,
  from: CompoundFrequency,
  to: CompoundFrequency,
): number {
  if (!Number.isFinite(nominalPct)) return Number.NaN;
  if (from === to) return nominalPct;
  return nominalRateFor(effectiveAnnualRate(nominalPct, from), to);
}

/**
 * Date math: duration between two dates, and adding/subtracting days.
 * Reuses the tested age breakdown. Pure and unit-tested. UTC throughout.
 */
import { calculateAge, type AgeResult } from '@lib/calculators/age';

const DAY_MS = 86_400_000;

export interface DateDiff {
  totalDays: number; // absolute
  weeks: number;
  breakdown: Pick<AgeResult, 'years' | 'months' | 'days'>;
  direction: 'after' | 'before' | 'same';
}

/** Duration between two dates (order-independent for the breakdown). */
export function diffDates(a: Date, b: Date): DateDiff {
  const earlier = a.getTime() <= b.getTime() ? a : b;
  const later = a.getTime() <= b.getTime() ? b : a;
  const totalDays = Math.round((later.getTime() - earlier.getTime()) / DAY_MS);
  const age = calculateAge(earlier, later);
  return {
    totalDays,
    weeks: Math.floor(totalDays / 7),
    breakdown: { years: age.years, months: age.months, days: age.days },
    direction: totalDays === 0 ? 'same' : b.getTime() >= a.getTime() ? 'after' : 'before',
  };
}

/** Add (or subtract, with a negative value) whole days to a date. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + Math.round(days) * DAY_MS);
}

/** Format a UTC date as YYYY-MM-DD. */
export function toISODateUTC(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

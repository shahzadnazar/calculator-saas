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

export interface DateShift {
  years: number;
  months: number;
  weeks: number;
  days: number;
}

/** Years 0-99 must not be mapped into the 1900s, which the Date constructor does. */
function utcDate(year: number, month: number, day: number): Date {
  const d = new Date(0);
  d.setUTCFullYear(year, month, day);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Shift a date by whole years, months, weeks and days — `sign` 1 to add, -1 to subtract.
 *
 * Years and months are applied first as CALENDAR steps, then weeks and days as fixed lengths,
 * because that is the order the words imply: "a month and a day after January 31" is March 1,
 * not March 2. A month step that would overflow the target month is CLAMPED to its last day, so
 * one month after January 31 is February 28 (or the 29th in a leap year) rather than rolling
 * into March. Clamping is what makes the step reversible in the way people expect, and it is
 * what every calendar does when you page forward a month.
 */
export function shiftDate(date: Date, shift: DateShift, sign: 1 | -1): Date {
  if (!Number.isFinite(date.getTime())) return new Date(Number.NaN);
  const { years, months, weeks, days } = shift;
  if (![years, months, weeks, days].every((n) => Number.isFinite(n))) return new Date(Number.NaN);

  const totalMonths = sign * (Math.round(years) * 12 + Math.round(months));
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + totalMonths;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  // Day 0 of the following month is the last day of this one.
  const lastDay = utcDate(targetYear, targetMonth + 1, 0).getUTCDate();
  const clamped = Math.min(date.getUTCDate(), lastDay);

  const stepped = utcDate(targetYear, targetMonth, clamped);
  return addDays(stepped, sign * (Math.round(weeks) * 7 + Math.round(days)));
}

/**
 * Format a UTC date as YYYY-MM-DD.
 *
 * The year is padded to four digits: an unpadded "51-06-15" is not an ISO date, so a genuine
 * early date would fail the strict round-trip every civil-date field validates with, and be
 * rejected as impossible. Only years below 1000 are affected.
 */
export function toISODateUTC(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

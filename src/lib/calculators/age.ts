/**
 * Exact age / duration between two dates. Pure and unit-tested.
 * Operates on UTC components so results are deterministic and TZ-independent.
 */

export interface AgeResult {
  valid: boolean;
  years: number;
  months: number;
  days: number;
  totalDays: number;
  totalWeeks: number;
  totalMonths: number;
  nextBirthdayInDays: number;
}

const DAY_MS = 86_400_000;

function daysInMonth(year: number, monthIndex0: number): number {
  // monthIndex0: 0=Jan. Day 0 of next month = last day of this month.
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Parse a YYYY-MM-DD string as a UTC date (no timezone drift). */
export function parseISODateUTC(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function calculateAge(birth: Date, at: Date): AgeResult {
  const invalid: AgeResult = {
    valid: false,
    years: 0,
    months: 0,
    days: 0,
    totalDays: 0,
    totalWeeks: 0,
    totalMonths: 0,
    nextBirthdayInDays: 0,
  };
  if (birth.getTime() > at.getTime()) return invalid;

  let years = at.getUTCFullYear() - birth.getUTCFullYear();
  let months = at.getUTCMonth() - birth.getUTCMonth();
  let days = at.getUTCDate() - birth.getUTCDate();

  if (days < 0) {
    months -= 1;
    // days in the month preceding `at`
    const prevMonth = at.getUTCMonth() - 1;
    const y = prevMonth < 0 ? at.getUTCFullYear() - 1 : at.getUTCFullYear();
    const mIdx = (prevMonth + 12) % 12;
    days += daysInMonth(y, mIdx);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = Math.floor((at.getTime() - birth.getTime()) / DAY_MS);

  // Next birthday (this year or next), counted from `at`.
  let nextBirthday = new Date(
    Date.UTC(at.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate()),
  );
  if (nextBirthday.getTime() <= at.getTime()) {
    nextBirthday = new Date(
      Date.UTC(at.getUTCFullYear() + 1, birth.getUTCMonth(), birth.getUTCDate()),
    );
  }
  const nextBirthdayInDays = Math.ceil((nextBirthday.getTime() - at.getTime()) / DAY_MS);

  return {
    valid: true,
    years,
    months,
    days,
    totalDays,
    totalWeeks: Math.floor(totalDays / 7),
    totalMonths: years * 12 + months,
    nextBirthdayInDays,
  };
}

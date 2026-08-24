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

/**
 * UTC timestamp of (year, monthIndex0) advanced by `n` whole months, with `day` CLAMPED to the
 * target month's length — so a month-end day (29/30/31) lands on the last valid day of a shorter
 * month (e.g. the 31st → Feb 28/29, Apr 30). This is the civil-date "same day next month, or the
 * month-end if that day does not exist" convention.
 */
function addMonthsClampUTC(year: number, monthIndex0: number, day: number, n: number): number {
  const total = monthIndex0 + n;
  const y = year + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const d = Math.min(day, daysInMonth(y, m));
  return Date.UTC(y, m, d);
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

  const by = birth.getUTCFullYear();
  const bm = birth.getUTCMonth();
  const bd = birth.getUTCDate();

  // Calendar years/months/days by the standard "relativedelta" anchor method: take the whole-month
  // gap, advance `birth` by that many months with the birth day CLAMPED into the anchor month (a
  // month-end birth lands on the destination month's last valid day), and if that anchor overshoots
  // `at` the final month is incomplete, so back off one month. The remaining days are the exact
  // civil-date gap from the anchor to `at`. For ordered dates this guarantees years, months and
  // days are all >= 0 (never an impossible negative borrow) and that
  // `birth + years + months (clamped) + days === at`.
  let totalMonths = (at.getUTCFullYear() - by) * 12 + (at.getUTCMonth() - bm);
  let anchor = addMonthsClampUTC(by, bm, bd, totalMonths);
  if (anchor > at.getTime()) {
    totalMonths -= 1;
    anchor = addMonthsClampUTC(by, bm, bd, totalMonths);
  }
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths - years * 12;
  const days = Math.round((at.getTime() - anchor) / DAY_MS);

  const totalDays = Math.floor((at.getTime() - birth.getTime()) / DAY_MS);

  // Next birthday (this year or next), counted from `at`. Unchanged behavior.
  let nextBirthday = new Date(Date.UTC(at.getUTCFullYear(), bm, bd));
  if (nextBirthday.getTime() <= at.getTime()) {
    nextBirthday = new Date(Date.UTC(at.getUTCFullYear() + 1, bm, bd));
  }
  const nextBirthdayInDays = Math.ceil((nextBirthday.getTime() - at.getTime()) / DAY_MS);

  return {
    valid: true,
    years,
    months,
    days,
    totalDays,
    totalWeeks: Math.floor(totalDays / 7),
    totalMonths,
    nextBirthdayInDays,
  };
}

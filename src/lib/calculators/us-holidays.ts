/**
 * US federal holidays, as observed. Pure and unit-tested. UTC throughout.
 *
 * A business-day count is only as good as the days it skips, and skipping weekends alone
 * overstates working days by roughly eleven a year. What matters for counting is the OBSERVED
 * date, not the statutory one: when a fixed-date holiday lands on a Saturday it is observed the
 * Friday before, and on a Sunday the Monday after, so the day people actually take off moves.
 * Holidays fixed to an n-th weekday never move.
 *
 * Juneteenth became a federal holiday in 2021, so it is emitted only from that year — counting
 * it backwards through history would quietly change the answer for every earlier range.
 */

const DAY_MS = 86_400_000;

/** Years 0–99 must not be mapped into the 1900s, which `Date.UTC` does. */
function utcDate(year: number, month: number, day: number): Date {
  const d = new Date(0);
  d.setUTCFullYear(year, month, day);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** The n-th given weekday of a month, e.g. the 3rd Monday of January. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = utcDate(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utcDate(year, month, 1 + offset + (n - 1) * 7);
}

/** The last given weekday of a month, e.g. the last Monday of May. */
function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = utcDate(year, month + 1, 0);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(last.getTime() - offset * DAY_MS);
}

/**
 * The day a fixed-date holiday is actually taken: Saturday moves back to Friday, Sunday forward
 * to Monday. This is what makes the observed day a weekday, which is why a business-day count
 * can treat every holiday as a weekday it must skip.
 */
export function observed(date: Date): Date {
  const day = date.getUTCDay();
  if (day === 6) return new Date(date.getTime() - DAY_MS);
  if (day === 0) return new Date(date.getTime() + DAY_MS);
  return date;
}

export interface Holiday {
  key: string;
  name: string;
  /** The statutory date. */
  date: Date;
  /** The day it is observed — the one a business-day count skips. */
  observed: Date;
}

/** The year Juneteenth became a federal holiday. */
export const JUNETEENTH_FROM = 2021;

/** Every federal holiday in a given year, in calendar order. */
export function federalHolidays(year: number): Holiday[] {
  const fixed = (key: string, name: string, month: number, day: number): Holiday => {
    const date = utcDate(year, month, day);
    return { key, name, date, observed: observed(date) };
  };
  const floating = (key: string, name: string, date: Date): Holiday => ({
    key,
    name,
    date,
    observed: date, // an n-th weekday is already a weekday
  });

  const list: Holiday[] = [
    fixed('new-years-day', "New Year's Day", 0, 1),
    floating('mlk-day', 'Martin Luther King Jr. Day', nthWeekday(year, 0, 1, 3)),
    floating('washingtons-birthday', "Washington's Birthday", nthWeekday(year, 1, 1, 3)),
    floating('memorial-day', 'Memorial Day', lastWeekday(year, 4, 1)),
    fixed('independence-day', 'Independence Day', 6, 4),
    floating('labor-day', 'Labor Day', nthWeekday(year, 8, 1, 1)),
    floating('columbus-day', 'Columbus Day', nthWeekday(year, 9, 1, 2)),
    fixed('veterans-day', 'Veterans Day', 10, 11),
    floating('thanksgiving', 'Thanksgiving Day', nthWeekday(year, 10, 4, 4)),
    fixed('christmas-day', 'Christmas Day', 11, 25),
  ];
  if (year >= JUNETEENTH_FROM) {
    list.push(fixed('juneteenth', 'Juneteenth National Independence Day', 5, 19));
  }
  return list.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Observed holidays across a span of years, as epoch-day numbers.
 *
 * Numbers rather than ISO strings because a business-day count tests one per calendar day, and a
 * numeric Set lookup costs nothing next to formatting a date for every day of a long range.
 */
export function observedHolidayDays(fromYear: number, toYear: number): Set<number> {
  const days = new Set<number>();
  const lo = Math.min(fromYear, toYear);
  const hi = Math.max(fromYear, toYear);
  // A holiday observed on Jan 1 can be pulled back into the previous December, and Dec 31
  // pushed forward into the next January, so reach one year either side.
  for (let y = lo - 1; y <= hi + 1; y += 1) {
    for (const h of federalHolidays(y)) days.add(Math.round(h.observed.getTime() / DAY_MS));
  }
  return days;
}

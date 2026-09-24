/**
 * Business-day counting and shifting. Pure and unit-tested. UTC throughout.
 *
 * A business day is Monday to Friday, optionally less the observed US federal holidays. Both
 * operations walk the calendar a day at a time rather than deriving a closed form: holidays make
 * the closed form fiddly and easy to get subtly wrong, and the walk is arithmetic over epoch-day
 * numbers, so even a span of centuries costs milliseconds.
 *
 * Counting is over the HALF-OPEN interval [start, end) — the same convention as the calendar-day
 * count, where the end day is not counted unless the visitor asks for it. `includeEnd` then adds
 * the end day only if the end day is itself a business day, which is what makes the two counts
 * agree about what "including the end day" means.
 */
import { observedHolidayDays } from './us-holidays';

const DAY_MS = 86_400_000;

export interface BusinessDayRules {
  /** Skip observed US federal holidays as well as weekends. */
  excludeHolidays: boolean;
}

const epochDay = (d: Date): number => Math.round(d.getTime() / DAY_MS);
const fromEpochDay = (n: number): Date => new Date(n * DAY_MS);

/** Day of the week for an epoch day. Epoch day 0 (1970-01-01) was a Thursday. */
function weekdayOf(day: number): number {
  return ((((day + 4) % 7) + 7) % 7);
}

const isWeekend = (day: number): boolean => {
  const w = weekdayOf(day);
  return w === 0 || w === 6;
};

/** The holiday set a range needs, or an empty set when holidays are not being excluded. */
function holidaySetFor(rules: BusinessDayRules, a: Date, b: Date): Set<number> {
  if (!rules.excludeHolidays) return new Set();
  return observedHolidayDays(a.getUTCFullYear(), b.getUTCFullYear());
}

export function isBusinessDay(date: Date, holidays: Set<number>): boolean {
  const day = epochDay(date);
  return !isWeekend(day) && !holidays.has(day);
}

/**
 * Business days between two dates, order-independent, over [earlier, later).
 *
 * `includeEnd` counts the later day too, but only when it is a business day — a range that ends
 * on a Sunday does not gain a working day just because the visitor ticked the box.
 */
export function businessDaysBetween(
  a: Date,
  b: Date,
  rules: BusinessDayRules & { includeEnd: boolean },
): number {
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return Number.NaN;
  const start = Math.min(epochDay(a), epochDay(b));
  const end = Math.max(epochDay(a), epochDay(b));
  const holidays = holidaySetFor(rules, a, b);

  let count = 0;
  for (let d = start; d < end; d += 1) {
    if (!isWeekend(d) && !holidays.has(d)) count += 1;
  }
  if (rules.includeEnd && !isWeekend(end) && !holidays.has(end)) count += 1;
  return count;
}

/** The most business days this will shift by, so an absurd entry cannot lock up the page. */
export const BUSINESS_DAY_MAX = 200_000;

/**
 * The date `n` business days after (or, with a negative `n`, before) a start date.
 *
 * The start day itself is never counted, whether or not it is a business day: "3 business days
 * from Friday" is the following Wednesday, and asking from a Sunday lands on the same Wednesday.
 * A zero shift returns the start date untouched rather than nudging it onto a business day.
 */
export function addBusinessDays(start: Date, n: number, rules: BusinessDayRules): Date {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(n)) return new Date(Number.NaN);
  const steps = Math.round(n);
  if (steps === 0) return new Date(start.getTime());
  if (Math.abs(steps) > BUSINESS_DAY_MAX) return new Date(Number.NaN);

  const step = steps > 0 ? 1 : -1;
  let day = epochDay(start);
  // Holidays are needed across however far this could reach: at worst every day is a weekend or
  // holiday, so bound the span generously rather than re-deriving the set mid-walk.
  const span = Math.ceil(Math.abs(steps) * 7 / 5) + 40;
  const holidays = rules.excludeHolidays
    ? observedHolidayDays(
        fromEpochDay(day - span).getUTCFullYear(),
        fromEpochDay(day + span).getUTCFullYear(),
      )
    : new Set<number>();

  let remaining = Math.abs(steps);
  while (remaining > 0) {
    day += step;
    if (!isWeekend(day) && !holidays.has(day)) remaining -= 1;
  }
  return fromEpochDay(day);
}

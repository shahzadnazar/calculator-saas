/**
 * The optional extra-payment block — the small vocabulary the mortgage and
 * amortization calculators both express it in.
 *
 * Both offer the same thing: a loan start date, then extra principal paid monthly,
 * yearly, or as a list of one-off amounts, each dated by month and year. The engines
 * beneath them want an OFFSET in months from the first payment, so the conversion,
 * the year range those dates are bounded to, and the messages a bad entry produces
 * live here rather than being written twice and drifting apart.
 *
 * Nothing here knows about a particular calculator: it is dates and wording only.
 */

/** The year range every start date and extra-payment date shares. */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2200;

export const EXTRA_AMOUNT_MESSAGE = 'Enter an extra payment of zero or more.';
export const EXTRA_YEAR_MESSAGE = `Enter a year from ${MIN_YEAR} to ${MAX_YEAR}.`;

/** One row of the one-time extra-payment list, as the form holds it. */
export interface OneTimeValue {
  amount: string;
  month: string;
  year: string;
}

/** How many one-time rows a form offers. The first is always visible; the rest expand. */
export const ONE_TIME_SLOTS = 5;

/** A blank one-time row — the shape `readValues` falls back to and reset restores. */
export const emptyOneTime = (): OneTimeValue => ({ amount: '', month: '', year: '' });
export const emptyOneTimeList = (): OneTimeValue[] =>
  Array.from({ length: ONE_TIME_SLOTS }, emptyOneTime);

/** Optional whole four-digit year, in the shared range. */
export function parseOptionalYear(raw: string): 'empty' | 'invalid' | number {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < MIN_YEAR || n > MAX_YEAR) return 'invalid';
  return n;
}

/**
 * Whole months from the repayment start to a given month/year — the offset an engine
 * schedules an extra payment at. A date at or before the loan's start clamps to 0 (it
 * simply applies from the first payment) rather than erroring, and a date past the
 * end produces an offset the schedule never reaches, which is the correct outcome
 * for money promised after the loan is already paid off.
 */
export function monthOffset(
  startMonth: number,
  startYear: number,
  month: number,
  year: number,
): number {
  if (![startMonth, startYear, month, year].every((n) => Number.isFinite(n))) return 0;
  return Math.max(0, (year - startYear) * 12 + (month - startMonth));
}

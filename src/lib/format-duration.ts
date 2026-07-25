/**
 * Shared payoff-duration presenter (R8C1.1 — isolated from `@lib/format` so it no longer
 * shares a chunk with the broadly-imported `formatCurrency`).
 *
 * Pure and neutral: it turns a raw month count into human duration wording and contains
 * NO currency logic, NO loan/credit-card formulas, and NO DOM code. Consumed only by the
 * Payment and Credit-Card payoff bindings — import it DIRECTLY (never via a `@lib/format`
 * barrel) so unrelated currency consumers never pull it into their bundle.
 */

export interface DurationParts {
  years: number;
  months: number;
}

/**
 * The whole-year / residual-month split for a payoff DISPLAY, normalized: years =
 * floor(rawMonths / 12); residual = round(rawMonths % 12) — and when the residual rounds
 * up to a full 12, it carries into the next year, so a boundary like 59.5 raw months reads
 * "5 years", never "4 years, 12 months". Presentation only.
 */
export function payoffParts(rawMonths: number): DurationParts {
  let years = Math.floor(rawMonths / 12);
  let months = Math.round(rawMonths % 12);
  if (months === 12) {
    years += 1;
    months = 0;
  }
  return { years, months };
}

const durationUnit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Pure payoff-duration presenter: a raw month value → the VISIBLE and ACCESSIBLE wording.
 * Correct singular/plural; never "0 years", a trailing "0 months", "12 months" after a year
 * (payoffParts carries it), terse "4y 10m", or a fractional month. A positive sub-month
 * value reads "Less than 1 month". A non-finite or negative input yields the neutral dash,
 * so no caller ever surfaces "NaN"/"Infinity"/"undefined".
 */
export function presentDuration(rawMonths: number): { display: string; spoken: string } {
  if (!Number.isFinite(rawMonths) || rawMonths < 0) {
    return { display: '—', spoken: '' };
  }
  const { years, months } = payoffParts(rawMonths);
  const parts: string[] = [];
  if (years > 0) parts.push(durationUnit(years, 'year'));
  if (months > 0) parts.push(durationUnit(months, 'month'));
  if (parts.length === 0) return { display: 'Less than 1 month', spoken: 'less than 1 month' };
  return { display: parts.join(', '), spoken: parts.join(' and ') };
}

/**
 * Shared, locale-aware formatting helpers used across calculators.
 * Pure functions — safe to unit test and reuse anywhere.
 */

export function formatCurrency(value: number, currency = 'USD', locale = 'en-US'): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Currency without cents — for large headline figures. */
export function formatCurrencyRounded(value: number, currency = 'USD', locale = 'en-US'): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, maxFractionDigits = 2, locale = 'en-US'): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

export function formatPercent(value: number, maxFractionDigits = 2, locale = 'en-US'): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: maxFractionDigits,
  }).format(value / 100);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/* ------------------------------------------------------------------ */
/* Payoff duration presenter (shared; extracted from payment-form R8C1) */
/* ------------------------------------------------------------------ */

export interface DurationParts {
  years: number;
  months: number;
}

/**
 * The whole-year / residual-month split for a payoff DISPLAY, normalized: years =
 * floor(rawMonths / 12); residual = round(rawMonths % 12) — and when the residual rounds
 * up to a full 12, it carries into the next year, so a boundary like 59.5 raw months
 * reads "5 years", never "4 years, 12 months". Presentation only.
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
 * Pure payoff-duration presenter: a raw month value → the VISIBLE and ACCESSIBLE
 * wording. Correct singular/plural; never "0 years", a trailing "0 months", "12 months"
 * after a year (payoffParts carries it), terse "4y 10m", or a fractional month. A
 * positive sub-month value reads "Less than 1 month". A non-finite or negative input
 * yields the neutral dash, so no caller ever surfaces "NaN"/"Infinity"/"undefined".
 * Shared by loan/credit-card payoff calculators; contains no calculator-specific logic.
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

/** Parse a user-entered numeric string, tolerating commas and stray spaces. */
export function parseNumber(input: string | number | null | undefined): number {
  if (typeof input === 'number') return input;
  if (input == null) return NaN;
  const cleaned = String(input).replace(/[,\s]/g, '');
  return cleaned === '' ? NaN : Number(cleaned);
}

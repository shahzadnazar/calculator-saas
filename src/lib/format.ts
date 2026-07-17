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

/** Parse a user-entered numeric string, tolerating commas and stray spaces. */
export function parseNumber(input: string | number | null | undefined): number {
  if (typeof input === 'number') return input;
  if (input == null) return NaN;
  const cleaned = String(input).replace(/[,\s]/g, '');
  return cleaned === '' ? NaN : Number(cleaned);
}

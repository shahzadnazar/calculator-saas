/**
 * Consumer Price Index lookups and comparisons.
 *
 * The dataset (`@data/cpi-us`) is the published BLS CPI-U series; this module only reads
 * it. Two ideas do all the work:
 *
 *   • A **period** is either a single month or a year's annual average. BLS publishes the
 *     annual average as the mean of the twelve monthly indexes rounded to three decimals,
 *     so that is exactly what `cpiValue` returns — the number we display is the number we
 *     compute with, and a reader can reproduce our result from the figures on screen.
 *   • An annual average is **anchored to July**, the middle month of its year, whenever a
 *     span has to be measured in time. That is the only defensible point to put a whole
 *     year's average on a timeline, and it is what makes the average annual rate come out
 *     right for a span like "2016 (Average) to July 2026" — ten years, not ten and a half.
 *
 * A month with no published index (October 2025) returns `null` and is skipped, never
 * interpolated.
 */
import { CPI_FIRST_YEAR, CPI_MONTHLY } from '@data/cpi-us';

export { CPI_FIRST_YEAR };

/** 1 = January … 12 = December, or a whole year's average. */
export type PeriodMonth = number | 'average';

export interface CpiPeriod {
  year: number;
  month: PeriodMonth;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const MONTH_ABBR = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'] as const;

/** The month an annual average sits on when a span is measured. July is mid-year. */
export const AVERAGE_ANCHOR_MONTH = 7;

export const CPI_LAST_YEAR = CPI_FIRST_YEAR + CPI_MONTHLY.length - 1;

function row(year: number): readonly (number | null)[] | undefined {
  return CPI_MONTHLY[year - CPI_FIRST_YEAR];
}

/** Round to three decimals, the precision BLS publishes the index at. */
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** The published months of a year, in order. Empty for a year we have no data for. */
export function publishedMonths(year: number): number[] {
  const y = row(year);
  if (!y) return [];
  const out: number[] = [];
  for (let m = 1; m <= 12; m += 1) if (y[m - 1] !== null) out.push(m);
  return out;
}

/** True when every month of the year is published, so an annual average exists. */
export function hasAnnualAverage(year: number): boolean {
  return publishedMonths(year).length === 12;
}

/**
 * The index for a period, or `null` when it was never published. An annual average needs
 * all twelve months — a part-year has no average, and averaging what happens to be there
 * would silently invent one.
 */
export function cpiValue(period: CpiPeriod): number | null {
  const y = row(period.year);
  if (!y) return null;
  if (period.month === 'average') {
    if (!hasAnnualAverage(period.year)) return null;
    const total = (y as number[]).reduce((a, b) => a + b, 0);
    return round3(total / 12);
  }
  const m = period.month;
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  return y[m - 1] ?? null;
}

/** "2016 (Average)" or "Jul. 2026" — how the reference names a period. */
export function periodLabel(period: CpiPeriod): string {
  if (period.month === 'average') return `${period.year} (Average)`;
  return `${MONTH_ABBR[period.month - 1]} ${period.year}`;
}

/** Whole months from year 0, with an annual average anchored to July. */
export function anchorMonths(period: CpiPeriod): number {
  const m = period.month === 'average' ? AVERAGE_ANCHOR_MONTH : period.month;
  return period.year * 12 + m;
}

export interface CpiSeriesPoint {
  year: number;
  /** 1-12; the annual-average start point carries its anchor month. */
  month: number;
  value: number;
}

export interface CpiComparison {
  amount: number;
  from: CpiPeriod;
  to: CpiPeriod;
  fromCpi: number;
  toCpi: number;
  /** What `amount` in `from` is worth in `to`. */
  value: number;
  /** Price change across the span, signed and directional. */
  totalPct: number;
  /** Compound annual rate across the span. NaN when the two periods are the same. */
  annualPct: number;
  /** Length of the span in years, signed. */
  years: number;
  /** Monthly points from the earlier anchor to the later one, gaps skipped. */
  series: readonly CpiSeriesPoint[];
}

/**
 * Every published month between two anchors, inclusive, as `{year, month}`. The start
 * anchor is included even when it stands for an annual average — it carries July.
 */
function monthsBetween(startMonths: number, endMonths: number): { year: number; month: number }[] {
  const lo = Math.min(startMonths, endMonths);
  const hi = Math.max(startMonths, endMonths);
  const out: { year: number; month: number }[] = [];
  for (let t = lo; t <= hi; t += 1) {
    const year = Math.floor((t - 1) / 12);
    const month = t - year * 12;
    out.push({ year, month });
  }
  return out;
}

/**
 * Compare an amount across two periods.
 *
 * `totalPct` is directional — asking for 2026 against 2016 gives a negative total, because
 * prices really are lower looking backwards. `annualPct` uses the signed span, which makes
 * it come out positive either way round: the span between two dates inflated at one rate
 * regardless of which end you name first.
 *
 * Returns `null` when either period has no published index, which is the caller's signal
 * that there is nothing to show.
 */
export function compareCpi(amount: number, from: CpiPeriod, to: CpiPeriod): CpiComparison | null {
  if (!Number.isFinite(amount)) return null;
  const fromCpi = cpiValue(from);
  const toCpi = cpiValue(to);
  if (fromCpi === null || toCpi === null || fromCpi <= 0 || toCpi <= 0) return null;

  const ratio = toCpi / fromCpi;
  const months = anchorMonths(to) - anchorMonths(from);
  const years = months / 12;
  const annualPct = months === 0 ? Number.NaN : (Math.pow(ratio, 1 / years) - 1) * 100;

  const startAnchor = anchorMonths(from);
  const series: CpiSeriesPoint[] = [];
  for (const p of monthsBetween(startAnchor, anchorMonths(to))) {
    // The start point stands for the chosen period itself, average or month alike.
    const cpi = p.year * 12 + p.month === startAnchor ? fromCpi : cpiValue({ year: p.year, month: p.month });
    if (cpi === null) continue;
    series.push({ year: p.year, month: p.month, value: (amount * cpi) / fromCpi });
  }

  return {
    amount,
    from,
    to,
    fromCpi,
    toCpi,
    value: amount * ratio,
    totalPct: (ratio - 1) * 100,
    annualPct,
    years,
    series,
  };
}

/** The most recent month with a published index. */
export function latestPeriod(): CpiPeriod {
  for (let year = CPI_LAST_YEAR; year >= CPI_FIRST_YEAR; year -= 1) {
    const months = publishedMonths(year);
    if (months.length) return { year, month: months[months.length - 1] };
  }
  return { year: CPI_FIRST_YEAR, month: 1 };
}

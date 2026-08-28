import { describe, it, expect } from 'vitest';
import {
  AVERAGE_ANCHOR_MONTH,
  anchorMonths,
  compareCpi,
  cpiValue,
  hasAnnualAverage,
  latestPeriod,
  periodLabel,
  publishedMonths,
} from './cpi';

/**
 * The published reference case: $100 of 2016 (Average) buying power is $139.13 in
 * July 2026 — a 39.13% total rise, 3.36% a year, from a CPI of 240.007 to 333.918.
 */
const round = (v: number, dp: number) => Number(v.toFixed(dp));

describe('reading an index', () => {
  it('returns the published monthly index', () => {
    expect(cpiValue({ year: 2026, month: 7 })).toBe(333.918);
    expect(cpiValue({ year: 1913, month: 1 })).toBe(9.8);
  });

  it('averages a full year to the precision BLS publishes', () => {
    expect(cpiValue({ year: 2016, month: 'average' })).toBe(240.007);
    expect(cpiValue({ year: 2024, month: 'average' })).toBe(313.689);
  });

  it('has no average for a year with a missing month', () => {
    // 2025 lost October, so no annual average exists — averaging eleven months would
    // invent a figure BLS never published.
    expect(hasAnnualAverage(2025)).toBe(false);
    expect(cpiValue({ year: 2025, month: 'average' })).toBeNull();
    expect(publishedMonths(2025)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]);
  });

  it('has no average for a year still in progress', () => {
    expect(cpiValue({ year: 2026, month: 'average' })).toBeNull();
    expect(publishedMonths(2026)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('returns null for an unpublished month and for a year off the ends', () => {
    expect(cpiValue({ year: 2025, month: 10 })).toBeNull();
    expect(cpiValue({ year: 2026, month: 12 })).toBeNull();
    expect(cpiValue({ year: 1912, month: 1 })).toBeNull();
    expect(cpiValue({ year: 2030, month: 1 })).toBeNull();
    expect(cpiValue({ year: 2020, month: 13 })).toBeNull();
  });

  it('names periods the way the result sentence reads them', () => {
    expect(periodLabel({ year: 2016, month: 'average' })).toBe('2016 (Average)');
    expect(periodLabel({ year: 2026, month: 7 })).toBe('Jul. 2026');
    expect(periodLabel({ year: 1999, month: 5 })).toBe('May 1999');
  });

  it('knows the latest published month', () => {
    expect(latestPeriod()).toEqual({ year: 2026, month: 7 });
  });
});

describe('the reference comparison', () => {
  const r = compareCpi(100, { year: 2016, month: 'average' }, { year: 2026, month: 7 })!;

  it('reports the published value, total and annual rate', () => {
    expect(round(r.value, 2)).toBe(139.13);
    expect(round(r.totalPct, 2)).toBe(39.13);
    expect(round(r.annualPct, 2)).toBe(3.36);
  });

  it('reports the two index values it used', () => {
    expect(r.fromCpi).toBe(240.007);
    expect(r.toCpi).toBe(333.918);
  });

  it('measures the span as ten years, the annual average sitting mid-year', () => {
    expect(AVERAGE_ANCHOR_MONTH).toBe(7);
    expect(r.years).toBe(10);
    expect(anchorMonths({ year: 2016, month: 'average' })).toBe(anchorMonths({ year: 2016, month: 7 }));
  });

  it('is reproducible from the two index values on screen', () => {
    expect(round((100 * r.toCpi) / r.fromCpi, 2)).toBe(139.13);
  });
});

describe('the chart series', () => {
  const r = compareCpi(100, { year: 2016, month: 'average' }, { year: 2026, month: 7 })!;

  it('runs monthly from the start anchor to the end', () => {
    expect(r.series[0]).toEqual({ year: 2016, month: 7, value: 100 });
    expect(r.series[r.series.length - 1].year).toBe(2026);
    expect(r.series[r.series.length - 1].month).toBe(7);
    expect(round(r.series[r.series.length - 1].value, 2)).toBe(139.13);
  });

  it('starts exactly at the amount entered', () => {
    expect(r.series[0].value).toBe(100);
  });

  it('skips the month with no index rather than drawing through it', () => {
    expect(r.series.some((p) => p.year === 2025 && p.month === 10)).toBe(false);
    expect(r.series.some((p) => p.year === 2025 && p.month === 9)).toBe(true);
    expect(r.series.some((p) => p.year === 2025 && p.month === 11)).toBe(true);
    expect(r.series).toHaveLength(120); // 121 months in the span, one never published
  });

  it('every point is a finite, positive amount', () => {
    for (const p of r.series) expect(p.value).toBeGreaterThan(0);
  });
});

describe('direction and edges', () => {
  it('reads backwards with a negative total but the same annual rate', () => {
    const back = compareCpi(100, { year: 2026, month: 7 }, { year: 2016, month: 'average' })!;
    expect(round(back.value, 2)).toBe(71.88);
    expect(back.totalPct).toBeLessThan(0);
    // The span inflated at one rate however you name its ends.
    expect(round(back.annualPct, 2)).toBe(3.36);
  });

  it('has no annual rate across a zero-length span', () => {
    const same = compareCpi(100, { year: 2020, month: 6 }, { year: 2020, month: 6 })!;
    expect(same.value).toBe(100);
    expect(same.totalPct).toBe(0);
    expect(Number.isNaN(same.annualPct)).toBe(true);
  });

  it('scales linearly with the amount', () => {
    const one = compareCpi(1, { year: 2000, month: 1 }, { year: 2020, month: 1 })!;
    const thousand = compareCpi(1000, { year: 2000, month: 1 }, { year: 2020, month: 1 })!;
    expect(round(thousand.value, 6)).toBe(round(one.value * 1000, 6));
    expect(round(thousand.totalPct, 9)).toBe(round(one.totalPct, 9));
  });

  it('refuses a period with no published index', () => {
    expect(compareCpi(100, { year: 2025, month: 10 }, { year: 2026, month: 7 })).toBeNull();
    expect(compareCpi(100, { year: 2016, month: 'average' }, { year: 2026, month: 'average' })).toBeNull();
    expect(compareCpi(100, { year: 1800, month: 1 }, { year: 2026, month: 7 })).toBeNull();
  });

  it('refuses a non-finite amount', () => {
    expect(compareCpi(Number.NaN, { year: 2016, month: 1 }, { year: 2026, month: 7 })).toBeNull();
    expect(compareCpi(Number.POSITIVE_INFINITY, { year: 2016, month: 1 }, { year: 2026, month: 7 })).toBeNull();
  });

  it('handles a zero amount without producing a rate of nothing', () => {
    const r = compareCpi(0, { year: 2016, month: 'average' }, { year: 2026, month: 7 })!;
    expect(r.value).toBe(0);
    expect(round(r.totalPct, 2)).toBe(39.13);
  });

  it('spans the whole series without losing precision', () => {
    const r = compareCpi(1, { year: 1913, month: 1 }, { year: 2026, month: 7 })!;
    expect(round(r.value, 2)).toBe(34.07);
    expect(r.annualPct).toBeGreaterThan(3);
    expect(r.annualPct).toBeLessThan(3.5);
  });
});

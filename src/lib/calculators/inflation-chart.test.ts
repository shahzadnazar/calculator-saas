import { describe, it, expect } from 'vitest';
import { niceStep, planPurchasingPowerChart, type ChartPoint } from './inflation-chart';
import { compareCpi } from './cpi';

const pt = (year: number, month: number, value: number): ChartPoint => ({ year, month, value });

describe('niceStep', () => {
  it('picks a round step for the range', () => {
    expect(niceStep(39.13, 4)).toBe(10);
    expect(niceStep(4, 4)).toBe(1);
    expect(niceStep(400, 4)).toBe(100);
    expect(niceStep(0.4, 4)).toBe(0.1);
  });

  it('never returns zero or a negative step', () => {
    expect(niceStep(0, 4)).toBe(1);
    expect(niceStep(-5, 4)).toBe(1);
  });
});

describe('the axis brackets the data on round numbers', () => {
  it('reproduces the reference chart axis — $100 to $140 in tens', () => {
    const r = compareCpi(100, { year: 2016, month: 'average' }, { year: 2026, month: 7 })!;
    const scale = planPurchasingPowerChart(r.series)!;
    expect(scale.lo).toBe(100);
    expect(scale.hi).toBe(140);
    expect(scale.ticks).toEqual([100, 110, 120, 130, 140]);
  });

  it('marks the round years inside the span, as the reference does', () => {
    const r = compareCpi(100, { year: 2016, month: 'average' }, { year: 2026, month: 7 })!;
    expect(planPurchasingPowerChart(r.series)!.yearTicks).toEqual([2020, 2025]);
  });

  it('always contains every point', () => {
    const r = compareCpi(2500, { year: 1970, month: 3 }, { year: 2026, month: 7 })!;
    const s = planPurchasingPowerChart(r.series)!;
    for (const p of r.series) {
      expect(p.value).toBeGreaterThanOrEqual(s.lo);
      expect(p.value).toBeLessThanOrEqual(s.hi);
    }
  });

  it('keeps the year axis to a handful of marks over a long span', () => {
    const r = compareCpi(1, { year: 1913, month: 1 }, { year: 2026, month: 7 })!;
    const s = planPurchasingPowerChart(r.series)!;
    expect(s.yearTicks.length).toBeGreaterThan(1);
    expect(s.yearTicks.length).toBeLessThanOrEqual(6);
  });

  it('gives a flat series a box with height', () => {
    const s = planPurchasingPowerChart([pt(2020, 1, 100), pt(2020, 2, 100)])!;
    expect(s.hi).toBeGreaterThan(s.lo);
  });

  it('produces ticks that are exactly evenly spaced', () => {
    const s = planPurchasingPowerChart([pt(2000, 1, 12.5), pt(2010, 1, 87.5)])!;
    const gaps = s.ticks.slice(1).map((t, i) => Number((t - s.ticks[i]).toFixed(6)));
    expect(new Set(gaps).size).toBe(1);
  });
});

describe('nothing to plot', () => {
  it('refuses fewer than two points', () => {
    expect(planPurchasingPowerChart([])).toBeNull();
    expect(planPurchasingPowerChart([pt(2020, 1, 100)])).toBeNull();
  });

  it('refuses a non-finite value', () => {
    expect(planPurchasingPowerChart([pt(2020, 1, 100), pt(2020, 2, Number.NaN)])).toBeNull();
    expect(planPurchasingPowerChart([pt(2020, 1, 100), pt(2020, 2, Number.POSITIVE_INFINITY)])).toBeNull();
  });
});

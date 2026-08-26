import { describe, it, expect } from 'vitest';
import { percentOf, whatPercent, percentChange, percentOfWhat, percentageDifference, applyPercentChange } from './percent';

describe('percentage helpers', () => {
  it('computes P% of X', () => {
    expect(percentOf(15, 200)).toBe(30);
    expect(percentOf(100, 50)).toBe(50);
  });

  it('computes A is what percent of B', () => {
    expect(whatPercent(30, 200)).toBe(15);
    expect(Number.isNaN(whatPercent(1, 0))).toBe(true);
  });

  it('computes percent change', () => {
    expect(percentChange(200, 250)).toBe(25);
    expect(percentChange(250, 200)).toBe(-20);
    expect(Number.isNaN(percentChange(0, 5))).toBe(true);
  });
});

describe('percentOfWhat — "A is P% of what?"', () => {
  it('solves for the whole', () => {
    expect(percentOfWhat(30, 15)).toBeCloseTo(200, 10);
    expect(percentOfWhat(25, 50)).toBeCloseTo(50, 10);
  });

  it('inverts percentOf exactly', () => {
    for (const [pct, whole] of [[15, 200], [7.5, 64], [120, 5]]) {
      expect(percentOfWhat(percentOf(pct, whole), pct)).toBeCloseTo(whole, 8);
    }
  });

  it('has no solution at 0% — never divides by zero', () => {
    expect(Number.isNaN(percentOfWhat(30, 0))).toBe(true);
  });

  it('keeps sign semantics for negative parts and percentages', () => {
    expect(percentOfWhat(-30, 15)).toBeCloseTo(-200, 10);
    expect(percentOfWhat(30, -15)).toBeCloseTo(-200, 10);
  });
});

describe('percentageDifference — against the mean, not a baseline', () => {
  it('measures the gap as a percentage of the mean', () => {
    expect(percentageDifference(10, 6)).toBeCloseTo(50, 10); // 4 / 8
    expect(percentageDifference(20, 30)).toBeCloseTo(40, 10); // 10 / 25
  });

  it('is symmetric — unlike percentChange, order does not matter', () => {
    expect(percentageDifference(10, 6)).toBeCloseTo(percentageDifference(6, 10), 10);
    // ...whereas the directional change is NOT symmetric.
    expect(percentChange(10, 6)).not.toBeCloseTo(percentChange(6, 10), 5);
  });

  it('is zero for identical values and never negative', () => {
    expect(percentageDifference(7, 7)).toBe(0);
    for (const [a, b] of [[-5, 5.0001], [3, 9], [-8, -2]]) {
      expect(percentageDifference(a, b)).toBeGreaterThanOrEqual(0);
    }
  });

  it('has no basis when the mean is zero', () => {
    expect(Number.isNaN(percentageDifference(5, -5))).toBe(true);
    expect(Number.isNaN(percentageDifference(0, 0))).toBe(true);
  });
});

describe('applyPercentChange — increase / decrease a value', () => {
  it('adds and subtracts the percentage', () => {
    expect(applyPercentChange(500, 10, 'increase')).toBeCloseTo(550, 10);
    expect(applyPercentChange(500, 10, 'decrease')).toBeCloseTo(450, 10);
  });

  it('leaves the value alone at 0%', () => {
    expect(applyPercentChange(80, 0, 'increase')).toBe(80);
    expect(applyPercentChange(80, 0, 'decrease')).toBe(80);
  });

  it('round-trips against percentChange', () => {
    const after = applyPercentChange(200, 25, 'increase');
    expect(percentChange(200, after)).toBeCloseTo(25, 8);
  });

  it('allows a decrease past zero rather than clamping', () => {
    expect(applyPercentChange(100, 150, 'decrease')).toBeCloseTo(-50, 10);
  });
});

import { describe, it, expect } from 'vitest';
import { percentOf, whatPercent, percentChange } from './percent';

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

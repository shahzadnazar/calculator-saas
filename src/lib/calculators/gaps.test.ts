import { describe, it, expect } from 'vitest';
import { calculateTip } from './tip';
import { calculateArea } from './area';
import { calculateVolume } from './volume';
import { calculateSquareFootage } from './square-footage';

describe('tip', () => {
  it('computes tip, total and split', () => {
    const r = calculateTip({ bill: 50, tipPct: 20, people: 2 });
    expect(r.tipAmount).toBeCloseTo(10, 6);
    expect(r.total).toBeCloseTo(60, 6);
    expect(r.perPersonTotal).toBeCloseTo(30, 6);
    expect(r.perPersonTip).toBeCloseTo(5, 6);
  });
  it('never divides by fewer than one person', () => {
    expect(calculateTip({ bill: 40, tipPct: 15, people: 0 }).perPersonTotal).toBeCloseTo(46, 6);
  });
});

describe('area', () => {
  it('computes shape areas', () => {
    expect(calculateArea('rectangle', { length: 4, width: 5 })).toBe(20);
    expect(calculateArea('square', { side: 5 })).toBe(25);
    expect(calculateArea('triangle', { base: 6, height: 4 })).toBe(12);
    expect(calculateArea('circle', { radius: 2 })).toBeCloseTo(12.566, 3);
    expect(calculateArea('trapezoid', { a: 3, b: 5, height: 4 })).toBe(16);
  });
});

describe('volume', () => {
  it('computes shape volumes', () => {
    expect(calculateVolume('cube', { side: 3 })).toBe(27);
    expect(calculateVolume('box', { length: 2, width: 3, height: 4 })).toBe(24);
    expect(calculateVolume('sphere', { radius: 3 })).toBeCloseTo(113.097, 2);
    expect(calculateVolume('cylinder', { radius: 2, height: 5 })).toBeCloseTo(62.832, 2);
    expect(calculateVolume('cone', { radius: 3, height: 6 })).toBeCloseTo(56.549, 2);
  });
});

describe('square footage', () => {
  it('computes area, total, conversions and cost', () => {
    const r = calculateSquareFootage({ length: 10, width: 12, unit: 'ft', quantity: 2, pricePerSqFt: 5 });
    expect(r.areaSqFt).toBe(120);
    expect(r.totalSqFt).toBe(240);
    expect(r.totalSqYd).toBeCloseTo(26.667, 2);
    expect(r.cost).toBe(1200);
  });
  it('converts non-foot units', () => {
    // 10 yd × 12 yd = 30 ft × 36 ft = 1080 sq ft
    expect(calculateSquareFootage({ length: 10, width: 12, unit: 'yd' }).areaSqFt).toBeCloseTo(1080, 6);
  });
});

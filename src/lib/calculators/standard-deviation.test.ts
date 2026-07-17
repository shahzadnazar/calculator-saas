import { describe, it, expect } from 'vitest';
import { calculateStats, parseNumberList } from './standard-deviation';

describe('standard deviation / stats', () => {
  it('parses a free-form list', () => {
    expect(parseNumberList('2, 4 6\n8')).toEqual([2, 4, 6, 8]);
    expect(parseNumberList('1, , x, 3')).toEqual([1, 3]);
  });

  it('computes mean, min, max and sum', () => {
    const r = calculateStats([2, 4, 6, 8]);
    expect(r.count).toBe(4);
    expect(r.sum).toBe(20);
    expect(r.mean).toBe(5);
    expect(r.min).toBe(2);
    expect(r.max).toBe(8);
  });

  it('computes population and sample standard deviation', () => {
    const r = calculateStats([2, 4, 6, 8]);
    // population variance = 5, sample variance = 6.667
    expect(r.populationVariance).toBeCloseTo(5, 6);
    expect(r.populationSD).toBeCloseTo(2.2360679, 5);
    expect(r.sampleVariance).toBeCloseTo(6.6666667, 5);
    expect(r.sampleSD).toBeCloseTo(2.5819889, 5);
  });

  it('returns NaN sample SD for a single value', () => {
    const r = calculateStats([5]);
    expect(r.mean).toBe(5);
    expect(r.populationSD).toBe(0);
    expect(Number.isNaN(r.sampleSD)).toBe(true);
  });

  it('handles an empty set', () => {
    expect(calculateStats([]).count).toBe(0);
  });
});

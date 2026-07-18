import { describe, it, expect } from 'vitest';
import { calculateStats, parseNumberList } from './statistics';

describe('statistics', () => {
  it('parses a free-form list', () => {
    expect(parseNumberList('2, 4 6\n8')).toEqual([2, 4, 6, 8]);
    expect(parseNumberList('1, , x, 3')).toEqual([1, 3]);
    expect(parseNumberList('-2.5, 3.5')).toEqual([-2.5, 3.5]);
  });

  it('computes count, sum, mean, min, max and range', () => {
    const r = calculateStats([2, 4, 6, 8]);
    expect(r.count).toBe(4);
    expect(r.sum).toBe(20);
    expect(r.mean).toBe(5);
    expect(r.min).toBe(2);
    expect(r.max).toBe(8);
    expect(r.range).toBe(6);
    expect(r.sorted).toEqual([2, 4, 6, 8]);
  });

  it('computes population and sample variance and standard deviation', () => {
    const r = calculateStats([2, 4, 6, 8]);
    expect(r.sumSquares).toBeCloseTo(20, 6);
    expect(r.populationVariance).toBeCloseTo(5, 6);
    expect(r.populationSD).toBeCloseTo(2.2360679, 5);
    expect(r.sampleVariance).toBeCloseTo(6.6666667, 5);
    expect(r.sampleSD).toBeCloseTo(2.5819889, 5);
  });

  it('computes the median for even and odd counts', () => {
    expect(calculateStats([2, 4, 6, 8]).median).toBe(5); // (4+6)/2
    expect(calculateStats([1, 2, 3, 4, 5]).median).toBe(3);
  });

  it('finds the mode, or none when all values are unique', () => {
    expect(calculateStats([2, 4, 4, 4, 5, 5, 7, 9]).mode).toEqual([4]);
    expect(calculateStats([1, 1, 2, 2, 3]).mode).toEqual([1, 2]); // bimodal
    expect(calculateStats([1, 2, 3]).mode).toEqual([]); // no mode
  });

  it('computes quartiles and IQR (median-of-halves, even count)', () => {
    const r = calculateStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(r.median).toBe(4.5);
    expect(r.q1).toBe(4); // median of [2,4,4,4]
    expect(r.q3).toBe(6); // median of [5,5,7,9]
    expect(r.iqr).toBe(2);
  });

  it('computes quartiles excluding the median for an odd count', () => {
    const r = calculateStats([1, 2, 3, 4, 5]);
    expect(r.q1).toBe(1.5); // median of lower half [1,2]
    expect(r.q3).toBe(4.5); // median of upper half [4,5]
    expect(r.iqr).toBe(3);
  });

  it('handles a single value', () => {
    const r = calculateStats([5]);
    expect(r.mean).toBe(5);
    expect(r.median).toBe(5);
    expect(r.mode).toEqual([]);
    expect(r.populationSD).toBe(0);
    expect(Number.isNaN(r.sampleSD)).toBe(true);
    expect(Number.isNaN(r.q1)).toBe(true);
  });

  it('handles an empty set', () => {
    const r = calculateStats([]);
    expect(r.count).toBe(0);
    expect(r.mode).toEqual([]);
    expect(r.sorted).toEqual([]);
    expect(Number.isNaN(r.mean)).toBe(true);
  });
});

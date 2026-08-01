import { describe, it, expect } from 'vitest';
import { calculateStats, parseNumberList, type StatsResult } from './statistics';

/**
 * Characterization suite for the descriptive-statistics engine (R13B1 Commit 1).
 *
 * This FREEZES the current behaviour of `parseNumberList` and `calculateStats`
 * ahead of the task-first migration; it does NOT change the module. The binding
 * (`statistics-form.ts`) layers strict token REJECTION and a minimum-data policy
 * on top of the unchanged formula — this file pins exactly what that binding
 * wraps, including the lenient parse (invalid tokens silently dropped), the
 * quartile method (Tukey's hinges), the population/sample split, and the fact
 * that the formula itself does NOT sanitise non-finite inputs (so the binding
 * must reject them before calling it).
 */

/** Every field the result contract exposes, frozen so a shape change is caught. */
const STATS_KEYS = [
  'count', 'iqr', 'max', 'mean', 'median', 'min', 'mode',
  'populationSD', 'populationVariance', 'q1', 'q3', 'range',
  'sampleSD', 'sampleVariance', 'sorted', 'sum', 'sumSquares',
] as const;

describe('statistics — result contract', () => {
  it('exposes exactly the 17 StatsResult fields (no more, no fewer)', () => {
    const r = calculateStats([1, 2, 3]);
    expect(Object.keys(r).sort()).toEqual([...STATS_KEYS].sort());
  });
});

describe('statistics — parseNumberList (lenient parse, frozen)', () => {
  it('splits on commas', () => {
    expect(parseNumberList('1,2,3')).toEqual([1, 2, 3]);
  });
  it('splits on spaces', () => {
    expect(parseNumberList('1 2 3')).toEqual([1, 2, 3]);
  });
  it('splits on tabs', () => {
    expect(parseNumberList('1\t2\t3')).toEqual([1, 2, 3]);
  });
  it('splits on new lines', () => {
    expect(parseNumberList('1\n2\n3')).toEqual([1, 2, 3]);
  });
  it('splits on mixed delimiters', () => {
    expect(parseNumberList('2, 4 6\n8\t10')).toEqual([2, 4, 6, 8, 10]);
  });
  it('ignores surrounding whitespace', () => {
    expect(parseNumberList('  5 ,  6  ')).toEqual([5, 6]);
  });
  it('ignores empty fragments from repeated separators', () => {
    expect(parseNumberList('1,,,2, ,3')).toEqual([1, 2, 3]);
  });
  it('keeps negative values', () => {
    expect(parseNumberList('-2, -3.5, 4')).toEqual([-2, -3.5, 4]);
  });
  it('keeps decimals', () => {
    expect(parseNumberList('0.5, 1.25, 2.5')).toEqual([0.5, 1.25, 2.5]);
  });
  it('keeps scientific notation (source-supported via Number())', () => {
    expect(parseNumberList('1e3, 2.5e-1')).toEqual([1000, 0.25]);
  });
  it('silently DROPS invalid alphabetic tokens', () => {
    expect(parseNumberList('1, abc, 3')).toEqual([1, 3]);
    expect(parseNumberList('12px, 5')).toEqual([5]);
    expect(parseNumberList('4.5.6, 7')).toEqual([7]);
  });
  it('silently DROPS a NaN token', () => {
    expect(parseNumberList('1, NaN, 3')).toEqual([1, 3]);
  });
  it('silently DROPS Infinity and -Infinity tokens', () => {
    expect(parseNumberList('1, Infinity, 3')).toEqual([1, 3]);
    expect(parseNumberList('1, -Infinity, 3')).toEqual([1, 3]);
  });
  it('returns an empty array for empty or whitespace-only text', () => {
    expect(parseNumberList('')).toEqual([]);
    expect(parseNumberList('   \n\t ')).toEqual([]);
  });
});

describe('statistics — empty data set', () => {
  it('returns count 0, empty mode/sorted and NaN for every numeric field', () => {
    const r = calculateStats([]);
    expect(r.count).toBe(0);
    expect(r.mode).toEqual([]);
    expect(r.sorted).toEqual([]);
    for (const k of ['sum', 'mean', 'median', 'min', 'max', 'range', 'q1', 'q3', 'iqr',
      'populationVariance', 'populationSD', 'sampleVariance', 'sampleSD', 'sumSquares'] as const) {
      expect(Number.isNaN(r[k] as number)).toBe(true);
    }
  });
});

describe('statistics — one value', () => {
  const r = calculateStats([5]);
  it('reports central tendency as the value itself', () => {
    expect(r.count).toBe(1);
    expect(r.sum).toBe(5);
    expect(r.mean).toBe(5);
    expect(r.median).toBe(5);
    expect(r.min).toBe(5);
    expect(r.max).toBe(5);
    expect(r.range).toBe(0);
    expect(r.mode).toEqual([]); // a single value has no repeat → no mode
  });
  it('defines population dispersion as 0', () => {
    expect(r.populationVariance).toBe(0);
    expect(r.populationSD).toBe(0);
    expect(r.sumSquares).toBe(0);
  });
  it('leaves sample dispersion and quartiles NaN (undefined for n = 1)', () => {
    expect(Number.isNaN(r.sampleVariance)).toBe(true);
    expect(Number.isNaN(r.sampleSD)).toBe(true);
    expect(Number.isNaN(r.q1)).toBe(true);
    expect(Number.isNaN(r.q3)).toBe(true);
    expect(Number.isNaN(r.iqr)).toBe(true);
  });
});

describe('statistics — two values', () => {
  const r = calculateStats([4, 10]);
  it('computes mean, median, range and sum of squares', () => {
    expect(r.mean).toBe(7);
    expect(r.median).toBe(7);
    expect(r.min).toBe(4);
    expect(r.max).toBe(10);
    expect(r.range).toBe(6);
    expect(r.sumSquares).toBeCloseTo(18, 9); // 9 + 9
  });
  it('computes population and sample dispersion', () => {
    expect(r.populationVariance).toBeCloseTo(9, 9); // 18 / 2
    expect(r.populationSD).toBeCloseTo(3, 9);
    expect(r.sampleVariance).toBeCloseTo(18, 9); // 18 / 1
    expect(r.sampleSD).toBeCloseTo(4.2426407, 6);
  });
  it('defines quartiles from the two singleton halves', () => {
    expect(r.q1).toBe(4); // median of the lower half [4]
    expect(r.q3).toBe(10); // median of the upper half [10]
    expect(r.iqr).toBe(6);
  });
});

describe('statistics — an ordinary data set (frozen field-by-field)', () => {
  const r = calculateStats([2, 4, 4, 4, 5, 5, 7, 9]);
  it('freezes count, sum, mean, min, max, range and sorted', () => {
    expect(r.count).toBe(8);
    expect(r.sum).toBe(40);
    expect(r.mean).toBe(5);
    expect(r.min).toBe(2);
    expect(r.max).toBe(9);
    expect(r.range).toBe(7);
    expect(r.sorted).toEqual([2, 4, 4, 4, 5, 5, 7, 9]);
  });
  it('freezes median, mode and quartiles', () => {
    expect(r.median).toBe(4.5);
    expect(r.mode).toEqual([4]); // 4 appears three times
    expect(r.q1).toBe(4); // median of [2,4,4,4]
    expect(r.q3).toBe(6); // median of [5,5,7,9]
    expect(r.iqr).toBe(2);
  });
  it('freezes population and sample dispersion', () => {
    expect(r.sumSquares).toBeCloseTo(32, 9);
    expect(r.populationVariance).toBeCloseTo(4, 9);
    expect(r.populationSD).toBeCloseTo(2, 9);
    expect(r.sampleVariance).toBeCloseTo(4.5714286, 6);
    expect(r.sampleSD).toBeCloseTo(2.1380899, 6);
  });
});

describe('statistics — negative and decimal data', () => {
  const r = calculateStats([-2.5, 0, 2.5]);
  it('handles a symmetric signed set', () => {
    expect(r.sum).toBe(0);
    expect(r.mean).toBe(0);
    expect(r.median).toBe(0);
    expect(r.min).toBe(-2.5);
    expect(r.max).toBe(2.5);
    expect(r.range).toBe(5);
  });
  it('computes dispersion around the mean', () => {
    expect(r.sumSquares).toBeCloseTo(12.5, 9);
    expect(r.populationVariance).toBeCloseTo(4.1666667, 6);
    expect(r.sampleVariance).toBeCloseTo(6.25, 9);
    expect(r.sampleSD).toBeCloseTo(2.5, 9);
  });
  it('computes quartiles from the excluded-median halves (odd n)', () => {
    expect(r.q1).toBe(-2.5);
    expect(r.q3).toBe(2.5);
    expect(r.iqr).toBe(5);
  });
});

describe('statistics — mode', () => {
  it('finds a single mode', () => {
    expect(calculateStats([1, 2, 2, 3]).mode).toEqual([2]);
  });
  it('lists every value in a multimodal set, sorted ascending', () => {
    expect(calculateStats([1, 1, 2, 2, 3]).mode).toEqual([1, 2]);
    expect(calculateStats([3, 3, 1, 1, 2, 2]).mode).toEqual([1, 2, 3]); // trimodal
  });
  it('reports no mode when every value is unique', () => {
    expect(calculateStats([1, 2, 3]).mode).toEqual([]);
  });
  it('treats all-equal values as a single mode', () => {
    const r = calculateStats([4, 4, 4]);
    expect(r.mode).toEqual([4]);
    expect(r.range).toBe(0);
    expect(r.populationSD).toBe(0);
    expect(r.sampleSD).toBe(0);
  });
});

describe('statistics — quartiles (Tukey hinges)', () => {
  it('even-length data splits into two halves', () => {
    const r = calculateStats([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.median).toBe(4.5);
    expect(r.q1).toBe(2.5); // median of [1,2,3,4]
    expect(r.q3).toBe(6.5); // median of [5,6,7,8]
    expect(r.iqr).toBe(4);
  });
  it('odd-length data excludes the overall median from each half', () => {
    const r = calculateStats([1, 2, 3, 4, 5, 6, 7]);
    expect(r.median).toBe(4);
    expect(r.q1).toBe(2); // median of [1,2,3]
    expect(r.q3).toBe(6); // median of [5,6,7]
    expect(r.iqr).toBe(4);
  });
  it('is independent of input order (sorts internally)', () => {
    const r = calculateStats([5, 1, 3, 2, 4]);
    expect(r.sorted).toEqual([1, 2, 3, 4, 5]);
    expect(r.median).toBe(3);
    expect(r.q1).toBe(1.5); // median of [1,2]
    expect(r.q3).toBe(4.5); // median of [4,5]
  });
});

describe('statistics — non-finite SOURCE input is NOT sanitised by the formula', () => {
  // The engine propagates non-finite values rather than guarding them; this is
  // precisely why the binding must reject invalid tokens BEFORE calling it.
  it('propagates a NaN element into the aggregates', () => {
    const r = calculateStats([1, NaN, 3]);
    expect(Number.isNaN(r.sum)).toBe(true);
    expect(Number.isNaN(r.mean)).toBe(true);
  });
  it('propagates +Infinity into the mean (never a finite result)', () => {
    const r = calculateStats([1, Infinity, 3]);
    expect(Number.isFinite(r.mean)).toBe(false);
    expect(Number.isFinite(r.populationSD)).toBe(false);
  });
  it('propagates -Infinity into the mean', () => {
    const r = calculateStats([1, -Infinity, 3]);
    expect(Number.isFinite(r.mean)).toBe(false);
  });
});

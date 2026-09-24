import { describe, it, expect } from 'vitest';
import {
  standardDeviation,
  confidenceTable,
  frequencyTable,
  CONFIDENCE_LEVELS,
  SYMBOLS,
} from './standard-deviation';

/** The reference's own worked example, printed from its page. */
const DATA = [10, 12, 23, 23, 16, 23, 21, 16];
const sig = (v: number) => Number(v.toPrecision(14));

describe('standard deviation — the reference example as a POPULATION', () => {
  const r = standardDeviation(DATA, 'population');

  it('counts, sums and averages as the reference does', () => {
    expect(r.count).toBe(8);
    expect(r.sum).toBe(144);
    expect(r.mean).toBe(18);
  });

  it('divides the sum of squared deviations by N', () => {
    expect(r.sumSquaredDeviations).toBe(192);
    expect(r.divisor).toBe(8);
    expect(r.variance).toBe(24);
  });

  it('matches the reference standard deviation and standard error to fourteen figures', () => {
    expect(sig(r.standardDeviation)).toBe(4.8989794855664);
    expect(sig(r.sem)).toBe(1.7320508075689);
  });

  it('uses the population symbols', () => {
    expect(r.symbols).toEqual(SYMBOLS.population);
    expect(r.symbols.sd).toBe('σ');
    expect(r.symbols.mean).toBe('μ');
  });
});

describe('standard deviation — the same data as a SAMPLE', () => {
  const r = standardDeviation(DATA, 'sample');

  it('divides by n − 1 instead of n', () => {
    expect(r.divisor).toBe(7);
    expect(r.sumSquaredDeviations).toBe(192); // the deviations do not change
    expect(sig(r.variance)).toBe(27.428571428571);
    expect(sig(r.standardDeviation)).toBe(5.2372293656638);
  });

  it('leaves count, sum and mean alone — it is the same data', () => {
    expect(r.count).toBe(8);
    expect(r.sum).toBe(144);
    expect(r.mean).toBe(18);
  });

  it('uses the sample symbols', () => {
    expect(r.symbols.sd).toBe('s');
    expect(r.symbols.mean).toBe('x̄');
    expect(r.symbols.count).toBe('n');
  });

  it('has no variance at all for a sample of one, rather than a coerced zero', () => {
    const one = standardDeviation([5], 'sample');
    expect(one.divisor).toBe(0);
    expect(one.variance).toBeNaN();
    expect(one.standardDeviation).toBeNaN();
    expect(one.sem).toBeNaN();
    expect(one.confidence).toEqual([]);
  });
});

describe('confidence table', () => {
  const r = standardDeviation(DATA, 'population');

  it('offers the reference eight levels with its printed multipliers', () => {
    expect(CONFIDENCE_LEVELS.map((c) => c.level)).toEqual([
      '68.3%', '90%', '95%', '99%', '99.9%', '99.99%', '99.999%', '99.9999%',
    ]);
    expect(CONFIDENCE_LEVELS.map((c) => c.z)).toEqual([1, 1.645, 1.96, 2.576, 3.291, 3.891, 4.417, 4.892]);
  });

  it('writes the multiplier the way the reference writes it', () => {
    expect(r.confidence[0].multiplier).toBe('σx̄'); // no "1.000" at 68.3%
    expect(r.confidence[2].multiplier).toBe('1.960σx̄'); // three decimals, kept
    expect(standardDeviation(DATA, 'sample').confidence[1].multiplier).toBe('1.645sx̄');
  });

  it('reproduces the reference margins and percentages', () => {
    const three = (v: number) => Number(v.toFixed(3));
    const two = (v: number) => v.toFixed(2);
    expect(r.confidence.map((c) => three(c.margin))).toEqual([
      1.732, 2.849, 3.395, 4.462, 5.7, 6.739, 7.65, 8.473,
    ]);
    expect(r.confidence.map((c) => two(c.percent))).toEqual([
      '9.62', '15.83', '18.86', '24.79', '31.67', '37.44', '42.50', '47.07',
    ]);
  });

  it('draws a shorter bar as the whisker widens, on a 0 → mean + margin axis', () => {
    const fractions = r.confidence.map((c) => c.barFraction);
    for (let i = 1; i < fractions.length; i += 1) expect(fractions[i]).toBeLessThan(fractions[i - 1]);
    expect(fractions.every((f) => f > 0 && f <= 1)).toBe(true);
    expect(r.confidence.every((c) => c.lowFraction >= 0 && c.lowFraction <= c.barFraction)).toBe(true);
  });

  it('reports no percentage rather than dividing by a zero mean', () => {
    const zero = standardDeviation([-1, 0, 1], 'population');
    expect(zero.mean).toBe(0);
    expect(zero.confidence[0].percent).toBeNaN();
    expect(Number.isFinite(zero.confidence[0].margin)).toBe(true);
  });

  it('is empty when there is nothing to be confident about', () => {
    expect(confidenceTable(Number.NaN, 1, SYMBOLS.population)).toEqual([]);
    expect(confidenceTable(1, Number.NaN, SYMBOLS.population)).toEqual([]);
  });
});

describe('frequency table', () => {
  it('reproduces the reference table, in ascending value order', () => {
    expect(frequencyTable(DATA)).toEqual([
      { value: 10, count: 1, percent: 12.5 },
      { value: 12, count: 1, percent: 12.5 },
      { value: 16, count: 2, percent: 25 },
      { value: 21, count: 1, percent: 12.5 },
      { value: 23, count: 3, percent: 37.5 },
    ]);
  });

  it('accounts for every value exactly once', () => {
    const rows = frequencyTable(DATA);
    expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(DATA.length);
    expect(rows.reduce((sum, row) => sum + row.percent, 0)).toBeCloseTo(100, 10);
  });

  it('handles negatives and decimals', () => {
    expect(frequencyTable([-2, 1.5, -2])).toEqual([
      { value: -2, count: 2, percent: (2 / 3) * 100 },
      { value: 1.5, count: 1, percent: (1 / 3) * 100 },
    ]);
  });
});

describe('edge cases', () => {
  it('returns a defined, non-numeric shape for an empty set', () => {
    const r = standardDeviation([], 'population');
    expect(r.count).toBe(0);
    expect(r.standardDeviation).toBeNaN();
    expect(r.confidence).toEqual([]);
    expect(r.frequency).toEqual([]);
  });

  it('gives a population of one a standard deviation of zero', () => {
    const r = standardDeviation([5], 'population');
    expect(r.variance).toBe(0);
    expect(r.standardDeviation).toBe(0);
    expect(r.sem).toBe(0);
  });

  it('handles identical values, negatives and decimals', () => {
    expect(standardDeviation([3, 3, 3], 'population').standardDeviation).toBe(0);
    expect(sig(standardDeviation([-4, -2, -9], 'population').mean)).toBe(-5);
    expect(standardDeviation([1.5, 2.5], 'population').standardDeviation).toBeCloseTo(0.5, 12);
  });

  it('sorts without disturbing the entered order, which the working quotes', () => {
    const r = standardDeviation(DATA, 'population');
    expect(r.values).toEqual(DATA);
    expect(r.sorted).toEqual([10, 12, 16, 16, 21, 23, 23, 23]);
  });
});

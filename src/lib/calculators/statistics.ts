/**
 * Descriptive statistics for a data set — central tendency (mean, median,
 * mode), dispersion (range, variance, standard deviation, IQR) and the
 * five-number summary (min, Q1, median, Q3, max), for both population and
 * sample. Pure and unit-tested.
 *
 * Quartiles use the median-of-halves method (Tukey's hinges), excluding the
 * overall median from each half when the count is odd. This is the convention
 * taught in most introductory statistics courses; interpolation-based tools
 * (e.g. some spreadsheet functions) can differ slightly, which is noted on the
 * page.
 */

export interface StatsResult {
  count: number;
  sum: number;
  mean: number;
  median: number;
  /** Most frequent value(s). Empty when every value is unique (no mode). */
  mode: number[];
  /** How many times each mode appears. 0 when there is no mode. */
  modeFrequency: number;
  min: number;
  max: number;
  range: number;
  /** First quartile (25th percentile). */
  q1: number;
  /** Third quartile (75th percentile). */
  q3: number;
  /** Interquartile range, Q3 − Q1. */
  iqr: number;
  populationVariance: number;
  populationSD: number;
  sampleVariance: number;
  sampleSD: number;
  /** Sum of squared deviations from the mean, Σ(x − mean)². */
  sumSquares: number;
  /** The nth root of the product of the values. NaN unless every value is positive. */
  geometricMean: number;
  /** Σx² — the sum of the SQUARED values (not the squared sum, and not Σ(x − mean)²). */
  sumOfSquaredValues: number;
  /** The input values sorted ascending (useful for plotting/inspection). */
  sorted: number[];
}

/** Parse a free-form list of numbers separated by commas, spaces or newlines. */
export function parseNumberList(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

/** Median of an already-ascending-sorted array. NaN for an empty array. */
function medianOfSorted(s: number[]): number {
  const n = s.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function calculateStats(values: number[]): StatsResult {
  const n = values.length;
  const empty: StatsResult = {
    count: n, sum: NaN, mean: NaN, median: NaN, mode: [], modeFrequency: 0,
    min: NaN, max: NaN, range: NaN, q1: NaN, q3: NaN, iqr: NaN,
    populationVariance: NaN, populationSD: NaN, sampleVariance: NaN, sampleSD: NaN,
    sumSquares: NaN, geometricMean: NaN, sumOfSquaredValues: NaN, sorted: [],
  };
  if (n === 0) return empty;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const sumSquares = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  const sumOfSquaredValues = values.reduce((s, v) => s + v * v, 0);
  const populationVariance = sumSquares / n;
  const sampleVariance = n > 1 ? sumSquares / (n - 1) : NaN;

  // Mode: value(s) with the highest frequency; none if every value is unique.
  const freq = new Map<number, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  let maxFreq = 0;
  for (const c of freq.values()) if (c > maxFreq) maxFreq = c;
  const mode = maxFreq <= 1
    ? []
    : [...freq.entries()].filter(([, c]) => c === maxFreq).map(([v]) => v).sort((a, b) => a - b);
  const modeFrequency = mode.length ? maxFreq : 0;

  /*
   * Geometric mean: the nth root of the product, computed through logarithms so a long data set
   * cannot overflow the product to Infinity on its way to a finite answer. It is defined only for
   * strictly positive values — a zero collapses it and a negative makes it imaginary — so it is
   * NaN otherwise rather than a number that would quietly mean nothing.
   */
  const allPositive = values.every((v) => v > 0);
  const geometricMean = allPositive ? Math.exp(values.reduce((s, v) => s + Math.log(v), 0) / n) : NaN;

  // Quartiles via median of the lower/upper halves (excluding the median for odd n).
  const mid = Math.floor(n / 2);
  const lowerHalf = sorted.slice(0, mid);
  const upperHalf = n % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
  const q1 = medianOfSorted(lowerHalf);
  const q3 = medianOfSorted(upperHalf);

  const min = sorted[0];
  const max = sorted[n - 1];

  return {
    count: n,
    sum,
    mean,
    median: medianOfSorted(sorted),
    mode,
    modeFrequency,
    min,
    max,
    range: max - min,
    q1,
    q3,
    iqr: q3 - q1,
    populationVariance,
    populationSD: Math.sqrt(populationVariance),
    sampleVariance,
    sampleSD: Number.isNaN(sampleVariance) ? NaN : Math.sqrt(sampleVariance),
    sumSquares,
    geometricMean,
    sumOfSquaredValues,
    sorted,
  };
}

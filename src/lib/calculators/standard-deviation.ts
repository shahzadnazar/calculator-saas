/**
 * Descriptive statistics: mean, variance and standard deviation (population and
 * sample). Pure and unit-tested.
 */

export interface StatsResult {
  count: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
  populationVariance: number;
  populationSD: number;
  sampleVariance: number;
  sampleSD: number;
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

export function calculateStats(values: number[]): StatsResult {
  const n = values.length;
  const empty: StatsResult = {
    count: n, sum: NaN, mean: NaN, min: NaN, max: NaN,
    populationVariance: NaN, populationSD: NaN, sampleVariance: NaN, sampleSD: NaN,
  };
  if (n === 0) return empty;

  const sum = values.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const sqDiff = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  const populationVariance = sqDiff / n;
  const sampleVariance = n > 1 ? sqDiff / (n - 1) : NaN;

  return {
    count: n,
    sum,
    mean,
    min: Math.min(...values),
    max: Math.max(...values),
    populationVariance,
    populationSD: Math.sqrt(populationVariance),
    sampleVariance,
    sampleSD: Number.isNaN(sampleVariance) ? NaN : Math.sqrt(sampleVariance),
  };
}

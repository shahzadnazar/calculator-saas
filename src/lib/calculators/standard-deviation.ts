/**
 * Standard deviation, with the working and the margin of error — pure and unit-tested.
 *
 * The reference's standard deviation calculator is not the statistics calculator with one figure
 * picked out. It asks a question the statistics table never asks — is this a population or a
 * sample — and it answers with the derivation, the confidence intervals around the mean, and how
 * often each value occurred. Those are four different things and each one is the reason somebody
 * lands on that page rather than the summary table.
 *
 * Everything here is arithmetic over a list of numbers. Formatting, validation and the DOM live
 * elsewhere; this module never rounds and never returns a string.
 */

/** Whether the numbers are the whole group, or a sample drawn from a larger one. */
export type SdMode = 'population' | 'sample';

/** The symbols the working uses, which differ entirely between the two modes. */
export interface SdSymbols {
  /** σ or s */
  sd: string;
  /** σ² or s² */
  variance: string;
  /** μ or x̄ */
  mean: string;
  /** N or n */
  count: string;
  /** σx̄ or sx̄ — the standard error of the mean */
  sem: string;
}

export const SYMBOLS: Record<SdMode, SdSymbols> = {
  population: { sd: 'σ', variance: 'σ²', mean: 'μ', count: 'N', sem: 'σx̄' },
  sample: { sd: 's', variance: 's²', mean: 'x̄', count: 'n', sem: 'sx̄' },
};

/**
 * The confidence levels the reference tabulates, with the multiple of the standard error each one
 * uses. These are the reference's own printed multipliers, not re-derived from a normal quantile —
 * 1.960 and 2.576 are the conventional rounded values and the table must reproduce them exactly.
 */
export const CONFIDENCE_LEVELS: readonly { level: string; z: number }[] = [
  { level: '68.3%', z: 1 },
  { level: '90%', z: 1.645 },
  { level: '95%', z: 1.96 },
  { level: '99%', z: 2.576 },
  { level: '99.9%', z: 3.291 },
  { level: '99.99%', z: 3.891 },
  { level: '99.999%', z: 4.417 },
  { level: '99.9999%', z: 4.892 },
];

export interface ConfidenceRow {
  level: string;
  z: number;
  /** How the multiplier is written in the table: "σx̄" at 68.3%, "1.645σx̄" above it. */
  multiplier: string;
  /** z × the standard error of the mean. */
  margin: number;
  /** The margin as a percentage of the mean. NaN when the mean is zero. */
  percent: number;
  /** Where the mean sits on a 0 → mean + margin axis, as a fraction. For the error bar. */
  barFraction: number;
  /** The low end of the whisker on that same axis, as a fraction. */
  lowFraction: number;
}

export interface FrequencyRow {
  value: number;
  count: number;
  /** Share of the data set, 0–100. */
  percent: number;
}

export interface SdResult {
  mode: SdMode;
  symbols: SdSymbols;
  values: number[];
  sorted: number[];
  count: number;
  sum: number;
  mean: number;
  /** Σ(xᵢ − mean)². */
  sumSquaredDeviations: number;
  /** N for a population, N − 1 for a sample. */
  divisor: number;
  variance: number;
  standardDeviation: number;
  /** The standard error of the mean, sd ÷ √N. */
  sem: number;
  confidence: ConfidenceRow[];
  frequency: FrequencyRow[];
}

const EMPTY_RESULT = (mode: SdMode, values: number[]): SdResult => ({
  mode,
  symbols: SYMBOLS[mode],
  values,
  sorted: [],
  count: values.length,
  sum: Number.NaN,
  mean: Number.NaN,
  sumSquaredDeviations: Number.NaN,
  divisor: Number.NaN,
  variance: Number.NaN,
  standardDeviation: Number.NaN,
  sem: Number.NaN,
  confidence: [],
  frequency: [],
});

/** How often each distinct value occurs, in ascending value order. */
export function frequencyTable(values: readonly number[]): FrequencyRow[] {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({ value, count, percent: (count / values.length) * 100 }));
}

/**
 * The confidence table: a margin of error at each level, and the geometry of the error bar.
 *
 * The bar is drawn on a per-row axis running 0 → mean + margin, which is why the blue bar shortens
 * as the whisker widens: the same mean occupies less of a longer axis.
 */
export function confidenceTable(mean: number, sem: number, symbols: SdSymbols): ConfidenceRow[] {
  if (!Number.isFinite(mean) || !Number.isFinite(sem)) return [];
  return CONFIDENCE_LEVELS.map(({ level, z }) => {
    const margin = z * sem;
    const axis = Math.abs(mean) + margin;
    return {
      level,
      z,
      multiplier: z === 1 ? symbols.sem : `${z.toFixed(3)}${symbols.sem}`,
      margin,
      percent: mean === 0 ? Number.NaN : (margin / Math.abs(mean)) * 100,
      barFraction: axis === 0 ? 0 : Math.abs(mean) / axis,
      lowFraction: axis === 0 ? 0 : Math.max(0, (Math.abs(mean) - margin) / axis),
    };
  });
}

/**
 * Every figure the page reports, for one data set in one mode.
 *
 * A sample of one has no variance — dividing by n − 1 divides by zero — so the dispersion figures
 * are NaN rather than a coerced 0, and the presentation layer says so.
 */
export function standardDeviation(values: number[], mode: SdMode): SdResult {
  const count = values.length;
  if (count === 0) return EMPTY_RESULT(mode, values);

  const symbols = SYMBOLS[mode];
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;
  const sumSquaredDeviations = values.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  const divisor = mode === 'sample' ? count - 1 : count;
  const variance = divisor > 0 ? sumSquaredDeviations / divisor : Number.NaN;
  const standardDeviation = Number.isFinite(variance) ? Math.sqrt(variance) : Number.NaN;
  const sem = Number.isFinite(standardDeviation) ? standardDeviation / Math.sqrt(count) : Number.NaN;

  return {
    mode,
    symbols,
    values: [...values],
    sorted: [...values].sort((a, b) => a - b),
    count,
    sum,
    mean,
    sumSquaredDeviations,
    divisor,
    variance,
    standardDeviation,
    sem,
    confidence: confidenceTable(mean, sem, symbols),
    frequency: frequencyTable(values),
  };
}

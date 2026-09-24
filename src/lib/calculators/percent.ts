/**
 * Percentage helpers covering the most-searched questions. Pure + tested.
 */

/** "What is P% of X?" e.g. percentOf(15, 200) = 30 */
export function percentOf(percent: number, value: number): number {
  return (percent / 100) * value;
}

/** "A is what percent of B?" e.g. whatPercent(30, 200) = 15 */
export function whatPercent(part: number, whole: number): number {
  if (whole === 0) return NaN;
  return (part / whole) * 100;
}

/** "Percent change from A to B?" e.g. percentChange(200, 250) = 25 (increase) */
export function percentChange(from: number, to: number): number {
  if (from === 0) return NaN;
  return ((to - from) / Math.abs(from)) * 100;
}

/**
 * "A is P% of what?" — solves for the whole. e.g. percentOfWhat(30, 15) = 200.
 * A zero percentage has no solution (every whole would satisfy 0% of it = 0),
 * so it returns NaN rather than dividing by zero.
 */
export function percentOfWhat(part: number, percent: number): number {
  if (percent === 0) return NaN;
  return part / (percent / 100);
}

/**
 * Percentage DIFFERENCE between two values — |a − b| as a percentage of their
 * MEAN, so it is symmetric (order does not matter) and always non-negative.
 * This is a different question from percentChange, which is directional and
 * measured against the starting value. e.g. percentageDifference(10, 6) = 50.
 *
 * A mean of zero has no meaningful basis to compare against, so that is NaN.
 */
export function percentageDifference(a: number, b: number): number {
  const mean = (a + b) / 2;
  if (mean === 0) return NaN;
  return (Math.abs(a - b) / Math.abs(mean)) * 100;
}

/**
 * Apply a percentage increase or decrease to a value.
 * e.g. applyPercentChange(500, 10, 'increase') = 550; (500, 10, 'decrease') = 450.
 */
export function applyPercentChange(value: number, percent: number, direction: 'increase' | 'decrease'): number {
  const factor = direction === 'decrease' ? 1 - percent / 100 : 1 + percent / 100;
  return value * factor;
}

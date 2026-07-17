/**
 * Percentage helpers covering the three most-searched questions. Pure + tested.
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

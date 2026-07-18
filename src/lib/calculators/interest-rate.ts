/**
 * Solve for the interest rate on a fixed loan given the payment, amount and
 * term. There is no closed form, so this uses bisection on the (monotonic)
 * payment function. Pure and unit-tested.
 */
import { pmt } from '@lib/finance';

/** Returns the annual interest rate as a percent, or NaN if unsolvable. */
export function solveAnnualRate(principal: number, payment: number, months: number): number {
  const p = principal || 0;
  const n = Math.round(months || 0);
  const pay = payment || 0;
  if (p <= 0 || n <= 0 || pay <= 0) return NaN;
  // If total payments barely exceed principal, the rate is ~0.
  if (pay * n <= p) return 0;

  let lo = 0; // monthly rate
  let hi = 1; // 100%/month — generous upper bound
  // Expand hi until the payment at hi exceeds the target (guards extreme cases).
  for (let k = 0; k < 60 && pmt(p, hi, n) < pay; k++) hi *= 2;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (pmt(p, mid, n) > pay) hi = mid;
    else lo = mid;
  }
  return ((lo + hi) / 2) * 12 * 100;
}

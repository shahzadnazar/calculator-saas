/**
 * Inflation: how buying power changes over time at a constant annual rate.
 * Pure and unit-tested.
 */
export interface InflationInput {
  amount: number;
  annualRatePct: number;
  years: number;
}

export interface InflationResult {
  /** What something costing `amount` today will cost in `years`. */
  futureCost: number;
  /** What `amount` received in `years` is worth in today's money. */
  buyingPower: number;
  /** Total percentage change in prices over the period. */
  totalInflationPct: number;
}

export function adjustForInflation(input: InflationInput): InflationResult {
  const amount = input.amount || 0;
  const factor = Math.pow(1 + (input.annualRatePct || 0) / 100, input.years || 0);
  return {
    futureCost: amount * factor,
    buyingPower: factor === 0 ? NaN : amount / factor,
    totalInflationPct: (factor - 1) * 100,
  };
}

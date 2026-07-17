/**
 * Simple interest: I = P · r · t. Pure and unit-tested.
 */
export interface SimpleInterestInput {
  principal: number;
  annualRatePct: number;
  years: number;
}
export interface SimpleInterestResult {
  interest: number;
  total: number;
}

export function calculateSimpleInterest(input: SimpleInterestInput): SimpleInterestResult {
  const principal = Math.max(0, input.principal || 0);
  const interest = principal * ((input.annualRatePct || 0) / 100) * (input.years || 0);
  return { interest, total: principal + interest };
}

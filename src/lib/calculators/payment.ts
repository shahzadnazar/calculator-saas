/**
 * Payment calculator: solve for the monthly payment given a term, or solve for
 * the term (months) given a fixed payment. Pure and unit-tested.
 */
import { pmt } from '@lib/finance';

export function loanPayment(principal: number, annualRatePct: number, months: number): number {
  return pmt(principal, (annualRatePct || 0) / 100 / 12, months);
}

/**
 * Months needed to pay off `principal` at a fixed monthly `payment`.
 * Returns Infinity when the payment does not even cover the monthly interest.
 */
export function solveMonths(principal: number, annualRatePct: number, payment: number): number {
  const p = Math.max(0, principal || 0);
  const i = (annualRatePct || 0) / 100 / 12;
  const pay = payment || 0;
  if (p === 0) return 0;
  if (pay <= 0) return Infinity;
  if (i === 0) return p / pay;
  if (pay <= p * i) return Infinity; // payment never reduces the balance
  return -Math.log(1 - (p * i) / pay) / Math.log(1 + i);
}

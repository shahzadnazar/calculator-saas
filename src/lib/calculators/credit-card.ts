/**
 * Credit-card payoff: time + interest for a fixed monthly payment, or the
 * payment needed to clear a balance in a target number of months.
 * Pure and unit-tested.
 */
import { pmt } from '@lib/finance';
import { solveMonths } from '@lib/calculators/payment';

export interface PayoffByPaymentResult {
  months: number; // Infinity if the payment never clears the balance
  totalInterest: number;
  totalPaid: number;
}

export function payoffByPayment(
  balance: number,
  aprPct: number,
  monthlyPayment: number,
): PayoffByPaymentResult {
  const bal = Math.max(0, balance || 0);
  const months = solveMonths(bal, aprPct, monthlyPayment);
  if (!Number.isFinite(months)) {
    return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity };
  }
  const whole = Math.ceil(months);
  const totalPaid = (monthlyPayment || 0) * whole;
  return { months: whole, totalInterest: Math.max(0, totalPaid - bal), totalPaid };
}

export interface PayoffByMonthsResult {
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
}

export function payoffByMonths(
  balance: number,
  aprPct: number,
  months: number,
): PayoffByMonthsResult {
  const bal = Math.max(0, balance || 0);
  const n = Math.max(1, Math.round(months || 0));
  const monthlyPayment = pmt(bal, (aprPct || 0) / 100 / 12, n);
  const totalPaid = monthlyPayment * n;
  return { monthlyPayment, totalInterest: Math.max(0, totalPaid - bal), totalPaid };
}

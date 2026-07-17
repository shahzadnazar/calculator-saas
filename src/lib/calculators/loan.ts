/**
 * General fixed-rate loan calculator. Pure and unit-tested.
 */
import { buildAmortization, collapseYearly, type AmortRow } from '@lib/finance';

export interface LoanInput {
  amount: number;
  annualInterestRate: number; // percent
  termYears: number;
}

export interface LoanResult {
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
  payoffMonths: number;
  schedule: AmortRow[];
  yearlySchedule: AmortRow[];
}

export function calculateLoan(input: LoanInput): LoanResult {
  const months = Math.max(0, Math.round((input.termYears || 0) * 12));
  const { payment, totalInterest, schedule } = buildAmortization(
    input.amount,
    input.annualInterestRate,
    months,
  );
  return {
    monthlyPayment: payment,
    totalInterest,
    totalPaid: Math.max(0, input.amount || 0) + totalInterest,
    payoffMonths: schedule.length,
    schedule,
    yearlySchedule: collapseYearly(schedule),
  };
}

/**
 * Home equity: how much you can borrow against your home, and the payment on a
 * home-equity loan. Pure and unit-tested.
 */
import { pmt } from '@lib/finance';

export interface HomeEquityInput {
  homeValue: number;
  mortgageBalance: number;
  /** Maximum combined loan-to-value the lender allows (e.g. 85%). */
  maxLtvPct: number;
  loanAmount: number;
  annualRatePct: number;
  termYears: number;
}

export interface HomeEquityResult {
  /** Equity you hold (value minus what you owe). */
  equity: number;
  /** Maximum you could borrow at the given LTV cap. */
  maxBorrow: number;
  /** Monthly payment on the requested loan amount. */
  monthlyPayment: number;
  /** True if the requested loan exceeds the max borrowable. */
  exceedsMax: boolean;
}

export function calculateHomeEquity(input: HomeEquityInput): HomeEquityResult {
  const value = Math.max(0, input.homeValue || 0);
  const owed = Math.max(0, input.mortgageBalance || 0);
  const equity = Math.max(0, value - owed);
  const maxBorrow = Math.max(0, value * ((input.maxLtvPct || 0) / 100) - owed);
  const loan = Math.max(0, input.loanAmount || 0);
  const monthlyPayment = pmt(loan, (input.annualRatePct || 0) / 100 / 12, Math.round((input.termYears || 0) * 12));
  return { equity, maxBorrow, monthlyPayment, exceedsMax: loan > maxBorrow + 0.005 };
}

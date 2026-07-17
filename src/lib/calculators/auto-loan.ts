/**
 * Auto loan calculator — payment plus taxes, fees, trade-in and down payment.
 * Pure and unit-tested. Ported and cleaned up from the original site logic.
 */
import { pmt } from '@lib/finance';

export interface AutoLoanInput {
  autoPrice: number;
  loanTermMonths: number;
  interestRatePct: number;
  downPayment: number;
  tradeInValue: number;
  amountOwedOnTradeIn: number;
  salesTaxRatePct: number;
  fees: number;
  /** Roll sales tax + fees into the financed amount instead of paying upfront. */
  includeTaxesFeesInLoan: boolean;
}

export interface AutoLoanResult {
  salesTax: number;
  loanAmount: number;
  monthlyPayment: number;
  totalLoanInterest: number;
  totalOfPayments: number;
  upfrontPayment: number;
  totalCost: number;
}

export function calculateAutoLoan(input: AutoLoanInput): AutoLoanResult {
  const price = Math.max(0, input.autoPrice || 0);
  const months = Math.max(0, Math.round(input.loanTermMonths || 0));
  const monthlyRate = (input.interestRatePct || 0) / 100 / 12;
  const salesTax = price * ((input.salesTaxRatePct || 0) / 100);
  const fees = input.fees || 0;

  const netTradeIn = (input.tradeInValue || 0) - (input.amountOwedOnTradeIn || 0);
  const cashDown = (input.downPayment || 0) + netTradeIn;

  let loanAmount = input.includeTaxesFeesInLoan
    ? price + salesTax + fees - cashDown
    : price - cashDown;
  if (loanAmount < 0) loanAmount = 0;

  const monthlyPayment = pmt(loanAmount, monthlyRate, months);
  const totalOfPayments = monthlyPayment * months;
  const totalLoanInterest = totalOfPayments - loanAmount;

  const upfrontPayment =
    (input.downPayment || 0) + (input.includeTaxesFeesInLoan ? 0 : salesTax + fees);

  const totalCost = price + salesTax + fees + Math.max(0, totalLoanInterest);

  return {
    salesTax,
    loanAmount,
    monthlyPayment,
    totalLoanInterest: Math.max(0, totalLoanInterest),
    totalOfPayments,
    upfrontPayment,
    totalCost,
  };
}

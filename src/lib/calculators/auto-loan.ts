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
  /**
   * Manufacturer rebates and dealer cash. A credit against the amount FINANCED, not
   * against the taxable price — most states tax the pre-rebate price — so it lowers
   * the loan and the total cost but never the sales tax. Omitted or 0 → no effect.
   */
  cashIncentives?: number;
}

/** One month of the repayment schedule. `payment` is always `interest + principal`. */
export interface AutoLoanRow {
  period: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

export interface AutoLoanResult {
  salesTax: number;
  loanAmount: number;
  monthlyPayment: number;
  totalLoanInterest: number;
  totalOfPayments: number;
  upfrontPayment: number;
  totalCost: number;
  /** Rebates credited against the financed amount. 0 when none were entered. */
  cashIncentives: number;
  /** The month-by-month repayment, and its collapse into years. Empty for a zero loan. */
  schedule: AutoLoanRow[];
  yearlySchedule: AutoLoanRow[];
  /** Principal as a share of everything repaid, 0–1 — what the loan breakdown plots. */
  principalShare: number;
}

export function calculateAutoLoan(input: AutoLoanInput): AutoLoanResult {
  const price = Math.max(0, input.autoPrice || 0);
  const months = Math.max(0, Math.round(input.loanTermMonths || 0));
  const monthlyRate = (input.interestRatePct || 0) / 100 / 12;
  const salesTax = price * ((input.salesTaxRatePct || 0) / 100);
  const fees = input.fees || 0;

  const netTradeIn = (input.tradeInValue || 0) - (input.amountOwedOnTradeIn || 0);
  const incentives = Math.max(0, input.cashIncentives || 0);
  const cashDown = (input.downPayment || 0) + netTradeIn + incentives;

  let loanAmount = input.includeTaxesFeesInLoan
    ? price + salesTax + fees - cashDown
    : price - cashDown;
  if (loanAmount < 0) loanAmount = 0;

  const monthlyPayment = pmt(loanAmount, monthlyRate, months);
  const totalOfPayments = monthlyPayment * months;
  const totalLoanInterest = totalOfPayments - loanAmount;

  const upfrontPayment =
    (input.downPayment || 0) + (input.includeTaxesFeesInLoan ? 0 : salesTax + fees);

  // Rebates are money the buyer never pays, so they come off the total as well as the loan.
  const totalCost = price - incentives + salesTax + fees + Math.max(0, totalLoanInterest);

  const schedule = buildSchedule(loanAmount, monthlyRate, months, monthlyPayment);
  const repaid = totalOfPayments;

  return {
    salesTax,
    loanAmount,
    monthlyPayment,
    totalLoanInterest: Math.max(0, totalLoanInterest),
    totalOfPayments,
    upfrontPayment,
    totalCost,
    cashIncentives: incentives,
    schedule,
    yearlySchedule: collapseYears(schedule),
    principalShare: repaid > 0 ? loanAmount / repaid : 0,
  };
}

/**
 * The month-by-month repayment. The scheduled payment is constant; the final one is
 * capped at whatever balance remains, so the loan closes exactly at zero rather than
 * drifting a cent either way.
 */
function buildSchedule(
  loanAmount: number,
  monthlyRate: number,
  months: number,
  payment: number,
): AutoLoanRow[] {
  const rows: AutoLoanRow[] = [];
  if (!(loanAmount > 0) || !Number.isFinite(payment) || payment <= 0) return rows;
  let balance = loanAmount;
  for (let period = 1; period <= months && balance > 0.005; period++) {
    const interest = balance * monthlyRate;
    let principal = payment - interest;
    if (principal > balance) principal = balance; // final payment
    balance -= principal;
    rows.push({
      period,
      payment: principal + interest,
      interest,
      principal,
      balance: Math.max(0, balance),
    });
  }
  return rows;
}

/** Collapse the monthly schedule into one row per year, closing on that year's balance. */
export function collapseYears(schedule: readonly AutoLoanRow[]): AutoLoanRow[] {
  const yearly: AutoLoanRow[] = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const chunk = schedule.slice(i, i + 12);
    yearly.push({
      period: Math.floor(i / 12) + 1,
      payment: chunk.reduce((s, r) => s + r.payment, 0),
      interest: chunk.reduce((s, r) => s + r.interest, 0),
      principal: chunk.reduce((s, r) => s + r.principal, 0),
      balance: chunk[chunk.length - 1].balance,
    });
  }
  return yearly;
}

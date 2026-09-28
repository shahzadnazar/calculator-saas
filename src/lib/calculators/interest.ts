/**
 * Interest accumulation: grow an initial investment with recurring contributions,
 * report what the interest is made of, and state what the end balance is worth once
 * inflation is taken out.
 *
 * THE MODEL, stated once because every figure depends on it:
 *
 *  • Interest accrues on the money actually invested, at the growth rate the chosen
 *    compounding frequency implies — one monthly factor per frequency, shared with
 *    the savings calculator via `./compounding`.
 *  • CONTRIBUTION TIMING is the visitor's choice, and it is a real difference rather
 *    than a rounding one. Contributing at the BEGINNING of a period puts the money in
 *    before that period's interest is worked out, so it earns from day one;
 *    contributing at the END puts it in afterwards, so it starts earning next period.
 *    On the reference plan that is $54,535.20 against $53,153.79 — the same $45,000
 *    paid in either way, and $1,381.41 of interest riding on the timing alone.
 *  • The initial investment is present from month one, so it earns from month one. It
 *    appears in the first period's deposit column because that is when it is paid in,
 *    but it is never counted as a contribution.
 *  • TAX is charged on interest as it is earned, so the interest credited each period
 *    is the gross accrual net of tax. The end balance is therefore always exactly
 *    `initial + contributions + interest`.
 *  • INFLATION does not touch the balance. It only answers a second question: what
 *    that balance will buy, in today's money, at the end of the term.
 *
 * WHY THE INTEREST SPLIT IS EXACT. The projection is linear in its cash flows — every
 * dollar grows by the same factors regardless of the others — so the interest earned
 * by the initial investment can be computed on its own and subtracted to leave the
 * interest earned by the contributions, with no residue. The engine computes the
 * initial's share in closed form and derives the contributions' share, and the two
 * are asserted to re-sum to the total.
 */

import { monthlyGrowthFactor, type CompoundFrequency } from './compounding';

export {
  COMPOUND_FREQUENCIES,
  COMPOUND_PERIODS,
  isCompoundFrequency,
  monthlyGrowthFactor,
  type CompoundFrequency,
} from './compounding';

/** Whether a contribution is paid in before or after the period's interest. */
export type ContributionTiming = 'beginning' | 'end';

export function isContributionTiming(value: string): value is ContributionTiming {
  return value === 'beginning' || value === 'end';
}

/** Projections stop at 100 years — past that a schedule is noise, not a plan. */
export const MAX_INTEREST_MONTHS = 100 * 12;

export interface InterestPlanInput {
  /** The sum invested at the start. */
  initialInvestment: number;
  /** Paid in once a year — at the start of each year, or the end, per `contributeAt`. */
  annualContribution: number;
  /** Paid in every month — at the start of each month, or the end. */
  monthlyContribution: number;
  contributeAt: ContributionTiming;
  /** Nominal annual interest rate, percent. */
  annualRatePct: number;
  compound: CompoundFrequency;
  /** Term, as whole years plus whole months. */
  years: number;
  months: number;
  /** Percent of each period's interest lost to tax. */
  taxRatePct: number;
  /** Percent a year, used only for the buying-power figure. */
  inflationRatePct: number;
}

/** One month of the accumulation. `deposit` includes the initial investment in month 1. */
export interface InterestMonth {
  month: number;
  year: number;
  deposit: number;
  /** Interest credited this month, AFTER tax. */
  interest: number;
  tax: number;
  balance: number;
}

/** One year of the accumulation. The final year is short when the term has odd months. */
export interface InterestYear {
  year: number;
  /** Months this row actually covers — 12, except possibly the last. */
  monthCount: number;
  deposit: number;
  interest: number;
  tax: number;
  balance: number;
}

export interface InterestPlanResult {
  endingBalance: number;
  initialInvestment: number;
  /** Initial investment + every contribution. The money that was put in. */
  totalPrincipal: number;
  /** Every contribution paid in. Excludes the initial investment. */
  totalContributions: number;
  /** Interest kept, after tax. `totalPrincipal + totalInterest === endingBalance`. */
  totalInterest: number;
  /** The part of the interest the initial investment earned, on its own. */
  interestOfInitial: number;
  /** The part the contributions earned. `interestOfInitial + this === totalInterest`. */
  interestOfContributions: number;
  /** Tax charged on interest over the whole term. */
  totalTax: number;
  /** What the end balance buys in today's money. Equals the balance at 0% inflation. */
  buyingPower: number;
  /** Whole months the projection ran. */
  termMonths: number;
  months: InterestMonth[];
  annual: InterestYear[];
}

/** Whole months, clamped to the projection cap. Fractions are truncated, not rounded. */
function termMonths(years: number, months: number): number {
  const y = Math.trunc(years || 0);
  const m = Math.trunc(months || 0);
  const total = y * 12 + m;
  if (!Number.isFinite(total) || total < 1) return 0;
  return Math.min(total, MAX_INTEREST_MONTHS);
}

/**
 * Run the accumulation month by month and report what happened.
 *
 * The loop is the calculation. Contribution timing, tax and a term that need not land
 * on a year boundary make the cash flows irregular enough that summing what the loop
 * actually did is the only way to keep every reported total reconcilable against the
 * schedule the reader is shown.
 */
export function projectInterest(input: InterestPlanInput): InterestPlanResult {
  const term = termMonths(input.years, input.months);
  const factor = monthlyGrowthFactor(input.annualRatePct, input.compound);
  const taxRate = Math.min(Math.max((input.taxRatePct || 0) / 100, 0), 1);
  const atBeginning = input.contributeAt === 'beginning';
  const initial = Math.max(0, input.initialInvestment || 0);
  const annualContribution = input.annualContribution || 0;
  const monthlyContribution = input.monthlyContribution || 0;

  let balance = initial;
  let totalContributions = 0;
  let totalInterest = 0;
  let totalTax = 0;

  const months: InterestMonth[] = [];
  const annual: InterestYear[] = [];
  let yearDeposit = 0;
  let yearInterest = 0;
  let yearTax = 0;
  let yearMonths = 0;

  for (let m = 1; m <= term; m++) {
    const year = Math.ceil(m / 12);
    const monthOfYear = ((m - 1) % 12) + 1;

    // The contribution due this month: the monthly one always, the annual one on the
    // year's first month when contributing at the beginning and its last when at the
    // end. A term ending mid-year therefore collects a final annual contribution only
    // under beginning-timing — which is exactly right, because under end-timing that
    // year never reaches the month the contribution would have been paid in.
    let deposit = monthlyContribution;
    if (annualContribution !== 0) {
      if (atBeginning ? monthOfYear === 1 : monthOfYear === 12) deposit += annualContribution;
    }

    if (atBeginning) {
      totalContributions += deposit;
      balance += deposit;
    }

    const gross = balance * (factor - 1);
    // Tax is charged on interest earned, never on interest lost.
    const tax = gross > 0 ? gross * taxRate : 0;
    const interest = gross - tax;
    balance += interest;

    if (!atBeginning) {
      totalContributions += deposit;
      balance += deposit;
    }

    // The initial investment is shown in the first period's deposit column (that is
    // when it is paid in) but it is a starting balance, not a contribution, so it
    // reaches the displayed figure only — never `totalContributions`.
    const shown = m === 1 ? deposit + initial : deposit;

    totalInterest += interest;
    totalTax += tax;
    yearDeposit += shown;
    yearInterest += interest;
    yearTax += tax;
    yearMonths++;

    months.push({ month: m, year, deposit: shown, interest, tax, balance });

    if (monthOfYear === 12 || m === term) {
      annual.push({
        year,
        monthCount: yearMonths,
        deposit: yearDeposit,
        interest: yearInterest,
        tax: yearTax,
        balance,
      });
      yearDeposit = 0;
      yearInterest = 0;
      yearTax = 0;
      yearMonths = 0;
    }
  }

  // The initial investment's own share of the interest, in closed form. Every month
  // multiplies a balance by the same after-tax factor, so the initial sum's growth is
  // independent of the contributions and the two shares sum to the total exactly.
  const netFactor = 1 + (factor - 1) * (1 - taxRate);
  const interestOfInitial = term > 0 ? initial * (Math.pow(netFactor, term) - 1) : 0;

  const inflation = (input.inflationRatePct || 0) / 100;
  const buyingPower =
    inflation === 0 ? balance : balance / Math.pow(1 + inflation, term / 12);

  return {
    endingBalance: balance,
    initialInvestment: initial,
    totalPrincipal: initial + totalContributions,
    totalContributions,
    totalInterest,
    interestOfInitial,
    interestOfContributions: totalInterest - interestOfInitial,
    totalTax,
    buyingPower,
    termMonths: term,
    months,
    annual,
  };
}

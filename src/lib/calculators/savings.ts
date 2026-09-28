/**
 * Savings projections: grow an opening deposit with recurring contributions, taxed
 * as the interest is earned, and report the accumulation month by month.
 *
 * THE MODEL, stated once because every figure depends on it:
 *
 *  • Interest accrues on the money actually in the account, at the growth rate the
 *    chosen compounding frequency implies. A nominal rate `r` compounded `n` times
 *    a year multiplies the balance by `(1 + r/n)^(n/12)` each month; continuous
 *    compounding by `e^(r/12)`. Expressing every frequency as one monthly factor is
 *    what lets a single monthly loop serve all nine options with no special cases.
 *  • CONTRIBUTIONS ARE MADE AT THE END OF THEIR PERIOD. A monthly contribution is
 *    credited after that month's interest, an annual contribution after the twelfth
 *    month's. Neither earns interest in the period that created it — the deposit
 *    lands as the period closes.
 *  • The opening deposit is present from month one, so it earns from month one. It
 *    is reported in the first period's deposit column because that is when it is
 *    paid in, but it is never counted as a contribution.
 *  • TAX is charged on interest as it is earned, so the interest actually credited
 *    is the gross accrual net of tax. `endBalance` is therefore always exactly
 *    `initialDeposit + totalContributions + totalInterest`, with `totalInterest`
 *    being the after-tax figure a saver keeps.
 *  • The two increase rates step ONCE A YEAR, not monthly: year `y` contributes
 *    `base × (1 + increase)^(y − 1)`. The fields are labelled "% /year" and they
 *    mean it.
 *
 * Negative opening deposits and negative contributions are deliberately allowed —
 * a negative contribution is a withdrawal, and a saver drawing an account down is
 * a real question this calculator can answer. Nothing here assumes a positive
 * balance.
 */

import { monthlyGrowthFactor, type CompoundFrequency } from './compounding';

/**
 * The compounding primitives live in `./compounding`, shared with the Interest
 * calculator. They stay part of this module's public surface so existing importers
 * (the island's frequency selector, the tests) are unaffected.
 */
export {
  COMPOUND_FREQUENCIES,
  COMPOUND_PERIODS,
  isCompoundFrequency,
  monthlyGrowthFactor,
  type CompoundFrequency,
} from './compounding';

/** Projections stop at 100 years — past that the schedule is noise, not a plan. */
export const MAX_SAVINGS_YEARS = 100;

export interface SavingsPlanInput {
  /** Opening balance. May be negative. */
  initialDeposit: number;
  /** Paid in at the end of each year. May be negative (an annual withdrawal). */
  annualContribution: number;
  /** Percent the annual contribution rises each year. */
  annualIncreasePct: number;
  /** Paid in at the end of each month. May be negative (a monthly withdrawal). */
  monthlyContribution: number;
  /** Percent the monthly contribution rises each year. */
  monthlyIncreasePct: number;
  /** Nominal annual interest rate, percent. */
  annualRatePct: number;
  compound: CompoundFrequency;
  /** Whole years to save, 1 … MAX_SAVINGS_YEARS. */
  years: number;
  /** Percent of each period's interest lost to tax. */
  taxRatePct: number;
}

/** One month of the accumulation. `deposit` includes the opening deposit in month 1. */
export interface SavingsMonth {
  /** 1-based, running across the whole projection. */
  month: number;
  /** 1-based year the month falls in. */
  year: number;
  deposit: number;
  /** Interest credited this month, AFTER tax. */
  interest: number;
  tax: number;
  balance: number;
}

/** One year of the accumulation — the same figures, summed over its twelve months. */
export interface SavingsPlanYear {
  year: number;
  deposit: number;
  interest: number;
  tax: number;
  balance: number;
}

export interface SavingsPlanResult {
  endBalance: number;
  initialDeposit: number;
  /** Every contribution paid in. Excludes the opening deposit. */
  totalContributions: number;
  /** Interest kept, after tax. `initial + contributions + interest === endBalance`. */
  totalInterest: number;
  /** Tax charged on interest over the whole projection. */
  totalTax: number;
  months: SavingsMonth[];
  annual: SavingsPlanYear[];
}

/** Whole years, clamped to the projection cap. */
function planYears(years: number): number {
  const y = Math.floor(years || 0);
  if (!Number.isFinite(y) || y < 1) return 0;
  return Math.min(y, MAX_SAVINGS_YEARS);
}

/**
 * Run the accumulation month by month and report what happened.
 *
 * The loop is the calculation — there is no closed form here to check it against,
 * because the two increase rates, the tax and the end-of-period contributions make
 * the cash flows irregular by design. Summing what the loop actually did is what
 * keeps every reported total reconcilable against the schedule shown to the reader.
 */
export function projectSavingsPlan(input: SavingsPlanInput): SavingsPlanResult {
  const years = planYears(input.years);
  const factor = monthlyGrowthFactor(input.annualRatePct, input.compound);
  const taxRate = Math.min(Math.max((input.taxRatePct || 0) / 100, 0), 1);
  const annualStep = 1 + (input.annualIncreasePct || 0) / 100;
  const monthlyStep = 1 + (input.monthlyIncreasePct || 0) / 100;
  const initial = input.initialDeposit || 0;

  let balance = initial;
  let totalContributions = 0;
  let totalInterest = 0;
  let totalTax = 0;

  const months: SavingsMonth[] = [];
  const annual: SavingsPlanYear[] = [];

  for (let year = 1; year <= years; year++) {
    const monthlyThisYear = (input.monthlyContribution || 0) * Math.pow(monthlyStep, year - 1);
    const annualThisYear = (input.annualContribution || 0) * Math.pow(annualStep, year - 1);
    let yearDeposit = 0;
    let yearInterest = 0;
    let yearTax = 0;

    for (let m = 1; m <= 12; m++) {
      // Interest first, on the balance that was actually invested this month.
      const gross = balance * (factor - 1);
      // Tax is charged on interest earned, never on interest lost: an overdrawn
      // balance accrues negative interest, and taxing that would hand the saver a
      // refund the account never generated.
      const tax = gross > 0 ? gross * taxRate : 0;
      const interest = gross - tax;
      balance += interest;

      // Then the period's contributions — the end-of-period rule, applied literally.
      let deposit = monthlyThisYear;
      if (m === 12) deposit += annualThisYear;
      totalContributions += deposit;
      balance += deposit;

      // The opening deposit is shown in the first period's deposit column (it is paid
      // in then) but it is a starting balance, not a contribution, so it is added to
      // the displayed figure only — never to `totalContributions`.
      const shown = year === 1 && m === 1 ? deposit + initial : deposit;

      totalInterest += interest;
      totalTax += tax;
      yearDeposit += shown;
      yearInterest += interest;
      yearTax += tax;

      months.push({ month: (year - 1) * 12 + m, year, deposit: shown, interest, tax, balance });
    }

    annual.push({ year, deposit: yearDeposit, interest: yearInterest, tax: yearTax, balance });
  }

  return {
    endBalance: balance,
    initialDeposit: initial,
    totalContributions,
    totalInterest,
    totalTax,
    months,
    annual,
  };
}

/**
 * The monthly contribution that lands the projection on `goal`.
 *
 * End balance rises strictly with the monthly contribution whenever the growth
 * factor is at least 1, so the answer is found by bisection over the same
 * projection the headline uses. Solving against the real model rather than a
 * closed-form annuity is what stops the two modes from disagreeing: the deposit
 * this returns, typed back into the projection, reproduces the goal.
 *
 * Returns 0 when the plan already reaches the goal without any monthly deposit,
 * and null when no finite deposit reaches it (a non-positive growth factor with a
 * goal beyond what deposits alone can fund, or an unreachable target).
 */
export function requiredMonthlyForGoal(
  base: Omit<SavingsPlanInput, 'monthlyContribution'>,
  goal: number,
): number | null {
  const at = (monthlyContribution: number) =>
    projectSavingsPlan({ ...base, monthlyContribution }).endBalance;

  if (!Number.isFinite(goal)) return null;
  if (planYears(base.years) === 0) return null;
  if (at(0) >= goal) return 0;

  // Bracket the answer: double until the projection clears the goal. The ceiling is
  // far above any real deposit, and stopping there reports "unreachable" rather than
  // returning a number the bisection never actually bracketed.
  let hi = 100;
  let guard = 0;
  while (at(hi) < goal) {
    hi *= 2;
    if (++guard > 60 || !Number.isFinite(hi)) return null;
  }

  let lo = 0;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < goal) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-7) break;
  }
  return hi;
}

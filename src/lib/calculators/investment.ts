/**
 * Investment growth: a starting amount, a return rate, and regular contributions.
 * Pure and unit-tested.
 *
 * The projection runs MONTH BY MONTH regardless of how often returns compound,
 * because the two are independent: someone can contribute monthly to an account
 * that credits annually. Reducing every compounding frequency to a single monthly
 * growth factor — the primitive Savings and Interest already share — is what lets
 * one loop serve all nine, without ever learning which it is running.
 *
 * CONTRIBUTION TIMING matters more than it looks. A deposit made at the BEGINNING
 * of a period grows for that period; one made at the END does not. Over ten years
 * that is most of a year's growth on every contribution, so it is a field rather
 * than an assumption.
 *
 * THE DEPOSIT COLUMN folds the starting amount into the first period, which is what
 * the reference schedule shows: year one's deposit is the opening balance plus the
 * year's contributions, and every year after is contributions alone. It is the money
 * that went in during that period, and the starting amount went in at the start.
 */
import { monthlyGrowthFactor, type CompoundFrequency } from './compounding';

/** When a contribution lands relative to the period it is made in. */
export type ContributeAt = 'beginning' | 'end';
/** How often a contribution is made. */
export type ContributeEvery = 'month' | 'year';

export interface InvestmentInput {
  startingAmount: number;
  years: number;
  annualReturnPct: number;
  compound: CompoundFrequency;
  contribution: number;
  contributeAt: ContributeAt;
  contributeEvery: ContributeEvery;
}

/** One period of the schedule — the same shape for a month row and a year row. */
export interface InvestmentPeriod {
  /** 1-based month or year. */
  period: number;
  /** Money paid in during this period, including the starting amount in period 1. */
  deposit: number;
  /** Growth credited during this period. */
  interest: number;
  /** Balance at the end of it. */
  balance: number;
}

export interface InvestmentResult {
  endBalance: number;
  startingAmount: number;
  /** Contributions only — the starting amount is not one. */
  totalContributions: number;
  totalInterest: number;
  /** Month-by-month, `years × 12` rows. */
  monthly: InvestmentPeriod[];
  /** The same projection summed into years. */
  annual: InvestmentPeriod[];
}

/** Whole months in the term, floored at zero. */
const termMonths = (years: number) => Math.max(0, Math.round(years * 12));

export function calculateInvestment(input: InvestmentInput): InvestmentResult {
  const startingAmount = Math.max(0, input.startingAmount);
  const contribution = Math.max(0, input.contribution);
  const months = termMonths(input.years);
  const factor = monthlyGrowthFactor(input.annualReturnPct, input.compound);
  const yearly = input.contributeEvery === 'year';

  let balance = startingAmount;
  let totalContributions = 0;
  const monthly: InvestmentPeriod[] = [];

  for (let m = 1; m <= months; m++) {
    const opening = balance;
    // A yearly contribution lands in the first month of each year when it is made
    // at the beginning, and in the twelfth when it is made at the end.
    const monthInYear = ((m - 1) % 12) + 1;
    const contributes = yearly
      ? input.contributeAt === 'beginning'
        ? monthInYear === 1
        : monthInYear === 12
      : true;
    const deposit = contributes ? contribution : 0;

    if (deposit && input.contributeAt === 'beginning') balance += deposit;
    const grown = balance * factor;
    const interest = grown - balance;
    balance = grown;
    if (deposit && input.contributeAt === 'end') balance += deposit;

    totalContributions += deposit;
    monthly.push({
      period: m,
      // The starting amount is money in, and it went in before month one.
      deposit: deposit + (m === 1 ? startingAmount : 0),
      interest,
      balance,
    });
  }

  const annual: InvestmentPeriod[] = [];
  for (let start = 0; start < monthly.length; start += 12) {
    const slice = monthly.slice(start, start + 12);
    annual.push({
      period: annual.length + 1,
      deposit: slice.reduce((s, r) => s + r.deposit, 0),
      interest: slice.reduce((s, r) => s + r.interest, 0),
      balance: slice[slice.length - 1].balance,
    });
  }

  return {
    endBalance: balance,
    startingAmount,
    totalContributions,
    // Everything that is not money paid in is growth.
    totalInterest: balance - startingAmount - totalContributions,
    monthly,
    annual,
  };
}

/**
 * Retirement projection: grow current savings + monthly contributions to
 * retirement age, then estimate sustainable income via a withdrawal rate.
 * Reuses the compound-interest engine. Pure and unit-tested.
 */
import { calculateCompoundInterest, type CompoundYear } from '@lib/calculators/compound-interest';

export interface RetirementInput {
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  monthlyContribution: number;
  annualReturnPct: number;
  /** Safe withdrawal rate in retirement (default 4%). */
  withdrawalRatePct?: number;
}

export interface RetirementResult {
  yearsToRetirement: number;
  nestEgg: number;
  totalContributions: number;
  totalEarnings: number;
  estimatedAnnualIncome: number;
  estimatedMonthlyIncome: number;
  series: CompoundYear[];
}

export function calculateRetirement(input: RetirementInput): RetirementResult {
  const years = Math.max(0, (input.retirementAge || 0) - (input.currentAge || 0));
  const r = calculateCompoundInterest({
    principal: input.currentSavings,
    annualRatePct: input.annualReturnPct,
    years,
    compoundsPerYear: 12,
    contribution: input.monthlyContribution,
  });
  const withdrawalRate = (input.withdrawalRatePct ?? 4) / 100;
  const estimatedAnnualIncome = r.futureValue * withdrawalRate;
  return {
    yearsToRetirement: years,
    nestEgg: r.futureValue,
    totalContributions: r.totalContributions,
    totalEarnings: r.totalInterest,
    estimatedAnnualIncome,
    estimatedMonthlyIncome: estimatedAnnualIncome / 12,
    series: r.series,
  };
}

/* ------------------------------------------------------------------ */
/* The four retirement questions (R-RET-2)                             */
/* ------------------------------------------------------------------ */

/**
 * `calculateRetirement` above is UNCHANGED and still serves the simple
 * projection. Everything below is additive: the four questions a retirement
 * plan actually asks, each its own pure function over one shared set of
 * conventions.
 *
 * THE CONVENTIONS, stated once because every figure depends on them:
 *
 *  • Accumulation is ANNUAL, end-of-year: `balance = balance × (1 + r) + contribution`.
 *    A year's contribution is credited after that year's growth, which is the
 *    conservative reading and the one that reproduces the published figures.
 *  • Income at retirement is today's income grown for the FULL number of years
 *    to retirement: `income × (1 + g)^years`.
 *  • Retirement withdrawals are taken at the START of each month and rise with
 *    inflation continuously — month k pays `first × (1 + i)^(k/12)` — while the
 *    remaining pot earns `r / 12` a month. The present value of that stream over
 *    the whole retirement is the ANNUITY FACTOR, and it is the single number
 *    linking a pot to the income it buys: `pot = monthlyIncome × factor`, and
 *    `monthlyIncome = pot / factor`. Using one factor in both directions is what
 *    keeps "what you need" and "what you would draw" mutually consistent.
 *  • A savings TARGET is the shortfall between what the pot must be and what
 *    today's savings alone will grow to, divided by the future value of a unit
 *    contribution — monthly targets compound at the effective monthly rate
 *    `(1 + r)^(1/12) − 1`, annual targets at `r`.
 */

/** Whole years, floored at zero — ages that run backwards are not negative time. */
const span = (from: number, to: number): number => Math.max(0, Math.round((to || 0) - (from || 0)));

/**
 * The present value, at retirement, of one dollar per month of starting income —
 * rising with inflation, drawn at the start of each month, for `years`.
 */
export function annuityFactor(years: number, annualReturnPct: number, inflationPct: number): number {
  const months = Math.max(0, Math.round(years * 12));
  const r = (annualReturnPct || 0) / 100 / 12;
  const i = (inflationPct || 0) / 100;
  let factor = 0;
  for (let k = 0; k < months; k++) {
    factor += Math.pow(1 + i, k / 12) / Math.pow(1 + r, k);
  }
  return factor;
}

/** Future value of one unit contributed every month for `years`, at the effective monthly rate. */
export function monthlyContributionFactor(years: number, annualReturnPct: number): number {
  const r = (annualReturnPct || 0) / 100;
  if (years <= 0) return 0;
  if (r === 0) return years * 12;
  return (Math.pow(1 + r, years) - 1) / (Math.pow(1 + r, 1 / 12) - 1);
}

/** Future value of one unit contributed once a year for `years`, at the annual rate. */
export function annualContributionFactor(years: number, annualReturnPct: number): number {
  const r = (annualReturnPct || 0) / 100;
  if (years <= 0) return 0;
  if (r === 0) return years;
  return (Math.pow(1 + r, years) - 1) / r;
}

/** One year of a projection: the age it ends at and the balance it ends on. */
export interface BalanceYear {
  age: number;
  balance: number;
}

/* ---- 1. How much do you need to retire? ---- */

export interface RetirementPlanInput {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  /** Pre-tax income today, per year. */
  currentIncome: number;
  /** Percent the income rises each year before retirement. */
  incomeIncreasePct: number;
  /** Income wanted in retirement, as a percent of income at retirement. */
  incomeNeededPct: number;
  annualReturnPct: number;
  inflationPct: number;
  /** Pension, social security and the like, per month, in retirement-day dollars. */
  otherMonthlyIncome: number;
  currentSavings: number;
  /** Percent of income saved each year from now until retirement. */
  futureSavingsPct: number;
}

export interface RetirementPlanResult {
  yearsToRetirement: number;
  retirementYears: number;
  /** Income in the final working year — what the "% of income" target is taken of. */
  incomeAtRetirement: number;
  /** The pot the plan requires at retirement. */
  amountNeeded: number;
  /** The pot the current plan actually reaches. */
  amountProjected: number;
  /** projected / needed, 0–1+ (0 when nothing is needed). */
  readiness: number;
  /** True when the projection already covers the requirement. */
  onTrack: boolean;
  shortfall: number;
  /** Monthly income each pot buys, in retirement-day dollars and in today's money. */
  incomeFromProjected: number;
  incomeFromProjectedToday: number;
  incomeFromNeeded: number;
  incomeFromNeededToday: number;
  /** What reaching `amountNeeded` would take from here. */
  saveMonthly: number;
  saveAnnually: number;
  /** ...expressed as a percent of income, the same shape the plan already saves in. */
  savePctOfIncome: number;
  /** Year-end balance from today to life expectancy, on each plan. */
  projectedSeries: BalanceYear[];
  neededSeries: BalanceYear[];
  /** The annuity factor every income figure above is derived from. */
  factor: number;
}

/**
 * Grow `start` to retirement, then draw the income the pot supports until life
 * expectancy, recording the year-end balance throughout. Drawing exactly the
 * income the pot buys lands the balance on zero at life expectancy, which is
 * what makes the two curves comparable.
 */
function projectBalances(
  start: number,
  contributions: readonly number[],
  annualReturnPct: number,
  currentAge: number,
  retirementAge: number,
  lifeExpectancy: number,
  monthlyIncome: number,
  inflationPct: number,
): BalanceYear[] {
  const r = (annualReturnPct || 0) / 100;
  const i = (inflationPct || 0) / 100;
  const out: BalanceYear[] = [];
  let balance = start;
  for (let t = 0; t < contributions.length; t++) {
    balance = balance * (1 + r) + contributions[t];
    out.push({ age: currentAge + t + 1, balance: Math.max(0, balance) });
  }
  const retYears = span(retirementAge, lifeExpectancy);
  const rm = r / 12;
  for (let y = 0; y < retYears; y++) {
    for (let m = 0; m < 12; m++) {
      const k = y * 12 + m;
      const draw = monthlyIncome * Math.pow(1 + i, k / 12);
      balance = (balance - draw) * (1 + rm);
      if (balance < 0) balance = 0;
    }
    out.push({ age: retirementAge + y + 1, balance: Math.max(0, balance) });
  }
  return out;
}

export function calculateRetirementPlan(input: RetirementPlanInput): RetirementPlanResult {
  const yearsToRetirement = span(input.currentAge, input.retirementAge);
  const retirementYears = span(input.retirementAge, input.lifeExpectancy);
  const g = (input.incomeIncreasePct || 0) / 100;
  const r = (input.annualReturnPct || 0) / 100;
  const income = Math.max(0, input.currentIncome || 0);
  const savings = Math.max(0, input.currentSavings || 0);

  const incomeAtRetirement = income * Math.pow(1 + g, yearsToRetirement);
  const factor = annuityFactor(retirementYears, input.annualReturnPct, input.inflationPct);

  // What the plan must fund: the target income, less whatever a pension already covers.
  const wantedMonthly = (incomeAtRetirement * ((input.incomeNeededPct || 0) / 100)) / 12;
  const fundedMonthly = Math.max(0, wantedMonthly - Math.max(0, input.otherMonthlyIncome || 0));
  const amountNeeded = fundedMonthly * factor;

  // What the plan reaches: today's savings plus a percent of a rising income.
  const contributions: number[] = [];
  for (let t = 0; t < yearsToRetirement; t++) {
    contributions.push(income * Math.pow(1 + g, t) * ((input.futureSavingsPct || 0) / 100));
  }
  let amountProjected = savings;
  for (const c of contributions) amountProjected = amountProjected * (1 + r) + c;

  const incomeFromProjected = factor > 0 ? amountProjected / factor : 0;
  const incomeFromNeeded = factor > 0 ? amountNeeded / factor : 0;
  const toToday = Math.pow(1 + (input.inflationPct || 0) / 100, yearsToRetirement);

  // Savings targets close the gap between the requirement and what today's savings
  // alone become; the percent target simply rescales the contribution already planned.
  const savingsAlone = savings * Math.pow(1 + r, yearsToRetirement);
  const gap = Math.max(0, amountNeeded - savingsAlone);
  const monthlyFactor = monthlyContributionFactor(yearsToRetirement, input.annualReturnPct);
  const annualFactor = annualContributionFactor(yearsToRetirement, input.annualReturnPct);
  const contributedValue = amountProjected - savingsAlone;
  const savePctOfIncome =
    contributedValue > 0 ? ((input.futureSavingsPct || 0) * gap) / contributedValue : 0;

  return {
    yearsToRetirement,
    retirementYears,
    incomeAtRetirement,
    amountNeeded,
    amountProjected,
    readiness: amountNeeded > 0 ? amountProjected / amountNeeded : 0,
    onTrack: amountProjected >= amountNeeded,
    shortfall: Math.max(0, amountNeeded - amountProjected),
    incomeFromProjected,
    incomeFromProjectedToday: toToday > 0 ? incomeFromProjected / toToday : 0,
    incomeFromNeeded,
    incomeFromNeededToday: toToday > 0 ? incomeFromNeeded / toToday : 0,
    saveMonthly: monthlyFactor > 0 ? gap / monthlyFactor : 0,
    saveAnnually: annualFactor > 0 ? gap / annualFactor : 0,
    savePctOfIncome,
    projectedSeries: projectBalances(savings, contributions, input.annualReturnPct, input.currentAge, input.retirementAge, input.lifeExpectancy, incomeFromProjected, input.inflationPct),
    neededSeries: projectBalances(savings, contributions.map((c) => (contributedValue > 0 ? (c * gap) / contributedValue : c)), input.annualReturnPct, input.currentAge, input.retirementAge, input.lifeExpectancy, incomeFromNeeded, input.inflationPct),
    factor,
  };
}

/* ---- 2. How can you save for retirement? ---- */

export interface SavingsPlanInput {
  currentAge: number;
  retirementAge: number;
  amountNeeded: number;
  currentSavings: number;
  annualReturnPct: number;
}

export interface SavingsPlanResult {
  years: number;
  /** What today's savings alone grow to — the target may already be covered. */
  savingsAlone: number;
  gap: number;
  saveMonthly: number;
  saveAnnually: number;
  alreadyThere: boolean;
}

export function calculateSavingsPlan(input: SavingsPlanInput): SavingsPlanResult {
  const years = span(input.currentAge, input.retirementAge);
  const r = (input.annualReturnPct || 0) / 100;
  const savingsAlone = Math.max(0, input.currentSavings || 0) * Math.pow(1 + r, years);
  const gap = Math.max(0, Math.max(0, input.amountNeeded || 0) - savingsAlone);
  const mf = monthlyContributionFactor(years, input.annualReturnPct);
  const af = annualContributionFactor(years, input.annualReturnPct);
  return {
    years,
    savingsAlone,
    gap,
    saveMonthly: mf > 0 ? gap / mf : 0,
    saveAnnually: af > 0 ? gap / af : 0,
    alreadyThere: gap <= 0,
  };
}

/* ---- 3. How much can you withdraw after retirement? ---- */

export interface WithdrawalPlanInput {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  currentSavings: number;
  annualContribution: number;
  monthlyContribution: number;
  annualReturnPct: number;
  inflationPct: number;
}

export interface WithdrawalPlanResult {
  yearsToRetirement: number;
  retirementYears: number;
  /** The pot at retirement, from savings plus both contribution streams. */
  amountAtRetirement: number;
  /** Monthly withdrawal the pot supports, in retirement-day dollars and today's money. */
  monthlyWithdrawal: number;
  monthlyWithdrawalToday: number;
  annualWithdrawal: number;
  factor: number;
  series: BalanceYear[];
}

export function calculateWithdrawalPlan(input: WithdrawalPlanInput): WithdrawalPlanResult {
  const yearsToRetirement = span(input.currentAge, input.retirementAge);
  const retirementYears = span(input.retirementAge, input.lifeExpectancy);
  const savings = Math.max(0, input.currentSavings || 0);
  const annual = Math.max(0, input.annualContribution || 0);
  const monthly = Math.max(0, input.monthlyContribution || 0);
  const r = (input.annualReturnPct || 0) / 100;

  // Monthly deposits are valued at the effective monthly rate, the same convention
  // the savings targets use, then credited alongside the annual one.
  const perYearFromMonthly = r === 0 ? monthly * 12 : (monthly * (Math.pow(1 + r, 1) - 1)) / (Math.pow(1 + r, 1 / 12) - 1);
  const contributions = Array.from({ length: yearsToRetirement }, () => annual + perYearFromMonthly);
  let amountAtRetirement = savings;
  for (const c of contributions) amountAtRetirement = amountAtRetirement * (1 + r) + c;

  const factor = annuityFactor(retirementYears, input.annualReturnPct, input.inflationPct);
  const monthlyWithdrawal = factor > 0 ? amountAtRetirement / factor : 0;
  const toToday = Math.pow(1 + (input.inflationPct || 0) / 100, yearsToRetirement);

  return {
    yearsToRetirement,
    retirementYears,
    amountAtRetirement,
    monthlyWithdrawal,
    monthlyWithdrawalToday: toToday > 0 ? monthlyWithdrawal / toToday : 0,
    annualWithdrawal: monthlyWithdrawal * 12,
    factor,
    series: projectBalances(savings, contributions, input.annualReturnPct, input.currentAge, input.retirementAge, input.lifeExpectancy, monthlyWithdrawal, input.inflationPct),
  };
}

/* ---- 4. How long can your money last? ---- */

export interface MoneyLastsInput {
  amount: number;
  monthlyWithdrawal: number;
  annualReturnPct: number;
}

export interface MoneyLastsResult {
  /** Whole months the pot survives, capped at MAX_LASTS_MONTHS. */
  months: number;
  years: number;
  remainingMonths: number;
  /**
   * True ONLY when the balance held or grew across the whole projection — the
   * return genuinely covers the withdrawal. A pot that is still alive at the cap
   * but shrinking is NOT this; it gets `reachedLimit` instead, because telling
   * someone their money never runs out when it runs out in year 90 is the worst
   * error this calculator could make.
   */
  neverRunsOut: boolean;
  /** The projection stopped at the 100-year cap rather than at a zero balance. */
  reachedLimit: boolean;
  /** Actually withdrawn over the projection — summed, never assumed. */
  totalWithdrawn: number;
  /** The balance the projection ended on. */
  endingBalance: number;
  series: BalanceYear[];
}

/** Projections stop after 100 years; nobody plans past that. */
export const MAX_LASTS_MONTHS = 100 * 12;

/** Balances below a cent are gone — a float residue is not a month of income. */
const CENT = 0.005;

/**
 * The largest withdrawal a balance sustains forever, for a given monthly return.
 *
 * Withdrawals come out at the START of the month and the remainder earns for the
 * month, so the balance holds when `(B − d)(1 + rm) = B`, i.e. `d = B·rm/(1 + rm)`
 * — NOT `B·rm`, which is the end-of-month answer and is the more generous of the
 * two. Exported so the boundary is testable in its own right.
 */
export function sustainableWithdrawal(balance: number, annualReturnPct: number): number {
  const rm = (annualReturnPct || 0) / 100 / 12;
  if (!(balance > 0) || rm <= 0) return 0;
  return (balance * rm) / (1 + rm);
}

/**
 * Run the balance down month by month. The loop IS the calculation: there is no
 * shortcut, because whether a pot survives turns on a boundary
 * (`sustainableWithdrawal`) that an approximate threshold gets wrong in exactly
 * the region people care about — a draw a few dollars above the hold point looks
 * sustainable for decades and still empties the account. Capped at 100 years, so
 * the loop is bounded at 1,200 cheap iterations whatever the inputs.
 */
export function calculateMoneyLasts(input: MoneyLastsInput): MoneyLastsResult {
  const amount = Math.max(0, input.amount || 0);
  const draw = Math.max(0, input.monthlyWithdrawal || 0);
  const rm = (input.annualReturnPct || 0) / 100 / 12;

  let balance = amount;
  let months = 0;
  let withdrawn = 0;
  const series: BalanceYear[] = [];
  while (balance > CENT && months < MAX_LASTS_MONTHS) {
    const take = Math.min(draw, balance);
    balance = (balance - take) * (1 + rm);
    if (balance < 0) balance = 0;
    withdrawn += take;
    months++;
    if (months % 12 === 0) series.push({ age: months / 12, balance });
  }

  const reachedLimit = months >= MAX_LASTS_MONTHS;
  // Sustainable means the balance did not fall over the whole projection. A pot
  // that merely outlived the cap while shrinking is reported by its duration.
  const neverRunsOut = reachedLimit && balance >= amount - CENT;

  return {
    months,
    years: Math.floor(months / 12),
    remainingMonths: months % 12,
    neverRunsOut,
    reachedLimit,
    totalWithdrawn: withdrawn,
    endingBalance: balance,
    series,
  };
}

/**
 * Mortgage math: monthly payment (PITI), amortization schedule and PMI.
 * Pure and unit-tested. Uses the standard fixed-rate amortization formula.
 */

export interface MortgageInput {
  homePrice: number;
  downPayment: number; // absolute currency amount
  loanTermYears: number;
  annualInterestRate: number; // percent, e.g. 6.5
  propertyTaxAnnual?: number;
  homeInsuranceAnnual?: number;
  hoaMonthly?: number;
  /** Any other recurring annual cost (fees, utilities bundled into the housing budget). */
  otherCostsAnnual?: number;
  /** Annual PMI as a percent of the loan, charged while LTV > 80%. */
  pmiAnnualRate?: number;

  /* ---- Optional: annual increases on the recurring carrying costs ---- */
  /**
   * Percent each recurring cost rises by every year, compounding. A cost's
   * amount in loan-year `y` (0-based) is `base × (1 + pct/100)^y`, so year one
   * is always the amount as entered and the headline monthly payment never
   * moves. Omitted or 0 → the cost is flat, exactly as before.
   */
  propertyTaxIncreasePct?: number;
  homeInsuranceIncreasePct?: number;
  hoaIncreasePct?: number;
  otherCostsIncreasePct?: number;

  /* ---- Optional: extra payments straight to principal ---- */
  /** Paid EVERY month from `offset` onwards. */
  extraMonthly?: ExtraPayment;
  /** Paid every 12th month from `offset` onwards (so `offset` itself is the first). */
  extraYearly?: ExtraPayment;
  /** One-off payments, each in its own month. */
  extraOneTime?: readonly ExtraPayment[];

  /** Also compute the biweekly comparison plan. Off by default — it costs a second run. */
  includeBiweekly?: boolean;
}

/** An extra principal payment: an amount, and when it starts (0-based months from the first payment). */
export interface ExtraPayment {
  amount: number;
  offset: number;
}

/**
 * The biweekly alternative: half the monthly principal-and-interest paid every
 * two weeks. 26 half-payments a year is 13 monthly payments' worth, so the loan
 * closes early. Modelled at a periodic rate of `annual / 26`, the convention
 * lenders quote these plans at.
 */
export interface BiweeklyPlan {
  /** Half the monthly principal-and-interest. */
  payment: number;
  totalInterest: number;
  /** Number of biweekly payments made. */
  payoffPeriods: number;
  /** The same payoff expressed in months, for comparison with the monthly plan. */
  payoffMonths: number;
  interestSaved: number;
  monthsSaved: number;
}

export interface AmortizationRow {
  period: number; // 1-based month
  /** Scheduled payment only — always exactly `principal + interest`. Extra is its own field. */
  payment: number;
  principal: number;
  interest: number;
  pmi: number;
  balance: number;
  /** Extra principal applied this month on top of `principal`. 0 when none is set. */
  extra: number;
  /** This month's recurring costs (tax + insurance + HOA + other) after any annual increase. */
  costs: number;
}

export interface MortgageResult {
  loanAmount: number;
  monthlyPrincipalInterest: number;
  monthlyPropertyTax: number;
  monthlyInsurance: number;
  monthlyHoa: number;
  monthlyOther: number;
  monthlyPmi: number; // initial PMI
  monthlyTotal: number; // first-month PITI + HOA + other costs
  totalInterest: number;
  totalPmi: number;
  totalOfPayments: number; // principal + interest over the life of the loan
  payoffMonths: number;
  schedule: AmortizationRow[];

  /** Extra principal paid over the payoff. 0 when no extra payments are set. */
  totalExtraPrincipal: number;
  /** Recurring costs across the payoff, with any annual increases applied. */
  totalPropertyTax: number;
  totalHomeInsurance: number;
  totalHoa: number;
  totalOtherCosts: number;
  /** Everything the visitor pays out: principal + interest + PMI + recurring costs. */
  totalCostOfOwnership: number;

  /** The identical loan WITHOUT the extra payments. `null` when none are set. */
  withoutExtra: { totalInterest: number; payoffMonths: number } | null;
  /** Interest and months the extra payments save. 0 when no extra payments are set. */
  interestSaved: number;
  monthsSaved: number;

  /** The biweekly comparison. `null` unless `includeBiweekly` asked for it. */
  biweekly: BiweeklyPlan | null;
}

function monthlyPayment(principal: number, monthlyRate: number, months: number): number {
  if (months <= 0) return 0;
  if (monthlyRate === 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * factor) / (factor - 1);
}

/** The recurring costs, as a monthly base amount plus the yearly growth rate applied to it. */
interface CostTrack {
  base: number;
  growth: number; // percent per year
}
const track = (base: number, pct?: number): CostTrack => ({
  base: Math.max(0, base || 0),
  growth: Math.max(0, pct || 0),
});
/** A cost's amount in loan-year `year` (0-based). Year 0 is always the amount as entered. */
const escalate = (t: CostTrack, year: number): number =>
  t.growth === 0 ? t.base : t.base * Math.pow(1 + t.growth / 100, year);

/** The extra payments, normalised: absent entries are null and offsets are whole and non-negative. */
interface ExtraPlan {
  monthly: ExtraPayment | null;
  yearly: ExtraPayment | null;
  oneTime: ExtraPayment[];
}
const usable = (e?: ExtraPayment): ExtraPayment | null =>
  e && Number.isFinite(e.amount) && e.amount > 0
    ? { amount: e.amount, offset: Math.max(0, Math.round(e.offset || 0)) }
    : null;

function extraPlan(input: MortgageInput): ExtraPlan | null {
  const monthly = usable(input.extraMonthly);
  const yearly = usable(input.extraYearly);
  const oneTime = (input.extraOneTime ?? []).map(usable).filter((e): e is ExtraPayment => e != null);
  if (!monthly && !yearly && !oneTime.length) return null;
  return { monthly, yearly, oneTime };
}

/** What the plan adds to principal in month `period` (1-based). */
function extraFor(plan: ExtraPlan | null, period: number): number {
  if (!plan) return 0;
  const i = period - 1;
  let extra = 0;
  if (plan.monthly && i >= plan.monthly.offset) extra += plan.monthly.amount;
  if (plan.yearly && i >= plan.yearly.offset && (i - plan.yearly.offset) % 12 === 0) {
    extra += plan.yearly.amount;
  }
  for (const one of plan.oneTime) if (i === one.offset) extra += one.amount;
  return extra;
}

interface RunResult {
  schedule: AmortizationRow[];
  totalInterest: number;
  totalPmi: number;
  totalExtra: number;
  totalTax: number;
  totalInsurance: number;
  totalHoa: number;
  totalOther: number;
}

/**
 * One pass of the monthly schedule. The scheduled payment is unchanged — extra
 * principal is applied AFTER it, capped at whatever balance is left, so a row's
 * `payment` stays exactly `principal + interest` and the loan simply closes
 * sooner. Recurring costs are recorded per row at that year's escalated amount.
 */
function run(
  loanAmount: number,
  monthlyRate: number,
  months: number,
  pi: number,
  pmiMonthlyFull: number,
  pmiThreshold: number,
  costs: { tax: CostTrack; insurance: CostTrack; hoa: CostTrack; other: CostTrack },
  plan: ExtraPlan | null,
): RunResult {
  const schedule: AmortizationRow[] = [];
  let balance = loanAmount;
  let totalInterest = 0;
  let totalPmi = 0;
  let totalExtra = 0;
  let totalTax = 0;
  let totalInsurance = 0;
  let totalHoa = 0;
  let totalOther = 0;

  for (let period = 1; period <= months && balance > 0.005; period++) {
    const interest = balance * monthlyRate;
    let principal = pi - interest;
    if (principal > balance) principal = balance; // final payment
    const pmi = balance > pmiThreshold ? pmiMonthlyFull : 0;

    const remaining = balance - principal;
    let extra = extraFor(plan, period);
    if (extra > remaining) extra = Math.max(0, remaining);
    balance = remaining - extra;

    const year = Math.floor((period - 1) / 12);
    const tax = escalate(costs.tax, year);
    const insurance = escalate(costs.insurance, year);
    const hoa = escalate(costs.hoa, year);
    const other = escalate(costs.other, year);

    totalInterest += interest;
    totalPmi += pmi;
    totalExtra += extra;
    totalTax += tax;
    totalInsurance += insurance;
    totalHoa += hoa;
    totalOther += other;

    schedule.push({
      period,
      payment: principal + interest,
      principal,
      interest,
      pmi,
      balance: Math.max(0, balance),
      extra,
      costs: tax + insurance + hoa + other,
    });
  }

  return { schedule, totalInterest, totalPmi, totalExtra, totalTax, totalInsurance, totalHoa, totalOther };
}

/** 26 half-payments a year at `annual / 26`, run to payoff. */
function runBiweekly(
  loanAmount: number,
  annualRatePct: number,
  months: number,
  pi: number,
): { totalInterest: number; payoffPeriods: number } | null {
  const payment = pi / 2;
  const rate = (annualRatePct || 0) / 100 / 26;
  if (loanAmount <= 0 || payment <= 0) return null;
  // A payment that never covers the period's interest would loop forever.
  if (rate > 0 && payment <= loanAmount * rate) return null;

  const cap = Math.ceil((months / 12) * 26) + 26;
  let balance = loanAmount;
  let totalInterest = 0;
  let periods = 0;
  while (balance > 0.005 && periods < cap) {
    const interest = balance * rate;
    let principal = payment - interest;
    if (principal > balance) principal = balance;
    balance -= principal;
    totalInterest += interest;
    periods++;
  }
  return balance > 0.005 ? null : { totalInterest, payoffPeriods: periods };
}

export function calculateMortgage(input: MortgageInput): MortgageResult {
  const homePrice = Math.max(0, input.homePrice || 0);
  const downPayment = Math.min(Math.max(0, input.downPayment || 0), homePrice);
  const loanAmount = Math.max(0, homePrice - downPayment);
  const months = Math.max(0, Math.round((input.loanTermYears || 0) * 12));
  const monthlyRate = (input.annualInterestRate || 0) / 100 / 12;

  const pi = monthlyPayment(loanAmount, monthlyRate, months);
  const monthlyPropertyTax = (input.propertyTaxAnnual || 0) / 12;
  const monthlyInsurance = (input.homeInsuranceAnnual || 0) / 12;
  const monthlyHoa = input.hoaMonthly || 0;
  const monthlyOther = (input.otherCostsAnnual || 0) / 12;
  const pmiMonthlyFull = ((input.pmiAnnualRate || 0) / 100) * loanAmount / 12;
  const pmiThreshold = homePrice * 0.8; // stop PMI when balance drops to 80% LTV

  const costs = {
    tax: track(monthlyPropertyTax, input.propertyTaxIncreasePct),
    insurance: track(monthlyInsurance, input.homeInsuranceIncreasePct),
    hoa: track(monthlyHoa, input.hoaIncreasePct),
    other: track(monthlyOther, input.otherCostsIncreasePct),
  };

  const plan = extraPlan(input);
  const main = run(loanAmount, monthlyRate, months, pi, pmiMonthlyFull, pmiThreshold, costs, plan);

  // The comparison the extra payments are FOR: the identical loan without them.
  // Only run when there is something to compare, so the ordinary path costs nothing.
  const base = plan
    ? run(loanAmount, monthlyRate, months, pi, pmiMonthlyFull, pmiThreshold, costs, null)
    : null;
  const withoutExtra = base
    ? { totalInterest: base.totalInterest, payoffMonths: base.schedule.length }
    : null;

  // Biweekly compares against the ORDINARY monthly plan, so it is measured
  // against `base` when extras are in play and against the main run otherwise.
  const monthlyInterest = base ? base.totalInterest : main.totalInterest;
  const monthlyMonths = base ? base.schedule.length : main.schedule.length;
  const bw = input.includeBiweekly ? runBiweekly(loanAmount, input.annualInterestRate, months, pi) : null;
  const biweekly: BiweeklyPlan | null = bw
    ? {
        payment: pi / 2,
        totalInterest: bw.totalInterest,
        payoffPeriods: bw.payoffPeriods,
        payoffMonths: Math.round((bw.payoffPeriods / 26) * 12),
        interestSaved: Math.max(0, monthlyInterest - bw.totalInterest),
        monthsSaved: Math.max(0, monthlyMonths - Math.round((bw.payoffPeriods / 26) * 12)),
      }
    : null;

  const initialPmi = loanAmount > pmiThreshold ? pmiMonthlyFull : 0;

  return {
    loanAmount,
    monthlyPrincipalInterest: pi,
    monthlyPropertyTax,
    monthlyInsurance,
    monthlyHoa,
    monthlyOther,
    monthlyPmi: initialPmi,
    monthlyTotal: pi + monthlyPropertyTax + monthlyInsurance + monthlyHoa + monthlyOther + initialPmi,
    totalInterest: main.totalInterest,
    totalPmi: main.totalPmi,
    totalOfPayments: loanAmount + main.totalInterest,
    payoffMonths: main.schedule.length,
    schedule: main.schedule,

    totalExtraPrincipal: main.totalExtra,
    totalPropertyTax: main.totalTax,
    totalHomeInsurance: main.totalInsurance,
    totalHoa: main.totalHoa,
    totalOtherCosts: main.totalOther,
    totalCostOfOwnership:
      loanAmount +
      main.totalInterest +
      main.totalPmi +
      main.totalTax +
      main.totalInsurance +
      main.totalHoa +
      main.totalOther,

    withoutExtra,
    interestSaved: withoutExtra ? Math.max(0, withoutExtra.totalInterest - main.totalInterest) : 0,
    monthsSaved: withoutExtra ? Math.max(0, withoutExtra.payoffMonths - main.schedule.length) : 0,

    biweekly,
  };
}

/** Collapse a monthly schedule into yearly rows for compact display. */
export function toYearlySchedule(schedule: AmortizationRow[]): AmortizationRow[] {
  const yearly: AmortizationRow[] = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const chunk = schedule.slice(i, i + 12);
    const last = chunk[chunk.length - 1];
    yearly.push({
      period: Math.ceil((i + 1) / 12),
      payment: chunk.reduce((s, r) => s + r.payment, 0),
      principal: chunk.reduce((s, r) => s + r.principal, 0),
      interest: chunk.reduce((s, r) => s + r.interest, 0),
      pmi: chunk.reduce((s, r) => s + r.pmi, 0),
      balance: last.balance,
      extra: chunk.reduce((s, r) => s + r.extra, 0),
      costs: chunk.reduce((s, r) => s + r.costs, 0),
    });
  }
  return yearly;
}

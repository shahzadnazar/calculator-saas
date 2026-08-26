/**
 * General fixed-rate loan calculator. Pure and unit-tested.
 */
import { buildAmortization, collapseYearly, pmt, type AmortRow } from '@lib/finance';

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

/* ------------------------------------------------------------------ */
/* Extended loan modes (R-LOAN-2)                                      */
/* ------------------------------------------------------------------ */

/**
 * The three ways a loan can be paid back. `calculateLoan` above is UNCHANGED and
 * still serves the Amortization calculator; everything below is additive.
 *
 *  • amortized — a fixed amount paid back periodically (the classic loan).
 *  • deferred  — nothing is paid until maturity, when one lump sum falls due.
 *  • bond      — a predetermined amount falls due at maturity; the question is
 *                what the borrower receives TODAY (the present value).
 */
export type LoanMode = 'amortized' | 'deferred' | 'bond';

export interface FrequencyOption {
  readonly key: string;
  readonly label: string;
  /** Periods per year; Infinity for continuous compounding. */
  readonly perYear: number;
}

/** How often interest is added. "Monthly (APR)" is the nominal-rate default. */
export const COMPOUND_FREQUENCIES: readonly FrequencyOption[] = [
  { key: 'annually', label: 'Annually (APY)', perYear: 1 },
  { key: 'semiannually', label: 'Semi-annually', perYear: 2 },
  { key: 'quarterly', label: 'Quarterly', perYear: 4 },
  { key: 'monthly', label: 'Monthly (APR)', perYear: 12 },
  { key: 'semimonthly', label: 'Semi-monthly', perYear: 24 },
  { key: 'biweekly', label: 'Bi-weekly', perYear: 26 },
  { key: 'weekly', label: 'Weekly', perYear: 52 },
  { key: 'daily', label: 'Daily', perYear: 365 },
  { key: 'continuously', label: 'Continuously', perYear: Infinity },
] as const;

/** The singular noun for ONE payback period — the detailed schedule's row header. */
export const PERIOD_NOUNS: Record<string, string> = {
  month: 'Month',
  quarter: 'Quarter',
  halfyear: 'Half year',
  year: 'Year',
};

/** How often the borrower pays (amortized mode only). */
export const PAYBACK_FREQUENCIES: readonly FrequencyOption[] = [
  { key: 'month', label: 'Every Month', perYear: 12 },
  { key: 'quarter', label: 'Every Quarter', perYear: 4 },
  { key: 'halfyear', label: 'Every Half Year', perYear: 2 },
  { key: 'year', label: 'Every Year', perYear: 1 },
] as const;

const freq = (list: readonly FrequencyOption[], key: string, fallback: string): FrequencyOption =>
  list.find((f) => f.key === key) ?? list.find((f) => f.key === fallback)!;

export const compoundFrequency = (key: string): FrequencyOption =>
  freq(COMPOUND_FREQUENCIES, key, 'monthly');
export const paybackFrequency = (key: string): FrequencyOption =>
  freq(PAYBACK_FREQUENCIES, key, 'month');

/**
 * The EFFECTIVE annual rate — the single figure every mode is derived from.
 *
 * A quoted rate means different things at different compounding frequencies, so
 * it is normalised once here: 6% compounded monthly is an effective 6.1678%,
 * while 6% quoted as APY is already effective. Continuous compounding uses the
 * limit e^r. This is what makes "Compound" actually change the answer rather
 * than being a decorative select.
 */
export function effectiveAnnualRate(annualRatePct: number, compoundsPerYear: number): number {
  const r = (annualRatePct || 0) / 100;
  if (!Number.isFinite(compoundsPerYear)) return Math.exp(r) - 1; // continuous
  if (compoundsPerYear <= 0) return r;
  return Math.pow(1 + r / compoundsPerYear, compoundsPerYear) - 1;
}

/** The rate for one period of a `periodsPerYear` schedule, from an effective annual rate. */
export function periodicRate(effectiveAnnual: number, periodsPerYear: number): number {
  if (periodsPerYear <= 0) return 0;
  return Math.pow(1 + effectiveAnnual, 1 / periodsPerYear) - 1;
}

/** One row of a compound-ACCRUAL schedule (deferred and bond: nothing is repaid). */
export interface AccrualRow {
  period: number;
  beginning: number;
  interest: number;
  ending: number;
}

/**
 * Grow `principal` for `periods` periods at `rate`, recording each step. Used for
 * the deferred and bond schedules, where no payment is made until maturity, so
 * every period's interest simply joins the balance.
 */
export function buildAccrual(principal: number, rate: number, periods: number): AccrualRow[] {
  const rows: AccrualRow[] = [];
  let balance = Math.max(0, principal || 0);
  const n = Math.max(0, Math.round(periods || 0));
  for (let period = 1; period <= n; period++) {
    const interest = balance * rate;
    const ending = balance + interest;
    rows.push({ period, beginning: balance, interest, ending });
    balance = ending;
  }
  return rows;
}

export interface ExtendedLoanInput {
  mode: LoanMode;
  /** Loan amount (amortized / deferred) or the amount due at maturity (bond). */
  amount: number;
  annualInterestRate: number; // percent
  termYears: number;
  termMonths: number;
  compoundKey: string;
  /** Amortized only; ignored by the accrual modes, which make no payments. */
  paybackKey: string;
}

export interface ExtendedLoanResult {
  mode: LoanMode;
  /** The headline figure: the periodic payment, the amount due, or the amount received. */
  primary: number;
  totalInterest: number;
  /** Amortized only: total of all payments. Accrual modes report the maturity value. */
  totalPaid: number;
  /** Amortized only. */
  paymentCount: number;
  paymentLabel: string;
  /** Rows per year in `monthlySchedule` — what a "Year #N End" separator counts. */
  periodsPerYear: number;
  /** Singular noun for one detailed row: "Month", "Quarter", "Half year", "Year". */
  periodNoun: string;
  /** Share of the total that is principal, 0–1 — drives the proportion chart. */
  principalShare: number;
  monthlySchedule: AccrualRow[];
  yearlySchedule: AccrualRow[];
  /** True when the inputs describe a real loan we can present. */
  valid: boolean;
}

const EMPTY: ExtendedLoanResult = {
  mode: 'amortized',
  primary: NaN,
  totalInterest: NaN,
  totalPaid: NaN,
  paymentCount: 0,
  paymentLabel: '',
  periodsPerYear: 12,
  periodNoun: 'Month',
  principalShare: 0,
  monthlySchedule: [],
  yearlySchedule: [],
  valid: false,
};

/** Amortization rows re-expressed as beginning/interest/ending, so ONE table serves every mode. */
function amortToAccrual(rows: AmortRow[], opening: number): AccrualRow[] {
  let beginning = opening;
  return rows.map((r) => {
    const row: AccrualRow = { period: r.period, beginning, interest: r.interest, ending: r.balance };
    beginning = r.balance;
    return row;
  });
}

/** Collapse accrual rows into years: the year's opening balance, its total interest, its close. */
export function collapseAccrualYearly(rows: AccrualRow[], perYear: number): AccrualRow[] {
  const size = Math.max(1, Math.round(perYear));
  const yearly: AccrualRow[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    yearly.push({
      period: Math.floor(i / size) + 1,
      beginning: chunk[0].beginning,
      interest: chunk.reduce((s, r) => s + r.interest, 0),
      ending: chunk[chunk.length - 1].ending,
    });
  }
  return yearly;
}

/**
 * The three loan modes over one normalised effective rate.
 *
 * Every figure derives from `effectiveAnnualRate`, so the Compound select
 * genuinely changes the answer. `calculateLoan` is untouched — the amortized
 * mode re-derives its own schedule here because it must honour the payback
 * frequency, which the monthly-only shared helper cannot express.
 */
export function calculateExtendedLoan(input: ExtendedLoanInput): ExtendedLoanResult {
  const amount = Math.max(0, input.amount || 0);
  const totalMonths = Math.max(0, Math.round((input.termYears || 0) * 12 + (input.termMonths || 0)));
  const years = totalMonths / 12;
  if (amount <= 0 || totalMonths <= 0) return { ...EMPTY, mode: input.mode };

  const ear = effectiveAnnualRate(input.annualInterestRate, compoundFrequency(input.compoundKey).perYear);
  if (!Number.isFinite(ear) || ear <= -1) return { ...EMPTY, mode: input.mode };

  const monthlyRate = periodicRate(ear, 12);

  if (input.mode === 'amortized') {
    const pay = paybackFrequency(input.paybackKey);
    const periods = Math.max(1, Math.round(years * pay.perYear));
    const rate = periodicRate(ear, pay.perYear);
    const payment = pmt(amount, rate, periods);
    if (!Number.isFinite(payment)) return { ...EMPTY, mode: input.mode };

    // The visitor's own schedule runs at the PAYBACK frequency, which is what the
    // table shows; a payment period is a month only when they pay monthly.
    const rows = buildAmortization2(amount, rate, periods, payment);
    const totalPaid = rows.reduce((s, r) => s + r.payment, 0);
    const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
    const accrual = amortToAccrual(rows, amount);
    return {
      mode: 'amortized',
      primary: payment,
      totalInterest,
      totalPaid,
      paymentCount: rows.length,
      paymentLabel: pay.label,
      periodsPerYear: pay.perYear,
      periodNoun: PERIOD_NOUNS[pay.key] ?? 'Period',
      principalShare: totalPaid > 0 ? amount / totalPaid : 0,
      monthlySchedule: accrual,
      yearlySchedule: collapseAccrualYearly(accrual, pay.perYear),
      valid: true,
    };
  }

  // Deferred: the loan grows untouched until maturity. Bond: solve the same
  // growth backwards for what the borrower receives today.
  const growth = Math.pow(1 + ear, years);
  if (!Number.isFinite(growth) || growth <= 0) return { ...EMPTY, mode: input.mode };

  const opening = input.mode === 'bond' ? amount / growth : amount;
  const maturity = input.mode === 'bond' ? amount : amount * growth;
  const totalInterest = maturity - opening;

  const monthly = buildAccrual(opening, monthlyRate, totalMonths);
  return {
    mode: input.mode,
    primary: input.mode === 'bond' ? opening : maturity,
    totalInterest,
    totalPaid: maturity,
    paymentCount: 0,
    paymentLabel: '',
    periodsPerYear: 12,
    periodNoun: 'Month',
    principalShare: maturity > 0 ? opening / maturity : 0,
    monthlySchedule: monthly,
    yearlySchedule: collapseAccrualYearly(monthly, 12),
    valid: true,
  };
}

/** Amortization at an ARBITRARY periodic rate (the shared helper is monthly-only). */
function buildAmortization2(
  principal: number,
  rate: number,
  periods: number,
  payment: number,
): AmortRow[] {
  const rows: AmortRow[] = [];
  let balance = principal;
  for (let period = 1; period <= periods && balance > 0.005; period++) {
    const interest = balance * rate;
    let principalPaid = payment - interest;
    if (principalPaid > balance) principalPaid = balance;
    balance -= principalPaid;
    rows.push({
      period,
      payment: principalPaid + interest,
      principal: principalPaid,
      interest,
      balance: Math.max(0, balance),
    });
  }
  return rows;
}

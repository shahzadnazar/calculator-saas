/**
 * Interest Rate form binding — solve for the rate a loan implies.
 *
 * Wraps the UNCHANGED `solveAnnualRate` (which bisects the shared `@lib/finance`
 * `pmt` for the monthly rate and returns the ANNUAL rate as a percent) and layers
 * the visitor-facing contract the pure solver deliberately lacks: strict field
 * parsing (never `Number(v) || 0`), required and range validation, a cross-field
 * FEASIBILITY check (a payment too low to repay the loan even at 0% is rejected,
 * where the pure function silently floors to 0), a complete-result guard, and the
 * presentation.
 *
 * WHAT THE RESULT SHOWS. The rate is the answer, but a rate on its own is hard to
 * feel. So the result also carries what the loan actually costs — the total of every
 * payment and the interest inside it — a ring splitting that total into principal
 * and interest, and the amortization graph of the balance falling while interest and
 * payments rise. All of it comes from `calculateAmortization` run at the SOLVED rate
 * with the visitor's own payment, so the picture is of the loan they described.
 *
 * TERM is two boxes but one quantity, in years and months, capped at 30 years — the
 * same ceiling the rest of the loan family uses, and what bounds the schedule the
 * charts are drawn from.
 *
 * The complete-result guard lives in `resultValue` as a NaN sentinel feeding the
 * runtime's DEFAULT finite gate; there is NO `isUsableResult`, because a valid 0%
 * result is a finite 0 the default gate already accepts.
 */
import { solveAnnualRate } from './interest-rate';
import { calculateAmortization, MAX_TERM_MONTHS, type AmortizationResult } from './amortization';
import { pmt } from '@lib/finance';
import { formatCurrency, formatCurrencyRounded, formatPercent } from '@lib/format';
import {
  drawDonut,
  drawLoanLineChart,
  percentLabel,
  share,
} from '@lib/result/loan-schedule';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** The term ceiling in whole years, shared with the rest of the loan family. */
export const MAX_TERM_YEARS = MAX_TERM_MONTHS / 12;

export interface InterestRateFormValues {
  amount: string;
  payment: string;
  termYears: string;
  termMonths: string;
}

export interface InterestRateComputed {
  /** Parsed principal. */
  amount: number;
  /** Parsed monthly payment. */
  payment: number;
  /** The term, in whole months, from both boxes. */
  months: number;
  /** Solved annual rate as a percent (0 for the zero-interest boundary). */
  annualRate: number;
  /** annualRate / 12. */
  monthlyRate: number;
  /** Total repaid = payment × months. */
  totalRepaid: number;
  /** What of that total is interest. */
  totalInterest: number;
  /** The loan the solved rate implies — the source of both charts. */
  plan: AmortizationResult;
}

const CLEARED_FIELDS = ['amount', 'payment', 'termYears', 'termMonths'] as const;

/** Guard reconciliation tolerances. */
const CONV_TOL = 1e-6; // annual/12 ↔ monthly, totalRepaid exactness
const RECONCILE_TOL = 0.01; // the solved rate must reproduce the payment through pmt to within a cent
/** Half-cent slack on the zero-interest minimum payment (principal ÷ months). */
const FEASIBILITY_SLACK = 0.005;

const FAIL = Number.NaN;

export const MSG = {
  amountRequired: 'Enter the loan amount.',
  amountPositive: 'Enter a loan amount greater than zero.',
  paymentRequired: 'Enter the monthly payment.',
  paymentPositive: 'Enter a monthly payment greater than zero.',
  termRequired: 'Enter a loan term of at least one month.',
  termWhole: 'Enter a whole number of years.',
  termWholeMonths: 'Enter a whole number of months.',
  termMax: `Enter a loan term of ${MAX_TERM_YEARS} years or less.`,
  infeasible:
    'This monthly payment is too low to repay the loan over the term. Enter a higher payment or a shorter term.',
} as const;

/* ------------------------------------------------------------------ */
/* Strict parsing                                                      */
/* ------------------------------------------------------------------ */

const parseStrict = (raw: string): number | null => {
  const s = raw.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const parsePositive = (raw: string): number | null => {
  const n = parseStrict(raw);
  return n !== null && n > 0 ? n : null;
};
/** A whole count of zero or more. Blank counts as zero — the other box may carry it. */
const parseWholeCount = (raw: string): number | null | 'blank' => {
  if (raw.trim() === '') return 'blank';
  const n = parseStrict(raw);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
};

/* ------------------------------------------------------------------ */
/* Read / validate / compute                                           */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string): HTMLInputElement | null =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export function readInterestRateValues(root: HTMLElement): InterestRateFormValues {
  return {
    amount: field(root, 'amount')?.value ?? '',
    payment: field(root, 'payment')?.value ?? '',
    termYears: field(root, 'termYears')?.value ?? '',
    termMonths: field(root, 'termMonths')?.value ?? '',
  };
}

/** The term the two boxes describe, or null when either does not parse. */
export function termInMonths(v: InterestRateFormValues): number | null {
  const years = parseWholeCount(v.termYears);
  const months = parseWholeCount(v.termMonths);
  if (years === null || months === null) return null;
  return (years === 'blank' ? 0 : years) * 12 + (months === 'blank' ? 0 : months);
}

export function validateInterestRate(v: InterestRateFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const amount = parsePositive(v.amount);
  if (amount === null) {
    fieldErrors.amount = v.amount.trim() === '' ? MSG.amountRequired : MSG.amountPositive;
  }

  const payment = parsePositive(v.payment);
  if (payment === null) {
    fieldErrors.payment = v.payment.trim() === '' ? MSG.paymentRequired : MSG.paymentPositive;
  }

  // The term is two boxes but one quantity. Each must parse on its own; then the pair
  // has to add up to something worth scheduling, reported against the years box.
  const years = parseWholeCount(v.termYears);
  if (years === null) fieldErrors.termYears = MSG.termWhole;
  const monthsBox = parseWholeCount(v.termMonths);
  if (monthsBox === null) fieldErrors.termMonths = MSG.termWholeMonths;

  const months = termInMonths(v);
  if (months !== null) {
    if (months < 1) fieldErrors.termYears = MSG.termRequired;
    else if (months > MAX_TERM_MONTHS) fieldErrors.termYears = MSG.termMax;
  }

  // Cross-field feasibility: the smallest payment that ever repays the loan is the
  // zero-interest payment, principal ÷ months. A payment below it can never amortize
  // the loan (the pure solver floors to a misleading 0). Only checked once every
  // field parses and the payment itself is otherwise valid.
  if (
    amount !== null &&
    payment !== null &&
    months !== null &&
    months >= 1 &&
    months <= MAX_TERM_MONTHS &&
    !fieldErrors.payment
  ) {
    if (payment < amount / months - FEASIBILITY_SLACK) fieldErrors.payment = MSG.infeasible;
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function computeInterestRate(v: InterestRateFormValues): InterestRateComputed {
  const amount = parsePositive(v.amount) ?? Number.NaN;
  const payment = parsePositive(v.payment) ?? Number.NaN;
  const months = termInMonths(v) ?? Number.NaN;
  const annualRate = solveAnnualRate(amount, payment, months);
  const totalRepaid = payment * months;
  return {
    amount,
    payment,
    months,
    annualRate,
    monthlyRate: annualRate / 12,
    totalRepaid,
    totalInterest: totalRepaid - amount,
    // The loan the answer describes: the visitor's own payment, at the rate just
    // solved for, so the schedule and both charts are of THIS loan and not an
    // idealised one.
    plan: calculateAmortization({ amount, annualRatePct: annualRate, months, payment }),
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (in resultValue — NO isUsableResult)          */
/* ------------------------------------------------------------------ */

/**
 * Returns the finite annual rate ONLY when the whole result is well-formed — a
 * finite non-negative rate, monthly = annual ÷ 12, a whole positive term, matching
 * totals, a schedule that repays the loan and lands on zero, and — crucially —
 * recomputing the payment with the UNCHANGED shared `pmt` at the solved rate
 * reproduces the submitted payment within the solver's tolerance. That last check
 * rejects an unbracketable extreme and confirms the zero-interest boundary
 * reconciles to principal ÷ months.
 */
export function completeInterestRateValue(c: InterestRateComputed): number {
  const { amount, payment, months, annualRate, monthlyRate, totalRepaid, totalInterest, plan } = c;
  if (!Number.isFinite(amount) || amount <= 0) return FAIL;
  if (!Number.isFinite(payment) || payment <= 0) return FAIL;
  if (!Number.isInteger(months) || months < 1 || months > MAX_TERM_MONTHS) return FAIL;
  if (!Number.isFinite(annualRate) || annualRate < 0) return FAIL;
  if (Math.abs(monthlyRate * 12 - annualRate) > CONV_TOL) return FAIL;
  if (!Number.isFinite(totalRepaid) || Math.abs(totalRepaid - payment * months) > CONV_TOL) return FAIL;
  if (!Number.isFinite(totalInterest) || Math.abs(totalInterest - (totalRepaid - amount)) > CONV_TOL) {
    return FAIL;
  }
  // Interest is never negative: the feasibility check should already have caught a
  // payment that does not even return the principal.
  if (totalInterest < -CONV_TOL) return FAIL;

  const recomputed = pmt(amount, annualRate / 100 / 12, months);
  if (!Number.isFinite(recomputed) || Math.abs(recomputed - payment) > RECONCILE_TOL) return FAIL;

  // The schedule the charts are drawn from has to describe the same loan.
  if (!plan || plan.schedule.length !== months) return FAIL;
  if (Math.abs(plan.loanAmount - amount) > RECONCILE_TOL) return FAIL;
  if (Math.abs(plan.schedule[plan.schedule.length - 1].balance) > 1) return FAIL;
  let sumInterest = 0;
  for (const row of plan.schedule) {
    if (![row.payment, row.principal, row.interest, row.balance].every(Number.isFinite)) return FAIL;
    if (row.interest < 0 || row.balance < 0) return FAIL;
    sumInterest += row.interest;
  }
  // The schedule's interest and the headline total must agree within a rounding of
  // the final short payment.
  if (Math.abs(sumInterest - totalInterest) > Math.max(1, Math.abs(totalInterest) * 1e-6)) return FAIL;

  return annualRate;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface InterestRatePresentation {
  /** Dominant annual rate, e.g. "5.065%". */
  rate: string;
  /** The monthly equivalent, e.g. "0.422%". */
  monthlyRate: string;
  /** "Total of 36 monthly payments". */
  paymentsLabel: string;
  totalRepaid: string;
  totalInterest: string;
  interpretation: string;
}

const paymentsPhrase = (months: number): string =>
  `${months} monthly payment${months === 1 ? '' : 's'}`;

/** Speak a percent to at most 3 decimals with no trailing zeros ("5 percent", "5.065 percent"). */
export function spokenPercent(rate: number): string {
  return `${Number(rate.toFixed(3))} percent`;
}

export function presentInterestRate(r: InterestRateComputed): InterestRatePresentation {
  const rate = formatPercent(r.annualRate, 3);
  const monthly = formatPercent(r.monthlyRate, 3);
  const amount = formatCurrency(r.amount);
  const payment = formatCurrency(r.payment);
  return {
    rate,
    monthlyRate: monthly,
    paymentsLabel: `Total of ${paymentsPhrase(r.months)}`,
    totalRepaid: formatCurrency(r.totalRepaid),
    totalInterest: formatCurrency(r.totalInterest),
    interpretation: `To repay ${amount} with ${paymentsPhrase(r.months)} of ${payment}, the implied interest rate is about ${rate} a year (${monthly} a month).`,
  };
}

export function describeInterestRate(c: InterestRateComputed): string {
  return `Estimated annual interest rate: ${spokenPercent(c.annualRate)}.`;
}

function donutLabel(c: InterestRateComputed): string {
  const p = share(c.amount, c.totalRepaid);
  const i = share(c.totalInterest, c.totalRepaid);
  return (
    `Of ${formatCurrency(c.totalRepaid)} repaid in total, ${formatCurrency(c.amount)} ` +
    `(${percentLabel(p)}) is principal and ${formatCurrency(c.totalInterest)} ` +
    `(${percentLabel(i)}) is interest.`
  );
}

/** The three cumulative series the amortization graph plots. */
function chartSeries(plan: AmortizationResult) {
  let cumInterest = 0;
  let cumPaid = 0;
  const balance: number[] = [];
  const interest: number[] = [];
  const paid: number[] = [];
  for (const row of plan.schedule) {
    cumInterest += row.interest;
    cumPaid += row.payment;
    balance.push(row.balance);
    interest.push(cumInterest);
    paid.push(cumPaid);
  }
  return { balance, interest, paid, cumInterest, cumPaid };
}

/** "3 years", "18 months", "2 years 6 months" — the axis label for the term. */
export function termLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} year${y === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} month${m === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : '0 months';
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

export function renderInterestRateResult(
  result: InterestRateComputed,
  context: FormRenderContext,
): void {
  const p = presentInterestRate(result);
  const scope = context.result;
  const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
  const setText = (sel: string, value: string) => {
    const el = q(sel);
    if (el) el.textContent = value;
  };
  const show = (sel: string, visible: boolean) => {
    const el = q(sel);
    if (el) el.hidden = !visible;
  };

  setText('[data-result-when~="valid"] [data-result-value]', p.rate);
  setText('[data-result-when~="valid"] [data-result-value-a11y]', `${spokenPercent(result.annualRate)} per year`);

  setText('[data-ir-payments-label]', p.paymentsLabel);
  setText('[data-ir-total]', p.totalRepaid);
  setText('[data-ir-interest]', p.totalInterest);
  setText('[data-ir-monthly]', p.monthlyRate);
  setText('[data-ir-interpretation]', p.interpretation);

  // Payment breakdown: what the total repaid is made of.
  const charted = drawDonut(
    q('[data-ir-donut]'),
    [
      { key: 'principal', value: result.amount },
      { key: 'interest', value: result.totalInterest },
    ],
    { prefix: 'ir', label: donutLabel(result) },
  );
  show('[data-ir-donut-figure]', charted);
  if (charted) {
    const principalShare = share(result.amount, result.totalRepaid);
    const interestShare = share(result.totalInterest, result.totalRepaid);
    setText('[data-ir-share-principal]', percentLabel(principalShare));
    setText('[data-ir-share-interest]', percentLabel(interestShare));
    setText('[data-ir-share-principal-amt]', formatCurrencyRounded(result.amount));
    setText('[data-ir-share-interest-amt]', formatCurrencyRounded(result.totalInterest));
  }

  // Loan amortization graph: the balance falling as interest and payments rise.
  const s = chartSeries(result.plan);
  const graphed = drawLoanLineChart(
    q('[data-ir-chart]'),
    [
      { key: 'balance', values: s.balance },
      { key: 'interest', values: s.interest },
      { key: 'paid', values: s.paid },
    ],
    {
      prefix: 'ir',
      xStart: 'Start',
      xEnd: termLabel(result.months),
      label:
        `Balance falls from ${formatCurrency(result.amount)} to zero over ${termLabel(result.months)}, ` +
        `while total paid rises to ${formatCurrency(s.cumPaid)}, of which ` +
        `${formatCurrency(s.cumInterest)} is interest.`,
    },
  );
  show('[data-ir-chart-figure]', graphed);
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

export function resetInterestRateValues(root: HTMLElement, _mode: ResetMode): void {
  for (const name of CLEARED_FIELDS) {
    const el = field(root, name);
    if (el) el.value = '';
  }
}

export const interestRateBinding: FormCalculatorBinding<
  InterestRateFormValues,
  InterestRateComputed
> = {
  readValues: readInterestRateValues,
  validate: validateInterestRate,
  compute: computeInterestRate,
  describeResult: describeInterestRate,
  renderResult: renderInterestRateResult,
  resetValues: resetInterestRateValues,
  resultValue: completeInterestRateValue,
  // NO isUsableResult — the complete-result guard lives in resultValue (NaN sentinel).
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * The labelled example shown on first load — the published worked case the tests
 * pin to the cent, so the example a visitor sees is provably the same arithmetic the
 * calculator will do with their own numbers.
 */
export const INTEREST_RATE_EXAMPLE_VALUES: InterestRateFormValues = {
  amount: '32000',
  payment: '960',
  termYears: '3',
  termMonths: '0',
};

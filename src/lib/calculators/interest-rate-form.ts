/**
 * Interest Rate form binding (R15B3 — Loan family follow-on, 3 of 3; task-first).
 *
 * Wraps the UNCHANGED `solveAnnualRate` (which bisects the shared `@lib/finance`
 * `pmt` for the monthly rate and returns the ANNUAL rate as a percent) and layers
 * the visitor-facing contract the pure solver deliberately lacks: strict field
 * parsing (never `Number(v) || 0`), required + range validation, a cross-field
 * FEASIBILITY check (a payment too low to repay the loan even at 0% is rejected,
 * where the pure function silently floors to 0), a complete-result guard, and the
 * result presentation / announcement.
 *
 * Own file — imports nothing from loan-form / home-equity-loan-form / amortization-
 * form. The complete-result guard lives in `resultValue` as a NaN sentinel → the
 * runtime's DEFAULT finite gate; there is NO `isUsableResult` (the source needs no
 * runtime widening — a valid 0% result is a finite 0 the default gate accepts).
 *
 * Term is in MONTHS (the frozen source unit; this tool's offers quote "$X/month
 * for N months"), a whole number ≥ 1, with no upper cap (the source has none).
 */
import { solveAnnualRate } from './interest-rate';
import { pmt } from '@lib/finance';
import { formatCurrency, formatPercent } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export interface InterestRateFormValues {
  amount: string;
  payment: string;
  months: string;
}

export interface InterestRateComputed {
  /** Parsed principal. */
  amount: number;
  /** Parsed monthly payment. */
  payment: number;
  /** Parsed whole term in months. */
  months: number;
  /** Solved annual rate as a percent (0 for the zero-interest boundary). */
  annualRate: number;
  /** annualRate / 12. */
  monthlyRate: number;
  /** Total repaid = payment × months (the frozen secondary figure). */
  totalRepaid: number;
}

const FIELDS = ['amount', 'payment', 'months'] as const;

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
  termRequired: 'Enter the loan term in months.',
  termWhole: 'Enter a whole loan term of 1 month or more.',
  infeasible: 'This monthly payment is too low to repay the loan over the term. Enter a higher payment or a shorter term.',
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
const parseWholeMonths = (raw: string): number | null => {
  const n = parseStrict(raw);
  return n !== null && Number.isInteger(n) && n >= 1 ? n : null;
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
    months: field(root, 'months')?.value ?? '',
  };
}

export function validateInterestRate(v: InterestRateFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const amount = parsePositive(v.amount);
  if (amount === null) fieldErrors.amount = v.amount.trim() === '' ? MSG.amountRequired : MSG.amountPositive;

  const payment = parsePositive(v.payment);
  if (payment === null) fieldErrors.payment = v.payment.trim() === '' ? MSG.paymentRequired : MSG.paymentPositive;

  const months = parseWholeMonths(v.months);
  if (months === null) fieldErrors.months = v.months.trim() === '' ? MSG.termRequired : MSG.termWhole;

  // Cross-field feasibility: the smallest payment that ever repays the loan is the
  // zero-interest payment principal ÷ months. A payment below it can never amortize
  // the loan (the pure solver floors to a misleading 0). Only checked once every
  // field parses and the payment itself is otherwise valid.
  if (amount !== null && payment !== null && months !== null && !fieldErrors.payment) {
    if (payment < amount / months - FEASIBILITY_SLACK) fieldErrors.payment = MSG.infeasible;
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function computeInterestRate(v: InterestRateFormValues): InterestRateComputed {
  const amount = parsePositive(v.amount) ?? Number.NaN;
  const payment = parsePositive(v.payment) ?? Number.NaN;
  const months = parseWholeMonths(v.months) ?? Number.NaN;
  const annualRate = solveAnnualRate(amount, payment, months);
  return {
    amount,
    payment,
    months,
    annualRate,
    monthlyRate: annualRate / 12,
    totalRepaid: payment * months,
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (in resultValue — NO isUsableResult)          */
/* ------------------------------------------------------------------ */

/**
 * Returns the finite annual rate ONLY when the whole result is well-formed —
 * finite non-negative rate, monthly = annual ÷ 12, whole positive months, matching
 * total repaid, and — crucially — recomputing the payment with the UNCHANGED shared
 * `pmt` at the solved rate reproduces the submitted payment within the solver
 * tolerance (this rejects an unbracketable extreme, and confirms the zero-interest
 * boundary reconciles to principal ÷ months). Otherwise NaN → the default gate
 * renders it invalid. A valid 0% rate is a finite 0 the default gate accepts.
 */
export function completeInterestRateValue(c: InterestRateComputed): number {
  const { amount, payment, months, annualRate, monthlyRate, totalRepaid } = c;
  if (!Number.isFinite(amount) || amount <= 0) return FAIL;
  if (!Number.isFinite(payment) || payment <= 0) return FAIL;
  if (!Number.isInteger(months) || months < 1) return FAIL;
  if (!Number.isFinite(annualRate) || annualRate < 0) return FAIL;
  if (Math.abs(monthlyRate * 12 - annualRate) > CONV_TOL) return FAIL;
  if (!Number.isFinite(totalRepaid) || Math.abs(totalRepaid - payment * months) > CONV_TOL) return FAIL;
  const recomputed = pmt(amount, annualRate / 100 / 12, months);
  if (!Number.isFinite(recomputed) || Math.abs(recomputed - payment) > RECONCILE_TOL) return FAIL;
  return annualRate;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface InterestRatePresentation {
  /** Dominant annual rate, e.g. "5.05%". */
  rate: string;
  /** Prominent secondary — monthly rate, e.g. "0.421%". */
  monthlyRate: string;
  /** Prominent secondary — the supplied monthly payment. */
  payment: string;
  /** Supporting — the principal. */
  amount: string;
  /** Supporting — "N monthly payments" (the term in months = the payment count). */
  payments: string;
  /** Supporting — total repaid (the frozen figure). */
  totalRepaid: string;
  /** Immediate interpretation. */
  interpretation: string;
}

const paymentsLabel = (months: number): string => `${months} monthly payment${months === 1 ? '' : 's'}`;

/** Speak a percent to at most 2 decimals with no trailing zeros ("5 percent", "5.05 percent"). */
export function spokenPercent(rate: number): string {
  return `${Number(rate.toFixed(2))} percent`;
}

export function presentInterestRate(r: InterestRateComputed): InterestRatePresentation {
  const rate = formatPercent(r.annualRate, 2);
  const monthly = formatPercent(r.monthlyRate, 3);
  const amount = formatCurrency(r.amount);
  const payment = formatCurrency(r.payment);
  return {
    rate,
    monthlyRate: monthly,
    payment,
    amount,
    payments: paymentsLabel(r.months),
    totalRepaid: formatCurrency(r.totalRepaid),
    interpretation: `To repay ${amount} with ${paymentsLabel(r.months)} of ${payment}, the implied interest rate is about ${rate} a year (${monthly} a month).`,
  };
}

export function describeInterestRate(c: InterestRateComputed): string {
  return `Estimated annual interest rate: ${spokenPercent(c.annualRate)}.`;
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

export function renderInterestRateResult(result: InterestRateComputed, context: FormRenderContext): void {
  const p = presentInterestRate(result);
  const q = (sel: string) => context.result.querySelector<HTMLElement>(sel);
  const setText = (sel: string, value: string) => {
    const el = q(sel);
    if (el) el.textContent = value;
  };

  const primary = q('[data-result-when~="valid"] [data-result-value]');
  if (primary) primary.textContent = p.rate;
  const a11y = q('[data-result-when~="valid"] [data-result-value-a11y]');
  if (a11y) a11y.textContent = `${spokenPercent(result.annualRate)} per year`;

  setText('[data-ir-monthly]', p.monthlyRate);
  setText('[data-ir-payment]', p.payment);
  setText('[data-ir-amount]', p.amount);
  setText('[data-ir-payments]', p.payments);
  setText('[data-ir-total]', p.totalRepaid);
  setText('[data-ir-interpretation]', p.interpretation);
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

export function resetInterestRateValues(root: HTMLElement, _mode: ResetMode): void {
  for (const name of FIELDS) {
    const el = field(root, name);
    if (el) el.value = '';
  }
}

export const interestRateBinding: FormCalculatorBinding<InterestRateFormValues, InterestRateComputed> = {
  readValues: readInterestRateValues,
  validate: validateInterestRate,
  compute: computeInterestRate,
  renderResult: renderInterestRateResult,
  describeResult: describeInterestRate,
  resultValue: completeInterestRateValue,
  resetValues: resetInterestRateValues,
  // NO isUsableResult — the complete-result guard lives in resultValue (NaN sentinel).
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * Example inputs for the labelled worked result shown on first load.
 *
 * These are OURS, not the visitor's. The shared runtime computes them and calls
 * this binding's own `renderResult`, so the example reuses the calculator's real
 * result markup and can never drift from the engine. The visitor's fields are
 * never written to — they load and stay empty behind it.
 */
export const INTEREST_RATE_EXAMPLE_VALUES: InterestRateFormValues = { amount: '20000', payment: '400', months: '60' };

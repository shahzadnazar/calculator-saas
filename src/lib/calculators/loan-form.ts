/**
 * Loan form binding (R15B1 — Loan family pilot, 1 of 3).
 *
 * Wraps the UNCHANGED `calculateLoan` (and, beneath it, the shared @lib/finance
 * engine — pmt / buildAmortization / collapseYearly), frozen by loan.test.ts +
 * finance.test.ts. Everything here is at the VALIDATION / PRESENTATION boundary;
 * the pure formula is untouched.
 *
 * INDEPENDENCE: Loan owns this binding outright. It imports NOTHING from
 * amortization-form.ts and shares no implementation file with the Amortization
 * calculator. The two are distinct public products on the same frozen engine —
 * the mirror-not-share discipline used for Volume↔Area and Pregnancy↔Due-Date.
 * Loan presents ONLY the yearly amortization schedule (Amortization additionally
 * offers a monthly view); the complete-result guard still validates the entire
 * computed result, including the monthly schedule, so a malformed result can
 * never render.
 *
 * Product decisions (R15B1):
 *   • Task-first: fields start EMPTY; the visitor presses "Calculate Loan Payment"
 *     for the first result (live-after-first thereafter).
 *   • Loan amount must be > 0; interest rate must be >= 0 (0% is a valid,
 *     principal-only loan); loan term is a whole number of years in [1, 30] (a
 *     migrated-product boundary that bounds the schedule to ≤ 360 monthly rows).
 *     Empty / malformed / non-finite / fractional / out-of-range inputs are
 *     rejected here, never coerced to 0 or silently rounded.
 *   • The dominant result is the estimated monthly payment; total interest, total
 *     amount paid and the payoff period are supporting metrics; the yearly
 *     amortization schedule is an island-owned disclosure.
 *   • The complete-result guard lives in the ordinary `resultValue` (returns the
 *     finite monthly payment only when the WHOLE result reconciles, else a NaN
 *     sentinel → the runtime's default finite gate). There is NO `isUsableResult`.
 */
import { calculateLoan } from './loan';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
import type { AmortRow } from '@lib/finance';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** The migrated-product term ceiling (whole years). Bounds the schedule to MAX_MONTHLY_ROWS. */
export const MAX_TERM_YEARS = 30;
/** Hard ceiling on monthly rows, guaranteed by the term ceiling (30 × 12 = 360). */
export const MAX_MONTHLY_ROWS = MAX_TERM_YEARS * 12;

export interface LoanFormValues {
  amount: string;
  annualInterestRate: string;
  termYears: string;
}

/** The computed result is exactly `calculateLoan`'s output — an unchanged pass-through. */
export type LoanComputed = ReturnType<typeof calculateLoan>;

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — strict, never Number(v) || 0          */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Finite and strictly greater than zero: the loan amount. */
function parsePositive(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

/** Finite and >= 0: the interest rate. 0% is a valid loan. */
function parseNonNegative(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Finite WHOLE number of years within [1, MAX_TERM_YEARS]; fractional / out-of-range is rejected. */
function parseWholeTerm(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_TERM_YEARS) return 'invalid';
  return n;
}

export const AMOUNT_REQUIRED_MSG = 'Enter a loan amount.';
export const AMOUNT_POSITIVE_MSG = 'Enter a loan amount greater than zero.';
export const RATE_REQUIRED_MSG = 'Enter an interest rate.';
export const RATE_NONNEG_MSG = 'Enter an interest rate of zero or more.';
/** One message for a missing OR out-of-range term. */
export const TERM_MESSAGE = `Enter a whole loan term from 1 to ${MAX_TERM_YEARS} years.`;

/**
 * Validate loan values. Amount (> 0), rate (>= 0) and term (whole, 1–30) are all
 * required. The term rule is the migrated-product boundary; the message is
 * intentionally the same for a missing and an out-of-range term.
 */
export function validateLoanValues(values: LoanFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const amount = parsePositive(values.amount);
  if (amount === 'empty') fieldErrors.amount = AMOUNT_REQUIRED_MSG;
  else if (amount === 'invalid') fieldErrors.amount = AMOUNT_POSITIVE_MSG;

  const rate = parseNonNegative(values.annualInterestRate);
  if (rate === 'empty') fieldErrors.annualInterestRate = RATE_REQUIRED_MSG;
  else if (rate === 'invalid') fieldErrors.annualInterestRate = RATE_NONNEG_MSG;

  const term = parseWholeTerm(values.termYears);
  if (term === 'empty' || term === 'invalid') fieldErrors.termYears = TERM_MESSAGE;

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged pass-through to calculateLoan        */
/* ------------------------------------------------------------------ */

export function computeLoan(values: LoanFormValues): LoanComputed {
  return calculateLoan({
    amount: Number(values.amount),
    annualInterestRate: Number(values.annualInterestRate),
    termYears: Number(values.termYears),
  });
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** A USD amount in spoken form, e.g. "377 dollars and 42 cents", for the announcement. */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

/** Human payoff period, e.g. 60 → "5 years", 30 → "2 years 6 months". */
export function payoffLabel(months: number): string {
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (rem > 0) parts.push(`${rem} month${rem === 1 ? '' : 's'}`);
  return parts.join(' ') || '0 months';
}

/** Concise announcement — the dominant monthly payment, the number of payments and total interest. */
export function describeLoanResult(result: LoanComputed): string {
  const n = result.payoffMonths;
  const payments = `${n} monthly payment${n === 1 ? '' : 's'}`;
  return `Your estimated monthly payment is ${spokenUSD(result.monthlyPayment)} over ${payments}, with ${spokenUSD(result.totalInterest)} in total interest.`;
}

/* ------------------------------------------------------------------ */
/* DOM rendering (safe — no innerHTML)                                 */
/* ------------------------------------------------------------------ */

/** One yearly schedule row built with the DOM API — year as a row header, three
 *  right-aligned money cells. Never uses innerHTML, so values can never be markup. */
function scheduleRow(row: AmortRow): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'loan-row';

  const period = document.createElement('th');
  period.scope = 'row';
  period.className = 'loan-cell loan-cell--period';
  period.textContent = String(row.period);
  tr.append(period);

  for (const value of [row.principal, row.interest, row.balance]) {
    const td = document.createElement('td');
    td.className = 'loan-cell loan-num';
    td.textContent = formatCurrencyRounded(value);
    tr.append(td);
  }
  return tr;
}

/** Replace a tbody's rows in one pass via a fragment (all rows; no pagination). */
function fillBody(tbody: HTMLElement | null, rows: readonly AmortRow[]): void {
  if (!tbody) return;
  const frag = document.createDocumentFragment();
  for (const row of rows) frag.append(scheduleRow(row));
  tbody.replaceChildren(frag);
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const ROW_SUM_TOL = 1e-6;
const ZERO_BAL_TOL = 1e-2;
const reconTol = (magnitude: number) => Math.max(1, Math.abs(magnitude) * 1e-6);

const FAIL = Number.NaN; // non-finite sentinel → the runtime's default finite gate rejects the result

function rowsFiniteNonNegative(rows: readonly AmortRow[]): boolean {
  for (const r of rows) {
    if (
      !Number.isFinite(r.period) ||
      !Number.isFinite(r.payment) ||
      !Number.isFinite(r.principal) ||
      !Number.isFinite(r.interest) ||
      !Number.isFinite(r.balance)
    ) {
      return false;
    }
    if (r.payment < 0 || r.principal < 0 || r.interest < 0 || r.balance < 0) return false;
  }
  return true;
}

/** Periods must run start, start+1, … with no gaps or reordering. */
function periodsOrderedFrom(rows: readonly AmortRow[], start: number): boolean {
  for (let i = 0; i < rows.length; i++) if (rows[i].period !== start + i) return false;
  return true;
}

/**
 * The dominant monthly payment — but ONLY when the ENTIRE computed result is
 * well-formed. Validates the summary, the full monthly schedule (ordered,
 * finite, per-row payment = principal + interest, final balance ≈ 0, Σ principal
 * ≈ the loan amount, Σ interest ≈ totalInterest) AND the yearly schedule (ordered,
 * finite, final balance ≈ 0, totals reconciling with the monthly schedule). Any
 * failure returns the NaN sentinel, which the standard-form runtime's DEFAULT
 * finite gate rejects — there is deliberately NO `isUsableResult`.
 */
export function completeLoanValue(result: LoanComputed): number {
  const { monthlyPayment, totalInterest, totalPaid, payoffMonths, schedule, yearlySchedule } = result;

  // --- Summary ---
  if (!Number.isFinite(monthlyPayment) || monthlyPayment < 0) return FAIL;
  if (!Number.isFinite(totalInterest) || totalInterest < 0) return FAIL;
  if (!Number.isFinite(totalPaid) || totalPaid < 0) return FAIL;
  if (
    !Number.isFinite(payoffMonths) ||
    !Number.isInteger(payoffMonths) ||
    payoffMonths < 1 ||
    payoffMonths > MAX_MONTHLY_ROWS
  ) {
    return FAIL;
  }

  // --- Monthly schedule ---
  if (!Array.isArray(schedule)) return FAIL;
  if (schedule.length !== payoffMonths) return FAIL;
  if (schedule.length < 1 || schedule.length > MAX_MONTHLY_ROWS) return FAIL;
  if (!periodsOrderedFrom(schedule, 1)) return FAIL;
  if (!rowsFiniteNonNegative(schedule)) return FAIL;

  let sumPrincipal = 0;
  let sumInterest = 0;
  for (const r of schedule) {
    if (Math.abs(r.payment - (r.principal + r.interest)) > ROW_SUM_TOL) return FAIL;
    sumPrincipal += r.principal;
    sumInterest += r.interest;
  }
  if (Math.abs(schedule[schedule.length - 1].balance) > ZERO_BAL_TOL) return FAIL; // final ~ 0

  // totalPaid = max(0, amount) + totalInterest, so the loan amount is totalPaid − totalInterest.
  const loanAmount = totalPaid - totalInterest;
  if (Math.abs(sumPrincipal - loanAmount) > reconTol(loanAmount)) return FAIL;
  if (Math.abs(sumInterest - totalInterest) > reconTol(totalInterest)) return FAIL;

  // --- Yearly schedule ---
  if (!Array.isArray(yearlySchedule) || yearlySchedule.length < 1) return FAIL;
  if (yearlySchedule.length !== Math.ceil(schedule.length / 12)) return FAIL;
  if (!periodsOrderedFrom(yearlySchedule, 1)) return FAIL;
  if (!rowsFiniteNonNegative(yearlySchedule)) return FAIL;
  if (Math.abs(yearlySchedule[yearlySchedule.length - 1].balance) > ZERO_BAL_TOL) return FAIL;

  let ySumPrincipal = 0;
  let ySumInterest = 0;
  for (const y of yearlySchedule) {
    ySumPrincipal += y.principal;
    ySumInterest += y.interest;
  }
  if (Math.abs(ySumPrincipal - sumPrincipal) > reconTol(sumPrincipal)) return FAIL;
  if (Math.abs(ySumInterest - sumInterest) > reconTol(sumInterest)) return FAIL;

  return monthlyPayment;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const loanBinding: FormCalculatorBinding<LoanFormValues, LoanComputed> = {
  readValues(root) {
    return {
      amount: control(root, 'amount')?.value ?? '',
      annualInterestRate: control(root, 'annualInterestRate')?.value ?? '',
      termYears: control(root, 'termYears')?.value ?? '',
    };
  },

  validate: validateLoanValues,

  compute: computeLoan,

  /** The dominant monthly payment when the ENTIRE result reconciles, else a NaN
   *  sentinel the runtime's default finite gate rejects — no isUsableResult. */
  resultValue: completeLoanValue,

  describeResult: describeLoanResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);

    // Dominant monthly payment (shown + spoken).
    const shown = q('[data-result-when~="valid"] [data-result-value]');
    if (shown) shown.textContent = formatCurrency(result.monthlyPayment);
    const spoken = q('[data-result-when~="valid"] [data-result-value-a11y]');
    if (spoken) spoken.textContent = spokenUSD(result.monthlyPayment);

    // Supporting metrics.
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };
    setText('[data-loan-interest]', formatCurrencyRounded(result.totalInterest));
    setText('[data-loan-total]', formatCurrencyRounded(result.totalPaid));
    setText('[data-loan-payoff]', payoffLabel(result.payoffMonths));

    // Yearly amortization schedule (island-owned disclosure).
    fillBody(q('[data-loan-rows]'), result.yearlySchedule);
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['amount', 'annualInterestRate', 'termYears']) {
      const el = control(root, name);
      if (el) el.value = '';
    }
  },
};

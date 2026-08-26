/**
 * Amortization form binding (R11B1 Commit 2 — task-first migration, calculator #NN).
 *
 * Wraps the UNCHANGED `calculateLoan` (and, beneath it, the shared @lib/finance engine —
 * pmt / buildAmortization / collapseYearly), frozen by loan.test.ts + finance.test.ts. Everything
 * here is at the VALIDATION / PRESENTATION boundary; the pure formula is untouched.
 *
 * Product decisions (R11B1):
 *   • Task-first: fields start EMPTY, the result is an instruction, and the visitor presses
 *     "Calculate Schedule" for the first result (live-after-first thereafter).
 *   • Loan term is a MIGRATED-PRODUCT boundary: required, finite, a whole number, 1–30 years.
 *     This 30-year ceiling is an intentional binding-layer limit (it bounds the monthly schedule
 *     to at most 360 rows), NOT a claim about the legacy formula, which never enforced a maximum.
 *   • Loan amount must be > 0 (a $0 loan has no schedule). Interest rate must be >= 0 (a 0% loan
 *     is valid — the frozen zero-rate branch produces a principal-only schedule). Negative and
 *     non-finite inputs are rejected here, never passed to the formula.
 *   • The calculator renders the FULL schedule — up to 360 monthly rows AND the yearly summary,
 *     every row, no pagination and no virtualization. Yearly is the default view; Monthly is on
 *     demand (a presentation switch the island owns).
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

/** The migrated-product term ceiling (whole years). Bounds the monthly schedule to MAX_MONTHLY_ROWS. */
export const MAX_TERM_YEARS = 30;
/** Hard ceiling on rendered monthly rows. Guaranteed by the term ceiling (30 × 12 = 360); the
 *  monthly render also slices to this as an explicit, testable contract. */
export const MAX_MONTHLY_ROWS = MAX_TERM_YEARS * 12;

export interface AmortValues {
  amount: string;
  annualInterestRate: string;
  termYears: string;
}

/** The computed result is exactly `calculateLoan`'s output — an unchanged pass-through. */
export type AmortComputed = ReturnType<typeof calculateLoan>;

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
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

/** Finite WHOLE number of years within [1, MAX_TERM_YEARS]. A fractional or out-of-range entry is
 *  rejected, never silently rounded or clamped. */
function parseWholeTerm(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_TERM_YEARS) return 'invalid';
  return n;
}

/** The single term message the migrated product uses for a missing OR out-of-range term. */
export const TERM_MESSAGE = `Enter a whole loan term from 1 to ${MAX_TERM_YEARS} years.`;

/**
 * Validate amortization values. Amount (> 0), rate (>= 0) and term (whole, 1–30) are all required.
 * The term rule is the migrated-product boundary; the message is intentionally the same for a
 * missing and an out-of-range term.
 */
export function validateAmortizationValues(values: AmortValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const amount = parsePositive(values.amount);
  if (amount === 'empty') fieldErrors.amount = 'Enter a loan amount.';
  else if (amount === 'invalid') fieldErrors.amount = 'Enter a loan amount greater than zero.';

  const rate = parseNonNegative(values.annualInterestRate);
  if (rate === 'empty') fieldErrors.annualInterestRate = 'Enter an interest rate.';
  else if (rate === 'invalid') fieldErrors.annualInterestRate = 'Enter an interest rate of zero or more.';

  const term = parseWholeTerm(values.termYears);
  if (term === 'empty' || term === 'invalid') fieldErrors.termYears = TERM_MESSAGE;

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged pass-through to calculateLoan        */
/* ------------------------------------------------------------------ */

export function computeAmortization(values: AmortValues): AmortComputed {
  return calculateLoan({
    amount: Number(values.amount),
    annualInterestRate: Number(values.annualInterestRate),
    termYears: Number(values.termYears),
  });
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** A USD amount in spoken form, e.g. "1580 dollars and 17 cents", for the announcement. */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

/** Concise announcement — the dominant monthly payment, the number of payments and total interest. */
export function describeAmortizationResult(result: AmortComputed): string {
  const n = result.payoffMonths;
  const payments = `${n} monthly payment${n === 1 ? '' : 's'}`;
  return `Your estimated monthly payment is ${spokenUSD(result.monthlyPayment)} over ${payments}, with ${spokenUSD(result.totalInterest)} in total interest.`;
}

/* ------------------------------------------------------------------ */
/* DOM rendering (safe — no innerHTML)                                 */
/* ------------------------------------------------------------------ */

/** One schedule row built with the DOM API — period as a row header, three right-aligned money
 *  cells. Never uses innerHTML, so schedule values can never be interpreted as markup. */
function scheduleRow(row: AmortRow): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'am-row';

  const period = document.createElement('th');
  period.scope = 'row';
  period.className = 'am-cell am-cell--period';
  period.textContent = String(row.period);
  tr.append(period);

  for (const value of [row.principal, row.interest, row.balance]) {
    const td = document.createElement('td');
    td.className = 'am-cell am-num';
    td.textContent = formatCurrencyRounded(value);
    tr.append(td);
  }
  return tr;
}

/** Replace a tbody's rows in one pass via a fragment (all rows; no pagination / virtualization). */
function fillBody(tbody: HTMLElement | null, rows: readonly AmortRow[]): void {
  if (!tbody) return;
  const frag = document.createDocumentFragment();
  for (const row of rows) frag.append(scheduleRow(row));
  tbody.replaceChildren(frag);
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

/**
 * Explicit floating-point tolerances. Per-row `payment == principal + interest` is an exact float
 * addition (buildAmortization stores `payment: principalPaid + interest`), so ROW_SUM_TOL is tiny;
 * a fully-amortized final balance is exactly 0 (the last principal is capped at the balance), so
 * ZERO_BAL_TOL only absorbs sub-cent noise; reconciliation sums scale with the loan, so RECON_TOL is
 * relative. These are loose enough for legitimate float noise yet tight enough to reject a schedule
 * malformed by dollars.
 */
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

/** Periods must run 1, 2, 3, … from the given start with no gaps or reordering. */
function periodsOrderedFrom(rows: readonly AmortRow[], start: number): boolean {
  for (let i = 0; i < rows.length; i++) if (rows[i].period !== start + i) return false;
  return true;
}

/**
 * The dominant monthly payment — but ONLY when the ENTIRE computed result is well-formed. The
 * complete-result contract (summary + full monthly schedule + yearly schedule, with reconciliation)
 * is enforced here so a malformed or non-reconciling result NEVER renders. Any failure returns the
 * NaN sentinel, which the standard-form runtime's DEFAULT finite gate rejects (the Inflation /
 * Square-Footage / Concrete / Triangle `resultValue`-guard pattern — NO `isUsableResult`).
 */
export function completeResultValue(result: AmortComputed): number {
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

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const amortizationBinding: FormCalculatorBinding<AmortValues, AmortComputed> = {
  readValues(root) {
    return {
      amount: input(root, 'amount')?.value ?? '',
      annualInterestRate: input(root, 'annualInterestRate')?.value ?? '',
      termYears: input(root, 'termYears')?.value ?? '',
    };
  },

  validate: validateAmortizationValues,

  compute: computeAmortization,

  /** The dominant monthly payment when the ENTIRE result is well-formed, else a NaN sentinel the
   *  runtime's default finite gate rejects. The complete-result contract lives in this ordinary
   *  result-value function — there is deliberately NO `isUsableResult` (the Inflation / Triangle
   *  pattern). */
  resultValue: completeResultValue,

  // No isUsableResult — the complete-result guard is the resultValue sentinel above.

  describeResult: describeAmortizationResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);

    // Dominant monthly payment (shown + spoken).
    const shown = q('[data-result-when~="valid"] [data-result-value]');
    if (shown) shown.textContent = formatCurrency(result.monthlyPayment);
    const spoken = q('[data-result-when~="valid"] [data-result-value-a11y]');
    if (spoken) spoken.textContent = spokenUSD(result.monthlyPayment);

    // Supporting totals.
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };
    setText('[data-am-interest]', formatCurrencyRounded(result.totalInterest));
    setText('[data-am-total]', formatCurrencyRounded(result.totalPaid));
    setText('[data-am-count]', `${result.payoffMonths} payment${result.payoffMonths === 1 ? '' : 's'}`);

    // Full schedule — both views populated in full. The monthly view is hard-capped at
    // MAX_MONTHLY_ROWS (already guaranteed by the term ceiling); the island toggles which view
    // is visible without recomputing.
    fillBody(q('[data-am-rows="yearly"]'), result.yearlySchedule);
    fillBody(q('[data-am-rows="monthly"]'), result.schedule.slice(0, MAX_MONTHLY_ROWS));
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['amount', 'annualInterestRate', 'termYears']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};

/* ------------------------------------------------------------------ */
/* Starting values (arrive-filled)                                     */
/* ------------------------------------------------------------------ */

/**
 * The values this calculator arrives filled with, so the visitor lands on a real
 * worked result they can type over instead of an empty form. They are OURS, not
 * the visitor's: the runtime computes them silently on mount (`prefill`), and
 * Reset still clears the form to blank rather than restoring them.
 *
 * Strings, because they are rendered straight into `value` attributes and read
 * back by `readValues` as strings — the same path a typed entry takes.
 */
export const AMORTIZATION_STARTING_VALUES = {
  amount: '250000',
  annualInterestRate: '6.5',
  termYears: '30',
} as const;

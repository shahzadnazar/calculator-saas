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

  /** The dominant magnitude the runtime guards for finiteness. */
  resultValue(result) {
    return result.monthlyPayment;
  },

  /** Widen the gate to also assert the 360-row schedule contract: a usable result has a finite
   *  monthly payment AND a non-empty schedule of at most MAX_MONTHLY_ROWS rows. Post-validation
   *  (amount > 0, term 1–30) this always holds; the guard makes the invariant explicit and rejects
   *  any malformed/empty schedule defensively rather than rendering it. */
  isUsableResult(result) {
    return (
      Number.isFinite(result.monthlyPayment) &&
      result.schedule.length >= 1 &&
      result.schedule.length <= MAX_MONTHLY_ROWS
    );
  },

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

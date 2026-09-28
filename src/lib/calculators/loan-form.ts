/**
 * Loan form binding — three loan modes over one normalised effective rate.
 *
 * Wraps `calculateExtendedLoan` (@lib/calculators/loan), which is pure and frozen
 * by loan.test.ts. Everything here is at the VALIDATION / PRESENTATION boundary;
 * no formula lives in this file. The original `calculateLoan` is re-exported
 * untouched — the Amortization calculator still consumes it.
 *
 * INDEPENDENCE: Loan owns this binding outright. It imports NOTHING from
 * amortization-form.ts and shares no implementation file with the Amortization
 * calculator. The two are distinct public products on the same frozen engine —
 * the mirror-not-share discipline used for Volume↔Area and Pregnancy↔Due-Date.
 *
 * The three modes answer three different questions with ONE set of fields:
 *   • amortized — a fixed amount paid back every payback period. Headline: the
 *     payment. The schedule runs at the PAYBACK frequency.
 *   • deferred  — nothing is paid until maturity. Headline: the amount then due.
 *   • bond      — a predetermined amount falls due at maturity. Headline: what
 *     the borrower receives today (the present value).
 * Only the amortized mode makes payments, so the Pay Back select is meaningless
 * in the other two; the island hides it rather than showing a dead control.
 *
 * Product decisions:
 *   • Task-first: fields start EMPTY behind a labelled worked example; the visitor
 *     presses Calculate for the first result (live-after-first thereafter).
 *   • Amount must be > 0; interest rate must be >= 0 (0% is a valid,
 *     principal-only loan); the term is whole years in [0, 30] PLUS whole extra
 *     months in [0, 11] and must come to at least one month. Empty / malformed /
 *     non-finite / fractional / out-of-range inputs are rejected here, never
 *     coerced to 0 or silently rounded.
 *   • Compound genuinely changes every figure: the quoted rate is normalised to
 *     an effective annual rate before anything is derived from it.
 *   • ONE schedule shape — beginning balance, interest, ending balance — serves
 *     all three modes in both the Annual and the detailed view, so there is no
 *     second markup path to drift.
 *   • The complete-result guard lives in the ordinary `resultValue` (returns the
 *     dominant figure only when the WHOLE result reconciles, else a NaN sentinel
 *     → the runtime's default finite gate). There is NO `isUsableResult`.
 */
import {
  calculateLoan,
  calculateExtendedLoan,
  type AccrualRow,
  type ExtendedLoanResult,
  type LoanMode,
} from './loan';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
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
  /** Which of the three loan shapes the visitor is asking about. */
  mode: string;
  amount: string;
  annualInterestRate: string;
  termYears: string;
  /** Extra whole months on top of the years, so a 10y 6m term is expressible. */
  termMonths: string;
  compoundKey: string;
  /** Amortized only; the accrual modes make no payments. */
  paybackKey: string;
}

/** The computed result now carries all three modes over one normalised rate. */
export type LoanComputed = ExtendedLoanResult;

/** `calculateLoan` is still exported for the Amortization calculator, which is untouched. */
export { calculateLoan };

export const MODE_LABELS: Record<LoanMode, string> = {
  amortized: 'Amortized loan',
  deferred: 'Deferred payment loan',
  bond: 'Bond',
};

/** The headline each mode answers — the label above the dominant figure. */
export const PRIMARY_LABELS: Record<LoanMode, string> = {
  amortized: 'Payment every period',
  deferred: 'Amount due at loan maturity',
  bond: 'Amount received when the loan starts',
};

/** The amount field asks a different question in bond mode. */
export const AMOUNT_LABELS: Record<LoanMode, string> = {
  amortized: 'Loan amount',
  deferred: 'Loan amount',
  bond: 'Predetermined due amount',
};

export const asMode = (raw: string): LoanMode =>
  raw === 'deferred' || raw === 'bond' ? raw : 'amortized';

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

export const AMOUNT_REQUIRED_MSG = 'Enter a loan amount.';
export const AMOUNT_POSITIVE_MSG = 'Enter a loan amount greater than zero.';
export const RATE_REQUIRED_MSG = 'Enter an interest rate.';
export const RATE_NONNEG_MSG = 'Enter an interest rate of zero or more.';
/** One message for a missing OR out-of-range term. */
export const TERM_MESSAGE = `Enter a whole number of years from 0 to ${MAX_TERM_YEARS}.`;

export const MONTHS_MESSAGE = 'Enter extra months from 0 to 11.';
export const TERM_TOTAL_MESSAGE = 'Enter a loan term of at least one month.';

/** Finite WHOLE months in [0, 11]; blank counts as 0 (the field is optional). */
function parseExtraMonths(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 11) return 'invalid';
  return n;
}

/** Whole years in [0, MAX_TERM_YEARS] — 0 is allowed when extra months carry the term. */
function parseYears(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_TERM_YEARS) return 'invalid';
  return n;
}

/**
 * Validate loan values for the SELECTED mode. Amount (> 0) and rate (>= 0) are
 * always required; the term is years + extra months and must come to at least
 * one month. The amount means different things per mode (a loan in amortized and
 * deferred, the amount falling due in bond) but the rule is the same, so the
 * message is looked up rather than branched.
 */
export function validateLoanValues(values: LoanFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const mode = asMode(values.mode);

  const amount = parsePositive(values.amount);
  if (amount === 'empty') fieldErrors.amount = amountRequiredMessage(mode);
  else if (amount === 'invalid') fieldErrors.amount = amountPositiveMessage(mode);

  const rate = parseNonNegative(values.annualInterestRate);
  if (rate === 'empty') fieldErrors.annualInterestRate = RATE_REQUIRED_MSG;
  else if (rate === 'invalid') fieldErrors.annualInterestRate = RATE_NONNEG_MSG;

  const years = parseYears(values.termYears);
  if (years === 'empty' || years === 'invalid') fieldErrors.termYears = TERM_MESSAGE;

  const months = parseExtraMonths(values.termMonths);
  if (months === 'invalid') fieldErrors.termMonths = MONTHS_MESSAGE;

  // A term of zero years AND zero months is no loan at all.
  if (typeof years === 'number' && typeof months === 'number' && years * 12 + months < 1) {
    fieldErrors.termYears = TERM_TOTAL_MESSAGE;
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export const amountRequiredMessage = (mode: LoanMode): string =>
  mode === 'bond' ? 'Enter the amount due at maturity.' : AMOUNT_REQUIRED_MSG;
export const amountPositiveMessage = (mode: LoanMode): string =>
  mode === 'bond'
    ? 'Enter an amount due greater than zero.'
    : AMOUNT_POSITIVE_MSG;

/* ------------------------------------------------------------------ */
/* Computation (pure) — a strict pass-through to the frozen engine     */
/* ------------------------------------------------------------------ */

export function computeLoan(values: LoanFormValues): LoanComputed {
  return calculateExtendedLoan({
    mode: asMode(values.mode),
    amount: Number(values.amount),
    annualInterestRate: Number(values.annualInterestRate),
    termYears: Number(values.termYears),
    termMonths: values.termMonths.trim() === '' ? 0 : Number(values.termMonths),
    compoundKey: values.compoundKey,
    paybackKey: values.paybackKey,
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

/** The label above the dominant figure — the question this mode answers. */
export function primaryLabel(result: LoanComputed): string {
  if (result.mode === 'amortized') {
    return result.paymentLabel ? `Payment ${result.paymentLabel.toLowerCase()}` : PRIMARY_LABELS.amortized;
  }
  return PRIMARY_LABELS[result.mode];
}

/**
 * The label of the "total" metric. Amortized loans total their payments; the two
 * accrual modes have no payments, so the same slot reports the maturity value.
 */
export function totalLabel(result: LoanComputed): string {
  if (result.mode !== 'amortized') return 'Amount due at maturity';
  const n = result.paymentCount;
  return `Total of ${n} payment${n === 1 ? '' : 's'}`;
}

/** The detailed schedule's period column header, e.g. "Month" or "Quarter". */
export const periodHeading = (result: LoanComputed): string => result.periodNoun || 'Period';

/** Concise announcement — the dominant figure for the mode, plus total interest. */
export function describeLoanResult(result: LoanComputed): string {
  if (result.mode === 'deferred') {
    return `The amount due at maturity is ${spokenUSD(result.primary)}, including ${spokenUSD(result.totalInterest)} in total interest.`;
  }
  if (result.mode === 'bond') {
    return `You receive ${spokenUSD(result.primary)} today for an amount due of ${spokenUSD(result.totalPaid)}, so total interest is ${spokenUSD(result.totalInterest)}.`;
  }
  const n = result.paymentCount;
  const cadence = result.paymentLabel ? result.paymentLabel.toLowerCase() : 'every period';
  return `Your payment is ${spokenUSD(result.primary)} ${cadence} over ${n} payment${n === 1 ? '' : 's'}, with ${spokenUSD(result.totalInterest)} in total interest.`;
}

/* ------------------------------------------------------------------ */
/* DOM rendering (safe — no innerHTML)                                 */
/* ------------------------------------------------------------------ */

/**
 * One schedule row: the period as a row header, then three right-aligned money
 * cells. The SAME row shape serves every mode — beginning balance, interest,
 * ending balance — which is what lets one table show an amortized loan and an
 * accruing one without a second markup path. Built with the DOM API, never
 * innerHTML, so a value can never become markup.
 */
function scheduleRow(row: AccrualRow): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'loan-row';

  const period = document.createElement('th');
  period.scope = 'row';
  period.className = 'loan-cell loan-cell--period';
  period.textContent = String(row.period);
  tr.append(period);

  for (const value of [row.beginning, row.interest, row.ending]) {
    const td = document.createElement('td');
    td.className = 'loan-cell loan-num';
    td.textContent = formatCurrencyRounded(value);
    tr.append(td);
  }
  return tr;
}

/**
 * The separator that closes a year inside the DETAILED schedule: the year's
 * number spanning the period + beginning + interest columns, and the balance the
 * year ends on under Ending Balance. It carries no `loan-row` class, so a row
 * count over `.loan-row` still counts real periods only.
 */
function yearEndRow(year: number, ending: number): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'loan-year-end';
  const label = document.createElement('th');
  label.scope = 'row';
  label.colSpan = 3;
  label.className = 'loan-cell loan-cell--year';
  label.textContent = `Year #${year} End`;
  const value = document.createElement('td');
  value.className = 'loan-cell loan-num';
  value.textContent = formatCurrencyRounded(ending);
  tr.append(label, value);
  return tr;
}

/**
 * Replace a tbody's rows in one pass via a fragment (all rows; no pagination).
 * `perYear > 1` interleaves the year-end separators, which is what turns the flat
 * period list into the familiar "Year #1 End" detailed schedule.
 */
function fillBody(
  tbody: HTMLElement | null,
  rows: readonly AccrualRow[],
  perYear = 0,
): void {
  if (!tbody) return;
  const frag = document.createDocumentFragment();
  const size = Math.round(perYear);
  rows.forEach((row, i) => {
    frag.append(scheduleRow(row));
    if (size > 1 && (i + 1) % size === 0) frag.append(yearEndRow((i + 1) / size, row.ending));
  });
  tbody.replaceChildren(frag);
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const ROW_SUM_TOL = 1e-6;
const reconTol = (magnitude: number) => Math.max(1, Math.abs(magnitude) * 1e-6);

const FAIL = Number.NaN; // non-finite sentinel → the runtime's default finite gate rejects the result

function rowsFiniteNonNegative(rows: readonly AccrualRow[]): boolean {
  for (const r of rows) {
    if (
      !Number.isFinite(r.period) ||
      !Number.isFinite(r.beginning) ||
      !Number.isFinite(r.interest) ||
      !Number.isFinite(r.ending)
    ) {
      return false;
    }
    if (r.beginning < 0 || r.interest < 0 || r.ending < 0) return false;
  }
  return true;
}

/** Periods must run start, start+1, … with no gaps or reordering. */
function periodsOrderedFrom(rows: readonly AccrualRow[], start: number): boolean {
  for (let i = 0; i < rows.length; i++) if (rows[i].period !== start + i) return false;
  return true;
}

/**
 * The dominant figure — but ONLY when the ENTIRE computed result is well-formed.
 * Validates the summary, both schedules (ordered, finite, non-negative), that
 * each row reconciles (beginning + interest === ending, less anything repaid),
 * and that the yearly view sums to the monthly one. Any failure returns the NaN
 * sentinel, which the standard-form runtime's DEFAULT finite gate rejects — there
 * is deliberately NO `isUsableResult`.
 */
export function completeLoanValue(result: LoanComputed): number {
  const { primary, totalInterest, totalPaid, monthlySchedule, yearlySchedule, valid } = result;

  if (!valid) return FAIL;
  if (!Number.isFinite(primary) || primary < 0) return FAIL;
  if (!Number.isFinite(totalInterest) || totalInterest < 0) return FAIL;
  if (!Number.isFinite(totalPaid) || totalPaid < 0) return FAIL;

  if (!Array.isArray(monthlySchedule) || monthlySchedule.length < 1) return FAIL;
  if (monthlySchedule.length > MAX_MONTHLY_ROWS) return FAIL;
  if (!periodsOrderedFrom(monthlySchedule, 1)) return FAIL;
  if (!rowsFiniteNonNegative(monthlySchedule)) return FAIL;

  // Every row must reconcile. In the accrual modes nothing is repaid, so the
  // balance simply grows; in the amortized mode the difference IS the repayment,
  // which must never be negative.
  let sumInterest = 0;
  for (const r of monthlySchedule) {
    const repaid = r.beginning + r.interest - r.ending;
    if (!Number.isFinite(repaid)) return FAIL;
    if (result.mode === 'amortized') {
      if (repaid < -ROW_SUM_TOL) return FAIL;
    } else if (Math.abs(repaid) > ROW_SUM_TOL) {
      return FAIL; // an accruing loan repays nothing before maturity
    }
    sumInterest += r.interest;
  }
  if (Math.abs(sumInterest - totalInterest) > reconTol(totalInterest)) return FAIL;

  if (!Array.isArray(yearlySchedule) || yearlySchedule.length < 1) return FAIL;
  if (!periodsOrderedFrom(yearlySchedule, 1)) return FAIL;
  if (!rowsFiniteNonNegative(yearlySchedule)) return FAIL;

  const ySumInterest = yearlySchedule.reduce((sum, y) => sum + y.interest, 0);
  if (Math.abs(ySumInterest - sumInterest) > reconTol(sumInterest)) return FAIL;

  // The two views must close on the same balance and open on the same one.
  const lastMonthly = monthlySchedule[monthlySchedule.length - 1];
  const lastYearly = yearlySchedule[yearlySchedule.length - 1];
  if (Math.abs(lastYearly.ending - lastMonthly.ending) > reconTol(lastMonthly.ending)) return FAIL;
  if (Math.abs(yearlySchedule[0].beginning - monthlySchedule[0].beginning) > ROW_SUM_TOL) return FAIL;

  return primary;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);

/** The CHECKED member of a radio group — `[name=x]` alone would return the first. */
const checkedControl = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]:checked`);

/** The structural defaults Reset returns the calculator to. */
export const LOAN_DEFAULTS = {
  mode: 'amortized',
  compoundKey: 'monthly',
  paybackKey: 'month',
} as const;

export const loanBinding: FormCalculatorBinding<LoanFormValues, LoanComputed> = {
  readValues(root) {
    return {
      mode: checkedControl(root, 'mode')?.value ?? LOAN_DEFAULTS.mode,
      amount: control(root, 'amount')?.value ?? '',
      annualInterestRate: control(root, 'annualInterestRate')?.value ?? '',
      termYears: control(root, 'termYears')?.value ?? '',
      termMonths: control(root, 'termMonths')?.value ?? '',
      compoundKey: control(root, 'compoundKey')?.value ?? LOAN_DEFAULTS.compoundKey,
      paybackKey: control(root, 'paybackKey')?.value ?? LOAN_DEFAULTS.paybackKey,
    };
  },

  validate: validateLoanValues,

  compute: computeLoan,

  /** The dominant figure when the ENTIRE result reconciles, else a NaN sentinel
   *  the runtime's default finite gate rejects — no isUsableResult. */
  resultValue: completeLoanValue,

  describeResult: describeLoanResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };

    // The dominant figure and the question it answers both depend on the mode.
    setText('[data-result-when~="valid"] [data-result-summary-label]', primaryLabel(result));
    setText('[data-result-when~="valid"] [data-result-value]', formatCurrency(result.primary));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(result.primary));

    // Supporting metrics. The payoff row states the term for every mode; the
    // total row reports payments (amortized) or the maturity value (accrual).
    setText('[data-loan-total-label]', totalLabel(result));
    setText('[data-loan-total]', formatCurrency(result.totalPaid));
    setText('[data-loan-interest]', formatCurrency(result.totalInterest));
    setText('[data-loan-payoff]', payoffLabel(loanTermMonths(result)));

    // Both schedules are rendered in full; the island's view switch is
    // presentation-only, so switching never recomputes.
    setText('[data-loan-period-head]', periodHeading(result));
    fillBody(q('[data-loan-rows="yearly"]'), result.yearlySchedule);
    fillBody(q('[data-loan-rows="detail"]'), result.monthlySchedule, result.periodsPerYear);
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['amount', 'annualInterestRate', 'termYears', 'termMonths']) {
      const el = control(root, name);
      if (el) el.value = '';
    }
    // Reset is deterministic: the calculator returns to its INITIAL state, so the
    // structural selectors go back to their defaults alongside the values.
    for (const radio of root.querySelectorAll<HTMLInputElement>('[name="mode"]')) {
      radio.checked = radio.value === LOAN_DEFAULTS.mode;
    }
    const compound = control(root, 'compoundKey');
    if (compound) compound.value = LOAN_DEFAULTS.compoundKey;
    const payback = control(root, 'paybackKey');
    if (payback) payback.value = LOAN_DEFAULTS.paybackKey;
  },
};

/** Term in whole months, derived from the schedule so it always matches the table. */
export function loanTermMonths(result: LoanComputed): number {
  const per = result.periodsPerYear > 0 ? result.periodsPerYear : 12;
  return Math.round((result.monthlySchedule.length / per) * 12);
}

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
export const LOAN_EXAMPLE_VALUES: LoanFormValues = {
  mode: 'amortized',
  amount: '25000',
  annualInterestRate: '7.5',
  termYears: '5',
  termMonths: '',
  compoundKey: 'monthly',
  paybackKey: 'month',
};

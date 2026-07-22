/**
 * Credit-card payoff form binding (R8C1 — standard-form wave, calculator #15; product
 * family MULTI-MODE, on the standard-form runtime + the accepted `isUsableResult` gate).
 *
 * Two modes — By payment (balance + APR + monthly payment → payoff time) and By timeline
 * (balance + APR + target months → required monthly payment) — swap ONE conditional field
 * by mode (the Payment precedent), sharing balance + APR. Each result carries a subordinate
 * cost breakdown (total interest + total paid), which is the calculator's whole point.
 *
 * The pure `payoffByPayment` / `payoffByMonths` (which delegate to the shared
 * `solveMonths` / `pmt`) are UNCHANGED and frozen by credit-card.test.ts. Everything here
 * is at the VALIDATION / PRESENTATION boundary. Product decisions (R8C1):
 *   • Zero balance is INVALID (a $0 card is not a payoff task).
 *   • A positive payment that never covers the interest → the informational "Never" result
 *     (valid shell via `isUsableResult`); its financial rows are omitted, never shown as
 *     zero/Infinity/NaN/dashes.
 *   • By-payment totals are ESTIMATES (the formula assumes a full final payment); By-timeline
 *     totals amortize exactly. Timeline input must be a WHOLE month ≥ 1 — never silently
 *     rounded. Inputs are parsed strictly (never `Number(value) || 0`).
 */
import { payoffByPayment, payoffByMonths } from './credit-card';
import { formatCurrency, presentDuration } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type CreditCardMode = 'payment' | 'months';

export interface CreditCardValues {
  mode: CreditCardMode;
  balance: string;
  aprPct: string;
  payment: string;
  months: string;
}

/**
 * Structured result. Three shapes: a By-payment payoff, a By-timeline required payment,
 * and the informational "never pays off" outcome (a positive payment below the interest).
 */
export type CreditCardComputed =
  | {
      status: 'payoff';
      mode: 'payment';
      payoffMonths: number;
      paymentCount: number;
      totalInterest: number;
      totalPaid: number;
    }
  | {
      status: 'required-payment';
      mode: 'months';
      monthlyPayment: number;
      paymentCount: number;
      totalInterest: number;
      totalPaid: number;
    }
  | { status: 'never'; mode: 'payment'; reason: 'payment-does-not-cover-interest' };

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Finite and strictly greater than zero: balance, monthly payment. */
function parsePositive(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

/** Finite and >= 0: an APR. 0% is valid; there is no maximum. */
function parseNonNegative(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Finite WHOLE number of months, at least 1. A fractional entry is rejected, not
 *  silently rounded (the visitor chose the timeline). */
function parseWholeAtLeastOne(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 'invalid';
  return n;
}

/**
 * Validate credit-card values. Balance (> 0) and APR (>= 0) are always required. Only the
 * ACTIVE mode's field is required + validated — the inactive field (hidden + disabled by
 * the island) is excluded. A positive-but-insufficient payment is NOT a field error; it
 * produces the informational "Never" result.
 */
export function validateCreditCardValues(values: CreditCardValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const balance = parsePositive(values.balance);
  if (balance === 'empty') fieldErrors.balance = 'Enter your card balance.';
  else if (balance === 'invalid') fieldErrors.balance = 'Enter a balance greater than zero.';

  const apr = parseNonNegative(values.aprPct);
  if (apr === 'empty') fieldErrors.aprPct = 'Enter the APR.';
  else if (apr === 'invalid') fieldErrors.aprPct = 'Enter an APR of zero or more.';

  if (values.mode === 'payment') {
    const payment = parsePositive(values.payment);
    if (payment === 'empty') fieldErrors.payment = 'Enter a monthly payment.';
    else if (payment === 'invalid') fieldErrors.payment = 'Enter a monthly payment greater than zero.';
  } else {
    const months = parseWholeAtLeastOne(values.months);
    if (months === 'empty') fieldErrors.months = 'Enter a target payoff time.';
    else if (months === 'invalid') fieldErrors.months = 'Enter a whole number of months (1 or more).';
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export function computeCreditCard(values: CreditCardValues): CreditCardComputed {
  const balance = Number(values.balance);
  const apr = Number(values.aprPct);

  if (values.mode === 'payment') {
    const r = payoffByPayment(balance, apr, Number(values.payment));
    if (!Number.isFinite(r.months)) {
      return { status: 'never', mode: 'payment', reason: 'payment-does-not-cover-interest' };
    }
    return {
      status: 'payoff',
      mode: 'payment',
      payoffMonths: r.months,
      paymentCount: r.months,
      totalInterest: r.totalInterest,
      totalPaid: r.totalPaid,
    };
  }

  const n = Number(values.months); // validated whole >= 1
  const r = payoffByMonths(balance, apr, n);
  return {
    status: 'required-payment',
    mode: 'months',
    monthlyPayment: r.monthlyPayment,
    paymentCount: n,
    totalInterest: r.totalInterest,
    totalPaid: r.totalPaid,
  };
}

/**
 * The usability gate. An ordinary payoff / required-payment is usable when every figure
 * is finite and non-negative; the "never" outcome is ALWAYS usable (a valid informational
 * result). A malformed (non-finite) figure falls through to the invalid state.
 */
export function isUsableCreditCard(result: CreditCardComputed): boolean {
  if (result.status === 'never') return true;
  const figures =
    result.status === 'payoff'
      ? [result.payoffMonths, result.totalInterest, result.totalPaid]
      : [result.monthlyPayment, result.totalInterest, result.totalPaid];
  return figures.every((v) => Number.isFinite(v) && v >= 0);
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** A USD amount in spoken form, e.g. "245 dollars and 63 cents", "250 dollars". */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

const NEVER_EXPLANATION =
  'This payment does not cover the monthly interest, so the balance will not decrease. Increase the monthly payment to pay off the card.';
const ESTIMATE_ASSUMPTION =
  'Totals use whole monthly payments and may slightly overstate the final payment when the balance is cleared partway through the last month.';

/** Concise announcement — the dominant mode-owned result only. */
export function describeCreditCardResult(result: CreditCardComputed): string {
  if (result.status === 'payoff') {
    return `Your estimated payoff time is ${presentDuration(result.payoffMonths).spoken}.`;
  }
  if (result.status === 'required-payment') {
    return `Your required monthly payment is ${spokenUSD(result.monthlyPayment)}.`;
  }
  return 'At this payment amount, the credit card balance will never be paid off because the payment does not cover the monthly interest.';
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const readMode = (root: HTMLElement): CreditCardMode =>
  root.querySelector<HTMLInputElement>('[name="mode"]:checked')?.value === 'months' ? 'months' : 'payment';

export const creditCardBinding: FormCalculatorBinding<CreditCardValues, CreditCardComputed> = {
  readValues(root) {
    return {
      mode: readMode(root),
      balance: input(root, 'balance')?.value ?? '',
      aprPct: input(root, 'aprPct')?.value ?? '',
      payment: input(root, 'payment')?.value ?? '',
      months: input(root, 'months')?.value ?? '',
    };
  },

  validate: validateCreditCardValues,

  compute: computeCreditCard,

  /** Default-gate magnitude — consulted only if `isUsableResult` were absent: the payoff
   *  months or the required payment; NaN for 'never'. */
  resultValue(result) {
    if (result.status === 'payoff') return result.payoffMonths;
    if (result.status === 'required-payment') return result.monthlyPayment;
    return NaN;
  },

  isUsableResult: isUsableCreditCard,

  describeResult: describeCreditCardResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const setLabel = (text: string) => {
      const el = q('[data-result-when~="valid"] [data-result-summary-label]');
      if (el) el.textContent = text;
    };
    const setValue = (shown: string, spoken: string) => {
      const v = q('[data-result-when~="valid"] [data-result-value]');
      if (v) v.textContent = shown;
      const a = q('[data-result-when~="valid"] [data-result-value-a11y]');
      if (a) a.textContent = spoken;
    };
    const show = (sel: string, visible: boolean) => {
      const el = q(sel);
      if (el) el.hidden = !visible;
    };
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };

    if (result.status === 'never') {
      // VALID informational outcome (Ratified decision #8). No financial rows, no
      // dashes/zero/Infinity/NaN, no formula language.
      setLabel('Estimated payoff time');
      setValue('Never', 'Never');
      show('[data-cc-breakdown]', false);
      show('[data-cc-explanation]', true);
      setText('[data-cc-explanation]', NEVER_EXPLANATION);
      return;
    }

    show('[data-cc-explanation]', false);
    show('[data-cc-breakdown]', true);

    if (result.status === 'payoff') {
      setLabel('Estimated payoff time');
      const { display, spoken } = presentDuration(result.payoffMonths);
      setValue(display, spoken);
      // By-payment totals are estimates (full-final-payment assumption).
      setText('[data-cc-interest-label]', 'Estimated total interest');
      setText('[data-cc-total-label]', 'Estimated total paid');
      setText('[data-cc-interest]', formatCurrency(result.totalInterest));
      setText('[data-cc-total]', formatCurrency(result.totalPaid));
      setText('[data-cc-assumption]', ESTIMATE_ASSUMPTION);
      show('[data-cc-assumption]', true);
    } else {
      // required-payment — the payment amortizes exactly, so no full-final-payment caveat.
      setLabel('Required monthly payment');
      setValue(formatCurrency(result.monthlyPayment), spokenUSD(result.monthlyPayment));
      setText('[data-cc-interest-label]', 'Total interest');
      setText('[data-cc-total-label]', 'Total paid');
      setText('[data-cc-interest]', formatCurrency(result.totalInterest));
      setText('[data-cc-total]', formatCurrency(result.totalPaid));
      show('[data-cc-assumption]', false);
    }
  },

  resetValues(root, _mode: ResetMode) {
    // The island restores By-payment mode + its field/labels; the binding clears every value.
    for (const name of ['balance', 'aprPct', 'payment', 'months']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};

/**
 * Payment form binding (R8B1 — standard-form wave, calculator #14; product family
 * MULTI-MODE, on the standard-form runtime + the small `isUsableResult` extension).
 *
 * Payment has two modes — Fixed term (solve for the monthly payment) and Fixed
 * payment (solve for the payoff time). They are a STRUCTURAL selector: the shared
 * loan amount + interest rate stay put while ONE conditional field swaps (term ⇆
 * monthly payment) and the equation, labels and dominant result change. The runtime
 * already recomputes on the mode radio's structural `input`; the island owns the
 * conditional field's visibility + the action label; this binding owns reading the
 * mode, selecting the reviewed formula, validating only the ACTIVE mode's field, and
 * rendering a mode-specific result.
 *
 * The pure `loanPayment` / `solveMonths` are UNCHANGED and frozen by the
 * characterization suite (payment.test.ts). Everything here is at the VALIDATION /
 * PRESENTATION boundary. Two product decisions shape it:
 *   • Impossible payoff (a positive payment that never covers the interest →
 *     Infinity) is a VALID informational result — "Never" — not an input error.
 *     `isUsableResult` widens the runtime's success gate to accept it.
 *   • No result enrichment: summary-level only (payment or payoff time + the number
 *     of payments). No total paid, total interest or amortization schedule.
 * Inputs are parsed strictly — never `Number(value) || 0`.
 */
import { loanPayment, solveMonths } from './payment';
import { formatCurrency } from '@lib/format';
import { presentDuration } from '@lib/format-duration';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type PaymentMode = 'term' | 'payment';

export interface PaymentValues {
  mode: PaymentMode;
  principal: string;
  annualRatePct: string;
  termYears: string;
  payment: string;
}

/**
 * The computed result. Three shapes: a fixed-term monthly payment, a fixed-payment
 * payoff, and the informational "never pays off" outcome (a positive payment that
 * does not cover the monthly interest).
 */
export type PaymentComputed =
  | { status: 'payment'; mode: 'term'; monthlyPayment: number; paymentCount: number }
  | { status: 'payoff'; mode: 'payment'; months: number; paymentCount: number }
  | { status: 'never'; mode: 'payment'; reason: 'payment-does-not-cover-interest' };

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Finite and strictly greater than zero: loan amount, term, monthly payment. */
function parsePositive(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

/** Finite and >= 0: an interest rate. 0% is valid; there is no maximum. */
function parseNonNegative(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/**
 * Validate payment values. The loan amount (> 0) and interest rate (>= 0) are always
 * required. Only the ACTIVE mode's field is required + validated — the inactive
 * field (hidden + disabled by the island) is excluded, so a blank monthly payment is
 * never an error while solving for the payment, and vice-versa.
 */
export function validatePaymentValues(values: PaymentValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const principal = parsePositive(values.principal);
  if (principal === 'empty') fieldErrors.principal = 'Enter a loan amount.';
  else if (principal === 'invalid') fieldErrors.principal = 'Enter a loan amount greater than zero.';

  const rate = parseNonNegative(values.annualRatePct);
  if (rate === 'empty') fieldErrors.annualRatePct = 'Enter an interest rate.';
  else if (rate === 'invalid') fieldErrors.annualRatePct = 'Enter an interest rate of zero or more.';

  if (values.mode === 'term') {
    const term = parsePositive(values.termYears);
    if (term === 'empty') fieldErrors.termYears = 'Enter a loan term.';
    else if (term === 'invalid') fieldErrors.termYears = 'Enter a loan term greater than zero.';
  } else {
    const payment = parsePositive(values.payment);
    if (payment === 'empty') fieldErrors.payment = 'Enter a monthly payment.';
    else if (payment === 'invalid') fieldErrors.payment = 'Enter a monthly payment greater than zero.';
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export function computePayment(values: PaymentValues): PaymentComputed {
  const principal = Number(values.principal);
  const rate = Number(values.annualRatePct);

  if (values.mode === 'term') {
    const months = Number(values.termYears) * 12;
    const monthlyPayment = loanPayment(principal, rate, months);
    // In term mode the number of payments IS the term in months (an input, not a
    // derived floor/ceil); round guards the rare fractional-year entry.
    return { status: 'payment', mode: 'term', monthlyPayment, paymentCount: Math.round(months) };
  }

  const payment = Number(values.payment);
  const months = solveMonths(principal, rate, payment);
  if (!Number.isFinite(months)) {
    return { status: 'never', mode: 'payment', reason: 'payment-does-not-cover-interest' };
  }
  return { status: 'payoff', mode: 'payment', months, paymentCount: Math.ceil(months) };
}

/**
 * The usability gate (R8B1 extension). An ordinary payment or payoff is usable when
 * its magnitude is finite; the "never" outcome is ALWAYS usable — it is a meaningful
 * informational answer rendered in the valid region, not an input error. A malformed
 * number (defensive) falls through to the invalid state.
 */
export function isUsablePayment(result: PaymentComputed): boolean {
  if (result.status === 'never') return true;
  if (result.status === 'payment') return Number.isFinite(result.monthlyPayment) && result.monthlyPayment >= 0;
  return Number.isFinite(result.months) && result.months >= 0;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** The secondary "N monthly payments" line (singular at 1). */
export function paymentsLabel(count: number): string {
  return `${count} monthly payment${count === 1 ? '' : 's'}`;
}

/** A USD amount in spoken form, e.g. "386 dollars and 66 cents", "1000 dollars". */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

/** Concise announcement — the dominant mode-owned result only. */
export function describePaymentResult(result: PaymentComputed): string {
  if (result.status === 'payment') {
    return `Your estimated monthly payment is ${spokenUSD(result.monthlyPayment)}.`;
  }
  if (result.status === 'payoff') {
    return `Your estimated payoff time is ${presentDuration(result.months).spoken}.`;
  }
  return 'At this payment amount, the loan will never be paid off because the payment does not cover the monthly interest.';
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const readMode = (root: HTMLElement): PaymentMode =>
  root.querySelector<HTMLInputElement>('[name="mode"]:checked')?.value === 'payment' ? 'payment' : 'term';

export const paymentBinding: FormCalculatorBinding<PaymentValues, PaymentComputed> = {
  readValues(root) {
    return {
      mode: readMode(root),
      principal: input(root, 'principal')?.value ?? '',
      annualRatePct: input(root, 'annualRatePct')?.value ?? '',
      termYears: input(root, 'termYears')?.value ?? '',
      payment: input(root, 'payment')?.value ?? '',
    };
  },

  validate: validatePaymentValues,

  compute: computePayment,

  /** Default-gate magnitude — consulted only if `isUsableResult` were absent: the
   *  payment or the months; NaN for 'never' (which `isUsableResult` marks usable so
   *  it renders as a valid informational result rather than an error). */
  resultValue(result) {
    if (result.status === 'payment') return result.monthlyPayment;
    if (result.status === 'payoff') return result.months;
    return NaN;
  },

  isUsableResult: isUsablePayment,

  describeResult: describePaymentResult,

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
    const setDetail = (text: string) => {
      const el = q('[data-pm-detail]');
      if (el) el.textContent = text;
    };

    if (result.status === 'payment') {
      setLabel('Estimated monthly payment');
      setValue(formatCurrency(result.monthlyPayment), spokenUSD(result.monthlyPayment));
      setDetail(paymentsLabel(result.paymentCount));
    } else if (result.status === 'payoff') {
      setLabel('Estimated payoff time');
      const { display, spoken } = presentDuration(result.months);
      setValue(display, spoken);
      setDetail(paymentsLabel(result.paymentCount));
    } else {
      // 'never' — a VALID informational outcome (Decision A). No invalid styling, no
      // aria-invalid, no zero/Infinity/NaN, no logarithm/denominator language.
      setLabel('Estimated payoff time');
      setValue('Never', 'Never');
      setDetail(
        'This payment does not cover the monthly interest, so the balance will not decrease. Increase the monthly payment to pay off the loan.',
      );
    }
  },

  resetValues(root, _mode: ResetMode) {
    // The island restores Fixed-term mode + its labels/visibility; the binding clears
    // every entered value, including the in-session-preserved inactive field.
    for (const name of ['principal', 'annualRatePct', 'termYears', 'payment']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};

/**
 * Payment form binding — two modes, one loan.
 *
 * FIXED TERM takes a term and solves for the monthly payment. FIXED PAYMENTS takes
 * the payment and solves for how long it takes. The loan amount and interest rate
 * are shared; only one field swaps between them, and the dominant result changes
 * with it.
 *
 * Both modes then produce the SAME enrichment — the total of all payments, the
 * total interest, a principal-against-interest ring and the full amortization
 * schedule — because once the payment and the term are both known the loan is
 * completely determined, whichever of the two was the answer. That enrichment comes
 * from `calculateAmortization`, so the schedule under a payment calculation is the
 * same schedule the amortization calculator would produce for the same loan.
 *
 * `loanPayment` and `solveMonths` are UNCHANGED and frozen by payment.test.ts; they
 * still decide the headline. Everything else here is at the validation and
 * presentation boundary.
 *
 * THE "NEVER" OUTCOME. A positive payment that does not cover the monthly interest
 * pays a loan off never. That is a true, useful answer rather than a typo, so it
 * renders as a valid informational result: `isUsableResult` widens the runtime's
 * success gate to accept it, and it carries no schedule, no totals and no ring,
 * because there is no finite loan to describe.
 */
import { loanPayment, solveMonths } from './payment';
import { calculateAmortization, MAX_TERM_MONTHS, type AmortizationResult } from './amortization';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
import { presentDuration } from '@lib/format-duration';
import {
  drawDonut,
  fillLoanSchedule,
  percentLabel,
  share,
  type LoanScheduleRow,
} from '@lib/result/loan-schedule';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type PaymentMode = 'term' | 'payment';

/** The term ceiling, shared with the amortization schedule it produces. */
export const MAX_TERM_YEARS = MAX_TERM_MONTHS / 12;

export interface PaymentValues {
  mode: PaymentMode;
  principal: string;
  annualRatePct: string;
  termYears: string;
  payment: string;
}

/**
 * The computed result. Three shapes: a fixed-term monthly payment, a fixed-payment
 * payoff, and the informational "never pays off" outcome.
 *
 * The two solvable shapes carry the same `plan`, so everything below the headline is
 * rendered identically for both.
 */
export type PaymentComputed =
  | {
      status: 'payment';
      mode: 'term';
      monthlyPayment: number;
      paymentCount: number;
      plan: AmortizationResult;
    }
  | {
      status: 'payoff';
      mode: 'payment';
      /** The exact, unrounded solve — what the headline duration is phrased from. */
      months: number;
      /** Whole payments actually made; the last one is usually short. */
      paymentCount: number;
      monthlyPayment: number;
      plan: AmortizationResult;
    }
  | { status: 'never'; mode: 'payment'; reason: 'payment-does-not-cover-interest' };

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Finite and strictly greater than zero. */
function parsePositive(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

/** Finite and at least zero. */
function parseNonNegative(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** A whole number of years, 1 … MAX_TERM_YEARS. Fractions are rejected, not rounded. */
function parseTermYears(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_TERM_YEARS) return 'invalid';
  return n;
}

export const TERM_MESSAGE = `Enter a whole number of years from 1 to ${MAX_TERM_YEARS}.`;

export function validatePaymentValues(values: PaymentValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const principal = parsePositive(values.principal);
  if (principal === 'empty') fieldErrors.principal = 'Enter a loan amount.';
  else if (principal === 'invalid') fieldErrors.principal = 'Enter a loan amount greater than zero.';

  const rate = parseNonNegative(values.annualRatePct);
  if (rate === 'empty') fieldErrors.annualRatePct = 'Enter an interest rate.';
  else if (rate === 'invalid') fieldErrors.annualRatePct = 'Enter an interest rate of zero or more.';

  // Only the ACTIVE mode's field is required; the other is hidden and disabled.
  if (values.mode === 'term') {
    const term = parseTermYears(values.termYears);
    if (term === 'empty') fieldErrors.termYears = 'Enter a loan term.';
    else if (term === 'invalid') fieldErrors.termYears = TERM_MESSAGE;
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
    const months = Math.round(Number(values.termYears) * 12);
    const monthlyPayment = loanPayment(principal, rate, months);
    return {
      status: 'payment',
      mode: 'term',
      monthlyPayment,
      // In term mode the number of payments IS the term in months — an input, not a
      // derived figure.
      paymentCount: months,
      plan: calculateAmortization({ amount: principal, annualRatePct: rate, months }),
    };
  }

  const payment = Number(values.payment);
  const months = solveMonths(principal, rate, payment);
  if (!Number.isFinite(months)) {
    return { status: 'never', mode: 'payment', reason: 'payment-does-not-cover-interest' };
  }

  // The solve is fractional; the loan is repaid over whole months, the last of which
  // is short. Rounding UP is what makes the schedule end on a zero balance rather
  // than one payment shy of it.
  const wholeMonths = Math.min(Math.max(1, Math.ceil(months - 1e-9)), MAX_TERM_MONTHS);
  const plan = calculateAmortization({
    amount: principal,
    annualRatePct: rate,
    months: wholeMonths,
    payment,
  });

  return {
    status: 'payoff',
    mode: 'payment',
    months,
    paymentCount: plan.payoffMonths,
    monthlyPayment: payment,
    plan,
  };
}

/* ------------------------------------------------------------------ */
/* The complete-result guard                                           */
/* ------------------------------------------------------------------ */

const reconTol = (magnitude: number) => Math.max(1, Math.abs(magnitude) * 1e-6);
const ROW_SUM_TOL = 1e-6;
const ZERO_BAL_TOL = 1e-2;

/**
 * True only when the plan under a headline is wholly self-consistent — the totals
 * against each other, every row's payment against its own parts, the summed
 * principal against the loan, the yearly rows against the months they collapse, and
 * a final balance of zero.
 */
function planReconciles(p: AmortizationResult): boolean {
  if (![p.loanAmount, p.totalInterest, p.totalOfPayments, p.monthlyPayment].every(
    (v) => Number.isFinite(v) && v >= 0,
  )) {
    return false;
  }
  if (p.schedule.length < 1 || p.schedule.length !== p.payoffMonths) return false;
  if (p.payoffMonths > MAX_TERM_MONTHS) return false;
  if (Math.abs(p.loanAmount + p.totalInterest - p.totalOfPayments) > reconTol(p.totalOfPayments)) {
    return false;
  }

  let sumPrincipal = 0;
  let sumInterest = 0;
  for (let i = 0; i < p.schedule.length; i++) {
    const r = p.schedule[i];
    if (r.period !== i + 1) return false;
    if (![r.payment, r.principal, r.interest, r.balance].every((v) => Number.isFinite(v) && v >= 0)) {
      return false;
    }
    if (Math.abs(r.payment - (r.principal + r.interest)) > ROW_SUM_TOL) return false;
    sumPrincipal += r.principal;
    sumInterest += r.interest;
  }
  if (Math.abs(sumPrincipal - p.loanAmount) > reconTol(p.loanAmount)) return false;
  if (Math.abs(sumInterest - p.totalInterest) > reconTol(p.totalInterest)) return false;
  if (Math.abs(p.schedule[p.schedule.length - 1].balance) > ZERO_BAL_TOL) return false;

  if (p.annual.length !== Math.ceil(p.payoffMonths / 12)) return false;
  let months = 0;
  let ySumInterest = 0;
  for (let i = 0; i < p.annual.length; i++) {
    const y = p.annual[i];
    if (y.period !== i + 1 || y.monthCount < 1 || y.monthCount > 12) return false;
    months += y.monthCount;
    const closing = p.schedule[months - 1];
    if (!closing || Math.abs(closing.balance - y.balance) > reconTol(y.balance)) return false;
    ySumInterest += y.interest;
  }
  if (months !== p.payoffMonths) return false;
  if (Math.abs(ySumInterest - sumInterest) > reconTol(sumInterest)) return false;
  return true;
}

const FAIL = Number.NaN;

/**
 * The dominant magnitude — but only once the whole result reconciles.
 *
 * "Never" is deliberately NaN here: it is not a magnitude at all. `isUsableResult`
 * is what lets it through as a valid informational result.
 */
export function paymentResultValue(result: PaymentComputed): number {
  if (result.status === 'never') return FAIL;
  if (!planReconciles(result.plan)) return FAIL;

  if (result.status === 'payment') {
    if (!Number.isFinite(result.monthlyPayment) || result.monthlyPayment < 0) return FAIL;
    if (result.paymentCount !== result.plan.payoffMonths) return FAIL;
    // The headline payment must be the payment the schedule was actually built on.
    if (Math.abs(result.monthlyPayment - result.plan.monthlyPayment) > ROW_SUM_TOL) return FAIL;
    return result.monthlyPayment;
  }

  if (!Number.isFinite(result.months) || result.months <= 0) return FAIL;
  if (result.paymentCount !== result.plan.payoffMonths) return FAIL;
  // The solve and the schedule must agree to within the rounding up of a part month.
  if (result.paymentCount < Math.floor(result.months)) return FAIL;
  if (result.paymentCount > Math.ceil(result.months)) return FAIL;
  return result.months;
}

/** "Never" is a real answer, so the runtime's finite gate is widened to accept it. */
export function isUsablePayment(result: PaymentComputed): boolean {
  return result.status === 'never' || Number.isFinite(paymentResultValue(result));
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** A USD amount in spoken form, e.g. "1687 dollars and 71 cents". */
export function spokenUSD(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

export function describePaymentResult(result: PaymentComputed): string {
  if (result.status === 'payment') {
    return `Your estimated monthly payment is ${spokenUSD(result.monthlyPayment)}.`;
  }
  if (result.status === 'payoff') {
    return `Your estimated payoff time is ${presentDuration(result.months).spoken}.`;
  }
  return 'At this payment amount, the loan will never be paid off because the payment does not cover the monthly interest.';
}

/**
 * The sentence under the headline, in the reference's words: what you pay, how
 * often, and for how long.
 */
export function payoffSentence(result: PaymentComputed): string {
  if (result.status === 'never') return '';
  const payment =
    result.status === 'payment' ? result.monthlyPayment : result.monthlyPayment;
  const duration =
    result.status === 'payment'
      ? presentDuration(result.paymentCount).display
      : presentDuration(result.months).display;
  return `You will need to pay ${formatCurrency(payment)} every month for ${duration} to pay off the debt.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);

const readMode = (root: HTMLElement): PaymentMode =>
  root.querySelector<HTMLInputElement>('[name="mode"]:checked')?.value === 'payment'
    ? 'payment'
    : 'term';

const SCHEDULE = { prefix: 'pay', format: formatCurrency };

const toRows = (
  rows: readonly { period: number; interest: number; principal: number; extra: number; balance: number }[],
): LoanScheduleRow[] =>
  rows.map((r) => ({
    period: r.period,
    interest: r.interest,
    principal: r.principal,
    extra: r.extra,
    balance: r.balance,
  }));

function donutLabel(plan: AmortizationResult): string {
  const p = share(plan.loanAmount, plan.totalOfPayments);
  const i = share(plan.totalInterest, plan.totalOfPayments);
  return (
    `Of ${formatCurrency(plan.totalOfPayments)} paid in total, ` +
    `${formatCurrency(plan.loanAmount)} (${percentLabel(p)}) is principal and ` +
    `${formatCurrency(plan.totalInterest)} (${percentLabel(i)}) is interest.`
  );
}

export const paymentBinding: FormCalculatorBinding<PaymentValues, PaymentComputed> = {
  readValues(root) {
    return {
      mode: readMode(root),
      principal: field(root, 'principal')?.value ?? '',
      annualRatePct: field(root, 'annualRatePct')?.value ?? '',
      termYears: field(root, 'termYears')?.value ?? '',
      payment: field(root, 'payment')?.value ?? '',
    };
  },

  validate: validatePaymentValues,

  compute: computePayment,

  resultValue: paymentResultValue,

  isUsableResult: isUsablePayment,

  describeResult: describePaymentResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };
    const show = (sel: string, visible: boolean) => {
      const el = q(sel);
      if (el) el.hidden = !visible;
    };
    const setValue = (label: string, shown: string, spoken: string) => {
      setText('[data-result-when~="valid"] [data-result-summary-label]', label);
      setText('[data-result-when~="valid"] [data-result-value]', shown);
      setText('[data-result-when~="valid"] [data-result-value-a11y]', spoken);
    };

    if (result.status === 'never') {
      setValue('Payoff time', 'Never', 'never');
      setText(
        '[data-pay-note]',
        'This payment does not cover the monthly interest, so the balance never falls. Increase the payment above the interest charged each month.',
      );
      show('[data-pay-note]', true);
      // Nothing below the headline describes a loan that is never repaid.
      show('[data-pay-details]', false);
      return;
    }

    show('[data-pay-details]', true);
    const plan = result.plan;

    if (result.status === 'payment') {
      setValue(
        'Monthly payment',
        formatCurrency(result.monthlyPayment),
        spokenUSD(result.monthlyPayment),
      );
    } else {
      const duration = presentDuration(result.months);
      setValue('Payoff time', duration.display, duration.spoken);
    }

    setText('[data-pay-note]', payoffSentence(result));
    show('[data-pay-note]', true);

    setText('[data-pay-count-label]', `Total of ${result.paymentCount} payments`);
    setText('[data-pay-total]', formatCurrency(plan.totalOfPayments));
    setText('[data-pay-interest]', formatCurrency(plan.totalInterest));

    const charted = drawDonut(
      q('[data-pay-donut]'),
      [
        { key: 'principal', value: plan.loanAmount },
        { key: 'interest', value: plan.totalInterest },
      ],
      { prefix: 'pay', label: donutLabel(plan) },
    );
    show('[data-pay-donut-figure]', charted);
    if (charted) {
      const p = share(plan.loanAmount, plan.totalOfPayments);
      const i = share(plan.totalInterest, plan.totalOfPayments);
      setText('[data-pay-share-principal]', percentLabel(p));
      setText('[data-pay-share-interest]', percentLabel(i));
      setText('[data-pay-share-principal-amt]', formatCurrencyRounded(plan.loanAmount));
      setText('[data-pay-share-interest-amt]', formatCurrencyRounded(plan.totalInterest));
    }

    fillLoanSchedule(scope.querySelector<HTMLElement>('[data-pay-rows="yearly"]'), toRows(plan.annual), SCHEDULE);
    fillLoanSchedule(scope.querySelector<HTMLElement>('[data-pay-rows="monthly"]'), toRows(plan.schedule), SCHEDULE, true);
  },

  resetValues(root, _mode: ResetMode) {
    // The island restores Fixed-term mode and its field/labels; the binding clears
    // every value.
    for (const name of ['principal', 'annualRatePct', 'termYears', 'payment']) {
      const el = field(root, name);
      if (el) el.value = '';
    }
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * The labelled example shown on first load — the published worked case the engine
 * tests pin to the cent, so the example a visitor sees is provably the same
 * arithmetic the calculator will do with their own numbers.
 */
export const PAYMENT_EXAMPLE_VALUES: PaymentValues = {
  mode: 'term',
  principal: '200000',
  annualRatePct: '6',
  termYears: '15',
  payment: '',
};

/**
 * Auto Loan form binding (R11C1 Commit 2 — task-first migration, finance complex-form family).
 *
 * Wraps the UNCHANGED calculateAutoLoan (payment via @lib/finance pmt), frozen by auto-loan.test.ts.
 * Everything here is at the VALIDATION / PRESENTATION boundary; the pure formula is untouched.
 *
 * Product decisions (R11C1):
 *   • Task-first: personal fields start EMPTY, the result is an instruction, and the visitor presses
 *     "Calculate Auto Loan Payment" for the first result (live-after-first thereafter). Structural
 *     defaults: term 60 months, "Finance taxes and fees" checked.
 *   • Tax basis is PRESERVED: sales tax = the entered rate × the FULL vehicle price, with no trade-in
 *     or down-payment credit (a jurisdiction note is shown, not a new mode).
 *   • Negative trade-in equity (owed > value) is a SUPPORTED financial scenario — it increases the
 *     financed balance and is shown as a signed "negative equity", never a positive credit. It is NOT
 *     a cross-field validation error.
 *   • A zero financed balance (cash + trade credits cover the base) is a VALID informational result:
 *     financed / payment / interest / total-of-payments all $0.00.
 *   • The complete-result guard lives in the ordinary result-value function (a NaN sentinel → the
 *     runtime's default finite gate). There is NO isUsableResult (the Inflation / Triangle pattern).
 */
import { calculateAutoLoan, type AutoLoanResult, type AutoLoanRow } from './auto-loan';
import { formatCurrency } from '@lib/format';
import { drawLoanLineChart } from '@lib/result/loan-schedule';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/**
 * Loan term is entered in whole MONTHS, as the reference product does, rather than
 * chosen from a closed list — 54- and 66-month deals exist and the old select could
 * not express them. TERM_OPTIONS survives as the datalist of common terms and as the
 * structural default; MAX_TERM_MONTHS is what bounds the schedule.
 */
export const TERM_OPTIONS = [24, 36, 48, 60, 72, 84] as const;
export const DEFAULT_TERM = 60;
/** A whole number of months in [1, MAX_TERM_MONTHS]; 120 bounds the schedule to 120 rows. */
export const MAX_TERM_MONTHS = 120;
export const TERM_MESSAGE = `Enter a loan term from 1 to ${MAX_TERM_MONTHS} months.`;

export interface AutoLoanValues {
  autoPrice: string;
  interestRatePct: string;
  loanTermMonths: string;
  downPayment: string;
  salesTaxRatePct: string;
  tradeInValue: string;
  amountOwedOnTradeIn: string;
  fees: string;
  includeTaxesFeesInLoan: boolean;
  /** Rebates and dealer cash — a credit against the amount financed. */
  cashIncentives: string;
  /**
   * USPS code, or '' for "-- Select --". A CONVENIENCE only: choosing a state writes
   * its base rate into salesTaxRatePct, which is the value the maths uses. Nothing
   * downstream reads this field, so the tax table can never silently drive a result.
   */
  stateCode: string;
}

export interface AutoLoanComputed extends AutoLoanResult {
  /** tradeInValue − amountOwedOnTradeIn (may be NEGATIVE). */
  netTradeIn: number;
  termMonths: number;
  financed: boolean;
  /** Loan clamped to zero because credits cover the base — a valid informational outcome. */
  zeroLoan: boolean;
  /** netTradeIn < 0. */
  negativeEquity: boolean;
  /** Parsed inputs the complete-result guard re-derives the loan from. */
  raw: {
    price: number;
    salesTaxRatePct: number;
    fees: number;
    downPayment: number;
  };
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — strict, never Number(v) || 0          */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Finite and strictly greater than zero: the vehicle price. */
function parsePositive(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

/** Required, finite and >= 0: the interest rate. */
function parseNonNegativeRequired(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Optional, finite and >= 0: empty means 0, an entered 0 is valid, negative / non-finite is invalid. */
function parseOptional(raw: string): 'invalid' | number {
  const t = raw.trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

const OPTIONAL_FIELDS: { name: keyof AutoLoanValues; label: string }[] = [
  { name: 'downPayment', label: 'a down payment' },
  { name: 'salesTaxRatePct', label: 'a sales-tax rate' },
  { name: 'tradeInValue', label: 'a trade-in value' },
  { name: 'amountOwedOnTradeIn', label: 'an amount owed' },
  { name: 'fees', label: 'a fees amount' },
  { name: 'cashIncentives', label: 'a cash incentive' },
];

/**
 * Validate individual FIELDS only. Cross-field economic outcomes — negative net trade-in equity, a
 * down payment above the price, credits exceeding the financed base — are NOT rejected here; they are
 * valid scenarios the formula handles.
 */
export function validateAutoLoanValues(values: AutoLoanValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const price = parsePositive(values.autoPrice);
  if (price === 'empty') fieldErrors.autoPrice = 'Enter a vehicle price.';
  else if (price === 'invalid') fieldErrors.autoPrice = 'Enter a vehicle price greater than zero.';

  const rate = parseNonNegativeRequired(values.interestRatePct);
  if (rate === 'empty') fieldErrors.interestRatePct = 'Enter an interest rate.';
  else if (rate === 'invalid') fieldErrors.interestRatePct = 'Enter an interest rate of zero or more.';

  const term = values.loanTermMonths.trim();
  const termN = Number(term);
  if (
    term === '' ||
    !Number.isFinite(termN) ||
    !Number.isInteger(termN) ||
    termN < 1 ||
    termN > MAX_TERM_MONTHS
  ) {
    fieldErrors.loanTermMonths = TERM_MESSAGE;
  }

  for (const { name, label } of OPTIONAL_FIELDS) {
    if (parseOptional(values[name] as string) === 'invalid') {
      fieldErrors[name] = `Enter ${label} of zero or more.`;
    }
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged pass-through to calculateAutoLoan     */
/* ------------------------------------------------------------------ */

/** Parse a validated optional value: empty → 0, else the finite number (never Number(v) || 0). */
const optNum = (raw: string): number => (raw.trim() === '' ? 0 : Number(raw));

export function computeAutoLoan(values: AutoLoanValues): AutoLoanComputed {
  const price = Number(values.autoPrice);
  const salesTaxRatePct = optNum(values.salesTaxRatePct);
  const fees = optNum(values.fees);
  const downPayment = optNum(values.downPayment);
  const tradeInValue = optNum(values.tradeInValue);
  const amountOwedOnTradeIn = optNum(values.amountOwedOnTradeIn);
  const cashIncentives = optNum(values.cashIncentives);
  const termMonths = Number(values.loanTermMonths);

  const result = calculateAutoLoan({
    autoPrice: price,
    loanTermMonths: termMonths,
    interestRatePct: Number(values.interestRatePct),
    downPayment,
    tradeInValue,
    amountOwedOnTradeIn,
    salesTaxRatePct,
    fees,
    includeTaxesFeesInLoan: values.includeTaxesFeesInLoan,
    cashIncentives,
  });

  const netTradeIn = tradeInValue - amountOwedOnTradeIn;
  return {
    ...result,
    netTradeIn,
    termMonths,
    financed: values.includeTaxesFeesInLoan,
    zeroLoan: result.loanAmount === 0,
    negativeEquity: netTradeIn < 0,
    raw: { price, salesTaxRatePct, fees, downPayment },
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const CONSIST_TOL = 1e-6;
const reconTol = (magnitude: number) => Math.max(0.01, Math.abs(magnitude) * 1e-6);
const FAIL = Number.NaN;

/**
 * The schedule has to be a real repayment of THIS loan, not a decorative table: rows
 * run 1..n with no gaps, every figure finite and non-negative, each row's payment is
 * exactly interest + principal, the principal repaid sums to the loan, the interest
 * sums to the reported total, the balance closes at zero, and the yearly collapse
 * agrees with the monthly rows it was built from. A zero loan has no schedule at all.
 */
function scheduleReconciles(r: AutoLoanComputed): boolean {
  const { schedule, yearlySchedule, loanAmount, totalLoanInterest } = r;
  if (!Array.isArray(schedule) || !Array.isArray(yearlySchedule)) return false;

  if (loanAmount === 0) return schedule.length === 0 && yearlySchedule.length === 0;
  if (schedule.length < 1 || schedule.length > MAX_TERM_MONTHS) return false;
  if (schedule.length > r.termMonths) return false;

  let principal = 0;
  let interest = 0;
  for (let i = 0; i < schedule.length; i++) {
    const row = schedule[i];
    if (row.period !== i + 1) return false;
    for (const v of [row.payment, row.interest, row.principal, row.balance]) {
      if (!Number.isFinite(v) || v < 0) return false;
    }
    if (Math.abs(row.payment - (row.interest + row.principal)) > CONSIST_TOL) return false;
    principal += row.principal;
    interest += row.interest;
  }
  if (schedule[schedule.length - 1].balance > 0.01) return false;
  if (Math.abs(principal - loanAmount) > reconTol(loanAmount)) return false;
  if (Math.abs(interest - totalLoanInterest) > reconTol(totalLoanInterest)) return false;

  const years = Math.ceil(schedule.length / 12);
  if (yearlySchedule.length !== years) return false;
  let yPrincipal = 0;
  let yInterest = 0;
  for (let i = 0; i < yearlySchedule.length; i++) {
    const y = yearlySchedule[i];
    if (y.period !== i + 1) return false;
    for (const v of [y.payment, y.interest, y.principal, y.balance]) {
      if (!Number.isFinite(v) || v < 0) return false;
    }
    yPrincipal += y.principal;
    yInterest += y.interest;
  }
  if (Math.abs(yPrincipal - principal) > reconTol(principal)) return false;
  if (Math.abs(yInterest - interest) > reconTol(interest)) return false;
  return yearlySchedule[yearlySchedule.length - 1].balance <= 0.01;
}

/**
 * The dominant monthly payment when the WHOLE result is well-formed, else a NaN sentinel the runtime's
 * default finite gate rejects. Validates finiteness / non-negativity of every source-supported output,
 * the totalOfPayments = payment × months and interest = max(0, top − loan) identities, the zero-loan ⇒
 * zero-payment/zero-interest rule, and that the financed amount and sales tax match the source
 * equation from the parsed inputs. No isUsableResult.
 */
export function completeResultValue(r: AutoLoanComputed): number {
  const { monthlyPayment, loanAmount, salesTax, totalLoanInterest, totalOfPayments, termMonths } = r;

  const nonNeg = [monthlyPayment, loanAmount, salesTax, totalLoanInterest, totalOfPayments, r.upfrontPayment, r.totalCost];
  for (const v of nonNeg) if (!Number.isFinite(v) || v < 0) return FAIL;
  if (!Number.isFinite(termMonths) || !Number.isInteger(termMonths)) return FAIL;
  if (termMonths < 1 || termMonths > MAX_TERM_MONTHS) return FAIL;
  if (!Number.isFinite(r.cashIncentives) || r.cashIncentives < 0) return FAIL;
  if (!Number.isFinite(r.principalShare) || r.principalShare < 0 || r.principalShare > 1) return FAIL;
  if (!scheduleReconciles(r)) return FAIL;
  if (!Number.isFinite(r.netTradeIn)) return FAIL; // may be negative, but must be finite

  // Identities.
  if (Math.abs(totalOfPayments - monthlyPayment * termMonths) > reconTol(totalOfPayments)) return FAIL;
  if (Math.abs(totalLoanInterest - Math.max(0, totalOfPayments - loanAmount)) > reconTol(totalLoanInterest)) return FAIL;

  // Zero-loan ⇒ zero payment and zero interest.
  if (loanAmount === 0 && (monthlyPayment !== 0 || totalLoanInterest !== 0 || totalOfPayments !== 0)) return FAIL;

  // Financed amount + sales tax match the source equation from the parsed inputs.
  const { price, salesTaxRatePct, fees, downPayment } = r.raw;
  const expectedTax = price * (salesTaxRatePct / 100);
  if (Math.abs(salesTax - expectedTax) > reconTol(expectedTax)) return FAIL;
  const financedBase = price + (r.financed ? expectedTax + fees : 0);
  // Rebates are a credit against the FINANCED amount alongside the down payment and
  // trade-in — they are deliberately absent from `expectedTax` above, because the tax
  // is charged on the pre-rebate price.
  const expectedLoan = Math.max(0, financedBase - (downPayment + r.netTradeIn + r.cashIncentives));
  if (Math.abs(loanAmount - expectedLoan) > reconTol(expectedLoan)) return FAIL;

  return monthlyPayment;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

/** Announcement (§14) — the dominant payment only, or the zero-loan message. */
export function describeAutoLoanResult(r: AutoLoanComputed): string {
  if (r.zeroLoan) return 'No auto-loan balance remains based on the entered values.';
  return `Your estimated monthly payment is ${spokenUSD(r.monthlyPayment)}.`;
}

/** The visible interpretation sentences (§13). */
export function interpretationLines(r: AutoLoanComputed): { main: string; toggle: string; equity?: string } {
  const main = r.zeroLoan
    ? 'Your entered cash and trade-in credits cover the calculated financed amount, so no auto-loan balance remains.'
    : `Your estimated payment is ${formatCurrency(r.monthlyPayment)} per month for ${r.termMonths} months.`;
  const toggle = r.financed
    ? 'This estimate includes the entered sales tax and fees in the financed balance.'
    : 'This payment excludes the entered sales tax and fees, which may be due upfront.';
  const equity = r.negativeEquity
    ? `Your trade-in has ${formatCurrency(-r.netTradeIn)} of negative equity, which increases the financed balance.`
    : undefined;
  return { main, toggle, equity };
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* DOM rendering (safe — no innerHTML)                                 */
/* ------------------------------------------------------------------ */

const clampShare = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
/** A 0–1 share as a whole percent, e.g. 0.883 → "88%". */
export const formatPercent = (share: number): string => `${Math.round(clampShare(share) * 100)}%`;

const setW = (el: HTMLElement | null, pct: number): void => {
  if (el) el.style.width = `${pct}%`;
};

/**
 * One schedule row: the period as a row header, then interest, principal and the
 * ending balance. Built with the DOM API so a value can never become markup.
 */
function scheduleRow(row: AutoLoanRow): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'al-row';
  const head = document.createElement('th');
  head.scope = 'row';
  head.className = 'al-cell al-cell--period';
  head.textContent = String(row.period);
  tr.append(head);
  for (const value of [row.interest, row.principal, row.balance]) {
    const td = document.createElement('td');
    td.className = 'al-cell al-num';
    td.textContent = formatCurrency(value);
    tr.append(td);
  }
  return tr;
}

/** The "End of year N" divider the monthly view uses to close each year. */
function yearEndRow(year: number): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'al-year-end';
  const cell = document.createElement('th');
  cell.scope = 'rowgroup';
  cell.colSpan = 4;
  cell.className = 'al-cell al-cell--yearend';
  cell.textContent = `End of year ${year}`;
  tr.append(cell);
  return tr;
}

/** Replace a tbody in one pass. `withYearEnds` interleaves the yearly dividers. */
function fillSchedule(
  tbody: HTMLElement | null,
  rows: readonly AutoLoanRow[],
  withYearEnds: boolean,
): void {
  if (!tbody) return;
  const frag = document.createDocumentFragment();
  rows.forEach((row, i) => {
    frag.append(scheduleRow(row));
    if (withYearEnds && (i + 1) % 12 === 0) frag.append(yearEndRow((i + 1) / 12));
  });
  tbody.replaceChildren(frag);
}

/**
 * Balance, cumulative interest and cumulative amount paid across the term — three
 * series in the same unit on ONE axis, so they are directly comparable. The drawing
 * itself is shared with the interest-rate calculator, which plots exactly the same
 * three lines; only the numbers and the axis labels differ.
 */
function drawBalanceChart(host: HTMLElement | null, r: AutoLoanComputed): void {
  const rows = r.schedule;
  if (rows.length < 2) {
    if (host) host.replaceChildren();
    return;
  }
  let cumInterest = 0;
  let cumPaid = 0;
  const balance: number[] = [];
  const interest: number[] = [];
  const paid: number[] = [];
  for (const row of rows) {
    cumInterest += row.interest;
    cumPaid += row.payment;
    balance.push(row.balance);
    interest.push(cumInterest);
    paid.push(cumPaid);
  }
  drawLoanLineChart(
    host,
    [
      { key: 'balance', values: balance },
      { key: 'interest', values: interest },
      { key: 'paid', values: paid },
    ],
    {
      prefix: 'al',
      xStart: 'Month 1',
      xEnd: `Month ${rows.length}`,
      label:
        `Balance falls from ${formatCurrency(r.loanAmount)} to zero over ${rows.length} months, ` +
        `while total paid rises to ${formatCurrency(cumPaid)}, of which ${formatCurrency(cumInterest)} is interest. ` +
        `The same figures are in the schedule table below.`,
    },
  );
}

const input = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

export const autoLoanBinding: FormCalculatorBinding<AutoLoanValues, AutoLoanComputed> = {
  readValues(root) {
    const val = (n: string) => input(root, n)?.value ?? '';
    const checkbox = root.querySelector<HTMLInputElement>('[name="includeTaxesFeesInLoan"]');
    return {
      autoPrice: val('autoPrice'),
      interestRatePct: val('interestRatePct'),
      loanTermMonths: val('loanTermMonths') || String(DEFAULT_TERM),
      downPayment: val('downPayment'),
      salesTaxRatePct: val('salesTaxRatePct'),
      tradeInValue: val('tradeInValue'),
      amountOwedOnTradeIn: val('amountOwedOnTradeIn'),
      fees: val('fees'),
      includeTaxesFeesInLoan: checkbox ? checkbox.checked : false,
      cashIncentives: val('cashIncentives'),
      stateCode: val('stateCode'),
    };
  },

  validate: validateAutoLoanValues,

  compute: computeAutoLoan,

  /** Complete-result guard as the ordinary result value — no isUsableResult. */
  resultValue: completeResultValue,

  describeResult: describeAutoLoanResult,

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

    // Dominant payment (shown + spoken).
    setText('[data-result-when~="valid"] [data-result-value]', formatCurrency(result.monthlyPayment));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(result.monthlyPayment));

    // Breakdown.
    setText('[data-al-financed]', formatCurrency(result.loanAmount));
    setText('[data-al-tax]', formatCurrency(result.salesTax));
    setText('[data-al-interest]', formatCurrency(result.totalLoanInterest));
    setText('[data-al-top-label]', `Total of ${result.termMonths} loan payments`);
    setText('[data-al-top]', formatCurrency(result.totalOfPayments));
    setText('[data-al-upfront]', formatCurrency(result.upfrontPayment));
    setText('[data-al-total]', formatCurrency(result.totalCost));

    // Cash incentives are shown only when the visitor actually claimed some.
    show('[data-al-incentives-row]', result.cashIncentives > 0);
    if (result.cashIncentives > 0) {
      setText('[data-al-incentives]', `−${formatCurrency(result.cashIncentives)}`);
    }

    // Signed negative-equity row (only when present) — never shown as a positive credit.
    show('[data-al-equity-row]', result.negativeEquity);
    if (result.negativeEquity) setText('[data-al-equity]', `−${formatCurrency(-result.netTradeIn)}`);

    // Interpretation.
    const lines = interpretationLines(result);
    setText('[data-al-interpretation]', lines.main);
    setText('[data-al-toggle-note]', lines.toggle);
    show('[data-al-equity-note]', Boolean(lines.equity));
    if (lines.equity) setText('[data-al-equity-note]', lines.equity);

    // ---- Loan breakdown + schedule + the balance chart. All three are hidden for a
    // zero loan, which has nothing to plot and no schedule to show.
    const hasLoan = result.schedule.length > 0;
    show('[data-al-breakdown]', hasLoan);
    show('[data-al-schedule-block]', hasLoan);
    if (!hasLoan) {
      for (const sel of ['[data-al-rows="monthly"]', '[data-al-rows="yearly"]']) {
        q(sel)?.replaceChildren();
      }
      q('[data-al-chart]')?.replaceChildren();
      return;
    }

    const share = clampShare(result.principalShare);
    const interestShare = 1 - share;
    setW(q('[data-al-seg="principal"]'), share * 100);
    setW(q('[data-al-seg="interest"]'), interestShare * 100);
    setText('[data-al-share-principal]', formatPercent(share));
    setText('[data-al-share-interest]', formatPercent(interestShare));
    setText('[data-al-share-principal-amt]', formatCurrency(result.loanAmount));
    setText('[data-al-share-interest-amt]', formatCurrency(result.totalLoanInterest));

    fillSchedule(q('[data-al-rows="monthly"]'), result.schedule, true);
    fillSchedule(q('[data-al-rows="yearly"]'), result.yearlySchedule, false);
    drawBalanceChart(q('[data-al-chart]'), result);
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of [
      'autoPrice',
      'interestRatePct',
      'downPayment',
      'salesTaxRatePct',
      'tradeInValue',
      'amountOwedOnTradeIn',
      'fees',
      'cashIncentives',
    ]) {
      const el = input(root, name);
      if (el) (el as HTMLInputElement).value = '';
    }
    const state = input(root, 'stateCode');
    if (state) state.value = '';
    // Structural defaults restored by the island (term 60, checkbox cleared, disclosure closed).
  },
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
export const AUTO_LOAN_EXAMPLE_VALUES: AutoLoanValues = { autoPrice: '32000', interestRatePct: '6.9', loanTermMonths: '60', downPayment: '4000', salesTaxRatePct: '7', tradeInValue: '0', amountOwedOnTradeIn: '0', fees: '600', includeTaxesFeesInLoan: false, cashIncentives: '', stateCode: '' };

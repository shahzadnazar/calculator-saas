/**
 * Mortgage form binding (R11E1 Commit 2 — task-first migration, finance complex-form family; the
 * fourth and final finance complex-form).
 *
 * Wraps the UNCHANGED dedicated `calculateMortgage` / `toYearlySchedule` engine (its OWN PMI-aware
 * amortization — NOT @lib/finance.buildAmortization / calculateLoan / the Amortization binding), frozen
 * by mortgage.test.ts. Everything here is at the VALIDATION / PRESENTATION boundary; the monthly-payment
 * formula, the PMI threshold/calculation, the yearly collapse, the row contract and the precision are all
 * untouched.
 *
 * Product decisions (R11E1):
 *   • Task-first, summary-first: every field starts EMPTY, the result is empty, and the visitor presses
 *     "Calculate Mortgage Payment" for the first result (live-after-first thereafter). The dominant value is the
 *     estimated monthly payment (PITI + HOA); the amortization schedule is a closed, on-demand disclosure.
 *   • Home price is required (> 0) and interest rate is required (>= 0 — a 0% loan is a valid principal-
 *     only schedule). Down payment is optional (empty → $0 down) but, when entered, must be a finite
 *     amount from zero up to the home price — a down payment ABOVE the price is a FIELD error on the down
 *     payment (not a form-level error). Loan term is a closed choice (30 / 20 / 15 / 10 years), which
 *     bounds the monthly schedule to at most 360 rows. Property tax, home insurance, HOA and PMI rate are
 *     each optional (empty → 0), finite and non-negative.
 *   • A down payment that equals (or, once clamped, exceeds) the price is a VALID zero-mortgage: no loan,
 *     an empty schedule, and a monthly estimate covering only the ongoing carrying costs. The complete-
 *     result guard supports BOTH a reconciling positive-loan schedule AND this zero-loan outcome, and
 *     lives in the ordinary `resultValue` (a NaN sentinel → the runtime's default finite gate). There is
 *     NO `isUsableResult`.
 */
import { calculateMortgage, toYearlySchedule, type AmortizationRow } from './mortgage';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** The supported loan terms (whole years), offered as a closed select. Ordered as displayed. */
export const TERM_OPTIONS = [30, 20, 15, 10] as const;
/** Hard ceiling on rendered monthly rows — guaranteed by the largest term (30 × 12 = 360). The guard
 *  also checks against it as an explicit, testable contract. */
export const MAX_MONTHLY_ROWS = 30 * 12;

/**
 * How the visitor is expressing the down payment. This is a PRESENTATION choice over the SAME engine:
 * `downPaymentAmount` normalises either form to the absolute dollars `calculateMortgage` accepts, so
 * there is exactly one mortgage calculation. `amount` is the structural default restored on reset.
 */
export const DOWN_PAYMENT_UNITS = ['amount', 'percent'] as const;
export type DownPaymentUnit = (typeof DOWN_PAYMENT_UNITS)[number];

export interface MortgageValues {
  homePrice: string;
  downPayment: string;
  /** Whether `downPayment` is dollars or a percent of the home price. */
  downPaymentUnit: DownPaymentUnit;
  loanTermYears: string;
  annualInterestRate: string;
  propertyTaxAnnual: string;
  homeInsuranceAnnual: string;
  hoaMonthly: string;
  pmiAnnualRate: string;
}

export interface MortgageComputed extends ReturnType<typeof calculateMortgage> {
  /** The parsed home price and down payment (for the interpretation + the down-payment share). */
  homePrice: number;
  downPayment: number;
  /** down / price × 100 (0–100 after validation), or 0 when the price is 0. */
  downPaymentPct: number;
  /** loanAmount === 0 — a fully-covered home with no mortgage. */
  zeroMortgage: boolean;
  /** initial PMI > 0 — the down payment is under 20% and PMI applies. */
  hasPmi: boolean;
  /** The yearly collapse of the monthly schedule, for the disclosure (empty for a zero mortgage). */
  yearlySchedule: AmortizationRow[];
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — strict, never Number(v) || 0          */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Required, finite and strictly greater than zero: the home price. */
function parsePositive(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

/** Required, finite and >= 0: the interest rate (0% is a valid loan). */
function parseNonNegativeRequired(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Optional amount: empty means 0, entered 0 is valid, negative / non-finite is invalid. */
function parseOptionalNonNegative(raw: string): 'invalid' | number {
  const t = raw.trim();
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/**
 * Normalise an entered down payment to the ABSOLUTE DOLLAR amount `calculateMortgage` accepts — the
 * single point where percent mode rejoins the one and only mortgage calculation. A percent is taken of
 * the home price, so `$80,000 on $400,000` and `20% on $400,000` produce the identical loan amount.
 * Pure, so the equivalence is unit-tested directly.
 */
export function downPaymentAmount(
  homePrice: number,
  downPayment: number,
  unit: DownPaymentUnit,
): number {
  return unit === 'percent' ? (homePrice * downPayment) / 100 : downPayment;
}

/**
 * Re-express an entered down payment in a different unit — the PURE half of `convertValues`, so the
 * arithmetic is unit-tested without a DOM (the BMI `metricToImperial` precedent; the DOM wiring itself
 * is covered end-to-end).
 *
 * Returns `null` whenever there is nothing to re-express or no defined equivalent — an empty entry
 * (already "$0 down" in either unit), an unchanged unit, a non-numeric entry, or a home price that is
 * missing, zero or non-numeric. The caller then leaves the visitor's typed value exactly as it is
 * rather than guessing at it.
 */
export function convertDownPayment(
  raw: string,
  homePriceRaw: string,
  fromUnit: DownPaymentUnit,
  toUnit: DownPaymentUnit,
): string | null {
  if (fromUnit === toUnit) return null;
  const t = raw.trim();
  if (t === '') return null;
  const down = Number(t);
  const price = Number(homePriceRaw);
  if (!Number.isFinite(down) || !Number.isFinite(price) || price <= 0) return null;
  const next = toUnit === 'percent' ? (down / price) * 100 : (price * down) / 100;
  // Trim float noise and trailing zeros: 80000, 20, 12.5 — never 20.000000000000004.
  return String(Number(next.toFixed(4)));
}

/** The loan term must be exactly one of the offered options. */
function parseTerm(raw: string): 'invalid' | number {
  const t = raw.trim();
  if (t === '') return 'invalid';
  const n = Number(t);
  return (TERM_OPTIONS as readonly number[]).includes(n) ? n : 'invalid';
}

/**
 * Validate mortgage values. Home price (> 0), interest rate (>= 0) and term (a listed option) are
 * required; down payment, tax, insurance, HOA and PMI are optional non-negative amounts. A down payment
 * greater than the home price is blamed on the DOWN PAYMENT field (a cross-field field error, not a
 * form-level error), but only when the price itself is a valid number to compare against.
 */
export function validateMortgageValues(values: MortgageValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const price = parsePositive(values.homePrice);
  if (price === 'empty') fieldErrors.homePrice = 'Enter a home price.';
  else if (price === 'invalid') fieldErrors.homePrice = 'Enter a home price greater than zero.';

  // Down payment: the SAME optional non-negative parse in both modes; only the ceiling differs —
  // 100% of the price in percent mode, the price itself in dollar mode. The dollar-mode messages are
  // unchanged from before the unit toggle existed.
  const down = parseOptionalNonNegative(values.downPayment);
  if (down === 'invalid') {
    fieldErrors.downPayment =
      values.downPaymentUnit === 'percent'
        ? 'Enter a down payment percent of zero or more.'
        : 'Enter a down payment of zero or more.';
  } else if (values.downPaymentUnit === 'percent') {
    if (down > 100) fieldErrors.downPayment = 'Enter a down payment of 100% or less.';
  } else if (typeof price === 'number' && down > price) {
    fieldErrors.downPayment = 'Enter a down payment no greater than the home price.';
  }

  if (parseTerm(values.loanTermYears) === 'invalid') fieldErrors.loanTermYears = 'Choose a loan term.';

  const rate = parseNonNegativeRequired(values.annualInterestRate);
  if (rate === 'empty') fieldErrors.annualInterestRate = 'Enter an interest rate.';
  else if (rate === 'invalid') fieldErrors.annualInterestRate = 'Enter an interest rate of zero or more.';

  if (parseOptionalNonNegative(values.propertyTaxAnnual) === 'invalid') {
    fieldErrors.propertyTaxAnnual = 'Enter a property tax amount of zero or more.';
  }
  if (parseOptionalNonNegative(values.homeInsuranceAnnual) === 'invalid') {
    fieldErrors.homeInsuranceAnnual = 'Enter a home insurance amount of zero or more.';
  }
  if (parseOptionalNonNegative(values.hoaMonthly) === 'invalid') {
    fieldErrors.hoaMonthly = 'Enter an HOA amount of zero or more.';
  }
  if (parseOptionalNonNegative(values.pmiAnnualRate) === 'invalid') {
    fieldErrors.pmiAnnualRate = 'Enter a PMI rate of zero or more.';
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged pass-through to calculateMortgage    */
/* ------------------------------------------------------------------ */

const optNum = (raw: string): number => (raw.trim() === '' ? 0 : Number(raw));

export function computeMortgage(values: MortgageValues): MortgageComputed {
  const homePrice = optNum(values.homePrice);
  // Percent mode rejoins the single engine here — everything downstream sees absolute dollars.
  const downPayment = downPaymentAmount(homePrice, optNum(values.downPayment), values.downPaymentUnit);
  const result = calculateMortgage({
    homePrice,
    downPayment,
    loanTermYears: optNum(values.loanTermYears),
    annualInterestRate: optNum(values.annualInterestRate),
    propertyTaxAnnual: optNum(values.propertyTaxAnnual),
    homeInsuranceAnnual: optNum(values.homeInsuranceAnnual),
    hoaMonthly: optNum(values.hoaMonthly),
    pmiAnnualRate: optNum(values.pmiAnnualRate),
  });
  return {
    ...result,
    homePrice,
    downPayment,
    downPaymentPct: homePrice > 0 ? (downPayment / homePrice) * 100 : 0,
    zeroMortgage: result.loanAmount === 0,
    hasPmi: result.monthlyPmi > 0,
    yearlySchedule: toYearlySchedule(result.schedule),
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const COMPONENT_TOL = 1e-6; // monthlyTotal reconstructed from the same operands, in the same order
const ROW_SUM_TOL = 1e-6; // per-row payment == principal + interest (an exact float addition)
const ZERO_BAL_TOL = 1e-2; // a fully-amortized final balance is ~0 (final principal capped at balance)
const reconTol = (magnitude: number) => Math.max(1, Math.abs(magnitude) * 1e-6);

const FAIL = Number.NaN; // non-finite sentinel → the runtime's default finite gate rejects the result

/**
 * The dominant monthly payment — but ONLY when the ENTIRE computed result is well-formed. The complete-
 * result contract (summary + the full monthly PMI schedule, with reconciliation) is enforced here so a
 * malformed or non-reconciling result NEVER renders. Any failure returns the NaN sentinel, which the
 * standard-form runtime's DEFAULT finite gate rejects (the Amortization / Auto Loan / Investment
 * `resultValue`-guard pattern — NO `isUsableResult`).
 *
 * TWO valid shapes are accepted:
 *   • A ZERO mortgage (down payment covers the price): loanAmount 0, an EMPTY schedule, no interest/PMI,
 *     and the monthly total is the ongoing carrying cost only (tax + insurance + HOA, possibly 0). The
 *     dominant value is that carrying cost — a finite number the runtime accepts (0 is finite).
 *   • A POSITIVE loan: a full monthly schedule (1…payoffMonths, ordered, finite, non-negative, each row
 *     payment == principal + interest, final balance ≈ 0) that reconciles to the loan, total interest,
 *     total PMI and total of payments, plus a yearly collapse that reconciles to the monthly sums.
 */
export function completeResultValue(r: MortgageComputed): number {
  const {
    loanAmount,
    monthlyPrincipalInterest,
    monthlyPropertyTax,
    monthlyInsurance,
    monthlyHoa,
    monthlyPmi,
    monthlyTotal,
    totalInterest,
    totalPmi,
    totalOfPayments,
    payoffMonths,
    schedule,
    yearlySchedule,
  } = r;

  // --- Summary: every figure finite and non-negative ---
  for (const v of [
    loanAmount,
    monthlyPrincipalInterest,
    monthlyPropertyTax,
    monthlyInsurance,
    monthlyHoa,
    monthlyPmi,
    monthlyTotal,
    totalInterest,
    totalPmi,
    totalOfPayments,
  ]) {
    if (!Number.isFinite(v) || v < 0) return FAIL;
  }
  if (!Number.isFinite(payoffMonths) || !Number.isInteger(payoffMonths) || payoffMonths < 0) return FAIL;
  if (!Array.isArray(schedule) || !Array.isArray(yearlySchedule)) return FAIL;

  // The monthly total is always P&I + tax + insurance + HOA + initial PMI.
  if (
    Math.abs(monthlyTotal - (monthlyPrincipalInterest + monthlyPropertyTax + monthlyInsurance + monthlyHoa + monthlyPmi)) >
    COMPONENT_TOL
  ) {
    return FAIL;
  }

  // --- Zero mortgage: no loan, no schedule, no interest/PMI; the carrying cost stands alone ---
  if (loanAmount === 0) {
    if (schedule.length !== 0 || yearlySchedule.length !== 0 || payoffMonths !== 0) return FAIL;
    if (monthlyPrincipalInterest !== 0 || monthlyPmi !== 0) return FAIL;
    if (totalInterest !== 0 || totalPmi !== 0 || totalOfPayments !== 0) return FAIL;
    return monthlyTotal; // tax + insurance + HOA (>= 0), finite → accepted
  }

  // --- Positive loan: a reconciling monthly schedule ---
  if (schedule.length !== payoffMonths) return FAIL;
  if (payoffMonths < 1 || payoffMonths > MAX_MONTHLY_ROWS) return FAIL;

  let sumPrincipal = 0;
  let sumInterest = 0;
  let sumPmi = 0;
  for (let i = 0; i < schedule.length; i++) {
    const row = schedule[i];
    if (row.period !== i + 1) return FAIL; // ordered from 1, no gaps
    for (const v of [row.payment, row.principal, row.interest, row.pmi, row.balance]) {
      if (!Number.isFinite(v) || v < 0) return FAIL;
    }
    if (Math.abs(row.payment - (row.principal + row.interest)) > ROW_SUM_TOL) return FAIL;
    sumPrincipal += row.principal;
    sumInterest += row.interest;
    sumPmi += row.pmi;
  }
  if (Math.abs(schedule[schedule.length - 1].balance) > ZERO_BAL_TOL) return FAIL; // final ~ 0

  if (Math.abs(sumPrincipal - loanAmount) > reconTol(loanAmount)) return FAIL;
  if (Math.abs(sumInterest - totalInterest) > reconTol(totalInterest)) return FAIL;
  if (Math.abs(sumPmi - totalPmi) > reconTol(totalPmi)) return FAIL;
  if (Math.abs(totalOfPayments - (loanAmount + totalInterest)) > reconTol(totalOfPayments)) return FAIL;

  // --- Yearly collapse reconciles to the monthly sums ---
  if (yearlySchedule.length < 1) return FAIL;
  let ySumPrincipal = 0;
  let ySumInterest = 0;
  for (let i = 0; i < yearlySchedule.length; i++) {
    const y = yearlySchedule[i];
    if (y.period !== i + 1) return FAIL;
    if (!Number.isFinite(y.principal) || !Number.isFinite(y.interest) || !Number.isFinite(y.balance)) return FAIL;
    if (y.balance < 0) return FAIL;
    ySumPrincipal += y.principal;
    ySumInterest += y.interest;
  }
  if (Math.abs(yearlySchedule[yearlySchedule.length - 1].balance) > ZERO_BAL_TOL) return FAIL;
  if (Math.abs(ySumPrincipal - sumPrincipal) > reconTol(sumPrincipal)) return FAIL;
  if (Math.abs(ySumInterest - sumInterest) > reconTol(sumInterest)) return FAIL;

  return monthlyTotal;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** A USD amount in spoken form, e.g. "2220 dollars and 36 cents", for the announcement. */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

/** A percentage rendered whole when integral, else to two decimals: "20%", "12.5%". */
const fmtPct = (n: number): string => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

/** Concise announcement — the dominant monthly figure, with the zero-mortgage case spoken plainly. */
export function describeMortgageResult(r: MortgageComputed): string {
  if (r.zeroMortgage) {
    return `Your down payment covers the full price, so there is no mortgage. The estimated monthly cost is ${spokenUSD(r.monthlyTotal)}.`;
  }
  const n = r.payoffMonths;
  return `Your estimated monthly payment is ${spokenUSD(r.monthlyTotal)} over ${n} monthly payment${n === 1 ? '' : 's'}, with ${spokenUSD(r.totalInterest)} in total interest.`;
}

/** The visible interpretation sentence, using the actual computed values. */
export function interpretMortgage(r: MortgageComputed): string {
  if (r.zeroMortgage) {
    return r.monthlyTotal > 0
      ? `Your down payment of ${formatCurrencyRounded(r.downPayment)} covers the full ${formatCurrencyRounded(r.homePrice)} price, so no mortgage is needed. The monthly estimate reflects property tax, insurance and HOA only.`
      : `Your down payment of ${formatCurrencyRounded(r.downPayment)} covers the full ${formatCurrencyRounded(r.homePrice)} price, so there is no mortgage and no ongoing monthly cost was entered.`;
  }
  if (r.hasPmi) {
    return `With ${fmtPct(r.downPaymentPct)} down, this estimate includes ${formatCurrency(r.monthlyPmi)} per month of PMI while your balance stays above 80% of the home price. Reaching 20% down removes it.`;
  }
  return `With ${fmtPct(r.downPaymentPct)} down, your estimated monthly payment of ${formatCurrency(r.monthlyTotal)} covers principal and interest plus any taxes, insurance and HOA — no PMI applies at this down payment.`;
}

/** Breakdown-bar segment percentages of the monthly total. When the total is 0 all are 0 and the island
 *  hides the bar; otherwise the five parts sum to 100%. */
export function proportionSegments(r: MortgageComputed): {
  pi: number;
  tax: number;
  ins: number;
  pmi: number;
  hoa: number;
} {
  const total = r.monthlyTotal;
  const pct = (v: number) => (total > 0 ? Math.max(0, (v / total) * 100) : 0);
  return {
    pi: pct(r.monthlyPrincipalInterest),
    tax: pct(r.monthlyPropertyTax),
    ins: pct(r.monthlyInsurance),
    pmi: pct(r.monthlyPmi),
    hoa: pct(r.monthlyHoa),
  };
}

/* ------------------------------------------------------------------ */
/* DOM rendering (safe — no innerHTML)                                 */
/* ------------------------------------------------------------------ */

/** One yearly schedule row built with the DOM API — the year as a row header, three right-aligned money
 *  cells (principal, interest, balance). Never uses innerHTML, so values can never become markup. */
function scheduleRow(row: AmortizationRow): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'mc-row';

  const period = document.createElement('th');
  period.scope = 'row';
  period.className = 'mc-cell mc-cell--period';
  period.textContent = String(row.period);
  tr.append(period);

  for (const value of [row.principal, row.interest, row.balance]) {
    const td = document.createElement('td');
    td.className = 'mc-cell mc-num';
    td.textContent = formatCurrencyRounded(value);
    tr.append(td);
  }
  return tr;
}

/** Replace a tbody's rows in one pass via a fragment (all rows; no pagination / virtualization). */
function fillBody(tbody: HTMLElement | null, rows: readonly AmortizationRow[]): void {
  if (!tbody) return;
  const frag = document.createDocumentFragment();
  for (const row of rows) frag.append(scheduleRow(row));
  tbody.replaceChildren(frag);
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

const FIELD_NAMES: (keyof MortgageValues)[] = [
  'homePrice',
  'downPayment',
  'loanTermYears',
  'annualInterestRate',
  'propertyTaxAnnual',
  'homeInsuranceAnnual',
  'hoaMonthly',
  'pmiAnnualRate',
];

/** The down-payment unit currently selected in the DOM, defaulting to dollars when absent. */
function activeDownPaymentUnit(root: HTMLElement): DownPaymentUnit {
  const el = root.querySelector<HTMLElement>(
    '[data-unit].is-active, [data-unit][aria-checked="true"]',
  );
  return el?.dataset.unit === 'percent' ? 'percent' : 'amount';
}

export const mortgageBinding: FormCalculatorBinding<MortgageValues, MortgageComputed> = {
  readValues(root) {
    const val = (n: string) => input(root, n)?.value ?? '';
    return {
      homePrice: val('homePrice'),
      downPayment: val('downPayment'),
      downPaymentUnit: activeDownPaymentUnit(root),
      loanTermYears: val('loanTermYears'),
      annualInterestRate: val('annualInterestRate'),
      propertyTaxAnnual: val('propertyTaxAnnual'),
      homeInsuranceAnnual: val('homeInsuranceAnnual'),
      hoaMonthly: val('hoaMonthly'),
      pmiAnnualRate: val('pmiAnnualRate'),
    };
  },

  validate: validateMortgageValues,

  compute: computeMortgage,

  /** The dominant monthly total when the ENTIRE result is well-formed, else a NaN sentinel the runtime's
   *  default finite gate rejects. The complete-result contract lives in this ordinary result-value
   *  function — there is deliberately NO `isUsableResult`. */
  resultValue: completeResultValue,

  describeResult: describeMortgageResult,

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

    // Dominant monthly payment (shown + spoken).
    setText('[data-result-when~="valid"] [data-result-value]', formatCurrency(result.monthlyTotal));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(result.monthlyTotal));

    // Interpretation.
    setText('[data-mc-interpretation]', interpretMortgage(result));

    // Monthly breakdown (textual — conveys every value).
    setText('[data-mc-pi]', formatCurrency(result.monthlyPrincipalInterest));
    setText('[data-mc-tax]', formatCurrency(result.monthlyPropertyTax));
    setText('[data-mc-ins]', formatCurrency(result.monthlyInsurance));
    setText('[data-mc-pmi]', formatCurrency(result.monthlyPmi));
    setText('[data-mc-hoa]', formatCurrency(result.monthlyHoa));

    // Loan summary.
    setText('[data-mc-loan]', formatCurrencyRounded(result.loanAmount));
    setText('[data-mc-total-interest]', formatCurrencyRounded(result.totalInterest));
    setText('[data-mc-total-paid]', formatCurrencyRounded(result.totalOfPayments));

    // Supplemental breakdown bar (aria-hidden; the text conveys every value). Hidden when the monthly
    // total is 0 so no zero-width/invalid segments are produced.
    const seg = proportionSegments(result);
    const setW = (sel: string, w: number) => {
      const el = q(sel);
      if (el) el.style.width = `${w}%`;
    };
    show('[data-mc-bar]', result.monthlyTotal > 0);
    if (result.monthlyTotal > 0) {
      setW('[data-mc-seg="pi"]', seg.pi);
      setW('[data-mc-seg="tax"]', seg.tax);
      setW('[data-mc-seg="ins"]', seg.ins);
      setW('[data-mc-seg="pmi"]', seg.pmi);
      setW('[data-mc-seg="hoa"]', seg.hoa);
    }

    // Amortization schedule disclosure — populated in full for a positive loan, hidden entirely for a
    // zero mortgage (there is no schedule to show).
    show('[data-mc-schedule-block]', !result.zeroMortgage);
    fillBody(q('[data-mc-rows]'), result.yearlySchedule);
  },

  /**
   * Re-express the ENTERED down payment in the newly-selected unit, so switching never silently
   * changes what the visitor is putting down: $80,000 on a $400,000 home becomes 20%, and back again.
   * Conversion needs a usable home price — with the price empty, zero or non-numeric there is no
   * defined equivalent, so the typed value is left exactly as it is rather than guessed at. An empty
   * down payment likewise stays empty (it already means "$0 down" in either unit).
   */
  convertValues(root, fromUnit, toUnit) {
    const downEl = input(root, 'downPayment');
    if (!downEl) return;
    const next = convertDownPayment(
      downEl.value,
      input(root, 'homePrice')?.value ?? '',
      fromUnit as DownPaymentUnit,
      toUnit as DownPaymentUnit,
    );
    if (next !== null) downEl.value = next;
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of FIELD_NAMES) {
      const el = input(root, name);
      if (!el) continue;
      // The term is a closed <select> and cannot be blank — restore its default (the first, largest
      // option); every other field clears to empty. Keyed off the name so it needs no DOM globals.
      el.value = name === 'loanTermYears' ? String(TERM_OPTIONS[0]) : '';
    }
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (build-time, computed — never hardcoded)             */
/* ------------------------------------------------------------------ */

/**
 * The scenario behind the "A worked example" section BELOW the calculator. The visitor's own fields
 * stay EMPTY (ratified product decision #1); this is clearly-labelled educational content, which is
 * where the doctrine puts worked examples.
 *
 * Only the INPUTS live here. Every figure the page prints is derived by `mortgageExample()` from the
 * same reviewed `calculateMortgage` the calculator uses, so the prose can never drift from the engine
 * — the `referenceTables.ts` discipline applied to a single scenario.
 */
export const MORTGAGE_EXAMPLE = {
  homePrice: 400_000,
  downPaymentPct: 20,
  annualInterestRate: 6.5,
  loanTermYears: 30,
} as const;

export interface MortgageExample {
  homePrice: number;
  downPaymentPct: number;
  downPayment: number;
  loanAmount: number;
  annualInterestRate: number;
  loanTermYears: number;
  monthlyPrincipalInterest: number;
  totalInterest: number;
  totalOfPayments: number;
}

/** Compute the worked example from the engine. Pure — no DOM, safe at build time. */
export function mortgageExample(): MortgageExample {
  const { homePrice, downPaymentPct, annualInterestRate, loanTermYears } = MORTGAGE_EXAMPLE;
  const downPayment = downPaymentAmount(homePrice, downPaymentPct, 'percent');
  const r = calculateMortgage({ homePrice, downPayment, loanTermYears, annualInterestRate });
  return {
    homePrice,
    downPaymentPct,
    downPayment,
    loanAmount: r.loanAmount,
    annualInterestRate,
    loanTermYears,
    monthlyPrincipalInterest: r.monthlyPrincipalInterest,
    totalInterest: r.totalInterest,
    totalOfPayments: r.totalOfPayments,
  };
}

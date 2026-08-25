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
 * How the visitor is expressing a money field that has a meaningful base. Purely a PRESENTATION
 * choice over the SAME engine: each field is normalised to the unit `calculateMortgage` already
 * accepts before it is called, so there is exactly one mortgage calculation.
 *
 * Three fields carry a unit, each with its OWN base and its OWN structural default:
 *
 *   | field            | units      | base            | engine wants | default   |
 *   |------------------|------------|-----------------|--------------|-----------|
 *   | downPayment      | $ / %      | home price      | dollars      | `amount`  |
 *   | propertyTaxAnnual| $ / %      | home price      | dollars/year | `amount`  |
 *   | pmiAnnualRate    | % / $      | LOAN amount     | percent/year | `percent` |
 *
 * PMI is the inverse case: the engine wants a percent, so DOLLAR entry is what gets converted. Its
 * base is the loan amount (price − down payment), which is itself derived — see `pmiPercent`.
 *
 * Fields with no meaningful base keep a single fixed unit and no selector: home price (it IS the
 * base), loan term, interest rate (an intrinsic rate — dollars would be a different concept), home
 * insurance (premiums are quoted in dollars) and HOA (a flat fee).
 */
export const MONEY_UNITS = ['amount', 'percent'] as const;
export type MoneyUnit = (typeof MONEY_UNITS)[number];

/** Historical alias — the down payment was the first field to carry a unit. */
export type DownPaymentUnit = MoneyUnit;
export const DOWN_PAYMENT_UNITS = MONEY_UNITS;

/** The unit-group names used in the markup (`data-unit-group`) and passed to `convertValues`. */
export const UNIT_GROUPS = {
  downPayment: 'downPayment',
  propertyTax: 'propertyTax',
  pmi: 'pmi',
  otherCosts: 'otherCosts',
} as const;

export interface MortgageValues {
  homePrice: string;
  downPayment: string;
  /** Whether `downPayment` is dollars or a percent of the home price. */
  downPaymentUnit: MoneyUnit;
  loanTermYears: string;
  annualInterestRate: string;
  propertyTaxAnnual: string;
  /** Whether `propertyTaxAnnual` is dollars/year or a percent of the home price. */
  propertyTaxUnit: MoneyUnit;
  homeInsuranceAnnual: string;
  hoaMonthly: string;
  otherCostsAnnual: string;
  /** Whether `otherCostsAnnual` is dollars/year or a percent of the home price. */
  otherCostsUnit: MoneyUnit;
  pmiAnnualRate: string;
  /** Repayment start — month 1-12 and a four-digit year. Presentation only: it dates the
   *  yearly schedule rows and never enters the mortgage maths. */
  startMonth: string;
  startYear: string;
  /** Whether `pmiAnnualRate` is a percent of the loan (engine-native) or dollars/year. */
  pmiUnit: MoneyUnit;
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
  /** One "8/26–7/27" label per yearly row, or an empty array when no start date is set. */
  yearLabels: string[];
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
  return dollarsOf(homePrice, downPayment, unit);
}

/**
 * A money field expressed against a base → ABSOLUTE DOLLARS, the shape `calculateMortgage` accepts
 * for the down payment and the annual property tax. `$80,000 on $400,000` and `20% on $400,000`
 * therefore reach the engine identically.
 */
export function dollarsOf(base: number, value: number, unit: MoneyUnit): number {
  return unit === 'percent' ? (base * value) / 100 : value;
}

/**
 * PMI → the ANNUAL PERCENT OF THE LOAN the engine expects (`pmiAnnualRate`). This is the inverse of
 * `dollarsOf`: percent entry passes straight through, and it is DOLLAR entry that is converted, using
 * the loan amount as the base.
 *
 * A loan of zero has no defined percent equivalent for a dollar premium, so it yields 0 rather than a
 * division by zero — consistent with the zero-mortgage outcome, where PMI cannot apply anyway.
 */
export function pmiPercent(loanAmount: number, value: number, unit: MoneyUnit): number {
  if (unit === 'percent') return value;
  return loanAmount > 0 ? (value / loanAmount) * 100 : 0;
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
export function convertAgainstBase(
  raw: string,
  base: number,
  fromUnit: MoneyUnit,
  toUnit: MoneyUnit,
): string | null {
  if (fromUnit === toUnit) return null;
  const t = raw.trim();
  if (t === '') return null;
  const value = Number(t);
  if (!Number.isFinite(value) || !Number.isFinite(base) || base <= 0) return null;
  const next = toUnit === 'percent' ? (value / base) * 100 : (base * value) / 100;
  // Trim float noise and trailing zeros: 80000, 20, 1.2 — never 20.000000000000004.
  return String(Number(next.toFixed(4)));
}

/** The down-payment conversion, expressed against the home price. */
export function convertDownPayment(
  raw: string,
  homePriceRaw: string,
  fromUnit: MoneyUnit,
  toUnit: MoneyUnit,
): string | null {
  return convertAgainstBase(raw, Number(homePriceRaw), fromUnit, toUnit);
}

/**
 * The 12-month window one yearly schedule row covers, as "8/26–7/27".
 *
 * Presentation only — the start date never enters the mortgage maths, it just dates the rows the
 * engine already produced. `yearIndex` is the row's 1-based period. Returns '' when the start date is
 * not a usable month (1-12) and four-digit year, so an unset date simply shows no range.
 */
export function yearRangeLabel(startMonth: number, startYear: number, yearIndex: number): string {
  if (
    !Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12 ||
    !Number.isInteger(startYear) || startYear < 1000 || startYear > 9999 ||
    !Number.isInteger(yearIndex) || yearIndex < 1
  ) {
    return '';
  }
  const first = (yearIndex - 1) * 12; // months elapsed before this row
  const at = (offset: number) => {
    const m0 = startMonth - 1 + offset;
    const year = startYear + Math.floor(m0 / 12);
    return `${(m0 % 12) + 1}/${String(year % 100).padStart(2, '0')}`;
  };
  return `${at(first)}\u2013${at(first + 11)}`;
}

/** Every row's label for a schedule of `rows` years. Empty array when the date is unusable. */
export function yearRangeLabels(startMonth: number, startYear: number, rows: number): string[] {
  const labels: string[] = [];
  for (let i = 1; i <= rows; i++) {
    const label = yearRangeLabel(startMonth, startYear, i);
    if (label === '') return [];
    labels.push(label);
  }
  return labels;
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

  // Property tax carries the same dual unit as the down payment: dollars/year, or a percent of the
  // home price (an effective/mill rate). Only the ceiling differs by unit; the dollar-mode message is
  // unchanged from before the unit existed.
  const tax = parseOptionalNonNegative(values.propertyTaxAnnual);
  if (tax === 'invalid') {
    fieldErrors.propertyTaxAnnual =
      values.propertyTaxUnit === 'percent'
        ? 'Enter a property tax percent of zero or more.'
        : 'Enter a property tax amount of zero or more.';
  } else if (values.propertyTaxUnit === 'percent' && tax > 100) {
    fieldErrors.propertyTaxAnnual = 'Enter a property tax of 100% or less.';
  }
  if (parseOptionalNonNegative(values.homeInsuranceAnnual) === 'invalid') {
    fieldErrors.homeInsuranceAnnual = 'Enter a home insurance amount of zero or more.';
  }
  if (parseOptionalNonNegative(values.hoaMonthly) === 'invalid') {
    fieldErrors.hoaMonthly = 'Enter an HOA amount of zero or more.';
  }
  // Other costs carry the same dual unit as property tax: dollars/year or a percent of the price.
  const other = parseOptionalNonNegative(values.otherCostsAnnual);
  if (other === 'invalid') {
    fieldErrors.otherCostsAnnual =
      values.otherCostsUnit === 'percent'
        ? 'Enter an other-costs percent of zero or more.'
        : 'Enter an other-costs amount of zero or more.';
  } else if (values.otherCostsUnit === 'percent' && other > 100) {
    fieldErrors.otherCostsAnnual = 'Enter other costs of 100% or less.';
  }
  // PMI is the inverse: percent is engine-native (and keeps its original message), while dollars is
  // the converted form. A percent above 100 of the loan is rejected; a dollar premium has no ceiling
  // here because the loan it is measured against may not be resolvable yet.
  const pmi = parseOptionalNonNegative(values.pmiAnnualRate);
  if (pmi === 'invalid') {
    fieldErrors.pmiAnnualRate =
      values.pmiUnit === 'amount'
        ? 'Enter a PMI amount of zero or more.'
        : 'Enter a PMI rate of zero or more.';
  } else if (values.pmiUnit === 'percent' && pmi > 100) {
    fieldErrors.pmiAnnualRate = 'Enter a PMI rate of 100% or less.';
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged pass-through to calculateMortgage    */
/* ------------------------------------------------------------------ */

const optNum = (raw: string): number => (raw.trim() === '' ? 0 : Number(raw));

export function computeMortgage(values: MortgageValues): MortgageComputed {
  // Every unit-carrying field rejoins the SINGLE engine here, resolved in dependency order:
  // the price anchors the down payment and the tax, and the resulting loan anchors PMI.
  const homePrice = optNum(values.homePrice);
  const downPayment = dollarsOf(homePrice, optNum(values.downPayment), values.downPaymentUnit);
  const loanBase = Math.max(0, homePrice - Math.min(Math.max(0, downPayment), homePrice));
  const result = calculateMortgage({
    homePrice,
    downPayment,
    loanTermYears: optNum(values.loanTermYears),
    annualInterestRate: optNum(values.annualInterestRate),
    propertyTaxAnnual: dollarsOf(homePrice, optNum(values.propertyTaxAnnual), values.propertyTaxUnit),
    homeInsuranceAnnual: optNum(values.homeInsuranceAnnual),
    hoaMonthly: optNum(values.hoaMonthly),
    otherCostsAnnual: dollarsOf(homePrice, optNum(values.otherCostsAnnual), values.otherCostsUnit),
    pmiAnnualRate: pmiPercent(loanBase, optNum(values.pmiAnnualRate), values.pmiUnit),
  });
  const yearly = toYearlySchedule(result.schedule);
  return {
    ...result,
    homePrice,
    downPayment,
    downPaymentPct: homePrice > 0 ? (downPayment / homePrice) * 100 : 0,
    zeroMortgage: result.loanAmount === 0,
    hasPmi: result.monthlyPmi > 0,
    yearlySchedule: yearly,
    yearLabels: yearRangeLabels(optNum(values.startMonth), optNum(values.startYear), yearly.length),
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
    monthlyOther,
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
    monthlyOther,
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
    Math.abs(monthlyTotal - (monthlyPrincipalInterest + monthlyPropertyTax + monthlyInsurance + monthlyHoa + monthlyOther + monthlyPmi)) >
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
  other: number;
} {
  const total = r.monthlyTotal;
  const pct = (v: number) => (total > 0 ? Math.max(0, (v / total) * 100) : 0);
  return {
    pi: pct(r.monthlyPrincipalInterest),
    tax: pct(r.monthlyPropertyTax),
    ins: pct(r.monthlyInsurance),
    pmi: pct(r.monthlyPmi),
    hoa: pct(r.monthlyHoa),
    other: pct(r.monthlyOther),
  };
}

/* ------------------------------------------------------------------ */
/* DOM rendering (safe — no innerHTML)                                 */
/* ------------------------------------------------------------------ */

/** One yearly schedule row built with the DOM API — the year as a row header, three right-aligned money
 *  cells (principal, interest, balance). Never uses innerHTML, so values can never become markup. */
function scheduleRow(row: AmortizationRow, label?: string): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'mc-row';

  const period = document.createElement('th');
  period.scope = 'row';
  period.className = 'mc-cell mc-cell--period';
  period.textContent = String(row.period);
  // The dated window follows the serial number in the SAME cell, at a smaller size, so the
  // schedule gains no column and no extra width.
  if (label) {
    const range = document.createElement('span');
    range.className = 'mc-cell__range';
    range.textContent = label;
    period.append(range);
  }
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
function fillBody(
  tbody: HTMLElement | null,
  rows: readonly AmortizationRow[],
  labels: readonly string[] = [],
): void {
  if (!tbody) return;
  const frag = document.createDocumentFragment();
  rows.forEach((row, i) => frag.append(scheduleRow(row, labels[i])));
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
  'otherCostsAnnual',
  'pmiAnnualRate',
];

/**
 * The unit currently selected for one field, read from ITS OWN `[data-unit-group]` container so the
 * three groups never read each other. Falls back to the field's structural default when the group is
 * absent (a server-rendered page before hydration, or a host that omits the selector).
 */
function activeUnit(root: HTMLElement, group: string, fallback: MoneyUnit): MoneyUnit {
  const el = root.querySelector<HTMLElement>(
    `[data-unit-group="${group}"] [data-unit].is-active, [data-unit-group="${group}"] [data-unit][aria-checked="true"]`,
  );
  const unit = el?.dataset.unit;
  return unit === 'percent' || unit === 'amount' ? unit : fallback;
}

export const mortgageBinding: FormCalculatorBinding<MortgageValues, MortgageComputed> = {
  readValues(root) {
    const val = (n: string) => input(root, n)?.value ?? '';
    return {
      homePrice: val('homePrice'),
      downPayment: val('downPayment'),
      downPaymentUnit: activeUnit(root, UNIT_GROUPS.downPayment, 'amount'),
      loanTermYears: val('loanTermYears'),
      annualInterestRate: val('annualInterestRate'),
      propertyTaxAnnual: val('propertyTaxAnnual'),
      propertyTaxUnit: activeUnit(root, UNIT_GROUPS.propertyTax, 'amount'),
      homeInsuranceAnnual: val('homeInsuranceAnnual'),
      hoaMonthly: val('hoaMonthly'),
      otherCostsAnnual: val('otherCostsAnnual'),
      otherCostsUnit: activeUnit(root, UNIT_GROUPS.otherCosts, 'amount'),
      startMonth: val('startMonth'),
      startYear: val('startYear'),
      pmiAnnualRate: val('pmiAnnualRate'),
      pmiUnit: activeUnit(root, UNIT_GROUPS.pmi, 'percent'),
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
    setText('[data-mc-other]', formatCurrency(result.monthlyOther));

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
      setW('[data-mc-seg="other"]', seg.other);
    }

    // Amortization schedule disclosure — populated in full for a positive loan, hidden entirely for a
    // zero mortgage (there is no schedule to show).
    show('[data-mc-schedule-block]', !result.zeroMortgage);
    fillBody(q('[data-mc-rows]'), result.yearlySchedule, result.yearLabels);
  },

  /**
   * Re-express ONE field's entered value in its newly-selected unit, so switching never silently
   * changes the economic quantity: $80,000 on a $400,000 home becomes 20%, and back again. The
   * runtime names the group that changed, so the other two fields are never touched.
   *
   * Each field converts against its OWN base, and a base that cannot be resolved means there is no
   * defined equivalent — the visitor's typed value is then left exactly as it is rather than guessed
   * at. For PMI that base is the LOAN amount, which needs a valid price AND down payment first.
   */
  convertValues(root, fromUnit, toUnit, group) {
    const from = fromUnit as MoneyUnit;
    const to = toUnit as MoneyUnit;
    const raw = (name: string) => input(root, name)?.value ?? '';
    const price = Number(raw('homePrice'));

    const apply = (name: string, base: number) => {
      const el = input(root, name);
      if (!el) return;
      const next = convertAgainstBase(el.value, base, from, to);
      if (next !== null) el.value = next;
    };

    if (group === UNIT_GROUPS.downPayment) {
      apply('downPayment', price);
      return;
    }
    if (group === UNIT_GROUPS.propertyTax) {
      apply('propertyTaxAnnual', price);
      return;
    }
    if (group === UNIT_GROUPS.otherCosts) {
      apply('otherCostsAnnual', price);
      return;
    }
    if (group === UNIT_GROUPS.pmi) {
      // The loan the premium is measured against — undefined until the price and the down payment
      // both resolve, in whichever unit the down payment is currently using.
      const downRaw = raw('downPayment').trim();
      const down = downRaw === '' ? 0 : Number(downRaw);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(down)) return;
      const downDollars = dollarsOf(price, down, activeUnit(root, UNIT_GROUPS.downPayment, 'amount'));
      if (downDollars < 0 || downDollars > price) return; // an out-of-range entry: no defined loan
      apply('pmiAnnualRate', price - downDollars);
      return;
    }
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

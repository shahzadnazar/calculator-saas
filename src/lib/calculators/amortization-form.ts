/**
 * Amortization form binding — validation, the complete-result guard and presentation.
 * The pure model lives in `./amortization`.
 *
 * REQUIRED vs OPTIONAL. Three fields are required: the loan amount, the interest rate
 * and a term of at least one month. Everything under "make extra payments" is
 * optional and off by default, so an untouched form produces the ordinary loan and
 * the extras panel never appears. The extras' dates are optional too — a blank date
 * means "from the first payment" rather than an error.
 *
 * TERM. Years and months are two boxes but one quantity, validated as one and
 * reported against the years box. The ceiling is 30 years, which is also what bounds
 * the monthly schedule to 360 rows.
 *
 * THE GUARD. `resultValue` returns a NaN sentinel unless the ENTIRE result
 * reconciles: every row's payment against its own principal and interest, the summed
 * principal and extra against the loan, the summed interest against the total, the
 * yearly rows against the monthly ones they collapse, and a final balance of zero.
 * A schedule that does not add up is never rendered.
 */
import {
  MAX_TERM_MONTHS,
  calculateAmortization,
  type AmortizationResult,
  type AmortizationRow,
  type ExtraPrincipal,
} from './amortization';
import {
  EXTRA_AMOUNT_MESSAGE,
  EXTRA_YEAR_MESSAGE,
  ONE_TIME_SLOTS,
  emptyOneTimeList,
  monthOffset,
  parseOptionalYear,
  type OneTimeValue,
} from './extra-payments';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
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

/** The term ceiling in whole years, and the monthly-row ceiling it guarantees. */
export const MAX_TERM_YEARS = 30;
export const MAX_MONTHLY_ROWS = MAX_TERM_MONTHS;

export { ONE_TIME_SLOTS, emptyOneTimeList, type OneTimeValue };

export interface AmortValues {
  amount: string;
  annualInterestRate: string;
  termYears: string;
  termMonths: string;
  /* ---- Optional extras. Every one is blank by default, so an ordinary loan is
     what an untouched form produces. ---- */
  startMonth: string;
  startYear: string;
  extraMonthlyAmount: string;
  extraMonthlyMonth: string;
  extraMonthlyYear: string;
  extraYearlyAmount: string;
  extraYearlyMonth: string;
  extraYearlyYear: string;
  /** Always ONE_TIME_SLOTS entries, mostly blank. */
  extraOneTime: OneTimeValue[];
}

export interface AmortComputed extends AmortizationResult {
  /** True when any extra actually applies — what the result reveals its extras panel on. */
  hasExtras: boolean;
}

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

/** Finite and at least zero. */
function parseNonNegative(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** A whole count of zero or more. Fractions are rejected, never rounded. */
function parseWholeCount(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return 'invalid';
  return n;
}

/** Blank means "none". Anything unparseable is still an error. */
function optional(raw: string, parse: (s: string) => NumParse, fallback = 0): NumParse {
  const parsed = parse(raw);
  return parsed === 'empty' ? fallback : parsed;
}

export const TERM_MESSAGE = 'Enter a loan term of at least one month.';
export const TERM_MAX_MESSAGE = `Enter a loan term of ${MAX_TERM_YEARS} years or less.`;

export function validateAmortizationValues(values: AmortValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const amount = parsePositive(values.amount);
  if (amount === 'empty') fieldErrors.amount = 'Enter a loan amount.';
  else if (amount === 'invalid') fieldErrors.amount = 'Enter a loan amount greater than zero.';

  const rate = parseNonNegative(values.annualInterestRate);
  if (rate === 'empty') fieldErrors.annualInterestRate = 'Enter an interest rate.';
  else if (rate === 'invalid')
    fieldErrors.annualInterestRate = 'Enter an interest rate of zero or more.';

  // The term is two boxes but one quantity. Each must parse on its own; then the pair
  // has to add up to something worth scheduling, reported against the years box.
  const years = optional(values.termYears, parseWholeCount);
  if (years === 'invalid') fieldErrors.termYears = 'Enter a whole number of years.';
  const months = optional(values.termMonths, parseWholeCount);
  if (months === 'invalid') fieldErrors.termMonths = 'Enter a whole number of months.';
  if (years !== 'invalid' && months !== 'invalid') {
    const total = (years as number) * 12 + (months as number);
    if (total < 1) fieldErrors.termYears = TERM_MESSAGE;
    else if (total > MAX_TERM_MONTHS) fieldErrors.termYears = TERM_MAX_MESSAGE;
  }

  // ---- The optional extras. All blank by default, so an untouched form reaches
  // none of these branches. A date is optional: blank means "from the first payment".
  if (optional(values.startYear, parseOptionalYear) === 'invalid') {
    fieldErrors.startYear = EXTRA_YEAR_MESSAGE;
  }
  const checkExtra = (amountKey: string, yearKey: string, amountRaw: string, yearRaw: string) => {
    if (optional(amountRaw, parseNonNegative) === 'invalid') fieldErrors[amountKey] = EXTRA_AMOUNT_MESSAGE;
    if (optional(yearRaw, parseOptionalYear) === 'invalid') fieldErrors[yearKey] = EXTRA_YEAR_MESSAGE;
  };
  checkExtra('extraMonthlyAmount', 'extraMonthlyYear', values.extraMonthlyAmount, values.extraMonthlyYear);
  checkExtra('extraYearlyAmount', 'extraYearlyYear', values.extraYearlyAmount, values.extraYearlyYear);
  values.extraOneTime.forEach((row, i) => {
    checkExtra(`extraOneTime${i + 1}Amount`, `extraOneTime${i + 1}Year`, row.amount, row.year);
  });

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

/** Post-validation read: every branch here has already been proven parseable. */
const num = (raw: string, fallback = 0): number => {
  const t = raw.trim();
  return t === '' ? fallback : Number(t);
};

/** Today, as the base a blank start date falls back to. */
function defaultStart(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function computeAmortization(values: AmortValues): AmortComputed {
  const start = defaultStart();
  const startMonth = num(values.startMonth, start.month);
  const startYear = num(values.startYear, start.year);
  // A blank extra date means "from the first payment", which is offset 0.
  const at = (monthRaw: string, yearRaw: string): number =>
    monthRaw.trim() === '' && yearRaw.trim() === ''
      ? 0
      : monthOffset(startMonth, startYear, num(monthRaw, startMonth), num(yearRaw, startYear));

  const extraMonthly: ExtraPrincipal = {
    amount: num(values.extraMonthlyAmount),
    offset: at(values.extraMonthlyMonth, values.extraMonthlyYear),
  };
  const extraYearly: ExtraPrincipal = {
    amount: num(values.extraYearlyAmount),
    offset: at(values.extraYearlyMonth, values.extraYearlyYear),
  };
  const extraOneTime: ExtraPrincipal[] = values.extraOneTime
    .filter((row) => row.amount.trim() !== '')
    .map((row) => ({ amount: num(row.amount), offset: at(row.month, row.year) }));

  const result = calculateAmortization({
    amount: num(values.amount),
    annualRatePct: num(values.annualInterestRate),
    months: num(values.termYears) * 12 + num(values.termMonths),
    extraMonthly,
    extraYearly,
    extraOneTime,
  });

  return { ...result, hasExtras: result.totalExtra > 0 };
}

/* ------------------------------------------------------------------ */
/* The complete-result guard                                           */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN;
const ROW_SUM_TOL = 1e-6;
const ZERO_BAL_TOL = 1e-2;
const reconTol = (magnitude: number) => Math.max(1, Math.abs(magnitude) * 1e-6);

function rowsSound(rows: readonly AmortizationRow[], start: number): boolean {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.period !== start + i) return false; // no gaps, no reordering
    if (
      ![r.payment, r.principal, r.interest, r.extra, r.balance].every(
        (v) => Number.isFinite(v) && v >= 0,
      )
    ) {
      return false;
    }
  }
  return true;
}

export function completeResultValue(result: AmortComputed): number {
  const {
    monthlyPayment,
    loanAmount,
    totalInterest,
    totalExtra,
    totalOfPayments,
    payoffMonths,
    scheduledMonths,
    schedule,
    annual,
  } = result;

  // --- Summary ---
  if (![monthlyPayment, loanAmount, totalInterest, totalExtra, totalOfPayments].every(
    (v) => Number.isFinite(v) && v >= 0,
  )) {
    return FAIL;
  }
  if (!Number.isInteger(payoffMonths) || payoffMonths < 1 || payoffMonths > MAX_MONTHLY_ROWS) return FAIL;
  if (!Number.isInteger(scheduledMonths) || payoffMonths > scheduledMonths) return FAIL;
  // Everything paid out is the loan plus its interest — no more, no less.
  if (Math.abs(loanAmount + totalInterest - totalOfPayments) > reconTol(totalOfPayments)) return FAIL;

  // --- Monthly schedule ---
  if (!Array.isArray(schedule) || schedule.length !== payoffMonths) return FAIL;
  if (!rowsSound(schedule, 1)) return FAIL;

  let sumPrincipal = 0;
  let sumInterest = 0;
  let sumExtra = 0;
  for (const r of schedule) {
    if (Math.abs(r.payment - (r.principal + r.interest)) > ROW_SUM_TOL) return FAIL;
    sumPrincipal += r.principal;
    sumInterest += r.interest;
    sumExtra += r.extra;
  }
  // The loan is repaid by scheduled principal AND extra principal together.
  if (Math.abs(sumPrincipal + sumExtra - loanAmount) > reconTol(loanAmount)) return FAIL;
  if (Math.abs(sumInterest - totalInterest) > reconTol(totalInterest)) return FAIL;
  if (Math.abs(sumExtra - totalExtra) > reconTol(totalExtra)) return FAIL;
  if (Math.abs(schedule[schedule.length - 1].balance) > ZERO_BAL_TOL) return FAIL;

  // --- Yearly schedule ---
  if (!Array.isArray(annual) || annual.length < 1) return FAIL;
  if (annual.length !== Math.ceil(payoffMonths / 12)) return FAIL;
  let ySumPrincipal = 0;
  let ySumInterest = 0;
  let ySumExtra = 0;
  let monthsCounted = 0;
  for (let i = 0; i < annual.length; i++) {
    const y = annual[i];
    if (y.period !== i + 1) return FAIL;
    if (y.monthCount < 1 || y.monthCount > 12) return FAIL;
    if (![y.payment, y.principal, y.interest, y.extra, y.balance].every(
      (v) => Number.isFinite(v) && v >= 0,
    )) {
      return FAIL;
    }
    monthsCounted += y.monthCount;
    const closing = schedule[monthsCounted - 1];
    if (!closing || Math.abs(closing.balance - y.balance) > reconTol(y.balance)) return FAIL;
    ySumPrincipal += y.principal;
    ySumInterest += y.interest;
    ySumExtra += y.extra;
  }
  if (monthsCounted !== payoffMonths) return FAIL;
  if (Math.abs(ySumPrincipal - sumPrincipal) > reconTol(sumPrincipal)) return FAIL;
  if (Math.abs(ySumInterest - sumInterest) > reconTol(sumInterest)) return FAIL;
  if (Math.abs(ySumExtra - sumExtra) > reconTol(sumExtra)) return FAIL;

  // --- The extras comparison, when there is one ---
  if (result.hasExtras !== totalExtra > 0) return FAIL;
  if (result.hasExtras) {
    const plain = result.withoutExtras;
    if (!plain) return FAIL;
    if (![plain.totalInterest, plain.totalOfPayments].every((v) => Number.isFinite(v) && v >= 0)) return FAIL;
    // Paying more, sooner, can never cost more interest or take longer.
    if (result.interestSaved < -ROW_SUM_TOL || result.monthsSaved < 0) return FAIL;
    if (Math.abs(plain.totalInterest - totalInterest - result.interestSaved) > reconTol(totalInterest))
      return FAIL;
    if (plain.payoffMonths - payoffMonths !== result.monthsSaved) return FAIL;
  } else if (result.withoutExtras !== null || result.interestSaved !== 0 || result.monthsSaved !== 0) {
    return FAIL;
  }

  return monthlyPayment;
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

export function describeAmortizationResult(result: AmortComputed): string {
  return `Your monthly payment is ${spokenUSD(result.monthlyPayment)}.`;
}

/** "3 years 2 months", "7 months", "2 years" — never "0 years 0 months". */
export function formatMonths(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} year${y === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} month${m === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : '0 months';
}

const SCHEDULE = { prefix: 'am', format: formatCurrency };

/** Both views of one computed loan. Only the monthly view carries year dividers. */
function fillSchedules(scope: HTMLElement, result: AmortComputed): void {
  const toRows = (rows: readonly { period: number; interest: number; principal: number; extra: number; balance: number }[]): LoanScheduleRow[] =>
    rows.map((r) => ({ period: r.period, interest: r.interest, principal: r.principal, extra: r.extra, balance: r.balance }));
  fillLoanSchedule(scope.querySelector<HTMLElement>('[data-am-rows="yearly"]'), toRows(result.annual), SCHEDULE);
  fillLoanSchedule(scope.querySelector<HTMLElement>('[data-am-rows="monthly"]'), toRows(result.schedule), SCHEDULE, true);
}

/** The ring's spoken description — what a reader who cannot see it needs told. */
function donutLabel(result: AmortComputed): string {
  const p = share(result.loanAmount, result.totalOfPayments);
  const i = share(result.totalInterest, result.totalOfPayments);
  return (
    `Of ${formatCurrency(result.totalOfPayments)} paid in total, ` +
    `${formatCurrency(result.loanAmount)} (${percentLabel(p)}) is principal and ` +
    `${formatCurrency(result.totalInterest)} (${percentLabel(i)}) is interest.`
  );
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

/** Every field Reset clears. Expanded from ONE_TIME_SLOTS rather than listed by hand. */
const CLEARED_FIELDS = [
  'amount',
  'annualInterestRate',
  'termYears',
  'termMonths',
  'startMonth',
  'startYear',
  'extraMonthlyAmount',
  'extraMonthlyMonth',
  'extraMonthlyYear',
  'extraYearlyAmount',
  'extraYearlyMonth',
  'extraYearlyYear',
  ...Array.from({ length: ONE_TIME_SLOTS }, (_, i) => `extraOneTime${i + 1}Amount`),
  ...Array.from({ length: ONE_TIME_SLOTS }, (_, i) => `extraOneTime${i + 1}Month`),
  ...Array.from({ length: ONE_TIME_SLOTS }, (_, i) => `extraOneTime${i + 1}Year`),
];

export const amortizationBinding: FormCalculatorBinding<AmortValues, AmortComputed> = {
  readValues(root) {
    const read = (name: string) => field(root, name)?.value ?? '';
    return {
      amount: read('amount'),
      annualInterestRate: read('annualInterestRate'),
      termYears: read('termYears'),
      termMonths: read('termMonths'),
      startMonth: read('startMonth'),
      startYear: read('startYear'),
      extraMonthlyAmount: read('extraMonthlyAmount'),
      extraMonthlyMonth: read('extraMonthlyMonth'),
      extraMonthlyYear: read('extraMonthlyYear'),
      extraYearlyAmount: read('extraYearlyAmount'),
      extraYearlyMonth: read('extraYearlyMonth'),
      extraYearlyYear: read('extraYearlyYear'),
      // Always ONE_TIME_SLOTS rows, whether or not the markup rendered them all, so
      // validation and compute see a stable shape.
      extraOneTime: Array.from({ length: ONE_TIME_SLOTS }, (_, i) => ({
        amount: read(`extraOneTime${i + 1}Amount`),
        month: read(`extraOneTime${i + 1}Month`),
        year: read(`extraOneTime${i + 1}Year`),
      })),
    };
  },

  validate: validateAmortizationValues,

  compute: computeAmortization,

  resultValue: completeResultValue,

  describeResult: describeAmortizationResult,

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

    setText('[data-result-when~="valid"] [data-result-value]', formatCurrency(result.monthlyPayment));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(result.monthlyPayment));

    setText('[data-am-count-label]', `Total of ${result.payoffMonths} monthly payments`);
    setText('[data-am-total]', formatCurrency(result.totalOfPayments));
    setText('[data-am-interest]', formatCurrency(result.totalInterest));

    // The donut and its legend, both showing the same two shares.
    const charted = drawDonut(
      q('[data-am-donut]'),
      [
        { key: 'principal', value: result.loanAmount },
        { key: 'interest', value: result.totalInterest },
      ],
      { prefix: 'am', label: donutLabel(result) },
    );
    show('[data-am-donut-figure]', charted);
    if (charted) {
      const principalShare = share(result.loanAmount, result.totalOfPayments);
      const interestShare = share(result.totalInterest, result.totalOfPayments);
      setText('[data-am-share-principal]', percentLabel(principalShare));
      setText('[data-am-share-interest]', percentLabel(interestShare));
      setText('[data-am-share-principal-amt]', formatCurrencyRounded(result.loanAmount));
      setText('[data-am-share-interest-amt]', formatCurrencyRounded(result.totalInterest));
    }

    // The extras panel appears only when an extra payment actually applies.
    show('[data-am-extras]', result.hasExtras);
    if (result.hasExtras && result.withoutExtras) {
      setText('[data-am-extra-total]', formatCurrency(result.totalExtra));
      setText('[data-am-interest-saved]', formatCurrency(result.interestSaved));
      setText('[data-am-time-saved]', formatMonths(result.monthsSaved));
      setText('[data-am-payoff]', formatMonths(result.payoffMonths));
      setText('[data-am-interest-without]', formatCurrency(result.withoutExtras.totalInterest));
    }

    // The Extra column is only meaningful when something was paid into it.
    const schedule = scope.querySelector<HTMLElement>('[data-am-schedule]');
    if (schedule) schedule.toggleAttribute('data-am-has-extras', result.hasExtras);

    fillSchedules(scope, result);
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of CLEARED_FIELDS) {
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
 * arithmetic the calculator will do with their own numbers. No extras: the example
 * shows the ordinary loan, which is what the form itself produces untouched.
 */
export const AMORTIZATION_EXAMPLE_VALUES: AmortValues = {
  amount: '200000',
  annualInterestRate: '6',
  termYears: '15',
  termMonths: '0',
  startMonth: '',
  startYear: '',
  extraMonthlyAmount: '',
  extraMonthlyMonth: '',
  extraMonthlyYear: '',
  extraYearlyAmount: '',
  extraYearlyMonth: '',
  extraYearlyYear: '',
  extraOneTime: emptyOneTimeList(),
};

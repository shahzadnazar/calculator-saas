/**
 * Salary form binding — the reference's pay-schedule table, on the UNCHANGED standard-form
 * runtime.
 *
 * The visitor enters ONE figure at ONE frequency plus their working year, and gets every
 * other frequency back, twice: ignoring time off, and with holidays and vacation priced in.
 * All of the arithmetic lives in `computePaySchedule` (salary.ts, unit-tested); everything
 * here is at the VALIDATION / PRESENTATION boundary.
 *
 * `convertSalary` is deliberately untouched — it is frozen by salary.test.ts and still feeds
 * the salary-conversion reference table, which asks a simpler question than this one.
 *
 * Product decisions:
 *   • The pay AMOUNT starts EMPTY. The five schedule fields carry the reference's own
 *     documented assumptions (40 hours over 5 days, 10 holidays, 15 vacation days), which
 *     are OURS, not the visitor's figures, and are restored on Reset.
 *   • Strict validation, never `Number(v) || 0`. A $0 salary is a real answer; a negative one
 *     is a visitor error. Hours and days must be positive, days no more than seven, and the
 *     time off must leave at least one day of the year to work.
 *   • The dominant figure is the ADJUSTED annual salary — what the year actually pays once
 *     holidays and vacation are accounted for. The eight-by-two table is the breakdown.
 *   • No isUsableResult: the complete-result guard is `resultValue`, which returns a
 *     non-finite sentinel unless every one of the sixteen figures reconciles.
 */
import {
  WEEKS_PER_YEAR,
  computePaySchedule,
  type PayColumn,
  type PayFrequency,
  type PayScheduleResult,
} from './salary';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** The select, worded as the sentence reads it: "$50 per Hour". */
export const PAY_FREQUENCIES: { value: PayFrequency; label: string }[] = [
  { value: 'hourly', label: 'Hour' },
  { value: 'daily', label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'biweekly', label: 'Bi-week' },
  { value: 'semimonthly', label: 'Semi-month' },
  { value: 'monthly', label: 'Month' },
  { value: 'quarterly', label: 'Quarter' },
  { value: 'annual', label: 'Year' },
];
const VALID_FREQUENCIES = new Set<PayFrequency>(PAY_FREQUENCIES.map((f) => f.value));

/** The rows of the result table, in the reference's order. */
export const PAY_ROWS: { key: keyof PayColumn; label: string; cents: boolean }[] = [
  { key: 'hourly', label: 'Hourly', cents: true },
  { key: 'daily', label: 'Daily', cents: true },
  { key: 'weekly', label: 'Weekly', cents: false },
  { key: 'biweekly', label: 'Bi-weekly', cents: false },
  { key: 'semimonthly', label: 'Semi-monthly', cents: false },
  { key: 'monthly', label: 'Monthly', cents: false },
  { key: 'quarterly', label: 'Quarterly', cents: false },
  { key: 'annual', label: 'Annual', cents: false },
];

export const DEFAULT_FREQUENCY: PayFrequency = 'hourly';
export const DEFAULT_HOURS_PER_WEEK = '40';
export const DEFAULT_DAYS_PER_WEEK = '5';
export const DEFAULT_HOLIDAYS = '10';
export const DEFAULT_VACATION_DAYS = '15';

export interface SalaryValues {
  amount: string;
  frequency: PayFrequency;
  hoursPerWeek: string;
  daysPerWeek: string;
  holidaysPerYear: string;
  vacationDaysPerYear: string;
}

export interface SalaryComputed extends PayScheduleResult {
  amount: number;
  frequency: PayFrequency;
  hoursPerWeek: number;
  daysPerWeek: number;
  holidaysPerYear: number;
  vacationDaysPerYear: number;
}

export const MSG = {
  amountRequired: 'Enter a salary amount.',
  amountInvalid: 'Enter a salary amount of zero or more.',
  hoursRequired: 'Enter the hours worked per week.',
  hoursInvalid: 'Enter hours per week greater than zero.',
  daysRequired: 'Enter the days worked per week.',
  daysInvalid: 'Enter between one and seven days per week.',
  holidaysRequired: 'Enter the holidays per year.',
  holidaysInvalid: 'Enter zero holidays or more.',
  vacationRequired: 'Enter the vacation days per year.',
  vacationInvalid: 'Enter zero vacation days or more.',
  noDaysLeft: 'Holidays and vacation days together leave no working days in the year.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — strict, never Number(v) || 0          */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Finite and >= 0; empty is distinct from invalid. Zero valid, negative rejected. */
export function parseNonNegative(raw: string): NumParse {
  const t = (raw ?? '').trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/** Finite and > 0, optionally capped. Decimals allowed — a 37.5-hour week is a real week. */
export function parsePositive(raw: string, max?: number): NumParse {
  const t = (raw ?? '').trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  if (max !== undefined && n > max) return 'invalid';
  return n;
}

export function validateSalaryValues(v: SalaryValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const amount = parseNonNegative(v.amount);
  if (amount === 'empty') fieldErrors.amount = MSG.amountRequired;
  else if (amount === 'invalid') fieldErrors.amount = MSG.amountInvalid;

  const hours = parsePositive(v.hoursPerWeek);
  if (hours === 'empty') fieldErrors.hoursPerWeek = MSG.hoursRequired;
  else if (hours === 'invalid') fieldErrors.hoursPerWeek = MSG.hoursInvalid;

  const days = parsePositive(v.daysPerWeek, 7);
  if (days === 'empty') fieldErrors.daysPerWeek = MSG.daysRequired;
  else if (days === 'invalid') fieldErrors.daysPerWeek = MSG.daysInvalid;

  const holidays = parseNonNegative(v.holidaysPerYear);
  if (holidays === 'empty') fieldErrors.holidaysPerYear = MSG.holidaysRequired;
  else if (holidays === 'invalid') fieldErrors.holidaysPerYear = MSG.holidaysInvalid;

  const vacation = parseNonNegative(v.vacationDaysPerYear);
  if (vacation === 'empty') fieldErrors.vacationDaysPerYear = MSG.vacationRequired;
  else if (vacation === 'invalid') fieldErrors.vacationDaysPerYear = MSG.vacationInvalid;

  // Only worth asking once the three numbers it needs are all real.
  if (typeof days === 'number' && typeof holidays === 'number' && typeof vacation === 'number') {
    if (holidays + vacation >= WEEKS_PER_YEAR * days) {
      return { ok: false, fieldErrors, formError: MSG.noDaysLeft };
    }
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export function computeSalary(v: SalaryValues): SalaryComputed {
  const amount = Number(v.amount);
  const hoursPerWeek = Number(v.hoursPerWeek);
  const daysPerWeek = Number(v.daysPerWeek);
  const holidaysPerYear = Number(v.holidaysPerYear);
  const vacationDaysPerYear = Number(v.vacationDaysPerYear);
  const r = computePaySchedule({
    amount,
    frequency: v.frequency,
    hoursPerWeek,
    daysPerWeek,
    holidaysPerYear,
    vacationDaysPerYear,
  });
  return { ...r, amount, frequency: v.frequency, hoursPerWeek, daysPerWeek, holidaysPerYear, vacationDaysPerYear };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure)                                        */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN;

/**
 * The adjusted annual salary — but only when the WHOLE table holds up. Sixteen numbers are
 * about to go on screen; one of them being NaN while the headline looks fine is exactly the
 * failure this gate exists to stop.
 */
export function completeSalaryValue(r: SalaryComputed): number {
  if (r.unsolvable) return FAIL;
  if (!VALID_FREQUENCIES.has(r.frequency)) return FAIL;
  if (!Number.isFinite(r.amount) || r.amount < 0) return FAIL;
  if (!(r.hoursPerWeek > 0) || !(r.daysPerWeek > 0)) return FAIL;
  if (!(r.paidDaysPerYear > 0)) return FAIL;

  for (const col of [r.unadjusted, r.adjusted]) {
    for (const { key } of PAY_ROWS) {
      const v = col[key];
      if (!Number.isFinite(v) || v < 0) return FAIL;
    }
  }
  // Time off can never make the year pay more than ignoring it would.
  if (r.adjusted.annual > r.unadjusted.annual + 1e-9) return FAIL;
  return r.adjusted.annual;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** Rates carry cents; the longer periods are whole dollars, as the reference prints them. */
export function formatPay(value: number, cents: boolean): string {
  if (!Number.isFinite(value)) return '—';
  return cents ? formatCurrency(value) : formatCurrencyRounded(value);
}

/** "10 days", "1 day". */
function days(n: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)} ${n === 1 ? 'day' : 'days'}`;
}

export function interpretSalary(r: SalaryComputed): string {
  const off = r.holidaysPerYear + r.vacationDaysPerYear;
  if (off === 0) {
    return `Over ${days(r.workDaysPerYear)} of work a year with no holidays or vacation, that is ${formatCurrencyRounded(r.adjusted.annual)} a year.`;
  }
  return `${days(off)} of holidays and vacation leave ${days(r.paidDaysPerYear)} worked out of ${days(r.workDaysPerYear)}, so the year pays ${formatCurrencyRounded(r.adjusted.annual)} rather than ${formatCurrencyRounded(r.unadjusted.annual)}.`;
}

export function describeSalaryResult(r: SalaryComputed): string {
  return `Adjusted annual salary: ${formatCurrencyRounded(r.adjusted.annual)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

const readFrequency = (root: HTMLElement): PayFrequency => {
  const v = control(root, 'frequency')?.value as PayFrequency | undefined;
  return v && VALID_FREQUENCIES.has(v) ? v : DEFAULT_FREQUENCY;
};

export const salaryBinding: FormCalculatorBinding<SalaryValues, SalaryComputed> = {
  readValues(root) {
    return {
      amount: control(root, 'amount')?.value ?? '',
      frequency: readFrequency(root),
      hoursPerWeek: control(root, 'hoursPerWeek')?.value ?? '',
      daysPerWeek: control(root, 'daysPerWeek')?.value ?? '',
      holidaysPerYear: control(root, 'holidaysPerYear')?.value ?? '',
      vacationDaysPerYear: control(root, 'vacationDaysPerYear')?.value ?? '',
    };
  },

  validate: validateSalaryValues,

  compute: computeSalary,

  resultValue: completeSalaryValue,

  describeResult: describeSalaryResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };

    const headline = formatCurrencyRounded(result.adjusted.annual);
    set('[data-result-when~="valid"] [data-result-value]', headline);
    set('[data-result-when~="valid"] [data-result-value-a11y]', headline);
    set('[data-sal-interpretation]', interpretSalary(result));

    for (const { key, cents } of PAY_ROWS) {
      set(`[data-sal-unadjusted="${key}"]`, formatPay(result.unadjusted[key], cents));
      set(`[data-sal-adjusted="${key}"]`, formatPay(result.adjusted[key], cents));
    }
  },

  resetValues(root, _mode: ResetMode) {
    const set = (name: string, val: string) => {
      const el = control(root, name);
      if (el) el.value = val;
    };
    set('amount', '');
    set('frequency', DEFAULT_FREQUENCY);
    set('hoursPerWeek', DEFAULT_HOURS_PER_WEEK);
    set('daysPerWeek', DEFAULT_DAYS_PER_WEEK);
    set('holidaysPerYear', DEFAULT_HOLIDAYS);
    set('vacationDaysPerYear', DEFAULT_VACATION_DAYS);
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/** The reference's own case, so the panel opens on a figure anyone can check. */
export const SALARY_EXAMPLE_VALUES: SalaryValues = {
  amount: '50',
  frequency: 'hourly',
  hoursPerWeek: DEFAULT_HOURS_PER_WEEK,
  daysPerWeek: DEFAULT_DAYS_PER_WEEK,
  holidaysPerYear: DEFAULT_HOLIDAYS,
  vacationDaysPerYear: DEFAULT_VACATION_DAYS,
};

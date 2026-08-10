/**
 * Salary form binding (R19A1 — task-first Salary migration; calculator-OWNED binding on the UNCHANGED
 * standard-form runtime).
 *
 * Wraps the UNCHANGED `convertSalary` (frozen by salary.test.ts) — a pure pay-period converter that
 * normalises any one figure to an annual total and derives the six equivalents. Everything here is at
 * the VALIDATION / PRESENTATION boundary; no conversion math is reimplemented, salary.ts is untouched
 * (so `referenceTables.ts` → the salary-conversion-table reference page stay behaviourally unchanged),
 * and there is no shared Finance engine involved (Salary has no dependency on the compound-interest /
 * interest cluster).
 *
 * Product decisions (R19A1):
 *   • Task-first: the pay AMOUNT starts EMPTY; the pay unit defaults to hourly (the legacy default and
 *     the "hourly to salary" headline use case); the three schedule assumptions keep their structural
 *     defaults (40 hrs / 5 days / 52 weeks, restored on Reset); the result is EMPTY, and the visitor
 *     presses Convert for the first result (live-after-first).
 *   • Strict validation — NEVER `Number(value) || 0`. Amount required, finite and >= 0 (a nonsensical
 *     NEGATIVE salary is a visitor error even though the frozen formula still computes negatives —
 *     UI policy only, the formula is untouched); a valid $0 is a real result, not an absent one. The
 *     three assumptions are required, finite and > 0 (a positive schedule; decimals like 37.5 hrs are
 *     allowed — the geometry-dimension precedent; no invented upper cap).
 *   • Result: the ANNUAL salary is the dominant primary; monthly / biweekly / weekly / daily / hourly
 *     are supporting — ALL from the single frozen SalaryResult (no duplicated conversion).
 *   • NO isUsableResult — the complete-result guard lives in resultValue (a finite ANNUAL sentinel),
 *     reconciling every displayed field via a convertSalary recompute; a valid $0 annual is the finite
 *     0 the runtime's default gate accepts.
 */
import { convertSalary, type PayUnit, type SalaryResult } from './salary';
import { formatCurrency } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export const PAY_UNITS: { value: PayUnit; label: string }[] = [
  { value: 'hourly', label: 'per hour' },
  { value: 'daily', label: 'per day' },
  { value: 'weekly', label: 'per week' },
  { value: 'biweekly', label: 'biweekly' },
  { value: 'monthly', label: 'per month' },
  { value: 'annual', label: 'per year' },
];
const VALID_UNITS = new Set<PayUnit>(PAY_UNITS.map((u) => u.value));

export const DEFAULT_UNIT: PayUnit = 'hourly';
export const DEFAULT_HOURS_PER_WEEK = '40';
export const DEFAULT_DAYS_PER_WEEK = '5';
export const DEFAULT_WEEKS_PER_YEAR = '52';

export interface SalaryValues {
  amount: string;
  unit: PayUnit;
  hoursPerWeek: string;
  daysPerWeek: string;
  weeksPerYear: string;
}

export interface SalaryComputed extends SalaryResult {
  unit: PayUnit;
  amount: number;
  hoursPerWeek: number;
  daysPerWeek: number;
  weeksPerYear: number;
}

export const MSG = {
  amountRequired: 'Enter a pay amount.',
  amountInvalid: 'Enter a pay amount of zero or more.',
  hoursRequired: 'Enter the hours worked per week.',
  hoursInvalid: 'Enter hours per week greater than zero.',
  daysRequired: 'Enter the days worked per week.',
  daysInvalid: 'Enter days per week greater than zero.',
  weeksRequired: 'Enter the weeks worked per year.',
  weeksInvalid: 'Enter weeks per year greater than zero.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — strict, never Number(v) || 0          */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;
/** A finite amount >= 0; empty is distinct from invalid. Zero valid; negative rejected (UI policy). */
export function parseAmount(raw: string): NumParse {
  const t = (raw ?? '').trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}
/** A finite schedule assumption > 0 (decimals allowed; no upper cap). */
export function parsePositive(raw: string): NumParse {
  const t = (raw ?? '').trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

export function validateSalaryValues(v: SalaryValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const amount = parseAmount(v.amount);
  if (amount === 'empty') fieldErrors.amount = MSG.amountRequired;
  else if (amount === 'invalid') fieldErrors.amount = MSG.amountInvalid;

  const checks: [keyof SalaryValues, string, string][] = [
    ['hoursPerWeek', MSG.hoursRequired, MSG.hoursInvalid],
    ['daysPerWeek', MSG.daysRequired, MSG.daysInvalid],
    ['weeksPerYear', MSG.weeksRequired, MSG.weeksInvalid],
  ];
  for (const [name, req, inv] of checks) {
    const p = parsePositive(v[name] as string);
    if (p === 'empty') fieldErrors[name] = req;
    else if (p === 'invalid') fieldErrors[name] = inv;
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — pass-through to the frozen source              */
/* ------------------------------------------------------------------ */

export function computeSalary(v: SalaryValues): SalaryComputed {
  const amount = Number(v.amount);
  const hoursPerWeek = Number(v.hoursPerWeek);
  const daysPerWeek = Number(v.daysPerWeek);
  const weeksPerYear = Number(v.weeksPerYear);
  const r = convertSalary({ amount, unit: v.unit, hoursPerWeek, daysPerWeek, weeksPerYear });
  return { ...r, unit: v.unit, amount, hoursPerWeek, daysPerWeek, weeksPerYear };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN; // non-finite sentinel → the runtime's default finite gate rejects the result

/** The ANNUAL figure — but ONLY when the whole result is coherent: a known unit, a finite non-negative
 *  amount, positive assumptions, every one of the six equivalents finite, and a convertSalary recompute
 *  reproducing them. A valid $0 (amount 0) is a finite annual 0 the default gate accepts. */
export function completeSalaryValue(r: SalaryComputed): number {
  if (!VALID_UNITS.has(r.unit)) return FAIL;
  if (!Number.isFinite(r.amount) || r.amount < 0) return FAIL;
  if (!(r.hoursPerWeek > 0) || !(r.daysPerWeek > 0) || !(r.weeksPerYear > 0)) return FAIL;

  const fields: number[] = [r.hourly, r.daily, r.weekly, r.biweekly, r.monthly, r.annual];
  if (!fields.every((n) => Number.isFinite(n))) return FAIL;

  const c = convertSalary({
    amount: r.amount,
    unit: r.unit,
    hoursPerWeek: r.hoursPerWeek,
    daysPerWeek: r.daysPerWeek,
    weeksPerYear: r.weeksPerYear,
  });
  if (
    c.hourly !== r.hourly ||
    c.daily !== r.daily ||
    c.weekly !== r.weekly ||
    c.biweekly !== r.biweekly ||
    c.monthly !== r.monthly ||
    c.annual !== r.annual
  ) {
    return FAIL;
  }
  return r.annual; // finite; a valid $0 annual is the finite 0 the default gate accepts
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** The supporting equivalents, in scan order beneath the dominant annual figure. */
export const SUPPORTING: { key: keyof SalaryResult; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'biweekly', label: 'Biweekly' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'daily', label: 'Daily' },
  { key: 'hourly', label: 'Hourly' },
];

/** Concise announcement — the dominant annual figure only. A valid $0 announces normally. */
export function describeSalaryResult(r: SalaryComputed): string {
  return `Annual salary: ${formatCurrency(r.annual)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

const readUnit = (root: HTMLElement): PayUnit => {
  const v = control(root, 'unit')?.value as PayUnit | undefined;
  return v && VALID_UNITS.has(v) ? v : DEFAULT_UNIT;
};

export const salaryBinding: FormCalculatorBinding<SalaryValues, SalaryComputed> = {
  readValues(root) {
    return {
      amount: control(root, 'amount')?.value ?? '',
      unit: readUnit(root),
      hoursPerWeek: control(root, 'hoursPerWeek')?.value ?? '',
      daysPerWeek: control(root, 'daysPerWeek')?.value ?? '',
      weeksPerYear: control(root, 'weeksPerYear')?.value ?? '',
    };
  },

  validate: validateSalaryValues,

  compute: computeSalary,

  /** Complete-result guard as the ordinary result value — no isUsableResult. */
  resultValue: completeSalaryValue,

  describeResult: describeSalaryResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    // Dominant: the annual salary (shown + spoken).
    const annual = formatCurrency(result.annual);
    set('[data-result-when~="valid"] [data-result-value]', annual);
    set('[data-result-when~="valid"] [data-result-value-a11y]', annual);
    // Supporting equivalents — every value from the single frozen SalaryResult.
    for (const { key } of SUPPORTING) {
      set(`[data-sal-${key}]`, formatCurrency(result[key]));
    }
  },

  resetValues(root, _mode: ResetMode) {
    const set = (name: string, val: string) => {
      const el = control(root, name);
      if (el) el.value = val;
    };
    set('amount', '');
    set('unit', DEFAULT_UNIT);
    set('hoursPerWeek', DEFAULT_HOURS_PER_WEEK);
    set('daysPerWeek', DEFAULT_DAYS_PER_WEEK);
    set('weeksPerYear', DEFAULT_WEEKS_PER_YEAR);
  },
};

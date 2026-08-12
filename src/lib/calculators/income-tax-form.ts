/**
 * Income-tax form binding (R18B1 — standard-form wave; product family COMPLEX-FORM with a
 * multi-mode FILING-STATUS selector, on the standard-form runtime UNCHANGED).
 *
 * Income Tax has two filing statuses — single / married-filing-jointly — a STRUCTURAL
 * selector (same two money fields, same {taxableIncome, tax, afterTax, effectiveRate,
 * marginalRate} shape; only the bracket table + standard deduction change, and the
 * dominant result — estimated tax — is the SAME field in both, so this is even simpler
 * than sales-tax whose dominant field flips by mode). The runtime already recomputes on
 * a structural radio change; this binding owns the income-tax specifics: reading the
 * filing status, strict visitor parsing of gross income + optional pre-tax deductions,
 * validation, invoking calculateIncomeTax UNCHANGED, a complete-result guard, a concise
 * USD announcement, and clearing the money fields on reset. The island owns the visible
 * status control + the standard-deduction note.
 *
 * The pure calculateIncomeTax / STANDARD_DEDUCTION are UNCHANGED and frozen by the
 * characterization suite (income-tax.test.ts). Everything added here is at the
 * VALIDATION / PRESENTATION boundary: gross income is required, finite and >= 0 (an
 * entered 0 is a VALID result); additional deductions are optional (empty = a verified
 * 0), finite and >= 0 — never `Number(value) || 0`. NO isUsableResult: the complete-
 * result guard lives in resultValue (tax when the whole result reconciles against the
 * frozen source, else NaN → the runtime's default finite gate). The bracket arithmetic
 * is NEVER reproduced here — the guard recomputes by calling the frozen source again.
 */
import { calculateIncomeTax, type FilingStatus, type IncomeTaxResult } from './income-tax';
import { formatCurrency, formatPercent } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export const FILING_STATUSES: readonly FilingStatus[] = ['single', 'married'];
export const DEFAULT_FILING_STATUS: FilingStatus = 'single';

export function isFilingStatus(value: string): value is FilingStatus {
  return (FILING_STATUSES as readonly string[]).includes(value);
}

const STATUS_LABEL: Record<FilingStatus, string> = {
  single: 'Single',
  married: 'Married filing jointly',
};

export interface IncomeTaxValues {
  filingStatus: string; // raw radio value (may be unsupported until validated)
  grossIncome: string;
  additionalDeductions: string;
}

export interface IncomeTaxComputed extends IncomeTaxResult {
  filingStatus: FilingStatus;
  grossIncome: number;
  additionalDeductions: number;
}

export const MSG = {
  statusInvalid: 'Choose a filing status.',
  incomeRequired: 'Enter your gross annual income.',
  incomeInvalid: 'Enter an income of zero or more.',
  deductionInvalid: 'Enter a deduction of zero or more.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type NonNegParse = 'empty' | 'invalid' | number;
/** Parse a finite, non-negative number; empty is distinct from invalid. An entered 0
 *  is valid ($0 income, or 0 extra deductions). Decimals (cents) are preserved — the
 *  frozen source accepts them. Never `Number(value) || 0`, never `parseInt`. */
function parseNonNegative(raw: string): NonNegParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/**
 * Validate income-tax values. Filing status must be a supported identifier (form-level).
 * Gross income is required, finite and >= 0 (0 is valid). Additional deductions are
 * optional (empty is a verified neutral 0), otherwise finite and >= 0. No upper income
 * limit is imposed.
 */
export function validateIncomeTaxValues(values: IncomeTaxValues): ValidationResult {
  if (!isFilingStatus(values.filingStatus)) return { ok: false, formError: MSG.statusInvalid };

  const fieldErrors: Record<string, string> = {};

  const income = parseNonNegative(values.grossIncome);
  if (income === 'empty') fieldErrors.grossIncome = MSG.incomeRequired;
  else if (income === 'invalid') fieldErrors.grossIncome = MSG.incomeInvalid;

  // Additional deductions are OPTIONAL: empty is a verified neutral 0; only a present,
  // malformed / negative value is rejected.
  const deduction = parseNonNegative(values.additionalDeductions);
  if (deduction === 'invalid') fieldErrors.additionalDeductions = MSG.deductionInvalid;

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation + complete-result guard + description (pure)            */
/* ------------------------------------------------------------------ */

export function computeIncomeTax(values: IncomeTaxValues): IncomeTaxComputed {
  const filingStatus = isFilingStatus(values.filingStatus) ? values.filingStatus : DEFAULT_FILING_STATUS;
  const grossIncome = Number(values.grossIncome);
  const additionalDeductions = values.additionalDeductions.trim() === '' ? 0 : Number(values.additionalDeductions);
  const base = calculateIncomeTax({ grossIncome, filingStatus, additionalDeductions });
  return { ...base, filingStatus, grossIncome, additionalDeductions };
}

const CONSIST_TOL = 1e-6;
const close = (a: number, b: number) => Math.abs(a - b) <= CONSIST_TOL;

/**
 * A complete, trustworthy income-tax result: the visitor inputs sit inside the supported
 * domain, every result figure is finite (taxable / tax non-negative, zero tax accepted),
 * and the WHOLE result reconciles against the frozen source recomputed from the same
 * inputs — so a tampered result object is rejected and the tax never exceeds what the
 * source reports. The bracket arithmetic is never rebuilt here; the reconciliation calls
 * calculateIncomeTax again.
 */
export function isCompleteIncomeTax(r: IncomeTaxComputed): boolean {
  if (!isFilingStatus(r.filingStatus)) return false;
  if (!Number.isFinite(r.grossIncome) || r.grossIncome < 0) return false;
  if (!Number.isFinite(r.additionalDeductions) || r.additionalDeductions < 0) return false;
  if (![r.taxableIncome, r.tax, r.afterTax, r.effectiveRate, r.marginalRate].every(Number.isFinite)) return false;
  if (r.taxableIncome < 0 || r.tax < 0) return false;

  const check = calculateIncomeTax({
    grossIncome: r.grossIncome,
    filingStatus: r.filingStatus,
    additionalDeductions: r.additionalDeductions,
  });
  return (
    close(check.taxableIncome, r.taxableIncome) &&
    close(check.tax, r.tax) &&
    close(check.afterTax, r.afterTax) &&
    close(check.effectiveRate, r.effectiveRate) &&
    close(check.marginalRate, r.marginalRate) &&
    r.tax <= check.tax + CONSIST_TOL // tax never exceeds the frozen-source figure
  );
}

/** Concise announcement — the dominant estimated-tax figure only. A valid $0 tax is
 *  announced as a normal result (never treated as empty). */
export function describeIncomeTax(result: IncomeTaxComputed): string {
  return `Estimated income tax: ${formatCurrency(result.tax)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const readFilingStatus = (root: HTMLElement): string =>
  root.querySelector<HTMLInputElement>('[name="filingStatus"]:checked')?.value ?? '';

export const incomeTaxBinding: FormCalculatorBinding<IncomeTaxValues, IncomeTaxComputed> = {
  readValues(root) {
    return {
      filingStatus: readFilingStatus(root),
      grossIncome: input(root, 'grossIncome')?.value ?? '',
      additionalDeductions: input(root, 'additionalDeductions')?.value ?? '',
    };
  },

  validate: validateIncomeTaxValues,

  compute: computeIncomeTax,

  /** Guarded primary magnitude — the estimated tax; NaN when the result is not a
   *  complete, reconciled figure, so the runtime never surfaces it. NO isUsableResult. */
  resultValue(result) {
    return isCompleteIncomeTax(result) ? result.tax : Number.NaN;
  },

  describeResult: describeIncomeTax,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const set = (sel: string, v: string) => {
      const el = q(sel);
      if (el) el.textContent = v;
    };

    // Primary: the estimated tax (the label is fixed in the island markup).
    set('[data-result-when~="valid"] [data-result-value]', formatCurrency(result.tax));
    set('[data-result-when~="valid"] [data-result-value-a11y]', formatCurrency(result.tax));

    // Interpretation: the marginal-vs-effective story on the entered income.
    const interp = q('[data-it-interpretation]');
    if (interp) {
      interp.textContent =
        `On ${formatCurrency(result.grossIncome)} of gross income (${STATUS_LABEL[result.filingStatus]}), ` +
        `${formatCurrency(result.taxableIncome)} is taxable — a ${formatPercent(result.marginalRate, 0)} marginal ` +
        `rate and a ${formatPercent(result.effectiveRate, 1)} effective rate.`;
    }

    // Supporting metrics.
    set('[data-it-taxable]', formatCurrency(result.taxableIncome));
    set('[data-it-after]', formatCurrency(result.afterTax));
    set('[data-it-eff]', formatPercent(result.effectiveRate, 1));
    set('[data-it-marg]', formatPercent(result.marginalRate, 0));
  },

  resetValues(root, _mode: ResetMode) {
    // The island restores the default (single) filing status + the deduction note;
    // the binding clears the money fields.
    for (const name of ['grossIncome', 'additionalDeductions']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};

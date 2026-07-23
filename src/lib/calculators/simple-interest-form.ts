/**
 * Simple-interest form binding (R9A1 — standard-form wave, calculator #17; product family
 * FINANCE-SIMPLE, on the standard-form runtime UNCHANGED — no `isUsableResult`).
 *
 * Single mode, no structural selectors: principal + annual rate + years → interest earned
 * (dominant) and total amount (secondary). The pure `calculateSimpleInterest` (I = P·r·t) is
 * UNCHANGED and frozen by simple-interest.test.ts; everything here is at the VALIDATION /
 * PRESENTATION boundary. Product decisions (R9A1):
 *   • Principal, annual rate and time are ALL required, finite and ≥ 0 — an explicit 0 is a
 *     valid entry (empty is not). Negative and non-finite inputs are rejected at validation,
 *     so the tolerant legacy formula (which clamps a negative principal but passes a negative
 *     rate/years through) is never reached with them.
 *   • Time is in years and may be fractional (no whole-year / half-year / ≥ 1 requirement).
 *   • Interest earned is the DOMINANT result; the total amount is secondary. Both are finite
 *     and ≥ 0 for the validated domain, so the runtime's default finite gate suffices and
 *     `isUsableResult` is NOT implemented.
 *   • USD only — the amount is US dollars; the announcement is spoken in dollars/cents.
 */
import { calculateSimpleInterest } from './simple-interest';
import { formatCurrency, formatPercent } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export interface SimpleInterestValues {
  principal: string;
  annualRatePct: string;
  years: string;
}

/** Structured result — carries the validated inputs so presentation can build the
 *  interpretation without re-reading the DOM. Always finite for the validated domain. */
export interface SimpleInterestComputed {
  principal: number;
  annualRatePct: number;
  years: number;
  interest: number;
  total: number;
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** Finite and >= 0. An explicit 0 is valid; empty and negative / non-finite are not. */
function parseNonNegative(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

/**
 * Validate simple-interest values. Principal (>= 0), annual rate (>= 0) and time in years
 * (>= 0, fractional allowed) are all required. Distinguishes an empty field from an entered 0.
 */
export function validateSimpleInterestValues(values: SimpleInterestValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const principal = parseNonNegative(values.principal);
  if (principal === 'empty') fieldErrors.principal = 'Enter a principal amount.';
  else if (principal === 'invalid') fieldErrors.principal = 'Enter a principal amount of zero or more.';

  const rate = parseNonNegative(values.annualRatePct);
  if (rate === 'empty') fieldErrors.annualRatePct = 'Enter an annual interest rate.';
  else if (rate === 'invalid') fieldErrors.annualRatePct = 'Enter an annual interest rate of zero or more.';

  const years = parseNonNegative(values.years);
  if (years === 'empty') fieldErrors.years = 'Enter a time period in years.';
  else if (years === 'invalid') fieldErrors.years = 'Enter a time period of zero years or more.';

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export function computeSimpleInterest(values: SimpleInterestValues): SimpleInterestComputed {
  const principal = Number(values.principal);
  const annualRatePct = Number(values.annualRatePct);
  const years = Number(values.years);
  const { interest, total } = calculateSimpleInterest({ principal, annualRatePct, years });
  return { principal, annualRatePct, years, interest, total };
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** A USD amount in spoken form, e.g. "750 dollars", "103 dollars and 33 cents". */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

/** "3 years", "1 year", "1.5 years", "0 years" — singular only for exactly one year. */
export function yearsPhrase(years: number): string {
  const n = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(years);
  return `${n} ${years === 1 ? 'year' : 'years'}`;
}

/** The plain-language interpretation under the value. Zero rate, zero duration and zero
 *  principal each get a clarifying line; otherwise it restates the earned interest. */
export function interpretSimpleInterest(r: SimpleInterestComputed): string {
  if (r.years === 0) {
    return `Over ${yearsPhrase(0)}, no interest accrues, so the total stays at the principal of ${formatCurrency(r.principal)}.`;
  }
  if (r.annualRatePct === 0) {
    return `At a 0% rate, no interest accrues, so the total stays at the principal of ${formatCurrency(r.principal)}.`;
  }
  if (r.principal === 0) {
    return `With a principal of ${formatCurrency(0)}, there is no balance to earn interest, so the interest is ${formatCurrency(0)}.`;
  }
  return `At ${formatPercent(r.annualRatePct)} simple interest for ${yearsPhrase(r.years)}, the interest earned is ${formatCurrency(r.interest)}.`;
}

/** Concise announcement — the dominant result (interest earned) only. */
export function describeSimpleInterestResult(result: SimpleInterestComputed): string {
  return `Your simple interest is ${spokenUSD(result.interest)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const simpleInterestBinding: FormCalculatorBinding<SimpleInterestValues, SimpleInterestComputed> = {
  readValues(root) {
    return {
      principal: input(root, 'principal')?.value ?? '',
      annualRatePct: input(root, 'annualRatePct')?.value ?? '',
      years: input(root, 'years')?.value ?? '',
    };
  },

  validate: validateSimpleInterestValues,

  compute: computeSimpleInterest,

  /** Guarded magnitude — the dominant "interest earned". Always finite (and >= 0) for the
   *  validated domain, so the runtime's default finite gate accepts it; no `isUsableResult`. */
  resultValue(result) {
    return result.interest;
  },

  // No isUsableResult — Simple Interest has no impossible / non-finite outcome (R9A1 decision A).

  describeResult: describeSimpleInterestResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };

    const label = q('[data-result-when~="valid"] [data-result-summary-label]');
    if (label) label.textContent = 'Interest earned';
    setText('[data-result-when~="valid"] [data-result-value]', formatCurrency(result.interest));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(result.interest));
    setText('[data-si-interpretation]', interpretSimpleInterest(result));
    setText('[data-si-total]', formatCurrency(result.total));
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['principal', 'annualRatePct', 'years']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};

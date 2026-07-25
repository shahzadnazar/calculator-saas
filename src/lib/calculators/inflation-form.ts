/**
 * Inflation form binding (R9C1 — standard-form wave, calculator #19; product family
 * FINANCE-SIMPLE, on the standard-form runtime UNCHANGED — no `isUsableResult`).
 *
 * Single mode, no structural selectors. Amount + annual rate + years → projected future cost
 * (dominant) plus future buying power ($) and a signed cumulative price change (%). The pure
 * `adjustForInflation` is UNCHANGED and frozen by inflation.test.ts; everything here is at the
 * VALIDATION / PRESENTATION boundary. Product decisions (R9C1):
 *   • Amount required, finite, >= 0 (0 valid; empty and negative / non-finite invalid).
 *   • Annual rate required and finite, **strictly greater than -100** — a NEGATIVE rate is VALID
 *     deflation; `rate <= -100` (the non-finite cliff) and NaN/Infinity are rejected. No positive max.
 *   • Time in years required, finite, >= 0, fractional allowed.
 *   • Projected future cost is the DOMINANT result; future buying power ($) and cumulative price
 *     change (signed %) are the breakdown. Wording stays neutral for inflation AND deflation; a
 *     negative cumulative change is valid (never labelled an "increase").
 *   • USD only. The announcement speaks the dominant future cost in dollars/cents.
 *
 * `isUsableResult` is NOT implemented (R9A0 Decision A). Instead `resultValue` returns a non-finite
 * sentinel for any malformed output — a non-finite futureCost/buyingPower/pct, or a negative
 * currency — so the runtime's DEFAULT finite gate moves such a result to the invalid state. For the
 * validated domain this only ever fires on absurd overflow/underflow (e.g. a ~2000-year horizon that
 * underflows the factor to 0 → NaN buying power); every realistic entry passes.
 */
import { adjustForInflation } from './inflation';
import { formatCurrency, formatPercent } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export interface InflationValues {
  amount: string;
  annualRatePct: string;
  years: string;
}

/** Structured result — carries the validated inputs so presentation can build the (inflation vs
 *  deflation) interpretation without re-reading the DOM. */
export interface InflationComputed {
  amount: number;
  annualRatePct: number;
  years: number;
  futureCost: number;
  buyingPower: number;
  totalInflationPct: number;
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

/** Finite and strictly greater than -100. A negative rate is valid deflation; `<= -100` (the
 *  non-finite cliff) and NaN/Infinity are not. No positive maximum. */
function parseRateAboveMinus100(raw: string): NumParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= -100) return 'invalid';
  return n;
}

/** Validate inflation values. Amount (>= 0), annual rate (> -100) and years (>= 0, fractional
 *  allowed) are all required. Distinguishes an empty field from an entered 0. */
export function validateInflationValues(values: InflationValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const amount = parseNonNegative(values.amount);
  if (amount === 'empty') fieldErrors.amount = 'Enter an amount.';
  else if (amount === 'invalid') fieldErrors.amount = 'Enter an amount of zero or more.';

  const rate = parseRateAboveMinus100(values.annualRatePct);
  if (rate === 'empty') fieldErrors.annualRatePct = 'Enter an annual rate.';
  else if (rate === 'invalid') fieldErrors.annualRatePct = 'Enter an annual rate greater than -100%.';

  const years = parseNonNegative(values.years);
  if (years === 'empty') fieldErrors.years = 'Enter a time period in years.';
  else if (years === 'invalid') fieldErrors.years = 'Enter a time period of zero years or more.';

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export function computeInflation(values: InflationValues): InflationComputed {
  const amount = Number(values.amount);
  const annualRatePct = Number(values.annualRatePct);
  const years = Number(values.years);
  const r = adjustForInflation({ amount, annualRatePct, years });
  return { amount, annualRatePct, years, futureCost: r.futureCost, buyingPower: r.buyingPower, totalInflationPct: r.totalInflationPct };
}

/** Every rendered output must be finite; the two currency figures must be non-negative. A negative
 *  cumulative percentage (deflation) is fine. */
export function isInflationResultUsable(r: InflationComputed): boolean {
  if (![r.futureCost, r.buyingPower, r.totalInflationPct].every((v) => Number.isFinite(v))) return false;
  return r.futureCost >= 0 && r.buyingPower >= 0;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** A USD amount in spoken form, e.g. "134 dollars and 39 cents", "81 dollars". */
export function spokenUSD(value: number): string {
  const cents = Math.round(value * 100);
  const dollars = Math.floor(cents / 100);
  const rem = cents % 100;
  const d = `${dollars} dollar${dollars === 1 ? '' : 's'}`;
  return rem === 0 ? d : `${d} and ${rem} cent${rem === 1 ? '' : 's'}`;
}

/** "10 years", "1 year", "1.25 years", "0 years". */
export function yearsPhrase(years: number): string {
  const n = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(years);
  return `${n} ${years === 1 ? 'year' : 'years'}`;
}

/** Plain-language interpretation, neutral across inflation / deflation / no-change / zero amount. */
export function interpretInflation(r: InflationComputed): string {
  const yrs = yearsPhrase(r.years);
  if (r.amount === 0) {
    return `With a ${formatCurrency(0)} amount, the projected future cost is ${formatCurrency(0)}.`;
  }
  if (r.annualRatePct === 0 || r.years === 0) {
    return `With no price change over ${yrs}, the projected cost remains ${formatCurrency(r.amount)}.`;
  }
  if (r.annualRatePct > 0) {
    return `At an annual inflation rate of ${formatPercent(r.annualRatePct, 1)} for ${yrs}, an amount costing ${formatCurrency(r.amount)} today would cost approximately ${formatCurrency(r.futureCost)}.`;
  }
  return `At an annual deflation rate of ${formatPercent(Math.abs(r.annualRatePct), 1)} for ${yrs}, the projected cost decreases to approximately ${formatCurrency(r.futureCost)}.`;
}

/** Concise announcement — the dominant result (projected future cost) only. */
export function describeInflationResult(result: InflationComputed): string {
  return `The projected future cost is ${spokenUSD(result.futureCost)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const inflationBinding: FormCalculatorBinding<InflationValues, InflationComputed> = {
  readValues(root) {
    return {
      amount: input(root, 'amount')?.value ?? '',
      annualRatePct: input(root, 'annualRatePct')?.value ?? '',
      years: input(root, 'years')?.value ?? '',
    };
  },

  validate: validateInflationValues,

  compute: computeInflation,

  /** The guarded magnitude is the dominant future cost — but return a NON-FINITE sentinel for any
   *  malformed output (a non-finite figure or a negative currency) so the runtime's DEFAULT finite
   *  gate rejects it. This keeps `isUsableResult` unimplemented while still guarding all outputs. */
  resultValue(result) {
    return isInflationResultUsable(result) ? result.futureCost : NaN;
  },

  // No isUsableResult — the malformed-result guard lives in resultValue (R9C1 decision A).

  describeResult: describeInflationResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };

    const label = q('[data-result-when~="valid"] [data-result-summary-label]');
    if (label) label.textContent = 'Projected future cost';
    setText('[data-result-when~="valid"] [data-result-value]', formatCurrency(result.futureCost));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenUSD(result.futureCost));
    setText('[data-if-interpretation]', interpretInflation(result));
    setText('[data-if-power]', formatCurrency(result.buyingPower));
    setText('[data-if-change]', formatPercent(result.totalInflationPct, 1));
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['amount', 'annualRatePct', 'years']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};

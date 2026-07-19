/**
 * Percentage equation bindings (R3) — three INDEPENDENT equations bound to the
 * shared equation runtime. The pure parts (validators, describers) are unit
 * tested; the DOM parts (readOperands, renderResult, resetOperands) are
 * exercised end-to-end. All numeric work delegates to the reviewed pure
 * `percentOf` / `whatPercent` / `percentChange`.
 */
import { percentOf, whatPercent, percentChange } from './percent';
import { formatNumber } from '@lib/format';
import { accessibleResultName } from '@lib/result/state';
import type { EquationCalculatorBinding, EquationRenderContext, ValidationResult } from '@lib/result/equation-runtime';

const PERCENT_UNIT = '%';

/* ------------------------------------------------------------------ */
/* Parsing (explicit — never `Number(v) || 0`)                         */
/* ------------------------------------------------------------------ */

type FiniteParse = 'empty' | 'nonfinite' | number;

function parseFinite(raw: string): FiniteParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  return Number.isFinite(n) ? n : 'nonfinite';
}

const isNum = (p: FiniteParse): p is number => typeof p === 'number';

/* ------------------------------------------------------------------ */
/* Operand shapes                                                      */
/* ------------------------------------------------------------------ */

export interface PercentOfOperands {
  percent: string;
  value: string;
}
export interface WhatPercentOperands {
  part: string;
  whole: string;
}
export interface PercentChangeOperands {
  from: string;
  to: string;
}

/* ------------------------------------------------------------------ */
/* Validators (pure)                                                   */
/* ------------------------------------------------------------------ */

/** Equation 1 — "What is X% of Y?" X and Y present + finite; zero/negative OK. */
export function validatePercentOf(o: PercentOfOperands): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  if (!isNum(parseFinite(o.percent))) fieldErrors.percent = 'Enter the percentage.';
  if (!isNum(parseFinite(o.value))) fieldErrors.value = 'Enter the value.';
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/** Equation 2 — "X is what % of Y?" X, Y present + finite; Y (the total) ≠ 0. */
export function validateWhatPercent(o: WhatPercentOperands): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  if (!isNum(parseFinite(o.part))) fieldErrors.part = 'Enter the value.';
  const whole = parseFinite(o.whole);
  if (!isNum(whole)) fieldErrors.whole = 'Enter the total value.';
  else if (whole === 0) fieldErrors.whole = 'The total value must not be zero.';
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/** Equation 3 — "Change from X to Y?" X, Y present + finite; X (the start) ≠ 0. */
export function validatePercentChange(o: PercentChangeOperands): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const from = parseFinite(o.from);
  if (!isNum(from)) fieldErrors.from = 'Enter the starting value.';
  else if (from === 0) fieldErrors.from = 'The starting value must not be zero.';
  if (!isNum(parseFinite(o.to))) fieldErrors.to = 'Enter the ending value.';
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Descriptions (pure)                                                 */
/* ------------------------------------------------------------------ */

export function describeAmount(amount: number): string {
  return formatNumber(amount, 2);
}
export function describePercentage(pct: number): string {
  return `${formatNumber(pct, 2)} percent`;
}
export type ChangeDirection = 'increase' | 'decrease' | 'no change';
export function changeDirection(change: number): ChangeDirection {
  if (change > 0) return 'increase';
  if (change < 0) return 'decrease';
  return 'no change';
}
/** e.g. "25 percent increase", "10 percent decrease", "No change". */
export function describePercentChange(change: number): string {
  const dir = changeDirection(change);
  if (dir === 'no change') return 'No change';
  return `${formatNumber(Math.abs(change), 2)} percent ${dir}`;
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                          */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const readField = (root: HTMLElement, name: string) => field(root, name)?.value ?? '';
const clearField = (root: HTMLElement, name: string) => {
  const el = field(root, name);
  if (el) el.value = '';
};

function setValue(scope: HTMLElement, text: string, a11y: string, unit?: string) {
  const valueEl = scope.querySelector<HTMLElement>('[data-result-when~="valid"] [data-result-value]');
  const a11yEl = scope.querySelector<HTMLElement>('[data-result-when~="valid"] [data-result-value-a11y]');
  const unitEl = scope.querySelector<HTMLElement>('[data-result-when~="valid"] [data-result-unit]');
  if (valueEl) valueEl.textContent = text;
  if (unitEl && unit != null) unitEl.textContent = unit;
  if (a11yEl) a11yEl.textContent = a11y;
}

/* ------------------------------------------------------------------ */
/* Bindings                                                            */
/* ------------------------------------------------------------------ */

export const percentOfBinding: EquationCalculatorBinding<PercentOfOperands, number> = {
  readOperands: (root) => ({ percent: readField(root, 'percent'), value: readField(root, 'value') }),
  validate: validatePercentOf,
  compute: (o) => percentOf(Number(o.percent), Number(o.value)),
  resultValue: (r) => r,
  describeResult: describeAmount,
  renderResult(result, ctx: EquationRenderContext) {
    setValue(ctx.result, describeAmount(result), describeAmount(result));
  },
  resetOperands(root) {
    clearField(root, 'percent');
    clearField(root, 'value');
  },
};

export const whatPercentBinding: EquationCalculatorBinding<WhatPercentOperands, number> = {
  readOperands: (root) => ({ part: readField(root, 'part'), whole: readField(root, 'whole') }),
  validate: validateWhatPercent,
  compute: (o) => whatPercent(Number(o.part), Number(o.whole)),
  resultValue: (r) => r,
  describeResult: describePercentage,
  renderResult(result, ctx: EquationRenderContext) {
    const text = formatNumber(result, 2);
    setValue(ctx.result, text, accessibleResultName(text, PERCENT_UNIT), PERCENT_UNIT);
  },
  resetOperands(root) {
    clearField(root, 'part');
    clearField(root, 'whole');
  },
};

export const percentChangeBinding: EquationCalculatorBinding<PercentChangeOperands, number> = {
  readOperands: (root) => ({ from: readField(root, 'from'), to: readField(root, 'to') }),
  validate: validatePercentChange,
  compute: (o) => percentChange(Number(o.from), Number(o.to)),
  resultValue: (r) => r,
  describeResult: describePercentChange,
  renderResult(result, ctx: EquationRenderContext) {
    const dir = changeDirection(result);
    const magnitude = dir === 'no change' ? formatNumber(0, 2) : formatNumber(Math.abs(result), 2);
    setValue(ctx.result, magnitude, describePercentChange(result), PERCENT_UNIT);
    // Direction as TEXT (never colour/arrow alone).
    const dirEl = ctx.result.querySelector<HTMLElement>('[data-eq-direction]');
    if (dirEl) {
      dirEl.textContent = dir === 'no change' ? 'no change' : dir;
      dirEl.dataset.direction = dir === 'no change' ? 'none' : dir;
    }
  },
  resetOperands(root) {
    clearField(root, 'from');
    clearField(root, 'to');
  },
};

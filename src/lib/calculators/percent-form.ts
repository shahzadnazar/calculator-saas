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

/**
 * Equation 3 — "Change from X to Y?" The starting value X must be present,
 * finite and GREATER THAN ZERO (a non-positive start can invert the apparent
 * direction and mislead). The new value Y must be present and finite; Y may be
 * zero or negative.
 */
export function validatePercentChange(o: PercentChangeOperands): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const from = parseFinite(o.from);
  if (!isNum(from)) fieldErrors.from = 'Enter the starting value.';
  else if (from <= 0) fieldErrors.from = 'Enter a starting value greater than zero.';
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

/**
 * Direction is derived by comparing the NEW value with the STARTING value —
 * NOT from the sign of the percentage result. With a positive start these agree,
 * but deriving from the operands is unambiguous and avoids a misleading
 * consumer result (e.g. a negative start could invert the apparent direction).
 */
export function changeDirection(from: number, to: number): ChangeDirection {
  if (to > from) return 'increase';
  if (to < from) return 'decrease';
  return 'no change';
}

export interface PercentChangeResult {
  /** Signed percentage change ((to − from) / |from| × 100). */
  percent: number;
  direction: ChangeDirection;
}

export function computePercentChangeResult(from: number, to: number): PercentChangeResult {
  return { percent: percentChange(from, to), direction: changeDirection(from, to) };
}

/** e.g. "25 percent increase", "10 percent decrease", "No change". */
export function describePercentChange(result: PercentChangeResult): string {
  if (result.direction === 'no change') return 'No change';
  return `${formatNumber(Math.abs(result.percent), 2)} percent ${result.direction}`;
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

export const percentChangeBinding: EquationCalculatorBinding<PercentChangeOperands, PercentChangeResult> = {
  readOperands: (root) => ({ from: readField(root, 'from'), to: readField(root, 'to') }),
  validate: validatePercentChange,
  compute: (o) => computePercentChangeResult(Number(o.from), Number(o.to)),
  resultValue: (r) => r.percent,
  describeResult: describePercentChange,
  renderResult(result, ctx: EquationRenderContext) {
    const magnitude = result.direction === 'no change' ? formatNumber(0, 2) : formatNumber(Math.abs(result.percent), 2);
    setValue(ctx.result, magnitude, describePercentChange(result), PERCENT_UNIT);
    // Direction as TEXT (never colour/arrow alone), derived from the operands.
    const dirEl = ctx.result.querySelector<HTMLElement>('[data-eq-direction]');
    if (dirEl) {
      dirEl.textContent = result.direction === 'no change' ? 'no change' : result.direction;
      dirEl.dataset.direction = result.direction === 'no change' ? 'none' : result.direction;
    }
  },
  resetOperands(root) {
    clearField(root, 'from');
    clearField(root, 'to');
  },
};

/* ------------------------------------------------------------------ */
/* Worked examples (build-time, engine-derived)                        */
/* ------------------------------------------------------------------ */

/**
 * The scenarios behind the labelled Example each equation shows on first load.
 * The operands stay EMPTY — the example is badged, carries its own numbers in
 * its caption, and is replaced the moment the visitor types into that equation
 * or presses its "Start with my values" action. Each equation is independent, so
 * dismissing one leaves the other two examples standing.
 *
 * The inputs deliberately mirror each field's placeholder, and every printed
 * figure comes from `percentExamples()` — the same reviewed `percentOf` /
 * `whatPercent` / `percentChange` the calculator uses — so nothing can drift.
 */
export const PERCENT_EXAMPLES = {
  percentOf: { percent: 15, value: 200 },
  whatPercent: { part: 50, whole: 200 },
  percentChange: { from: 80, to: 100 },
} as const;

export interface PercentExamples {
  percentOf: { percent: number; value: number; amount: string };
  whatPercent: { part: number; whole: number; percentage: string };
  percentChange: {
    from: number;
    to: number;
    magnitude: string;
    direction: ChangeDirection;
    /** `data-direction` token used by the valid region ('none' for no change). */
    directionToken: 'increase' | 'decrease' | 'none';
  };
}

/** Compute the three worked examples from the engines. Pure — safe at build time. */
export function percentExamples(): PercentExamples {
  const of = PERCENT_EXAMPLES.percentOf;
  const wp = PERCENT_EXAMPLES.whatPercent;
  const pc = PERCENT_EXAMPLES.percentChange;
  const change = computePercentChangeResult(pc.from, pc.to);
  return {
    percentOf: { ...of, amount: formatNumber(percentOf(of.percent, of.value), 2) },
    whatPercent: { ...wp, percentage: formatNumber(whatPercent(wp.part, wp.whole), 2) },
    percentChange: {
      ...pc,
      magnitude:
        change.direction === 'no change'
          ? formatNumber(0, 2)
          : formatNumber(Math.abs(change.percent), 2),
      direction: change.direction,
      directionToken: change.direction === 'no change' ? 'none' : change.direction,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Worked example operands (labelled; the operands stay EMPTY)         */
/* ------------------------------------------------------------------ */

/**
 * Example operands for the labelled worked result each equation shows on first
 * load, in the shape each binding reads. Derived from the single PERCENT_EXAMPLES
 * scenario above, so the three equations and the prose can never disagree.
 *
 * The shared equation runtime computes these and calls each binding's own
 * `renderResult`, so an example reuses that equation's real result markup. The
 * visitor's operands are never written to — they load and stay empty.
 */
export const PERCENT_OF_EXAMPLE_VALUES: PercentOfOperands = {
  percent: String(PERCENT_EXAMPLES.percentOf.percent),
  value: String(PERCENT_EXAMPLES.percentOf.value),
};
export const WHAT_PERCENT_EXAMPLE_VALUES: WhatPercentOperands = {
  part: String(PERCENT_EXAMPLES.whatPercent.part),
  whole: String(PERCENT_EXAMPLES.whatPercent.whole),
};
export const PERCENT_CHANGE_EXAMPLE_VALUES: PercentChangeOperands = {
  from: String(PERCENT_EXAMPLES.percentChange.from),
  to: String(PERCENT_EXAMPLES.percentChange.to),
};

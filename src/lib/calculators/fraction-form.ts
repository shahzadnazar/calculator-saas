/**
 * Fraction form binding (R17B1 — bounded singleton; task-first).
 *
 * Wraps the UNCHANGED `computeFraction` / `simplify` and layers the visitor-facing contract they
 * lack: strict integer parsing, required/denominator/operation/divide-by-zero validation, and a
 * complete-result guard. One operation (add / subtract / multiply / divide) chosen from a native
 * `<select>` PARAMETER over one fixed pair of fractions — NOT structural modes, no panels.
 *
 * Own file — the standard-form runtime is UNCHANGED; there is NO `isUsableResult` (the complete-
 * result guard lives in `resultValue` as a NaN sentinel → the runtime's DEFAULT finite gate; a valid
 * result — including a finite 0 like −1/2 + 1/2 — passes). The binding NEVER reproduces fraction
 * arithmetic: it calls the frozen source functions, and reconciles the result only via those same
 * functions (a `computeFraction` recompute + `simplify` idempotence).
 */
import { computeFraction, simplify, type Fraction, type FractionOp, type FractionResult } from './fraction';
import { formatNumber } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

const OPS: readonly FractionOp[] = ['add', 'subtract', 'multiply', 'divide'];
const SYMBOL: Record<FractionOp, string> = { add: '+', subtract: '−', multiply: '×', divide: '÷' };
const DEFAULT_OP: FractionOp = 'add'; // the source-confirmed neutral default (legacy first option)
const TOL = 1e-9;
const FAIL = Number.NaN;

export interface FractionFormValues {
  an: string;
  ad: string;
  bn: string;
  bd: string;
  op: string;
}

export interface FractionComputed {
  an: number;
  ad: number;
  bn: number;
  bd: number;
  op: FractionOp;
  result: FractionResult;
}

export const MSG = {
  numRequired: 'Enter a numerator.',
  denRequired: 'Enter a denominator.',
  integer: 'Enter a whole number.',
  denZero: 'The denominator cannot be zero.',
  opInvalid: 'Choose an operation.',
  divZero: 'Cannot divide by a fraction that equals zero.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing — strict integers (never Number()||0, never parseInt)       */
/* ------------------------------------------------------------------ */

/** '' → null (missing); a strict finite integer string → the integer; else 'invalid'. */
function parseIntStrict(raw: string): number | null | 'invalid' {
  const s = raw.trim();
  if (s === '') return null;
  if (!/^-?\d+$/.test(s)) return 'invalid'; // rejects decimals, exponents, signs-only, junk
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : 'invalid';
}

const asOp = (raw: string): FractionOp | null => (OPS.includes(raw as FractionOp) ? (raw as FractionOp) : null);

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';

export function readFractionValues(root: HTMLElement): FractionFormValues {
  return {
    an: field(root, 'an'),
    ad: field(root, 'ad'),
    bn: field(root, 'bn'),
    bd: field(root, 'bd'),
    op: field(root, 'op'),
  };
}

/* ------------------------------------------------------------------ */
/* Validate                                                            */
/* ------------------------------------------------------------------ */

export function validateFraction(v: FractionFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const numerator = (raw: string, key: string) => {
    const n = parseIntStrict(raw);
    if (n === null) fieldErrors[key] = MSG.numRequired;
    else if (n === 'invalid') fieldErrors[key] = MSG.integer;
    return n;
  };
  const denominator = (raw: string, key: string) => {
    const n = parseIntStrict(raw);
    if (n === null) fieldErrors[key] = MSG.denRequired;
    else if (n === 'invalid') fieldErrors[key] = MSG.integer;
    else if (n === 0) fieldErrors[key] = MSG.denZero;
    return n;
  };

  numerator(v.an, 'an');
  denominator(v.ad, 'ad');
  const bn = numerator(v.bn, 'bn');
  denominator(v.bd, 'bd');

  const op = asOp(v.op);
  if (op === null) fieldErrors.op = MSG.opInvalid;

  // Division by a second fraction whose VALUE is zero (bn === 0) is rejected on the second numerator,
  // but only once bn is otherwise a valid integer (a 0 numerator is fine for the other operations).
  if (op === 'divide' && typeof bn === 'number' && bn === 0 && !fieldErrors.bn) {
    fieldErrors.bn = MSG.divZero;
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Compute (active values only)                                        */
/* ------------------------------------------------------------------ */

export function computeFractionForm(v: FractionFormValues): FractionComputed {
  const int = (raw: string) => {
    const n = parseIntStrict(raw);
    return typeof n === 'number' ? n : Number.NaN; // defensive; validation gates this path
  };
  const an = int(v.an);
  const ad = int(v.ad);
  const bn = int(v.bn);
  const bd = int(v.bd);
  const op = asOp(v.op) ?? DEFAULT_OP;
  return { an, ad, bn, bd, op, result: computeFraction({ num: an, den: ad }, op, { num: bn, den: bd }) };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (in resultValue — NO isUsableResult)          */
/* ------------------------------------------------------------------ */

export function completeFractionValue(c: FractionComputed): number {
  const { an, ad, bn, bd, op, result } = c;
  if (![an, ad, bn, bd].every((n) => Number.isInteger(n))) return FAIL;
  if (ad === 0 || bd === 0) return FAIL;
  if (!OPS.includes(op)) return FAIL;
  if (op === 'divide' && bn === 0) return FAIL;

  const { num, den } = result.fraction;
  if (!Number.isInteger(num) || !Number.isInteger(den) || den <= 0) return FAIL; // sign-normalised: den > 0

  // Reconcile ENTIRELY via the unchanged source: a recompute must reproduce fraction + decimal +
  // mixed, and `simplify` must be idempotent on the result (i.e. already in lowest terms).
  const re = computeFraction({ num: an, den: ad }, op, { num: bn, den: bd });
  if (re.fraction.num !== num || re.fraction.den !== den || re.mixed !== result.mixed) return FAIL;
  const red = simplify(result.fraction);
  if (red.num !== num || red.den !== den) return FAIL;

  if (!Number.isFinite(result.decimal) || Math.abs(result.decimal - num / den) > TOL) return FAIL;

  return result.decimal; // finite sentinel derived from the verified result (a valid 0 passes the gate)
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface FractionPresentation {
  primary: string;
  a11y: string;
  showMixed: boolean;
  mixed: string;
  decimal: string;
  interpretation: string;
}

const fractionStr = (f: Fraction): string => `${f.num}/${f.den}`;

export function presentFraction(c: FractionComputed): FractionPresentation {
  const { den } = c.result.fraction;
  const primary = fractionStr(c.result.fraction);
  // The mixed form is shown only when it says something the simplified fraction does not — i.e. a
  // whole number (den === 1 → "2") or an improper fraction (→ "3 1/2"). For a proper fraction the
  // source's mixed string equals the fraction itself, so it is omitted (inapplicable).
  const showMixed = c.result.mixed !== primary;
  return {
    primary,
    a11y: den === 1 ? c.result.mixed : primary, // announce a whole number as "2", not "2/1"
    showMixed,
    mixed: c.result.mixed,
    decimal: formatNumber(c.result.decimal, 4),
    interpretation: `This is ${c.an}/${c.ad} ${SYMBOL[c.op]} ${c.bn}/${c.bd}, reduced to lowest terms.`,
  };
}

export function describeFraction(c: FractionComputed): string {
  const { num, den } = c.result.fraction;
  return `Result: ${den === 1 ? c.result.mixed : `${num}/${den}`}.`;
}

export function renderFractionResult(result: FractionComputed, context: FormRenderContext): void {
  const p = presentFraction(result);
  const q = (sel: string) => context.result.querySelector<HTMLElement>(sel);
  const set = (sel: string, value: string) => {
    const el = q(sel);
    if (el) el.textContent = value;
  };
  const primary = q('[data-result-when~="valid"] [data-result-value]');
  if (primary) primary.textContent = p.primary;
  const a11y = q('[data-result-when~="valid"] [data-result-value-a11y]');
  if (a11y) a11y.textContent = p.a11y;

  const mixedRow = q('[data-fr-mixed-row]');
  if (mixedRow) mixedRow.hidden = !p.showMixed;
  set('[data-fr-mixed]', p.mixed);
  set('[data-fr-decimal]', p.decimal);
  set('[data-fr-interpretation]', p.interpretation);
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

/** Clear the four numeric fields and restore the neutral (add) operation. */
export function resetFractionValues(root: HTMLElement, _mode: ResetMode): void {
  for (const name of ['an', 'ad', 'bn', 'bd']) {
    const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (el) el.value = '';
  }
  const op = root.querySelector<HTMLSelectElement>('[name="op"]');
  if (op) op.value = DEFAULT_OP;
}

export const fractionBinding: FormCalculatorBinding<FractionFormValues, FractionComputed> = {
  readValues: readFractionValues,
  validate: validateFraction,
  compute: computeFractionForm,
  renderResult: renderFractionResult,
  describeResult: describeFraction,
  resultValue: completeFractionValue,
  resetValues: resetFractionValues,
  // NO isUsableResult — the complete-result guard lives in resultValue (NaN sentinel).
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * Example inputs for the labelled worked result shown on first load.
 *
 * These are OURS, not the visitor's. The shared runtime computes them and calls
 * this binding's own `renderResult`, so the example reuses the calculator's real
 * result markup and can never drift from the engine. The visitor's fields are
 * never written to — they load and stay empty behind it.
 */
export const FRACTION_EXAMPLE_VALUES: FractionFormValues = { an: '1', ad: '2', bn: '1', bd: '3', op: 'add' };

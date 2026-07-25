/**
 * Square-footage form binding (R10B1 — standard-form wave, calculator #20; product family
 * GEOMETRY, on the standard-form runtime UNCHANGED — no `isUsableResult`).
 *
 * Single mode with a CONVERTING input-unit selector (the accepted Pace capability, applied to two
 * fields). Length + width + unit + quantity + optional price → total square feet (dominant) with
 * m²/yd² equivalents, a one-section area (only when quantity > 1) and an estimated cost (only when a
 * price is entered). The pure `calculateSquareFootage` is UNCHANGED and frozen by
 * square-footage.test.ts; everything here is at the VALIDATION / PRESENTATION boundary. Product
 * decisions (R10B1):
 *   • Length + width required, finite, > 0 (zero is an invalid project input); quantity required, a
 *     WHOLE number ≥ 1 (fractional/zero/negative rejected, never silently floored); price OPTIONAL —
 *     empty is valid (cost row absent), an entered 0 is valid (cost row shows $0.00), negative /
 *     non-finite rejected; never `Number()||0`.
 *   • The unit selector CONVERTS the entered length + width (dimension-preserving, `convertValues`),
 *     it does not reinterpret. The primary output stays SQUARE FEET; the optional price is always
 *     per square foot in USD, unchanged by the dimension unit.
 *   • Every rendered output must be finite and ≥ 0; the guard lives in `resultValue` (a non-finite
 *     sentinel for a malformed result), so the DEFAULT gate rejects it and `isUsableResult` stays
 *     unimplemented.
 */
import { calculateSquareFootage, type SqFtUnit } from './square-footage';
import { formatCurrency, formatNumber } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** Mirrors the (unexported) TO_FEET in the reviewed square-footage.ts — a fixed set of physical
 *  constants, never re-tuned. Kept here so unit conversion and the formula stay identical. */
const TO_FEET: Record<SqFtUnit, number> = { ft: 1, in: 1 / 12, yd: 3, m: 3.280839895 };
const UNITS: SqFtUnit[] = ['ft', 'in', 'yd', 'm'];

export interface SquareFootageValues {
  length: string;
  width: string;
  unit: SqFtUnit;
  quantity: string;
  pricePerSqFt: string;
}

/** Structured result — carries quantity, the normalized price, whether a price was provided, and the
 *  selected unit so presentation can build the interpretation + conditional rows without re-reading
 *  the DOM. Finite and ≥ 0 for the validated domain. */
export interface SquareFootageComputed {
  areaSqFt: number;
  totalSqFt: number;
  totalSqM: number;
  totalSqYd: number;
  cost: number;
  quantity: number;
  pricePerSqFt: number;
  priceProvided: boolean;
  unit: SqFtUnit;
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type Parse = 'empty' | 'invalid' | number;

/** Finite and strictly > 0: a dimension. */
function parsePositive(raw: string): Parse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

/** Finite WHOLE number, at least 1: quantity. A fraction / zero / negative is rejected, not floored. */
function parseWholeAtLeastOne(raw: string): Parse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 'invalid';
  return n;
}

/** Optional price: empty is valid (no cost); if present, finite and ≥ 0. Returns 'absent' for empty. */
type PriceParse = 'absent' | 'invalid' | number;
function parseOptionalNonNegative(raw: string): PriceParse {
  const t = raw.trim();
  if (t === '') return 'absent';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

export function validateSquareFootageValues(values: SquareFootageValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (typeof parsePositive(values.length) !== 'number') fieldErrors.length = 'Enter a length greater than zero.';
  if (typeof parsePositive(values.width) !== 'number') fieldErrors.width = 'Enter a width greater than zero.';
  if (!UNITS.includes(values.unit)) fieldErrors.unit = 'Select a supported measurement unit.';
  if (typeof parseWholeAtLeastOne(values.quantity) !== 'number') fieldErrors.quantity = 'Enter a whole number of at least 1.';
  if (parseOptionalNonNegative(values.pricePerSqFt) === 'invalid') {
    fieldErrors.pricePerSqFt = 'Enter a price of zero or more, or leave it blank.';
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export function computeSquareFootage(values: SquareFootageValues): SquareFootageComputed {
  const priceProvided = values.pricePerSqFt.trim() !== '';
  const pricePerSqFt = priceProvided ? Number(values.pricePerSqFt) : 0;
  const quantity = Number(values.quantity);
  const r = calculateSquareFootage({
    length: Number(values.length),
    width: Number(values.width),
    unit: values.unit,
    quantity,
    pricePerSqFt,
  });
  return { ...r, quantity, pricePerSqFt, priceProvided, unit: values.unit };
}

/** Every rendered figure finite and ≥ 0 (cost only checked when a price was provided). */
export function isSquareFootageResultUsable(r: SquareFootageComputed): boolean {
  const vals = [r.areaSqFt, r.totalSqFt, r.totalSqM, r.totalSqYd];
  if (r.priceProvided) vals.push(r.cost);
  return vals.every((v) => Number.isFinite(v) && v >= 0);
}

/* ------------------------------------------------------------------ */
/* Unit conversion (pure) — dimension-preserving, mirrors the Pace policy */
/* ------------------------------------------------------------------ */

/** Round to 6 dp for a stable ft/in/yd/m round trip, and String() to drop trailing zeros. */
const toDimField = (n: number): string => String(Math.round(n * 1e6) / 1e6);

/** Convert a dimension string from one unit to another. Returns null to leave the field untouched
 *  (empty / non-positive / non-finite / same unit) — empty stays empty, invalid is not normalized. */
export function convertDimension(raw: string, from: SqFtUnit, to: SqFtUnit): string | null {
  const t = raw.trim();
  if (t === '' || from === to) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return toDimField((n * TO_FEET[from]) / TO_FEET[to]);
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** An area in square feet, e.g. "120 square feet". */
export function spokenArea(totalSqFt: number): string {
  return `${formatNumber(totalSqFt, 2)} square feet`;
}

/** Plain-language interpretation; states the total, the split when quantity > 1, and the cost when
 *  a price was provided. */
export function interpretSquareFootage(r: SquareFootageComputed): string {
  const total = `${formatNumber(r.totalSqFt, 2)} square feet`;
  let s =
    r.quantity > 1
      ? `Each area is ${formatNumber(r.areaSqFt, 2)} square feet. Across ${r.quantity} identical areas, the total is ${total}.`
      : `The area is ${total}.`;
  if (r.priceProvided) {
    s += ` At ${formatCurrency(r.pricePerSqFt)} per square foot, the estimated cost is ${formatCurrency(r.cost)}.`;
  }
  return s;
}

/** Concise announcement — the dominant total area only. */
export function describeSquareFootageResult(result: SquareFootageComputed): string {
  return result.quantity > 1
    ? `The total area across ${result.quantity} sections is ${spokenArea(result.totalSqFt)}.`
    : `The total area is ${spokenArea(result.totalSqFt)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

export const squareFootageBinding: FormCalculatorBinding<SquareFootageValues, SquareFootageComputed> = {
  readValues(root) {
    const unitRaw = field(root, 'unit')?.value;
    const unit = (UNITS as string[]).includes(unitRaw ?? '') ? (unitRaw as SqFtUnit) : 'ft';
    return {
      length: field(root, 'length')?.value ?? '',
      width: field(root, 'width')?.value ?? '',
      unit,
      quantity: field(root, 'quantity')?.value ?? '',
      pricePerSqFt: field(root, 'pricePerSqFt')?.value ?? '',
    };
  },

  validate: validateSquareFootageValues,

  compute: computeSquareFootage,

  /** Dominant total square feet, but a NON-FINITE sentinel for any malformed output so the runtime's
   *  DEFAULT finite gate rejects it — keeps `isUsableResult` unimplemented. */
  resultValue(result) {
    return isSquareFootageResultUsable(result) ? result.totalSqFt : NaN;
  },

  // No isUsableResult — the malformed-result guard lives in resultValue (R10B1 decision).

  describeResult: describeSquareFootageResult,

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

    const label = q('[data-result-when~="valid"] [data-result-summary-label]');
    if (label) label.textContent = 'Total area';
    setText('[data-result-when~="valid"] [data-result-value]', formatNumber(result.totalSqFt, 2));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', spokenArea(result.totalSqFt));
    setText('[data-sf-interpretation]', interpretSquareFootage(result));
    setText('[data-sf-sqm]', formatNumber(result.totalSqM, 2));
    setText('[data-sf-sqyd]', formatNumber(result.totalSqYd, 2));

    // One-section area only when quantity > 1.
    show('[data-sf-onesection-row]', result.quantity > 1);
    if (result.quantity > 1) setText('[data-sf-onesection]', formatNumber(result.areaSqFt, 2));

    // Estimated cost only when a price was entered (an entered 0 shows $0.00).
    show('[data-sf-cost-row]', result.priceProvided);
    if (result.priceProvided) setText('[data-sf-cost]', formatCurrency(result.cost));
  },

  resetValues(root, _mode: ResetMode) {
    const l = field(root, 'length');
    if (l) l.value = '';
    const w = field(root, 'width');
    if (w) w.value = '';
    const p = field(root, 'pricePerSqFt');
    if (p) p.value = '';
    const qy = field(root, 'quantity');
    if (qy) qy.value = '1'; // neutral structural default
    const u = field(root, 'unit');
    if (u) u.value = 'ft'; // restore the default unit
  },

  /** Dimension-preserving unit conversion of length + width (the accepted Pace capability). Called by
   *  the island on a select change; empty / invalid values are left untouched. */
  convertValues(root, fromUnit, toUnit) {
    for (const name of ['length', 'width']) {
      const el = field(root, name) as HTMLInputElement | null;
      if (!el) continue;
      const converted = convertDimension(el.value, fromUnit as SqFtUnit, toUnit as SqFtUnit);
      if (converted !== null) el.value = converted;
    }
  },
};

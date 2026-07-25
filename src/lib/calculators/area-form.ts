/**
 * Area form binding (R12B1 Commit 2 — task-first migration, geometry shape-picker family; the pilot).
 *
 * Wraps the UNCHANGED `calculateArea` / `AREA_SHAPES`, frozen by area.test.ts. Everything here is at the
 * VALIDATION / PRESENTATION boundary; the shape identifiers, per-shape formulas, the
 * `Math.max(0, d[k]||0)` normalization and the number return shape are untouched.
 *
 * Product decisions (R12B1):
 *   • Task-first: every dimension starts EMPTY, the result is empty, and the visitor presses "Calculate
 *     Area" for the first result (live-after-first thereafter). No calculation on load.
 *   • The SHAPE is a structural `<select>` (default rectangle) — plain form state the runtime recomputes
 *     on, NOT a new runtime mode. Each shape owns ONLY the dimensions its source formula needs; fields
 *     are named SHAPE-SCOPED (`<shape>.<key>`) so all seven groups coexist in the DOM (a visitor's values
 *     survive switching away and back) while the island shows/enables only the active group. The binding
 *     reads and validates ONLY the active shape's fields.
 *   • Every active dimension is required, finite and strictly > 0 (empty / 0 / negative / non-finite are
 *     rejected) — strict parsing, never Number(v)||0. No Area shape has a cross-field geometric
 *     relationship, so there is no form-level domain error (unlike Triangle's SSS inequality).
 *   • The UNIT is an INTERPRETIVE `<select>` (default m): it labels the unit the dimensions are entered
 *     in and the squared result unit; it NEVER converts entered numbers. It does not change the computed
 *     area (a label only).
 *   • The complete-result guard lives in the ordinary `resultValue` (a finite, positive area that
 *     reconciles with `calculateArea` for the selected shape + dims, else a NaN sentinel the runtime's
 *     default finite gate rejects). There is NO `isUsableResult`.
 */
import { calculateArea, AREA_SHAPES, type AreaShapeKey } from './area';
import { formatNumber } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export const AREA_UNITS = ['cm', 'm', 'in', 'ft', 'yd'] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];
export const DEFAULT_SHAPE: AreaShapeKey = 'rectangle';
export const DEFAULT_UNIT: AreaUnit = 'm';

const SHAPE_MAP = new Map(AREA_SHAPES.map((s) => [s.key, s]));
/** Spoken unit words for the accessible announcement ("… square metres"). */
const UNIT_WORD: Record<string, string> = { cm: 'centimetres', m: 'metres', in: 'inches', ft: 'feet', yd: 'yards' };

/** Shape-scoped DOM field name for a dimension, e.g. `rectangle.length`, `ellipse.a`. */
export const fieldName = (shape: string, key: string): string => `${shape}.${key}`;

export interface AreaValues {
  shape: string;
  unit: string;
  /** The ACTIVE shape's raw dimension strings, keyed by the shape's dimension keys. */
  dims: Record<string, string>;
}

export interface AreaComputed {
  shape: AreaShapeKey;
  shapeLabel: string;
  unit: string;
  area: number;
  /** The parsed active dimensions used to compute the area (for the guard's shape-identity check). */
  dims: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — strict, never Number(v) || 0          */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

/** A geometric dimension: required, finite and strictly greater than zero. */
function parsePositive(raw: string): NumParse {
  const t = (raw ?? '').trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

const shapeDef = (shape: string) => SHAPE_MAP.get(shape as AreaShapeKey);

/**
 * Validate the ACTIVE shape's dimensions only. Each active dimension must be a finite number > 0; the
 * message uses the shape's own visible label. Inactive shapes' fields are never read or blamed. Errors
 * are keyed by the SHAPE-SCOPED field name so the runtime binds them to the right control.
 */
export function validateAreaValues(values: AreaValues): ValidationResult {
  const def = shapeDef(values.shape);
  if (!def) return { ok: false, fieldErrors: { shape: 'Choose a shape.' } }; // defensive; the select is closed

  const fieldErrors: Record<string, string> = {};
  for (const inp of def.inputs) {
    const parsed = parsePositive(values.dims[inp.key] ?? '');
    if (parsed === 'empty' || parsed === 'invalid') {
      fieldErrors[fieldName(def.key, inp.key)] = `Enter a ${inp.label.toLowerCase()} greater than zero.`;
    }
  }
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure) — unchanged pass-through to calculateArea         */
/* ------------------------------------------------------------------ */

export function computeArea(values: AreaValues): AreaComputed {
  const def = shapeDef(values.shape) ?? SHAPE_MAP.get(DEFAULT_SHAPE)!;
  const dims: Record<string, number> = {};
  for (const inp of def.inputs) dims[inp.key] = Number(values.dims[inp.key]);
  return {
    shape: def.key,
    shapeLabel: def.label,
    unit: values.unit,
    area: calculateArea(def.key, dims),
    dims,
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN; // non-finite sentinel → the runtime's default finite gate rejects the result

/**
 * The dominant area — but ONLY when the whole result is well-formed: a known shape, every active
 * dimension finite and > 0, a finite positive area, and the area reconciling with `calculateArea` for the
 * selected shape + dims (shape identity; also rejects the +Infinity-dimension → Infinity-area path and
 * the unknown-shape NaN). Any failure returns the NaN sentinel — NO `isUsableResult`.
 */
export function completeResultValue(r: AreaComputed): number {
  const def = SHAPE_MAP.get(r.shape);
  if (!def) return FAIL;
  if (!Number.isFinite(r.area) || r.area <= 0) return FAIL;

  for (const inp of def.inputs) {
    const v = r.dims[inp.key];
    if (!Number.isFinite(v) || v <= 0) return FAIL;
  }

  const expected = calculateArea(def.key, r.dims);
  if (!Number.isFinite(expected)) return FAIL;
  if (Math.abs(r.area - expected) > Math.max(1e-9, Math.abs(expected) * 1e-9)) return FAIL;

  return r.area;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** Unit squared for the visible result label, e.g. "m²". */
export const unitSquared = (unit: string): string => `${unit}²`;

/** Concise announcement — the dominant area only, spoken with the unit word. */
export function describeAreaResult(r: AreaComputed): string {
  return `The calculated area is ${formatNumber(r.area, 3)} square ${UNIT_WORD[r.unit] ?? r.unit}.`;
}

/** The visible interpretation sentence (§11), naming the shape and the squared unit. */
export function interpretArea(r: AreaComputed): string {
  return `The area of the selected ${r.shapeLabel.toLowerCase()} is ${formatNumber(r.area, 3)} ${unitSquared(r.unit)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

export const areaBinding: FormCalculatorBinding<AreaValues, AreaComputed> = {
  readValues(root) {
    const shape = control(root, 'shape')?.value ?? DEFAULT_SHAPE;
    const unit = control(root, 'unit')?.value ?? DEFAULT_UNIT;
    const def = shapeDef(shape) ?? SHAPE_MAP.get(DEFAULT_SHAPE)!;
    const dims: Record<string, string> = {};
    for (const inp of def.inputs) dims[inp.key] = control(root, fieldName(shape, inp.key))?.value ?? '';
    return { shape, unit, dims };
  },

  validate: validateAreaValues,

  compute: computeArea,

  /** The dominant area when the ENTIRE result is well-formed, else a NaN sentinel — no isUsableResult. */
  resultValue: completeResultValue,

  describeResult: describeAreaResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const setText = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    setText('[data-result-when~="valid"] [data-result-value]', formatNumber(result.area, 3));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', `${formatNumber(result.area, 3)} square ${UNIT_WORD[result.unit] ?? result.unit}`);
    setText('[data-ar-unit-sq]', unitSquared(result.unit));
    setText('[data-ar-interpretation]', interpretArea(result));
  },

  resetValues(root, _mode: ResetMode) {
    const shapeSel = control(root, 'shape');
    if (shapeSel) shapeSel.value = DEFAULT_SHAPE;
    const unitSel = control(root, 'unit');
    if (unitSel) unitSel.value = DEFAULT_UNIT;
    // Clear every dimension field across ALL shapes (not just the active one), so switching shapes after
    // a reset never restores stale values.
    for (const s of AREA_SHAPES) {
      for (const inp of s.inputs) {
        const el = control(root, fieldName(s.key, inp.key));
        if (el) el.value = '';
      }
    }
  },
};

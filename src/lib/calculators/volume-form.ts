/**
 * Volume form binding (R12C1 Commit 2 — task-first migration, geometry shape-picker family; follow-on).
 *
 * Wraps the UNCHANGED `calculateVolume` / `VOLUME_SHAPES`, frozen by volume.test.ts. Everything here is
 * at the VALIDATION / PRESENTATION boundary; the shape identifiers, per-shape formulas, the
 * `Math.max(0, d[k]||0)` normalization and the number return shape are untouched.
 *
 * Volume is an INDEPENDENT product that follows the interaction pattern proven by Area: it does NOT
 * import the Area binding, Area field configuration or any shared shape framework — it owns its own
 * shapes, fields, parsing, validation, guard and presentation. (Only the standard-form runtime is shared,
 * unchanged.)
 *
 * Product decisions (R12C1):
 *   • Task-first: every dimension starts EMPTY, the result is empty, and the visitor presses "Calculate
 *     Volume" for the first result (live-after-first thereafter). No calculation on load.
 *   • The SHAPE is a structural `<select>` (default CUBE — the verified source default, NOT Area's
 *     rectangle). Each shape owns ONLY the dimensions its source formula needs; fields are named
 *     SHAPE-SCOPED (`<shape>.<key>`) so all seven groups coexist in the DOM (values survive switching
 *     away and back) while the island shows/enables only the active group. The binding reads + validates
 *     ONLY the active shape.
 *   • Every active dimension is required, finite and strictly > 0 — strict parsing, never Number(v)||0.
 *     No Volume shape has a cross-field geometric relationship, so there is no form-level domain error.
 *   • The UNIT is INTERPRETIVE (default m): it labels the entered-dimension unit and the CUBED result
 *     unit and NEVER converts entered numbers.
 *   • The complete-result guard lives in the ordinary `resultValue` (a finite, positive volume that
 *     reconciles with `calculateVolume` for the selected shape + dims, else a NaN sentinel). There is NO
 *     `isUsableResult`.
 */
import { calculateVolume, VOLUME_SHAPES, type VolumeShapeKey } from './volume';
import { formatNumber } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export const VOLUME_UNITS = ['cm', 'm', 'in', 'ft', 'yd'] as const;
export type VolumeUnit = (typeof VOLUME_UNITS)[number];
export const DEFAULT_SHAPE: VolumeShapeKey = 'cube';
export const DEFAULT_UNIT: VolumeUnit = 'm';

const SHAPE_MAP = new Map(VOLUME_SHAPES.map((s) => [s.key, s]));
/** Spoken cubic-unit words for the accessible announcement ("… cubic metres"). */
const UNIT_WORD: Record<string, string> = {
  cm: 'cubic centimetres',
  m: 'cubic metres',
  in: 'cubic inches',
  ft: 'cubic feet',
  yd: 'cubic yards',
};

/** Shape-scoped DOM field name for a dimension, e.g. `box.length`, `capsule.height`. */
export const fieldName = (shape: string, key: string): string => `${shape}.${key}`;

export interface VolumeValues {
  shape: string;
  unit: string;
  /** The ACTIVE shape's raw dimension strings, keyed by the shape's dimension keys. */
  dims: Record<string, string>;
}

export interface VolumeComputed {
  shape: VolumeShapeKey;
  shapeLabel: string;
  unit: string;
  volume: number;
  /** The parsed active dimensions used to compute the volume (for the guard's shape-identity check). */
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

const shapeDef = (shape: string) => SHAPE_MAP.get(shape as VolumeShapeKey);

/**
 * Validate the ACTIVE shape's dimensions only. Each active dimension must be a finite number > 0; the
 * message uses the shape's own visible label. Inactive shapes' fields are never read or blamed. Errors
 * are keyed by the SHAPE-SCOPED field name so the runtime binds them to the right control.
 */
export function validateVolumeValues(values: VolumeValues): ValidationResult {
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
/* Computation (pure) — unchanged pass-through to calculateVolume       */
/* ------------------------------------------------------------------ */

export function computeVolume(values: VolumeValues): VolumeComputed {
  const def = shapeDef(values.shape) ?? SHAPE_MAP.get(DEFAULT_SHAPE)!;
  const dims: Record<string, number> = {};
  for (const inp of def.inputs) dims[inp.key] = Number(values.dims[inp.key]);
  return {
    shape: def.key,
    shapeLabel: def.label,
    unit: values.unit,
    volume: calculateVolume(def.key, dims),
    dims,
  };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (pure) — the resultValue sentinel             */
/* ------------------------------------------------------------------ */

const FAIL = Number.NaN; // non-finite sentinel → the runtime's default finite gate rejects the result

/**
 * The dominant volume — but ONLY when the whole result is well-formed: a known shape, every active
 * dimension finite and > 0, a finite positive volume, and the volume reconciling with `calculateVolume`
 * for the selected shape + dims (shape identity; also rejects the +Infinity-dimension → Infinity-volume
 * path and the unknown-shape NaN). Any failure returns the NaN sentinel — NO `isUsableResult`.
 */
export function completeResultValue(r: VolumeComputed): number {
  const def = SHAPE_MAP.get(r.shape);
  if (!def) return FAIL;
  if (!Number.isFinite(r.volume) || r.volume <= 0) return FAIL;

  for (const inp of def.inputs) {
    const v = r.dims[inp.key];
    if (!Number.isFinite(v) || v <= 0) return FAIL;
  }

  const expected = calculateVolume(def.key, r.dims);
  if (!Number.isFinite(expected)) return FAIL;
  if (Math.abs(r.volume - expected) > Math.max(1e-9, Math.abs(expected) * 1e-9)) return FAIL;

  return r.volume;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

/** Unit cubed for the visible result label, e.g. "m³". */
export const unitCubed = (unit: string): string => `${unit}³`;

/** Concise announcement — the dominant volume only, spoken with the cubic-unit word. */
export function describeVolumeResult(r: VolumeComputed): string {
  return `The calculated volume is ${formatNumber(r.volume, 3)} ${UNIT_WORD[r.unit] ?? r.unit}.`;
}

/** The visible interpretation sentence (§11), naming the shape and the cubed unit. */
export function interpretVolume(r: VolumeComputed): string {
  return `The volume of the selected ${r.shapeLabel.toLowerCase()} is ${formatNumber(r.volume, 3)} ${unitCubed(r.unit)}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const control = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);

export const volumeBinding: FormCalculatorBinding<VolumeValues, VolumeComputed> = {
  readValues(root) {
    const shape = control(root, 'shape')?.value ?? DEFAULT_SHAPE;
    const unit = control(root, 'unit')?.value ?? DEFAULT_UNIT;
    const def = shapeDef(shape) ?? SHAPE_MAP.get(DEFAULT_SHAPE)!;
    const dims: Record<string, string> = {};
    for (const inp of def.inputs) dims[inp.key] = control(root, fieldName(shape, inp.key))?.value ?? '';
    return { shape, unit, dims };
  },

  validate: validateVolumeValues,

  compute: computeVolume,

  /** The dominant volume when the ENTIRE result is well-formed, else a NaN sentinel — no isUsableResult. */
  resultValue: completeResultValue,

  describeResult: describeVolumeResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const setText = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };
    setText('[data-result-when~="valid"] [data-result-value]', formatNumber(result.volume, 3));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', `${formatNumber(result.volume, 3)} ${UNIT_WORD[result.unit] ?? result.unit}`);
    setText('[data-vo-unit-cubed]', unitCubed(result.unit));
    setText('[data-vo-interpretation]', interpretVolume(result));
  },

  resetValues(root, _mode: ResetMode) {
    const shapeSel = control(root, 'shape');
    if (shapeSel) shapeSel.value = DEFAULT_SHAPE;
    const unitSel = control(root, 'unit');
    if (unitSel) unitSel.value = DEFAULT_UNIT;
    for (const s of VOLUME_SHAPES) {
      for (const inp of s.inputs) {
        const el = control(root, fieldName(s.key, inp.key));
        if (el) el.value = '';
      }
    }
  },
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
export const VOLUME_EXAMPLE_VALUES: VolumeValues = { shape: 'cube', unit: 'm', dims: { side: '2' } };

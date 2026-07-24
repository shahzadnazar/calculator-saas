/**
 * Concrete form binding (R10C1 — standard-form wave, calculator #21; product family GEOMETRY, on
 * the standard-form runtime UNCHANGED — no `isUsableResult`).
 *
 * Single rectangular-prism volume (slab / wall / footing) with a CONVERTING input-unit control (the
 * accepted capability, applied to three fields via native radios). Length + width + depth + unit +
 * optional waste → cubic yards (dominant) with m³/ft³ equivalents and a fixed 40/60/80 lb bag table.
 * The pure `calculateConcrete` is UNCHANGED and frozen by concrete.test.ts; everything here is at the
 * VALIDATION / PRESENTATION boundary. Product decisions (R10C1):
 *   • Length + width + depth required, finite, > 0 (zero is an invalid project input); waste OPTIONAL
 *     — empty valid (0%), entered 0 valid, negative / non-finite rejected; never `Number()||0`.
 *   • The unit (ft/m) CONVERTS the entered dimensions (dimension-preserving, `convertValues`), it does
 *     not reinterpret. No cost — the calculator computes none.
 *   • Every rendered figure finite and ≥ 0, bag counts whole and ≥ 0 — the guard lives in
 *     `resultValue` (non-finite sentinel for a malformed result), so `isUsableResult` stays unused.
 */
import { calculateConcrete, type LengthUnit } from './concrete';
import { formatNumber } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** 1 metre = 3.280839895 feet — the source linear conversion (its cube is the volume constant
 *  35.3146667). A fixed physical constant, mirrored here for dimension conversion. */
const M_TO_FT = 3.280839895;
const UNITS: LengthUnit[] = ['ft', 'm'];

export interface ConcreteValues {
  length: string;
  width: string;
  depth: string;
  unit: LengthUnit;
  wastePct: string;
}

export interface ConcreteComputed {
  cubicFeet: number;
  cubicYards: number;
  cubicMeters: number;
  bags40: number;
  bags60: number;
  bags80: number;
  wastePct: number;
  wasteProvided: boolean;
  unit: LengthUnit;
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

/** Optional waste: empty is valid (0%); if present, finite and ≥ 0. */
type WasteParse = 'absent' | 'invalid' | number;
function parseOptionalNonNegative(raw: string): WasteParse {
  const t = raw.trim();
  if (t === '') return 'absent';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

export function validateConcreteValues(values: ConcreteValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (typeof parsePositive(values.length) !== 'number') fieldErrors.length = 'Enter a length greater than zero.';
  if (typeof parsePositive(values.width) !== 'number') fieldErrors.width = 'Enter a width greater than zero.';
  if (typeof parsePositive(values.depth) !== 'number') fieldErrors.depth = 'Enter a depth greater than zero.';
  if (!UNITS.includes(values.unit)) fieldErrors.unit = 'Select a supported measurement unit.';
  if (parseOptionalNonNegative(values.wastePct) === 'invalid') {
    fieldErrors.wastePct = 'Enter a waste allowance of zero or more, or leave it blank.';
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export function computeConcrete(values: ConcreteValues): ConcreteComputed {
  const wasteProvided = values.wastePct.trim() !== '';
  const wastePct = wasteProvided ? Number(values.wastePct) : 0;
  const r = calculateConcrete({
    length: Number(values.length),
    width: Number(values.width),
    depth: Number(values.depth),
    unit: values.unit,
    wastePct,
  });
  return {
    cubicFeet: r.cubicFeet,
    cubicYards: r.cubicYards,
    cubicMeters: r.cubicMeters,
    bags40: r.bags40lb,
    bags60: r.bags60lb,
    bags80: r.bags80lb,
    wastePct,
    wasteProvided,
    unit: values.unit,
  };
}

/** Every volume finite and ≥ 0; every bag count a whole number ≥ 0. */
export function isConcreteResultUsable(r: ConcreteComputed): boolean {
  const vols = [r.cubicFeet, r.cubicYards, r.cubicMeters].every((v) => Number.isFinite(v) && v >= 0);
  const bags = [r.bags40, r.bags60, r.bags80].every((b) => Number.isFinite(b) && Number.isInteger(b) && b >= 0);
  return vols && bags;
}

/* ------------------------------------------------------------------ */
/* Unit conversion (pure) — dimension-preserving                        */
/* ------------------------------------------------------------------ */

/** Round to 6 dp for a stable ft↔m round trip, and String() to drop trailing zeros. */
const toDimField = (n: number): string => String(Math.round(n * 1e6) / 1e6);

/** Convert a dimension string between ft and m. Returns null to leave the field untouched (empty /
 *  non-positive / non-finite / same unit) — empty stays empty, invalid is not normalized. */
export function convertDimension(raw: string, from: LengthUnit, to: LengthUnit): string | null {
  const t = raw.trim();
  if (t === '' || from === to) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  const feet = from === 'ft' ? n : n * M_TO_FT;
  return toDimField(to === 'ft' ? feet : feet / M_TO_FT);
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

const cy = (r: ConcreteComputed): string => formatNumber(r.cubicYards, 3);

/** Plain-language interpretation; states the waste allowance (or its absence). */
export function interpretConcrete(r: ConcreteComputed): string {
  if (r.wasteProvided && r.wastePct > 0) {
    return `You need approximately ${cy(r)} cubic yards of concrete including a ${formatNumber(r.wastePct, 2)}% waste allowance.`;
  }
  return `You need approximately ${cy(r)} cubic yards of concrete with no additional waste allowance.`;
}

/** Concise announcement — the dominant volume only. */
export function describeConcreteResult(result: ConcreteComputed): string {
  return `You need approximately ${cy(result)} cubic yards of concrete.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const readUnit = (root: HTMLElement): LengthUnit =>
  root.querySelector<HTMLInputElement>('[name="unit"]:checked')?.value === 'm' ? 'm' : 'ft';

export const concreteBinding: FormCalculatorBinding<ConcreteValues, ConcreteComputed> = {
  readValues(root) {
    return {
      length: input(root, 'length')?.value ?? '',
      width: input(root, 'width')?.value ?? '',
      depth: input(root, 'depth')?.value ?? '',
      unit: readUnit(root),
      wastePct: input(root, 'wastePct')?.value ?? '',
    };
  },

  validate: validateConcreteValues,

  compute: computeConcrete,

  /** Dominant cubic yards, but a NON-FINITE sentinel for any malformed output so the runtime's
   *  DEFAULT finite gate rejects it — keeps `isUsableResult` unimplemented. */
  resultValue(result) {
    return isConcreteResultUsable(result) ? result.cubicYards : NaN;
  },

  // No isUsableResult — the malformed-result guard lives in resultValue (R10C1 decision).

  describeResult: describeConcreteResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };

    const label = q('[data-result-when~="valid"] [data-result-summary-label]');
    if (label) label.textContent = 'Concrete needed';
    setText('[data-result-when~="valid"] [data-result-value]', formatNumber(result.cubicYards, 3));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', `${formatNumber(result.cubicYards, 3)} cubic yards`);
    setText('[data-co-interpretation]', interpretConcrete(result));
    setText('[data-co-cm]', formatNumber(result.cubicMeters, 3));
    setText('[data-co-cf]', formatNumber(result.cubicFeet, 3));
    setText('[data-co-b40]', String(result.bags40));
    setText('[data-co-b60]', String(result.bags60));
    setText('[data-co-b80]', String(result.bags80));
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['length', 'width', 'depth', 'wastePct']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
    const ft = root.querySelector<HTMLInputElement>('[name="unit"][value="ft"]');
    if (ft) ft.checked = true; // restore the default unit
  },

  /** Dimension-preserving conversion of length + width + depth (waste is never converted). Called by
   *  the island on a unit-radio change; empty / invalid values are left untouched. */
  convertValues(root, fromUnit, toUnit) {
    for (const name of ['length', 'width', 'depth']) {
      const el = input(root, name);
      if (!el) continue;
      const converted = convertDimension(el.value, fromUnit as LengthUnit, toUnit as LengthUnit);
      if (converted !== null) el.value = converted;
    }
  },
};

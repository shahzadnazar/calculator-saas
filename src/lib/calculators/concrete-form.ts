/**
 * Concrete form layer — ONE binding, five pours.
 *
 * The reference puts five calculators on the page: a slab, a round footing, a circular slab or
 * tube, a curb-and-gutter barrier, and stairs. Each has its own fields and its own result, and none
 * of them touches another.
 *
 * As with square footage, area and volume, they do not need five bindings: a pour is a list of
 * fields plus one volume formula, so `ConcreteShapeSpec` holds that and `makeConcreteBinding` turns
 * a spec into a binding.
 *
 * Two field kinds rather than one. Most fields are lengths, each carrying its own unit; a few — the
 * quantity, and the number of risers — are plain counts, and giving a count a unit dropdown would
 * be nonsense. That distinction lives in the spec, so the island renders from it.
 */
import {
  volumeSlab,
  volumeFooting,
  volumeTube,
  volumeCurb,
  volumeStairs,
  concreteAmount,
  formatQuantity,
  formatWeight,
  toFeet,
  DENSITY_KG_PER_M3,
  DENSITY_LB_PER_FT3,
  type ConcreteShapeKey,
  type ConcreteAmount,
} from './concrete';
import { isLengthUnit, type LengthUnit } from './area-units';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export const DEFAULT_UNIT: LengthUnit = 'ft';

export interface ConcreteField {
  /** Field name, unique within its own form only. */
  name: string;
  label: string;
  /** A length carries its own unit; a count does not. */
  kind: 'length' | 'count';
}

export interface ConcreteShapeSpec {
  key: ConcreteShapeKey;
  title: string;
  /** One short line under the heading saying what the pour is. */
  lede: string;
  fields: ConcreteField[];
  /** Volume of ONE of these, in cubic feet. Lengths arrive in FEET; a count arrives as itself. */
  volume(values: number[]): number;
  /** A cross-field impossibility the individual fields cannot catch. */
  check?(values: number[]): string | null;
}

export const MSG = {
  required: 'Enter a value.',
  invalid: 'Enter a number greater than zero.',
  countInvalid: 'Enter a whole number of 1 or more.',
  tubeBore: 'The inner diameter must be smaller than the outer diameter.',
} as const;

const len = (name: string, label: string): ConcreteField => ({ name, label, kind: 'length' });
const count = (name: string, label: string): ConcreteField => ({ name, label, kind: 'count' });

/* ------------------------------------------------------------------ */
/* The five specs, in the reference's order                            */
/* ------------------------------------------------------------------ */

export const CONCRETE_SHAPES: ConcreteShapeSpec[] = [
  {
    key: 'slab',
    title: 'Slabs, Square Footings, or Walls',
    lede: 'A rectangular pour — a floor, a pad, a wall, a square footing.',
    fields: [
      len('d1', 'Length (l)'),
      len('d2', 'Width (w)'),
      len('d3', 'Thickness or Height (h)'),
      count('quantity', 'Quantity'),
    ],
    volume: ([l, w, h, q]) => volumeSlab(l, w, h) * q,
  },
  {
    key: 'footing',
    title: 'Hole, Column, or Round Footings',
    lede: 'A cylinder — a post hole, a column, a round footing.',
    fields: [
      len('d1', 'Diameter (d)'),
      len('d2', 'Depth or Height (h)'),
      count('quantity', 'Quantity'),
    ],
    volume: ([d, h, q]) => volumeFooting(d, h) * q,
  },
  {
    key: 'tube',
    title: 'Circular Slab or Tube',
    lede: 'A ring — a circular slab with a hole, or a pipe surround.',
    fields: [
      len('d1', 'Outer Diameter (d₁)'),
      len('d2', 'Inner Diameter (d₂)'),
      len('d3', 'Length or Height (h)'),
      count('quantity', 'Quantity'),
    ],
    volume: ([d1, d2, h, q]) => volumeTube(d1, d2, h) * q,
    check: ([d1, d2]) => (d2 >= d1 ? MSG.tubeBore : null),
  },
  {
    key: 'curb',
    title: 'Curb and Gutter Barrier',
    lede: 'A kerb run with its gutter flag, poured as one.',
    fields: [
      len('d1', 'Curb Depth'),
      len('d2', 'Gutter Width'),
      len('d3', 'Curb Height'),
      len('d4', 'Flag Thickness'),
      len('d5', 'Length'),
      count('quantity', 'Quantity'),
    ],
    volume: ([depth, gutter, height, flag, length, q]) =>
      volumeCurb(depth, gutter, height, flag, length) * q,
  },
  {
    key: 'stairs',
    title: 'Stairs',
    lede: 'A flight, counted by its risers.',
    fields: [
      len('d1', 'Run'),
      len('d2', 'Rise'),
      len('d3', 'Width'),
      len('d4', 'Platform Depth'),
      count('d5', 'Number of Risers'),
    ],
    volume: ([run, rise, width, platform, risers]) =>
      volumeStairs(run, rise, width, platform, risers),
  },
];

export const concreteShapeByKey = (key: ConcreteShapeKey): ConcreteShapeSpec =>
  CONCRETE_SHAPES.find((s) => s.key === key)!;

/* ------------------------------------------------------------------ */
/* Values + computation                                                */
/* ------------------------------------------------------------------ */

export interface ConcreteValues {
  dims: Record<string, string>;
  units: Record<string, string>;
}

export interface ConcreteComputed {
  key: ConcreteShapeKey;
  values: ConcreteValues;
  /** Every field converted: lengths to feet, counts as themselves. */
  converted: number[];
  cubicFeet: number;
  amount: ConcreteAmount;
}

/** A strictly positive finite decimal; empty and junk are told apart. */
function parsePositive(raw: string): number | 'empty' | 'invalid' {
  const s = (raw ?? '').trim();
  if (s === '') return 'empty';
  if (!/^\d+\.?\d*$|^\.\d+$/.test(s)) return 'invalid';
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

/** A whole count of 1 or more. */
function parseCount(raw: string): number | 'empty' | 'invalid' {
  const s = (raw ?? '').trim();
  if (s === '') return 'empty';
  if (!/^\d+$/.test(s)) return 'invalid';
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) return 'invalid';
  return n;
}

const asUnit = (raw: string): LengthUnit => (isLengthUnit(raw) ? raw : DEFAULT_UNIT);

/** Lengths in feet, counts as themselves. NaN where an entry is unusable. */
export function convertFields(spec: ConcreteShapeSpec, v: ConcreteValues): number[] {
  return spec.fields.map((f) => {
    if (f.kind === 'count') {
      const parsed = parseCount(v.dims[f.name] ?? '');
      return typeof parsed === 'number' ? parsed : Number.NaN;
    }
    const parsed = parsePositive(v.dims[f.name] ?? '');
    if (typeof parsed !== 'number') return Number.NaN;
    return toFeet(parsed, asUnit(v.units[f.name] ?? ''));
  });
}

export function validateConcrete(spec: ConcreteShapeSpec, v: ConcreteValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  for (const f of spec.fields) {
    const parsed = f.kind === 'count' ? parseCount(v.dims[f.name] ?? '') : parsePositive(v.dims[f.name] ?? '');
    if (parsed === 'empty') fieldErrors[f.name] = MSG.required;
    else if (parsed === 'invalid') {
      fieldErrors[f.name] = f.kind === 'count' ? MSG.countInvalid : MSG.invalid;
    }
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  // Only once every field is individually sound can a cross-field impossibility be judged.
  const cross = spec.check?.(convertFields(spec, v));
  if (cross) return { ok: false, formError: cross };
  return { ok: true };
}

export function computeConcrete(spec: ConcreteShapeSpec, v: ConcreteValues): ConcreteComputed {
  const converted = convertFields(spec, v);
  const cubicFeet = converted.every(Number.isFinite) ? spec.volume(converted) : Number.NaN;
  return { key: spec.key, values: v, converted, cubicFeet, amount: concreteAmount(cubicFeet) };
}

/** The volume, but only when everything on show reconciles with a recompute. */
export function completeConcreteValue(spec: ConcreteShapeSpec, r: ConcreteComputed): number {
  if (r.key !== spec.key) return Number.NaN;
  if (!r.converted.every((n) => Number.isFinite(n) && n > 0)) return Number.NaN;
  if (!Number.isFinite(r.cubicFeet) || r.cubicFeet <= 0) return Number.NaN;
  if (spec.check?.(r.converted)) return Number.NaN;

  const re = convertFields(spec, r.values);
  if (re.length !== r.converted.length) return Number.NaN;
  for (let i = 0; i < re.length; i += 1) {
    if (re[i] !== r.converted[i]) return Number.NaN;
  }
  if (spec.volume(re) !== r.cubicFeet) return Number.NaN;

  const a = r.amount;
  for (const value of [a.cubicFeet, a.cubicYards, a.cubicMeters, a.pounds, a.kilograms, ...a.bags.map((b) => b.bags)]) {
    if (!Number.isFinite(value) || value <= 0) return Number.NaN;
  }
  return r.cubicFeet;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface ConcretePresentation {
  cubicFeet: string;
  cubicYards: string;
  cubicMeters: string;
  pounds: string;
  kilograms: string;
  /** One row per bag size, already worded. */
  bags: { label: string; value: string }[];
  densityNote: string;
  a11y: string;
}

export function presentConcrete(r: ConcreteComputed): ConcretePresentation {
  const a = r.amount;
  return {
    cubicFeet: formatQuantity(a.cubicFeet),
    cubicYards: formatQuantity(a.cubicYards),
    cubicMeters: formatQuantity(a.cubicMeters),
    pounds: formatWeight(a.pounds),
    kilograms: formatWeight(a.kilograms),
    bags: a.bags.map((b) => ({
      label: `Using ${b.size}-lb bags`,
      value: formatQuantity(b.bags),
    })),
    densityNote: `If using pre-mixed concrete with density of ${DENSITY_KG_PER_M3.toLocaleString('en-US')} kg/m³ or ${DENSITY_LB_PER_FT3} lbs/ft³:`,
    a11y: `${formatQuantity(a.cubicFeet)} cubic feet, or ${formatQuantity(a.cubicYards)} cubic yards. About ${formatQuantity(a.bags[1]?.bags ?? Number.NaN)} eighty-pound bags.`,
  };
}

export function describeConcrete(spec: ConcreteShapeSpec, r: ConcreteComputed): string {
  return `${spec.title}: ${presentConcrete(r).a11y}`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const value = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';

export function readConcreteValues(root: HTMLElement, spec: ConcreteShapeSpec): ConcreteValues {
  const dims: Record<string, string> = {};
  const units: Record<string, string> = {};
  for (const f of spec.fields) {
    dims[f.name] = value(root, f.name);
    if (f.kind === 'length') units[f.name] = value(root, `${f.name}Unit`) || DEFAULT_UNIT;
  }
  return { dims, units };
}

/** One binding per pour, built from its spec — never five hand-written bindings. */
export function makeConcreteBinding(
  spec: ConcreteShapeSpec,
): FormCalculatorBinding<ConcreteValues, ConcreteComputed> {
  return {
    readValues: (root) => readConcreteValues(root, spec),
    validate: (v) => validateConcrete(spec, v),
    compute: (v) => computeConcrete(spec, v),
    resultValue: (r) => completeConcreteValue(spec, r),
    describeResult: (r) => describeConcrete(spec, r),
    renderResult(result, context: FormRenderContext) {
      const p = presentConcrete(result);
      const set = (sel: string, text: string) => {
        const el = context.result.querySelector<HTMLElement>(sel);
        if (el) el.textContent = text;
      };
      set('[data-result-when~="valid"] [data-result-value]', p.cubicFeet);
      set('[data-result-when~="valid"] [data-result-value-a11y]', p.a11y);
      set('[data-cc-yd3]', p.cubicYards);
      set('[data-cc-m3]', p.cubicMeters);
      set('[data-cc-lbs]', p.pounds);
      set('[data-cc-kg]', p.kilograms);
      p.bags.forEach((b, i) => set(`[data-cc-bags="${i}"]`, b.value));
    },
    resetValues(root, _mode: ResetMode) {
      for (const f of spec.fields) {
        const el = root.querySelector<HTMLInputElement>(`[name="${f.name}"]`);
        // The quantity is a neutral structural default of one, not a value the visitor supplied.
        if (el) el.value = f.name === 'quantity' ? '1' : '';
        const unit = root.querySelector<HTMLSelectElement>(`[name="${f.name}Unit"]`);
        if (unit) unit.value = DEFAULT_UNIT;
      }
    },
  };
}

/**
 * Example values for the labelled worked result each pour shows on load.
 *
 * These are OURS, not the visitor's: the runtime computes them and calls the binding's own
 * renderResult, so the example reuses the real result markup and can never drift from the engine.
 */
export function concreteExampleValues(spec: ConcreteShapeSpec): ConcreteValues {
  const byKey: Record<ConcreteShapeKey, [number, LengthUnit | null][]> = {
    slab: [[16, 'ft'], [10, 'ft'], [4, 'in'], [1, null]],
    footing: [[12, 'in'], [4, 'ft'], [6, null]],
    tube: [[6, 'ft'], [4, 'ft'], [4, 'in'], [1, null]],
    curb: [[6, 'in'], [12, 'in'], [6, 'in'], [4, 'in'], [30, 'ft'], [1, null]],
    stairs: [[11, 'in'], [7, 'in'], [4, 'ft'], [12, 'in'], [6, null]],
  };
  const rows = byKey[spec.key];
  const dims: Record<string, string> = {};
  const units: Record<string, string> = {};
  spec.fields.forEach((f, i) => {
    const [n, unit] = rows[i];
    dims[f.name] = String(n);
    if (f.kind === 'length') units[f.name] = unit ?? DEFAULT_UNIT;
  });
  return { dims, units };
}

/** The first pour's example, for the fleet-wide labelled-example check. */
export const CONCRETE_EXAMPLE_VALUES = concreteExampleValues(CONCRETE_SHAPES[0]);
export const concreteBinding = makeConcreteBinding(CONCRETE_SHAPES[0]);

/**
 * Square-footage form layer — ONE binding, nine shapes.
 *
 * The reference puts nine separate calculators on the page: Rectangle, Rectangle Border,
 * Circle, Ring, Triangle with Edge Lengths, Triangle with Base & Height, Trapezoid, Sector and
 * Parallelogram. Each has its own fields, its own Calculate and its own result, and none of
 * them touches another.
 *
 * What they do NOT need is nine bindings. Every one is the same shape of question — some
 * dimensions, each with its own unit, times a quantity, optionally priced — so the difference
 * between them is a list of fields and one area formula. That is what `ShapeSpec` holds, and
 * `makeShapeBinding` turns a spec into a binding. Adding a tenth shape is a spec, not a file.
 *
 * The arithmetic lives in the reviewed pure `square-footage.ts`; nothing here recomputes an
 * area, and every displayed figure is reconciled against a recompute by the complete-result
 * guard in `resultValue`. There is no `isUsableResult`.
 */
import {
  toFeet,
  toRadians,
  fromSqFt,
  formatExactArea,
  areaRectangle,
  areaRectangleBorder,
  areaCircle,
  areaRing,
  areaTriangleEdges,
  areaTriangleBaseHeight,
  areaTrapezoid,
  areaSector,
  areaParallelogram,
  AREA_UNITS,
  type LengthUnit,
  type AreaUnit,
  type AngleUnit,
} from './square-footage';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type ShapeKey =
  | 'rectangle'
  | 'rectangle-border'
  | 'circle'
  | 'ring'
  | 'triangle-edges'
  | 'triangle-base'
  | 'trapezoid'
  | 'sector'
  | 'parallelogram';

export interface ShapeField {
  /** Field name, unique within its own form only. */
  name: string;
  label: string;
  kind: 'length' | 'angle';
}

export interface ShapeSpec {
  key: ShapeKey;
  title: string;
  /** One short line under the heading saying what the shape is for. */
  lede: string;
  fields: ShapeField[];
  /** Area in square feet. Lengths arrive in FEET and an angle in RADIANS. */
  area(values: number[]): number;
  /** A cross-field impossibility the individual fields cannot catch. */
  check?(values: number[]): string | null;
}

export const MSG = {
  required: 'Enter a value.',
  invalid: 'Enter a number greater than zero.',
  quantityInvalid: 'Enter a whole number of areas (1 or more).',
  priceInvalid: 'Enter a price of zero or more.',
  borderTooBig: 'The border is wider than the shape, so nothing is left inside it.',
  ringTooBig: 'The border is wider than the radius, so nothing is left inside it.',
  triangleImpossible: 'Those three edges cannot make a triangle — each one must be shorter than the other two together.',
  angleRange: 'Enter an angle greater than 0 and no more than a full turn.',
} as const;

/* ------------------------------------------------------------------ */
/* The nine specs                                                      */
/* ------------------------------------------------------------------ */

const len = (name: string, label: string): ShapeField => ({ name, label, kind: 'length' });

export const SHAPES: ShapeSpec[] = [
  {
    key: 'rectangle',
    title: 'Rectangle',
    lede: 'A plain four-sided area — a room, a slab, a lawn.',
    fields: [len('d1', 'Length'), len('d2', 'Width')],
    area: ([l, w]) => areaRectangle(l, w),
  },
  {
    key: 'rectangle-border',
    title: 'Rectangle Border',
    lede: 'The band around the inside edge of a rectangle — a walkway or a surround.',
    fields: [len('d1', 'Length'), len('d2', 'Width'), len('d3', 'Border Width')],
    area: ([l, w, b]) => areaRectangleBorder(l, w, b),
    check: ([l, w, b]) => (2 * b >= Math.min(l, w) ? MSG.borderTooBig : null),
  },
  {
    key: 'circle',
    title: 'Circle',
    lede: 'A round area, measured across the middle.',
    fields: [len('d1', 'Diameter')],
    area: ([d]) => areaCircle(d),
  },
  {
    key: 'ring',
    title: 'Ring',
    lede: 'The band around the inside edge of a circle.',
    fields: [len('d1', 'Outer Diameter'), len('d2', 'Border Width')],
    area: ([d, b]) => areaRing(d, b),
    check: ([d, b]) => (b >= d / 2 ? MSG.ringTooBig : null),
  },
  {
    key: 'triangle-edges',
    title: 'Triangle with Edge Lengths',
    lede: 'Three sides measured, no angles needed.',
    fields: [len('d1', 'Edge 1 (a)'), len('d2', 'Edge 2 (b)'), len('d3', 'Edge 3 (c)')],
    area: ([a, b, c]) => areaTriangleEdges(a, b, c),
    check: ([a, b, c]) =>
      a + b <= c || a + c <= b || b + c <= a ? MSG.triangleImpossible : null,
  },
  {
    key: 'triangle-base',
    title: 'Triangle with Base & Height',
    lede: 'One side and the perpendicular height to it.',
    fields: [len('d1', 'Base'), len('d2', 'Height')],
    area: ([b, h]) => areaTriangleBaseHeight(b, h),
  },
  {
    key: 'trapezoid',
    title: 'Trapezoid',
    lede: 'Two parallel sides and the distance between them.',
    fields: [len('d1', 'Base 1'), len('d2', 'Base 2'), len('d3', 'Height')],
    area: ([b1, b2, h]) => areaTrapezoid(b1, b2, h),
  },
  {
    key: 'sector',
    title: 'Sector',
    lede: 'A wedge of a circle — a fan, a curved corner.',
    fields: [len('d1', 'Radius'), { name: 'd2', label: 'Angle', kind: 'angle' }],
    area: ([r, rad]) => areaSector(r, rad),
    check: ([, rad]) => (rad <= 0 || rad > 2 * Math.PI ? MSG.angleRange : null),
  },
  {
    key: 'parallelogram',
    title: 'Parallelogram',
    lede: 'A slanted rectangle — base times perpendicular height.',
    fields: [len('d1', 'Base'), len('d2', 'Height')],
    area: ([b, h]) => areaParallelogram(b, h),
  },
];

export const shapeByKey = (key: ShapeKey): ShapeSpec => SHAPES.find((s) => s.key === key)!;

/* ------------------------------------------------------------------ */
/* Values + computation                                                */
/* ------------------------------------------------------------------ */

export interface ShapeValues {
  /** Raw dimension entries, keyed by field name. */
  dims: Record<string, string>;
  /** The unit chosen beside each dimension. */
  units: Record<string, string>;
  quantity: string;
  price: string;
  priceUnit: string;
}

export interface ShapeComputed {
  key: ShapeKey;
  values: ShapeValues;
  /** Dimensions converted to feet (an angle to radians). */
  converted: number[];
  /** One shape's area. */
  areaSqFt: number;
  quantity: number;
  /** Area × quantity — the figure on show. */
  totalSqFt: number;
  price: number;
  priceUnit: AreaUnit;
  cost: number;
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

/** A whole count of areas; blank means the neutral single area. */
function parseQuantity(raw: string): number | 'invalid' {
  const s = (raw ?? '').trim();
  if (s === '') return 1;
  if (!/^\d+$/.test(s)) return 'invalid';
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) return 'invalid';
  return n;
}

/** A price of zero or more; blank means no cost estimate. */
function parsePrice(raw: string): number | 'invalid' {
  const s = (raw ?? '').trim();
  if (s === '') return 0;
  if (!/^\d+\.?\d*$|^\.\d+$/.test(s)) return 'invalid';
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

const asAreaUnit = (raw: string): AreaUnit =>
  (AREA_UNITS.some((u) => u.value === raw) ? raw : 'sqft') as AreaUnit;

/** Each dimension in feet, or an angle in radians. NaN where the entry is unusable. */
export function convertDims(spec: ShapeSpec, v: ShapeValues): number[] {
  return spec.fields.map((f) => {
    const parsed = parsePositive(v.dims[f.name] ?? '');
    if (typeof parsed !== 'number') return Number.NaN;
    if (f.kind === 'angle') return toRadians(parsed, (v.units[f.name] as AngleUnit) ?? 'deg');
    return toFeet(parsed, (v.units[f.name] as LengthUnit) ?? 'ft');
  });
}

export function validateShape(spec: ShapeSpec, v: ShapeValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  for (const f of spec.fields) {
    const parsed = parsePositive(v.dims[f.name] ?? '');
    if (parsed === 'empty') fieldErrors[f.name] = MSG.required;
    else if (parsed === 'invalid') fieldErrors[f.name] = MSG.invalid;
  }
  if (parseQuantity(v.quantity) === 'invalid') fieldErrors.quantity = MSG.quantityInvalid;
  if (parsePrice(v.price) === 'invalid') fieldErrors.price = MSG.priceInvalid;
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  // Only once every field is individually sound can a cross-field impossibility be judged.
  const cross = spec.check?.(convertDims(spec, v));
  if (cross) return { ok: false, formError: cross };
  return { ok: true };
}

export function computeShape(spec: ShapeSpec, v: ShapeValues): ShapeComputed {
  const converted = convertDims(spec, v);
  const areaSqFt = converted.every(Number.isFinite) ? spec.area(converted) : Number.NaN;
  const q = parseQuantity(v.quantity);
  const quantity = q === 'invalid' ? Number.NaN : q;
  const p = parsePrice(v.price);
  const price = p === 'invalid' ? Number.NaN : p;
  const priceUnit = asAreaUnit(v.priceUnit);
  const totalSqFt = areaSqFt * quantity;
  return {
    key: spec.key,
    values: v,
    converted,
    areaSqFt,
    quantity,
    totalSqFt,
    price,
    priceUnit,
    cost: fromSqFt(totalSqFt, priceUnit) * price,
  };
}

/** The total area, but only when everything on show reconciles with a recompute. */
export function completeShapeValue(spec: ShapeSpec, r: ShapeComputed): number {
  if (r.key !== spec.key) return Number.NaN;
  if (!r.converted.every((n) => Number.isFinite(n) && n > 0)) return Number.NaN;
  if (!Number.isInteger(r.quantity) || r.quantity < 1) return Number.NaN;
  if (!Number.isFinite(r.price) || r.price < 0) return Number.NaN;
  if (!Number.isFinite(r.areaSqFt) || r.areaSqFt <= 0) return Number.NaN;
  if (!Number.isFinite(r.totalSqFt) || r.totalSqFt <= 0) return Number.NaN;
  if (spec.check?.(r.converted)) return Number.NaN;

  const reConverted = convertDims(spec, r.values);
  if (reConverted.length !== r.converted.length) return Number.NaN;
  for (let i = 0; i < reConverted.length; i += 1) {
    if (reConverted[i] !== r.converted[i]) return Number.NaN;
  }
  const reArea = spec.area(reConverted);
  if (reArea !== r.areaSqFt) return Number.NaN;
  if (reArea * r.quantity !== r.totalSqFt) return Number.NaN;

  const reCost = fromSqFt(r.totalSqFt, r.priceUnit) * r.price;
  if (!Number.isFinite(reCost) || reCost !== r.cost) return Number.NaN;
  return r.totalSqFt;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface OtherUnitRow {
  key: AreaUnit;
  label: string;
  value: string;
}

export interface ShapePresentation {
  /** "1980.5595166746" — unrounded, as the reference prints it. */
  area: string;
  /** "Square Feet". */
  areaUnit: string;
  a11y: string;
  quantityNote: string;
  cost: string;
  costLabel: string;
  others: OtherUnitRow[];
}

const money = (n: number): string =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export function presentShape(r: ShapeComputed): ShapePresentation {
  const unitLabel = (u: AreaUnit) => AREA_UNITS.find((a) => a.value === u)!;
  return {
    area: formatExactArea(r.totalSqFt),
    areaUnit: 'Square Feet',
    a11y: `${formatExactArea(r.totalSqFt)} square feet`,
    quantityNote:
      r.quantity > 1
        ? `${formatExactArea(r.areaSqFt)} square feet each, for ${r.quantity} areas.`
        : '',
    cost: r.price > 0 ? money(r.cost) : '',
    costLabel: r.price > 0 ? `Cost at ${money(r.price)} per ${unitLabel(r.priceUnit).singular}` : '',
    others: AREA_UNITS.filter((u) => u.value !== 'sqft').map((u) => ({
      key: u.value,
      label: u.plural,
      value: formatExactArea(fromSqFt(r.totalSqFt, u.value)),
    })),
  };
}

export function describeShape(spec: ShapeSpec, r: ShapeComputed): string {
  return `${spec.title} area: ${formatExactArea(r.totalSqFt)} square feet.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const value = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';

export function readShapeValues(root: HTMLElement, spec: ShapeSpec): ShapeValues {
  const dims: Record<string, string> = {};
  const units: Record<string, string> = {};
  for (const f of spec.fields) {
    dims[f.name] = value(root, f.name);
    units[f.name] = value(root, `${f.name}Unit`) || (f.kind === 'angle' ? 'deg' : 'ft');
  }
  return {
    dims,
    units,
    quantity: value(root, 'quantity'),
    price: value(root, 'price'),
    priceUnit: value(root, 'priceUnit') || 'sqft',
  };
}

/** One binding per shape, built from its spec — never nine hand-written bindings. */
export function makeShapeBinding(spec: ShapeSpec): FormCalculatorBinding<ShapeValues, ShapeComputed> {
  return {
    readValues: (root) => readShapeValues(root, spec),
    validate: (v) => validateShape(spec, v),
    compute: (v) => computeShape(spec, v),
    resultValue: (r) => completeShapeValue(spec, r),
    describeResult: (r) => describeShape(spec, r),
    renderResult(result, context: FormRenderContext) {
      const p = presentShape(result);
      const set = (sel: string, text: string) => {
        const el = context.result.querySelector<HTMLElement>(sel);
        if (el) el.textContent = text;
      };
      set('[data-result-when~="valid"] [data-result-value]', p.area);
      set('[data-result-when~="valid"] [data-result-value-a11y]', p.a11y);
      set('[data-sf-area-unit]', p.areaUnit);

      const note = context.result.querySelector<HTMLElement>('[data-sf-quantity-note]');
      if (note) {
        note.textContent = p.quantityNote;
        note.hidden = p.quantityNote === '';
      }
      const costRow = context.result.querySelector<HTMLElement>('[data-sf-cost-row]');
      if (costRow) costRow.hidden = p.cost === '';
      set('[data-sf-cost]', p.cost);
      set('[data-sf-cost-label]', p.costLabel);

      for (const row of p.others) {
        set(`[data-sf-other="${row.key}"] [data-sf-other-value]`, row.value);
      }
    },
    resetValues(root, _mode: ResetMode) {
      for (const f of spec.fields) {
        const el = root.querySelector<HTMLInputElement>(`[name="${f.name}"]`);
        if (el) el.value = '';
        const unit = root.querySelector<HTMLSelectElement>(`[name="${f.name}Unit"]`);
        if (unit) unit.value = f.kind === 'angle' ? 'deg' : 'ft';
      }
      const qty = root.querySelector<HTMLInputElement>('[name="quantity"]');
      if (qty) qty.value = '1';
      const price = root.querySelector<HTMLInputElement>('[name="price"]');
      if (price) price.value = '';
      const priceUnit = root.querySelector<HTMLSelectElement>('[name="priceUnit"]');
      if (priceUnit) priceUnit.value = 'sqft';
    },
  };
}

/**
 * Example values for the labelled worked result each shape shows on load.
 *
 * These are OURS, not the visitor's: the runtime computes them and calls the binding's own
 * renderResult, so the example reuses the real result markup and can never drift from the
 * engine. The visitor's own fields load and stay empty behind it.
 */
export function shapeExampleValues(spec: ShapeSpec): ShapeValues {
  const byKey: Partial<Record<ShapeKey, number[]>> = {
    rectangle: [20, 15],
    'rectangle-border': [20, 15, 1],
    circle: [12],
    ring: [12, 1],
    'triangle-edges': [30, 45, 50],
    'triangle-base': [20, 15],
    trapezoid: [20, 30, 15],
    sector: [12, 90],
    parallelogram: [20, 15],
  };
  const numbers = byKey[spec.key] ?? spec.fields.map(() => 10);
  const dims: Record<string, string> = {};
  const units: Record<string, string> = {};
  spec.fields.forEach((f, i) => {
    dims[f.name] = String(numbers[i]);
    units[f.name] = f.kind === 'angle' ? 'deg' : 'ft';
  });
  return { dims, units, quantity: '1', price: '', priceUnit: 'sqft' };
}

/** The first shape's example, for the fleet-wide labelled-example check. */
export const SQUARE_FOOTAGE_EXAMPLE_VALUES = shapeExampleValues(SHAPES[0]);
export const squareFootageBinding = makeShapeBinding(SHAPES[0]);

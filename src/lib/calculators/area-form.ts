/**
 * Area form layer — ONE binding, seven shapes.
 *
 * The reference puts seven separate calculators on the page: Rectangle, Triangle, Trapezoid,
 * Circle, Sector, Ellipse and Parallelogram. Each has its own fields, its own Calculate and its own
 * result, and none of them touches another.
 *
 * As with square footage, they do NOT need seven bindings: a shape is a list of fields plus one
 * area formula, so `AreaShapeSpec` holds that and `makeAreaBinding` turns a spec into a binding.
 *
 * The one rule worth stating plainly: every measurement carries its own unit, but a shape has only
 * one answer, so each dimension is converted into the FIRST field's unit before the formula runs
 * and the answer is reported in that unit squared. When every unit matches — the ordinary case, and
 * every case the reference shows — this is exactly what the reference prints. When they differ, the
 * answer stays in the unit of the first thing the visitor measured, which is the only choice that
 * needs no explaining.
 *
 * Every displayed figure is reconciled against a recompute by the complete-result guard in
 * `resultValue`. There is no `isUsableResult`.
 */
import {
  areaRectangle,
  areaTriangle,
  areaTrapezoid,
  areaCircle,
  areaSector,
  areaEllipse,
  areaParallelogram,
  areaSteps,
  formatArea,
  squaredLabel,
  type AreaShapeKey,
  type AreaStep,
} from './area';
import {
  convertLength,
  toRadians,
  squaredUnitToSqFt,
  fromSqFt,
  isLengthUnit,
  AREA_UNITS,
  type LengthUnit,
  type AngleUnit,
} from './area-units';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export const DEFAULT_UNIT: LengthUnit = 'm';

export interface AreaField {
  /** Field name, unique within its own form only. */
  name: string;
  label: string;
  kind: 'length' | 'angle';
}

export interface AreaShapeSpec {
  key: AreaShapeKey;
  title: string;
  /** One short line under the heading saying what the shape is. */
  lede: string;
  fields: AreaField[];
  /** Area in the first length field's unit, squared. An angle arrives in DEGREES. */
  area(values: number[]): number;
  /** A cross-field impossibility the individual fields cannot catch. */
  check?(values: number[]): string | null;
  /** An extra note the reference shows beside this shape. */
  note?: { text: string; href: string; linkText: string };
}

export const MSG = {
  required: 'Enter a value.',
  invalid: 'Enter a number greater than zero.',
  triangleImpossible:
    'Those three edges cannot make a triangle — each one must be shorter than the other two together.',
  angleRange: 'Enter an angle greater than 0 and no more than a full turn.',
} as const;

const len = (name: string, label: string): AreaField => ({ name, label, kind: 'length' });

/* ------------------------------------------------------------------ */
/* The seven specs                                                     */
/* ------------------------------------------------------------------ */

export const AREA_SHAPES: AreaShapeSpec[] = [
  {
    key: 'rectangle',
    title: 'Rectangle',
    lede: 'Four right angles — a room, a plot, a sheet.',
    fields: [len('d1', 'Length (l)'), len('d2', 'Width (w)')],
    area: ([l, w]) => areaRectangle(l, w),
  },
  {
    key: 'triangle',
    title: 'Triangle',
    lede: 'Three sides measured, no angles needed.',
    fields: [len('d1', 'Edge 1 (a)'), len('d2', 'Edge 2 (b)'), len('d3', 'Edge 3 (c)')],
    area: ([a, b, c]) => areaTriangle(a, b, c),
    check: ([a, b, c]) => (a + b <= c || a + c <= b || b + c <= a ? MSG.triangleImpossible : null),
    note: {
      text: 'to determine all three edges of the triangle given other parameters.',
      href: '/math/triangle-calculator',
      linkText: 'Use the Triangle Calculator',
    },
  },
  {
    key: 'trapezoid',
    title: 'Trapezoid',
    lede: 'Two parallel sides and the distance between them.',
    fields: [len('d1', 'Base 1 (b₁)'), len('d2', 'Base 2 (b₂)'), len('d3', 'Height (h)')],
    area: ([b1, b2, h]) => areaTrapezoid(b1, b2, h),
  },
  {
    key: 'circle',
    title: 'Circle',
    lede: 'Measured from the centre out — the radius, not the diameter.',
    fields: [len('d1', 'Radius (r)')],
    area: ([r]) => areaCircle(r),
  },
  {
    key: 'sector',
    title: 'Sector',
    lede: 'A wedge of a circle, cut by an angle at the centre.',
    fields: [len('d1', 'Radius (r)'), { name: 'd2', label: 'Angle (A)', kind: 'angle' }],
    area: ([r, deg]) => areaSector(r, deg),
    check: ([, deg]) => (deg <= 0 || deg > 360 ? MSG.angleRange : null),
  },
  {
    key: 'ellipse',
    title: 'Ellipse',
    lede: 'A stretched circle — half its width and half its height.',
    fields: [len('d1', 'Semi-major Axes (a)'), len('d2', 'Semi-minor Axes (b)')],
    area: ([a, b]) => areaEllipse(a, b),
  },
  {
    key: 'parallelogram',
    title: 'Parallelogram',
    lede: 'A slanted rectangle — base times perpendicular height.',
    fields: [len('d1', 'Base (b)'), len('d2', 'Height (h)')],
    area: ([b, h]) => areaParallelogram(b, h),
  },
];

export const areaShapeByKey = (key: AreaShapeKey): AreaShapeSpec =>
  AREA_SHAPES.find((s) => s.key === key)!;

/* ------------------------------------------------------------------ */
/* Values + computation                                                */
/* ------------------------------------------------------------------ */

export interface AreaValues {
  /** Raw dimension entries, keyed by field name. */
  dims: Record<string, string>;
  /** The unit chosen beside each dimension. */
  units: Record<string, string>;
}

export interface AreaComputed {
  key: AreaShapeKey;
  values: AreaValues;
  /** The unit the answer is in — the first length field's. */
  unit: LengthUnit;
  /** Dimensions converted into `unit` (an angle into DEGREES). */
  converted: number[];
  /** The area, in `unit` squared. */
  area: number;
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

const asLengthUnit = (raw: string): LengthUnit => (isLengthUnit(raw) ? raw : DEFAULT_UNIT);

/** The unit the answer is reported in: whatever the first length field was measured in. */
export function resultUnit(spec: AreaShapeSpec, v: AreaValues): LengthUnit {
  const first = spec.fields.find((f) => f.kind === 'length');
  return asLengthUnit(first ? (v.units[first.name] ?? '') : '');
}

/** Every dimension in the answer's unit; an angle in degrees. NaN where an entry is unusable. */
export function convertDims(spec: AreaShapeSpec, v: AreaValues): number[] {
  const target = resultUnit(spec, v);
  return spec.fields.map((f) => {
    const parsed = parsePositive(v.dims[f.name] ?? '');
    if (typeof parsed !== 'number') return Number.NaN;
    if (f.kind === 'angle') {
      const unit = (v.units[f.name] as AngleUnit) ?? 'deg';
      // The formula is stated in degrees, so a radian entry is brought to degrees, not the reverse.
      return unit === 'rad' ? (parsed * 180) / Math.PI : parsed;
    }
    return convertLength(parsed, asLengthUnit(v.units[f.name] ?? ''), target);
  });
}

export function validateArea(spec: AreaShapeSpec, v: AreaValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  for (const f of spec.fields) {
    const parsed = parsePositive(v.dims[f.name] ?? '');
    if (parsed === 'empty') fieldErrors[f.name] = MSG.required;
    else if (parsed === 'invalid') fieldErrors[f.name] = MSG.invalid;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  // Only once every field is individually sound can a cross-field impossibility be judged.
  const cross = spec.check?.(convertDims(spec, v));
  if (cross) return { ok: false, formError: cross };
  return { ok: true };
}

export function computeArea(spec: AreaShapeSpec, v: AreaValues): AreaComputed {
  const converted = convertDims(spec, v);
  const area = converted.every(Number.isFinite) ? spec.area(converted) : Number.NaN;
  return { key: spec.key, values: v, unit: resultUnit(spec, v), converted, area };
}

/** The area, but only when everything on show reconciles with a recompute. */
export function completeAreaValue(spec: AreaShapeSpec, r: AreaComputed): number {
  if (r.key !== spec.key) return Number.NaN;
  if (!r.converted.every((n) => Number.isFinite(n) && n > 0)) return Number.NaN;
  if (!Number.isFinite(r.area) || r.area <= 0) return Number.NaN;
  if (spec.check?.(r.converted)) return Number.NaN;
  if (resultUnit(spec, r.values) !== r.unit) return Number.NaN;

  const reConverted = convertDims(spec, r.values);
  if (reConverted.length !== r.converted.length) return Number.NaN;
  for (let i = 0; i < reConverted.length; i += 1) {
    if (reConverted[i] !== r.converted[i]) return Number.NaN;
  }
  if (spec.area(reConverted) !== r.area) return Number.NaN;
  return r.area;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface OtherUnitRow {
  key: string;
  label: string;
  value: string;
}

export interface AreaPresentation {
  /** The worked formula, with the entered numbers substituted. */
  steps: AreaStep[];
  /** "1884.9555921539". */
  answer: string;
  /** "meters²". */
  answerUnit: string;
  a11y: string;
  /** True when the units entered were not all the same, so the answer's unit needs saying. */
  mixedUnits: boolean;
  others: OtherUnitRow[];
}

export function presentArea(spec: AreaShapeSpec, r: AreaComputed): AreaPresentation {
  const unitLabel = squaredLabel(r.unit);
  const lengthUnits = spec.fields
    .filter((f) => f.kind === 'length')
    .map((f) => r.values.units[f.name]);
  const sqft = squaredUnitToSqFt(r.area, r.unit);
  return {
    steps: areaSteps(spec.key, r.converted, r.unit, r.area),
    answer: formatArea(r.area),
    answerUnit: unitLabel,
    a11y: `${formatArea(r.area)} square ${unitLabel.replace('²', '')}`,
    mixedUnits: new Set(lengthUnits).size > 1,
    others: AREA_UNITS.map((u) => ({
      key: u.value,
      label: u.plural,
      value: formatArea(fromSqFt(sqft, u.value)),
    })),
  };
}

export function describeArea(spec: AreaShapeSpec, r: AreaComputed): string {
  return `${spec.title} area: ${formatArea(r.area)} square ${squaredLabel(r.unit).replace('²', '')}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const value = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';

export function readAreaValues(root: HTMLElement, spec: AreaShapeSpec): AreaValues {
  const dims: Record<string, string> = {};
  const units: Record<string, string> = {};
  for (const f of spec.fields) {
    dims[f.name] = value(root, f.name);
    units[f.name] = value(root, `${f.name}Unit`) || (f.kind === 'angle' ? 'deg' : DEFAULT_UNIT);
  }
  return { dims, units };
}

/** One binding per shape, built from its spec — never seven hand-written bindings. */
export function makeAreaBinding(spec: AreaShapeSpec): FormCalculatorBinding<AreaValues, AreaComputed> {
  return {
    readValues: (root) => readAreaValues(root, spec),
    validate: (v) => validateArea(spec, v),
    compute: (v) => computeArea(spec, v),
    resultValue: (r) => completeAreaValue(spec, r),
    describeResult: (r) => describeArea(spec, r),
    renderResult(result, context: FormRenderContext) {
      const p = presentArea(spec, result);
      const set = (sel: string, text: string) => {
        const el = context.result.querySelector<HTMLElement>(sel);
        if (el) el.textContent = text;
      };

      // The working is rebuilt each time: its LENGTH varies by shape and by whether a π multiple
      // is worth showing, so a fixed set of slots would either truncate it or leave gaps.
      const work = context.result.querySelector<HTMLElement>('[data-ar-steps]');
      if (work) {
        work.textContent = '';
        for (const step of p.steps) {
          const row = document.createElement('div');
          row.className = 'ar-step';
          if (step.final) row.classList.add('ar-step--final');

          const label = document.createElement('span');
          label.className = 'ar-step__label';
          label.textContent = step.label ?? '';
          row.appendChild(label);

          // Spaces around the equals sign are real characters, not just a grid gap, so the
          // working copies and pastes as "Area = l × w" and reads aloud that way too.
          const eq = document.createElement('span');
          eq.className = 'ar-step__eq';
          eq.textContent = ' = ';
          row.appendChild(eq);

          const expr = document.createElement('span');
          expr.className = 'ar-step__expr';

          // The figure gets its own element so the result-value contract reads the number alone,
          // with the unit as a sibling rather than swept into it.
          const figure = document.createElement('span');
          figure.textContent = step.expression;
          // The last line IS the answer, so it is what the fleet's result-value contract points at.
          if (step.final) figure.setAttribute('data-result-value', '');
          expr.appendChild(figure);

          if (step.unit) {
            const unit = document.createElement('span');
            unit.className = 'ar-step__unit';
            unit.textContent = ` ${step.unit}`;
            expr.appendChild(unit);
          }
          row.appendChild(expr);
          work.appendChild(row);
        }
      }

      set('[data-result-when~="valid"] [data-result-value-a11y]', p.a11y);

      const mixed = context.result.querySelector<HTMLElement>('[data-ar-mixed]');
      if (mixed) mixed.hidden = !p.mixedUnits;

      for (const row of p.others) {
        set(`[data-ar-other="${row.key}"] [data-ar-other-value]`, row.value);
      }
    },
    resetValues(root, _mode: ResetMode) {
      for (const f of spec.fields) {
        const el = root.querySelector<HTMLInputElement>(`[name="${f.name}"]`);
        if (el) el.value = '';
        const unit = root.querySelector<HTMLSelectElement>(`[name="${f.name}Unit"]`);
        if (unit) unit.value = f.kind === 'angle' ? 'deg' : DEFAULT_UNIT;
      }
    },
  };
}

/**
 * Example values for the labelled worked result each shape shows on load.
 *
 * These are OURS, not the visitor's: the runtime computes them and calls the binding's own
 * renderResult, so the example reuses the real result markup and can never drift from the engine.
 * The visitor's own fields load and stay empty behind it.
 */
export function areaExampleValues(spec: AreaShapeSpec): AreaValues {
  const byKey: Partial<Record<AreaShapeKey, number[]>> = {
    rectangle: [30, 20],
    triangle: [30, 45, 50],
    trapezoid: [30, 45, 20],
    circle: [30],
    sector: [30, 90],
    ellipse: [30, 20],
    parallelogram: [30, 20],
  };
  const numbers = byKey[spec.key] ?? spec.fields.map(() => 10);
  const dims: Record<string, string> = {};
  const units: Record<string, string> = {};
  spec.fields.forEach((f, i) => {
    dims[f.name] = String(numbers[i]);
    units[f.name] = f.kind === 'angle' ? 'deg' : DEFAULT_UNIT;
  });
  return { dims, units };
}

/** The first shape's example, for the fleet-wide labelled-example check. */
export const AREA_EXAMPLE_VALUES = areaExampleValues(AREA_SHAPES[0]);
export const areaBinding = makeAreaBinding(AREA_SHAPES[0]);

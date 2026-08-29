/**
 * Volume form layer — ONE binding, eleven shapes.
 *
 * The reference puts eleven separate calculators on the page. As with area and square footage they
 * do not need eleven bindings: a shape is a list of fields plus one way of solving them, so
 * `VolumeShapeSpec` holds that and `makeVolumeBinding` turns a spec into a binding.
 *
 * Every measurement carries its own unit, but a shape has only one answer, so each dimension is
 * converted into the FIRST field's unit before the formula runs and the answer is reported in that
 * unit cubed — the same rule the area calculator uses.
 *
 * The spherical cap is the one shape that does not require every field: it needs any TWO of base
 * radius, ball radius and height, and from two radii it has TWO answers. That is carried in the
 * data (`requires: 'any-two'`, and a solution with more than one volume) rather than in a second
 * runtime, so the shared binding still serves it.
 */
import {
  volumeSolution,
  formatVolume,
  cubedLabel,
  capHeightsFromRadii,
  type VolumeShapeKey,
  type VolumeSolution,
} from './volume';
import { convertLength, isLengthUnit, UNIT_NOUN, type LengthUnit } from './area-units';
import type { FormulaStep } from './formula-steps';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export const DEFAULT_UNIT: LengthUnit = 'm';

export interface VolumeField {
  /** Field name, unique within its own form only. */
  name: string;
  label: string;
}

export interface VolumeShapeSpec {
  key: VolumeShapeKey;
  title: string;
  /** One short line under the heading saying what the shape is. */
  lede: string;
  fields: VolumeField[];
  /** `all` (default) needs every field; `any-two` needs two of three. */
  requires?: 'all' | 'any-two';
  /** An instruction the reference prints above the fields. */
  note?: string;
  /** A cross-field impossibility the individual fields cannot catch. */
  check?(values: (number | null)[]): string | null;
}

export const MSG = {
  required: 'Enter a value.',
  invalid: 'Enter a number greater than zero.',
  needTwo: 'Enter any two of the three values.',
  capRadii: 'The ball radius must be at least the base radius, or no cap fits on the ball.',
  capHeight: 'The height cannot be more than twice the ball radius.',
  tubeBore: 'The inner diameter must be smaller than the outer diameter.',
  frustumRadii: 'Enter two different radii, or use the cylinder calculator.',
} as const;

const f = (name: string, label: string): VolumeField => ({ name, label });

/* ------------------------------------------------------------------ */
/* The eleven specs, in the reference's order                          */
/* ------------------------------------------------------------------ */

export const VOLUME_SHAPES: VolumeShapeSpec[] = [
  {
    key: 'sphere',
    title: 'Sphere',
    lede: 'A ball, measured from its centre to its surface.',
    fields: [f('d1', 'Radius (r)')],
  },
  {
    key: 'cone',
    title: 'Cone',
    lede: 'A circular base tapering to a point.',
    fields: [f('d1', 'Base Radius (r)'), f('d2', 'Height (h)')],
  },
  {
    key: 'cube',
    title: 'Cube',
    lede: 'Six square faces — one measurement is enough.',
    fields: [f('d1', 'Edge Length (a)')],
  },
  {
    key: 'cylinder',
    title: 'Cylinder',
    lede: 'A circular base pulled straight up — a can, a pipe, a tank.',
    fields: [f('d1', 'Base Radius (r)'), f('d2', 'Height (h)')],
  },
  {
    key: 'rectangular-tank',
    title: 'Rectangular Tank',
    lede: 'A box — a room, a crate, a sump.',
    fields: [f('d1', 'Length (l)'), f('d2', 'Width (w)'), f('d3', 'Height (h)')],
  },
  {
    key: 'capsule',
    title: 'Capsule',
    lede: 'A cylinder with a hemisphere capping each end.',
    fields: [f('d1', 'Base Radius (r)'), f('d2', 'Height (h)')],
  },
  {
    key: 'spherical-cap',
    title: 'Spherical Cap',
    lede: 'A slice off the top of a ball — a dome, a dished end.',
    note: 'Please provide any two values below to calculate.',
    requires: 'any-two',
    fields: [f('d1', 'Base Radius (r)'), f('d2', 'Ball Radius (R)'), f('d3', 'Height (h)')],
    check: ([r, R, h]) => {
      if (r !== null && R !== null) return R < r ? MSG.capRadii : null;
      if (R !== null && h !== null) return h > 2 * R ? MSG.capHeight : null;
      return null;
    },
  },
  {
    key: 'conical-frustum',
    title: 'Conical Frustum',
    lede: 'A cone with its point cut off — a bucket, a plant pot.',
    fields: [f('d1', 'Top Radius (r)'), f('d2', 'Bottom Radius (R)'), f('d3', 'Height (h)')],
  },
  {
    key: 'ellipsoid',
    title: 'Ellipsoid',
    lede: 'A squashed or stretched ball, measured along three axes.',
    fields: [f('d1', 'Axis 1 (a)'), f('d2', 'Axis 2 (b)'), f('d3', 'Axis 3 (c)')],
  },
  {
    key: 'square-pyramid',
    title: 'Square Pyramid',
    lede: 'A square base rising to a point.',
    fields: [f('d1', 'Base Edge (a)'), f('d2', 'Height (h)')],
  },
  {
    key: 'tube',
    title: 'Tube',
    lede: 'A pipe — the outer cylinder less its bore, measured across.',
    fields: [f('d1', 'Outer Diameter (d1)'), f('d2', 'Inner Diameter (d2)'), f('d3', 'Length (l)')],
    check: ([d1, d2]) => (d1 !== null && d2 !== null && d2 >= d1 ? MSG.tubeBore : null),
  },
];

export const volumeShapeByKey = (key: VolumeShapeKey): VolumeShapeSpec =>
  VOLUME_SHAPES.find((s) => s.key === key)!;

/* ------------------------------------------------------------------ */
/* Values + computation                                                */
/* ------------------------------------------------------------------ */

export interface VolumeValues {
  dims: Record<string, string>;
  units: Record<string, string>;
}

export interface VolumeComputed {
  key: VolumeShapeKey;
  values: VolumeValues;
  /** The unit the answer is in — the first field's. */
  unit: LengthUnit;
  /** Dimensions converted into `unit`; `null` where a field was deliberately left blank. */
  converted: (number | null)[];
  solution: VolumeSolution;
}

/** A strictly positive finite decimal; empty and junk are told apart. */
function parsePositive(raw: string): number | 'empty' | 'invalid' {
  const s = (raw ?? '').trim();
  if (s === '') return 'empty';
  if (!/^\d+\.?\d*$|^\.\d+$/.test(s)) return 'invalid';
  const v = Number(s);
  if (!Number.isFinite(v) || v <= 0) return 'invalid';
  return v;
}

const asUnit = (raw: string): LengthUnit => (isLengthUnit(raw) ? raw : DEFAULT_UNIT);

/** The unit the answer is reported in: whatever the first field was measured in. */
export function resultUnit(spec: VolumeShapeSpec, v: VolumeValues): LengthUnit {
  return asUnit(v.units[spec.fields[0].name] ?? '');
}

/** Every dimension in the answer's unit; `null` for a blank field. */
export function convertDims(spec: VolumeShapeSpec, v: VolumeValues): (number | null)[] {
  const target = resultUnit(spec, v);
  return spec.fields.map((field) => {
    const parsed = parsePositive(v.dims[field.name] ?? '');
    if (parsed === 'empty') return null;
    if (parsed === 'invalid') return Number.NaN;
    return convertLength(parsed, asUnit(v.units[field.name] ?? ''), target);
  });
}

export function validateVolume(spec: VolumeShapeSpec, v: VolumeValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const anyTwo = spec.requires === 'any-two';
  let filled = 0;

  for (const field of spec.fields) {
    const parsed = parsePositive(v.dims[field.name] ?? '');
    if (parsed === 'invalid') fieldErrors[field.name] = MSG.invalid;
    else if (parsed === 'empty') {
      // A blank is only acceptable where the shape asks for a subset of its fields.
      if (!anyTwo) fieldErrors[field.name] = MSG.required;
    } else filled += 1;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  if (anyTwo && filled < 2) return { ok: false, formError: MSG.needTwo };

  const cross = spec.check?.(convertDims(spec, v));
  if (cross) return { ok: false, formError: cross };
  return { ok: true };
}

export function computeVolume(spec: VolumeShapeSpec, v: VolumeValues): VolumeComputed {
  const unit = resultUnit(spec, v);
  const converted = convertDims(spec, v);
  const usable = converted.every((x) => x === null || Number.isFinite(x));
  const solution = usable
    ? volumeSolution(spec.key, converted, unit)
    : { volumes: [], steps: [] as FormulaStep[] };
  return { key: spec.key, values: v, unit, converted, solution };
}

/** The headline volume, but only when everything on show reconciles with a recompute. */
export function completeVolumeValue(spec: VolumeShapeSpec, r: VolumeComputed): number {
  if (r.key !== spec.key) return Number.NaN;
  if (resultUnit(spec, r.values) !== r.unit) return Number.NaN;

  const filled = r.converted.filter((x) => x !== null);
  if (filled.length === 0) return Number.NaN;
  if (!filled.every((x) => Number.isFinite(x) && (x as number) > 0)) return Number.NaN;
  if (spec.requires === 'any-two') {
    if (filled.length < 2) return Number.NaN;
  } else if (r.converted.some((x) => x === null)) return Number.NaN;
  if (spec.check?.(r.converted)) return Number.NaN;

  const reConverted = convertDims(spec, r.values);
  if (reConverted.length !== r.converted.length) return Number.NaN;
  for (let i = 0; i < reConverted.length; i += 1) {
    if (reConverted[i] !== r.converted[i]) return Number.NaN;
  }
  const re = volumeSolution(spec.key, reConverted, r.unit);
  if (re.volumes.length !== r.solution.volumes.length) return Number.NaN;
  if (re.volumes.length === 0) return Number.NaN;
  for (let i = 0; i < re.volumes.length; i += 1) {
    if (re.volumes[i] !== r.solution.volumes[i]) return Number.NaN;
    if (!Number.isFinite(re.volumes[i]) || re.volumes[i] <= 0) return Number.NaN;
  }
  return r.solution.volumes[0];
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface VolumePresentation {
  steps: FormulaStep[];
  /** The headline figure, or both of them joined, for the announcement. */
  a11y: string;
  /** True when the units entered were not all the same. */
  mixedUnits: boolean;
}

export function presentVolume(spec: VolumeShapeSpec, r: VolumeComputed): VolumePresentation {
  const noun = UNIT_NOUN[r.unit];
  const spoken = r.solution.volumes.map((v) => `${formatVolume(v)} cubic ${noun}`);
  const used = spec.fields
    .filter((_, i) => r.converted[i] !== null)
    .map((field) => r.values.units[field.name]);
  return {
    steps: r.solution.steps,
    a11y:
      spoken.length > 1
        ? `Two possible results: ${spoken.join(', or ')}`
        : (spoken[0] ?? ''),
    mixedUnits: new Set(used).size > 1,
  };
}

export function describeVolume(spec: VolumeShapeSpec, r: VolumeComputed): string {
  const p = presentVolume(spec, r);
  return `${spec.title} volume: ${p.a11y}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const value = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';

export function readVolumeValues(root: HTMLElement, spec: VolumeShapeSpec): VolumeValues {
  const dims: Record<string, string> = {};
  const units: Record<string, string> = {};
  for (const field of spec.fields) {
    dims[field.name] = value(root, field.name);
    units[field.name] = value(root, `${field.name}Unit`) || DEFAULT_UNIT;
  }
  return { dims, units };
}

/** Render the working into a container using text APIs only — never markup from a string. */
export function renderSteps(container: HTMLElement, steps: FormulaStep[]): void {
  container.textContent = '';
  for (const step of steps) {
    if (step.kind === 'note' || step.kind === 'heading') {
      const p = document.createElement('p');
      p.className = step.kind === 'heading' ? 'vl-steps-heading' : 'vl-step-note';
      p.textContent = step.expression;
      container.appendChild(p);
      continue;
    }

    const row = document.createElement('div');
    row.className = 'vl-step';
    if (step.final) row.classList.add('vl-step--final');

    const label = document.createElement('span');
    label.className = 'vl-step__label';
    label.textContent = step.label ?? '';
    row.appendChild(label);

    // Spaces around the equals sign are real characters, not just a grid gap, so the working
    // copies and pastes as "Volume = 4/3 πr³" and reads aloud that way too.
    const eq = document.createElement('span');
    eq.className = 'vl-step__eq';
    eq.textContent = ' = ';
    row.appendChild(eq);

    const expr = document.createElement('span');
    expr.className = 'vl-step__expr';
    if (step.lead) {
      const lead = document.createElement('span');
      lead.textContent = step.lead;
      expr.appendChild(lead);
    }
    const figure = document.createElement('span');
    figure.className = 'vl-step__figure';
    figure.textContent = step.expression;
    expr.appendChild(figure);
    if (step.unit) {
      const unit = document.createElement('span');
      unit.className = 'vl-step__unit';
      unit.textContent = ` ${step.unit}`;
      expr.appendChild(unit);
    }
    row.appendChild(expr);
    container.appendChild(row);
  }

  // The fleet's result-value contract points at the FIRST headline figure.
  const first = container.querySelector<HTMLElement>('.vl-step--final .vl-step__figure');
  if (first) first.setAttribute('data-result-value', '');
}

/** One binding per shape, built from its spec — never eleven hand-written bindings. */
export function makeVolumeBinding(
  spec: VolumeShapeSpec,
): FormCalculatorBinding<VolumeValues, VolumeComputed> {
  return {
    readValues: (root) => readVolumeValues(root, spec),
    validate: (v) => validateVolume(spec, v),
    compute: (v) => computeVolume(spec, v),
    resultValue: (r) => completeVolumeValue(spec, r),
    describeResult: (r) => describeVolume(spec, r),
    renderResult(result, context: FormRenderContext) {
      const p = presentVolume(spec, result);
      const work = context.result.querySelector<HTMLElement>('[data-vl-steps]');
      if (work) renderSteps(work, p.steps);

      const a11y = context.result.querySelector<HTMLElement>(
        '[data-result-when~="valid"] [data-result-value-a11y]',
      );
      if (a11y) a11y.textContent = p.a11y;

      const mixed = context.result.querySelector<HTMLElement>('[data-vl-mixed]');
      if (mixed) mixed.hidden = !p.mixedUnits;
    },
    resetValues(root, _mode: ResetMode) {
      for (const field of spec.fields) {
        const el = root.querySelector<HTMLInputElement>(`[name="${field.name}"]`);
        if (el) el.value = '';
        const unit = root.querySelector<HTMLSelectElement>(`[name="${field.name}Unit"]`);
        if (unit) unit.value = DEFAULT_UNIT;
      }
    },
  };
}

/**
 * Example values for the labelled worked result each shape shows on load — the reference's own
 * numbers, so the example on screen is one the visitor can check against the source.
 *
 * These are OURS, not the visitor's: the runtime computes them and calls the binding's own
 * renderResult, so the example reuses the real result markup and can never drift from the engine.
 */
export function volumeExampleValues(spec: VolumeShapeSpec): VolumeValues {
  const byKey: Record<VolumeShapeKey, (number | null)[]> = {
    sphere: [33],
    cone: [11, 22],
    cube: [5],
    cylinder: [22, 7],
    'rectangular-tank': [8, 34, 66],
    capsule: [5, 8],
    'spherical-cap': [7, 9, null],
    'conical-frustum': [2, 4, 5],
    ellipsoid: [4, 6, 5],
    'square-pyramid': [3, 5],
    tube: [4, 1, 6],
  };
  const numbers = byKey[spec.key] ?? spec.fields.map(() => 1);
  const dims: Record<string, string> = {};
  const units: Record<string, string> = {};
  spec.fields.forEach((field, i) => {
    dims[field.name] = numbers[i] === null ? '' : String(numbers[i]);
    units[field.name] = DEFAULT_UNIT;
  });
  return { dims, units };
}

/** Re-exported so a caller checking a cap's two roots need not reach past this layer. */
export { capHeightsFromRadii };

/** The first shape's example, for the fleet-wide labelled-example check. */
export const VOLUME_EXAMPLE_VALUES = volumeExampleValues(VOLUME_SHAPES[0]);
export const volumeBinding = makeVolumeBinding(VOLUME_SHAPES[0]);

/**
 * Triangle form binding (R10D1 — standard-form wave, calculator #22; product family GEOMETRY, on the
 * standard-form runtime UNCHANGED — no `isUsableResult`). The final geometry migration.
 *
 * SSS: three side lengths → area (dominant) + perimeter, the three angles and the side/angle
 * classification. The pure `solveTriangleSSS` is UNCHANGED and frozen by triangle.test.ts; everything
 * here is at the VALIDATION / PRESENTATION boundary. Product decisions (R10D1):
 *   • Each side is required, finite and > 0 — empty / 0 / negative / non-finite are FIELD-level errors
 *     (never `Number()||0`). Only when all three sides are individually valid is the cross-field
 *     TRIANGLE INEQUALITY checked; a failure is ONE FORM-level error (`formError`) because no single
 *     side owns it — the runtime already carries `formError`, so no runtime change and no field is
 *     marked uniquely responsible.
 *   • A domain (inequality) failure never renders a partial result: the runtime computes only when
 *     validation passes, so the invalid state shows the form-level message with no geometry.
 *   • Every rendered figure must be a complete, finite triangle — the guard lives in `resultValue`
 *     (non-finite sentinel for a malformed result → the runtime's DEFAULT finite gate rejects it),
 *     so `isUsableResult` stays unused (the Inflation / Concrete precedent). This also backstops the
 *     frozen quirk where a NaN side returns `valid:true` with all-NaN geometry.
 *   • No unit selector: sides are unitless (perimeter in "units", area in "square units").
 */
import { solveTriangleSSS, type TriangleResult } from './triangle';
import { formatNumber } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export interface TriangleValues {
  a: string;
  b: string;
  c: string;
}

/** The computed model IS the pure formula's result (area, perimeter, three angles, classifications). */
export type TriangleComputed = TriangleResult;

const SIDE_TYPES: TriangleResult['sideType'][] = ['Equilateral', 'Isosceles', 'Scalene'];
const ANGLE_TYPES: TriangleResult['angleType'][] = ['Acute', 'Right', 'Obtuse'];

/** The single form-level domain message — announced and shown as the invalid heading's message. The
 *  fuller "sum of any two sides…" explanation is static visual context in the island, not announced. */
export const TRIANGLE_DOMAIN_ERROR = 'These side lengths cannot form a triangle.';

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type Parse = 'empty' | 'invalid' | number;

/** Finite and strictly > 0: a side length. */
function parsePositive(raw: string): Parse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

const SIDE_LABEL: Record<keyof TriangleValues, string> = { a: 'Side A', b: 'Side B', c: 'Side C' };

/**
 * Field-level validation first (each side finite and > 0). Only when all three sides are valid is the
 * strict triangle inequality checked as ONE form-level error — no single side is blamed. The inequality
 * mirrors the frozen formula exactly (`a + b <= c || a + c <= b || b + c <= a`), so a degenerate
 * equality is rejected.
 */
export function validateTriangleValues(values: TriangleValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const parsed: Record<keyof TriangleValues, Parse> = {
    a: parsePositive(values.a),
    b: parsePositive(values.b),
    c: parsePositive(values.c),
  };
  for (const key of ['a', 'b', 'c'] as const) {
    if (typeof parsed[key] !== 'number') fieldErrors[key] = `Enter ${SIDE_LABEL[key]} greater than zero.`;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  const a = parsed.a as number;
  const b = parsed.b as number;
  const c = parsed.c as number;
  if (a + b <= c || a + c <= b || b + c <= a) return { ok: false, formError: TRIANGLE_DOMAIN_ERROR };

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export function computeTriangle(values: TriangleValues): TriangleComputed {
  return solveTriangleSSS(Number(values.a), Number(values.b), Number(values.c));
}

/** A complete, finite triangle: valid flag set, area + perimeter finite and > 0, every angle finite,
 *  > 0 and < 180 with a sum ≈ 180, and both classifications within the known enums. Rejects the
 *  frozen `valid:true` all-NaN case a non-finite side would produce. */
export function isTriangleResultUsable(r: TriangleComputed): boolean {
  if (!r.valid) return false;
  const finitePos = (x: number) => Number.isFinite(x) && x > 0;
  if (!finitePos(r.area) || !finitePos(r.perimeter)) return false;
  const angles = [r.angleA, r.angleB, r.angleC];
  if (!angles.every((x) => Number.isFinite(x) && x > 0 && x < 180)) return false;
  if (Math.abs(r.angleA + r.angleB + r.angleC - 180) > 0.05) return false;
  if (!SIDE_TYPES.includes(r.sideType) || !ANGLE_TYPES.includes(r.angleType)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Presentation (pure)                                                 */
/* ------------------------------------------------------------------ */

const area3 = (r: TriangleComputed): string => formatNumber(r.area, 3);
/** "a right …" / "an acute …" / "an obtuse …" */
const article = (r: TriangleComputed): string => (r.angleType === 'Right' ? 'a' : 'an');
const kinds = (r: TriangleComputed): string => `${r.angleType.toLowerCase()} ${r.sideType.toLowerCase()}`;

/** Plain-language interpretation generated from the actual classifications (never invents equal
 *  angles). Equilateral notes equal angles; isosceles notes two equal sides; scalene states the area. */
export function interpretTriangle(r: TriangleComputed): string {
  const base = `This is ${article(r)} ${kinds(r)} triangle`;
  if (r.sideType === 'Equilateral') return `${base}. All three angles are equal.`;
  if (r.sideType === 'Isosceles') return `${base} with two equal sides.`;
  return `${base} with an area of ${area3(r)} square units.`;
}

/** Concise announcement — the dominant area + the classification, nothing else. */
export function describeTriangleResult(r: TriangleComputed): string {
  return `The triangle area is ${area3(r)} square units. It is ${article(r)} ${kinds(r)} triangle.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const deg = (n: number): string => `${formatNumber(n, 2)}°`;

export const triangleBinding: FormCalculatorBinding<TriangleValues, TriangleComputed> = {
  readValues(root) {
    return {
      a: input(root, 'a')?.value ?? '',
      b: input(root, 'b')?.value ?? '',
      c: input(root, 'c')?.value ?? '',
    };
  },

  validate: validateTriangleValues,

  compute: computeTriangle,

  /** Dominant area, but a NON-FINITE sentinel for any malformed / incomplete triangle so the runtime's
   *  DEFAULT finite gate moves it to the invalid state — keeps `isUsableResult` unimplemented. */
  resultValue(result) {
    return isTriangleResultUsable(result) ? result.area : NaN;
  },

  // No isUsableResult — the complete-result guard lives in resultValue (R10D1 decision).

  describeResult: describeTriangleResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const setText = (sel: string, text: string) => {
      const el = q(sel);
      if (el) el.textContent = text;
    };

    const label = q('[data-result-when~="valid"] [data-result-summary-label]');
    if (label) label.textContent = 'Triangle area';
    setText('[data-result-when~="valid"] [data-result-value]', area3(result));
    setText('[data-result-when~="valid"] [data-result-value-a11y]', `${area3(result)} square units`);
    setText('[data-tri-interpretation]', interpretTriangle(result));
    setText('[data-tri-perimeter]', formatNumber(result.perimeter, 3));
    setText('[data-tri-angle-a]', deg(result.angleA));
    setText('[data-tri-angle-b]', deg(result.angleB));
    setText('[data-tri-angle-c]', deg(result.angleC));
    setText('[data-tri-side-type]', result.sideType);
    setText('[data-tri-angle-type]', result.angleType);
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['a', 'b', 'c']) {
      const el = input(root, name);
      if (el) el.value = '';
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
export const TRIANGLE_EXAMPLE_VALUES: TriangleValues = { a: '3', b: '4', c: '5' };

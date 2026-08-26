/**
 * GPA form binding (R16B1 — Academic family pilot, 1 of 2; task-first).
 *
 * Wraps the UNCHANGED `calculateGPA` (weighted quality-points ÷ credit hours) and
 * the frozen `GRADE_POINTS` scale, and layers the visitor-facing contract the pure
 * function lacks: reading a calculator-owned set of DYNAMIC course rows, strict
 * per-row grade + credit validation, a form-level "at least one course with credit
 * hours" rule, and a complete-result guard.
 *
 * Own file — imports nothing from grade / any other calculator. The grade `<select>`
 * carries the LETTER label as its value ("A", "B+", …); this binding maps it to a
 * grade point through the unchanged `GRADE_POINTS` before calling the unchanged
 * `calculateGPA` (identical results, key-based validation). The complete-result
 * guard lives in `resultValue` as a NaN sentinel → the runtime's DEFAULT finite
 * gate; there is NO `isUsableResult` (a valid 0.0 GPA is a finite 0 the gate
 * accepts). The standard-form runtime is unchanged; the dynamic-row DOM is entirely
 * island-owned. No generic rows/repeater abstraction.
 */
import { calculateGPA, GRADE_POINTS, type GpaCourse, type GpaResult } from './gpa';
import { formatNumber } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** Letter → grade-point lookup, and the exact scale ceiling, both from the frozen map. */
const GRADE_LOOKUP = new Map(GRADE_POINTS.map((g) => [g.label, g.value] as const));
export const MAX_GPA = Math.max(...GRADE_POINTS.map((g) => g.value)); // 4.0

const TOL = 1e-9;
const FAIL = Number.NaN;

export interface GpaRowValue {
  /** Instance-local stable id assigned by the island (for per-row error targeting). */
  id: string;
  /** The selected GRADE_POINTS letter label, or '' when unselected. */
  grade: string;
  /** The raw credit-hours string. */
  credits: string;
}

export interface GpaFormValues {
  rows: GpaRowValue[];
}

export interface GpaComputed {
  /** The contributing (non-empty, valid) courses passed to calculateGPA. */
  courses: GpaCourse[];
  result: GpaResult;
}

export const MSG = {
  gradeRequired: 'Select a grade for this course.',
  gradeInvalid: 'Choose a grade from the list.',
  creditsRequired: 'Enter credit hours for this course.',
  creditsInvalid: 'Enter credit hours of zero or more.',
  noCourses: 'Add at least one course with a grade and credit hours greater than zero.',
} as const;

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export function readGpaValues(root: HTMLElement): GpaFormValues {
  const rows: GpaRowValue[] = [];
  root.querySelectorAll<HTMLElement>('[data-gpa-row]').forEach((row) => {
    const grade = row.querySelector<HTMLSelectElement>('[data-gpa-grade]')?.value ?? '';
    const credits = row.querySelector<HTMLInputElement>('[data-gpa-credits]')?.value ?? '';
    rows.push({ id: row.dataset.rowId ?? '', grade, credits });
  });
  return { rows };
}

/* ------------------------------------------------------------------ */
/* Parse + validate                                                    */
/* ------------------------------------------------------------------ */

/** A blank string → null (missing); a finite ≥ 0 number → the number; else 'invalid'. */
function parseCredits(raw: string): number | null | 'invalid' {
  const s = raw.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
}

const isEmptyRow = (r: GpaRowValue): boolean => r.grade === '' && r.credits.trim() === '';

export function validateGpa(values: GpaFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  let contributingCredits = 0;

  for (const r of values.rows) {
    if (isEmptyRow(r)) continue; // a wholly-empty row is ignored (unless it leaves no course — handled below)

    // Grade: required, must be an exact GRADE_POINTS letter.
    const gradeOk = r.grade !== '' && GRADE_LOOKUP.has(r.grade);
    if (r.grade === '') fieldErrors[`grade-${r.id}`] = MSG.gradeRequired;
    else if (!GRADE_LOOKUP.has(r.grade)) fieldErrors[`grade-${r.id}`] = MSG.gradeInvalid;

    // Credits: required, finite, ≥ 0 (0 is a valid non-contributing value).
    const credits = parseCredits(r.credits);
    if (credits === null) fieldErrors[`credits-${r.id}`] = MSG.creditsRequired;
    else if (credits === 'invalid') fieldErrors[`credits-${r.id}`] = MSG.creditsInvalid;

    if (gradeOk && typeof credits === 'number' && credits > 0) contributingCredits += credits;
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  // No per-row error, but nothing actually contributes credit hours.
  if (contributingCredits <= 0) return { ok: false, formError: MSG.noCourses };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Compute                                                             */
/* ------------------------------------------------------------------ */

export function computeGpa(values: GpaFormValues): GpaComputed {
  const courses: GpaCourse[] = [];
  for (const r of values.rows) {
    if (isEmptyRow(r)) continue;
    const gradePoints = GRADE_LOOKUP.get(r.grade);
    const credits = parseCredits(r.credits);
    if (gradePoints === undefined || typeof credits !== 'number') continue; // defensive; validation gates this
    courses.push({ gradePoints, credits });
  }
  return { courses, result: calculateGPA(courses) };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (in resultValue — NO isUsableResult)          */
/* ------------------------------------------------------------------ */

/**
 * Returns the finite GPA ONLY when the whole result is well-formed — at least one
 * course, every grade point in [0, MAX_GPA] and every credit finite ≥ 0, positive
 * total credits, totals reconciling with the rows, and a `calculateGPA` recompute
 * matching — with the GPA itself finite and within the exact frozen scale bounds
 * [0, 4.0]. A valid GPA of exactly 0 is returned (the default gate accepts a finite
 * 0); a valid 4.0 is returned. Otherwise NaN → the default gate renders it invalid.
 */
export function completeGpaValue(c: GpaComputed): number {
  const { courses, result } = c;
  if (!courses.length) return FAIL;

  let expCredits = 0;
  let expQuality = 0;
  for (const co of courses) {
    if (!Number.isFinite(co.gradePoints) || co.gradePoints < 0 || co.gradePoints > MAX_GPA) return FAIL;
    if (!Number.isFinite(co.credits) || co.credits < 0) return FAIL;
    expCredits += co.credits;
    expQuality += co.gradePoints * co.credits;
  }

  const { gpa, totalCredits, totalQualityPoints } = result;
  if (!Number.isFinite(totalCredits) || totalCredits <= 0) return FAIL;
  if (!Number.isFinite(totalQualityPoints)) return FAIL;
  if (Math.abs(totalCredits - expCredits) > TOL) return FAIL;
  if (Math.abs(totalQualityPoints - expQuality) > TOL) return FAIL;

  const re = calculateGPA(courses);
  if (!Number.isFinite(re.gpa) || Math.abs(re.gpa - gpa) > TOL) return FAIL;
  if (!Number.isFinite(gpa) || gpa < 0 || gpa > MAX_GPA + TOL) return FAIL;
  return gpa;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface GpaPresentation {
  gpa: string;
  credits: string;
  interpretation: string;
}

const creditWord = (n: number): string => `credit hour${n === 1 ? '' : 's'}`;

export function presentGpa(c: GpaComputed): GpaPresentation {
  const gpa = c.result.gpa.toFixed(2);
  const credits = formatNumber(c.result.totalCredits);
  const n = c.courses.length;
  return {
    gpa,
    credits,
    interpretation: `A ${gpa} GPA — the credit-weighted average of ${n} course${n === 1 ? '' : 's'} across ${credits} ${creditWord(c.result.totalCredits)}.`,
  };
}

export function describeGpa(c: GpaComputed): string {
  return `GPA: ${c.result.gpa.toFixed(2)} across ${formatNumber(c.result.totalCredits)} ${creditWord(c.result.totalCredits)}.`;
}

export function renderGpaResult(result: GpaComputed, context: FormRenderContext): void {
  const p = presentGpa(result);
  const q = (sel: string) => context.result.querySelector<HTMLElement>(sel);
  const primary = q('[data-result-when~="valid"] [data-result-value]');
  if (primary) primary.textContent = p.gpa;
  const a11y = q('[data-result-when~="valid"] [data-result-value-a11y]');
  if (a11y) a11y.textContent = `GPA ${p.gpa} across ${p.credits} ${creditWord(result.result.totalCredits)}`;
  const total = q('[data-gpa-credits-total]');
  if (total) total.textContent = p.credits;
  const interp = q('[data-gpa-interpretation]');
  if (interp) interp.textContent = p.interpretation;
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

/** Collapse to exactly one blank course row (island-owned DOM), instance-local. */
export function resetGpaValues(root: HTMLElement, _mode: ResetMode): void {
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-gpa-row]'));
  rows.slice(1).forEach((r) => r.remove());
  const first = rows[0];
  if (!first) return;
  const grade = first.querySelector<HTMLSelectElement>('[data-gpa-grade]');
  const credits = first.querySelector<HTMLInputElement>('[data-gpa-credits]');
  if (grade) grade.value = '';
  if (credits) credits.value = '';
}

export const gpaBinding: FormCalculatorBinding<GpaFormValues, GpaComputed> = {
  readValues: readGpaValues,
  validate: validateGpa,
  compute: computeGpa,
  renderResult: renderGpaResult,
  describeResult: describeGpa,
  resultValue: completeGpaValue,
  resetValues: resetGpaValues,
  // NO isUsableResult — the complete-result guard lives in resultValue (NaN sentinel).
};

/* ------------------------------------------------------------------ */
/* Starting values (arrive-filled)                                     */
/* ------------------------------------------------------------------ */

/**
 * The course rows this calculator arrives filled with, so the visitor lands on a
 * real worked GPA they can type over instead of an empty row. They are OURS, not
 * the visitor's: the runtime computes them silently on mount (`prefill`), and
 * Reset still clears the form back to a single blank row.
 *
 * Rows are built in the browser (the dynamic-row family owns its own markup), so
 * these seed `buildRow` rather than a server-rendered `value` attribute. Every
 * grade must exist in GRADE_POINTS — `starting-values.test.ts` pins that.
 */
export const GPA_STARTING_ROWS = [
  { grade: 'A', credits: '3' },
  { grade: 'B+', credits: '4' },
  { grade: 'A-', credits: '3' },
] as const;

/**
 * GPA form layer — the two calculators the reference puts on the page.
 *
 * The GPA Calculator reads a set of dynamic course rows (course name, credits, grade) and reports
 * the average with a per-course breakdown. The GPA Planning Calculator answers a different question
 * from four plain numbers — what average the next block of credits has to reach. They stay two
 * separate calculators with their own fields, their own button and their own result.
 *
 * Both run on the UNCHANGED standard-form runtime, and neither has an `isUsableResult`: the
 * complete-result guard lives in `resultValue` as a NaN sentinel, reconciled against a fresh
 * computation. A 0.0 GPA is a finite 0 the runtime's default gate accepts.
 */
import {
  calculateGPA,
  planGpa,
  gradePoints,
  isGrade,
  formatGpa,
  formatPoints,
  gradePointsExpression,
  GRADE_SCALE,
  GRADED_LETTERS,
  MAX_GRADE_POINTS,
  type GpaCourse,
  type GpaResult,
  type GpaPlan,
} from './gpa';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export const MAX_GPA = MAX_GRADE_POINTS;
/** How many blank course rows the calculator opens with, as the reference does. */
export const INITIAL_ROWS = 5;

const FAIL = Number.NaN;
const TOL = 1e-9;
const close = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(TOL, Math.abs(b) * TOL);

export const MSG = {
  gradeInvalid: 'Choose a grade from the list.',
  creditsRequired: 'Enter credit hours for this course.',
  creditsInvalid: 'Enter credit hours of zero or more.',
  gradeMissing: 'Choose a grade for this course, or clear its credits.',
  noCourses: 'Add at least one course with a grade and credit hours greater than zero.',
  allIgnored: 'Those grades are not scored. Add a course with a letter grade to get a GPA.',
  required: 'Enter a number.',
  gpaRange: `Enter a GPA between 0 and ${MAX_GRADE_POINTS}.`,
  creditsPositive: 'Enter a number greater than zero.',
  creditsZeroPlus: 'Enter zero or more.',
} as const;

/* ------------------------------------------------------------------ */
/* Calculator 1 — GPA from courses                                     */
/* ------------------------------------------------------------------ */

export interface GpaRowValue {
  /** Instance-local stable id assigned by the island, for per-row error targeting. */
  id: string;
  name: string;
  grade: string;
  credits: string;
}

export interface GpaFormValues {
  rows: GpaRowValue[];
}

export interface GpaComputed {
  rows: GpaRowValue[];
  courses: GpaCourse[];
  result: GpaResult;
}

/** A blank row is one the visitor has not touched: no grade and no credits. */
export const isBlankRow = (row: GpaRowValue): boolean =>
  row.grade.trim() === '' && row.credits.trim() === '';

/** Credit hours: a finite number of zero or more. Empty and malformed are told apart. */
export function parseCredits(raw: string): number | 'empty' | 'invalid' {
  const text = (raw ?? '').trim();
  if (text === '') return 'empty';
  if (!/^\d*\.?\d+$/.test(text)) return 'invalid';
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : 'invalid';
}

export function readGpaValues(root: HTMLElement): GpaFormValues {
  const rows: GpaRowValue[] = [];
  root.querySelectorAll<HTMLElement>('[data-gpa-row]').forEach((row) => {
    rows.push({
      id: row.getAttribute('data-gpa-row') ?? '',
      name: row.querySelector<HTMLInputElement>('[data-gpa-name]')?.value ?? '',
      grade: row.querySelector<HTMLSelectElement>('[data-gpa-grade]')?.value ?? '',
      credits: row.querySelector<HTMLInputElement>('[data-gpa-credits]')?.value ?? '',
    });
  });
  return { rows };
}

export function validateGpa(values: GpaFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  for (const row of values.rows) {
    if (isBlankRow(row)) continue; // an untouched row is not an error, it is an empty row
    const credits = parseCredits(row.credits);
    if (row.grade !== '' && !isGrade(row.grade)) fieldErrors[`grade-${row.id}`] = MSG.gradeInvalid;
    if (credits === 'invalid') fieldErrors[`credits-${row.id}`] = MSG.creditsInvalid;
    else if (credits === 'empty' && row.grade !== '') fieldErrors[`credits-${row.id}`] = MSG.creditsRequired;
    else if (typeof credits === 'number' && row.grade === '') fieldErrors[`grade-${row.id}`] = MSG.gradeMissing;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  const courses = toCourses(values);
  if (courses.length === 0) return { ok: false, formError: MSG.noCourses };
  // Every course entered is P/NP/I/W — a real thing to say, and not the same as having no credits.
  if (!courses.some((c) => typeof gradePoints(c.grade) === 'number')) {
    return { ok: false, formError: MSG.allIgnored };
  }
  // Graded courses, but none of them carries credit, so there is nothing to weight the average by.
  if (!courses.some((c) => typeof gradePoints(c.grade) === 'number' && c.credits > 0)) {
    return { ok: false, formError: MSG.noCourses };
  }
  return { ok: true };
}

/** The rows the visitor actually filled in, as courses. */
export function toCourses(values: GpaFormValues): GpaCourse[] {
  const courses: GpaCourse[] = [];
  for (const row of values.rows) {
    if (isBlankRow(row)) continue;
    const credits = parseCredits(row.credits);
    if (typeof credits !== 'number' || !isGrade(row.grade)) continue;
    courses.push({ name: row.name.trim(), credits, grade: row.grade });
  }
  return courses;
}

export function computeGpa(values: GpaFormValues): GpaComputed {
  const courses = toCourses(values);
  return { rows: values.rows, courses, result: calculateGPA(courses) };
}

/** The GPA, but only when the whole result reconciles with a fresh computation. */
export function completeGpaValue(r: GpaComputed): number {
  if (!Array.isArray(r.courses) || r.courses.length === 0) return FAIL;
  if (r.result.courses.length !== r.courses.length) return FAIL;
  if (!(r.result.totalCredits > 0)) return FAIL;
  if (!Number.isFinite(r.result.gpa) || r.result.gpa < 0) return FAIL;

  const expected = calculateGPA(r.courses);
  if (!close(expected.gpa, r.result.gpa)) return FAIL;
  if (!close(expected.totalCredits, r.result.totalCredits)) return FAIL;
  if (!close(expected.totalQualityPoints, r.result.totalQualityPoints)) return FAIL;
  for (let i = 0; i < expected.courses.length; i += 1) {
    const a = expected.courses[i];
    const b = r.result.courses[i];
    if (a.counted !== b.counted || a.grade !== b.grade) return FAIL;
    if (a.counted && !close(a.qualityPoints, b.qualityPoints)) return FAIL;
  }
  return r.result.gpa;
}

export function describeGpa(r: GpaComputed): string {
  if (!Number.isFinite(r.result.gpa)) return '';
  return `GPA: ${formatGpa(r.result.gpa)} across ${formatPoints(r.result.totalCredits)} credits.`;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

const cell = (tag: 'td' | 'th', text: string, className?: string): HTMLElement => {
  const node = el(tag, className);
  node.textContent = text;
  if (tag === 'th') node.setAttribute('scope', 'row');
  return node;
};

export function renderGpaResult(result: GpaComputed, context: FormRenderContext): void {
  const scope = context.result;
  const set = (selector: string, text: string) => {
    const node = scope.querySelector<HTMLElement>(selector);
    if (node) node.textContent = text;
  };
  const r = result.result;

  set('[data-result-when~="valid"] [data-result-value]', formatGpa(r.gpa));
  set('[data-result-when~="valid"] [data-result-value-a11y]', describeGpa(result));
  set('[data-gpa-total-credits]', formatPoints(r.totalCredits));
  set('[data-gpa-total-credits-row]', formatPoints(r.totalCredits));
  set('[data-gpa-overall]', formatGpa(r.gpa));

  const body = scope.querySelector<HTMLElement>('[data-gpa-breakdown]');
  if (!body) return;
  body.textContent = '';
  r.courses.forEach((course, index) => {
    const tr = el('tr');
    if (!course.counted) tr.className = 'gpa-row--ignored';
    tr.append(
      cell('th', course.name || `Course ${index + 1}`),
      cell('td', formatPoints(course.credits)),
      cell('td', course.grade),
      cell('td', course.counted ? gradePointsExpression(course) : 'not counted'),
    );
    body.appendChild(tr);
  });
}

export const gpaBinding: FormCalculatorBinding<GpaFormValues, GpaComputed> = {
  readValues: readGpaValues,
  validate: validateGpa,
  compute: computeGpa,
  resultValue: completeGpaValue,
  describeResult: describeGpa,
  renderResult: renderGpaResult,
  resetValues(root, _mode: ResetMode) {
    // The island owns the rows; it listens for this and collapses back to the opening set.
    root.dispatchEvent(new CustomEvent('gpa:reset', { bubbles: false }));
  },
};

/* ------------------------------------------------------------------ */
/* Calculator 2 — GPA planning                                         */
/* ------------------------------------------------------------------ */

export interface PlanFormValues {
  currentGpa: string;
  targetGpa: string;
  currentCredits: string;
  additionalCredits: string;
}

export interface PlanComputed {
  values: PlanFormValues;
  plan: GpaPlan;
}

type NumParse = number | 'empty' | 'invalid';

function parseNumber(raw: string): NumParse {
  const text = (raw ?? '').trim();
  if (text === '') return 'empty';
  if (!/^\d*\.?\d+$/.test(text)) return 'invalid';
  const value = Number(text);
  return Number.isFinite(value) ? value : 'invalid';
}

export function validatePlan(values: PlanFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const check = (name: keyof PlanFormValues, rule: (n: number) => string | null) => {
    const parsed = parseNumber(values[name]);
    if (parsed === 'empty') fieldErrors[name] = MSG.required;
    else if (parsed === 'invalid') fieldErrors[name] = MSG.required;
    else {
      const problem = rule(parsed);
      if (problem) fieldErrors[name] = problem;
    }
  };
  const inScale = (n: number) => (n >= 0 && n <= MAX_GRADE_POINTS ? null : MSG.gpaRange);
  check('currentGpa', inScale);
  check('targetGpa', inScale);
  check('currentCredits', (n) => (n >= 0 ? null : MSG.creditsZeroPlus));
  check('additionalCredits', (n) => (n > 0 ? null : MSG.creditsPositive));
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function computePlan(values: PlanFormValues): PlanComputed {
  const num = (raw: string) => {
    const parsed = parseNumber(raw);
    return typeof parsed === 'number' ? parsed : Number.NaN;
  };
  return {
    values: { ...values },
    plan: planGpa({
      currentGpa: num(values.currentGpa),
      targetGpa: num(values.targetGpa),
      currentCredits: num(values.currentCredits),
      additionalCredits: num(values.additionalCredits),
    }),
  };
}

/**
 * The required average — a finite number even when it is out of reach, because "you would need a
 * 5.2" is the useful answer, not an error. Only an incoherent input fails the gate.
 */
export function completePlanValue(r: PlanComputed): number {
  const p = r.plan;
  for (const value of [p.currentGpa, p.targetGpa, p.currentCredits, p.additionalCredits]) {
    if (!Number.isFinite(value)) return FAIL;
  }
  if (!(p.additionalCredits > 0)) return FAIL;
  if (!Number.isFinite(p.required)) return FAIL;
  const fresh = planGpa({
    currentGpa: p.currentGpa,
    targetGpa: p.targetGpa,
    currentCredits: p.currentCredits,
    additionalCredits: p.additionalCredits,
  });
  if (!close(fresh.required, p.required)) return FAIL;
  return p.required;
}

/** The reference's sentence, and the two cases it does not cover. */
export function planSentence(p: GpaPlan): string {
  const target = formatGpa(p.targetGpa);
  const credits = formatPoints(p.additionalCredits);
  if (p.alreadyMet) {
    return `A target GPA of ${target} is already met — even a 0 across the next ${credits} credits keeps you at or above it.`;
  }
  if (!p.achievable) {
    return `A target GPA of ${target} is out of reach over ${credits} credits: it would need an average of ${formatGpa(p.required)}, above the ${formatGpa(MAX_GRADE_POINTS)} maximum on this scale.`;
  }
  return `To achieve a target GPA of ${target}, the GPA for the next ${credits} credits needs to be ${formatGpa(p.required)} or higher.`;
}

export function describePlan(r: PlanComputed): string {
  return planSentence(r.plan);
}

export function renderPlanResult(result: PlanComputed, context: FormRenderContext): void {
  const scope = context.result;
  const p = result.plan;
  const set = (selector: string, text: string) => {
    const node = scope.querySelector<HTMLElement>(selector);
    if (node) node.textContent = text;
  };
  set('[data-result-when~="valid"] [data-result-value]', formatGpa(p.required));
  set('[data-result-when~="valid"] [data-result-value-a11y]', planSentence(p));
  set('[data-plan-sentence]', planSentence(p));
  const shell = scope.querySelector<HTMLElement>('[data-plan-sentence]');
  if (shell) shell.dataset.planState = p.alreadyMet ? 'met' : p.achievable ? 'ok' : 'unreachable';
}

const field = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? '';

export const gpaPlanBinding: FormCalculatorBinding<PlanFormValues, PlanComputed> = {
  readValues: (root) => ({
    currentGpa: field(root, 'currentGpa'),
    targetGpa: field(root, 'targetGpa'),
    currentCredits: field(root, 'currentCredits'),
    additionalCredits: field(root, 'additionalCredits'),
  }),
  validate: validatePlan,
  compute: computePlan,
  resultValue: completePlanValue,
  describeResult: describePlan,
  renderResult: renderPlanResult,
  resetValues(root, _mode: ResetMode) {
    for (const name of ['currentGpa', 'targetGpa', 'currentCredits', 'additionalCredits']) {
      const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (input) input.value = '';
    }
  },
};

/* ------------------------------------------------------------------ */
/* Worked examples (labelled; the visitor's fields stay EMPTY)         */
/* ------------------------------------------------------------------ */

export const GPA_EXAMPLE_VALUES: GpaFormValues = {
  rows: [
    { id: 'x1', name: 'Math', grade: 'A', credits: '3' },
    { id: 'x2', name: 'English', grade: 'B+', credits: '3' },
    { id: 'x3', name: 'History', grade: 'A-', credits: '2' },
  ],
};

export const PLAN_EXAMPLE_VALUES: PlanFormValues = {
  currentGpa: '3.663',
  targetGpa: '3',
  currentCredits: '8',
  additionalCredits: '15',
};

export { GRADE_SCALE, GRADED_LETTERS };

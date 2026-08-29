/**
 * Grade form layer — the two calculators the reference puts on the page.
 *
 * The Grade Calculator reads a set of dynamic assignment rows (name, grade, weight) and reports the
 * weighted average, with an optional Final Grade Planning block that asks what the remaining work
 * has to average. The Final Grade Calculator is a separate three-field tool: your current grade,
 * the grade you want, and what the final is worth.
 *
 * Both run on the UNCHANGED standard-form runtime, and neither has an `isUsableResult` — the
 * complete-result guard lives in `resultValue` as a NaN sentinel, reconciled against a fresh
 * computation. An average of 0 (all Fs) is a finite 0 the runtime's default gate accepts.
 */
import {
  weightedGrade,
  finalScoreNeeded,
  planRemaining,
  parseGradeValue,
  nearestBand,
  formatAverageGrade,
  formatGradePoints,
  formatScore,
  GRADE_BANDS,
  type GradeAverage,
  type GradeRow,
} from './grade';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/**
 * How many blank rows the calculator opens with.
 *
 * The reference opens with eight. Eight empty rows plus the planning block push the Calculate
 * button two hundred pixels below the fold at 1366×768, which breaks the rule that the primary
 * action is visible without scrolling — so it opens with five and "+ add more rows" is one click
 * away. Same as the GPA calculator, which is the tool most people arrive from.
 */
export const INITIAL_ROWS = 5;

const FAIL = Number.NaN;
const TOL = 1e-9;
const close = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(TOL, Math.abs(b) * TOL);

export const MSG = {
  gradeInvalid: 'Enter a percentage like 88, or a letter like B+.',
  gradeMissing: 'Enter a grade for this row, or clear its weight.',
  weightRequired: 'Enter this row’s weight.',
  weightInvalid: 'Enter a weight of zero or more.',
  noRows: 'Enter at least one graded row with a weight greater than zero.',
  goalRequired: 'Enter the grade you are aiming for.',
  remainingRequired: 'Enter the weight of the work still to come.',
  remainingInvalid: 'Enter a weight greater than zero.',
  required: 'Enter a value.',
  numberRequired: 'Enter a percentage like 88, or a letter like B+.',
  weightPercent: 'Enter a weight above 0 and up to 100.',
} as const;

/* ------------------------------------------------------------------ */
/* Calculator 1 — the weighted average                                 */
/* ------------------------------------------------------------------ */

export interface GradeRowValue {
  /** Instance-local stable id assigned by the island, for per-row error targeting. */
  id: string;
  name: string;
  grade: string;
  weight: string;
}

export interface GradeFormValues {
  rows: GradeRowValue[];
  /** Final Grade Planning — optional, and blank unless the visitor fills BOTH fields. */
  goal: string;
  remainingWeight: string;
}

export interface GradePlan {
  goalGpa: number;
  remainingWeight: number;
  /** The grade points the remaining work has to average. */
  required: number;
  /** True when the goal is already secured whatever the remaining work scores. */
  alreadyMet: boolean;
  /** True when even a straight A+ across the remainder falls short. */
  achievable: boolean;
}

export interface GradeComputed {
  rows: GradeRowValue[];
  items: GradeRow[];
  average: GradeAverage;
  /** Null unless the optional planning block was filled in. */
  plan: GradePlan | null;
}

export const isBlankRow = (row: GradeRowValue): boolean =>
  row.grade.trim() === '' && row.weight.trim() === '';

/** A weight in percent: a finite number of zero or more. */
export function parseWeight(raw: string): number | 'empty' | 'invalid' {
  const text = (raw ?? '').trim();
  if (text === '') return 'empty';
  if (!/^\d*\.?\d+$/.test(text)) return 'invalid';
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : 'invalid';
}

export function readGradeValues(root: HTMLElement): GradeFormValues {
  const rows: GradeRowValue[] = [];
  root.querySelectorAll<HTMLElement>('[data-grade-row]').forEach((row) => {
    rows.push({
      id: row.getAttribute('data-grade-row') ?? '',
      name: row.querySelector<HTMLInputElement>('[data-grade-name]')?.value ?? '',
      grade: row.querySelector<HTMLInputElement>('[data-grade-score]')?.value ?? '',
      weight: row.querySelector<HTMLInputElement>('[data-grade-weight]')?.value ?? '',
    });
  });
  const field = (name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? '';
  return { rows, goal: field('goal'), remainingWeight: field('remainingWeight') };
}

export function toItems(values: GradeFormValues): GradeRow[] {
  const items: GradeRow[] = [];
  for (const row of values.rows) {
    if (isBlankRow(row)) continue;
    const weight = parseWeight(row.weight);
    if (typeof weight !== 'number' || !parseGradeValue(row.grade)) continue;
    items.push({ name: row.name.trim(), grade: row.grade.trim(), weight });
  }
  return items;
}

export function validateGrade(values: GradeFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  for (const row of values.rows) {
    if (isBlankRow(row)) continue;
    const weight = parseWeight(row.weight);
    const grade = row.grade.trim();
    if (grade !== '' && !parseGradeValue(grade)) fieldErrors[`grade-${row.id}`] = MSG.gradeInvalid;
    if (weight === 'invalid') fieldErrors[`weight-${row.id}`] = MSG.weightInvalid;
    else if (weight === 'empty' && grade !== '') fieldErrors[`weight-${row.id}`] = MSG.weightRequired;
    else if (typeof weight === 'number' && grade === '') fieldErrors[`grade-${row.id}`] = MSG.gradeMissing;
  }

  // The planning block is optional, but half of it is not: one field asks for the other.
  const goal = values.goal.trim();
  const remaining = values.remainingWeight.trim();
  if (goal !== '' && !parseGradeValue(goal)) fieldErrors.goal = MSG.gradeInvalid;
  if (remaining !== '') {
    const parsed = parseWeight(remaining);
    if (parsed === 'invalid' || (typeof parsed === 'number' && parsed <= 0)) {
      fieldErrors.remainingWeight = MSG.remainingInvalid;
    } else if (goal === '') fieldErrors.goal = MSG.goalRequired;
  } else if (goal !== '' && !fieldErrors.goal) {
    fieldErrors.remainingWeight = MSG.remainingRequired;
  }

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  const items = toItems(values);
  if (!items.some((item) => item.weight > 0)) return { ok: false, formError: MSG.noRows };
  return { ok: true };
}

export function computeGrade(values: GradeFormValues): GradeComputed {
  const items = toItems(values);
  const average = weightedGrade(items);

  let plan: GradePlan | null = null;
  const goalValue = parseGradeValue(values.goal.trim());
  const remaining = parseWeight(values.remainingWeight.trim());
  if (goalValue && typeof remaining === 'number' && remaining > 0) {
    const required = planRemaining(average.averageGpa, average.totalWeight, goalValue.gpa, remaining);
    plan = {
      goalGpa: goalValue.gpa,
      remainingWeight: remaining,
      required,
      alreadyMet: Number.isFinite(required) && required <= 0,
      achievable: Number.isFinite(required) && required <= GRADE_BANDS[0].gpa,
    };
  }

  return { rows: values.rows, items, average, plan };
}

/** The average, but only when the whole result reconciles with a fresh computation. */
export function completeGradeValue(r: GradeComputed): number {
  if (!Array.isArray(r.items) || r.items.length === 0) return FAIL;
  if (!(r.average.totalWeight > 0)) return FAIL;
  if (!Number.isFinite(r.average.averageGpa) || r.average.averageGpa < 0) return FAIL;
  if (r.average.rows.length !== r.items.length) return FAIL;

  const expected = weightedGrade(r.items);
  if (!close(expected.averageGpa, r.average.averageGpa)) return FAIL;
  if (!close(expected.totalWeight, r.average.totalWeight)) return FAIL;
  if (expected.letter !== r.average.letter) return FAIL;
  if (r.plan && !Number.isFinite(r.plan.required)) return FAIL;
  return r.average.averageGpa;
}

export function describeGrade(r: GradeComputed): string {
  if (!Number.isFinite(r.average.averageGpa)) return '';
  return `Average grade: ${formatAverageGrade(r.average)} over ${formatScore(r.average.totalWeight)}% of the course.`;
}

/** The planning sentence, and the two cases a bare number would not explain. */
export function planSentence(r: GradeComputed): string {
  const plan = r.plan;
  if (!plan) return '';
  const goalLetter = nearestBand(plan.goalGpa)?.letter ?? '—';
  const goal = `${goalLetter} (${formatGradePoints(plan.goalGpa)})`;
  const weight = `${formatScore(plan.remainingWeight)}%`;
  if (plan.alreadyMet) {
    return `A goal of ${goal} is already secured — the remaining ${weight} cannot bring the course below it.`;
  }
  if (!plan.achievable) {
    return `A goal of ${goal} is out of reach: the remaining ${weight} would have to average ${formatGradePoints(plan.required)} grade points, above the ${formatGradePoints(GRADE_BANDS[0].gpa)} an A+ is worth.`;
  }
  const letter = nearestBand(plan.required)?.letter ?? '—';
  return `To finish on ${goal}, the remaining ${weight} needs to average ${letter} (${formatGradePoints(plan.required)}) or better.`;
}

/* ------------------------------------------------------------------ */
/* Rendering (DOM)                                                      */
/* ------------------------------------------------------------------ */

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

const cell = (tag: 'td' | 'th', text: string): HTMLElement => {
  const node = el(tag);
  node.textContent = text;
  if (tag === 'th') node.setAttribute('scope', 'row');
  return node;
};

export function renderGradeResult(result: GradeComputed, context: FormRenderContext): void {
  const scope = context.result;
  const set = (selector: string, text: string) => {
    const node = scope.querySelector<HTMLElement>(selector);
    if (node) node.textContent = text;
  };

  set('[data-result-when~="valid"] [data-result-value]', formatAverageGrade(result.average));
  set('[data-result-when~="valid"] [data-result-value-a11y]', describeGrade(result));
  set('[data-grade-total-weight]', `${formatScore(result.average.totalWeight)}%`);
  set('[data-grade-average]', formatAverageGrade(result.average));

  const body = scope.querySelector<HTMLElement>('[data-grade-breakdown]');
  if (body) {
    body.textContent = '';
    result.average.rows.forEach((row, index) => {
      const tr = el('tr');
      tr.append(
        cell('th', row.name || `Item ${index + 1}`),
        cell('td', row.value.raw),
        cell('td', `${formatScore(row.weight)}%`),
      );
      body.appendChild(tr);
    });
  }

  const planning = scope.querySelector<HTMLElement>('[data-grade-plan-row]');
  if (planning) planning.hidden = result.plan === null;
  set('[data-grade-plan]', planSentence(result));
}

export const gradeBinding: FormCalculatorBinding<GradeFormValues, GradeComputed> = {
  readValues: readGradeValues,
  validate: validateGrade,
  compute: computeGrade,
  resultValue: completeGradeValue,
  describeResult: describeGrade,
  renderResult: renderGradeResult,
  resetValues(root, _mode: ResetMode) {
    for (const name of ['goal', 'remainingWeight']) {
      const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (input) input.value = '';
    }
    // The island owns the rows; it listens for this and rebuilds the opening set.
    root.dispatchEvent(new CustomEvent('grade:reset', { bubbles: false }));
  },
};

/* ------------------------------------------------------------------ */
/* Calculator 2 — the final grade                                      */
/* ------------------------------------------------------------------ */

export interface FinalFormValues {
  current: string;
  want: string;
  weight: string;
}

export interface FinalComputed {
  values: FinalFormValues;
  current: number;
  want: number;
  weight: number;
  needed: number;
  alreadyMet: boolean;
  /** True when both inputs were on the grade-point scale, so the answer is too. */
  gradePoints: boolean;
}

/** A grade for the final calculator: a plain number stays itself, a letter becomes grade points. */
export function parseFinalGrade(raw: string): { value: number; isLetter: boolean } | null {
  const text = (raw ?? '').trim();
  if (text === '') return null;
  if (/^\d*\.?\d+$/.test(text)) {
    const value = Number(text);
    return Number.isFinite(value) ? { value, isLetter: false } : null;
  }
  const parsed = parseGradeValue(text);
  return parsed && parsed.kind === 'letter' ? { value: parsed.gpa, isLetter: true } : null;
}

export function validateFinal(values: FinalFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  for (const name of ['current', 'want'] as const) {
    const text = values[name].trim();
    if (text === '') fieldErrors[name] = MSG.required;
    else if (!parseFinalGrade(text)) fieldErrors[name] = MSG.numberRequired;
  }
  const weight = parseWeight(values.weight);
  if (weight === 'empty') fieldErrors.weight = MSG.required;
  else if (weight === 'invalid' || (typeof weight === 'number' && (weight <= 0 || weight > 100))) {
    fieldErrors.weight = MSG.weightPercent;
  }
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function computeFinal(values: FinalFormValues): FinalComputed {
  const current = parseFinalGrade(values.current);
  const want = parseFinalGrade(values.want);
  const weight = parseWeight(values.weight);
  const w = typeof weight === 'number' ? weight : Number.NaN;
  const result = finalScoreNeeded(current?.value ?? Number.NaN, w, want?.value ?? Number.NaN);
  return {
    values: { ...values },
    current: current?.value ?? Number.NaN,
    want: want?.value ?? Number.NaN,
    weight: w,
    needed: result.needed,
    alreadyMet: result.alreadyMet,
    gradePoints: Boolean(current?.isLetter && want?.isLetter),
  };
}

/** The needed score — finite even when it is over 100, because that is the useful answer. */
export function completeFinalValue(r: FinalComputed): number {
  if (![r.current, r.want, r.weight].every(Number.isFinite)) return FAIL;
  if (!(r.weight > 0 && r.weight <= 100)) return FAIL;
  if (!Number.isFinite(r.needed)) return FAIL;
  const fresh = finalScoreNeeded(r.current, r.weight, r.want);
  if (!close(fresh.needed, r.needed)) return FAIL;
  return r.needed;
}

/** The reference's sentence, plus the two cases it does not cover. */
export function finalSentence(r: FinalComputed): string {
  if (!Number.isFinite(r.needed)) return '';
  const score = r.gradePoints
    ? `${nearestBand(r.needed)?.letter ?? '—'} (${formatGradePoints(r.needed)})`
    : formatScore(Number(r.needed.toPrecision(12)));
  if (r.alreadyMet) {
    return `You have already secured it — even a 0 on the final leaves you at or above the grade you want.`;
  }
  const ceiling = r.gradePoints ? GRADE_BANDS[0].gpa : 100;
  if (r.needed > ceiling) {
    return `You would need ${score} on the final, which is above the maximum of ${formatScore(ceiling)} — the grade you want is out of reach.`;
  }
  return `You will need a grade of ${score} or higher on the final.`;
}

export function describeFinal(r: FinalComputed): string {
  return finalSentence(r);
}

export function renderFinalResult(result: FinalComputed, context: FormRenderContext): void {
  const scope = context.result;
  const set = (selector: string, text: string) => {
    const node = scope.querySelector<HTMLElement>(selector);
    if (node) node.textContent = text;
  };
  const score = result.gradePoints
    ? `${nearestBand(result.needed)?.letter ?? '—'} (${formatGradePoints(result.needed)})`
    : formatScore(Number(result.needed.toPrecision(12)));
  set('[data-result-when~="valid"] [data-result-value]', score);
  set('[data-result-when~="valid"] [data-result-value-a11y]', finalSentence(result));
  set('[data-final-sentence]', finalSentence(result));
}

const field = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? '';

export const finalGradeBinding: FormCalculatorBinding<FinalFormValues, FinalComputed> = {
  readValues: (root) => ({
    current: field(root, 'current'),
    want: field(root, 'want'),
    weight: field(root, 'weight'),
  }),
  validate: validateFinal,
  compute: computeFinal,
  resultValue: completeFinalValue,
  describeResult: describeFinal,
  renderResult: renderFinalResult,
  resetValues(root, _mode: ResetMode) {
    for (const name of ['current', 'want', 'weight']) {
      const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (input) input.value = '';
    }
  },
};

/* ------------------------------------------------------------------ */
/* Worked examples (labelled; the visitor's fields stay EMPTY)         */
/* ------------------------------------------------------------------ */

export const GRADE_EXAMPLE_VALUES: GradeFormValues = {
  rows: [
    { id: 'x1', name: 'Homework 1', grade: '90', weight: '5' },
    { id: 'x2', name: 'Project', grade: 'B', weight: '20' },
    { id: 'x3', name: 'Midterm exam', grade: '88', weight: '20' },
  ],
  goal: '',
  remainingWeight: '',
};

export const FINAL_EXAMPLE_VALUES: FinalFormValues = { current: '88', want: '85', weight: '40' };

export { GRADE_BANDS };

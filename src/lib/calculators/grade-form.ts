/**
 * Grade form binding (R16B2 — Academic family follow-on, 2 of 2; task-first, MULTI-MODE).
 *
 * Wraps the UNCHANGED `weightedGrade` and `finalScoreNeeded` and layers the
 * visitor-facing contract they lack. Two modes of one coherent academic tool:
 *   • 'average'  — calculator-owned dynamic score/weight rows → a weighted average
 *                  (NORMALIZED by total weight; weights need not total 100);
 *   • 'final'    — current / final-weight / target → the score needed on the final,
 *                  classified from the returned number: ≤0 already met · 0–100
 *                  reachable · >100 unreachable.
 *
 * Own file — imports nothing from gpa-form (the dynamic-row DOM is island-owned and
 * mirrors GPA's PRINCIPLES, not its code). The binding reads ONLY the active mode, so
 * hidden-mode fields never validate or compute. The complete-result guard lives in
 * `resultValue` as a NaN sentinel → the runtime's DEFAULT finite gate; there is NO
 * `isUsableResult` (the active-mode primary is always a finite number for valid
 * inputs — the required-final-score is finite even when already-met or unreachable,
 * shown as a clear STATUS rather than a raw out-of-range percentage).
 */
import { weightedGrade, finalScoreNeeded, type GradeItem, type WeightedGradeResult } from './grade';
import { formatNumber } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export type GradeMode = 'average' | 'final';

export interface GradeRowValue {
  id: string;
  score: string;
  weight: string;
}

export interface GradeFormValues {
  mode: GradeMode;
  rows: GradeRowValue[];
  current: string;
  finalWeight: string;
  target: string;
}

export type GradeComputed =
  | { mode: 'average'; items: GradeItem[]; result: WeightedGradeResult }
  | { mode: 'final'; current: number; finalWeight: number; target: number; needed: number };

/** Reachability status of a final-needed result, derived from the returned number. */
export type FinalStatus = 'reachable' | 'met' | 'unreachable';
export const finalStatus = (needed: number): FinalStatus =>
  needed < 0 ? 'met' : needed > 100 ? 'unreachable' : 'reachable';

const TOL = 1e-9;
const FAIL = Number.NaN;

export const MSG = {
  scoreRequired: 'Enter a score for this item.',
  scoreInvalid: 'Enter a numeric score.',
  weightRequired: 'Enter a weight for this item.',
  weightInvalid: 'Enter a weight of zero or more.',
  noItems: 'Add at least one item with a score and a weight greater than zero.',
  currentRequired: 'Enter your current grade.',
  currentInvalid: 'Enter a current grade of zero or more.',
  targetRequired: 'Enter your target grade.',
  targetInvalid: 'Enter a target grade of zero or more.',
  finalWeightRequired: 'Enter how much the final is worth.',
  finalWeightRange: 'Enter a final weight greater than 0 and up to 100 percent.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/** '' → null (missing); a finite number → the number; else 'invalid'. */
function parseFinite(raw: string): number | null | 'invalid' {
  const s = raw.trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : 'invalid';
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

const field = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? '';

export function readGradeValues(root: HTMLElement): GradeFormValues {
  const mode: GradeMode = root.querySelector<HTMLInputElement>('[name="gmode"]:checked')?.value === 'final' ? 'final' : 'average';
  const rows: GradeRowValue[] = [];
  root.querySelectorAll<HTMLElement>('[data-grade-row]').forEach((row) => {
    rows.push({
      id: row.dataset.rowId ?? '',
      score: row.querySelector<HTMLInputElement>('[data-grade-score]')?.value ?? '',
      weight: row.querySelector<HTMLInputElement>('[data-grade-weight]')?.value ?? '',
    });
  });
  return { mode, rows, current: field(root, 'current'), finalWeight: field(root, 'finalWeight'), target: field(root, 'target') };
}

/* ------------------------------------------------------------------ */
/* Validate (active mode only)                                         */
/* ------------------------------------------------------------------ */

const isEmptyRow = (r: GradeRowValue): boolean => r.score.trim() === '' && r.weight.trim() === '';

function validateAverage(rows: GradeRowValue[]): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  let contributingWeight = 0;
  for (const r of rows) {
    if (isEmptyRow(r)) continue;
    const score = parseFinite(r.score);
    if (score === null) fieldErrors[`score-${r.id}`] = MSG.scoreRequired;
    else if (score === 'invalid') fieldErrors[`score-${r.id}`] = MSG.scoreInvalid;
    const weight = parseFinite(r.weight);
    if (weight === null) fieldErrors[`weight-${r.id}`] = MSG.weightRequired;
    else if (weight === 'invalid' || weight < 0) fieldErrors[`weight-${r.id}`] = MSG.weightInvalid;
    if (typeof score === 'number' && typeof weight === 'number' && weight > 0) contributingWeight += weight;
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  if (contributingWeight <= 0) return { ok: false, formError: MSG.noItems };
  return { ok: true };
}

function validateFinal(v: GradeFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const current = parseFinite(v.current);
  if (current === null) fieldErrors.current = MSG.currentRequired;
  else if (current === 'invalid' || current < 0) fieldErrors.current = MSG.currentInvalid;

  const finalWeight = parseFinite(v.finalWeight);
  if (finalWeight === null) fieldErrors.finalWeight = MSG.finalWeightRequired;
  else if (finalWeight === 'invalid' || finalWeight <= 0 || finalWeight > 100) fieldErrors.finalWeight = MSG.finalWeightRange;

  const target = parseFinite(v.target);
  if (target === null) fieldErrors.target = MSG.targetRequired;
  else if (target === 'invalid' || target < 0) fieldErrors.target = MSG.targetInvalid;

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function validateGrade(values: GradeFormValues): ValidationResult {
  return values.mode === 'average' ? validateAverage(values.rows) : validateFinal(values);
}

/* ------------------------------------------------------------------ */
/* Compute (active mode only)                                          */
/* ------------------------------------------------------------------ */

export function computeGrade(values: GradeFormValues): GradeComputed {
  if (values.mode === 'average') {
    const items: GradeItem[] = [];
    for (const r of values.rows) {
      if (isEmptyRow(r)) continue;
      const score = parseFinite(r.score);
      const weight = parseFinite(r.weight);
      if (typeof score !== 'number' || typeof weight !== 'number') continue; // defensive; validation gates this
      items.push({ score, weight });
    }
    return { mode: 'average', items, result: weightedGrade(items) };
  }
  const current = parseFinite(values.current);
  const finalWeight = parseFinite(values.finalWeight);
  const target = parseFinite(values.target);
  const c = typeof current === 'number' ? current : Number.NaN;
  const fw = typeof finalWeight === 'number' ? finalWeight : Number.NaN;
  const t = typeof target === 'number' ? target : Number.NaN;
  return { mode: 'final', current: c, finalWeight: fw, target: t, needed: finalScoreNeeded(c, fw, t) };
}

/* ------------------------------------------------------------------ */
/* Complete-result guard (in resultValue — NO isUsableResult)          */
/* ------------------------------------------------------------------ */

export function completeGradeValue(c: GradeComputed): number {
  if (c.mode === 'average') {
    const { items, result } = c;
    if (!items.length) return FAIL;
    let expWeight = 0;
    for (const it of items) {
      if (!Number.isFinite(it.score)) return FAIL;
      if (!Number.isFinite(it.weight) || it.weight < 0) return FAIL;
      expWeight += it.weight;
    }
    if (!Number.isFinite(result.totalWeight) || result.totalWeight <= 0) return FAIL;
    if (Math.abs(result.totalWeight - expWeight) > TOL) return FAIL;
    const re = weightedGrade(items);
    if (!Number.isFinite(re.grade) || Math.abs(re.grade - result.grade) > TOL) return FAIL;
    if (!Number.isFinite(result.grade)) return FAIL;
    return result.grade;
  }
  const { current, finalWeight, target, needed } = c;
  if (![current, finalWeight, target].every((n) => Number.isFinite(n))) return FAIL;
  if (finalWeight <= 0 || finalWeight > 100 || current < 0 || target < 0) return FAIL;
  const re = finalScoreNeeded(current, finalWeight, target);
  if (!Number.isFinite(re) || Math.abs(re - needed) > TOL) return FAIL;
  if (!Number.isFinite(needed)) return FAIL;
  return needed;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface GradePresentation {
  label: string;
  value: string;
  a11y: string;
  secondaryLabel: string;
  secondaryValue: string;
  interpretation: string;
}

const pct = (n: number, digits = 2): string => `${formatNumber(n, digits)}%`;
const spokenPct = (n: number): string => `${Number(n.toFixed(2))} percent`;

export function presentGrade(c: GradeComputed): GradePresentation {
  if (c.mode === 'average') {
    const grade = c.result.grade;
    const totalWeight = c.result.totalWeight;
    const normalized = Math.abs(totalWeight - 100) > TOL;
    return {
      label: 'Weighted grade',
      value: pct(grade),
      a11y: spokenPct(grade),
      secondaryLabel: 'Total weight',
      secondaryValue: formatNumber(totalWeight),
      interpretation: normalized
        ? `Your weights total ${formatNumber(totalWeight)}, so the grade is normalized by that total (${formatNumber(grade, 2)}% of the weighted maximum).`
        : 'This is your scores weighted by each item’s share of the grade.',
    };
  }
  const { needed, target } = c;
  const status = finalStatus(needed);
  const targetPct = pct(target, 2);
  if (status === 'reachable') {
    return {
      label: 'Required final score',
      value: pct(needed, 1),
      a11y: spokenPct(needed),
      secondaryLabel: 'Target grade',
      secondaryValue: targetPct,
      interpretation: `Score at least ${pct(needed, 1)} on the final to reach your ${targetPct} target.`,
    };
  }
  if (status === 'met') {
    return {
      label: 'Final grade needed',
      value: 'Already met',
      a11y: 'already met',
      secondaryLabel: 'Target grade',
      secondaryValue: targetPct,
      interpretation: `You have already reached your ${targetPct} target — no particular score on the final is required.`,
    };
  }
  return {
    label: 'Final grade needed',
    value: 'Not reachable',
    a11y: 'not reachable',
    secondaryLabel: 'Target grade',
    secondaryValue: targetPct,
    interpretation: `Reaching ${targetPct} is not possible with the final alone — you would need to score over 100% on it.`,
  };
}

export function describeGrade(c: GradeComputed): string {
  if (c.mode === 'average') return `Weighted grade: ${spokenPct(c.result.grade)}.`;
  const status = finalStatus(c.needed);
  if (status === 'met') return 'You have already reached your target.';
  if (status === 'unreachable') return 'That target is not reachable with the final alone.';
  return `Required final score: ${spokenPct(c.needed)}.`;
}

export function renderGradeResult(result: GradeComputed, context: FormRenderContext): void {
  const p = presentGrade(result);
  const q = (sel: string) => context.result.querySelector<HTMLElement>(sel);
  const set = (sel: string, value: string) => {
    const el = q(sel);
    if (el) el.textContent = value;
  };
  set('[data-result-when~="valid"] [data-result-summary-label]', p.label);
  const primary = q('[data-result-when~="valid"] [data-result-value]');
  if (primary) primary.textContent = p.value;
  const a11y = q('[data-result-when~="valid"] [data-result-value-a11y]');
  if (a11y) a11y.textContent = p.a11y;
  set('[data-grade-secondary-label]', p.secondaryLabel);
  set('[data-grade-secondary-value]', p.secondaryValue);
  set('[data-grade-interpretation]', p.interpretation);
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

/** Restore the default mode (average), collapse to one blank weighted row, clear final fields. */
export function resetGradeValues(root: HTMLElement, _mode: ResetMode): void {
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-grade-row]'));
  rows.slice(1).forEach((r) => r.remove());
  const first = rows[0];
  if (first) {
    const s = first.querySelector<HTMLInputElement>('[data-grade-score]');
    const w = first.querySelector<HTMLInputElement>('[data-grade-weight]');
    if (s) s.value = '';
    if (w) w.value = '';
  }
  for (const name of ['current', 'finalWeight', 'target']) {
    const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (el) el.value = '';
  }
  // The island restores the default mode radio + panel visibility on reset.
}

export const gradeBinding: FormCalculatorBinding<GradeFormValues, GradeComputed> = {
  readValues: readGradeValues,
  validate: validateGrade,
  compute: computeGrade,
  renderResult: renderGradeResult,
  describeResult: describeGrade,
  resultValue: completeGradeValue,
  resetValues: resetGradeValues,
  // NO isUsableResult — the complete-result guard lives in resultValue (NaN sentinel).
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
export const GRADE_EXAMPLE_VALUES: GradeFormValues = { mode: 'average', rows: [ { id: 'ex1', score: '88', weight: '30' }, { id: 'ex2', score: '92', weight: '30' }, { id: 'ex3', score: '78', weight: '40' } ], current: '', finalWeight: '', target: '' };

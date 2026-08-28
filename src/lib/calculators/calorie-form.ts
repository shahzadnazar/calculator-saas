/**
 * Calorie form binding — the reference's fields, settings and result, on the UNCHANGED
 * standard-form runtime.
 *
 * The reference asks for age, gender, height, weight and one activity band under a US /
 * Metric unit tab, with the same three choices behind "+ Settings" that the BMR calculator
 * has. Its result is not one number but a guideline table: maintain weight at 100%, three
 * rates of loss below it and three of gain above, each with its calories and its share of
 * maintenance — then two zigzag schedules that average to the same weekly total.
 *
 * Every figure comes from the reviewed pure `calculateCalories`; this binding fabricates no
 * number, range, average or minimum. The activity bands and the BMR equations are the same
 * shared modules the BMR calculator uses, so the two pages can never disagree about the
 * same body. Metric/US conversion comes from the shared `@lib/health/body-measurements`
 * primitives; field-error MESSAGES stay here.
 */
import {
  calculateCalories,
  ACTIVITY_BANDS,
  DEFAULT_ACTIVITY,
  MINIMUM_DAILY_CALORIES,
  type CalorieInput,
  type CalorieResult,
  type Sex,
} from './calorie';
import { ACTIVITY_BAND_NOTES } from '@lib/health/activity-levels';
import {
  BMR_FORMULAS,
  BMR_AGE_MIN,
  BMR_AGE_MAX,
  needsBodyFat,
  type BmrFormula,
} from './bmr';
import {
  round1,
  kilogramsToPounds,
  poundsToKilograms,
  centimetresToTotalInches,
  totalInchesToCentimetres,
  totalInchesToFeetAndInches,
  classifyImperialHeight,
} from '@lib/health/body-measurements';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export {
  ACTIVITY_BANDS,
  ACTIVITY_BAND_NOTES,
  DEFAULT_ACTIVITY,
  BMR_FORMULAS,
  BMR_AGE_MIN,
  BMR_AGE_MAX,
  needsBodyFat,
  MINIMUM_DAILY_CALORIES,
};
export type { BmrFormula };

export interface CalorieValues {
  system: 'metric' | 'imperial';
  sex: Sex;
  age: string;
  heightCm: string;
  weightKg: string;
  heightFt: string;
  heightIn: string;
  weightLb: string;
  activity: string;
  /* --- settings --- */
  formula: BmrFormula;
  bodyFatPct: string;
}

export const MSG = {
  ageMissing: 'Enter your age.',
  ageWhole: 'Enter an age in whole years.',
  ageRange: `Enter an age from ${BMR_AGE_MIN} to ${BMR_AGE_MAX}.`,
  heightMissing: 'Enter your height.',
  heightPositive: 'Enter a height greater than zero.',
  heightInches: 'Enter inches from 0 to 11.',
  heightFeetWhole: 'Enter feet as a whole number.',
  weightMissing: 'Enter your weight.',
  weightPositive: 'Enter a weight greater than zero.',
  activityMissing: 'Choose an activity level.',
  bodyFatMissing: 'Katch-McArdle needs your body fat percentage.',
  bodyFatRange: 'Enter a body fat percentage from 0 to 99.9.',
} as const;

const nf = new Intl.NumberFormat('en-US');

/** A calorie figure with thousands separators; anything unusable renders as a dash. */
export const formatCalories = (v: number): string =>
  Number.isFinite(v) && v > 0 ? nf.format(Math.round(v)) : '—';

/** A usable calorie figure: finite and strictly positive. */
export const isUsableCalories = (v: number): boolean => Number.isFinite(v) && v > 0;

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type PositiveParse = 'empty' | 'nonpositive' | number;

function parsePositive(raw: string): PositiveParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'nonpositive';
  return n;
}

export function ageError(raw: string): string | null {
  const t = raw.trim();
  if (t === '') return MSG.ageMissing;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return MSG.ageWhole;
  if (n < BMR_AGE_MIN || n > BMR_AGE_MAX) return MSG.ageRange;
  return null;
}

export function bodyFatError(formula: BmrFormula, raw: string): string | null {
  if (!needsBodyFat(formula)) return null;
  const t = raw.trim();
  if (t === '') return MSG.bodyFatMissing;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n >= 100) return MSG.bodyFatRange;
  return null;
}

/** The activity must be one of the six bands — never an arbitrary multiplier. */
export function activityError(raw: string): string | null {
  const n = Number(raw);
  return ACTIVITY_BANDS.some((b) => b.value === n) ? null : MSG.activityMissing;
}

function validateImperialHeight(ftRaw: string, inRaw: string): string | null {
  switch (classifyImperialHeight(ftRaw, inRaw)) {
    case 'ok':
      return null;
    case 'empty':
      return MSG.heightMissing;
    case 'inches-out-of-range':
      return MSG.heightInches;
    case 'feet-not-integer':
      return MSG.heightFeetWhole;
    case 'nonpositive':
      return MSG.heightPositive;
  }
}

export function validateCalorieValues(values: CalorieValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const age = ageError(values.age);
  if (age) fieldErrors.age = age;

  if (values.system === 'metric') {
    const h = parsePositive(values.heightCm);
    if (h === 'empty') fieldErrors.heightCm = MSG.heightMissing;
    else if (h === 'nonpositive') fieldErrors.heightCm = MSG.heightPositive;

    const w = parsePositive(values.weightKg);
    if (w === 'empty') fieldErrors.weightKg = MSG.weightMissing;
    else if (w === 'nonpositive') fieldErrors.weightKg = MSG.weightPositive;
  } else {
    const heightError = validateImperialHeight(values.heightFt, values.heightIn);
    if (heightError) fieldErrors.height = heightError;

    const w = parsePositive(values.weightLb);
    if (w === 'empty') fieldErrors.weightLb = MSG.weightMissing;
    else if (w === 'nonpositive') fieldErrors.weightLb = MSG.weightPositive;
  }

  const activity = activityError(values.activity);
  if (activity) fieldErrors.activity = activity;

  const fat = bodyFatError(values.formula, values.bodyFatPct);
  if (fat) fieldErrors.bodyFatPct = fat;

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export interface CalorieComputed extends CalorieResult {
  system: 'metric' | 'imperial';
}

function toCalorieInput(values: CalorieValues): CalorieInput {
  const shared = {
    sex: values.sex,
    age: Number(values.age),
    activity: Number(values.activity),
    formula: values.formula,
    bodyFatPct: values.bodyFatPct.trim() === '' ? undefined : Number(values.bodyFatPct),
  };
  if (values.system === 'metric') {
    return { ...shared, system: 'metric', heightCm: Number(values.heightCm), weightKg: Number(values.weightKg) };
  }
  return {
    ...shared,
    system: 'imperial',
    heightFt: Number(values.heightFt || 0),
    heightIn: Number(values.heightIn || 0),
    weightLb: Number(values.weightLb),
  };
}

export function computeCalories(values: CalorieValues): CalorieComputed {
  return { ...calculateCalories(toCalorieInput(values)), system: values.system };
}

/**
 * The finiteness sentinel the runtime gates the whole result on: finite only when every
 * row AND both zigzag weeks reconcile, so a half-filled report can never reach the panel.
 *
 * A goal row that lands at or below zero — an extreme deficit for a very small person —
 * is not a usable target, and the guard refuses the whole report rather than printing a
 * negative calorie count in one row of an otherwise plausible table.
 */
export function completeCalorieValue(result: CalorieComputed): number {
  if (!isUsableCalories(result.maintenance)) return Number.NaN;
  if (result.goals.length === 0 || result.zigzag.length !== 2) return Number.NaN;
  for (const g of result.goals) if (!isUsableCalories(g.calories)) return Number.NaN;
  for (const s of result.zigzag) for (const d of s.days) if (!isUsableCalories(d.calories)) return Number.NaN;
  return result.maintenance;
}

/** The rate as this unit system writes it: "0.5 kg/week" or "1 lb/week". */
export function rateFor(row: { rateMetric: string; rateImperial: string }, system: 'metric' | 'imperial'): string {
  return system === 'metric' ? row.rateMetric : row.rateImperial;
}

/** The doctor warning, worded for the unit system the visitor is in. */
export function minimumWarning(system: 'metric' | 'imperial'): string {
  const rate = system === 'metric' ? '1 kg' : '2 lb';
  return `Please consult with a doctor when losing ${rate} or more per week, since it requires that you consume less than the minimum recommendation of ${nf.format(MINIMUM_DAILY_CALORIES)} calories a day.`;
}

/** Concise accessible announcement — maintenance only, never the whole table. */
export function describeCalorieResult(result: CalorieComputed): string {
  return `To maintain your weight you need about ${formatCalories(result.maintenance)} Calories a day.`;
}

/* ------------------------------------------------------------------ */
/* Unit conversion (pure)                                              */
/* ------------------------------------------------------------------ */

export interface MetricBody {
  heightCm: number | null;
  weightKg: number | null;
}
export interface ImperialBody {
  heightFt: number | null;
  heightIn: number | null;
  weightLb: number | null;
}

export function metricToImperial(m: MetricBody): ImperialBody {
  const out: ImperialBody = { heightFt: null, heightIn: null, weightLb: null };
  if (m.heightCm !== null && m.heightCm > 0) {
    const { feet, inches } = totalInchesToFeetAndInches(centimetresToTotalInches(m.heightCm));
    out.heightFt = feet;
    out.heightIn = inches;
  }
  if (m.weightKg !== null && m.weightKg > 0) out.weightLb = round1(kilogramsToPounds(m.weightKg));
  return out;
}

export function imperialToMetric(i: ImperialBody): MetricBody {
  const out: MetricBody = { heightCm: null, weightKg: null };
  if (i.heightFt !== null || i.heightIn !== null) {
    const total = (i.heightFt ?? 0) * 12 + (i.heightIn ?? 0);
    if (total > 0) out.heightCm = round1(totalInchesToCentimetres(total));
  }
  if (i.weightLb !== null && i.weightLb > 0) out.weightKg = round1(poundsToKilograms(i.weightLb));
  return out;
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const readValue = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';
const readChecked = (root: HTMLElement, name: string, fallback: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value ?? fallback;

const numOrNull = (raw: string | undefined): number | null => {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const toField = (n: number | null): string => (n === null ? '' : String(n));

const VALID_FORMULAS = new Set<string>(BMR_FORMULAS.map((f) => f.value));

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

export const calorieBinding: FormCalculatorBinding<CalorieValues, CalorieComputed> = {
  readValues(root) {
    const active = root.querySelector<HTMLElement>('[data-unit].is-active, [data-unit][aria-checked="true"]');
    const system = active?.dataset.unit === 'metric' ? 'metric' : 'imperial';
    const sex = readChecked(root, 'sex', 'male');
    const formula = readChecked(root, 'formula', 'mifflin');
    return {
      system,
      sex: sex === 'female' ? 'female' : 'male',
      age: readValue(root, 'age'),
      heightCm: readValue(root, 'heightCm'),
      weightKg: readValue(root, 'weightKg'),
      heightFt: readValue(root, 'heightFt'),
      heightIn: readValue(root, 'heightIn'),
      weightLb: readValue(root, 'weightLb'),
      activity: readValue(root, 'activity') || String(DEFAULT_ACTIVITY),
      formula: (VALID_FORMULAS.has(formula) ? formula : 'mifflin') as BmrFormula,
      bodyFatPct: readValue(root, 'bodyFatPct'),
    };
  },

  validate: validateCalorieValues,

  compute: computeCalories,

  resultValue: completeCalorieValue,

  describeResult: describeCalorieResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;

    for (const goal of result.goals) {
      const row = scope.querySelector<HTMLElement>(`[data-goal="${goal.key}"]`);
      if (!row) continue;
      const set = (sel: string, text: string) => {
        const el = row.querySelector<HTMLElement>(sel);
        if (el) el.textContent = text;
      };
      set('[data-goal-calories]', formatCalories(goal.calories));
      set('[data-goal-percent]', `${goal.percent}%`);
      set('[data-goal-rate]', rateFor(goal, result.system));
    }

    // The doctor warning belongs to a report that actually goes below the minimum.
    const warning = scope.querySelector<HTMLElement>('[data-minimum-warning]');
    if (warning) {
      warning.hidden = !result.belowMinimum;
      warning.textContent = minimumWarning(result.system);
    }

    // Both zigzag weeks, filled by schedule then by day.
    for (const schedule of result.zigzag) {
      const table = scope.querySelector<HTMLElement>(`[data-zigzag="${schedule.key}"]`);
      if (!table) continue;
      schedule.days.forEach((day) => {
        const cell = table.querySelector<HTMLElement>(`[data-zigzag-day="${day.day}"]`);
        if (cell) cell.textContent = formatCalories(day.calories);
      });
      const total = table.querySelector<HTMLElement>('[data-zigzag-total]');
      if (total) {
        total.textContent = formatCalories(schedule.days.reduce((sum, d) => sum + d.calories, 0));
      }
    }
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['age', 'heightCm', 'weightKg', 'heightFt', 'heightIn', 'weightLb', 'bodyFatPct']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
    const activity = root.querySelector<HTMLSelectElement>('[name="activity"]');
    if (activity) activity.value = String(DEFAULT_ACTIVITY);
    const check = (name: string, value: string) => {
      root.querySelectorAll<HTMLInputElement>(`[name="${name}"]`).forEach((el) => {
        el.checked = el.value === value;
      });
    };
    check('sex', 'male');
    check('formula', 'mifflin');
  },

  convertValues(root, fromUnit, toUnit) {
    if (fromUnit === 'metric' && toUnit === 'imperial') {
      const imp = metricToImperial({
        heightCm: numOrNull(input(root, 'heightCm')?.value),
        weightKg: numOrNull(input(root, 'weightKg')?.value),
      });
      const ft = input(root, 'heightFt');
      const inch = input(root, 'heightIn');
      const lb = input(root, 'weightLb');
      if (ft) ft.value = toField(imp.heightFt);
      if (inch) inch.value = toField(imp.heightIn);
      if (lb) lb.value = toField(imp.weightLb);
    } else if (fromUnit === 'imperial' && toUnit === 'metric') {
      const met = imperialToMetric({
        heightFt: numOrNull(input(root, 'heightFt')?.value),
        heightIn: numOrNull(input(root, 'heightIn')?.value),
        weightLb: numOrNull(input(root, 'weightLb')?.value),
      });
      const cm = input(root, 'heightCm');
      const kg = input(root, 'weightKg');
      if (cm) cm.value = toField(met.heightCm);
      if (kg) kg.value = toField(met.weightKg);
    }
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * Example inputs for the labelled worked result shown on first load — the reference's own
 * published US case, in the system the tabs open on, so the example never reads in one unit
 * under a tab that says another. These are OURS, not the visitor's.
 */
export const CALORIE_EXAMPLE_VALUES: CalorieValues = {
  system: 'imperial',
  sex: 'male',
  age: '25',
  heightCm: '',
  weightKg: '',
  heightFt: '5',
  heightIn: '10',
  weightLb: '165',
  activity: String(DEFAULT_ACTIVITY),
  formula: 'mifflin',
  bodyFatPct: '',
};

/**
 * Fat-intake form binding — the reference's fields, settings and report, on the UNCHANGED
 * standard-form runtime.
 *
 * The reference asks for age (18–80), gender, height, weight and one activity band under a
 * US / Metric unit tab, with the same "+ Settings" choices the BMR and calorie calculators
 * have. Unlike protein, EVERY figure it reports is a share of the Calories the visitor
 * burns — total fat from the AMDR, and two published ceilings on saturated fat — so the
 * whole report moves together when any input moves.
 *
 * Every figure comes from the reviewed pure `calculateFatIntake`. Age parsing uses the
 * shared `classifyAge` (the span is this calculator's: adults only); Metric/US conversion
 * and imperial-height classification use the shared `@lib/health/body-measurements`
 * primitives; the activity bands and BMR equations are the same shared modules the calorie
 * calculator uses. Field-error MESSAGES stay here per the R7B.1 policy.
 */
import {
  calculateFatIntake,
  ACTIVITY_BANDS,
  DEFAULT_ACTIVITY,
  FAT_AGE_MIN,
  FAT_AGE_MAX,
  AMDR_MIN_PCT,
  AMDR_MAX_PCT,
  SATURATED_GUIDELINES_PCT,
  SATURATED_AHA_PCT,
  KCAL_PER_GRAM_FAT,
  type FatIntakeInput,
  type FatIntakeResult,
  type Sex,
} from './fat-intake';
import { ACTIVITY_BAND_NOTES } from '@lib/health/activity-levels';
import { BMR_FORMULAS, needsBodyFat, type BmrFormula } from './bmr';
import {
  round1,
  classifyAge,
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
  FAT_AGE_MIN,
  FAT_AGE_MAX,
  AMDR_MIN_PCT,
  AMDR_MAX_PCT,
  SATURATED_GUIDELINES_PCT,
  SATURATED_AHA_PCT,
  KCAL_PER_GRAM_FAT,
  needsBodyFat,
};
export type { BmrFormula };

export interface FatIntakeValues {
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
  ageRange: `Enter an age from ${FAT_AGE_MIN} to ${FAT_AGE_MAX}.`,
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

/** A gram figure; anything unusable renders as a dash rather than a number. */
export const formatGrams = (v: number): string =>
  Number.isFinite(v) && v > 0 ? nf.format(Math.round(v)) : '—';

export const isUsableGrams = (v: number): boolean => Number.isFinite(v) && v > 0;

/**
 * "52 - 92 grams/day" for a range, "up to 26 grams/day" for a ceiling.
 *
 * A ceiling and a range must not read the same: "26 grams/day" beside "52 - 92 grams/day"
 * would look like a target to hit rather than a limit not to cross.
 */
export function formatBasis(low: number, high?: number, ceiling = false): string {
  if (!isUsableGrams(low)) return '—';
  if (high === undefined) return ceiling ? `up to ${formatGrams(low)} grams/day` : `${formatGrams(low)} grams/day`;
  if (!isUsableGrams(high)) return '—';
  return `${formatGrams(low)} - ${formatGrams(high)} grams/day`;
}

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

/** Adults only — the recommendations this calculator reports are adult ones. */
export function ageError(raw: string): string | null {
  switch (classifyAge(raw, FAT_AGE_MIN, FAT_AGE_MAX)) {
    case 'ok':
      return null;
    case 'empty':
      return MSG.ageMissing;
    case 'not-whole':
      return MSG.ageWhole;
    case 'out-of-range':
      return MSG.ageRange;
  }
}

export function bodyFatError(formula: BmrFormula, raw: string): string | null {
  if (!needsBodyFat(formula)) return null;
  const t = raw.trim();
  if (t === '') return MSG.bodyFatMissing;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n >= 100) return MSG.bodyFatRange;
  return null;
}

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

export function validateFatIntakeValues(values: FatIntakeValues): ValidationResult {
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

export interface FatIntakeComputed extends FatIntakeResult {
  system: 'metric' | 'imperial';
}

function toFatIntakeInput(values: FatIntakeValues): FatIntakeInput {
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

export function computeFatIntake(values: FatIntakeValues): FatIntakeComputed {
  return { ...calculateFatIntake(toFatIntakeInput(values)), system: values.system };
}

/**
 * The finiteness sentinel the runtime gates the whole result on: finite only when EVERY row
 * reconciles, so a report with one blank basis never reaches the panel.
 */
export function completeFatIntakeValue(result: FatIntakeComputed): number {
  if (!isUsableGrams(result.calories)) return Number.NaN;
  if (!isUsableGrams(result.totalLow) || !isUsableGrams(result.totalHigh)) return Number.NaN;
  if (result.bases.length !== 3) return Number.NaN;
  for (const b of result.bases) {
    if (!isUsableGrams(b.low)) return Number.NaN;
    if (b.high !== undefined && !isUsableGrams(b.high)) return Number.NaN;
  }
  return result.totalLow;
}

/** Concise accessible announcement — the total-fat range only, never the whole table. */
export function describeFatIntakeResult(result: FatIntakeComputed): string {
  return `Aim for ${formatGrams(result.totalLow)} to ${formatGrams(result.totalHigh)} grams of fat a day.`;
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

export const fatIntakeBinding: FormCalculatorBinding<FatIntakeValues, FatIntakeComputed> = {
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

  validate: validateFatIntakeValues,

  compute: computeFatIntake,

  resultValue: completeFatIntakeValue,

  describeResult: describeFatIntakeResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };

    // Dominant: the total-fat range, the figure the two ceilings sit under.
    set('[data-fat-low]', formatGrams(result.totalLow));
    set('[data-fat-high]', formatGrams(result.totalHigh));
    set('[data-fat-a11y]', `${formatGrams(result.totalLow)} to ${formatGrams(result.totalHigh)} grams per day`);
    set('[data-fat-calories]', nf.format(result.calories));

    for (const basis of result.bases) {
      const row = scope.querySelector<HTMLElement>(`[data-basis="${basis.key}"]`);
      if (!row) continue;
      const cell = row.querySelector<HTMLElement>('[data-basis-grams]');
      if (cell) cell.textContent = formatBasis(basis.low, basis.high, basis.ceiling);
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
 * published case, in the system the tabs open on and at the band its screenshot shows.
 * These are OURS, not the visitor's.
 */
export const FAT_INTAKE_EXAMPLE_VALUES: FatIntakeValues = {
  system: 'imperial',
  sex: 'male',
  age: '25',
  heightCm: '',
  weightKg: '',
  heightFt: '5',
  heightIn: '10',
  weightLb: '160',
  activity: '1.375',
  formula: 'mifflin',
  bodyFatPct: '',
};

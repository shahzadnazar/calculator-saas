/**
 * BMR form binding — the reference's fields, settings and result table, on the UNCHANGED
 * standard-form runtime.
 *
 * The reference asks for age, gender, height and weight under a US / Metric unit tab, and
 * hides three choices behind a "+ Settings" disclosure: which of three published equations
 * to use, a body-fat percentage for the one that needs it, and whether to answer in Calories
 * or kilojoules. Its result is one headline — "BMR = 1,717 Calories/day" — over a six-row
 * table of daily calorie needs by activity level.
 *
 * The equations live in the reviewed pure `bmr.ts`; the activity bands and their footnotes
 * live in the shared `@lib/health/activity-levels`, alongside the five-option select the
 * calorie calculator uses, so the same activity can never mean two different numbers.
 * Metric/Imperial conversion comes from the shared `@lib/health/body-measurements`
 * primitives; the field-error MESSAGES stay here per the R7B.1 policy.
 *
 * The table is computed from the ROUNDED headline, not the raw equation output, so every row
 * reconciles with the number printed above it.
 */
import {
  bmrFor,
  needsBodyFat,
  toResultUnit,
  BMR_FORMULAS,
  BMR_AGE_MIN,
  BMR_AGE_MAX,
  KJ_PER_KCAL,
  toMetricBody,
  type BmrFormula,
  type BmrInput,
  type Sex,
} from './bmr';
import { ACTIVITY_BANDS, ACTIVITY_BAND_NOTES } from '@lib/health/activity-levels';
import {
  round1,
  kilogramsToPounds,
  poundsToKilograms,
  centimetresToTotalInches,
  totalInchesToCentimetres,
  totalInchesToFeetAndInches,
  classifyImperialHeight,
} from '@lib/health/body-measurements';
import { formatNumber } from '@lib/format';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export { BMR_FORMULAS, BMR_AGE_MIN, BMR_AGE_MAX, needsBodyFat, ACTIVITY_BANDS, ACTIVITY_BAND_NOTES };
export type { BmrFormula };

export type ResultUnit = 'kcal' | 'kj';

/** The two answers the settings panel offers, and how each is written. */
export const RESULT_UNITS: {
  value: ResultUnit;
  label: string;
  /** How the headline is written: "1,717 Calories/day". */
  suffix: string;
  /** How the headline is spoken. */
  speech: string;
  /** The activity table's value-column heading. */
  column: string;
  /** The sentence above the activity table. */
  tableTitle: string;
}[] = [
  { value: 'kcal', label: 'Calories', suffix: 'Calories/day', speech: 'Calories per day', column: 'Calorie', tableTitle: 'Daily calorie needs based on activity level' },
  { value: 'kj', label: 'Kilojoules', suffix: 'kJ/day', speech: 'kilojoules per day', column: 'Kilojoules', tableTitle: 'Daily energy needs based on activity level' },
];

export const resultUnitOf = (u: ResultUnit) => RESULT_UNITS.find((r) => r.value === u) ?? RESULT_UNITS[0];

/** Raw string values as read from the form (empty ≠ zero ≠ invalid). */
export interface BmrValues {
  system: 'metric' | 'imperial';
  sex: Sex;
  age: string;
  heightCm: string;
  weightKg: string;
  heightFt: string;
  heightIn: string;
  weightLb: string;
  /* --- settings --- */
  formula: BmrFormula;
  bodyFatPct: string;
  resultUnit: ResultUnit;
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
  bodyFatMissing: 'Katch-McArdle needs your body fat percentage.',
  bodyFatRange: 'Enter a body fat percentage from 0 to 99.9.',
} as const;

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

/** Age is a whole number of years, inside the span the reference accepts. */
export function ageError(raw: string): string | null {
  const t = raw.trim();
  if (t === '') return MSG.ageMissing;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return MSG.ageWhole;
  if (n < BMR_AGE_MIN || n > BMR_AGE_MAX) return MSG.ageRange;
  return null;
}

/** Body fat is required only by the equation that reads it. */
export function bodyFatError(formula: BmrFormula, raw: string): string | null {
  if (!needsBodyFat(formula)) return null;
  const t = raw.trim();
  if (t === '') return MSG.bodyFatMissing;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n >= 100) return MSG.bodyFatRange;
  return null;
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

/**
 * Validate the form. Presence and finiteness are explicit, never `Number(v) || 0`.
 *
 * Height and age are still required under Katch-McArdle even though its equation ignores
 * them: the visitor can switch equations after calculating, and a form that silently stopped
 * asking would hand them a blank box the moment they switched back.
 */
export function validateBmrValues(values: BmrValues): ValidationResult {
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

  const fat = bodyFatError(values.formula, values.bodyFatPct);
  if (fat) fieldErrors.bodyFatPct = fat;

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export interface BmrActivityEstimate {
  /** The activity multiplier (1.2 … 1.9). */
  value: number;
  /** The reference's own wording for the band. */
  label: string;
  /** Estimated daily energy need = round(BMR × multiplier), in the chosen unit. */
  kcal: number;
}

export interface BmrComputed {
  /** The headline, rounded, in the chosen result unit. */
  bmr: number;
  unit: ResultUnit;
  formula: BmrFormula;
  /** Activity-based daily-energy estimates (empty when the BMR is non-finite). */
  activity: BmrActivityEstimate[];
}

/**
 * BMR × the shared activity bands.
 *
 * Fed the ROUNDED, already-converted headline, so every row reconciles with the number
 * printed above it rather than with an unrounded value nobody can see.
 */
export function bmrActivityEstimates(bmr: number): BmrActivityEstimate[] {
  if (!Number.isFinite(bmr)) return [];
  return ACTIVITY_BANDS.map((b) => ({ value: b.value, label: b.label, kcal: Math.round(bmr * b.value) }));
}

function toBmrInput(values: BmrValues): BmrInput {
  const age = Number(values.age);
  const shared = {
    sex: values.sex,
    age,
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

export function computeBmr(values: BmrValues): BmrComputed {
  const input = toBmrInput(values);
  const { kg, cm } = toMetricBody(input);
  const age = input.age;
  const rawKcal =
    kg > 0 && cm > 0 && age > 0
      ? bmrFor(values.formula, values.sex, kg, cm, age, input.bodyFatPct)
      : Number.NaN;
  const bmr = Number.isFinite(rawKcal) ? Math.round(toResultUnit(rawKcal, values.resultUnit)) : Number.NaN;
  return { bmr, unit: values.resultUnit, formula: values.formula, activity: bmrActivityEstimates(bmr) };
}

/**
 * The finiteness sentinel the runtime gates the whole result on: finite only when the
 * headline AND every row of the table reconcile, so no half-filled table reaches the panel.
 */
export function completeBmrValue(result: BmrComputed): number {
  if (!Number.isFinite(result.bmr) || result.bmr <= 0) return Number.NaN;
  if (result.activity.length !== ACTIVITY_BANDS.length) return Number.NaN;
  for (const a of result.activity) if (!Number.isFinite(a.kcal)) return Number.NaN;
  return result.bmr;
}

/** Concise accessible announcement — the BMR only, NEVER the activity table. */
export function describeBmrResult(result: BmrComputed): string {
  return `Your basal metabolic rate is ${formatNumber(result.bmr, 0)} ${resultUnitOf(result.unit).speech}.`;
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

/** Metric → imperial. Empty (null) or non-positive values stay null so the
 *  runtime never fabricates a default from an empty field. */
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

/** Imperial → metric. A height with both parts empty stays null; weight that is
 *  empty or non-positive stays null. */
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
const readValue = (root: HTMLElement, name: string) => input(root, name)?.value ?? '';
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
const VALID_UNITS = new Set<string>(RESULT_UNITS.map((u) => u.value));

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

export const bmrBinding: FormCalculatorBinding<BmrValues, BmrComputed> = {
  readValues(root) {
    const active = root.querySelector<HTMLElement>('[data-unit].is-active, [data-unit][aria-checked="true"]');
    const system = active?.dataset.unit === 'metric' ? 'metric' : 'imperial';
    const sex = readChecked(root, 'sex', 'male');
    const formula = readChecked(root, 'formula', 'mifflin');
    const resultUnit = readChecked(root, 'resultUnit', 'kcal');
    return {
      system,
      sex: sex === 'female' ? 'female' : 'male',
      age: readValue(root, 'age'),
      heightCm: readValue(root, 'heightCm'),
      weightKg: readValue(root, 'weightKg'),
      heightFt: readValue(root, 'heightFt'),
      heightIn: readValue(root, 'heightIn'),
      weightLb: readValue(root, 'weightLb'),
      formula: (VALID_FORMULAS.has(formula) ? formula : 'mifflin') as BmrFormula,
      bodyFatPct: readValue(root, 'bodyFatPct'),
      resultUnit: (VALID_UNITS.has(resultUnit) ? resultUnit : 'kcal') as ResultUnit,
    };
  },

  validate: validateBmrValues,

  compute: computeBmr,

  resultValue: completeBmrValue,

  describeResult: describeBmrResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const unit = resultUnitOf(result.unit);

    const valueEl = q('[data-bmr-value]');
    const suffixEl = q('[data-bmr-suffix]');
    const a11yEl = q('[data-bmr-a11y]');
    const bmrText = formatNumber(result.bmr, 0);
    if (valueEl) valueEl.textContent = bmrText;
    if (suffixEl) suffixEl.textContent = unit.suffix;
    if (a11yEl) a11yEl.textContent = `${bmrText} ${unit.speech}`;

    const colHead = q('[data-bmr-col-head]');
    const tableTitle = q('[data-bmr-table-title]');
    if (colHead) colHead.textContent = unit.column;
    if (tableTitle) tableTitle.textContent = unit.tableTitle;

    // The table's activity labels are static in the markup; only the numbers change.
    scope.querySelectorAll<HTMLElement>('[data-bmr-activity]').forEach((el, i) => {
      const est = result.activity[i];
      el.textContent = est ? formatNumber(est.kcal, 0) : '—';
    });
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['age', 'heightCm', 'weightKg', 'heightFt', 'heightIn', 'weightLb', 'bodyFatPct']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
    // Restore the structural defaults: male, Mifflin-St Jeor, Calories. The runtime owns the
    // unit tab; sex, equation and result unit are not units, so the binding owns them.
    const check = (name: string, value: string) => {
      root.querySelectorAll<HTMLInputElement>(`[name="${name}"]`).forEach((el) => {
        el.checked = el.value === value;
      });
    };
    check('sex', 'male');
    check('formula', 'mifflin');
    check('resultUnit', 'kcal');
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
 * published US case (a 25-year-old man, 5 ft 10 in, 160 lb), in the system the tabs open on,
 * so the worked result never reads in one unit under a tab that says another.
 *
 * These are OURS, not the visitor's: the shared runtime computes them through this binding's
 * own `renderResult`, and the visitor's fields stay empty behind them.
 */
export const BMR_EXAMPLE_VALUES: BmrValues = {
  system: 'imperial',
  sex: 'male',
  age: '25',
  heightCm: '',
  weightKg: '',
  heightFt: '5',
  heightIn: '10',
  weightLb: '160',
  formula: 'mifflin',
  bodyFatPct: '',
  resultUnit: 'kcal',
};

export { KJ_PER_KCAL };

/**
 * BMR form binding (R7B) — the standard-form binding for the BMR calculator.
 *
 * R7B is the first calculator to GENERALIZE the shipped standard-form runtime
 * (`@lib/result/form-runtime`) beyond its BMI pilot. The runtime is used
 * unchanged; this binding owns everything BMR-specific: reading values (incl. the
 * sex selector BMI lacks), BMR validation, Metric/Imperial conversion, calling
 * the reviewed pure `calculateBmr` (Mifflin-St Jeor — preserved), rendering the
 * dominant BMR figure + the secondary activity-based daily-calorie estimates, the
 * accessible result description, and resetting BMR fields.
 *
 * The activity estimates reuse the canonical `ACTIVITY_LEVELS` from the calorie
 * module (BMR × level = TDEE) — no medical semantics are invented, and the
 * calorie calculator is not modified. Body-metric parsing, validation and unit
 * conversion MIRROR BMI's accepted semantics and are replicated here (not
 * imported) so the BMI binding stays byte-for-byte untouched; a later standard-
 * form wave should extract them into a shared body-metrics module.
 *
 * Pure parts (`validateBmrValues`, `metricToImperial`, `imperialToMetric`,
 * `bmrActivityEstimates`, `describeBmrResult`) are unit-tested directly; the DOM
 * parts (`readValues`, `renderResult`, `resetValues`, `convertValues`) are
 * exercised end-to-end.
 */
import { calculateBmr, type BmrInput, type Sex } from './bmr';
import { ACTIVITY_LEVELS } from './calorie';
import { formatNumber } from '@lib/format';
import { accessibleResultName } from '@lib/result/state';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;
const BMR_UNIT = 'kcal/day';

/** Raw string values as read from the form (empty ≠ zero ≠ invalid). Sex + age
 *  are shared across unit systems; height/weight vary by system. */
export type BmrValues =
  | { sex: Sex; system: 'metric'; age: string; heightCm: string; weightKg: string }
  | { sex: Sex; system: 'imperial'; age: string; heightFt: string; heightIn: string; weightLb: string };

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure) — mirrors BMI's accepted semantics      */
/* ------------------------------------------------------------------ */

type PositiveParse = 'empty' | 'nonpositive' | number;

function parsePositive(raw: string): PositiveParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'nonpositive';
  return n;
}

/**
 * Validate the imperial height pair into one field message (both parts share the
 * `data-field="height"` slot). Feet: optional/zero valid, else a finite
 * non-negative integer. Inches: optional/zero valid, else finite and
 * 0 ≤ inches < 12 (12+ is an error, never silently normalized). Total must be > 0.
 * Identical to BMI's accepted imperial-height semantics.
 */
function validateImperialHeight(ftRaw: string, inRaw: string): string | null {
  const ft = ftRaw.trim();
  const inch = inRaw.trim();
  if (ft === '' && inch === '') return 'Enter your height.';

  const ftNum = ft === '' ? 0 : Number(ft);
  const inNum = inch === '' ? 0 : Number(inch);

  const inchesBad = inch !== '' && (!Number.isFinite(inNum) || inNum < 0 || inNum >= 12);
  if (inchesBad) return 'Enter inches from 0 to 11.';

  const feetBad = ft !== '' && (!Number.isFinite(ftNum) || ftNum < 0 || !Number.isInteger(ftNum));
  if (feetBad) return 'Enter feet as a whole number.';

  if (ftNum * 12 + inNum <= 0) return 'Enter a height greater than zero.';
  return null;
}

/**
 * Validate BMR form values. Presence + finiteness are explicit (never
 * `Number(value) || 0`). Field keys match the markup: `age`; metric →
 * `heightCm`, `weightKg`; imperial → `height`, `weightLb`. No restrictive medical
 * range is imposed — any positive age/height/weight is accepted (the existing
 * implementation imposed none, and #5 forbids inventing one).
 */
export function validateBmrValues(values: BmrValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const age = parsePositive(values.age);
  if (age === 'empty') fieldErrors.age = 'Enter your age.';
  else if (age === 'nonpositive') fieldErrors.age = 'Enter an age greater than zero.';

  if (values.system === 'metric') {
    const h = parsePositive(values.heightCm);
    if (h === 'empty') fieldErrors.heightCm = 'Enter your height.';
    else if (h === 'nonpositive') fieldErrors.heightCm = 'Enter a height greater than zero.';

    const w = parsePositive(values.weightKg);
    if (w === 'empty') fieldErrors.weightKg = 'Enter your weight.';
    else if (w === 'nonpositive') fieldErrors.weightKg = 'Enter a weight greater than zero.';
  } else {
    const heightError = validateImperialHeight(values.heightFt, values.heightIn);
    if (heightError) fieldErrors.height = heightError;

    const w = parsePositive(values.weightLb);
    if (w === 'empty') fieldErrors.weightLb = 'Enter your weight.';
    else if (w === 'nonpositive') fieldErrors.weightLb = 'Enter a weight greater than zero.';
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation + description (pure)                                    */
/* ------------------------------------------------------------------ */

export interface BmrActivityEstimate {
  /** The activity multiplier (1.2 … 1.9). */
  value: number;
  /** Human label, e.g. "Sedentary (little or no exercise)". */
  label: string;
  /** Estimated daily calories = round(BMR × multiplier). */
  kcal: number;
}

export interface BmrComputed {
  bmr: number;
  /** Activity-based daily-calorie estimates (empty when BMR is non-finite). */
  activity: BmrActivityEstimate[];
}

/** BMR × the canonical activity levels = daily-calorie (TDEE) estimates. */
export function bmrActivityEstimates(bmr: number): BmrActivityEstimate[] {
  if (!Number.isFinite(bmr)) return [];
  return ACTIVITY_LEVELS.map((l) => ({ value: l.value, label: l.label, kcal: Math.round(bmr * l.value) }));
}

function toBmrInput(values: BmrValues): BmrInput {
  const age = Number(values.age);
  if (values.system === 'metric') {
    return { sex: values.sex, age, system: 'metric', heightCm: Number(values.heightCm), weightKg: Number(values.weightKg) };
  }
  return {
    sex: values.sex,
    age,
    system: 'imperial',
    heightFt: Number(values.heightFt || 0),
    heightIn: Number(values.heightIn || 0),
    weightLb: Number(values.weightLb),
  };
}

export function computeBmr(values: BmrValues): BmrComputed {
  const { bmr } = calculateBmr(toBmrInput(values));
  return { bmr, activity: bmrActivityEstimates(bmr) };
}

/** Concise accessible announcement — the BMR only, NEVER the activity table. */
export function describeBmrResult(result: BmrComputed): string {
  return `Your estimated basal metabolic rate is ${formatNumber(result.bmr, 0)} kilocalories per day.`;
}

/* ------------------------------------------------------------------ */
/* Unit conversion (pure) — mirrors BMI's accepted semantics           */
/* ------------------------------------------------------------------ */

const round1 = (n: number) => Math.round(n * 10) / 10;

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
    const totalIn = Math.round(m.heightCm / CM_PER_IN);
    out.heightFt = Math.floor(totalIn / 12);
    out.heightIn = totalIn % 12;
  }
  if (m.weightKg !== null && m.weightKg > 0) out.weightLb = round1(m.weightKg * LB_PER_KG);
  return out;
}

/** Imperial → metric. A height with both parts empty stays null; weight that is
 *  empty or non-positive stays null. */
export function imperialToMetric(i: ImperialBody): MetricBody {
  const out: MetricBody = { heightCm: null, weightKg: null };
  if (i.heightFt !== null || i.heightIn !== null) {
    const total = (i.heightFt ?? 0) * 12 + (i.heightIn ?? 0);
    if (total > 0) out.heightCm = round1(total * CM_PER_IN);
  }
  if (i.weightLb !== null && i.weightLb > 0) out.weightKg = round1(i.weightLb / LB_PER_KG);
  return out;
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                          */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);

const numOrNull = (raw: string | undefined): number | null => {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const toField = (n: number | null): string => (n === null ? '' : String(n));

const readSex = (root: HTMLElement): Sex =>
  (root.querySelector<HTMLInputElement>('[name="sex"]:checked')?.value as Sex) ?? 'male';

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

export const bmrBinding: FormCalculatorBinding<BmrValues, BmrComputed> = {
  readValues(root) {
    const active = root.querySelector<HTMLElement>('[data-unit].is-active, [data-unit][aria-checked="true"]');
    const system = active?.dataset.unit === 'imperial' ? 'imperial' : 'metric';
    const sex = readSex(root);
    const age = input(root, 'age')?.value ?? '';
    if (system === 'metric') {
      return {
        sex,
        system: 'metric',
        age,
        heightCm: input(root, 'heightCm')?.value ?? '',
        weightKg: input(root, 'weightKg')?.value ?? '',
      };
    }
    return {
      sex,
      system: 'imperial',
      age,
      heightFt: input(root, 'heightFt')?.value ?? '',
      heightIn: input(root, 'heightIn')?.value ?? '',
      weightLb: input(root, 'weightLb')?.value ?? '',
    };
  },

  validate: validateBmrValues,

  compute: computeBmr,

  resultValue(result) {
    return result.bmr;
  },

  describeResult: describeBmrResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const valueEl = q('[data-result-when~="valid"] [data-result-value]');
    const a11yEl = q('[data-result-when~="valid"] [data-result-value-a11y]');

    const bmrText = formatNumber(result.bmr, 0);
    if (valueEl) valueEl.textContent = bmrText;
    if (a11yEl) a11yEl.textContent = accessibleResultName(bmrText, BMR_UNIT);

    // Secondary: fill the activity rows in order (labels are static in markup).
    scope.querySelectorAll<HTMLElement>('[data-bmr-activity]').forEach((el, i) => {
      const est = result.activity[i];
      if (est) el.textContent = formatNumber(est.kcal, 0);
    });
  },

  resetValues(root, _mode: ResetMode) {
    // Clear personal numeric values…
    for (const name of ['age', 'heightCm', 'weightKg', 'heightFt', 'heightIn', 'weightLb']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
    // …and restore the safe structural default for sex (Male). The runtime
    // restores the default UNIT itself; sex is not a unit, so the binding owns it.
    const male = root.querySelector<HTMLInputElement>('[name="sex"][value="male"]');
    const female = root.querySelector<HTMLInputElement>('[name="sex"][value="female"]');
    if (male) male.checked = true;
    if (female) female.checked = false;
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

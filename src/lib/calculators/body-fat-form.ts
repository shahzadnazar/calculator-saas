/**
 * Body-fat form binding (R7C-2A) — standard-form binding for the body-fat
 * calculator (U.S. Navy circumference method). The FIRST standard-form migration
 * with CONDITIONAL inputs: the female formula needs a hip measurement the male
 * formula does not.
 *
 * The runtime (@lib/result/form-runtime) is used UNCHANGED — it does not know
 * about conditional fields. This binding owns everything body-fat-specific:
 *   - reading a sex selector + height/neck/waist (+ hip when female);
 *   - a SEX-DEPENDENT required-field set (hip is required and validated ONLY when
 *     female; hidden fields are excluded from validation);
 *   - explicit presence/positivity validation + the FORMULA-DOMAIN relationships
 *     the Navy method needs (waist > neck for men; waist + hip > neck for women),
 *     phrased in plain language — never "logarithm argument must be positive";
 *   - Metric/Imperial conversion of every entered measurement (empty stays empty,
 *     so a hidden hip is never fabricated);
 *   - a finiteness/positivity gate so a non-finite OR non-positive estimate (which
 *     the reviewed formula can return for out-of-domain inputs) shows the invalid
 *     state instead of a nonsensical percentage;
 *   - the dominant percentage + the text classification + the sex-specific
 *     category scale.
 *
 * All computation delegates to the reviewed pure `calculateBodyFat` (formula +
 * classification preserved). Conversion reuses the shared
 * `@lib/health/body-measurements` primitives; field-error MESSAGES stay here.
 *
 * Conditional-field VISIBILITY (showing/hiding the hip row on a sex change) is a
 * DOM concern owned by the island script; `resetValues` re-hides it on reset. The
 * binding owns the required-field SET (validation), which is the part that must be
 * correct for the runtime's valid/invalid transitions.
 */
import {
  calculateBodyFat,
  type BodyFatInput,
  type BodyFatResult,
  type BodyFatCategory,
  type Sex,
} from './body-fat';
import { round1, centimetresToTotalInches, totalInchesToCentimetres } from '@lib/health/body-measurements';
import { formatNumber } from '@lib/format';
import { accessibleResultName } from '@lib/result/state';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** Raw string values as read from the form. Sex is shared; the measurement field
 *  names vary by unit system. Hip is present in the shape but only REQUIRED when
 *  female (see `requiredFields`). */
export type BodyFatValues =
  | { sex: Sex; system: 'metric'; heightCm: string; neckCm: string; waistCm: string; hipCm: string }
  | { sex: Sex; system: 'imperial'; heightIn: string; neckIn: string; waistIn: string; hipIn: string };

export interface BodyFatComputed extends BodyFatResult {
  sex: Sex;
}

/** Displayed category bands per sex, derived from the reviewed `classify`
 *  thresholds (male <6/<14/<18/<25; female <14/<21/<25/<32). Category NAMES are
 *  identical across sexes and in the same low→high order, so one static row set
 *  serves both; only the range text is swapped in. Boundaries fall to the upper
 *  category, matching how these charts are drawn. */
export interface CategoryBand {
  category: BodyFatCategory;
  range: string;
}
export const CATEGORY_BANDS: Record<Sex, CategoryBand[]> = {
  male: [
    { category: 'Essential fat', range: 'Under 6%' },
    { category: 'Athletes', range: '6–14%' },
    { category: 'Fitness', range: '14–18%' },
    { category: 'Average', range: '18–25%' },
    { category: 'Obese', range: '25% and over' },
  ],
  female: [
    { category: 'Essential fat', range: 'Under 14%' },
    { category: 'Athletes', range: '14–21%' },
    { category: 'Fitness', range: '21–25%' },
    { category: 'Average', range: '25–32%' },
    { category: 'Obese', range: '32% and over' },
  ],
};

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

/** The measurement field names required for a given system + sex. Hip is included
 *  ONLY for female — so a hidden male hip is never in the validation set. */
export function requiredFields(system: 'metric' | 'imperial', sex: Sex): string[] {
  const base = system === 'metric' ? ['heightCm', 'neckCm', 'waistCm'] : ['heightIn', 'neckIn', 'waistIn'];
  if (sex === 'female') base.push(system === 'metric' ? 'hipCm' : 'hipIn');
  return base;
}

const MEASUREMENT_LABEL: Record<string, string> = {
  heightCm: 'height',
  heightIn: 'height',
  neckCm: 'neck',
  neckIn: 'neck',
  waistCm: 'waist',
  waistIn: 'waist',
  hipCm: 'hip',
  hipIn: 'hip',
};

function presenceMessage(name: string): string {
  const label = MEASUREMENT_LABEL[name];
  return label === 'height' ? 'Enter your height.' : `Enter your ${label} measurement.`;
}

/**
 * Validate body-fat values. Presence + positivity are explicit (never
 * `Number(value) || 0`). Only the sex-appropriate fields are required. When every
 * required field is individually valid, the Navy formula-domain relationship is
 * checked in plain language and attached to the waist field (the measurement the
 * visitor can act on): men need waist > neck; women need waist + hip > neck.
 */
export function validateBodyFatValues(values: BodyFatValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const req = requiredFields(values.system, values.sex);
  const v = values as Record<string, string>;

  for (const name of req) {
    const p = parsePositive(v[name]);
    if (p === 'empty') fieldErrors[name] = presenceMessage(name);
    else if (p === 'nonpositive') fieldErrors[name] = 'Enter a measurement greater than zero.';
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  // Every required field is present + positive → check the formula domain.
  const neckKey = values.system === 'metric' ? 'neckCm' : 'neckIn';
  const waistKey = values.system === 'metric' ? 'waistCm' : 'waistIn';
  const hipKey = values.system === 'metric' ? 'hipCm' : 'hipIn';
  const neck = Number(v[neckKey]);
  const waist = Number(v[waistKey]);
  if (values.sex === 'male') {
    if (waist - neck <= 0) fieldErrors[waistKey] = 'Your waist should be larger than your neck for this method.';
  } else {
    const hip = Number(v[hipKey]);
    if (waist + hip - neck <= 0) {
      fieldErrors[waistKey] = 'Your waist and hip together should be larger than your neck for this method.';
    }
  }
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation + description (pure)                                    */
/* ------------------------------------------------------------------ */

function toInput(values: BodyFatValues): BodyFatInput {
  const num = (raw: string): number | undefined => {
    const t = raw.trim();
    if (t === '') return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };
  if (values.system === 'metric') {
    return {
      sex: values.sex,
      system: 'metric',
      heightCm: num(values.heightCm),
      neckCm: num(values.neckCm),
      waistCm: num(values.waistCm),
      hipCm: num(values.hipCm), // undefined when empty — never fabricated
    };
  }
  return {
    sex: values.sex,
    system: 'imperial',
    heightIn: num(values.heightIn),
    neckIn: num(values.neckIn),
    waistIn: num(values.waistIn),
    hipIn: num(values.hipIn),
  };
}

export function computeBodyFat(values: BodyFatValues): BodyFatComputed {
  return { ...calculateBodyFat(toInput(values)), sex: values.sex };
}

/** Concise announcement — the percentage + its classification, never the scale. */
export function describeBodyFatResult(result: BodyFatComputed): string {
  return `Your estimated body-fat percentage is ${formatNumber(result.bodyFatPct, 1)} percent, classified as ${result.category}.`;
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
const readSex = (root: HTMLElement): Sex =>
  (root.querySelector<HTMLInputElement>('[name="sex"]:checked')?.value as Sex) ?? 'male';

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

export const bodyFatBinding: FormCalculatorBinding<BodyFatValues, BodyFatComputed> = {
  readValues(root) {
    const active = root.querySelector<HTMLElement>('[data-unit].is-active, [data-unit][aria-checked="true"]');
    const system = active?.dataset.unit === 'imperial' ? 'imperial' : 'metric';
    const sex = readSex(root);
    if (system === 'metric') {
      return {
        sex,
        system: 'metric',
        heightCm: input(root, 'heightCm')?.value ?? '',
        neckCm: input(root, 'neckCm')?.value ?? '',
        waistCm: input(root, 'waistCm')?.value ?? '',
        hipCm: input(root, 'hipCm')?.value ?? '',
      };
    }
    return {
      sex,
      system: 'imperial',
      heightIn: input(root, 'heightIn')?.value ?? '',
      neckIn: input(root, 'neckIn')?.value ?? '',
      waistIn: input(root, 'waistIn')?.value ?? '',
      hipIn: input(root, 'hipIn')?.value ?? '',
    };
  },

  validate: validateBodyFatValues,

  compute: computeBodyFat,

  resultValue(result) {
    // Gate: the reviewed formula returns NaN out of domain, and can return a
    // non-positive (finite) percentage for near-degenerate inputs — both are
    // invalid, so surface the invalid state rather than a nonsensical figure.
    return result.bodyFatPct > 0 ? result.bodyFatPct : NaN;
  },

  describeResult: describeBodyFatResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);

    // Primary: the dominant percentage.
    const pct = formatNumber(result.bodyFatPct, 1);
    const valueEl = q('[data-result-when~="valid"] [data-result-value]');
    const a11yEl = q('[data-result-when~="valid"] [data-result-value-a11y]');
    if (valueEl) valueEl.textContent = pct;
    if (a11yEl) a11yEl.textContent = accessibleResultName(pct, '%');

    // Classification — communicated as TEXT (never colour alone).
    const catEl = q('[data-bf-category]');
    if (catEl) catEl.textContent = result.category;
    const interp = q('[data-bf-interpretation]');
    if (interp) {
      interp.textContent = `In the ${result.category} range for ${
        result.sex === 'male' ? 'men' : 'women'
      } by the U.S. Navy method.`;
    }

    // Category scale: fill the sex-specific ranges, mark the visitor's category.
    const bands = CATEGORY_BANDS[result.sex];
    scope.querySelectorAll<HTMLElement>('[data-bf-band]').forEach((row, i) => {
      const band = bands[i];
      const rangeCell = row.querySelector<HTMLElement>('[data-bf-band-range]');
      if (band && rangeCell) rangeCell.textContent = band.range;
      if (band && band.category === result.category) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['heightCm', 'neckCm', 'waistCm', 'hipCm', 'heightIn', 'neckIn', 'waistIn', 'hipIn']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
    const male = root.querySelector<HTMLInputElement>('[name="sex"][value="male"]');
    const female = root.querySelector<HTMLInputElement>('[name="sex"][value="female"]');
    if (male) male.checked = true;
    if (female) female.checked = false;
    // Restore the conditional field set for the default sex (male → hip hidden).
    root.querySelectorAll<HTMLElement>('[data-bf-hip]').forEach((el) => {
      el.hidden = true;
    });
  },

  convertValues(root, fromUnit, toUnit) {
    const convert = (fromName: string, toName: string, fn: (n: number) => number) => {
      const from = input(root, fromName);
      const to = input(root, toName);
      if (!to) return;
      const value = numOrNull(from?.value);
      to.value = value === null ? '' : String(round1(fn(value))); // empty stays empty — no fabrication
    };
    const pairs: Array<[string, string]> = [
      ['heightCm', 'heightIn'],
      ['neckCm', 'neckIn'],
      ['waistCm', 'waistIn'],
      ['hipCm', 'hipIn'],
    ];
    if (fromUnit === 'metric' && toUnit === 'imperial') {
      for (const [cm, inch] of pairs) convert(cm, inch, centimetresToTotalInches);
    } else if (fromUnit === 'imperial' && toUnit === 'metric') {
      for (const [cm, inch] of pairs) convert(inch, cm, totalInchesToCentimetres);
    }
  },
};

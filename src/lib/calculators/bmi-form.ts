/**
 * BMI form binding (R2) — the standard-form binding for the BMI calculator.
 *
 * The pure parts (`validateBmiValues`, `metricToImperial`, `imperialToMetric`,
 * `describeBmiResult`) are unit-tested directly; the DOM parts (`readValues`,
 * `renderResult`, `resetValues`, `convertValues`) are exercised end-to-end.
 * All numeric computation delegates to the reviewed pure `calculateBmi`.
 */
import { calculateBmi, type BmiInput, type BmiResult, type BmiSeverity } from './bmi';
import { formatNumber } from '@lib/format';
import { accessibleResultName, accessibleUnit } from '@lib/result/state';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;
const BMI_UNIT = 'kg/m²';

/** Raw string values as read from the form (empty ≠ zero ≠ invalid). */
export type BmiValues =
  | { system: 'metric'; heightCm: string; weightKg: string }
  | { system: 'imperial'; heightFt: string; heightIn: string; weightLb: string };

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

/**
 * Validate the imperial height pair into a single field message (both parts
 * share one `data-field="height"` slot). Feet: optional/zero valid, else a
 * finite non-negative integer. Inches: optional/zero valid, else finite and
 * 0 ≤ inches < 12 — 12+ is an error, NOT silently normalized. Total must be > 0.
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
 * Validate BMI form values. Returns field-keyed messages so the runtime can
 * bind aria-invalid + error text. Field keys match the markup's field names /
 * `data-field`: metric → `heightCm`, `weightKg`; imperial → `height`, `weightLb`.
 * No restrictive medical range is imposed — any positive height/weight is valid.
 */
export function validateBmiValues(values: BmiValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

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

function toBmiInput(values: BmiValues): BmiInput {
  if (values.system === 'metric') {
    return { system: 'metric', heightCm: Number(values.heightCm), weightKg: Number(values.weightKg) };
  }
  return {
    system: 'imperial',
    heightFt: Number(values.heightFt || 0),
    heightIn: Number(values.heightIn || 0),
    weightLb: Number(values.weightLb),
  };
}

const SEVERITY_PHRASE: Record<BmiSeverity, string> = {
  low: 'Below the healthy range for your height.',
  normal: 'A healthy weight for your height.',
  high: 'Above the healthy range for your height.',
  danger: 'Well above the healthy range for your height.',
};

export function severityPhrase(severity: BmiSeverity): string {
  return SEVERITY_PHRASE[severity];
}

/** Accessible one-line announcement, e.g.
 *  "Your BMI is 22.4 kilograms per square metre, classified as normal weight." */
export function describeBmiResult(result: BmiResult): string {
  const value = formatNumber(result.bmi, 1);
  return `Your BMI is ${value} ${accessibleUnit(BMI_UNIT)}, classified as ${result.category.toLowerCase()}.`;
}

/* ------------------------------------------------------------------ */
/* Unit conversion (pure)                                              */
/* ------------------------------------------------------------------ */

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface MetricNumbers {
  heightCm: number | null;
  weightKg: number | null;
}
export interface ImperialNumbers {
  heightFt: number | null;
  heightIn: number | null;
  weightLb: number | null;
}

/** Convert metric numbers to imperial. Empty (null) or non-positive values stay
 *  null so the runtime never fabricates a default from an empty field. */
export function metricToImperial(m: MetricNumbers): ImperialNumbers {
  const out: ImperialNumbers = { heightFt: null, heightIn: null, weightLb: null };
  if (m.heightCm !== null && m.heightCm > 0) {
    const totalIn = Math.round(m.heightCm / CM_PER_IN);
    out.heightFt = Math.floor(totalIn / 12);
    out.heightIn = totalIn % 12;
  }
  if (m.weightKg !== null && m.weightKg > 0) out.weightLb = round1(m.weightKg * LB_PER_KG);
  return out;
}

/** Convert imperial numbers to metric. A height with both parts empty stays
 *  null; weight that is empty or non-positive stays null. */
export function imperialToMetric(i: ImperialNumbers): MetricNumbers {
  const out: MetricNumbers = { heightCm: null, weightKg: null };
  if (i.heightFt !== null || i.heightIn !== null) {
    const total = (i.heightFt ?? 0) * 12 + (i.heightIn ?? 0);
    if (total > 0) out.heightCm = round1(total * CM_PER_IN);
  }
  if (i.weightLb !== null && i.weightLb > 0) out.weightKg = round1(i.weightLb / LB_PER_KG);
  return out;
}

/** BMI position (0–100%) on the 15–40 scale used by the visual marker. */
export function markerPosition(bmi: number): number {
  return Math.max(0, Math.min(100, ((bmi - 15) / (40 - 15)) * 100));
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                          */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`);

const numOrNull = (raw: string | undefined): number | null => {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const toField = (n: number | null): string => (n === null ? '' : String(n));

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

export const bmiBinding: FormCalculatorBinding<BmiValues, BmiResult> = {
  readValues(root) {
    const active = root.querySelector<HTMLElement>('[data-unit].is-active, [data-unit][aria-checked="true"]');
    const system = active?.dataset.unit === 'imperial' ? 'imperial' : 'metric';
    if (system === 'metric') {
      return {
        system: 'metric',
        heightCm: input(root, 'heightCm')?.value ?? '',
        weightKg: input(root, 'weightKg')?.value ?? '',
      };
    }
    return {
      system: 'imperial',
      heightFt: input(root, 'heightFt')?.value ?? '',
      heightIn: input(root, 'heightIn')?.value ?? '',
      weightLb: input(root, 'weightLb')?.value ?? '',
    };
  },

  validate: validateBmiValues,

  compute(values) {
    return calculateBmi(toBmiInput(values));
  },

  resultValue(result) {
    return result.bmi;
  },

  describeResult: describeBmiResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const valueEl = q('[data-result-when~="valid"] [data-result-value]');
    const a11yEl = q('[data-result-when~="valid"] [data-result-value-a11y]');
    const categoryEl = q('[data-bmi-category]');
    const phraseEl = q('[data-bmi-phrase]');
    const rangeEl = q('[data-bmi-range]');
    const marker = q('[data-bmi-marker]');
    const validRegion = q('[data-result-when~="valid"]');

    const bmiText = formatNumber(result.bmi, 1);
    if (valueEl) valueEl.textContent = bmiText;
    if (a11yEl) a11yEl.textContent = accessibleResultName(bmiText, BMI_UNIT);
    if (categoryEl) categoryEl.textContent = result.category;
    if (phraseEl) phraseEl.textContent = severityPhrase(result.severity);
    if (rangeEl) {
      rangeEl.textContent = `${formatNumber(result.healthyMin, 1)}–${formatNumber(
        result.healthyMax,
        1,
      )} ${result.unitLabel}`;
    }
    if (marker) marker.style.left = `${markerPosition(result.bmi)}%`;
    // Severity drives the marker/category colour; the category NAME (text above)
    // carries the classification so it never relies on colour alone.
    if (validRegion) validRegion.dataset.severity = result.severity;
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['heightCm', 'weightKg', 'heightFt', 'heightIn', 'weightLb']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
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

/**
 * Ideal-weight form binding (R7C-1) — standard-form binding for the ideal-weight
 * calculator, the second calculator in the standard-form wave.
 *
 * The runtime (@lib/result/form-runtime) is used UNCHANGED. This binding owns the
 * ideal-weight specifics: reading a sex selector + a height-only input, validating
 * height, Metric/Imperial conversion (height only — there is no weight input), and
 * rendering a DEFENSIBLE PRIMARY summary (the healthy-BMI weight range) plus a
 * SECONDARY comparison of the four classic formula estimates. It invents no
 * average and makes no single named formula authoritative — the WHO healthy-BMI
 * range is the primary (the existing implementation + copy already frame it as the
 * target); Robinson / Miller / Devine / Hamwi are shown as peer reference points.
 *
 * All computation delegates to the reviewed pure `calculateIdealWeight`
 * (formulas preserved). Conversion + imperial-height classification reuse the
 * shared `@lib/health/body-measurements` primitives; field-error MESSAGES stay
 * here per the R7B.1 policy.
 */
import { calculateIdealWeight, type IdealWeightResult, type Sex } from './ideal-weight';
import {
  round1,
  centimetresToTotalInches,
  totalInchesToCentimetres,
  totalInchesToFeetAndInches,
  classifyImperialHeight,
} from '@lib/health/body-measurements';
import { formatNumber } from '@lib/format';
import { accessibleUnit } from '@lib/result/state';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ResultDescriptionContext,
  ValidationResult,
} from '@lib/result/form-runtime';

export type IdealWeightValues =
  | { sex: Sex; system: 'metric'; heightCm: string }
  | { sex: Sex; system: 'imperial'; heightFt: string; heightIn: string };

/* ---- parsing + validation (pure) ---------------------------------------- */

type PositiveParse = 'empty' | 'nonpositive' | number;
function parsePositive(raw: string): PositiveParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'nonpositive';
  return n;
}

function validateImperialHeight(ftRaw: string, inRaw: string): string | null {
  switch (classifyImperialHeight(ftRaw, inRaw)) {
    case 'ok':
      return null;
    case 'empty':
      return 'Enter your height.';
    case 'inches-out-of-range':
      return 'Enter inches from 0 to 11.';
    case 'feet-not-integer':
      return 'Enter feet as a whole number.';
    case 'nonpositive':
      return 'Enter a height greater than zero.';
  }
}

export function validateIdealWeightValues(values: IdealWeightValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  if (values.system === 'metric') {
    const h = parsePositive(values.heightCm);
    if (h === 'empty') fieldErrors.heightCm = 'Enter your height.';
    else if (h === 'nonpositive') fieldErrors.heightCm = 'Enter a height greater than zero.';
  } else {
    const heightError = validateImperialHeight(values.heightFt, values.heightIn);
    if (heightError) fieldErrors.height = heightError;
  }
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ---- computation + description (pure) ----------------------------------- */

function toInput(values: IdealWeightValues) {
  if (values.system === 'metric') {
    return { sex: values.sex, system: 'metric' as const, heightCm: Number(values.heightCm) };
  }
  return {
    sex: values.sex,
    system: 'imperial' as const,
    heightFt: Number(values.heightFt || 0),
    heightIn: Number(values.heightIn || 0),
  };
}

/** The binding's computed result echoes the selected sex so the announcement can
 *  name it when only the (sex-dependent) formula estimates change. The healthy-BMI
 *  RANGE is height-only, so a sex change leaves it identical — the reason the
 *  announcement must distinguish "range changed" from "formula estimates updated". */
export interface IdealWeightComputed extends IdealWeightResult {
  sex: Sex;
}

export function computeIdealWeight(values: IdealWeightValues): IdealWeightComputed {
  return { ...calculateIdealWeight(toInput(values)), sex: values.sex };
}

/** The primary healthy-weight RANGE, formatted for speech (never the formulas). */
function rangeSpeech(result: IdealWeightResult): string {
  return `${formatNumber(result.bmiMin, 1)} to ${formatNumber(result.bmiMax, 1)} ${accessibleUnit(result.unit)}`;
}

/**
 * Concise live announcement — the primary RANGE only, never the formula table.
 *
 * Two shapes, chosen from the previously-announced range:
 *  - first announcement, or the displayed range CHANGED → the plain range
 *    ("Your healthy-weight range is approximately X to Y kilograms.");
 *  - the displayed range is UNCHANGED but a recompute happened (e.g. the visitor
 *    changed sex, which moves the formula estimates but not the BMI range) → a
 *    distinct message noting the estimates were updated, so a screen reader is
 *    actually notified even though the headline number is identical
 *    ("Healthy-weight range: X to Y kilograms. Formula estimates updated for Z.").
 *
 * Without the second shape a sex change would produce byte-identical range text,
 * which the runtime's announcer dedupes — leaving the visible formula update
 * silent to assistive tech. The formula rows themselves are never spoken.
 */
export function idealWeightAnnouncement(
  result: IdealWeightComputed,
  previous: { bmiMin: number; bmiMax: number } | null,
): string {
  const range = rangeSpeech(result);
  const rangeUnchanged =
    previous !== null &&
    formatNumber(previous.bmiMin, 1) === formatNumber(result.bmiMin, 1) &&
    formatNumber(previous.bmiMax, 1) === formatNumber(result.bmiMax, 1);
  if (rangeUnchanged) {
    return `Healthy-weight range: ${range}. Formula estimates updated for ${result.sex}.`;
  }
  return `Your healthy-weight range is approximately ${range}.`;
}

/* ---- height-only conversion (pure) -------------------------------------- */

/** Metric cm → imperial feet/inches (null if empty/non-positive). */
export function metricHeightToImperial(heightCm: number | null): { heightFt: number | null; heightIn: number | null } {
  if (heightCm === null || heightCm <= 0) return { heightFt: null, heightIn: null };
  const { feet, inches } = totalInchesToFeetAndInches(centimetresToTotalInches(heightCm));
  return { heightFt: feet, heightIn: inches };
}
/** Imperial feet/inches → metric cm (null if both empty / non-positive total). */
export function imperialHeightToMetric(heightFt: number | null, heightIn: number | null): number | null {
  if (heightFt === null && heightIn === null) return null;
  const total = (heightFt ?? 0) * 12 + (heightIn ?? 0);
  return total > 0 ? round1(totalInchesToCentimetres(total)) : null;
}

/* ---- DOM helpers -------------------------------------------------------- */

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

const fmtWeight = (v: number, unit: string): string => (Number.isFinite(v) ? `${formatNumber(v, 1)} ${unit}` : '—');

/* ---- the binding -------------------------------------------------------- */

export const idealWeightBinding: FormCalculatorBinding<IdealWeightValues, IdealWeightComputed> = {
  readValues(root) {
    const active = root.querySelector<HTMLElement>('[data-unit].is-active, [data-unit][aria-checked="true"]');
    const system = active?.dataset.unit === 'imperial' ? 'imperial' : 'metric';
    const sex = readSex(root);
    if (system === 'metric') {
      return { sex, system: 'metric', heightCm: input(root, 'heightCm')?.value ?? '' };
    }
    return {
      sex,
      system: 'imperial',
      heightFt: input(root, 'heightFt')?.value ?? '',
      heightIn: input(root, 'heightIn')?.value ?? '',
    };
  },

  validate: validateIdealWeightValues,

  compute: computeIdealWeight,

  resultValue(result) {
    return result.bmiMin; // finiteness sentinel — finite whenever height is valid
  },

  describeResult(result, context: ResultDescriptionContext<IdealWeightComputed>) {
    const previous = context.previousResult
      ? { bmiMin: context.previousResult.bmiMin, bmiMax: context.previousResult.bmiMax }
      : null;
    return idealWeightAnnouncement(result, previous);
  },

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
    const unit = result.unit;

    // Primary: the healthy weight range (dominant).
    const minEl = q('[data-iw-bmimin]');
    const maxEl = q('[data-iw-bmimax]');
    const unitEl = q('[data-iw-unit]');
    const rangeA11y = q('[data-iw-range-a11y]');
    if (minEl) minEl.textContent = formatNumber(result.bmiMin, 1);
    if (maxEl) maxEl.textContent = formatNumber(result.bmiMax, 1);
    if (unitEl) unitEl.textContent = unit;
    if (rangeA11y) {
      rangeA11y.textContent = `${formatNumber(result.bmiMin, 1)} to ${formatNumber(result.bmiMax, 1)} ${accessibleUnit(unit)}`;
    }

    // Secondary: the four formula estimates.
    const set = (sel: string, v: number) => {
      const el = q(sel);
      if (el) el.textContent = fmtWeight(v, unit);
    };
    set('[data-iw-robinson]', result.robinson);
    set('[data-iw-miller]', result.miller);
    set('[data-iw-devine]', result.devine);
    set('[data-iw-hamwi]', result.hamwi);
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['heightCm', 'heightFt', 'heightIn']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
    const male = root.querySelector<HTMLInputElement>('[name="sex"][value="male"]');
    const female = root.querySelector<HTMLInputElement>('[name="sex"][value="female"]');
    if (male) male.checked = true;
    if (female) female.checked = false;
    // The runtime's per-instance tracker forgets the previous result on reset, so the
    // next calculation announces as a first result — no module state to clear here.
  },

  convertValues(root, fromUnit, toUnit) {
    if (fromUnit === 'metric' && toUnit === 'imperial') {
      const imp = metricHeightToImperial(numOrNull(input(root, 'heightCm')?.value));
      const ft = input(root, 'heightFt');
      const inch = input(root, 'heightIn');
      if (ft) ft.value = toField(imp.heightFt);
      if (inch) inch.value = toField(imp.heightIn);
    } else if (fromUnit === 'imperial' && toUnit === 'metric') {
      const cm = imperialHeightToMetric(numOrNull(input(root, 'heightFt')?.value), numOrNull(input(root, 'heightIn')?.value));
      const cmEl = input(root, 'heightCm');
      if (cmEl) cmEl.value = toField(cm);
    }
  },
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
export const IDEAL_WEIGHT_EXAMPLE_VALUES: IdealWeightValues = { sex: 'male', system: 'metric', heightCm: '175' };

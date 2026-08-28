/**
 * Target heart-rate form binding — the reference's fields, settings and result table, on the
 * UNCHANGED standard-form runtime.
 *
 * The reference asks for very little: how to get a maximum heart rate (estimate it from age,
 * or enter a measured one), and an optional resting heart rate. Two choices live behind
 * "+ Settings" — which age equation to use, and which scale describes intensity.
 *
 * Everything is computed by the reviewed pure `target-heart-rate.ts`. Age parsing uses the
 * shared `classifyAge`; field-error MESSAGES stay here per the R7B.1 policy.
 *
 * The resting heart rate is genuinely optional, and leaving it out is not a lesser result —
 * it changes what the percentages are OF, from heart-rate reserve to maximum heart rate. The
 * panel says which it used rather than leaving the reader to work it out.
 */
import {
  calculateTargetHeartRate,
  MHR_FORMULAS,
  INTENSITY_SCALES,
  INTENSITY_BANDS,
  AEROBIC_LOW_PCT,
  AEROBIC_HIGH_PCT,
  AGE_MIN,
  AGE_MAX,
  type IntensityScale,
  type MhrFormula,
  type TargetHeartRateResult,
} from './target-heart-rate';
import { classifyAge } from '@lib/health/body-measurements';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

export {
  MHR_FORMULAS,
  INTENSITY_SCALES,
  INTENSITY_BANDS,
  AEROBIC_LOW_PCT,
  AEROBIC_HIGH_PCT,
  AGE_MIN,
  AGE_MAX,
};
export type { IntensityScale, MhrFormula };

/** How the maximum heart rate is arrived at. */
export type MaxHrMode = 'age' | 'test';

export const MAX_HR_MODES: { value: MaxHrMode; label: string }[] = [
  { value: 'age', label: 'Estimate from age' },
  { value: 'test', label: 'Test result' },
];

/** A plausible measured maximum. Outside this it is a typo, not a heart. */
export const MAX_HR_MIN = 60;
export const MAX_HR_MAX = 250;
/** A plausible resting rate. */
export const RESTING_MIN = 20;
export const RESTING_MAX = 200;

export interface TargetHeartRateValues {
  mode: MaxHrMode;
  age: string;
  measuredMaxHr: string;
  restingHr: string;
  formula: MhrFormula;
  scale: IntensityScale;
}

export const MSG = {
  ageMissing: 'Enter your age.',
  ageWhole: 'Enter an age in whole years.',
  ageRange: `Enter an age from ${AGE_MIN} to ${AGE_MAX}.`,
  maxMissing: 'Enter the maximum heart rate your test measured.',
  maxRange: `Enter a maximum heart rate from ${MAX_HR_MIN} to ${MAX_HR_MAX} bpm.`,
  restingRange: `Enter a resting heart rate from ${RESTING_MIN} to ${RESTING_MAX} bpm.`,
  restingTooHigh: 'Your resting heart rate must be below your maximum.',
} as const;

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

export function ageError(raw: string): string | null {
  switch (classifyAge(raw, AGE_MIN, AGE_MAX)) {
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

export function measuredMaxError(raw: string): string | null {
  const t = raw.trim();
  if (t === '') return MSG.maxMissing;
  const n = Number(t);
  if (!Number.isFinite(n) || n < MAX_HR_MIN || n > MAX_HR_MAX) return MSG.maxRange;
  return null;
}

/** Optional — but if it is there at all, it has to be a heart rate. */
export function restingError(raw: string): string | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < RESTING_MIN || n > RESTING_MAX) return MSG.restingRange;
  return null;
}

export function validateTargetHeartRateValues(values: TargetHeartRateValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (values.mode === 'test') {
    const max = measuredMaxError(values.measuredMaxHr);
    if (max) fieldErrors.measuredMaxHr = max;
  } else {
    const age = ageError(values.age);
    if (age) fieldErrors.age = age;
  }

  const resting = restingError(values.restingHr);
  if (resting) fieldErrors.restingHr = resting;

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation (pure)                                                  */
/* ------------------------------------------------------------------ */

export type TargetHeartRateComputed = TargetHeartRateResult;

const numOr = (raw: string): number | undefined => {
  const t = raw.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

export function computeTargetHeartRate(values: TargetHeartRateValues): TargetHeartRateComputed {
  return calculateTargetHeartRate({
    age: values.mode === 'age' ? numOr(values.age) : undefined,
    measuredMaxHr: values.mode === 'test' ? numOr(values.measuredMaxHr) : undefined,
    restingHr: numOr(values.restingHr),
    formula: values.formula,
    scale: values.scale,
  });
}

/**
 * The finiteness sentinel the runtime gates the whole result on: finite only when the
 * maximum, the headline span AND all five zones reconcile.
 */
export function completeTargetHeartRateValue(result: TargetHeartRateComputed): number {
  if (!Number.isFinite(result.maxHr) || result.maxHr <= 0) return Number.NaN;
  if (!Number.isFinite(result.aerobicLow) || !Number.isFinite(result.aerobicHigh)) return Number.NaN;
  if (result.zones.length !== INTENSITY_BANDS.length) return Number.NaN;
  for (const z of result.zones) {
    if (!Number.isFinite(z.low) || !Number.isFinite(z.high) || z.high < z.low) return Number.NaN;
  }
  return result.maxHr;
}

/** What the percentages are of — the sentence changes with the answer, never silently. */
export function basisPhrase(result: TargetHeartRateComputed): string {
  return result.usesReserve ? 'heart rate reserve' : 'maximum heart rate';
}

/**
 * The reference's headline sentence, worded for the basis actually used.
 *
 * Kept whole and tested as a fidelity guarantee, but NOT rendered under a panel whose
 * dominant figure already says "130 – 172 bpm" — `basisLine` carries the part that number
 * does not, and the two together say everything this sentence does.
 */
export function headline(result: TargetHeartRateComputed): string {
  return `Target heart rate during aerobic exercise: ${result.aerobicLow} to ${result.aerobicHigh} bpm (${AEROBIC_LOW_PCT} - ${AEROBIC_HIGH_PCT}% of ${basisPhrase(result)}).`;
}

/** What the dominant figure is a percentage OF, which the figure itself cannot say. */
export function basisLine(result: TargetHeartRateComputed): string {
  const of = `${AEROBIC_LOW_PCT} - ${AEROBIC_HIGH_PCT}% of your ${basisPhrase(result)}`;
  return result.usesReserve
    ? `${of} — the gap between your maximum of ${result.maxHr} bpm and your resting rate.`
    : `${of} of ${result.maxHr} bpm. Add a resting heart rate for the more personal Karvonen figure.`;
}

/** Concise accessible announcement — the aerobic span only, never the whole table. */
export function describeTargetHeartRateResult(result: TargetHeartRateComputed): string {
  return `Your target heart rate for aerobic exercise is ${result.aerobicLow} to ${result.aerobicHigh} beats per minute.`;
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);
const readValue = (root: HTMLElement, name: string) => input(root, name)?.value ?? '';
const readChecked = (root: HTMLElement, name: string, fallback: string) =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]:checked`)?.value ?? fallback;

const VALID_MODES = new Set<string>(MAX_HR_MODES.map((m) => m.value));
const VALID_FORMULAS = new Set<string>(MHR_FORMULAS.map((f) => f.value));
const VALID_SCALES = new Set<string>(INTENSITY_SCALES.map((s) => s.value));

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

export const targetHeartRateBinding: FormCalculatorBinding<TargetHeartRateValues, TargetHeartRateComputed> = {
  readValues(root) {
    const mode = readChecked(root, 'mode', 'age');
    const formula = readChecked(root, 'formula', 'haskell-fox');
    const scale = readChecked(root, 'scale', 'karvonen');
    return {
      mode: (VALID_MODES.has(mode) ? mode : 'age') as MaxHrMode,
      age: readValue(root, 'age'),
      measuredMaxHr: readValue(root, 'measuredMaxHr'),
      restingHr: readValue(root, 'restingHr'),
      formula: (VALID_FORMULAS.has(formula) ? formula : 'haskell-fox') as MhrFormula,
      scale: (VALID_SCALES.has(scale) ? scale : 'karvonen') as IntensityScale,
    };
  },

  validate: validateTargetHeartRateValues,

  compute: computeTargetHeartRate,

  resultValue: completeTargetHeartRateValue,

  describeResult: describeTargetHeartRateResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const set = (sel: string, text: string) => {
      const el = scope.querySelector<HTMLElement>(sel);
      if (el) el.textContent = text;
    };

    set('[data-thr-headline]', basisLine(result));
    set('[data-thr-low]', String(result.aerobicLow));
    set('[data-thr-high]', String(result.aerobicHigh));
    set('[data-thr-a11y]', `${result.aerobicLow} to ${result.aerobicHigh} beats per minute`);
    set('[data-thr-max]', String(result.maxHr));
    set('[data-thr-basis]', basisPhrase(result));

    // The column head names the scale in use, so a Borg column is never read as a percentage.
    const scaleMeta = INTENSITY_SCALES.find((s) => s.value === result.scale) ?? INTENSITY_SCALES[0];
    set('[data-thr-column]', scaleMeta.column);

    // The reserve line has nothing to say without a resting heart rate.
    const reserveRow = scope.querySelector<HTMLElement>('[data-thr-reserve-row]');
    if (reserveRow) reserveRow.hidden = result.reserve === null;
    if (result.reserve !== null) set('[data-thr-reserve]', String(result.reserve));

    for (const z of result.zones) {
      const row = scope.querySelector<HTMLElement>(`[data-zone="${z.key}"]`);
      if (!row) continue;
      const scaleCell = row.querySelector<HTMLElement>('[data-zone-scale]');
      const bpmCell = row.querySelector<HTMLElement>('[data-zone-bpm]');
      if (scaleCell) scaleCell.textContent = z.scaleLabel;
      if (bpmCell) bpmCell.textContent = `${z.low} - ${z.high}`;
    }
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['age', 'measuredMaxHr', 'restingHr']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
    const check = (name: string, value: string) => {
      root.querySelectorAll<HTMLInputElement>(`[name="${name}"]`).forEach((el) => {
        el.checked = el.value === value;
      });
    };
    check('mode', 'age');
    check('formula', 'haskell-fox');
    check('scale', 'karvonen');
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's fields stay EMPTY)          */
/* ------------------------------------------------------------------ */

/**
 * Example inputs for the labelled worked result shown on first load — the reference's own
 * published case, at its default equation and scale. These are OURS, not the visitor's.
 */
export const TARGET_HEART_RATE_EXAMPLE_VALUES: TargetHeartRateValues = {
  mode: 'age',
  age: '30',
  measuredMaxHr: '',
  restingHr: '70',
  formula: 'haskell-fox',
  scale: 'karvonen',
};

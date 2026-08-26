/**
 * Target heart-rate form binding (R7C-2C — standard-form wave, calculator #10;
 * hardened in R7C-2C.1).
 *
 * The runtime (@lib/result/form-runtime) is used UNCHANGED. This binding owns the
 * heart-rate specifics: reading age + an optional resting heart rate, validating
 * them, calling the reviewed pure `calculateTargetHeartRate`, and rendering the
 * estimated maximum heart rate (dominant) with the five training zones as an
 * accessible comparison table plus a visible identification of the calculation
 * method.
 *
 * The pure `calculateTargetHeartRate` is UNCHANGED and its behaviour is frozen by
 * the characterization suite (target-heart-rate.test.ts). Everything this binding
 * adds is at the VALIDATION and PRESENTATION boundary:
 *   - age is required, whole, > 0 and < 220 (an age of 220+ estimates a maximum of
 *     0). No narrower arbitrary cap — the source documents none.
 *   - a resting heart rate is OPTIONAL only when empty; if entered it must be whole,
 *     > 0 and strictly below the estimated maximum (equal or above inverts the
 *     zones). An entered 0 is invalid and is NEVER treated the same as empty.
 * When a resting heart rate is supplied the pure function uses the Karvonen
 * (heart-rate reserve) method; otherwise a simple percentage of the maximum. The
 * result visibly names which method it used, and switching methods after the first
 * result speaks one concise method-change announcement (never the whole table).
 */
import {
  calculateTargetHeartRate,
  type TargetHeartRateResult,
  type HeartRateZone,
} from './target-heart-rate';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ResultDescriptionContext,
  ValidationResult,
} from '@lib/result/form-runtime';

/** An age of 220 or more estimates a maximum heart rate of 0 (220 − age). This is
 *  the only age bound the source semantics justify — there is no narrower cap. */
export const MAX_AGE_EXCLUSIVE = 220;

export type ThrMethod = 'karvonen' | 'simple';

/** The visible method identity shown in the result. */
export const METHOD_IDENTITY: Record<ThrMethod, string> = {
  karvonen: 'Karvonen heart-rate-reserve method',
  simple: 'Percentage of estimated maximum heart rate',
};

/** The concise announcement spoken when the method SWITCHES after a first result. */
export const METHOD_CHANGE_ANNOUNCEMENT: Record<ThrMethod, string> = {
  karvonen: 'Target heart-rate zones updated using the Karvonen heart-rate-reserve method.',
  simple: 'Target heart-rate zones updated using the percentage of maximum heart rate method.',
};

export interface TargetHeartRateValues {
  age: string;
  restingHr: string;
}

export interface TargetHeartRateComputed extends TargetHeartRateResult {
  /** True when a resting heart rate was supplied (Karvonen method). */
  usedKarvonen: boolean;
  /** The resting heart rate used, or null for the simple-percentage method. */
  restingHr: number | null;
}

export function methodOf(result: TargetHeartRateComputed): ThrMethod {
  return result.usedKarvonen ? 'karvonen' : 'simple';
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type WholeParse = 'empty' | 'not-whole' | 'nonpositive' | number;
/** Parse a whole number, distinguishing empty, non-whole and non-positive so each
 *  gets precise guidance — and so empty (allowed for resting HR) is never conflated
 *  with an entered 0 (invalid). */
function parseWhole(raw: string): WholeParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return 'not-whole';
  if (n <= 0) return 'nonpositive';
  return n;
}

/**
 * Validate the heart-rate inputs. Presence + wholeness + positivity + range are
 * explicit (never `Number(value) || 0`). Age is required (whole, > 0, < 220). The
 * resting heart rate is optional ONLY when empty; an entered value must be whole,
 * > 0 and strictly below the estimated maximum (equal or above would invert the
 * Karvonen zones). Empty and 0 are deliberately NOT equivalent.
 */
export function validateTargetHeartRateValues(values: TargetHeartRateValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const ageParse = parseWhole(values.age);
  let validAge: number | null = null;
  if (ageParse === 'empty') fieldErrors.age = 'Enter your age.';
  else if (ageParse === 'not-whole') fieldErrors.age = 'Enter your age in whole years.';
  else if (ageParse === 'nonpositive') fieldErrors.age = 'Enter an age greater than zero.';
  else if (ageParse >= MAX_AGE_EXCLUSIVE) fieldErrors.age = `Enter an age below ${MAX_AGE_EXCLUSIVE} years.`;
  else validAge = ageParse;

  const restingParse = parseWhole(values.restingHr);
  if (restingParse === 'not-whole') {
    fieldErrors.restingHr = 'Enter your resting heart rate in whole beats per minute, or leave it blank.';
  } else if (restingParse === 'nonpositive') {
    fieldErrors.restingHr = 'Enter a resting heart rate greater than zero, or leave it blank.';
  } else if (typeof restingParse === 'number' && validAge !== null) {
    // Cross-field: a resting heart rate at or above the maximum inverts the zones.
    const maxHr = MAX_AGE_EXCLUSIVE - validAge; // 220 − age
    if (restingParse >= maxHr) {
      fieldErrors.restingHr = `Enter a resting heart rate below your maximum of ${maxHr} bpm.`;
    }
  }
  // restingParse === 'empty' is valid — it selects the simple-percentage method.

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation + description (pure)                                    */
/* ------------------------------------------------------------------ */

export function computeTargetHeartRate(values: TargetHeartRateValues): TargetHeartRateComputed {
  const age = Number(values.age);
  const restingRaw = values.restingHr.trim();
  const resting = restingRaw === '' ? 0 : Number(restingRaw);
  const base = calculateTargetHeartRate(age, resting);
  return { ...base, usedKarvonen: resting > 0, restingHr: resting > 0 ? resting : null };
}

/** The standard announcement — max HR + the overall training span + the method. */
function standardAnnouncement(result: TargetHeartRateComputed): string {
  const low = result.zones[0]?.low ?? result.maxHr;
  const high = result.zones[result.zones.length - 1]?.high ?? result.maxHr;
  const method = result.usedKarvonen
    ? ', using the Karvonen method with your resting heart rate'
    : '';
  return `Your estimated maximum heart rate is ${result.maxHr} beats per minute. Training zones span ${low} to ${high} beats per minute${method}.`;
}

/**
 * Pure announcement. A method SWITCH after a first result (previousMethod set and
 * different) speaks the concise method-change line; an initial result or a
 * same-method update speaks the standard max-HR + span line. Never the full table.
 */
export function targetHeartRateAnnouncement(
  result: TargetHeartRateComputed,
  previousMethod: ThrMethod | null,
): string {
  const method = methodOf(result);
  if (previousMethod !== null && previousMethod !== method) return METHOD_CHANGE_ANNOUNCEMENT[method];
  return standardAnnouncement(result);
}

/** The interpretation line under the headline figure (context, not identity). */
function interpretation(result: TargetHeartRateComputed): string {
  return result.usedKarvonen
    ? `Personalised using your resting heart rate of ${result.restingHr} bpm.`
    : 'Add a resting heart rate for personalised zones (the Karvonen method).';
}

const formatRange = (z: HeartRateZone): string => `${z.low}–${z.high}`;

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const targetHeartRateBinding: FormCalculatorBinding<
  TargetHeartRateValues,
  TargetHeartRateComputed
> = {
  readValues(root) {
    return {
      age: input(root, 'age')?.value ?? '',
      restingHr: input(root, 'restingHr')?.value ?? '',
    };
  },

  validate: validateTargetHeartRateValues,

  compute: computeTargetHeartRate,

  /** The guarded primary magnitude — the estimated maximum heart rate. */
  resultValue(result) {
    return result.maxHr;
  },

  describeResult(result, context: ResultDescriptionContext<TargetHeartRateComputed>) {
    const previousMethod = context.previousResult ? methodOf(context.previousResult) : null;
    return targetHeartRateAnnouncement(result, previousMethod);
  },

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);

    // Primary: the estimated maximum heart rate (dominant).
    const maxText = String(result.maxHr);
    const valueEl = q('[data-result-when~="valid"] [data-result-value]');
    const a11yEl = q('[data-result-when~="valid"] [data-result-value-a11y]');
    if (valueEl) valueEl.textContent = maxText;
    if (a11yEl) a11yEl.textContent = `${maxText} beats per minute`;

    // Visible method identity (never describe a simple-percentage result as Karvonen).
    const methodIdEl = q('[data-thr-method-id]');
    if (methodIdEl) methodIdEl.textContent = METHOD_IDENTITY[methodOf(result)];

    // Interpretation (context).
    const methodEl = q('[data-thr-method]');
    if (methodEl) methodEl.textContent = interpretation(result);

    // Zone table: fill each row's bpm range in the pure module's order (index-keyed
    // so it can never mismatch a renamed zone).
    result.zones.forEach((zone, i) => {
      const rangeEl = scope.querySelector<HTMLElement>(`[data-thr-zone="${i}"] [data-thr-range]`);
      if (rangeEl) rangeEl.textContent = formatRange(zone);
    });
  },

  resetValues(root, _mode: ResetMode) {
    for (const name of ['age', 'restingHr']) {
      const el = input(root, name);
      if (el) el.value = '';
    }
  },
};

/** Zone identity (name + percentage band), age-invariant — for the static table
 *  skeleton. Derived from the reviewed pure function so it can never drift from the
 *  computed zones (the characterization suite pins these names + percentages). */
export const HEART_RATE_ZONES: ReadonlyArray<Pick<HeartRateZone, 'name' | 'lowPct' | 'highPct'>> =
  calculateTargetHeartRate(30).zones.map((z) => ({
    name: z.name,
    lowPct: z.lowPct,
    highPct: z.highPct,
  }));

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
export const TARGET_HEART_RATE_EXAMPLE_VALUES: TargetHeartRateValues = { age: '35', restingHr: '65' };

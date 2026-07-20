/**
 * Target heart-rate form binding (R7C-2C — standard-form wave, calculator #10).
 *
 * The runtime (@lib/result/form-runtime) is used UNCHANGED. This binding owns the
 * heart-rate specifics: reading age + an optional resting heart rate, validating
 * them, calling the reviewed pure `calculateTargetHeartRate`, and rendering the
 * estimated maximum heart rate (dominant) with the five training zones as an
 * accessible comparison table.
 *
 * The pure `calculateTargetHeartRate` is UNCHANGED and its behaviour is frozen by
 * the characterization suite (target-heart-rate.test.ts). Everything this binding
 * adds is at the VALIDATION boundary — it stops the two legacy input gaps from ever
 * reaching the formula:
 *   - a missing / non-whole / out-of-range age (the legacy island let an empty age
 *     become 0 → a misleading maxHr of 220);
 *   - a resting heart rate at or above the maximum (which inverts the zones), which
 *     the legacy island never guarded.
 * When a resting heart rate is supplied the pure function uses the Karvonen
 * (heart-rate reserve) method; otherwise a simple percentage of the maximum. This
 * binding fabricates no number — every bpm figure comes from the reviewed function.
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
  ValidationResult,
} from '@lib/result/form-runtime';

/** Sane physiological age bounds — matches the legacy input's min/max hints and
 *  keeps the estimated maximum heart rate (220 − age) positive and meaningful. */
export const AGE_MIN = 1;
export const AGE_MAX = 120;

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

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type WholeParse = 'empty' | 'invalid' | number;
/** Parse a whole, strictly-positive number; distinguish empty from invalid. */
function parseWholePositive(raw: string): WholeParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return 'invalid';
  return n;
}

/**
 * Validate the heart-rate inputs. Presence + wholeness + range are explicit (never
 * `Number(value) || 0`). Age is required; the resting heart rate is optional, but
 * when present it must be whole, positive and BELOW the estimated maximum so the
 * Karvonen reserve is positive and the zones stay correctly ordered.
 */
export function validateTargetHeartRateValues(values: TargetHeartRateValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const age = parseWholePositive(values.age);
  if (age === 'empty') fieldErrors.age = 'Enter your age.';
  else if (age === 'invalid') fieldErrors.age = 'Enter your age in whole years.';
  else if (age < AGE_MIN || age > AGE_MAX) fieldErrors.age = `Enter an age from ${AGE_MIN} to ${AGE_MAX} years.`;

  const resting = parseWholePositive(values.restingHr);
  if (resting === 'invalid') {
    fieldErrors.restingHr =
      'Enter your resting heart rate in whole beats per minute, or leave it blank.';
  }

  // Cross-field: a resting heart rate at or above the maximum inverts the zones.
  if (typeof age === 'number' && age >= AGE_MIN && age <= AGE_MAX && typeof resting === 'number') {
    const maxHr = 220 - age;
    if (resting >= maxHr) {
      fieldErrors.restingHr = `Enter a resting heart rate below your maximum of ${maxHr} bpm.`;
    }
  }

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

/** Concise announcement — the maximum plus the overall training span and method. */
export function describeTargetHeartRateResult(result: TargetHeartRateComputed): string {
  const low = result.zones[0]?.low ?? result.maxHr;
  const high = result.zones[result.zones.length - 1]?.high ?? result.maxHr;
  const method = result.usedKarvonen
    ? ', using the Karvonen method with your resting heart rate'
    : '';
  return `Your estimated maximum heart rate is ${result.maxHr} beats per minute. Training zones span ${low} to ${high} beats per minute${method}.`;
}

/** The interpretation line under the headline figure. */
function interpretation(result: TargetHeartRateComputed): string {
  return result.usedKarvonen
    ? `Personalised with the Karvonen method using your resting heart rate of ${result.restingHr} bpm.`
    : 'Each zone is a percentage of your maximum heart rate (220 − age). Add a resting heart rate for personalised zones.';
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

  describeResult: describeTargetHeartRateResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);

    // Primary: the estimated maximum heart rate (dominant).
    const maxText = String(result.maxHr);
    const valueEl = q('[data-result-when~="valid"] [data-result-value]');
    const a11yEl = q('[data-result-when~="valid"] [data-result-value-a11y]');
    if (valueEl) valueEl.textContent = maxText;
    if (a11yEl) a11yEl.textContent = `${maxText} beats per minute`;

    // Method interpretation.
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

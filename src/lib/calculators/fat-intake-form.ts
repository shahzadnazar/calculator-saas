/**
 * Fat-intake form binding (R7C-2D — standard-form wave, calculator #11).
 *
 * The runtime (@lib/result/form-runtime) is used UNCHANGED. This binding owns the
 * fat-intake specifics: reading a daily calorie target, validating it, calling the
 * reviewed pure `calculateFatIntake`, and rendering the estimated daily fat RANGE
 * (dominant) with the AMDR proportion breakdown (lower 20% / moderate 27.5% / upper
 * 35%) as a subordinate reference.
 *
 * The pure `calculateFatIntake` is UNCHANGED and its behaviour is frozen by the
 * characterization suite (fat-intake.test.ts). Everything this binding adds is at the
 * VALIDATION boundary: the reviewed formula returns a RANGE (never collapsed to one
 * average); this binding requires a calorie target > 0, and rejects a target so low
 * that the range would round to a non-positive number of grams — instead of the
 * legacy island's silent "0–0 g" from `Number(value) || 0`.
 */
import { calculateFatIntake, type FatIntakeResult } from './fat-intake';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** The AMDR proportion bands the reviewed function returns — for the subordinate
 *  breakdown skeleton + render. Labels match the existing island copy. */
export interface FatBand {
  key: string;
  label: string;
  field: keyof FatIntakeResult;
}
export const FAT_BANDS: readonly FatBand[] = [
  { key: 'min', label: 'Lower (20%)', field: 'minGrams' },
  { key: 'mod', label: 'Moderate (27.5%)', field: 'moderateGrams' },
  { key: 'max', label: 'Upper (35%)', field: 'maxGrams' },
] as const;

export interface FatIntakeValues {
  calories: string;
}

export interface FatIntakeComputed extends FatIntakeResult {
  /** The calorie target the range is based on (for the accurate breakdown copy). */
  calories: number;
}

const FAT_RANGE_TOO_LOW_MESSAGE =
  'This calorie target is too low to estimate a daily fat range. Enter your full daily calorie target.';

/** A usable fat range: finite, both bounds > 0, and correctly ordered. Since the
 *  reviewed function guarantees min ≤ moderate ≤ max ≥ 0, this reduces to a positive
 *  lower bound, but every bound is checked for defence in depth. */
export function isUsableFatRange(r: FatIntakeResult): boolean {
  return (
    Number.isFinite(r.minGrams) &&
    Number.isFinite(r.maxGrams) &&
    r.minGrams > 0 &&
    r.maxGrams > 0 &&
    r.minGrams <= r.maxGrams
  );
}

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type PositiveParse = 'empty' | 'nonpositive' | number;
/** Parse a strictly-positive finite number; distinguish empty from invalid. No
 *  whole-number or upper cap is imposed — the reviewed source documents none. */
function parsePositive(raw: string): PositiveParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return 'nonpositive';
  return n;
}

/**
 * Validate the calorie target. Presence + positivity are explicit (never
 * `Number(value) || 0`). After the target passes, a final sanity check rejects a
 * range that would render non-positive grams, in plain language and with no clamp.
 */
export function validateFatIntakeValues(values: FatIntakeValues): ValidationResult {
  const calories = parsePositive(values.calories);
  if (calories === 'empty') return { ok: false, fieldErrors: { calories: 'Enter your daily calorie target.' } };
  if (calories === 'nonpositive') {
    return { ok: false, fieldErrors: { calories: 'Enter a calorie target greater than zero.' } };
  }
  if (!isUsableFatRange(calculateFatIntake(calories))) {
    return { ok: false, formError: FAT_RANGE_TOO_LOW_MESSAGE };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Computation + description (pure)                                    */
/* ------------------------------------------------------------------ */

export function computeFatIntake(values: FatIntakeValues): FatIntakeComputed {
  const calories = Number(values.calories);
  return { ...calculateFatIntake(calories), calories };
}

/** Concise announcement — the primary RANGE only (never the breakdown). */
export function describeFatIntakeResult(result: FatIntakeComputed): string {
  return `Your estimated daily fat intake is ${result.minGrams} to ${result.maxGrams} grams per day.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const input = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`);

export const fatIntakeBinding: FormCalculatorBinding<FatIntakeValues, FatIntakeComputed> = {
  readValues(root) {
    return { calories: input(root, 'calories')?.value ?? '' };
  },

  validate: validateFatIntakeValues,

  compute: computeFatIntake,

  /** The guarded primary magnitude — the lower bound of the range (finite, > 0 when
   *  valid); NaN if the range is unusable, so the runtime never shows a bad result. */
  resultValue(result) {
    return isUsableFatRange(result) ? result.minGrams : NaN;
  },

  describeResult: describeFatIntakeResult,

  renderResult(result, context: FormRenderContext) {
    const scope = context.result;
    const q = (sel: string) => scope.querySelector<HTMLElement>(sel);

    // Primary: the dominant fat RANGE (never collapsed to one average).
    const range = `${result.minGrams}–${result.maxGrams}`;
    const valueEl = q('[data-result-when~="valid"] [data-result-value]');
    const a11yEl = q('[data-result-when~="valid"] [data-result-value-a11y]');
    if (valueEl) valueEl.textContent = range;
    if (a11yEl) a11yEl.textContent = `${result.minGrams} to ${result.maxGrams} grams per day`;

    // Interpretation: the accurate calorie basis + assumptions.
    const interp = q('[data-fi-interpretation]');
    if (interp) {
      interp.textContent = `Based on 20–35% of your ${result.calories.toLocaleString(
        'en-US',
      )} kcal target, with fat providing 9 kcal per gram.`;
    }

    // Subordinate breakdown: each AMDR proportion's grams.
    for (const band of FAT_BANDS) {
      const cell = scope.querySelector<HTMLElement>(`[data-fi-band="${band.key}"] [data-fi-band-value]`);
      if (cell) cell.textContent = `${result[band.field]} g`;
    }
  },

  resetValues(root, _mode: ResetMode) {
    const el = input(root, 'calories');
    if (el) el.value = '';
  },
};

/**
 * Random-number generator binding (R18B2 — random-data generator family, on the
 * UNCHANGED generator runtime, mirroring the Password Generator lane).
 *
 * Binds the frozen `randomIntegers` (crypto-strength, inclusive integer range, optional
 * unique) to the shared generator runtime (@lib/result/generator-runtime): settings →
 * an explicit Generate → a list of numbers, with NO output before Generate and no
 * live regeneration. The pure parts (validation, description, metadata) are unit-tested;
 * the DOM parts are exercised end-to-end.
 *
 * The pure `randomIntegers` is UNCHANGED and frozen by the characterization suite
 * (random-number.test.ts). Everything added here is at the VALIDATION / PRESENTATION
 * boundary: min & max are required finite INTEGERS (negatives / zero allowed); min must
 * not exceed max (rejected — the source would silently swap, so the visitor UI rejects
 * for clarity; min == max is a valid fixed value); count is a required integer in
 * [1, 1000] (the legacy public maximum). When unique is on and more numbers are
 * requested than the range holds, the frozen source's cap is PRESERVED (it returns as
 * many distinct values as exist — matching the page's own FAQ) and the shortfall is
 * surfaced as a note. Never `Number(value) || 0`, never `parseInt`. Generation is
 * nondeterministic in production; an injectable RNG seam (`generateRng`'s second
 * argument) keeps the binding deterministically testable without seeding production.
 */
import { randomIntegers, type RandomInt } from './random-number';
import type { GeneratorBinding, GeneratorRenderContext, ValidationResult } from '@lib/result/generator-runtime';

export const MIN_COUNT = 1;
export const MAX_COUNT = 1000; // the legacy public maximum (the count input's max attribute)
export const DEFAULT_MIN = 1;
export const DEFAULT_MAX = 100;
export const DEFAULT_COUNT = 5;

export interface RngSettings {
  min: string;
  max: string;
  count: string;
  unique: boolean;
}

export interface RngOutput {
  numbers: number[];
  min: number;
  max: number;
  requestedCount: number;
  unique: boolean;
  /** unique mode returned fewer distinct values than requested (range exhausted). */
  capped: boolean;
}

export const MSG = {
  minRequired: 'Enter a minimum.',
  minInvalid: 'Enter the minimum as a whole number.',
  maxRequired: 'Enter a maximum.',
  maxInvalid: 'Enter the maximum as a whole number.',
  rangeOrder: 'The minimum must be less than or equal to the maximum.',
  countRequired: 'Enter how many numbers to generate.',
  countInvalid: 'Enter how many as a whole number.',
  countRange: `Generate between ${MIN_COUNT} and ${MAX_COUNT} numbers.`,
} as const;

/* ------------------------------------------------------------------ */
/* Parsing + validation (pure)                                         */
/* ------------------------------------------------------------------ */

type IntParse = 'empty' | 'invalid' | number;
/** Parse a finite integer; empty is distinct from invalid. Negatives allowed. Never
 *  `Number(value) || 0`, never `parseInt` (which would accept "12abc"). */
function parseInteger(raw: string): IntParse {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return 'invalid';
  return n;
}

/**
 * Validate before generation. Min & max: required finite integers (negatives/zero ok).
 * Count: required integer in [MIN_COUNT, MAX_COUNT]. Cross-field: min must not exceed
 * max (rejected, not silently swapped). min == max is valid.
 */
export function validateRngSettings(s: RngSettings): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const min = parseInteger(s.min);
  if (min === 'empty') fieldErrors.min = MSG.minRequired;
  else if (min === 'invalid') fieldErrors.min = MSG.minInvalid;

  const max = parseInteger(s.max);
  if (max === 'empty') fieldErrors.max = MSG.maxRequired;
  else if (max === 'invalid') fieldErrors.max = MSG.maxInvalid;

  const count = parseInteger(s.count);
  if (count === 'empty') fieldErrors.count = MSG.countRequired;
  else if (count === 'invalid') fieldErrors.count = MSG.countInvalid;
  else if (count < MIN_COUNT || count > MAX_COUNT) fieldErrors.count = MSG.countRange;

  // Cross-field range order — only when both bounds are valid integers.
  if (typeof min === 'number' && typeof max === 'number' && min > max) {
    return { ok: false, fieldErrors, formError: MSG.rangeOrder };
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Generation + description (pure; generate wraps the frozen source)   */
/* ------------------------------------------------------------------ */

/**
 * Wrap the frozen `randomIntegers` unchanged. `rng` is undefined in production (the
 * source's default crypto RNG applies), and injectable in tests for determinism — the
 * production path is never seeded. `capped` is derived from the OUTPUT (unique returned
 * fewer than requested), never by re-deriving the range — the source owns the range math.
 */
export function generateRng(s: RngSettings, rng?: RandomInt): RngOutput {
  const min = Number(s.min);
  const max = Number(s.max);
  const requestedCount = Number(s.count);
  const numbers = randomIntegers({ min, max, count: requestedCount, unique: s.unique }, rng);
  return {
    numbers,
    min,
    max,
    requestedCount,
    unique: s.unique,
    capped: s.unique && numbers.length < requestedCount,
  };
}

/** Content is non-secret, so the count is announced (with correct singular grammar). */
export function describeRngOutput(output: RngOutput): string {
  const n = output.numbers.length;
  return `Generated ${n} random number${n === 1 ? '' : 's'}.`;
}

export function rngMeta(output: RngOutput): string {
  const n = output.numbers.length;
  const mode = output.unique ? 'no repeats' : 'repeats allowed';
  return `${n} number${n === 1 ? '' : 's'} from ${output.min} to ${output.max} · ${mode}`;
}

export function rngCappedNote(output: RngOutput): string {
  return `Only ${output.numbers.length} unique whole numbers exist between ${output.min} and ${output.max}, so ${output.numbers.length} were generated instead of ${output.requestedCount}.`;
}

/* ------------------------------------------------------------------ */
/* The binding                                                         */
/* ------------------------------------------------------------------ */

const formOf = (root: HTMLElement) => root.querySelector<HTMLFormElement>('[data-form]');
const control = (root: HTMLElement, name: string) =>
  formOf(root)?.elements.namedItem(name) as HTMLInputElement | null;

export const randomNumberBinding: GeneratorBinding<RngSettings, RngOutput> = {
  readSettings(root) {
    return {
      min: control(root, 'min')?.value ?? '',
      max: control(root, 'max')?.value ?? '',
      count: control(root, 'count')?.value ?? '',
      unique: control(root, 'unique')?.checked ?? false,
    };
  },

  validateSettings: validateRngSettings,

  generate: (settings) => generateRng(settings), // production: no injected RNG → crypto source

  renderOutput(output, ctx: GeneratorRenderContext) {
    const q = <T extends HTMLElement>(sel: string) => ctx.result.querySelector<T>(sel);

    const list = q('[data-rng-list]');
    if (list) {
      // DOM API, never innerHTML — the numbers are text nodes.
      list.replaceChildren(
        ...output.numbers.map((n) => {
          const span = document.createElement('span');
          span.className = 'rng-chip';
          span.textContent = String(n);
          return span;
        }),
      );
    }

    const meta = q('[data-rng-meta]');
    if (meta) meta.textContent = rngMeta(output);

    const capNote = q('[data-rng-capped]');
    if (capNote) {
      capNote.textContent = output.capped ? rngCappedNote(output) : '';
      capNote.hidden = !output.capped;
    }
  },

  describeOutput: describeRngOutput,

  resetSettings(root) {
    const set = (name: string, value: string) => {
      const c = control(root, name);
      if (c) c.value = value;
    };
    set('min', String(DEFAULT_MIN));
    set('max', String(DEFAULT_MAX));
    set('count', String(DEFAULT_COUNT));
    const uniq = control(root, 'unique');
    if (uniq) uniq.checked = false;
  },
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's controls keep their defaults)*/
/* ------------------------------------------------------------------ */

/**
 * Example settings for the labelled sample output shown on first load. The
 * sample numbers are generated in the browser from these settings and are
 * illustrative only — they never count as the visitor's own generation.
 */
export const RANDOM_NUMBER_EXAMPLE_SETTINGS: RngSettings = {
  min: '1',
  max: '100',
  count: '5',
  unique: true,
};

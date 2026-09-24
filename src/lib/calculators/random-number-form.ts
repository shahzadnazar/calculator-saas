/**
 * Random-number form layer — the two generators the reference puts on the page.
 *
 * The simple one takes a lower and an upper limit and returns one integer, of any size. The
 * comprehensive one adds a count, a choice of integers or decimals, and the number of decimal
 * places. They stay two separate generators with their own settings, button and output.
 *
 * Both run on the UNCHANGED generator runtime: an explicit Generate, and a settings change that
 * marks the shown output STALE — kept visible, Copy disabled — rather than silently regenerating.
 * Nothing generated is ever announced verbatim, stored, or sent anywhere; the draw happens in the
 * browser and the server never bakes a random value into the page.
 */
import {
  generateRandom,
  parseScaled,
  rangeSize,
  isDecimalText,
  LIMITS,
  type RandomBytes,
  type RandomDraw,
} from './random-number';
import type { GeneratorBinding, GeneratorRenderContext } from '@lib/result/generator-runtime';
import type { ValidationResult } from '@lib/result/form-runtime';

export const MSG = {
  required: 'Enter a value.',
  integerRequired: 'Enter a whole number.',
  numberRequired: 'Enter a number.',
  tooManyDigits: `Keep each limit under ${LIMITS.maxDigits.toLocaleString('en-US')} digits.`,
  countRange: `Generate between 1 and ${LIMITS.maxCount.toLocaleString('en-US')} numbers.`,
  precisionRange: `Enter between 0 and ${LIMITS.maxPrecision} digits.`,
  sameLimits: 'The limits are the same, so there is only one number to pick.',
  notEnoughValues: 'The range does not hold that many distinct numbers. Allow duplicates, or widen it.',
} as const;

const INTEGER = /^[+-]?\d+$/;
const digitsIn = (text: string): number => text.replace(/[^\d]/g, '').length;

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */

export interface RngSettings {
  lower: string;
  upper: string;
  /** '' on the simple generator, which always draws one. */
  count: string;
  /** 'integer' | 'decimal'; the simple generator is always integer. */
  type: string;
  precision: string;
  allowDuplicates: boolean;
  sort: boolean;
}

export interface RngOutput {
  draw: RandomDraw;
  /** The whole output as one block of text — what Copy puts on the clipboard. */
  text: string;
  count: number;
  decimal: boolean;
}

const field = (root: HTMLElement, name: string): string =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? '';
const checked = (root: HTMLElement, name: string): boolean =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked ?? false;

/** The simple generator: two limits, one integer, no other choices to make. */
export function readSimpleSettings(root: HTMLElement): RngSettings {
  return {
    lower: field(root, 'lower'),
    upper: field(root, 'upper'),
    count: '1',
    type: 'integer',
    precision: '0',
    allowDuplicates: true,
    sort: false,
  };
}

export function readFullSettings(root: HTMLElement): RngSettings {
  const type = root.querySelector<HTMLInputElement>('input[name="type"]:checked')?.value ?? 'integer';
  return {
    lower: field(root, 'lower'),
    upper: field(root, 'upper'),
    count: field(root, 'count'),
    type,
    precision: field(root, 'precision'),
    allowDuplicates: checked(root, 'allowDuplicates'),
    sort: checked(root, 'sort'),
  };
}

export const isDecimal = (settings: RngSettings): boolean => settings.type === 'decimal';

/** The decimal places to work in: none for an integer draw, the visitor's figure otherwise. */
export function precisionOf(settings: RngSettings): number {
  if (!isDecimal(settings)) return 0;
  const value = Number((settings.precision ?? '').trim());
  return Number.isInteger(value) && value >= 0 ? value : Number.NaN;
}

export function countOf(settings: RngSettings): number {
  const value = Number((settings.count ?? '').trim());
  return Number.isInteger(value) ? value : Number.NaN;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function validateLimits(settings: RngSettings, fieldErrors: Record<string, string>): void {
  const decimal = isDecimal(settings);
  for (const name of ['lower', 'upper'] as const) {
    const text = (settings[name] ?? '').trim();
    if (text === '') {
      fieldErrors[name] = MSG.required;
      continue;
    }
    const ok = decimal ? isDecimalText(text) : INTEGER.test(text);
    if (!ok) fieldErrors[name] = decimal ? MSG.numberRequired : MSG.integerRequired;
    else if (digitsIn(text) > LIMITS.maxDigits) fieldErrors[name] = MSG.tooManyDigits;
  }
}

export function validateSimple(settings: RngSettings): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  validateLimits(settings, fieldErrors);
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

export function validateFull(settings: RngSettings): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const precision = precisionOf(settings);
  if (isDecimal(settings)) {
    const text = (settings.precision ?? '').trim();
    if (text === '') fieldErrors.precision = MSG.required;
    else if (!Number.isInteger(precision) || precision < 0 || precision > LIMITS.maxPrecision) {
      fieldErrors.precision = MSG.precisionRange;
    }
  }

  const count = countOf(settings);
  const countText = (settings.count ?? '').trim();
  if (countText === '') fieldErrors.count = MSG.required;
  else if (!Number.isInteger(count) || count < 1 || count > LIMITS.maxCount) {
    fieldErrors.count = MSG.countRange;
  }

  validateLimits(settings, fieldErrors);
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };

  // Only once every field is sound can the range be judged against what is asked of it.
  if (!settings.allowDuplicates) {
    const size = rangeSize(toRequest(settings));
    if (size !== null && size < BigInt(count)) {
      return { ok: false, fieldErrors: { count: MSG.notEnoughValues } };
    }
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Generating                                                          */
/* ------------------------------------------------------------------ */

export function toRequest(settings: RngSettings) {
  const precision = precisionOf(settings);
  return {
    lower: settings.lower.trim(),
    upper: settings.upper.trim(),
    count: countOf(settings),
    precision: Number.isInteger(precision) ? precision : 0,
    allowDuplicates: settings.allowDuplicates,
    sort: settings.sort,
  };
}

export function generate(settings: RngSettings, bytes?: RandomBytes): RngOutput {
  const draw = generateRandom(toRequest(settings), bytes);
  return {
    draw,
    text: draw.values.join('\n'),
    count: draw.values.length,
    decimal: isDecimal(settings) && draw.precision > 0,
  };
}

/**
 * What the live region says.
 *
 * Never the numbers themselves: a screen reader reading out a fifty-digit decimal, or a hundred
 * lottery picks, is noise rather than information — and the runtime's contract is that generated
 * output is not announced.
 */
export function describeOutput(output: RngOutput): string {
  if (output.count === 0) return '';
  if (output.count === 1) return 'Number generated.';
  return `${output.count} numbers generated.`;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

export function renderOutput(output: RngOutput, context: GeneratorRenderContext): void {
  const scope = context.result;
  const target = scope.querySelector<HTMLTextAreaElement | HTMLInputElement>('[data-generator-output]');
  if (target) {
    target.value = output.text;
    // Grow to the content so a long draw is read rather than scrolled, up to a sensible cap.
    if (target instanceof HTMLTextAreaElement) {
      target.rows = Math.min(12, Math.max(1, output.count, Math.ceil(output.text.length / 46)));
    }
  }
  const note = scope.querySelector<HTMLElement>('[data-rng-count]');
  if (note) {
    note.textContent =
      output.count === 0
        ? ''
        : `${output.count} ${output.count === 1 ? 'number' : 'numbers'}${output.decimal ? `, ${output.draw.precision} decimal places` : ''}`;
  }
}

/* ------------------------------------------------------------------ */
/* The bindings                                                        */
/* ------------------------------------------------------------------ */

export const SIMPLE_DEFAULTS = { lower: '1', upper: '100' } as const;
export const FULL_DEFAULTS = {
  lower: '0.2',
  upper: '112.5',
  count: '1',
  type: 'decimal',
  precision: '50',
} as const;

/**
 * Settings for the labelled worked example each generator shows on load.
 *
 * These are OURS, not the visitor's. The runtime generates from them client-side and calls the
 * binding's own renderOutput, so the example reuses the real output markup and can never drift.
 * Nothing is baked into the server HTML — the example is drawn in the browser like any other.
 */
export const SIMPLE_EXAMPLE_SETTINGS: RngSettings = {
  lower: '1',
  upper: '100',
  count: '1',
  type: 'integer',
  precision: '0',
  allowDuplicates: true,
  sort: false,
};

export const FULL_EXAMPLE_SETTINGS: RngSettings = {
  lower: '0.2',
  upper: '112.5',
  count: '1',
  type: 'decimal',
  precision: '50',
  allowDuplicates: true,
  sort: false,
};

export const simpleRngBinding: GeneratorBinding<RngSettings, RngOutput> = {
  readSettings: readSimpleSettings,
  validateSettings: validateSimple,
  generate: (settings) => generate(settings),
  renderOutput,
  describeOutput,
  resetSettings(root) {
    for (const [name, value] of Object.entries(SIMPLE_DEFAULTS)) {
      const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (input) input.value = value;
    }
  },
};

export const fullRngBinding: GeneratorBinding<RngSettings, RngOutput> = {
  readSettings: readFullSettings,
  validateSettings: validateFull,
  generate: (settings) => generate(settings),
  renderOutput,
  describeOutput,
  resetSettings(root) {
    for (const [name, value] of Object.entries(FULL_DEFAULTS)) {
      if (name === 'type') continue;
      const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (input) input.value = value;
    }
    const type = root.querySelector<HTMLInputElement>(`input[name="type"][value="${FULL_DEFAULTS.type}"]`);
    if (type) type.checked = true;
    const duplicates = root.querySelector<HTMLInputElement>('[name="allowDuplicates"]');
    if (duplicates) duplicates.checked = true;
    const sort = root.querySelector<HTMLInputElement>('[name="sort"]');
    if (sort) sort.checked = false;
  },
};

export { LIMITS };

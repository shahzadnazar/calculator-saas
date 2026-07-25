/**
 * Password generator binding (R4) — binds the reviewed secure generator to the
 * shared generator runtime. The pure parts (validation, strength, safe
 * description) are unit tested; the DOM parts (readSettings/renderOutput/
 * resetSettings) are exercised end-to-end.
 *
 * Security: generation delegates to the existing `generatePassword`
 * (`crypto.getRandomValues`, one char per selected class, Fisher–Yates shuffle).
 * The password is placed only in the output control's value; `describeOutput`
 * returns a CONTENT-FREE message so the runtime never announces it.
 */
import {
  generatePassword,
  estimateEntropyBits,
  strengthLabel,
  type PasswordOptions,
} from './password-generator';
import type {
  GeneratorBinding,
  GeneratorRenderContext,
  ValidationResult,
} from '@lib/result/generator-runtime';

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 64;
export const DEFAULT_LENGTH = 16;

export type PasswordSettings = PasswordOptions;

export interface PasswordOutput {
  password: string;
  bits: number;
  strength: string;
  length: number;
  types: string[];
}

const CLASS_LABELS: Array<[keyof PasswordOptions, string]> = [
  ['upper', 'uppercase'],
  ['lower', 'lowercase'],
  ['digits', 'numbers'],
  ['symbols', 'symbols'],
];

export function selectedClassCount(s: PasswordSettings): number {
  return CLASS_LABELS.reduce((n, [key]) => n + (s[key] ? 1 : 0), 0);
}
export function selectedTypeLabels(s: PasswordSettings): string[] {
  return CLASS_LABELS.filter(([key]) => s[key]).map(([, label]) => label);
}

/* ------------------------------------------------------------------ */
/* Validation (pure)                                                   */
/* ------------------------------------------------------------------ */

/**
 * Validate before generation: at least one character type; a present, finite,
 * integer length within [MIN_LENGTH, MAX_LENGTH]; and a length long enough to
 * include every selected type (never silently violate the selection).
 */
export function validatePasswordSettings(s: PasswordSettings): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const classes = selectedClassCount(s);

  if (classes === 0) fieldErrors.charsets = 'Select at least one character type.';

  if (!Number.isFinite(s.length) || !Number.isInteger(s.length) || s.length < MIN_LENGTH || s.length > MAX_LENGTH) {
    fieldErrors.length = 'Enter a valid password length.';
  } else if (classes > 0 && s.length < classes) {
    fieldErrors.length = `Increase the length to at least ${classes} to include every selected character type.`;
  }

  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Description (pure, content-free)                                    */
/* ------------------------------------------------------------------ */

/** Deliberately content-free: the generated password is NEVER announced. */
export function describePasswordOutput(_output: PasswordOutput): string {
  return 'Password generated.';
}

export function passwordMeta(output: PasswordOutput): string {
  return `${output.length} characters · ${output.types.join(', ')} · about ${output.bits} bits of entropy`;
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                          */
/* ------------------------------------------------------------------ */

const formOf = (root: HTMLElement) => root.querySelector<HTMLFormElement>('[data-form]');
const control = (root: HTMLElement, name: string) =>
  formOf(root)?.elements.namedItem(name) as HTMLInputElement | null;

/* ------------------------------------------------------------------ */
/* Binding                                                             */
/* ------------------------------------------------------------------ */

export const passwordBinding: GeneratorBinding<PasswordSettings, PasswordOutput> = {
  readSettings(root) {
    return {
      length: Number(control(root, 'length')?.value),
      upper: control(root, 'upper')?.checked ?? false,
      lower: control(root, 'lower')?.checked ?? false,
      digits: control(root, 'digits')?.checked ?? false,
      symbols: control(root, 'symbols')?.checked ?? false,
    };
  },

  validateSettings: validatePasswordSettings,

  generate(settings) {
    const password = generatePassword(settings);
    const bits = estimateEntropyBits(settings);
    return {
      password,
      bits,
      strength: strengthLabel(bits),
      length: settings.length,
      types: selectedTypeLabels(settings),
    };
  },

  renderOutput(output, ctx: GeneratorRenderContext) {
    const q = <T extends HTMLElement>(sel: string) => ctx.result.querySelector<T>(sel);
    const out = q<HTMLInputElement>('[data-generator-output]');
    if (out) out.value = output.password; // the ONLY place the password lands
    const strengthEl = q('[data-strength]');
    if (strengthEl) strengthEl.textContent = output.strength;
    const meta = q('[data-output-meta]');
    if (meta) meta.textContent = passwordMeta(output);
    const meter = q<HTMLElement>('[data-strength-meter]');
    if (meter) {
      meter.style.width = `${Math.min(100, Math.round((output.bits / 128) * 100))}%`;
      meter.dataset.level = output.strength.toLowerCase().replace(/\s+/g, '-');
    }
  },

  describeOutput: describePasswordOutput,

  resetSettings(root) {
    const len = control(root, 'length');
    if (len) len.value = String(DEFAULT_LENGTH);
    for (const [key] of CLASS_LABELS) {
      const c = control(root, key);
      if (c) c.checked = true;
    }
    const disp = root.querySelector<HTMLElement>('[data-length-display]');
    if (disp) disp.textContent = String(DEFAULT_LENGTH);
  },
};

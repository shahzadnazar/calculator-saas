/**
 * Password form layer — settings in, a password and its strength out.
 *
 * Wraps the pure generator and layers the visitor-facing contract: reading the length, the four
 * character classes and the three exclusions, rejecting a setting that leaves nothing to draw from,
 * and presenting the strength and entropy of the pool that was ACTUALLY used.
 *
 * Runs on the UNCHANGED generator runtime: an explicit Generate, and a settings change that marks
 * the shown password STALE — kept visible, Copy disabled — rather than silently regenerating. The
 * password is never announced, stored, logged or transmitted.
 */
import {
  generatePassword,
  estimateEntropyBits,
  strengthLabel,
  strengthPercent,
  buildPool,
  activeSets,
  CLASS_ORDER,
  MIN_LENGTH,
  MAX_LENGTH,
  type PasswordOptions,
  type RandomInt,
  type Strength,
} from './password-generator';
import type { GeneratorBinding, GeneratorRenderContext } from '@lib/result/generator-runtime';
import type { ValidationResult } from '@lib/result/form-runtime';

export const MSG = {
  lengthRange: `Choose a length between ${MIN_LENGTH} and ${MAX_LENGTH}.`,
  noCharsets: 'Select at least one character type.',
  everythingExcluded: 'Those exclusions leave no characters to choose from. Allow a type back in.',
  tooLongForNoRepeats: (pool: number) =>
    `With no repeated characters the longest possible password is ${pool}. Shorten it, or allow repeats.`,
} as const;

export interface PasswordSettings extends PasswordOptions {}

export interface PasswordOutput {
  password: string;
  bits: number;
  strength: Strength;
  percent: number;
  poolSize: number;
}

const checked = (root: HTMLElement, name: string): boolean =>
  root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked ?? false;

export function readSettings(root: HTMLElement): PasswordSettings {
  const raw = root.querySelector<HTMLInputElement>('[name="length"]')?.value ?? '';
  return {
    length: Number(raw.trim()),
    lower: checked(root, 'lower'),
    upper: checked(root, 'upper'),
    digits: checked(root, 'digits'),
    symbols: checked(root, 'symbols'),
    excludeAmbiguous: checked(root, 'excludeAmbiguous'),
    excludeBrackets: checked(root, 'excludeBrackets'),
    noRepeats: checked(root, 'noRepeats'),
  };
}

export function validateSettings(settings: PasswordSettings): ValidationResult {
  const { length } = settings;
  if (!Number.isFinite(length) || !Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    return { ok: false, fieldErrors: { length: MSG.lengthRange } };
  }
  if (!CLASS_ORDER.some((name) => settings[name])) {
    return { ok: false, fieldErrors: { charsets: MSG.noCharsets } };
  }
  // Every class the visitor picked was emptied by the exclusions — a real state, and not their fault.
  if (activeSets(settings).length === 0) {
    return { ok: false, fieldErrors: { charsets: MSG.everythingExcluded } };
  }
  const pool = new Set(buildPool(settings)).size;
  if (settings.noRepeats && length > pool) {
    return { ok: false, fieldErrors: { length: MSG.tooLongForNoRepeats(pool) } };
  }
  return { ok: true };
}

export function generate(settings: PasswordSettings, rng?: RandomInt): PasswordOutput {
  const bits = estimateEntropyBits(settings);
  return {
    password: generatePassword(settings, rng),
    bits,
    strength: strengthLabel(bits),
    percent: strengthPercent(bits),
    poolSize: new Set(buildPool(settings)).size,
  };
}

/** Entropy as the reference prints it: one decimal place, then "bits". */
export const formatBits = (bits: number): string => `${(Math.round(bits * 10) / 10).toFixed(1)} bits`;

/**
 * What the live region says.
 *
 * Never the password. A generated secret read aloud by a screen reader, in a room or on a call, is
 * exactly the leak the tool exists to avoid.
 */
export function describeOutput(output: PasswordOutput): string {
  return output.password ? 'Password generated.' : '';
}

export function renderOutput(output: PasswordOutput, context: GeneratorRenderContext): void {
  const scope = context.result;
  const field = scope.querySelector<HTMLInputElement>('[data-generator-output]');
  if (field) field.value = output.password;

  const set = (selector: string, text: string) => {
    const node = scope.querySelector<HTMLElement>(selector);
    if (node) node.textContent = text;
  };
  set('[data-strength]', output.strength);
  set('[data-entropy]', formatBits(output.bits));

  const meter = scope.querySelector<HTMLElement>('[data-strength-meter]');
  if (meter) {
    meter.style.width = `${output.percent}%`;
    meter.setAttribute('data-strength-level', output.strength.toLowerCase().replace(' ', '-'));
  }
}

/** What the generator opens on — the reference's own defaults. */
export const DEFAULTS: PasswordSettings = {
  length: 10,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: true,
  excludeBrackets: true,
  noRepeats: false,
};

export const passwordBinding: GeneratorBinding<PasswordSettings, PasswordOutput> = {
  readSettings,
  validateSettings,
  generate: (settings) => generate(settings),
  renderOutput,
  describeOutput,
  resetSettings(root) {
    for (const [name, value] of Object.entries(DEFAULTS)) {
      const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (!input) continue;
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = String(value);
    }
    const slider = root.querySelector<HTMLInputElement>('[data-length-slider]');
    if (slider) slider.value = String(DEFAULTS.length);
    const display = root.querySelector<HTMLElement>('[data-length-display]');
    if (display) display.textContent = String(DEFAULTS.length);
  },
};

/**
 * Settings for the labelled worked example shown on load.
 *
 * These are OURS, not the visitor's: the runtime generates from them in the browser and calls this
 * binding's own renderOutput, so the example reuses the real output markup. Nothing is baked into
 * the server HTML, and the example is never announced.
 */
export const PASSWORD_EXAMPLE_SETTINGS: PasswordSettings = { ...DEFAULTS };

export { MIN_LENGTH, MAX_LENGTH };

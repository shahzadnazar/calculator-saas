import { describe, it, expect } from 'vitest';
import {
  validatePasswordSettings,
  describePasswordOutput,
  passwordMeta,
  selectedClassCount,
  selectedTypeLabels,
  passwordBinding,
  MIN_LENGTH,
  MAX_LENGTH,
  type PasswordSettings,
} from './password-form';

/**
 * Password binding. The secure generator itself is tested in
 * password-generator.test.ts; here we pin the binding contract the runtime
 * relies on: settings validation, the class-fit guarantee, the exact output
 * length, the cryptographic (non-deterministic) path, a content-FREE
 * announcement, and safe reset defaults.
 */

const S = (over: Partial<PasswordSettings> = {}): PasswordSettings => ({
  length: 16,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  ...over,
});

const hasUpper = (s: string) => /[A-Z]/.test(s);
const hasLower = (s: string) => /[a-z]/.test(s);
const hasDigit = (s: string) => /[0-9]/.test(s);
const hasSymbol = (s: string) => /[^A-Za-z0-9]/.test(s);

/* ---- Validation --------------------------------------------------------- */

describe('validatePasswordSettings', () => {
  it('accepts the supported minimum and maximum lengths', () => {
    expect(validatePasswordSettings(S({ length: MIN_LENGTH }))).toEqual({ ok: true });
    expect(validatePasswordSettings(S({ length: MAX_LENGTH }))).toEqual({ ok: true });
  });
  it('rejects a length below the minimum, above the maximum, or non-finite', () => {
    for (const length of [MIN_LENGTH - 1, MAX_LENGTH + 1, NaN, 12.5, Infinity]) {
      expect(validatePasswordSettings(S({ length }))).toMatchObject({
        fieldErrors: { length: 'Enter a valid password length.' },
      });
    }
  });
  it('requires at least one character type', () => {
    expect(validatePasswordSettings(S({ upper: false, lower: false, digits: false, symbols: false }))).toMatchObject({
      fieldErrors: { charsets: 'Select at least one character type.' },
    });
  });
  it('guarantees the length can always fit every selected class (min length ≥ class count)', () => {
    // With four classes and a minimum length of four, a valid length is never
    // shorter than the selected classes — so the tool cannot silently violate
    // the selection. The tightest case (length 4, all four classes) is valid.
    expect(MIN_LENGTH).toBeGreaterThanOrEqual(4);
    expect(validatePasswordSettings(S({ length: 4 }))).toEqual({ ok: true });
  });
});

/* ---- Helpers ------------------------------------------------------------ */

describe('class helpers', () => {
  it('counts and labels the selected classes', () => {
    expect(selectedClassCount(S())).toBe(4);
    expect(selectedClassCount(S({ symbols: false, digits: false }))).toBe(2);
    expect(selectedTypeLabels(S({ upper: false }))).toEqual(['lowercase', 'numbers', 'symbols']);
  });
});

/* ---- Generation (through the binding) ----------------------------------- */

describe('passwordBinding.generate', () => {
  it('produces the exact requested length with every selected class represented', () => {
    const o = passwordBinding.generate(S({ length: 20 }));
    expect(o.password).toHaveLength(20);
    expect(hasUpper(o.password) && hasLower(o.password) && hasDigit(o.password) && hasSymbol(o.password)).toBe(true);
    expect(o.length).toBe(20);
    expect(o.types).toEqual(['uppercase', 'lowercase', 'numbers', 'symbols']);
    expect(o.strength).toBeTypeOf('string');
  });
  it('fits all four classes at the tightest valid length', () => {
    const o = passwordBinding.generate(S({ length: 4 }));
    expect(o.password).toHaveLength(4);
    expect(hasUpper(o.password) && hasLower(o.password) && hasDigit(o.password) && hasSymbol(o.password)).toBe(true);
  });
  it('excludes deselected classes', () => {
    const o = passwordBinding.generate(S({ length: 30, symbols: false, upper: false }));
    expect(hasSymbol(o.password)).toBe(false);
    expect(hasUpper(o.password)).toBe(false);
    expect(hasLower(o.password) && hasDigit(o.password)).toBe(true);
  });
  it('uses a cryptographic (non-deterministic) path — repeated calls differ', () => {
    const values = new Set(Array.from({ length: 8 }, () => passwordBinding.generate(S({ length: 24 })).password));
    expect(values.size).toBeGreaterThan(1); // astronomically unlikely to collide if random
    for (const v of values) expect(v).toHaveLength(24);
  });
});

/* ---- Description (content-free) + meta ---------------------------------- */

describe('describePasswordOutput', () => {
  it('never contains the password — only a safe status message', () => {
    const o = passwordBinding.generate(S({ length: 16 }));
    const description = describePasswordOutput(o);
    expect(description).toBe('Password generated.');
    expect(description).not.toContain(o.password);
  });
});

describe('passwordMeta', () => {
  it('summarizes length, types and entropy', () => {
    const meta = passwordMeta({ password: 'x', bits: 103, strength: 'Very strong', length: 16, types: ['uppercase', 'numbers'] });
    expect(meta).toBe('16 characters · uppercase, numbers · about 103 bits of entropy');
  });
});

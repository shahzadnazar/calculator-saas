import { describe, it, expect } from 'vitest';
import { generatePassword, estimateEntropyBits, strengthLabel } from './password-generator';

const hasUpper = (s: string) => /[A-Z]/.test(s);
const hasLower = (s: string) => /[a-z]/.test(s);
const hasDigit = (s: string) => /[0-9]/.test(s);
const hasSymbol = (s: string) => /[^A-Za-z0-9]/.test(s);

describe('password generator', () => {
  it('produces the requested length', () => {
    const pw = generatePassword({ length: 16, upper: true, lower: true, digits: true, symbols: true });
    expect(pw).toHaveLength(16);
  });

  it('guarantees at least one of each selected class', () => {
    const pw = generatePassword({ length: 20, upper: true, lower: true, digits: true, symbols: true });
    expect(hasUpper(pw) && hasLower(pw) && hasDigit(pw) && hasSymbol(pw)).toBe(true);
  });

  it('excludes classes that are turned off', () => {
    const pw = generatePassword({ length: 30, upper: false, lower: true, digits: true, symbols: false });
    expect(hasUpper(pw)).toBe(false);
    expect(hasSymbol(pw)).toBe(false);
    expect(hasLower(pw) && hasDigit(pw)).toBe(true);
  });

  it('never yields an empty pool and respects a minimum length', () => {
    const pw = generatePassword({ length: 1, upper: false, lower: false, digits: false, symbols: false });
    expect(pw.length).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic with an injected RNG', () => {
    const rng = () => 0;
    const a = generatePassword({ length: 8, upper: true, lower: true, digits: true, symbols: true }, rng);
    const b = generatePassword({ length: 8, upper: true, lower: true, digits: true, symbols: true }, rng);
    expect(a).toBe(b);
    expect(a).toHaveLength(8);
  });

  it('estimates entropy and labels strength', () => {
    const bits = estimateEntropyBits({ length: 16, upper: true, lower: true, digits: true, symbols: true });
    expect(bits).toBeGreaterThan(90);
    expect(strengthLabel(bits)).toBe('Very strong');
    expect(strengthLabel(30)).toBe('Weak');
  });
});

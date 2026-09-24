import { describe, expect, it } from 'vitest';
import {
  generatePassword,
  estimateEntropyBits,
  strengthLabel,
  strengthPercent,
  setFor,
  activeSets,
  buildPool,
  CHAR_SETS,
  AMBIGUOUS,
  BRACKETS,
  MAX_LENGTH,
  type PasswordOptions,
  type RandomInt,
} from './password-generator';

const opts = (over: Partial<PasswordOptions> = {}): PasswordOptions => ({
  length: 16,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
  excludeBrackets: false,
  noRepeats: false,
  ...over,
});

/** A deterministic RNG so a "random" generator can be asserted on exactly. */
const cycling = (...values: number[]): RandomInt => {
  let i = 0;
  return (max) => values[i++ % values.length] % Math.max(1, max);
};
const alwaysFirst: RandomInt = () => 0;

describe('character sets and exclusions', () => {
  it('offers all four classes untouched when nothing is excluded', () => {
    expect(setFor('lower', opts())).toBe(CHAR_SETS.lower);
    expect(setFor('symbols', opts())).toBe(CHAR_SETS.symbols);
    expect(buildPool(opts())).toHaveLength(26 + 26 + 10 + 32);
  });

  it('drops the look-alike characters when ambiguous are excluded', () => {
    const pool = buildPool(opts({ excludeAmbiguous: true }));
    for (const c of AMBIGUOUS) expect(pool).not.toContain(c);
    // Only those — the neighbouring characters survive.
    expect(pool).toContain('j');
    expect(pool).toContain('2');
    expect(pool).toContain('!');
  });

  it('drops every bracket when brackets are excluded', () => {
    const pool = buildPool(opts({ excludeBrackets: true }));
    for (const c of BRACKETS) expect(pool).not.toContain(c);
  });

  it('applies both exclusions together', () => {
    const pool = buildPool(opts({ excludeAmbiguous: true, excludeBrackets: true }));
    for (const c of AMBIGUOUS + BRACKETS) expect(pool).not.toContain(c);
  });

  it('leaves a class out entirely once its characters are all excluded', () => {
    // Digits are 0-9; excluding the ambiguous ones removes 0 and 1 but not the rest.
    expect(activeSets(opts({ lower: false, upper: false, symbols: false, excludeAmbiguous: true })))
      .toEqual(['23456789']);
  });
});

describe('generatePassword', () => {
  it('returns a password of the requested length', () => {
    expect(generatePassword(opts({ length: 24 }), alwaysFirst)).toHaveLength(24);
    expect(generatePassword(opts({ length: 4 }), alwaysFirst)).toHaveLength(4);
  });

  it('includes at least one character from every selected class', () => {
    const pw = generatePassword(opts({ length: 12 }), cycling(3, 7, 11, 2, 5));
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[0-9]/);
    expect(pw).toMatch(/[^A-Za-z0-9]/);
  });

  it('uses only the classes that were asked for', () => {
    const pw = generatePassword(opts({ length: 20, upper: false, symbols: false }), cycling(1, 4, 9));
    expect(pw).toMatch(/^[a-z0-9]+$/);
  });

  it('honours the exclusions', () => {
    const pw = generatePassword(
      opts({ length: 40, excludeAmbiguous: true, excludeBrackets: true }),
      cycling(2, 13, 5, 29, 7),
    );
    for (const c of pw) expect(AMBIGUOUS + BRACKETS).not.toContain(c);
  });

  it('returns nothing when no class is selected', () => {
    expect(generatePassword(opts({ lower: false, upper: false, digits: false, symbols: false }))).toBe('');
  });

  it('caps the length at the pool size when repeats are off', () => {
    // Digits only: ten distinct characters, however long the request.
    const pw = generatePassword(opts({ length: 30, lower: false, upper: false, symbols: false, noRepeats: true }));
    expect(pw).toHaveLength(10);
    expect(new Set(pw).size).toBe(10);
  });

  it('never repeats a character when repeats are off', () => {
    const pw = generatePassword(opts({ length: 60, noRepeats: true }), cycling(3, 17, 5, 41, 11, 29));
    expect(new Set(pw).size).toBe(pw.length);
  });

  it('caps a very long request at the maximum length', () => {
    expect(generatePassword(opts({ length: 500 }), alwaysFirst)).toHaveLength(MAX_LENGTH);
  });

  it('draws only from the pool', () => {
    const settings = opts({ length: 50, excludeAmbiguous: true });
    const pool = buildPool(settings);
    for (const c of generatePassword(settings, cycling(1, 6, 19, 3))) expect(pool).toContain(c);
  });
});

describe('estimateEntropyBits', () => {
  it('is length x log2(pool) when repeats are allowed', () => {
    const settings = opts({ length: 10 });
    expect(estimateEntropyBits(settings)).toBeCloseTo(10 * Math.log2(94), 10);
  });

  it('falls when characters are excluded, because the pool is smaller', () => {
    const wide = estimateEntropyBits(opts({ length: 12 }));
    const narrow = estimateEntropyBits(opts({ length: 12, excludeAmbiguous: true, excludeBrackets: true }));
    expect(narrow).toBeLessThan(wide);
  });

  it('sums log2(pool - i) when repeats are off, which is less than the naive figure', () => {
    const settings = opts({ length: 8, lower: false, upper: false, symbols: false, noRepeats: true });
    let expected = 0;
    for (let i = 0; i < 8; i += 1) expected += Math.log2(10 - i);
    expect(estimateEntropyBits(settings)).toBeCloseTo(expected, 10);
    expect(estimateEntropyBits(settings)).toBeLessThan(8 * Math.log2(10));
  });

  it('is zero when there is nothing to draw from', () => {
    expect(estimateEntropyBits(opts({ lower: false, upper: false, digits: false, symbols: false }))).toBe(0);
  });
});

describe('strength', () => {
  it('bands the bits', () => {
    expect(strengthLabel(20)).toBe('Weak');
    expect(strengthLabel(39.9)).toBe('Weak');
    expect(strengthLabel(40)).toBe('Fair');
    expect(strengthLabel(59.9)).toBe('Fair');
    expect(strengthLabel(60)).toBe('Strong');
    expect(strengthLabel(89.9)).toBe('Strong');
    expect(strengthLabel(90)).toBe('Very strong');
  });

  it('fills the meter proportionally and saturates', () => {
    expect(strengthPercent(0)).toBe(0);
    expect(strengthPercent(60)).toBe(50);
    expect(strengthPercent(120)).toBe(100);
    expect(strengthPercent(400)).toBe(100);
  });
});

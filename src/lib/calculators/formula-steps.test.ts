import { describe, it, expect } from 'vitest';
import { formatDigits, formatSignificant } from './formula-steps';

/* ------------------------------------------------------------------ */
/* Plain digits at any magnitude                                       */
/* ------------------------------------------------------------------ */

describe('formatDigits never falls back to JavaScript exponential notation', () => {
  it('expands a large magnitude into plain digits', () => {
    // A cube with 1e15 sides. The old output was "4.1887902047864e+45".
    expect(formatDigits(1e30, 14)).toBe('1' + '0'.repeat(30));
    expect(formatDigits(4.1887902047864e45, 14)).toBe('4188790204786400000000000000000000000000000000');
    expect(formatDigits(1.44e47, 14)).toBe('144' + '0'.repeat(45));
  });

  it('expands a small magnitude into plain digits', () => {
    expect(formatDigits(1e-7, 14)).toBe('0.0000001');
    expect(formatDigits(1.23e-9, 14)).toBe('0.00000000123');
  });

  it('keeps the sign', () => {
    expect(formatDigits(-2.5e22, 14)).toBe('-25000000000000000000000');
    expect(formatDigits(-1e-8, 14)).toBe('-0.00000001');
  });

  it('expands from the ROUNDED value, so no float noise leaks in', () => {
    // (1e30).toFixed(0) is 1000000000000000019884624838656 — precision the double never had.
    expect(formatDigits(1e30, 14)).not.toMatch(/19884624838656/);
    expect(formatDigits(1e30, 14)).toMatch(/^10+$/);
  });

  it('leaves ordinary magnitudes exactly as they were', () => {
    expect(formatDigits(314.15926535898, 14)).toBe('314.15926535898');
    expect(formatDigits(666.58528149067, 14)).toBe('666.58528149067');
    expect(formatDigits(0, 14)).toBe('0');
    expect(formatDigits(2, 14)).toBe('2');
    expect(formatDigits(-0.25, 14)).toBe('-0.25');
  });

  it('still refuses a non-finite figure', () => {
    expect(formatDigits(Number.NaN, 14)).toBe('—');
    expect(formatDigits(Number.POSITIVE_INFINITY, 14)).toBe('—');
  });

  it('produces nothing a reader would mistake for code', () => {
    for (const v of [1e21, 1e30, 4.1887902047864e45, 1e-7, -3.7e-11, 9.87e60]) {
      expect(formatDigits(v, 14)).not.toMatch(/e[+-]/i);
    }
  });
});

describe('formatSignificant is formatDigits at fourteen figures', () => {
  it('agrees with formatDigits, including at absurd magnitudes', () => {
    for (const v of [314.15926535898, 666.58528149067, 1e30, 1e-7, 0, -2]) {
      expect(formatSignificant(v)).toBe(formatDigits(v, 14));
    }
  });
});

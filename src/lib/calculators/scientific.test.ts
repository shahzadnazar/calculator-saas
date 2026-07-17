import { describe, it, expect } from 'vitest';
import { evaluate, CalculatorError } from './scientific';

describe('scientific evaluator', () => {
  it('respects operator precedence', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('2 * 3 + 4')).toBe(10);
  });

  it('handles parentheses', () => {
    expect(evaluate('(2 + 3) * 4')).toBe(20);
    expect(evaluate('2 * (3 + (4 - 1))')).toBe(12);
  });

  it('treats exponentiation as right-associative', () => {
    expect(evaluate('2 ^ 3 ^ 2')).toBe(512); // 2^(3^2)
  });

  it('handles unary minus', () => {
    expect(evaluate('-3 + 2')).toBe(-1);
    expect(evaluate('-(2 + 3)')).toBe(-5);
    expect(evaluate('3 * -2')).toBe(-6);
  });

  it('evaluates functions and roots', () => {
    expect(evaluate('sqrt(16)')).toBe(4);
    expect(evaluate('log(1000)')).toBeCloseTo(3, 10);
    expect(evaluate('ln(e)')).toBeCloseTo(1, 10);
    expect(evaluate('abs(-7)')).toBe(7);
  });

  it('respects angle mode for trig', () => {
    expect(evaluate('sin(30)', 'deg')).toBeCloseTo(0.5, 10);
    expect(evaluate('cos(0)', 'deg')).toBeCloseTo(1, 10);
    expect(evaluate('sin(pi / 2)', 'rad')).toBeCloseTo(1, 10);
  });

  it('computes factorials', () => {
    expect(evaluate('5!')).toBe(120);
    expect(evaluate('0!')).toBe(1);
    expect(evaluate('3! + 1')).toBe(7);
  });

  it('resolves constants', () => {
    expect(evaluate('pi')).toBeCloseTo(Math.PI, 12);
    expect(evaluate('2 * pi')).toBeCloseTo(2 * Math.PI, 12);
  });

  it('supports scientific notation', () => {
    expect(evaluate('1.5e3')).toBe(1500);
    expect(evaluate('2e-2')).toBeCloseTo(0.02, 12);
  });

  it('does NOT execute injected code (no eval)', () => {
    expect(() => evaluate('alert(1)')).toThrow(CalculatorError);
    expect(() => evaluate('1;2')).toThrow(CalculatorError);
  });

  it('throws on malformed input', () => {
    expect(() => evaluate('2 +')).toThrow(CalculatorError);
    expect(() => evaluate('(1 + 2')).toThrow(CalculatorError);
    expect(() => evaluate('')).toThrow(CalculatorError);
  });
});

import { describe, it, expect } from 'vitest';
import { computeFraction, simplify } from './fraction';

describe('fraction arithmetic', () => {
  it('adds fractions and simplifies', () => {
    const r = computeFraction({ num: 1, den: 2 }, 'add', { num: 1, den: 3 });
    expect(r.fraction).toEqual({ num: 5, den: 6 });
    expect(r.decimal).toBeCloseTo(0.8333, 3);
    expect(r.mixed).toBe('5/6');
  });

  it('subtracts to a negative fraction', () => {
    const r = computeFraction({ num: 1, den: 2 }, 'subtract', { num: 3, den: 4 });
    expect(r.fraction).toEqual({ num: -1, den: 4 });
    expect(r.mixed).toBe('-1/4');
  });

  it('multiplies and reduces', () => {
    const r = computeFraction({ num: 2, den: 3 }, 'multiply', { num: 3, den: 4 });
    expect(r.fraction).toEqual({ num: 1, den: 2 });
  });

  it('divides to a whole number', () => {
    const r = computeFraction({ num: 1, den: 2 }, 'divide', { num: 1, den: 4 });
    expect(r.fraction).toEqual({ num: 2, den: 1 });
    expect(r.mixed).toBe('2');
  });

  it('renders improper fractions as mixed numbers', () => {
    const r = computeFraction({ num: 7, den: 2 }, 'add', { num: 0, den: 1 });
    expect(r.mixed).toBe('3 1/2');
  });

  it('normalises a negative denominator', () => {
    expect(simplify({ num: 1, den: -2 })).toEqual({ num: -1, den: 2 });
  });
});

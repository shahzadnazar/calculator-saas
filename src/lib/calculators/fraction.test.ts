import { describe, it, expect } from 'vitest';
import { computeFraction, simplify, type Fraction, type FractionOp } from './fraction';

/**
 * Dedicated Fraction characterization (R17B1 Commit 1 — bounded singleton). FREEZES the exact
 * current behaviour of `simplify` and `computeFraction` ahead of the task-first migration; it does
 * NOT change the module. The Fraction binding (fraction-form.ts) layers strict integer parsing,
 * visitor validation and a complete-result guard ON TOP of these unchanged functions — this file
 * pins exactly what it wraps.
 *
 *   simplify(f):  den===0 → {num:NaN, den:NaN} (returns a NaN object; it does NOT throw);
 *                 den<0 → negate both (sign carried on the numerator); reduce by gcd(|num|,|den|)
 *                 (Euclid, returns a||1 so a zero gcd falls back to 1).
 *   computeFraction(a, op, b): cross-multiply per op → simplify → { fraction, decimal (UNROUNDED
 *                 num/den, NaN when den is 0/NaN), mixed }. An unsupported op has NO default branch,
 *                 so `raw` is undefined and simplify(undefined) THROWS (the binding validates the op
 *                 to an exact identifier before calling).
 *
 * The pure source behaviour is pinned even where the visitor-facing binding will reject the same
 * input (zero denominators, division by a zero-valued fraction, unsupported ops).
 */

const f = (num: number, den: number): Fraction => ({ num, den });

describe('simplify — reduce + sign-normalise onto the numerator', () => {
  it('leaves an already-simplified fraction unchanged', () => {
    expect(simplify(f(2, 3))).toEqual({ num: 2, den: 3 });
  });

  it('reduces by the greatest common divisor', () => {
    expect(simplify(f(8, 12))).toEqual({ num: 2, den: 3 });
    expect(simplify(f(100, 25))).toEqual({ num: 4, den: 1 });
  });

  it('a zero numerator reduces to 0/1', () => {
    expect(simplify(f(0, 5))).toEqual({ num: 0, den: 1 });
  });

  it('keeps a positive numerator and denominator positive', () => {
    expect(simplify(f(3, 4))).toEqual({ num: 3, den: 4 });
  });

  it('a negative numerator stays on the numerator', () => {
    expect(simplify(f(-3, 4))).toEqual({ num: -3, den: 4 });
  });

  it('a negative denominator moves the sign onto the numerator', () => {
    expect(simplify(f(1, -2))).toEqual({ num: -1, den: 2 });
    expect(simplify(f(3, -6))).toEqual({ num: -1, den: 2 }); // reduce + sign
  });

  it('both negative normalises to fully positive', () => {
    expect(simplify(f(-1, -2))).toEqual({ num: 1, den: 2 });
    expect(simplify(f(-4, -8))).toEqual({ num: 1, den: 2 });
  });

  it('an improper fraction stays improper (sign/reduce only, no mixed here)', () => {
    expect(simplify(f(7, 2))).toEqual({ num: 7, den: 2 });
  });

  it('a whole-number result reduces to n/1', () => {
    expect(simplify(f(6, 3))).toEqual({ num: 2, den: 1 });
  });

  it('a zero denominator returns {num:NaN, den:NaN} — it does NOT throw', () => {
    const r = simplify(f(1, 0));
    expect(Number.isNaN(r.num)).toBe(true);
    expect(Number.isNaN(r.den)).toBe(true);
  });

  it('is deterministic', () => {
    expect(simplify(f(8, 12))).toEqual(simplify(f(8, 12)));
  });
});

describe('computeFraction — the four operations, then simplify', () => {
  it('adds and simplifies (1/2 + 1/3 = 5/6)', () => {
    const r = computeFraction(f(1, 2), 'add', f(1, 3));
    expect(r.fraction).toEqual({ num: 5, den: 6 });
    expect(r.decimal).toBeCloseTo(5 / 6, 12);
    expect(r.mixed).toBe('5/6');
  });

  it('subtracts to a negative fraction (1/2 − 3/4 = −1/4)', () => {
    const r = computeFraction(f(1, 2), 'subtract', f(3, 4));
    expect(r.fraction).toEqual({ num: -1, den: 4 });
    expect(r.mixed).toBe('-1/4');
    expect(r.decimal).toBeCloseTo(-0.25, 12);
  });

  it('multiplies and reduces (2/3 × 3/4 = 1/2)', () => {
    expect(computeFraction(f(2, 3), 'multiply', f(3, 4)).fraction).toEqual({ num: 1, den: 2 });
  });

  it('divides by multiplying by the reciprocal (1/2 ÷ 1/4 = 2/1)', () => {
    const r = computeFraction(f(1, 2), 'divide', f(1, 4));
    expect(r.fraction).toEqual({ num: 2, den: 1 });
    expect(r.mixed).toBe('2');
    expect(r.decimal).toBe(2);
  });

  it('handles negative operands (−1/2 + 1/2 = 0/1)', () => {
    const r = computeFraction(f(-1, 2), 'add', f(1, 2));
    expect(r.fraction).toEqual({ num: 0, den: 1 });
    expect(r.mixed).toBe('0');
    expect(r.decimal).toBe(0);
  });

  it('handles improper operands (7/2 + 0/1 = 7/2 → mixed 3 1/2)', () => {
    const r = computeFraction(f(7, 2), 'add', f(0, 1));
    expect(r.fraction).toEqual({ num: 7, den: 2 });
    expect(r.mixed).toBe('3 1/2');
    expect(r.decimal).toBeCloseTo(3.5, 12);
  });

  it('a result equal to a whole number renders without a denominator (3/4 ÷ 3/4 = 1)', () => {
    const r = computeFraction(f(3, 4), 'divide', f(3, 4));
    expect(r.fraction).toEqual({ num: 1, den: 1 });
    expect(r.mixed).toBe('1');
  });

  it('a reducible result is fully reduced (2/4 + 2/4 = 1/1)', () => {
    expect(computeFraction(f(2, 4), 'add', f(2, 4)).fraction).toEqual({ num: 1, den: 1 });
  });

  it('an irreducible result is left as-is (1/3 + 1/4 = 7/12)', () => {
    expect(computeFraction(f(1, 3), 'add', f(1, 4)).fraction).toEqual({ num: 7, den: 12 });
  });

  it('a negative improper result renders a negative mixed number (−7/2 + 0 = −3 1/2)', () => {
    const r = computeFraction(f(-7, 2), 'add', f(0, 1));
    expect(r.fraction).toEqual({ num: -7, den: 2 });
    expect(r.mixed).toBe('-3 1/2');
  });

  it('the decimal is the UNROUNDED num/den float, reconciling exactly', () => {
    const r = computeFraction(f(1, 3), 'add', f(0, 1));
    expect(r.fraction).toEqual({ num: 1, den: 3 });
    expect(r.decimal).toBe(1 / 3); // no rounding in the source
  });

  it('division by a zero-valued second fraction yields {NaN,NaN}, decimal NaN, mixed "—"', () => {
    const r = computeFraction(f(1, 2), 'divide', f(0, 5));
    expect(Number.isNaN(r.fraction.num)).toBe(true);
    expect(Number.isNaN(r.fraction.den)).toBe(true);
    expect(Number.isNaN(r.decimal)).toBe(true);
    expect(r.mixed).toBe('—');
  });

  it('a zero denominator in an operand propagates to {NaN,NaN} (1/0 + 1/2)', () => {
    const r = computeFraction(f(1, 0), 'add', f(1, 2));
    expect(Number.isNaN(r.fraction.num)).toBe(true);
    expect(Number.isNaN(r.fraction.den)).toBe(true);
    expect(r.mixed).toBe('—');
  });

  it('an unsupported operation THROWS (no default branch → simplify(undefined))', () => {
    expect(() => computeFraction(f(1, 2), 'power' as unknown as FractionOp, f(1, 3))).toThrow();
  });

  it('is deterministic', () => {
    const args = [f(3, 8), 'multiply' as FractionOp, f(2, 9)] as const;
    expect(computeFraction(...args)).toEqual(computeFraction(...args));
  });
});

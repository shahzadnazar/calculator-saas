/**
 * Fraction arithmetic with simplification. Pure and unit-tested.
 */

export interface Fraction {
  num: number;
  den: number;
}
export type FractionOp = 'add' | 'subtract' | 'multiply' | 'divide';

export interface FractionResult {
  fraction: Fraction; // simplified, sign carried on the numerator
  decimal: number;
  mixed: string;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/** Reduce to lowest terms and normalise the sign onto the numerator. */
export function simplify(f: Fraction): Fraction {
  if (f.den === 0) return { num: NaN, den: NaN };
  let { num, den } = f;
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

function toMixed(f: Fraction): string {
  if (!Number.isFinite(f.num) || !Number.isFinite(f.den)) return '—';
  if (f.den === 1) return String(f.num);
  const sign = f.num < 0 ? '-' : '';
  const n = Math.abs(f.num);
  const whole = Math.floor(n / f.den);
  const rem = n % f.den;
  if (whole === 0) return `${sign}${rem}/${f.den}`;
  if (rem === 0) return `${sign}${whole}`;
  return `${sign}${whole} ${rem}/${f.den}`;
}

export function computeFraction(a: Fraction, op: FractionOp, b: Fraction): FractionResult {
  let raw: Fraction;
  switch (op) {
    case 'add':
      raw = { num: a.num * b.den + b.num * a.den, den: a.den * b.den };
      break;
    case 'subtract':
      raw = { num: a.num * b.den - b.num * a.den, den: a.den * b.den };
      break;
    case 'multiply':
      raw = { num: a.num * b.num, den: a.den * b.den };
      break;
    case 'divide':
      raw = { num: a.num * b.den, den: a.den * b.num };
      break;
  }
  const fraction = simplify(raw);
  return {
    fraction,
    decimal: fraction.den ? fraction.num / fraction.den : NaN,
    mixed: toMixed(fraction),
  };
}

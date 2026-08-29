/**
 * Fraction arithmetic — exact, in BigInt, with the working shown.
 *
 * The reference puts six fraction calculators on one page, and one of them is explicitly for
 * "very big integers". Ordinary JS numbers cannot do that: 1/999999937 + 1/999999893 needs a
 * denominator of 999999830000006800, past Number.MAX_SAFE_INTEGER, and the old engine returned a
 * silently wrong answer for it. Every fraction here is therefore a pair of BigInts, reduced and
 * sign-normalised onto the numerator, and no result is ever approximated except the one place a
 * decimal is asked for.
 *
 * The other thing the reference gives, and the reason people trust it, is the WORKING: not just
 * "37/56" but the common denominator, the two expansions, the sum and the reduction. So the step
 * builders live here beside the arithmetic, as pure token lists, and are unit-tested with no DOM.
 */

export interface Frac {
  n: bigint;
  d: bigint;
}

export type FractionOp = 'add' | 'subtract' | 'multiply' | 'divide';

export const FRACTION_OPS: readonly FractionOp[] = ['add', 'subtract', 'multiply', 'divide'];

export const OP_SYMBOL: Record<FractionOp, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
};

/** The plain-ASCII operator used INSIDE a numerator, where "−" beside a digit reads as a minus. */
const OP_INLINE: Record<FractionOp, string> = { add: '+', subtract: '-', multiply: '×', divide: '÷' };

/* ------------------------------------------------------------------ */
/* Core arithmetic                                                     */
/* ------------------------------------------------------------------ */

export function gcdBig(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) [x, y] = [y, x % y];
  return x || 1n;
}

/** Lowest terms, sign on the numerator. A zero denominator is the caller's error to prevent. */
export function reduce(f: Frac): Frac {
  if (f.d === 0n) return { n: 0n, d: 0n };
  let { n, d } = f;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcdBig(n, d);
  return { n: n / g, d: d / g };
}

export const frac = (n: bigint, d: bigint): Frac => reduce({ n, d });

/** The raw (unreduced) result of the operation — the shape the working shows before simplifying. */
export function applyOpRaw(a: Frac, op: FractionOp, b: Frac): Frac {
  switch (op) {
    case 'add':
      return a.d === b.d ? { n: a.n + b.n, d: a.d } : { n: a.n * b.d + b.n * a.d, d: a.d * b.d };
    case 'subtract':
      return a.d === b.d ? { n: a.n - b.n, d: a.d } : { n: a.n * b.d - b.n * a.d, d: a.d * b.d };
    case 'multiply':
      return { n: a.n * b.n, d: a.d * b.d };
    case 'divide':
      return { n: a.n * b.d, d: a.d * b.n };
  }
}

export function applyOp(a: Frac, op: FractionOp, b: Frac): Frac {
  return reduce(applyOpRaw(a, op, b));
}

export const isZero = (f: Frac): boolean => f.n === 0n;
export const isImproper = (f: Frac): boolean => f.d !== 0n && (f.n < 0n ? -f.n : f.n) >= f.d;

/* ------------------------------------------------------------------ */
/* Text forms                                                          */
/* ------------------------------------------------------------------ */

/** "37/56", or "3" when the denominator is 1. */
export function fractionText(f: Frac): string {
  if (f.d === 0n) return '—';
  return f.d === 1n ? f.n.toString() : `${f.n}/${f.d}`;
}

export interface MixedParts {
  negative: boolean;
  whole: bigint;
  n: bigint;
  d: bigint;
}

/** The mixed reading of a fraction: 11/8 → 1 3/8. Sign belongs to the whole reading, not a part. */
export function mixedParts(f: Frac): MixedParts {
  const negative = f.n < 0n;
  const n = negative ? -f.n : f.n;
  return { negative, whole: n / f.d, n: n % f.d, d: f.d };
}

/**
 * "1 3/8" — or '' when the mixed form says nothing the fraction did not.
 *
 * A proper fraction has no mixed reading, and neither does a whole number: "4 = 4" is not a step,
 * it is a line that makes the visitor look twice for a difference that is not there.
 */
export function mixedText(f: Frac): string {
  if (f.d === 0n || f.d === 1n || !isImproper(f)) return '';
  const m = mixedParts(f);
  const sign = m.negative ? '-' : '';
  if (m.n === 0n) return `${sign}${m.whole}`;
  return `${sign}${m.whole} ${m.n}/${m.d}`;
}

/**
 * The decimal, to `sig` significant figures — 14, as the reference prints them
 * (2/7 → 0.28571428571429, 31/14 → 2.2142857142857).
 *
 * Computed by BigInt long division rather than floating point, so the fourteenth figure is the
 * true fourteenth figure even for a fraction whose numerator and denominator are far past
 * Number.MAX_SAFE_INTEGER. Trailing zeros are dropped: 1/2 is "0.5", not "0.50000000000000".
 */
export function decimalString(f: Frac, sig = 14): string {
  if (f.d === 0n) return '—';
  const negative = f.n < 0n;
  const N = negative ? -f.n : f.n;
  const D = f.d;
  if (N === 0n) return '0';

  const intPart = N / D;
  let decimals: number;
  if (intPart > 0n) {
    decimals = Math.max(0, sig - intPart.toString().length);
  } else {
    // How many places past the point the first significant figure sits.
    let zeros = 0;
    let scaled = N;
    while (scaled < D && zeros < 400) {
      scaled *= 10n;
      zeros += 1;
    }
    decimals = zeros - 1 + sig;
  }

  const scale = 10n ** BigInt(decimals);
  const rounded = (N * scale * 2n + D) / (D * 2n); // half-up, exactly
  const digits = rounded.toString().padStart(decimals + 1, '0');
  const whole = decimals ? digits.slice(0, digits.length - decimals) : digits;
  const fractionDigits = (decimals ? digits.slice(digits.length - decimals) : '').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fractionDigits ? `.${fractionDigits}` : ''}`;
}

/* ------------------------------------------------------------------ */
/* The shown working, as tokens                                        */
/* ------------------------------------------------------------------ */

/**
 * A step line is a row of tokens. A `frac` token is drawn stacked over a rule, exactly as the
 * reference draws it, which is why the working is a token list and not a string: "(2×8)/(7×8)"
 * as text loses the very thing that makes the step readable.
 */
export type FracToken =
  | { t: 'text'; v: string }
  | { t: 'frac'; n: string; d: string }
  | { t: 'mixed'; w: string; n: string; d: string };

export interface StepLine {
  /** Leading text outside the token flow — "=" on every line but the first. */
  lead?: string;
  tokens: FracToken[];
}

export const tText = (v: string): FracToken => ({ t: 'text', v });
export const tFrac = (n: string | bigint, d: string | bigint): FracToken => ({
  t: 'frac',
  n: String(n),
  d: String(d),
});

/** A fraction as one token: stacked, or plain text when the denominator is 1. */
export function tOf(f: Frac): FracToken {
  return f.d === 1n ? tText(f.n.toString()) : tFrac(f.n, f.d);
}

/** A fraction as its mixed reading: "1 3/8" with the fraction part stacked. */
export function tMixed(f: Frac): FracToken {
  const m = mixedParts(f);
  if (m.n === 0n) return tText(`${m.negative ? '-' : ''}${m.whole}`);
  if (m.whole === 0n) return tFrac(`${m.negative ? '-' : ''}${m.n}`, m.d);
  return { t: 'mixed', w: `${m.negative ? '-' : ''}${m.whole}`, n: String(m.n), d: String(m.d) };
}

const eq = (tokens: FracToken[]): StepLine => ({ lead: '=', tokens });

/** The tail every result shares: reduce if it reduces, then read it as a mixed number if improper. */
function closingSteps(raw: Frac): StepLine[] {
  const out: StepLine[] = [];
  const normalised = raw.d < 0n ? { n: -raw.n, d: -raw.d } : raw;
  const g = gcdBig(normalised.n, normalised.d);
  const reduced = reduce(normalised);
  if (g !== 1n) {
    out.push(eq([tFrac(`${normalised.n} ÷ ${g}`, `${normalised.d} ÷ ${g}`)]));
    out.push(eq([tOf(reduced)]));
  } else if (normalised.n !== raw.n || normalised.d !== raw.d) {
    out.push(eq([tOf(reduced)]));
  }
  const mixed = mixedText(reduced);
  if (mixed) out.push(eq([tMixed(reduced)]));
  return out;
}

/**
 * The working for `a op b`, as the reference lays it out:
 *
 *   2/7 + 3/8
 *   = (2×8)/(7×8) + (3×7)/(8×7)
 *   = 16/56 + 21/56
 *   = (16+21)/56
 *   = 37/56
 *
 * `compact` drops the expansions and shows only the answer — what the big-number calculator does,
 * because a thirty-digit cross-multiplication is not working anyone can read.
 */
export function combineSteps(a: Frac, op: FractionOp, b: Frac, compact = false): StepLine[] {
  const steps: StepLine[] = [{ tokens: [tOf(a), tText(OP_SYMBOL[op]), tOf(b)] }];
  const raw = applyOpRaw(a, op, b);
  if (compact) return [...steps, ...(closingSteps(raw).length ? closingSteps(raw) : [eq([tOf(raw)])])];

  if (op === 'divide') {
    // Dividing is multiplying by the reciprocal — say so, then it is a multiplication.
    steps.push(eq([tOf(a), tText(OP_SYMBOL.multiply), tFrac(b.d, b.n)]));
    steps.push(eq([tFrac(`${a.n} × ${b.d}`, `${a.d} × ${b.n}`)]));
  } else if (op === 'multiply') {
    steps.push(eq([tFrac(`${a.n} × ${b.n}`, `${a.d} × ${b.d}`)]));
  } else if (a.d !== b.d) {
    // A common denominator first: each side multiplied by the other's denominator.
    steps.push(
      eq([
        tFrac(`${a.n} × ${b.d}`, `${a.d} × ${b.d}`),
        tText(OP_SYMBOL[op]),
        tFrac(`${b.n} × ${a.d}`, `${b.d} × ${a.d}`),
      ]),
    );
    steps.push(
      eq([tFrac(a.n * b.d, a.d * b.d), tText(OP_SYMBOL[op]), tFrac(b.n * a.d, a.d * b.d)]),
    );
    steps.push(eq([tFrac(`${a.n * b.d}${OP_INLINE[op]}${b.n * a.d}`, a.d * b.d)]));
  } else {
    steps.push(eq([tFrac(`${a.n}${OP_INLINE[op]}${b.n}`, a.d)]));
  }

  steps.push(eq([tOf(raw)]));
  return [...steps, ...closingSteps(raw)];
}

/**
 * The working for simplifying a mixed number, as the reference lays it out:
 *
 *   2 21/98
 *   = 217/98
 *   = (217÷7)/(98÷7)
 *   = 31/14
 *   = 2 3/14
 */
export function simplifySteps(whole: bigint, n: bigint, d: bigint): StepLine[] {
  const negative = whole < 0n || (whole === 0n && n < 0n);
  const magnitude = (whole < 0n ? -whole : whole) * d + (n < 0n ? -n : n);
  const improper: Frac = { n: negative ? -magnitude : magnitude, d };

  const first: FracToken =
    whole === 0n
      ? tFrac(n, d)
      : { t: 'mixed', w: String(whole), n: String(n < 0n ? -n : n), d: String(d) };
  const steps: StepLine[] = [{ tokens: [first] }];
  if (whole !== 0n) steps.push(eq([tFrac(improper.n, improper.d)]));
  return [...steps, ...closingSteps(improper)];
}

/**
 * The working for a decimal, as the reference lays it out:
 *
 *   1.375
 *   = (1.375 × 1000)/(1 × 1000)
 *   = 1375/1000
 *   = (1375÷125)/(1000÷125)
 *   = 11/8
 *   = 1 3/8
 */
export function decimalSteps(text: string, integerDigits: string, decimalDigits: string): StepLine[] {
  const power = 10n ** BigInt(decimalDigits.length);
  const negative = text.trim().startsWith('-');
  const magnitude = BigInt(`${integerDigits || '0'}${decimalDigits}` || '0');
  const raw: Frac = { n: negative ? -magnitude : magnitude, d: power };

  const steps: StepLine[] = [{ tokens: [tText(text)] }];
  if (decimalDigits.length === 0) {
    steps.push(eq([tFrac(raw.n, 1n)]));
    return [...steps, ...closingSteps(raw)];
  }
  steps.push(eq([tFrac(`${text} × ${power}`, `1 × ${power}`)]));
  steps.push(eq([tFrac(raw.n, raw.d)]));
  return [...steps, ...closingSteps(raw)];
}

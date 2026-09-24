/**
 * Random numbers — integers of any size, and decimals to any precision.
 *
 * The reference makes two claims a Number-based generator cannot keep: integers "up to a few
 * thousand digits", and decimals with "up to 999 digits of precision". Both are past what a double
 * can hold, so every value here is a BigInt and a decimal is a scaled integer that is only turned
 * into text at the very end.
 *
 * Randomness is drawn by rejection sampling over crypto bytes, never by modulo. `bytes % range`
 * skews toward the low end of the range whenever the range does not divide the byte space evenly,
 * which for a lottery pick or a raffle is the whole point of the tool being wrong.
 *
 * Pure and unit-tested; the byte source is injectable so tests are deterministic.
 */

export type RandomBytes = (count: number) => Uint8Array;

const cryptoBytes: RandomBytes = (count) => {
  const buffer = new Uint8Array(count);
  globalThis.crypto.getRandomValues(buffer);
  return buffer;
};

/** How many values one call may produce, and how large the numbers may get. */
export const LIMITS = {
  maxCount: 1000,
  maxPrecision: 999,
  /** Digits per limit on the big-integer generator — "a few thousand", as the reference says. */
  maxDigits: 5000,
} as const;

/* ------------------------------------------------------------------ */
/* Uniform draws                                                       */
/* ------------------------------------------------------------------ */

/**
 * A uniform BigInt in [0, max) — by rejection, so every value is equally likely.
 *
 * Draws whole bytes, discards any draw landing in the ragged tail above the largest exact multiple
 * of `max`, and tries again. The expected number of retries is under one.
 */
export function randomBelow(max: bigint, bytes: RandomBytes = cryptoBytes): bigint {
  if (max <= 0n) return 0n;
  if (max === 1n) return 0n;

  const bits = max.toString(2).length;
  const byteCount = Math.ceil(bits / 8);
  const span = 1n << BigInt(byteCount * 8);
  const limit = span - (span % max); // the largest exact multiple of max that fits

  for (let attempt = 0; attempt < 10000; attempt += 1) {
    let value = 0n;
    for (const byte of bytes(byteCount)) value = (value << 8n) | BigInt(byte);
    if (value < limit) return value % max;
  }
  // Unreachable with a sane byte source; a biased answer is better than an infinite loop.
  return 0n;
}

/** A uniform BigInt in [lo, hi], inclusive at both ends. Order of the bounds does not matter. */
export function randomInRange(lo: bigint, hi: bigint, bytes: RandomBytes = cryptoBytes): bigint {
  const low = lo <= hi ? lo : hi;
  const high = lo <= hi ? hi : lo;
  return low + randomBelow(high - low + 1n, bytes);
}

/* ------------------------------------------------------------------ */
/* Decimal text ↔ scaled integer                                       */
/* ------------------------------------------------------------------ */

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
export const isDecimalText = (text: string): boolean => DECIMAL.test((text ?? '').trim());

/**
 * A decimal written as text, times 10^precision, as an exact integer.
 *
 * "0.2" at 50 digits is 2 followed by 49 zeros — not 0.2 × 1e50, which floating point would round.
 * Digits beyond the precision are TRUNCATED, not rounded: a bound the visitor typed must never be
 * quietly widened past what they asked for.
 */
export function parseScaled(text: string, precision: number): bigint | null {
  const trimmed = (text ?? '').trim();
  if (!DECIMAL.test(trimmed) || !Number.isInteger(precision) || precision < 0) return null;
  const negative = trimmed.startsWith('-');
  const body = trimmed.replace(/^[+-]/, '');
  const [whole = '0', fraction = ''] = body.split('.');
  const padded = (fraction + '0'.repeat(precision)).slice(0, precision);
  const magnitude = BigInt(`${whole || '0'}${padded}`);
  return negative ? -magnitude : magnitude;
}

/** A scaled integer back as decimal text, keeping every requested digit. */
export function formatScaled(value: bigint, precision: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(precision + 1, '0');
  const whole = digits.slice(0, digits.length - precision);
  const fraction = precision > 0 ? digits.slice(digits.length - precision) : '';
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/* ------------------------------------------------------------------ */
/* Generating                                                          */
/* ------------------------------------------------------------------ */

export interface RandomRequest {
  /** Bounds as the visitor wrote them; inclusive, in either order. */
  lower: string;
  upper: string;
  count: number;
  /** 0 for integers; 1–999 decimal places otherwise. */
  precision: number;
  /** False when every value must be distinct. */
  allowDuplicates: boolean;
  sort: boolean;
}

export interface RandomDraw {
  /** Each value as text, in the order it will be shown. */
  values: string[];
  /** The scaled integers behind them, for tests and for sorting. */
  scaled: bigint[];
  precision: number;
}

/** How many distinct values the range holds, at the requested precision. */
export function rangeSize(request: RandomRequest): bigint | null {
  const lo = parseScaled(request.lower, request.precision);
  const hi = parseScaled(request.upper, request.precision);
  if (lo === null || hi === null) return null;
  return (lo <= hi ? hi - lo : lo - hi) + 1n;
}

/**
 * `count` values drawn uniformly from the inclusive range.
 *
 * Without duplicates the draws are rejected and retried rather than shuffling a pool: the range can
 * hold more values than there is memory to enumerate, and a lottery pick of 6 from 10^40 must not
 * try to build the pool first.
 */
export function generateRandom(request: RandomRequest, bytes: RandomBytes = cryptoBytes): RandomDraw {
  const { precision } = request;
  const lo = parseScaled(request.lower, precision);
  const hi = parseScaled(request.upper, precision);
  const count = Math.max(0, Math.floor(request.count) || 0);
  if (lo === null || hi === null || count === 0) return { values: [], scaled: [], precision };

  const low = lo <= hi ? lo : hi;
  const high = lo <= hi ? hi : lo;
  const size = high - low + 1n;

  let scaled: bigint[];
  if (request.allowDuplicates) {
    scaled = Array.from({ length: count }, () => low + randomBelow(size, bytes));
  } else {
    const wanted = BigInt(count) > size ? Number(size) : count;
    const seen = new Set<string>();
    scaled = [];
    // Bounded so an exhausted range cannot spin: each accepted value shrinks what is left.
    for (let attempt = 0; scaled.length < wanted && attempt < wanted * 200 + 1000; attempt += 1) {
      const value = low + randomBelow(size, bytes);
      const key = value.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      scaled.push(value);
    }
  }

  if (request.sort) scaled.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { values: scaled.map((value) => formatScaled(value, precision)), scaled, precision };
}

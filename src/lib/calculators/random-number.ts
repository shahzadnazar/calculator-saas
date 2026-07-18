/**
 * Generate random integers in a range, optionally unique. Uses crypto-strength
 * randomness by default; the RNG is injectable for deterministic tests.
 * Pure and unit-tested.
 */
export type RandomInt = (maxExclusive: number) => number;

const cryptoRandomInt: RandomInt = (max) => {
  const arr = new Uint32Array(1);
  globalThis.crypto.getRandomValues(arr);
  return arr[0] % max;
};

export interface RandomOptions {
  min: number;
  max: number;
  count: number;
  unique: boolean;
}

export function randomIntegers(opts: RandomOptions, rng: RandomInt = cryptoRandomInt): number[] {
  let lo = Math.ceil(Math.min(opts.min, opts.max));
  let hi = Math.floor(Math.max(opts.min, opts.max));
  const rangeSize = hi - lo + 1;
  const count = Math.max(0, Math.floor(opts.count) || 0);

  if (rangeSize <= 0 || count === 0) return [];

  // Unique draws cannot exceed the number of distinct values available.
  if (opts.unique) {
    const n = Math.min(count, rangeSize);
    const pool = Array.from({ length: rangeSize }, (_, i) => lo + i);
    // Partial Fisher-Yates shuffle.
    for (let i = 0; i < n; i++) {
      const j = i + rng(rangeSize - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
  }

  return Array.from({ length: count }, () => lo + rng(rangeSize));
}

/**
 * Secure password generator. Uses crypto-strength randomness and guarantees at
 * least one character from each selected class. Pure/testable via an injectable
 * RNG. Runs entirely client-side — passwords never leave the device.
 */

export interface PasswordOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
}

const SETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?',
};

/** Returns a random integer in [0, max). Defaults to crypto randomness. */
export type RandomInt = (max: number) => number;

const cryptoRandomInt: RandomInt = (max) => {
  const arr = new Uint32Array(1);
  globalThis.crypto.getRandomValues(arr);
  return arr[0] % max;
};

function activeSets(opts: PasswordOptions): string[] {
  const sets: string[] = [];
  if (opts.upper) sets.push(SETS.upper);
  if (opts.lower) sets.push(SETS.lower);
  if (opts.digits) sets.push(SETS.digits);
  if (opts.symbols) sets.push(SETS.symbols);
  if (sets.length === 0) sets.push(SETS.lower); // never produce an empty pool
  return sets;
}

export function generatePassword(opts: PasswordOptions, rng: RandomInt = cryptoRandomInt): string {
  const sets = activeSets(opts);
  const pool = sets.join('');
  const length = Math.min(128, Math.max(Math.max(4, sets.length), Math.floor(opts.length) || 0));

  const chars: string[] = [];
  // Guarantee one character from each selected set.
  for (const set of sets) chars.push(set[rng(set.length)]);
  // Fill the rest from the combined pool.
  while (chars.length < length) chars.push(pool[rng(pool.length)]);
  // Fisher-Yates shuffle so the guaranteed chars are not in fixed positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** Approximate entropy in bits: length × log2(pool size). */
export function estimateEntropyBits(opts: PasswordOptions): number {
  const pool = activeSets(opts).join('');
  const length = Math.max(Math.max(4, activeSets(opts).length), Math.floor(opts.length) || 0);
  return Math.round(length * Math.log2(pool.length));
}

export function strengthLabel(bits: number): 'Weak' | 'Fair' | 'Strong' | 'Very strong' {
  if (bits < 40) return 'Weak';
  if (bits < 60) return 'Fair';
  if (bits < 90) return 'Strong';
  return 'Very strong';
}

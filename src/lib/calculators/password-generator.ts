/**
 * Secure password generator — crypto-strength, entirely in the browser.
 *
 * The reference offers more than four character classes: it also lets you take characters OUT —
 * the ambiguous ones that cannot be told apart when read aloud or off a screen (I l 1 L, o O 0),
 * the brackets that break shell commands and CSV files, and repeats. Those exclusions shrink the
 * pool, so they change the entropy too, and the entropy has to be computed from the pool that was
 * actually drawn from rather than the one that was offered.
 *
 * Pure and unit-tested through an injectable RNG. Nothing here touches the DOM, storage or the
 * network; a generated password exists only in the caller's hands.
 */

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  /** Drop characters that read alike: I l 1 L, o O 0, and the quote-like punctuation. */
  excludeAmbiguous: boolean;
  /** Drop < > ( ) [ ] { }, which break shells, CSV and some password fields. */
  excludeBrackets: boolean;
  /** Every character distinct. Caps the length at the size of the pool. */
  noRepeats: boolean;
}

/** The four classes, with the reference's own symbol set — all printable ASCII punctuation. */
export const CHAR_SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
} as const;

export type CharClass = keyof typeof CHAR_SETS;
export const CLASS_ORDER: readonly CharClass[] = ['lower', 'upper', 'digits', 'symbols'];

/** Characters that cannot be told apart reliably when read off a screen or dictated. */
export const AMBIGUOUS = 'iIl1L|oO0`\'";:,.';
/** Brackets, which break shell commands, CSV fields and some password inputs. */
export const BRACKETS = '<>()[]{}';

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 128;

export type RandomInt = (max: number) => number;

/** Uniform in [0, max) by rejection — a modulo would skew toward the start of the pool. */
const cryptoRandomInt: RandomInt = (max) => {
  if (max <= 0) return 0;
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
  return buffer[0] % max;
};

const clampLength = (value: number): number =>
  Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.floor(value) || 0));

/** One class's characters, after the exclusions. May be empty. */
export function setFor(name: CharClass, opts: PasswordOptions): string {
  let characters: string = CHAR_SETS[name];
  if (opts.excludeAmbiguous) characters = [...characters].filter((c) => !AMBIGUOUS.includes(c)).join('');
  if (opts.excludeBrackets) characters = [...characters].filter((c) => !BRACKETS.includes(c)).join('');
  return characters;
}

/** The classes the visitor asked for that still have characters left after the exclusions. */
export function activeSets(opts: PasswordOptions): string[] {
  return CLASS_ORDER.filter((name) => opts[name]).map((name) => setFor(name, opts)).filter((s) => s.length > 0);
}

/** Everything a character could be drawn from. */
export function buildPool(opts: PasswordOptions): string {
  return activeSets(opts).join('');
}

/**
 * A password of the requested length.
 *
 * One character is guaranteed from each selected class, then the rest come from the whole pool and
 * the lot is shuffled, so the guaranteed characters do not sit in fixed positions. With repeats
 * off, each draw is removed from the pool rather than retried — a 60-character password from a
 * 62-character pool would otherwise spend most of its time rejecting collisions.
 */
export function generatePassword(opts: PasswordOptions, rng: RandomInt = cryptoRandomInt): string {
  const sets = activeSets(opts);
  if (sets.length === 0) return '';

  const pool = sets.join('');
  const maximum = opts.noRepeats ? new Set(pool).size : MAX_LENGTH;
  const length = Math.min(clampLength(opts.length), maximum);

  const chars: string[] = [];

  if (opts.noRepeats) {
    const remaining = [...new Set(pool)];
    const take = (from: string[]): void => {
      const index = rng(from.length);
      const [picked] = from.splice(index, 1);
      chars.push(picked);
      const spot = remaining.indexOf(picked);
      if (spot !== -1) remaining.splice(spot, 1);
    };
    // One from each class first, drawn from what that class still has available.
    for (const set of sets) {
      if (chars.length >= length) break;
      const available = [...set].filter((c) => remaining.includes(c));
      if (available.length) take(available);
    }
    while (chars.length < length && remaining.length) take(remaining);
  } else {
    for (const set of sets) {
      if (chars.length >= length) break;
      chars.push(set[rng(set.length)]);
    }
    while (chars.length < length) chars.push(pool[rng(pool.length)]);
  }

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = rng(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * Entropy in bits, from the pool that was actually drawn from.
 *
 * With repeats allowed that is length × log2(pool). Without them each position has one fewer
 * choice than the last, so the bits are the sum of log2(pool − i) — genuinely fewer, and saying
 * otherwise would overstate the strength of exactly the option people pick for readability.
 */
export function estimateEntropyBits(opts: PasswordOptions): number {
  const pool = buildPool(opts);
  const distinct = new Set(pool).size;
  if (distinct === 0) return 0;
  const maximum = opts.noRepeats ? distinct : MAX_LENGTH;
  const length = Math.min(clampLength(opts.length), maximum);

  if (!opts.noRepeats) return length * Math.log2(distinct);
  let bits = 0;
  for (let i = 0; i < length; i += 1) bits += Math.log2(distinct - i);
  return bits;
}

export type Strength = 'Weak' | 'Fair' | 'Strong' | 'Very strong';

export function strengthLabel(bits: number): Strength {
  if (bits < 40) return 'Weak';
  if (bits < 60) return 'Fair';
  if (bits < 90) return 'Strong';
  return 'Very strong';
}

/** How full the strength meter is drawn, 0–100. Saturates at the "very strong" threshold. */
export function strengthPercent(bits: number): number {
  return Math.max(0, Math.min(100, Math.round((bits / 120) * 100)));
}

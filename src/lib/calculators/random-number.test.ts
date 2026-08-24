import { describe, it, expect } from 'vitest';
import { randomIntegers, type RandomInt } from './random-number';

/**
 * Random-number characterization (R18B2, Commit 1 — test-only). Freezes the EXACT
 * frozen contract of `randomIntegers` before the generator-lane migration; no module
 * change. Consolidated out of `batch-d.test.ts` (now empty and removed). Randomness is
 * pinned with an INJECTED deterministic RNG — no crypto values are asserted.
 *
 * Contract recap: integers in an INCLUSIVE range; `lo = ceil(min(min,max))`,
 * `hi = floor(max(min,max))` (so min > max is auto-SWAPPED, and decimal bounds are
 * rounded inward); `rangeSize = hi − lo + 1`; `count = max(0, floor(count) || 0)`.
 * Empty when rangeSize ≤ 0 or count === 0. Non-unique: `lo + rng(rangeSize)`, count
 * items. Unique: a partial Fisher–Yates over [lo..hi] capped at `min(count, rangeSize)`,
 * so it never hangs. The RNG contract is `(maxExclusive) => [0, maxExclusive)`; the
 * source is NOT finite-safe for a genuinely non-finite bound (the visitor binding rejects
 * those before they reach the source).
 */

const ZERO: RandomInt = () => 0; // always the lowest offset
const TOP: RandomInt = (max) => max - 1; // always the highest offset
/** 0,1,2,… mod maxExclusive — a deterministic VARYING sequence. */
function counterRng(): RandomInt {
  let k = 0;
  return (max) => k++ % max;
}

describe('random integers — basic range (deterministic RNG)', () => {
  it('is deterministic with an injected RNG (the moved batch-d cases)', () => {
    expect(randomIntegers({ min: 1, max: 10, count: 3, unique: false }, ZERO)).toEqual([1, 1, 1]);
    expect(randomIntegers({ min: 1, max: 10, count: 3, unique: true }, ZERO)).toEqual([1, 2, 3]);
  });

  it('an ordinary positive range stays within the inclusive bounds', () => {
    const out = randomIntegers({ min: 5, max: 8, count: 20, unique: false });
    expect(out.length).toBe(20);
    expect(out.every((n) => n >= 5 && n <= 8)).toBe(true);
  });

  it('a zero-inclusive range includes 0', () => {
    expect(randomIntegers({ min: 0, max: 5, count: 2, unique: false }, ZERO)).toEqual([0, 0]);
  });

  it('a negative-only range yields negative integers', () => {
    expect(randomIntegers({ min: -10, max: -1, count: 2, unique: false }, ZERO)).toEqual([-10, -10]);
    const out = randomIntegers({ min: -10, max: -1, count: 30, unique: false });
    expect(out.every((n) => n >= -10 && n <= -1)).toBe(true);
  });

  it('a range crossing zero spans both signs', () => {
    expect(randomIntegers({ min: -3, max: 3, count: 3, unique: true }, ZERO)).toEqual([-3, -2, -1]);
    const out = randomIntegers({ min: -3, max: 3, count: 50, unique: false });
    expect(out.every((n) => n >= -3 && n <= 3)).toBe(true);
  });

  it('min === max is a fixed value', () => {
    expect(randomIntegers({ min: 5, max: 5, count: 3, unique: false }, ZERO)).toEqual([5, 5, 5]);
    expect(randomIntegers({ min: 5, max: 5, count: 3, unique: true }, ZERO)).toEqual([5]); // capped at 1 distinct
  });

  it('min > max is auto-swapped (same as the ordered range)', () => {
    expect(randomIntegers({ min: 10, max: 1, count: 3, unique: false }, ZERO)).toEqual([1, 1, 1]);
    expect(randomIntegers({ min: 10, max: 1, count: 3, unique: true }, ZERO)).toEqual([1, 2, 3]);
  });

  it('the exact lower bound is reachable (rng → 0)', () => {
    expect(randomIntegers({ min: 5, max: 8, count: 2, unique: false }, ZERO)).toEqual([5, 5]);
  });

  it('the exact upper bound is reachable (rng → rangeSize − 1)', () => {
    expect(randomIntegers({ min: 5, max: 8, count: 2, unique: false }, TOP)).toEqual([8, 8]);
  });
});

describe('random integers — count', () => {
  it('count 1 returns a single number', () => {
    expect(randomIntegers({ min: 1, max: 10, count: 1, unique: false }, ZERO)).toEqual([1]);
  });

  it('an ordinary count returns exactly that many', () => {
    expect(randomIntegers({ min: 1, max: 100, count: 7, unique: false }).length).toBe(7);
  });

  it('count 0 returns an empty array (any range)', () => {
    expect(randomIntegers({ min: 1, max: 10, count: 0, unique: false })).toEqual([]);
    expect(randomIntegers({ min: 1, max: 10, count: 0, unique: true })).toEqual([]);
  });

  it('a negative count returns an empty array', () => {
    expect(randomIntegers({ min: 1, max: 10, count: -3, unique: false })).toEqual([]);
  });

  it('a decimal count is floored', () => {
    expect(randomIntegers({ min: 1, max: 10, count: 3.9, unique: false }, ZERO)).toEqual([1, 1, 1]);
    expect(randomIntegers({ min: 1, max: 10, count: 3.2, unique: false }, ZERO)).toEqual([1, 1, 1]);
  });

  it('a large count is honoured (bounded safely)', () => {
    expect(randomIntegers({ min: 1, max: 2, count: 1000, unique: false }).length).toBe(1000);
  });
});

describe('random integers — unique = false', () => {
  it('allows duplicates and returns exactly count values', () => {
    const out = randomIntegers({ min: 1, max: 3, count: 5, unique: false }, ZERO);
    expect(out).toEqual([1, 1, 1, 1, 1]); // duplicates allowed
    expect(out.length).toBe(5);
  });

  it('follows the injected sequence deterministically', () => {
    // counter: 0,1,2,0 over rangeSize 3 → lo + [0,1,2,0]
    expect(randomIntegers({ min: 1, max: 3, count: 4, unique: false }, counterRng())).toEqual([1, 2, 3, 1]);
  });

  it('keeps every value within the inclusive range', () => {
    const out = randomIntegers({ min: 20, max: 25, count: 60, unique: false });
    expect(out.every((n) => n >= 20 && n <= 25)).toBe(true);
  });
});

describe('random integers — unique = true', () => {
  it('yields no duplicates when the count is below the range size', () => {
    const out = randomIntegers({ min: 1, max: 10, count: 3, unique: true });
    expect(out.length).toBe(3);
    expect(new Set(out).size).toBe(3);
    expect(out.every((n) => n >= 1 && n <= 10)).toBe(true);
  });

  it('returns the whole range when count equals the range size', () => {
    const out = randomIntegers({ min: 1, max: 5, count: 5, unique: true });
    expect(out.length).toBe(5);
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('caps unique draws at the range size and yields distinct values (count > available)', () => {
    const out = randomIntegers({ min: 1, max: 5, count: 100, unique: true });
    expect(out.length).toBe(5); // exact cap = rangeSize
    expect(new Set(out).size).toBe(5);
  });

  it('is deterministic under an injected RNG', () => {
    expect(randomIntegers({ min: 1, max: 5, count: 4, unique: true }, ZERO)).toEqual([1, 2, 3, 4]);
  });
});

describe('random integers — source edge behavior (beyond the visitor domain)', () => {
  // The binding validates these away; here we FREEZE what the pure source actually does.
  it('rounds a decimal minimum inward (ceil)', () => {
    expect(randomIntegers({ min: 1.5, max: 5, count: 2, unique: false }, ZERO)).toEqual([2, 2]); // lo = ceil(1.5) = 2
  });

  it('rounds a decimal maximum inward (floor)', () => {
    const out = randomIntegers({ min: 1, max: 5.9, count: 30, unique: false }); // hi = floor(5.9) = 5
    expect(out.every((n) => n >= 1 && n <= 5)).toBe(true);
  });

  it('a fractional interval containing no integer is empty', () => {
    expect(randomIntegers({ min: 1.2, max: 1.8, count: 5, unique: false })).toEqual([]); // lo=2, hi=1 → rangeSize 0
  });

  it('a NaN bound is NOT finite-safe — it yields NaN entries', () => {
    const out = randomIntegers({ min: Number.NaN, max: 10, count: 3, unique: false }, ZERO);
    expect(out.length).toBe(3);
    expect(out.every((n) => Number.isNaN(n))).toBe(true);
  });

  it('a non-unique infinite bound does not throw (finite offsets via the RNG)', () => {
    expect(randomIntegers({ min: 1, max: Number.POSITIVE_INFINITY, count: 3, unique: false }, ZERO)).toEqual([1, 1, 1]);
  });

  it('a unique infinite bound throws (an unbounded pool)', () => {
    expect(() => randomIntegers({ min: 1, max: Number.POSITIVE_INFINITY, count: 3, unique: true }, ZERO)).toThrow();
  });

  it('trusts the injected RNG contract [0, maxExclusive) — an out-of-contract RNG shifts values', () => {
    // rng returning rangeSize (one past the end) → lo + rangeSize = hi + 1 (documents the contract).
    const out = randomIntegers({ min: 1, max: 5, count: 2, unique: false }, (max) => max);
    expect(out).toEqual([6, 6]); // 1 + 5
  });
});

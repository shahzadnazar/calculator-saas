import { describe, it, expect } from 'vitest';
import { randomIntegers } from './random-number';

// NOTE: Concrete cases moved to the dedicated `concrete.test.ts` (R10C1 characterization).
// NOTE: Triangle cases moved to the dedicated `triangle.test.ts` (R10D1 characterization).
// NOTE: Time arithmetic cases moved to the dedicated `time.test.ts` (R17B3 characterization).

describe('random integers', () => {
  it('is deterministic with an injected RNG', () => {
    expect(randomIntegers({ min: 1, max: 10, count: 3, unique: false }, () => 0)).toEqual([1, 1, 1]);
    expect(randomIntegers({ min: 1, max: 10, count: 3, unique: true }, () => 0)).toEqual([1, 2, 3]);
  });
  it('keeps values in range and honours count', () => {
    const out = randomIntegers({ min: 5, max: 8, count: 20, unique: false });
    expect(out.length).toBe(20);
    expect(out.every((n) => n >= 5 && n <= 8)).toBe(true);
  });
  it('caps unique draws at the range size and yields distinct values', () => {
    const out = randomIntegers({ min: 1, max: 5, count: 100, unique: true });
    expect(out.length).toBe(5);
    expect(new Set(out).size).toBe(5);
  });
});

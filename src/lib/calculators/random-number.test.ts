import { describe, it, expect } from 'vitest';
import {
  randomBelow,
  randomInRange,
  parseScaled,
  formatScaled,
  isDecimalText,
  rangeSize,
  generateRandom,
  LIMITS,
  type RandomBytes,
} from './random-number';

/** A deterministic byte source: cycles a fixed sequence, so a draw is reproducible. */
const bytesFrom = (sequence: number[]): RandomBytes => {
  let i = 0;
  return (count) => Uint8Array.from({ length: count }, () => sequence[i++ % sequence.length]);
};
const allZero: RandomBytes = (count) => new Uint8Array(count);
const allMax: RandomBytes = (count) => Uint8Array.from({ length: count }, () => 255);

describe('randomBelow', () => {
  it('returns 0 for a degenerate range rather than dividing by it', () => {
    expect(randomBelow(0n)).toBe(0n);
    expect(randomBelow(-5n)).toBe(0n);
    expect(randomBelow(1n)).toBe(0n);
  });

  it('stays inside [0, max) for every draw', () => {
    for (let i = 0; i < 200; i += 1) {
      const value = randomBelow(97n);
      expect(value).toBeGreaterThanOrEqual(0n);
      expect(value).toBeLessThan(97n);
    }
  });

  it('reaches both ends of a small range', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(randomBelow(3n).toString());
    expect(seen).toEqual(new Set(['0', '1', '2']));
  });

  it('is deterministic given a fixed byte source', () => {
    expect(randomBelow(1000000n, bytesFrom([1, 2, 3]))).toBe(randomBelow(1000000n, bytesFrom([1, 2, 3])));
  });

  /**
   * The reason this rejects rather than taking a modulo: with an all-max byte source a modulo
   * generator would return the biased tail value, and the rejection loop must not.
   */
  it('rejects the ragged tail instead of folding it back with a modulo', () => {
    // 200 needs one byte; the largest exact multiple of 200 under 256 is 200, so 255 is rejected.
    let call = 0;
    const source: RandomBytes = (count) => {
      call += 1;
      return call === 1 ? Uint8Array.from({ length: count }, () => 255) : new Uint8Array(count);
    };
    expect(randomBelow(200n, source)).toBe(0n); // the retry, not 255 % 200 = 55
    expect(call).toBe(2);
  });

  it('handles a range far past Number.MAX_SAFE_INTEGER', () => {
    const huge = 10n ** 60n;
    const value = randomBelow(huge);
    expect(value).toBeGreaterThanOrEqual(0n);
    expect(value).toBeLessThan(huge);
  });
});

describe('randomInRange', () => {
  it('is inclusive at both ends', () => {
    expect(randomInRange(5n, 5n)).toBe(5n);
    expect(randomInRange(10n, 20n, allZero)).toBe(10n);
  });

  it('does not care which way round the bounds are given', () => {
    expect(randomInRange(20n, 10n, allZero)).toBe(10n);
  });

  it('handles negatives', () => {
    const value = randomInRange(-10n, -5n);
    expect(value).toBeGreaterThanOrEqual(-10n);
    expect(value).toBeLessThanOrEqual(-5n);
  });

  it('reaches the top of the range', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) seen.add(randomInRange(1n, 4n).toString());
    expect(seen).toEqual(new Set(['1', '2', '3', '4']));
  });
});

describe('decimal text and scaled integers', () => {
  it('scales exactly, where floating point would not', () => {
    expect(parseScaled('0.2', 50)).toBe(2n * 10n ** 49n);
    expect(parseScaled('112.5', 1)).toBe(1125n);
    expect(parseScaled('7', 3)).toBe(7000n);
    expect(parseScaled('-1.25', 2)).toBe(-125n);
  });

  it('truncates past the precision rather than widening the bound', () => {
    expect(parseScaled('1.999', 1)).toBe(19n); // never 20
  });

  it('refuses what is not a decimal', () => {
    expect(parseScaled('', 2)).toBe(null);
    expect(parseScaled('abc', 2)).toBe(null);
    expect(parseScaled('1.2.3', 2)).toBe(null);
    expect(parseScaled('1e3', 2)).toBe(null);
    expect(isDecimalText('.5')).toBe(true);
    expect(isDecimalText('5.')).toBe(true);
    expect(isDecimalText('x')).toBe(false);
  });

  it('round-trips through formatScaled, keeping every requested digit', () => {
    expect(formatScaled(2n * 10n ** 49n, 50)).toBe('0.2' + '0'.repeat(49));
    expect(formatScaled(1125n, 1)).toBe('112.5');
    expect(formatScaled(-125n, 2)).toBe('-1.25');
    expect(formatScaled(42n, 0)).toBe('42');
    expect(formatScaled(5n, 3)).toBe('0.005');
  });
});

describe('generateRandom', () => {
  const base = { lower: '1', upper: '10', count: 1, precision: 0, allowDuplicates: true, sort: false };

  it('draws the asked-for count, inside the inclusive range', () => {
    const draw = generateRandom({ ...base, count: 50 });
    expect(draw.values).toHaveLength(50);
    for (const value of draw.scaled) {
      expect(value).toBeGreaterThanOrEqual(1n);
      expect(value).toBeLessThanOrEqual(10n);
    }
  });

  it('returns nothing for a count of zero rather than one value', () => {
    expect(generateRandom({ ...base, count: 0 }).values).toEqual([]);
  });

  it('returns nothing for an unreadable bound', () => {
    expect(generateRandom({ ...base, lower: 'x' }).values).toEqual([]);
  });

  it('draws distinct values when duplicates are not allowed', () => {
    const draw = generateRandom({ ...base, lower: '1', upper: '49', count: 6, allowDuplicates: false });
    expect(draw.values).toHaveLength(6);
    expect(new Set(draw.values).size).toBe(6);
  });

  it('cannot draw more distinct values than the range holds, and stops rather than spinning', () => {
    const draw = generateRandom({ ...base, lower: '1', upper: '5', count: 20, allowDuplicates: false });
    expect(draw.values).toHaveLength(5);
    expect(new Set(draw.values)).toEqual(new Set(['1', '2', '3', '4', '5']));
  });

  it('sorts numerically, not as text, when asked', () => {
    const draw = generateRandom({ ...base, lower: '1', upper: '100', count: 40, sort: true });
    for (let i = 1; i < draw.scaled.length; i += 1) {
      expect(draw.scaled[i]).toBeGreaterThanOrEqual(draw.scaled[i - 1]);
    }
  });

  it('produces decimals with exactly the requested precision', () => {
    const draw = generateRandom({ lower: '0.2', upper: '112.5', count: 3, precision: 50, allowDuplicates: true, sort: false });
    for (const value of draw.values) {
      expect(value.split('.')[1]).toHaveLength(50);
      const asNumber = Number(value);
      expect(asNumber).toBeGreaterThanOrEqual(0.2);
      expect(asNumber).toBeLessThanOrEqual(112.5);
    }
  });

  it('keeps a decimal draw exact past what a double could hold', () => {
    const draw = generateRandom({ lower: '0', upper: '1', count: 1, precision: 200, allowDuplicates: true, sort: false });
    expect(draw.values[0].split('.')[1]).toHaveLength(200);
  });

  it('handles integers of a few thousand digits', () => {
    const lower = '1' + '0'.repeat(999);
    const upper = '9'.repeat(1000);
    const draw = generateRandom({ ...base, lower, upper, count: 1 });
    expect(draw.values[0]).toMatch(/^\d+$/);
    expect(draw.scaled[0]).toBeGreaterThanOrEqual(BigInt(lower));
    expect(draw.scaled[0]).toBeLessThanOrEqual(BigInt(upper));
  });

  it('takes the bounds in either order', () => {
    const draw = generateRandom({ ...base, lower: '10', upper: '1', count: 20 });
    for (const value of draw.scaled) {
      expect(value).toBeGreaterThanOrEqual(1n);
      expect(value).toBeLessThanOrEqual(10n);
    }
  });

  it('reaches both ends of a two-value range', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(generateRandom({ ...base, lower: '0', upper: '1' }).values[0]);
    }
    expect(seen).toEqual(new Set(['0', '1']));
  });

  it('is deterministic given a fixed byte source', () => {
    const request = { ...base, lower: '1', upper: '1000000', count: 5 };
    expect(generateRandom(request, bytesFrom([7, 3, 9]))).toEqual(generateRandom(request, bytesFrom([7, 3, 9])));
  });

  it('returns the top of the range when every byte is at maximum', () => {
    // 1..8 has size 8, which divides the byte space exactly, so no draw is rejected.
    expect(generateRandom({ ...base, lower: '1', upper: '8' }, allMax).values[0]).toBe('8');
  });
});

describe('rangeSize', () => {
  const base = { lower: '1', upper: '10', count: 1, precision: 0, allowDuplicates: true, sort: false };

  it('counts the values a range holds, inclusive', () => {
    expect(rangeSize(base)).toBe(10n);
    expect(rangeSize({ ...base, lower: '5', upper: '5' })).toBe(1n);
  });

  it('counts at the requested precision', () => {
    expect(rangeSize({ ...base, lower: '0', upper: '1', precision: 2 })).toBe(101n);
  });

  it('has no answer for an unreadable bound', () => {
    expect(rangeSize({ ...base, lower: 'x' })).toBe(null);
  });
});

describe('limits', () => {
  it('states what the page promises', () => {
    expect(LIMITS.maxPrecision).toBe(999);
    expect(LIMITS.maxCount).toBe(1000);
    expect(LIMITS.maxDigits).toBe(5000);
  });
});

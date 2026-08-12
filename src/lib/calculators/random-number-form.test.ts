import { describe, it, expect } from 'vitest';
import {
  randomNumberBinding,
  validateRngSettings,
  generateRng,
  describeRngOutput,
  rngMeta,
  rngCappedNote,
  MSG,
  MIN_COUNT,
  MAX_COUNT,
  DEFAULT_MIN,
  DEFAULT_MAX,
  DEFAULT_COUNT,
  type RngSettings,
} from './random-number-form';
import type { RandomInt } from './random-number';

/**
 * Random-number binding unit tests (R18B2, Commit 2). Validation, deterministic
 * generation via the injected-RNG seam (never crypto values), description / metadata,
 * and the DOM read/reset helpers via a mock root. The randomness itself is frozen in
 * random-number.test.ts; this suite asserts the generator-binding boundary.
 */

const ZERO: RandomInt = () => 0; // lowest offset → deterministic
const settings = (s: Partial<RngSettings> = {}): RngSettings => ({
  min: '1',
  max: '100',
  count: '5',
  unique: false,
  ...s,
});

/** Minimal root: `[data-form]` whose elements.namedItem resolves the four controls. */
function mockRoot(v: Partial<{ min: string; max: string; count: string; unique: boolean }> = {}) {
  const store: Record<string, { value?: string; checked?: boolean }> = {
    min: { value: v.min ?? '' },
    max: { value: v.max ?? '' },
    count: { value: v.count ?? '' },
    unique: { checked: v.unique ?? false },
  };
  const form = { elements: { namedItem: (n: string) => store[n] ?? null } };
  const root = { querySelector: (sel: string) => (sel === '[data-form]' ? form : null) } as unknown as HTMLElement;
  return { root, store };
}

describe('rng binding — defaults', () => {
  it('exposes the source-confirmed defaults + the legacy count ceiling', () => {
    expect(DEFAULT_MIN).toBe(1);
    expect(DEFAULT_MAX).toBe(100);
    expect(DEFAULT_COUNT).toBe(5);
    expect(MIN_COUNT).toBe(1);
    expect(MAX_COUNT).toBe(1000);
  });
});

describe('rng binding — validation', () => {
  it('an ordinary range + count is valid', () => {
    expect(validateRngSettings(settings()).ok).toBe(true);
  });

  it('all-empty reports each required field', () => {
    const v = validateRngSettings(settings({ min: '', max: '', count: '' }));
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.fieldErrors?.min).toBe(MSG.minRequired);
      expect(v.fieldErrors?.max).toBe(MSG.maxRequired);
      expect(v.fieldErrors?.count).toBe(MSG.countRequired);
    }
  });

  it('rejects malformed / decimal / non-finite bounds (integer-only)', () => {
    for (const bad of ['abc', '1.5', '1e999', 'NaN', '1.2.3', 'Infinity']) {
      const v = validateRngSettings(settings({ min: bad }));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.fieldErrors?.min).toBe(MSG.minInvalid);
      const w = validateRngSettings(settings({ max: bad }));
      if (!w.ok) expect(w.fieldErrors?.max).toBe(MSG.maxInvalid);
    }
  });

  it('allows negatives and zero in the bounds', () => {
    expect(validateRngSettings(settings({ min: '-10', max: '-1' })).ok).toBe(true);
    expect(validateRngSettings(settings({ min: '-5', max: '5' })).ok).toBe(true);
    expect(validateRngSettings(settings({ min: '0', max: '0' })).ok).toBe(true);
  });

  it('min == max is valid (a fixed value)', () => {
    expect(validateRngSettings(settings({ min: '7', max: '7' })).ok).toBe(true);
  });

  it('min > max is rejected with a form-level error (no silent swap)', () => {
    const v = validateRngSettings(settings({ min: '100', max: '1' }));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.formError).toBe(MSG.rangeOrder);
  });

  it('count must be a whole number in [1, 1000]', () => {
    for (const bad of ['abc', '2.5', 'NaN']) {
      const v = validateRngSettings(settings({ count: bad }));
      if (!v.ok) expect(v.fieldErrors?.count).toBe(MSG.countInvalid);
    }
    for (const oob of ['0', '-3', '1001', '5000']) {
      const v = validateRngSettings(settings({ count: oob }));
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.fieldErrors?.count).toBe(MSG.countRange);
    }
    expect(validateRngSettings(settings({ count: '1' })).ok).toBe(true);
    expect(validateRngSettings(settings({ count: '1000' })).ok).toBe(true);
  });
});

describe('rng binding — generation (injected deterministic RNG)', () => {
  it('non-unique generation echoes the settings and yields count values', () => {
    const o = generateRng(settings({ min: '1', max: '10', count: '3', unique: false }), ZERO);
    expect(o.numbers).toEqual([1, 1, 1]);
    expect(o).toMatchObject({ min: 1, max: 10, requestedCount: 3, unique: false, capped: false });
  });

  it('unique below the range size is not capped', () => {
    const o = generateRng(settings({ min: '1', max: '10', count: '3', unique: true }), ZERO);
    expect(o.numbers).toEqual([1, 2, 3]);
    expect(o.capped).toBe(false);
  });

  it('unique above the range size is capped at the available distinct values', () => {
    const o = generateRng(settings({ min: '1', max: '5', count: '10', unique: true }), ZERO);
    expect(o.numbers).toEqual([1, 2, 3, 4, 5]);
    expect(o.requestedCount).toBe(10);
    expect(o.capped).toBe(true);
  });

  it('a negative range generates negative integers', () => {
    expect(generateRng(settings({ min: '-3', max: '3', count: '3', unique: true }), ZERO).numbers).toEqual([-3, -2, -1]);
  });

  it('production generation (crypto) stays within bounds, honours count, and yields only integers', () => {
    const o = generateRng(settings({ min: '5', max: '8', count: '30', unique: false }));
    expect(o.numbers.length).toBe(30);
    expect(o.numbers.every((n) => Number.isInteger(n) && n >= 5 && n <= 8)).toBe(true);
    expect(o.capped).toBe(false);
  });

  it('production unique generation has no duplicates', () => {
    const o = generateRng(settings({ min: '1', max: '20', count: '20', unique: true }));
    expect(o.numbers.length).toBe(20);
    expect(new Set(o.numbers).size).toBe(20);
  });
});

describe('rng binding — description + metadata', () => {
  it('announces the count with correct grammar', () => {
    expect(describeRngOutput(generateRng(settings({ count: '3' }), ZERO))).toBe('Generated 3 random numbers.');
    expect(describeRngOutput(generateRng(settings({ count: '1' }), ZERO))).toBe('Generated 1 random number.');
  });

  it('metadata reflects the mode + range', () => {
    expect(rngMeta(generateRng(settings({ min: '1', max: '10', count: '4', unique: false }), ZERO))).toBe(
      '4 numbers from 1 to 10 · repeats allowed',
    );
    expect(rngMeta(generateRng(settings({ min: '1', max: '10', count: '4', unique: true }), ZERO))).toBe(
      '4 numbers from 1 to 10 · no repeats',
    );
  });

  it('the capped note explains the unique shortfall', () => {
    const o = generateRng(settings({ min: '1', max: '5', count: '10', unique: true }), ZERO);
    expect(rngCappedNote(o)).toBe('Only 5 unique whole numbers exist between 1 and 5, so 5 were generated instead of 10.');
  });
});

describe('rng binding — DOM read / reset', () => {
  it('readSettings reads all four controls', () => {
    const { root } = mockRoot({ min: '-2', max: '9', count: '7', unique: true });
    expect(randomNumberBinding.readSettings(root)).toEqual({ min: '-2', max: '9', count: '7', unique: true });
  });

  it('resetSettings restores the source-confirmed defaults and clears unique', () => {
    const { root, store } = mockRoot({ min: '50', max: '80', count: '20', unique: true });
    randomNumberBinding.resetSettings(root);
    expect(store.min.value).toBe('1');
    expect(store.max.value).toBe('100');
    expect(store.count.value).toBe('5');
    expect(store.unique.checked).toBe(false);
  });
});

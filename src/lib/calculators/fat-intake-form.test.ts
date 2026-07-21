import { describe, it, expect } from 'vitest';
import {
  validateFatIntakeValues,
  computeFatIntake,
  describeFatIntakeResult,
  isUsableFatRange,
  fatIntakeBinding,
  FAT_BANDS,
  type FatIntakeValues,
} from './fat-intake-form';

const values = (calories: string): FatIntakeValues => ({ calories });

describe('fat-intake-form — validation', () => {
  it('accepts a positive calorie target', () => {
    expect(validateFatIntakeValues(values('2000'))).toEqual({ ok: true });
  });

  it('requires a calorie target (empty)', () => {
    const r = validateFatIntakeValues(values(''));
    expect(!r.ok && r.fieldErrors?.calories).toBe('Enter your daily calorie target.');
  });

  it('rejects a non-positive or non-numeric target', () => {
    for (const bad of ['0', '-100', 'abc']) {
      const r = validateFatIntakeValues(values(bad));
      expect(!r.ok && r.fieldErrors?.calories).toBe('Enter a calorie target greater than zero.');
    }
  });

  it('rejects a target so low the range would round to non-positive grams (no clamp)', () => {
    // cal 22 → min round(0.489) = 0 → unusable range.
    const r = validateFatIntakeValues(values('22'));
    expect(!r.ok && r.formError).toBe(
      'This calorie target is too low to estimate a daily fat range. Enter your full daily calorie target.',
    );
    // cal 23 → min round(0.511) = 1 → usable.
    expect(validateFatIntakeValues(values('23')).ok).toBe(true);
  });
});

describe('fat-intake-form — compute + result semantics', () => {
  it('returns the reviewed range plus the calorie basis', () => {
    const r = computeFatIntake(values('2000'));
    expect(r.minGrams).toBe(44);
    expect(r.moderateGrams).toBe(61);
    expect(r.maxGrams).toBe(78);
    expect(r.calories).toBe(2000);
  });

  it('resultValue exposes the lower bound when usable, NaN when not', () => {
    expect(fatIntakeBinding.resultValue(computeFatIntake(values('2000')))).toBe(44);
    expect(Number.isNaN(fatIntakeBinding.resultValue(computeFatIntake(values('22'))))).toBe(true);
  });

  it('isUsableFatRange requires finite, positive, ordered bounds', () => {
    expect(isUsableFatRange({ minGrams: 44, moderateGrams: 61, maxGrams: 78 })).toBe(true);
    expect(isUsableFatRange({ minGrams: 0, moderateGrams: 0, maxGrams: 1 })).toBe(false);
    expect(isUsableFatRange({ minGrams: 0, moderateGrams: 0, maxGrams: 0 })).toBe(false);
  });
});

describe('fat-intake-form — announcement (range only)', () => {
  it('announces the primary range, never the breakdown', () => {
    const text = describeFatIntakeResult(computeFatIntake(values('2000')));
    expect(text).toBe('Your estimated daily fat intake is 44 to 78 grams per day.');
    expect(text).not.toMatch(/27\.5|Moderate|Lower|Upper/);
  });
});

describe('fat-intake-form — AMDR bands for the breakdown skeleton', () => {
  it('labels the bands as range positions (midpoint, not a recommendation)', () => {
    expect(FAT_BANDS).toEqual([
      { key: 'min', label: 'Lower end of range (20%)', field: 'minGrams' },
      { key: 'mod', label: 'Midpoint of range (27.5%)', field: 'moderateGrams' },
      { key: 'max', label: 'Upper end of range (35%)', field: 'maxGrams' },
    ]);
    // 27.5% must never be framed as a separate recommendation.
    for (const b of FAT_BANDS) expect(b.label).not.toMatch(/recommended|ideal|optimal|required|moderate/i);
  });
});

describe('fat-intake-form — describeResult ignores the transition context (non-transition binding)', () => {
  it('produces the same range announcement regardless of phase / previous result', () => {
    const r = computeFatIntake(values('2000'));
    const other = computeFatIntake(values('2500'));
    const first = fatIntakeBinding.describeResult(r, { phase: 'first-result' });
    const live = fatIntakeBinding.describeResult(r, { phase: 'live-update', previousResult: other });
    expect(first).toBe('Your estimated daily fat intake is 44 to 78 grams per day.');
    expect(live).toBe(first);
  });
});

import { describe, it, expect } from 'vitest';
import {
  validateTargetHeartRateValues,
  computeTargetHeartRate,
  describeTargetHeartRateResult,
  targetHeartRateBinding,
  HEART_RATE_ZONES,
  AGE_MIN,
  AGE_MAX,
  type TargetHeartRateValues,
} from './target-heart-rate-form';

const values = (age: string, restingHr = ''): TargetHeartRateValues => ({ age, restingHr });

describe('target-heart-rate-form — validation', () => {
  it('accepts a whole age with no resting heart rate (simple % method)', () => {
    expect(validateTargetHeartRateValues(values('30'))).toEqual({ ok: true });
  });

  it('accepts a whole age with a valid resting heart rate below max', () => {
    expect(validateTargetHeartRateValues(values('30', '60'))).toEqual({ ok: true });
  });

  it('requires an age (empty)', () => {
    const r = validateTargetHeartRateValues(values(''));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.fieldErrors?.age).toBe('Enter your age.');
  });

  it('rejects a non-whole age', () => {
    const r = validateTargetHeartRateValues(values('30.5'));
    expect(!r.ok && r.fieldErrors?.age).toBe('Enter your age in whole years.');
  });

  it('rejects a non-numeric age', () => {
    const r = validateTargetHeartRateValues(values('abc'));
    expect(!r.ok && r.fieldErrors?.age).toBe('Enter your age in whole years.');
  });

  it('rejects a zero or negative age as non-whole-positive', () => {
    expect(!validateTargetHeartRateValues(values('0')).ok).toBe(true);
    expect(!validateTargetHeartRateValues(values('-5')).ok).toBe(true);
  });

  it('enforces the age range boundaries', () => {
    expect(validateTargetHeartRateValues(values(String(AGE_MIN))).ok).toBe(true);
    expect(validateTargetHeartRateValues(values(String(AGE_MAX))).ok).toBe(true);
    const over = validateTargetHeartRateValues(values(String(AGE_MAX + 1)));
    expect(!over.ok && over.fieldErrors?.age).toBe(`Enter an age from ${AGE_MIN} to ${AGE_MAX} years.`);
  });

  it('rejects a non-whole resting heart rate', () => {
    const r = validateTargetHeartRateValues(values('30', '60.5'));
    expect(!r.ok && r.fieldErrors?.restingHr).toBe(
      'Enter your resting heart rate in whole beats per minute, or leave it blank.',
    );
  });

  it('rejects a resting heart rate at or above the maximum (would invert the zones)', () => {
    // age 30 → maxHr 190; resting 190 is not below the maximum.
    const r = validateTargetHeartRateValues(values('30', '190'));
    expect(!r.ok && r.fieldErrors?.restingHr).toBe('Enter a resting heart rate below your maximum of 190 bpm.');
    // 189 is allowed (strictly below).
    expect(validateTargetHeartRateValues(values('30', '189')).ok).toBe(true);
  });

  it('does not run the cross-field max check when the age itself is invalid', () => {
    const r = validateTargetHeartRateValues(values('', '300'));
    expect(!r.ok && r.fieldErrors?.age).toBe('Enter your age.');
    expect(!r.ok && r.fieldErrors?.restingHr).toBeUndefined();
  });
});

describe('target-heart-rate-form — compute', () => {
  it('uses the simple-percentage method with no resting heart rate', () => {
    const r = computeTargetHeartRate(values('30'));
    expect(r.maxHr).toBe(190);
    expect(r.usedKarvonen).toBe(false);
    expect(r.restingHr).toBeNull();
    expect(r.zones[0].low).toBe(95); // simple: round(190·0.5)
  });

  it('uses the Karvonen method when a resting heart rate is supplied', () => {
    const r = computeTargetHeartRate(values('30', '60'));
    expect(r.maxHr).toBe(190);
    expect(r.usedKarvonen).toBe(true);
    expect(r.restingHr).toBe(60);
    expect(r.zones[0].low).toBe(125); // Karvonen: round((190−60)·0.5 + 60)
  });

  it('resultValue exposes the maximum heart rate as the guarded magnitude', () => {
    expect(targetHeartRateBinding.resultValue(computeTargetHeartRate(values('40')))).toBe(180);
  });
});

describe('target-heart-rate-form — announcement', () => {
  it('is concise and names the simple method span', () => {
    const text = describeTargetHeartRateResult(computeTargetHeartRate(values('30')));
    expect(text).toBe(
      'Your estimated maximum heart rate is 190 beats per minute. Training zones span 95 to 190 beats per minute.',
    );
  });

  it('names the Karvonen method when a resting heart rate is used', () => {
    const text = describeTargetHeartRateResult(computeTargetHeartRate(values('30', '60')));
    expect(text).toContain('using the Karvonen method with your resting heart rate');
    expect(text).toContain('Training zones span 125 to 190');
  });
});

describe('target-heart-rate-form — zone identity for the static skeleton', () => {
  it('exposes the five documented zones (age-invariant), matching the pure module', () => {
    expect(HEART_RATE_ZONES).toEqual([
      { name: 'Warm up / recovery', lowPct: 50, highPct: 60 },
      { name: 'Fat burn (light)', lowPct: 60, highPct: 70 },
      { name: 'Aerobic (moderate)', lowPct: 70, highPct: 80 },
      { name: 'Anaerobic (hard)', lowPct: 80, highPct: 90 },
      { name: 'Maximum effort', lowPct: 90, highPct: 100 },
    ]);
  });
});

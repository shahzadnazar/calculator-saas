import { describe, it, expect } from 'vitest';
import {
  validateTargetHeartRateValues,
  computeTargetHeartRate,
  targetHeartRateAnnouncement,
  targetHeartRateBinding,
  methodOf,
  METHOD_IDENTITY,
  METHOD_CHANGE_ANNOUNCEMENT,
  HEART_RATE_ZONES,
  MAX_AGE_EXCLUSIVE,
  type TargetHeartRateValues,
} from './target-heart-rate-form';

const values = (age: string, restingHr = ''): TargetHeartRateValues => ({ age, restingHr });

describe('target-heart-rate-form — age semantics (whole, > 0, < 220)', () => {
  it('accepts a whole age with no resting heart rate', () => {
    expect(validateTargetHeartRateValues(values('30'))).toEqual({ ok: true });
  });

  it('requires an age (empty)', () => {
    const r = validateTargetHeartRateValues(values(''));
    expect(!r.ok && r.fieldErrors?.age).toBe('Enter your age.');
  });

  it('rejects a non-whole age', () => {
    expect(!validateTargetHeartRateValues(values('30.5')).ok).toBe(true);
    const r = validateTargetHeartRateValues(values('abc'));
    expect(!r.ok && r.fieldErrors?.age).toBe('Enter your age in whole years.');
  });

  it('rejects a zero or negative age as greater-than-zero', () => {
    const zero = validateTargetHeartRateValues(values('0'));
    expect(!zero.ok && zero.fieldErrors?.age).toBe('Enter an age greater than zero.');
    expect(!validateTargetHeartRateValues(values('-5')).ok).toBe(true);
  });

  it('accepts ages up to 219 and rejects 220+ (max HR would be 0) — no narrower cap', () => {
    expect(validateTargetHeartRateValues(values('1')).ok).toBe(true);
    expect(validateTargetHeartRateValues(values('119')).ok).toBe(true); // the old arbitrary 120 cap is gone
    expect(validateTargetHeartRateValues(values('219')).ok).toBe(true);
    const at = validateTargetHeartRateValues(values(String(MAX_AGE_EXCLUSIVE))); // 220
    expect(!at.ok && at.fieldErrors?.age).toBe('Enter an age below 220 years.');
    expect(!validateTargetHeartRateValues(values('221')).ok).toBe(true);
  });
});

describe('target-heart-rate-form — resting-HR semantics (empty ≠ zero)', () => {
  it('empty resting HR is valid and selects the SIMPLE method', () => {
    expect(validateTargetHeartRateValues(values('30', '')).ok).toBe(true);
    expect(computeTargetHeartRate(values('30', '')).usedKarvonen).toBe(false);
  });

  it('an entered 0 is INVALID (not treated as empty)', () => {
    const r = validateTargetHeartRateValues(values('30', '0'));
    expect(!r.ok && r.fieldErrors?.restingHr).toBe(
      'Enter a resting heart rate greater than zero, or leave it blank.',
    );
  });

  it('a valid resting HR is valid and selects the KARVONEN method', () => {
    expect(validateTargetHeartRateValues(values('30', '60')).ok).toBe(true);
    expect(computeTargetHeartRate(values('30', '60')).usedKarvonen).toBe(true);
  });

  it('a non-whole resting HR is rejected', () => {
    const r = validateTargetHeartRateValues(values('30', '60.5'));
    expect(!r.ok && r.fieldErrors?.restingHr).toBe(
      'Enter your resting heart rate in whole beats per minute, or leave it blank.',
    );
  });

  it('a resting HR EQUAL to the maximum is invalid (would flatten/invert the zones)', () => {
    // age 30 → maxHr 190.
    const r = validateTargetHeartRateValues(values('30', '190'));
    expect(!r.ok && r.fieldErrors?.restingHr).toBe('Enter a resting heart rate below your maximum of 190 bpm.');
  });

  it('a resting HR GREATER than the maximum is invalid; one below is valid', () => {
    expect(!validateTargetHeartRateValues(values('30', '191')).ok).toBe(true);
    expect(validateTargetHeartRateValues(values('30', '189')).ok).toBe(true);
  });

  it('does not run the cross-field max check when the age itself is invalid', () => {
    const r = validateTargetHeartRateValues(values('', '300'));
    expect(!r.ok && r.fieldErrors?.age).toBe('Enter your age.');
    expect(!r.ok && r.fieldErrors?.restingHr).toBeUndefined();
  });
});

describe('target-heart-rate-form — compute + method', () => {
  it('simple method: no resting HR', () => {
    const r = computeTargetHeartRate(values('30'));
    expect(r.maxHr).toBe(190);
    expect(r.usedKarvonen).toBe(false);
    expect(r.restingHr).toBeNull();
    expect(r.zones[0].low).toBe(95); // round(190·0.5)
    expect(methodOf(r)).toBe('simple');
  });

  it('Karvonen method: resting HR supplied', () => {
    const r = computeTargetHeartRate(values('30', '60'));
    expect(r.maxHr).toBe(190);
    expect(r.usedKarvonen).toBe(true);
    expect(r.restingHr).toBe(60);
    expect(r.zones[0].low).toBe(125); // round((190−60)·0.5 + 60)
    expect(methodOf(r)).toBe('karvonen');
  });

  it('resultValue exposes the maximum heart rate as the guarded magnitude', () => {
    expect(targetHeartRateBinding.resultValue(computeTargetHeartRate(values('40')))).toBe(180);
  });

  it('visible method identity names each method precisely (never simple as Karvonen)', () => {
    expect(METHOD_IDENTITY.simple).toBe('Percentage of estimated maximum heart rate');
    expect(METHOD_IDENTITY.karvonen).toBe('Karvonen heart-rate-reserve method');
  });
});

describe('target-heart-rate-form — announcement (pure)', () => {
  const simple = computeTargetHeartRate(values('30'));
  const karvonen = computeTargetHeartRate(values('30', '60'));

  it('an initial result speaks the standard max-HR + span line (both methods)', () => {
    expect(targetHeartRateAnnouncement(simple, null)).toBe(
      'Your estimated maximum heart rate is 190 beats per minute. Training zones span 95 to 190 beats per minute.',
    );
    expect(targetHeartRateAnnouncement(karvonen, null)).toBe(
      'Your estimated maximum heart rate is 190 beats per minute. Training zones span 125 to 190 beats per minute, using the Karvonen method with your resting heart rate.',
    );
  });

  it('switching methods after a first result speaks the concise method-change line', () => {
    expect(targetHeartRateAnnouncement(karvonen, 'simple')).toBe(METHOD_CHANGE_ANNOUNCEMENT.karvonen);
    expect(targetHeartRateAnnouncement(simple, 'karvonen')).toBe(METHOD_CHANGE_ANNOUNCEMENT.simple);
  });

  it('a same-method update keeps the standard line (not a method-change line)', () => {
    expect(targetHeartRateAnnouncement(simple, 'simple')).toContain('Your estimated maximum heart rate is 190');
    expect(targetHeartRateAnnouncement(karvonen, 'karvonen')).toContain('using the Karvonen method');
  });

  it('the method-change lines never announce the zone table', () => {
    for (const text of Object.values(METHOD_CHANGE_ANNOUNCEMENT)) {
      expect(text).not.toMatch(/Fat burn|Aerobic|Anaerobic|Warm up/);
    }
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

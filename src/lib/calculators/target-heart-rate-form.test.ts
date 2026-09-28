import { describe, it, expect } from 'vitest';
import {
  MSG,
  MAX_HR_MODES,
  MHR_FORMULAS,
  INTENSITY_SCALES,
  INTENSITY_BANDS,
  AGE_MIN,
  AGE_MAX,
  MAX_HR_MIN,
  MAX_HR_MAX,
  RESTING_MIN,
  RESTING_MAX,
  ageError,
  measuredMaxError,
  restingError,
  validateTargetHeartRateValues,
  computeTargetHeartRate,
  completeTargetHeartRateValue,
  describeTargetHeartRateResult,
  basisPhrase,
  headline,
  basisLine,
  targetHeartRateBinding,
  TARGET_HEART_RATE_EXAMPLE_VALUES,
  type TargetHeartRateValues,
} from './target-heart-rate-form';

/**
 * The binding's pure surface. The zones live in the reviewed pure `target-heart-rate.ts`;
 * here we pin the two entry modes, the optional resting rate, the headline wording and the
 * whole-report guard.
 */

const base: TargetHeartRateValues = {
  mode: 'age',
  age: '30',
  measuredMaxHr: '',
  restingHr: '70',
  formula: 'haskell-fox',
  scale: 'karvonen',
};
const v = (over: Partial<TargetHeartRateValues> = {}): TargetHeartRateValues => ({ ...base, ...over });

describe('the reference case', () => {
  const r = computeTargetHeartRate(v());

  it('reproduces its headline sentence word for word', () => {
    expect(headline(r)).toBe(
      'Target heart rate during aerobic exercise: 130 to 172 bpm (50 - 85% of heart rate reserve).',
    );
  });

  it('reproduces its five rows', () => {
    expect(r.zones.map((z) => `${z.label} | ${z.scaleLabel} | ${z.low} - ${z.high}`)).toEqual([
      'Very light | 50 - 60% | 130 - 142',
      'Light | 60 - 70% | 142 - 154',
      'Moderate | 70 - 80% | 154 - 166',
      'Hard | 80 - 90% | 166 - 178',
      'VO₂ Max (maximum) | 90 - 100% | 178 - 190',
    ]);
  });

  it('shows the maximum and the reserve it worked from', () => {
    expect(r.maxHr).toBe(190);
    expect(r.reserve).toBe(120);
  });
});

describe('the two ways to get a maximum heart rate', () => {
  it('are the reference’s two, in its order', () => {
    expect(MAX_HR_MODES.map((m) => m.label)).toEqual(['Estimate from age', 'Test result']);
  });

  it('a measured maximum is used instead of the equation', () => {
    const r = computeTargetHeartRate(v({ mode: 'test', age: '30', measuredMaxHr: '200' }));
    expect(r.maxHr).toBe(200);
    expect(r.reserve).toBe(130);
  });

  it('each mode reads only its own box', () => {
    // An age left behind in the form must not reach a test-result calculation, or vice versa.
    expect(computeTargetHeartRate(v({ mode: 'test', age: '70', measuredMaxHr: '200' })).maxHr).toBe(200);
    expect(computeTargetHeartRate(v({ mode: 'age', age: '30', measuredMaxHr: '200' })).maxHr).toBe(190);
  });

  it('validates only the box the mode is using', () => {
    expect(validateTargetHeartRateValues(v({ mode: 'age', measuredMaxHr: '' })).ok).toBe(true);
    expect(validateTargetHeartRateValues(v({ mode: 'test', age: '', measuredMaxHr: '190' })).ok).toBe(true);
    const missing = validateTargetHeartRateValues(v({ mode: 'test', measuredMaxHr: '' }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.fieldErrors!.measuredMaxHr).toBe(MSG.maxMissing);
  });
});

describe('validation', () => {
  it('age is required, whole and in range', () => {
    expect(ageError('')).toBe(MSG.ageMissing);
    expect(ageError('30.5')).toBe(MSG.ageWhole);
    expect(ageError('x')).toBe(MSG.ageWhole);
    expect(ageError(String(AGE_MAX + 1))).toBe(MSG.ageRange);
    expect(ageError(String(AGE_MIN))).toBe(null);
  });

  it('a measured maximum must be a plausible heart rate', () => {
    expect(measuredMaxError('')).toBe(MSG.maxMissing);
    expect(measuredMaxError(String(MAX_HR_MIN - 1))).toBe(MSG.maxRange);
    expect(measuredMaxError(String(MAX_HR_MAX + 1))).toBe(MSG.maxRange);
    expect(measuredMaxError('abc')).toBe(MSG.maxRange);
    expect(measuredMaxError('190')).toBe(null);
  });

  it('a resting rate is optional, but a nonsense one is still refused', () => {
    expect(restingError('')).toBe(null);
    expect(restingError('   ')).toBe(null);
    expect(restingError('70')).toBe(null);
    expect(restingError(String(RESTING_MIN - 1))).toBe(MSG.restingRange);
    expect(restingError(String(RESTING_MAX + 1))).toBe(MSG.restingRange);
    expect(restingError('abc')).toBe(MSG.restingRange);
  });

  it('an empty form fails on the box the mode is using', () => {
    const r = validateTargetHeartRateValues(v({ age: '', restingHr: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors!.age).toBe(MSG.ageMissing);
  });
});

describe('the resting rate changes what the percentages are OF', () => {
  it('says "heart rate reserve" when it has one', () => {
    expect(basisPhrase(computeTargetHeartRate(v()))).toBe('heart rate reserve');
  });

  it('says "maximum heart rate" when it does not, and the numbers follow', () => {
    const r = computeTargetHeartRate(v({ restingHr: '' }));
    expect(basisPhrase(r)).toBe('maximum heart rate');
    expect([r.aerobicLow, r.aerobicHigh]).toEqual([95, 162]);
    expect(headline(r)).toBe(
      'Target heart rate during aerobic exercise: 95 to 162 bpm (50 - 85% of maximum heart rate).',
    );
  });

  it('never quietly reports one basis while using the other', () => {
    for (const resting of ['', '40', '70']) {
      const r = computeTargetHeartRate(v({ restingHr: resting }));
      expect(headline(r)).toContain(basisPhrase(r));
      expect(r.usesReserve).toBe(basisPhrase(r) === 'heart rate reserve');
    }
  });
});

describe('the settings', () => {
  it('offer the three equations and the three scales', () => {
    expect(MHR_FORMULAS).toHaveLength(3);
    expect(INTENSITY_SCALES).toHaveLength(3);
    expect(INTENSITY_BANDS).toHaveLength(5);
  });

  it('the equation moves every zone', () => {
    expect(computeTargetHeartRate(v({ formula: 'tanaka' })).maxHr).toBe(187);
    expect(computeTargetHeartRate(v({ formula: 'nes' })).maxHr).toBe(192);
  });

  it('the scale moves no bpm at all', () => {
    const bpm = (scale: TargetHeartRateValues['scale']) =>
      computeTargetHeartRate(v({ scale })).zones.map((z) => [z.low, z.high]);
    expect(bpm('borg')).toEqual(bpm('karvonen'));
    expect(bpm('borg-cr10')).toEqual(bpm('karvonen'));
  });
});

describe('completeTargetHeartRateValue — the whole report or nothing', () => {
  it('is finite for a complete entry, in either mode', () => {
    expect(Number.isFinite(completeTargetHeartRateValue(computeTargetHeartRate(v())))).toBe(true);
    expect(
      Number.isFinite(completeTargetHeartRateValue(computeTargetHeartRate(v({ mode: 'test', measuredMaxHr: '190' })))),
    ).toBe(true);
  });

  it('is NaN with neither an age nor a measurement', () => {
    expect(Number.isNaN(completeTargetHeartRateValue(computeTargetHeartRate(v({ age: '' }))))).toBe(true);
    expect(
      Number.isNaN(completeTargetHeartRateValue(computeTargetHeartRate(v({ mode: 'test', measuredMaxHr: '' })))),
    ).toBe(true);
  });
});

describe('speech', () => {
  it('announces the aerobic span only, never the table', () => {
    const s = describeTargetHeartRateResult(computeTargetHeartRate(v()));
    expect(s).toBe('Your target heart rate for aerobic exercise is 130 to 172 beats per minute.');
    expect(s).not.toMatch(/very light|vo2|karvonen/i);
  });
});

describe('the labelled example', () => {
  it('is the reference’s case, at its default equation and scale', () => {
    expect(TARGET_HEART_RATE_EXAMPLE_VALUES).toEqual({
      mode: 'age',
      age: '30',
      measuredMaxHr: '',
      restingHr: '70',
      formula: 'haskell-fox',
      scale: 'karvonen',
    });
    expect(validateTargetHeartRateValues(TARGET_HEART_RATE_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(computeTargetHeartRate(TARGET_HEART_RATE_EXAMPLE_VALUES).aerobicLow).toBe(130);
  });
});

describe('the binding wires the pure parts together', () => {
  it('gates the result on the complete-report guard', () => {
    expect(targetHeartRateBinding.resultValue).toBe(completeTargetHeartRateValue);
    expect(targetHeartRateBinding.validate).toBe(validateTargetHeartRateValues);
    expect(targetHeartRateBinding.compute).toBe(computeTargetHeartRate);
  });
});

describe('basisLine — what the dominant figure is a percentage OF', () => {
  it('names the reserve and where it came from', () => {
    expect(basisLine(computeTargetHeartRate(v()))).toBe(
      '50 - 85% of your heart rate reserve — the gap between your maximum of 190 bpm and your resting rate.',
    );
  });

  it('names the maximum instead, and offers the better method, when there is no resting rate', () => {
    expect(basisLine(computeTargetHeartRate(v({ restingHr: '' })))).toBe(
      '50 - 85% of your maximum heart rate of 190 bpm. Add a resting heart rate for the more personal Karvonen figure.',
    );
  });

  it('never repeats the dominant figure the panel already shows', () => {
    const r = computeTargetHeartRate(v());
    expect(basisLine(r)).not.toContain(String(r.aerobicLow));
    expect(basisLine(r)).not.toContain(String(r.aerobicHigh));
  });

  it('says the same thing the reference sentence says, between them', () => {
    for (const resting of ['', '70']) {
      const r = computeTargetHeartRate(v({ restingHr: resting }));
      expect(headline(r)).toContain(`${r.aerobicLow} to ${r.aerobicHigh} bpm`);
      expect(basisLine(r)).toContain(basisPhrase(r));
    }
  });
});

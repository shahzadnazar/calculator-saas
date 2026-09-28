import { describe, it, expect } from 'vitest';
import {
  MSG,
  ACTIVITY_BANDS,
  ACTIVITY_BAND_NOTES,
  DEFAULT_ACTIVITY,
  MINIMUM_DAILY_CALORIES,
  ageError,
  activityError,
  bodyFatError,
  validateCalorieValues,
  computeCalories,
  completeCalorieValue,
  describeCalorieResult,
  formatCalories,
  isUsableCalories,
  rateFor,
  minimumWarning,
  calorieBinding,
  metricToImperial,
  imperialToMetric,
  CALORIE_EXAMPLE_VALUES,
  type CalorieValues,
} from './calorie-form';

/**
 * The binding's pure surface. The report itself lives in the reviewed pure `calorie.ts`;
 * here we pin what the binding adds — the age, activity and body-fat gates, the unit-aware
 * rate labels and warning, the whole-report guard, and Metric/US conversion.
 */

const base: CalorieValues = {
  system: 'metric',
  sex: 'male',
  age: '25',
  heightCm: '180',
  weightKg: '65',
  heightFt: '',
  heightIn: '',
  weightLb: '',
  activity: '1.465',
  formula: 'mifflin',
  bodyFatPct: '',
};
const metric = (over: Partial<CalorieValues> = {}): CalorieValues => ({ ...base, ...over });
const us = (over: Partial<CalorieValues> = {}): CalorieValues => ({
  ...base,
  system: 'imperial',
  heightCm: '',
  weightKg: '',
  heightFt: '5',
  heightIn: '10',
  weightLb: '165',
  ...over,
});
const by = (v: CalorieValues, key: string) => computeCalories(v).goals.find((g) => g.key === key)!;

describe('the reference report reproduces exactly', () => {
  it('Metric: 25, male, 180 cm, 65 kg, Moderate → maintain 2,425', () => {
    const r = computeCalories(metric());
    expect(r.maintenance).toBe(2425);
    expect(formatCalories(r.maintenance)).toBe('2,425');
  });

  it('prints the reference’s four loss rows with their percentages', () => {
    expect(by(metric(), 'maintain')).toMatchObject({ calories: 2425, percent: 100 });
    expect(by(metric(), 'mild-loss')).toMatchObject({ calories: 2175, percent: 90 });
    expect(by(metric(), 'loss')).toMatchObject({ calories: 1925, percent: 79 });
    expect(by(metric(), 'extreme-loss')).toMatchObject({ calories: 1425, percent: 59 });
  });

  it('prints the three gain rows behind the disclosure', () => {
    expect(by(metric(), 'mild-gain')).toMatchObject({ calories: 2675, percent: 110 });
    expect(by(metric(), 'gain')).toMatchObject({ calories: 2925, percent: 121 });
    expect(by(metric(), 'fast-gain')).toMatchObject({ calories: 3425, percent: 141 });
  });
});

describe('the unit system changes the labels, never the arithmetic', () => {
  it('writes the same delta as kg/week or lb/week', () => {
    const row = { rateMetric: '0.5 kg/week', rateImperial: '1 lb/week' };
    expect(rateFor(row, 'metric')).toBe('0.5 kg/week');
    expect(rateFor(row, 'imperial')).toBe('1 lb/week');
  });

  it('worded the same way in the doctor warning', () => {
    expect(minimumWarning('metric')).toContain('1 kg or more per week');
    expect(minimumWarning('imperial')).toContain('2 lb or more per week');
    for (const s of ['metric', 'imperial'] as const) {
      expect(minimumWarning(s)).toContain('1,500 calories a day');
    }
  });

  it('the same body in either system produces the same calories', () => {
    // 180 cm / 65 kg is 5 ft 11 in / 143.3 lb; entering that in US units must agree.
    const inMetric = computeCalories(metric()).maintenance;
    const inUs = computeCalories(us({ heightFt: '5', heightIn: '11', weightLb: '143.3' })).maintenance;
    expect(Math.abs(inMetric - inUs)).toBeLessThanOrEqual(3);
  });

  it('the warning only fires when the report actually goes below the minimum', () => {
    expect(computeCalories(metric()).belowMinimum).toBe(true); // 1,425
    // A larger, more active body's extreme rate stays above 1,500.
    const bigger = computeCalories(metric({ weightKg: '95', activity: '1.9' }));
    expect(bigger.goals.find((g) => g.key === 'extreme-loss')!.calories).toBeGreaterThan(MINIMUM_DAILY_CALORIES);
    expect(bigger.belowMinimum).toBe(false);
  });
});

describe('activity', () => {
  it('offers the six shared bands, defaulting to Moderate', () => {
    expect(ACTIVITY_BANDS).toHaveLength(6);
    expect(DEFAULT_ACTIVITY).toBe(1.465);
    expect(activityError(String(DEFAULT_ACTIVITY))).toBe(null);
  });

  it('refuses a multiplier that is not one of the six', () => {
    expect(activityError('1.3')).toBe(MSG.activityMissing);
    expect(activityError('')).toBe(MSG.activityMissing);
    expect(activityError('abc')).toBe(MSG.activityMissing);
    for (const b of ACTIVITY_BANDS) expect(activityError(String(b.value))).toBe(null);
  });

  it('actually moves the answer', () => {
    const sedentary = computeCalories(metric({ activity: '1.2' })).maintenance;
    const extra = computeCalories(metric({ activity: '1.9' })).maintenance;
    expect(sedentary).toBe(1986); // 1655 × 1.2
    expect(extra).toBe(3145); // 1655 × 1.9
  });

  it('carries the footnotes that define its terms', () => {
    expect(ACTIVITY_BAND_NOTES).toHaveLength(3);
  });
});

describe('age and body fat', () => {
  it('age is required, whole, and inside 15–80', () => {
    expect(ageError('')).toBe(MSG.ageMissing);
    expect(ageError('25.5')).toBe(MSG.ageWhole);
    expect(ageError('14')).toBe(MSG.ageRange);
    expect(ageError('81')).toBe(MSG.ageRange);
    expect(ageError('15')).toBe(null);
  });

  it('body fat is asked for only by Katch-McArdle', () => {
    expect(bodyFatError('mifflin', '')).toBe(null);
    expect(bodyFatError('katch-mcardle', '')).toBe(MSG.bodyFatMissing);
    expect(bodyFatError('katch-mcardle', '120')).toBe(MSG.bodyFatRange);
    expect(bodyFatError('katch-mcardle', '20')).toBe(null);
  });

  it('the equation changes the whole report', () => {
    expect(computeCalories(metric({ formula: 'harris-benedict' })).maintenance).toBe(2463);
    expect(computeCalories(metric({ formula: 'katch-mcardle', bodyFatPct: '20' })).maintenance).toBe(2188);
  });
});

describe('validateCalorieValues', () => {
  it('accepts a complete metric and a complete US entry', () => {
    expect(validateCalorieValues(metric())).toEqual({ ok: true });
    expect(validateCalorieValues(us())).toEqual({ ok: true });
  });

  it('reports every missing field at once', () => {
    const r = validateCalorieValues(metric({ age: '', heightCm: '', weightKg: '', activity: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors!.age).toBe(MSG.ageMissing);
      expect(r.fieldErrors!.heightCm).toBe(MSG.heightMissing);
      expect(r.fieldErrors!.weightKg).toBe(MSG.weightMissing);
      expect(r.fieldErrors!.activity).toBe(MSG.activityMissing);
    }
  });

  it('applies the shared imperial-height semantics', () => {
    const over = validateCalorieValues(us({ heightIn: '12' }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fieldErrors!.height).toBe(MSG.heightInches);
  });

  it('never reads the other tab’s boxes', () => {
    expect(validateCalorieValues(us({ heightCm: '', weightKg: '' })).ok).toBe(true);
    expect(validateCalorieValues(metric({ heightFt: '', heightIn: '', weightLb: '' })).ok).toBe(true);
  });
});

describe('completeCalorieValue — the whole report or nothing', () => {
  it('is finite for a complete entry', () => {
    expect(Number.isFinite(completeCalorieValue(computeCalories(metric())))).toBe(true);
  });

  it('is NaN when anything is missing', () => {
    for (const bad of [metric({ age: '' }), metric({ heightCm: '' }), metric({ weightKg: '' })]) {
      expect(Number.isNaN(completeCalorieValue(computeCalories(bad)))).toBe(true);
    }
  });

  it('is NaN for Katch-McArdle without a body fat percentage', () => {
    expect(Number.isNaN(completeCalorieValue(computeCalories(metric({ formula: 'katch-mcardle' }))))).toBe(true);
  });

  it('refuses the whole report rather than printing a row at or below zero', () => {
    // A very small, sedentary body: the extreme 1,000-calorie deficit lands under zero.
    const tiny = computeCalories(metric({ heightCm: '120', weightKg: '25', age: '80', activity: '1.2' }));
    expect(tiny.goals.find((g) => g.key === 'extreme-loss')!.calories).toBeLessThanOrEqual(0);
    expect(Number.isNaN(completeCalorieValue(tiny))).toBe(true);
  });
});

describe('formatting and speech', () => {
  it('never prints a non-number or a non-positive figure', () => {
    expect(formatCalories(Number.NaN)).toBe('—');
    expect(formatCalories(0)).toBe('—');
    expect(formatCalories(-5)).toBe('—');
    expect(formatCalories(2425)).toBe('2,425');
    expect(isUsableCalories(0)).toBe(false);
    expect(isUsableCalories(1)).toBe(true);
  });

  it('announces maintenance only, never the whole table', () => {
    const s = describeCalorieResult(computeCalories(metric()));
    expect(s).toBe('To maintain your weight you need about 2,425 Calories a day.');
    expect(s).not.toMatch(/2,175|1,925|1,425|zigzag/i);
  });
});

describe('conversion between the tabs', () => {
  it('metric → US and back', () => {
    expect(metricToImperial({ heightCm: 180, weightKg: 65 })).toEqual({ heightFt: 5, heightIn: 11, weightLb: 143.3 });
    const m = imperialToMetric({ heightFt: 5, heightIn: 10, weightLb: 165 });
    expect(m.heightCm).toBeCloseTo(177.8, 1);
    expect(m.weightKg).toBeCloseTo(74.8, 1);
  });
  it('empty stays empty', () => {
    expect(metricToImperial({ heightCm: null, weightKg: null })).toEqual({ heightFt: null, heightIn: null, weightLb: null });
    expect(imperialToMetric({ heightFt: null, heightIn: null, weightLb: null })).toEqual({ heightCm: null, weightKg: null });
  });
});

describe('the labelled example', () => {
  it('is the reference’s US case, in the system the tabs open on, at the default band', () => {
    expect(CALORIE_EXAMPLE_VALUES).toMatchObject({
      system: 'imperial',
      age: '25',
      heightFt: '5',
      heightIn: '10',
      weightLb: '165',
      formula: 'mifflin',
      bodyFatPct: '',
    });
    expect(CALORIE_EXAMPLE_VALUES.activity).toBe(String(DEFAULT_ACTIVITY));
    expect(validateCalorieValues(CALORIE_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(Number.isFinite(completeCalorieValue(computeCalories(CALORIE_EXAMPLE_VALUES)))).toBe(true);
  });
});

describe('the binding wires the pure parts together', () => {
  it('gates the result on the complete-report guard', () => {
    expect(calorieBinding.resultValue).toBe(completeCalorieValue);
    expect(calorieBinding.validate).toBe(validateCalorieValues);
    expect(calorieBinding.compute).toBe(computeCalories);
  });
});

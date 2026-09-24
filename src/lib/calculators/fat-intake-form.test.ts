import { describe, it, expect } from 'vitest';
import {
  MSG,
  ACTIVITY_BANDS,
  ACTIVITY_BAND_NOTES,
  DEFAULT_ACTIVITY,
  FAT_AGE_MIN,
  FAT_AGE_MAX,
  AMDR_MIN_PCT,
  AMDR_MAX_PCT,
  SATURATED_GUIDELINES_PCT,
  SATURATED_AHA_PCT,
  KCAL_PER_GRAM_FAT,
  ageError,
  activityError,
  bodyFatError,
  validateFatIntakeValues,
  computeFatIntake,
  completeFatIntakeValue,
  describeFatIntakeResult,
  formatGrams,
  formatBasis,
  isUsableGrams,
  fatIntakeBinding,
  metricToImperial,
  imperialToMetric,
  FAT_INTAKE_EXAMPLE_VALUES,
  type FatIntakeValues,
} from './fat-intake-form';

/**
 * The binding's pure surface. The report itself lives in the reviewed pure `fat-intake.ts`;
 * here we pin the age, activity and body-fat gates, the ceiling-vs-range wording, the
 * whole-report guard, and Metric/US conversion.
 */

const base: FatIntakeValues = {
  system: 'imperial',
  sex: 'male',
  age: '25',
  heightCm: '',
  weightKg: '',
  heightFt: '5',
  heightIn: '10',
  weightLb: '160',
  activity: '1.375',
  formula: 'mifflin',
  bodyFatPct: '',
};
const us = (over: Partial<FatIntakeValues> = {}): FatIntakeValues => ({ ...base, ...over });
const metric = (over: Partial<FatIntakeValues> = {}): FatIntakeValues => ({
  ...base,
  system: 'metric',
  heightCm: '180',
  weightKg: '60',
  heightFt: '',
  heightIn: '',
  weightLb: '',
  ...over,
});
const row = (v: FatIntakeValues, key: string) => computeFatIntake(v).bases.find((b) => b.key === key)!;
const shown = (v: FatIntakeValues, key: string) => {
  const b = row(v, key);
  return formatBasis(b.low, b.high, b.ceiling);
};

describe('the reference case', () => {
  it('US: 25, male, 5 ft 10 in, 160 lb, Light', () => {
    const r = computeFatIntake(us());
    expect(r.calories).toBe(2361);
    expect([r.totalLow, r.totalHigh]).toEqual([52, 92]);
    expect(shown(us(), 'total')).toBe('52 - 92 grams/day');
    expect(shown(us(), 'saturated-guidelines')).toBe('up to 26 grams/day');
    expect(shown(us(), 'saturated-aha')).toBe('up to 16 grams/day');
  });

  it('Metric: the same person at 180 cm, 60 kg', () => {
    const r = computeFatIntake(metric());
    expect(r.calories).toBe(2207);
    expect(shown(metric(), 'total')).toBe('49 - 86 grams/day');
    expect(shown(metric(), 'saturated-guidelines')).toBe('up to 25 grams/day');
    expect(shown(metric(), 'saturated-aha')).toBe('up to 15 grams/day');
  });

  it('reports three rows, in order', () => {
    expect(computeFatIntake(us()).bases.map((b) => b.key)).toEqual([
      'total',
      'saturated-guidelines',
      'saturated-aha',
    ]);
  });

  it('publishes the shares and the energy density it is built on', () => {
    expect(KCAL_PER_GRAM_FAT).toBe(9);
    expect([AMDR_MIN_PCT, AMDR_MAX_PCT]).toEqual([20, 35]);
    expect([SATURATED_GUIDELINES_PCT, SATURATED_AHA_PCT]).toEqual([10, 6]);
  });
});

describe('a ceiling never reads like a target', () => {
  it('writes a range, a plain figure and a ceiling differently', () => {
    expect(formatBasis(52, 92)).toBe('52 - 92 grams/day');
    expect(formatBasis(26)).toBe('26 grams/day');
    expect(formatBasis(26, undefined, true)).toBe('up to 26 grams/day');
  });

  it('marks both saturated rows as ceilings and the total as a range', () => {
    expect(row(us(), 'total').ceiling).toBe(false);
    expect(row(us(), 'saturated-guidelines').ceiling).toBe(true);
    expect(row(us(), 'saturated-aha').ceiling).toBe(true);
  });
});

describe('every row is a share of the same calorie figure', () => {
  it('activity moves all three', () => {
    const light = computeFatIntake(us({ activity: '1.375' }));
    const extra = computeFatIntake(us({ activity: '1.9' }));
    expect(extra.calories).toBeGreaterThan(light.calories);
    for (const key of ['total', 'saturated-guidelines', 'saturated-aha']) {
      expect(row(us({ activity: '1.9' }), key).low).toBeGreaterThan(row(us({ activity: '1.375' }), key).low);
    }
  });

  it('so does the equation', () => {
    expect(computeFatIntake(metric({ formula: 'harris-benedict' })).calories).not.toBe(
      computeFatIntake(metric()).calories,
    );
  });
});

describe('activity', () => {
  it('offers the six shared bands and refuses anything else', () => {
    expect(ACTIVITY_BANDS).toHaveLength(6);
    for (const b of ACTIVITY_BANDS) expect(activityError(String(b.value))).toBe(null);
    expect(activityError('1.3')).toBe(MSG.activityMissing);
    expect(activityError('')).toBe(MSG.activityMissing);
    expect(DEFAULT_ACTIVITY).toBe(1.465);
  });
  it('carries the footnotes that define its terms', () => {
    expect(ACTIVITY_BAND_NOTES).toHaveLength(3);
  });
});

describe('age', () => {
  it('is adults only', () => {
    expect([FAT_AGE_MIN, FAT_AGE_MAX]).toEqual([18, 80]);
    expect(ageError('17')).toBe(MSG.ageRange);
    expect(ageError('18')).toBe(null);
    expect(ageError('80')).toBe(null);
    expect(ageError('81')).toBe(MSG.ageRange);
  });
  it('is required and whole', () => {
    expect(ageError('')).toBe(MSG.ageMissing);
    expect(ageError('25.5')).toBe(MSG.ageWhole);
  });
});

describe('body fat', () => {
  it('is asked for only by Katch-McArdle', () => {
    expect(bodyFatError('mifflin', '')).toBe(null);
    expect(bodyFatError('katch-mcardle', '')).toBe(MSG.bodyFatMissing);
    expect(bodyFatError('katch-mcardle', '120')).toBe(MSG.bodyFatRange);
    expect(bodyFatError('katch-mcardle', '20')).toBe(null);
  });
});

describe('validateFatIntakeValues', () => {
  it('accepts a complete US and a complete metric entry', () => {
    expect(validateFatIntakeValues(us())).toEqual({ ok: true });
    expect(validateFatIntakeValues(metric())).toEqual({ ok: true });
  });

  it('reports every missing field at once', () => {
    const r = validateFatIntakeValues(metric({ age: '', heightCm: '', weightKg: '', activity: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors!.age).toBe(MSG.ageMissing);
      expect(r.fieldErrors!.heightCm).toBe(MSG.heightMissing);
      expect(r.fieldErrors!.weightKg).toBe(MSG.weightMissing);
      expect(r.fieldErrors!.activity).toBe(MSG.activityMissing);
    }
  });

  it('applies the shared imperial-height semantics', () => {
    const over = validateFatIntakeValues(us({ heightIn: '12' }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fieldErrors!.height).toBe(MSG.heightInches);
  });

  it('never reads the other tab’s boxes', () => {
    expect(validateFatIntakeValues(us({ heightCm: '', weightKg: '' })).ok).toBe(true);
    expect(validateFatIntakeValues(metric({ heightFt: '', heightIn: '', weightLb: '' })).ok).toBe(true);
  });
});

describe('completeFatIntakeValue — the whole report or nothing', () => {
  it('is finite for a complete entry', () => {
    expect(Number.isFinite(completeFatIntakeValue(computeFatIntake(us())))).toBe(true);
  });
  it('is NaN when anything is missing', () => {
    for (const bad of [us({ age: '' }), us({ weightLb: '' }), us({ heightFt: '', heightIn: '' })]) {
      expect(Number.isNaN(completeFatIntakeValue(computeFatIntake(bad)))).toBe(true);
    }
  });
  it('is NaN for Katch-McArdle without a body fat percentage', () => {
    expect(Number.isNaN(completeFatIntakeValue(computeFatIntake(us({ formula: 'katch-mcardle' }))))).toBe(true);
    expect(
      Number.isFinite(completeFatIntakeValue(computeFatIntake(us({ formula: 'katch-mcardle', bodyFatPct: '20' })))),
    ).toBe(true);
  });
});

describe('formatting and speech', () => {
  it('never prints a non-number or a non-positive figure', () => {
    expect(formatGrams(Number.NaN)).toBe('—');
    expect(formatGrams(0)).toBe('—');
    expect(formatBasis(Number.NaN)).toBe('—');
    expect(formatBasis(52, Number.NaN)).toBe('—');
    expect(isUsableGrams(0)).toBe(false);
    expect(isUsableGrams(52)).toBe(true);
  });

  it('announces the total range only, never the ceilings', () => {
    const s = describeFatIntakeResult(computeFatIntake(us()));
    expect(s).toBe('Aim for 52 to 92 grams of fat a day.');
    expect(s).not.toMatch(/saturated|26|16/);
  });
});

describe('conversion between the tabs', () => {
  it('metric → US and back', () => {
    expect(metricToImperial({ heightCm: 180, weightKg: 60 })).toEqual({ heightFt: 5, heightIn: 11, weightLb: 132.3 });
    const m = imperialToMetric({ heightFt: 5, heightIn: 10, weightLb: 160 });
    expect(m.heightCm).toBeCloseTo(177.8, 1);
    expect(m.weightKg).toBeCloseTo(72.6, 1);
  });
  it('empty stays empty', () => {
    expect(metricToImperial({ heightCm: null, weightKg: null })).toEqual({ heightFt: null, heightIn: null, weightLb: null });
    expect(imperialToMetric({ heightFt: null, heightIn: null, weightLb: null })).toEqual({ heightCm: null, weightKg: null });
  });
});

describe('the labelled example', () => {
  it('is the reference’s case, in the system the tabs open on and at its band', () => {
    expect(FAT_INTAKE_EXAMPLE_VALUES).toMatchObject({
      system: 'imperial',
      age: '25',
      heightFt: '5',
      heightIn: '10',
      weightLb: '160',
      activity: '1.375',
      formula: 'mifflin',
      bodyFatPct: '',
    });
    expect(validateFatIntakeValues(FAT_INTAKE_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(computeFatIntake(FAT_INTAKE_EXAMPLE_VALUES).totalLow).toBe(52);
  });
});

describe('the binding wires the pure parts together', () => {
  it('gates the result on the complete-report guard', () => {
    expect(fatIntakeBinding.resultValue).toBe(completeFatIntakeValue);
    expect(fatIntakeBinding.validate).toBe(validateFatIntakeValues);
    expect(fatIntakeBinding.compute).toBe(computeFatIntake);
  });
});

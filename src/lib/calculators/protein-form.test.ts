import { describe, it, expect } from 'vitest';
import {
  MSG,
  ACTIVITY_BANDS,
  ACTIVITY_BAND_NOTES,
  DEFAULT_ACTIVITY,
  PROTEIN_AGE_MIN,
  PROTEIN_AGE_MAX,
  RDA_G_PER_KG,
  ageError,
  activityError,
  bodyFatError,
  validateProteinValues,
  computeProtein,
  completeProteinValue,
  describeProteinResult,
  formatGrams,
  formatBasis,
  isUsableGrams,
  proteinBinding,
  metricToImperial,
  imperialToMetric,
  PROTEIN_EXAMPLE_VALUES,
  type ProteinValues,
} from './protein-form';

/**
 * The binding's pure surface. The report itself lives in the reviewed pure `protein.ts`;
 * here we pin the age, activity and body-fat gates, the row formatting, the whole-report
 * guard, and Metric/US conversion.
 */

const base: ProteinValues = {
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
const us = (over: Partial<ProteinValues> = {}): ProteinValues => ({ ...base, ...over });
const metric = (over: Partial<ProteinValues> = {}): ProteinValues => ({
  ...base,
  system: 'metric',
  heightCm: '180',
  weightKg: '60',
  heightFt: '',
  heightIn: '',
  weightLb: '',
  ...over,
});
const row = (v: ProteinValues, key: string) => computeProtein(v).bases.find((b) => b.key === key)!;

describe('the reference case', () => {
  it('US: 25, male, 5 ft 10 in, 160 lb, Light', () => {
    const r = computeProtein(us());
    expect(r.rda).toBe(58);
    expect(r.calories).toBe(2361);
    expect(formatBasis(row(us(), 'rda').low)).toBe('58 grams/day');
    expect(formatBasis(row(us(), 'range').low, row(us(), 'range').high)).toBe('58 - 131 grams/day');
    expect(formatBasis(row(us(), 'highly-active').low, row(us(), 'highly-active').high)).toBe('131 - 145 grams/day');
    expect(formatBasis(row(us(), 'amdr').low, row(us(), 'amdr').high)).toBe('59 - 207 grams/day');
  });

  it('Metric: the same person at 180 cm, 60 kg', () => {
    const r = computeProtein(metric());
    expect(r.rda).toBe(48);
    expect(r.calories).toBe(2207);
    expect(formatBasis(row(metric(), 'amdr').low, row(metric(), 'amdr').high)).toBe('55 - 193 grams/day');
  });

  it('reports four bases, in order', () => {
    expect(computeProtein(us()).bases.map((b) => b.key)).toEqual(['rda', 'range', 'highly-active', 'amdr']);
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

  it('moves the calorie row but never the weight rows', () => {
    const light = computeProtein(us({ activity: '1.375' }));
    const extra = computeProtein(us({ activity: '1.9' }));
    expect(light.rda).toBe(extra.rda);
    expect(extra.bases[3].low).toBeGreaterThan(light.bases[3].low);
  });

  it('carries the footnotes that define its terms', () => {
    expect(ACTIVITY_BAND_NOTES).toHaveLength(3);
  });
});

describe('age', () => {
  it('is adults only — the recommendations reported here are adult ones', () => {
    expect([PROTEIN_AGE_MIN, PROTEIN_AGE_MAX]).toEqual([18, 80]);
    expect(ageError('17')).toBe(MSG.ageRange);
    expect(ageError('18')).toBe(null);
    expect(ageError('80')).toBe(null);
    expect(ageError('81')).toBe(MSG.ageRange);
  });

  it('is required and whole', () => {
    expect(ageError('')).toBe(MSG.ageMissing);
    expect(ageError('25.5')).toBe(MSG.ageWhole);
    expect(ageError('x')).toBe(MSG.ageWhole);
  });
});

describe('body fat', () => {
  it('is asked for only by Katch-McArdle', () => {
    expect(bodyFatError('mifflin', '')).toBe(null);
    expect(bodyFatError('harris-benedict', '')).toBe(null);
    expect(bodyFatError('katch-mcardle', '')).toBe(MSG.bodyFatMissing);
    expect(bodyFatError('katch-mcardle', '120')).toBe(MSG.bodyFatRange);
    expect(bodyFatError('katch-mcardle', '20')).toBe(null);
  });

  it('the equation moves the calorie row but never the weight rows', () => {
    const mifflin = computeProtein(metric());
    const hb = computeProtein(metric({ formula: 'harris-benedict' }));
    expect(hb.rda).toBe(mifflin.rda);
    expect(hb.calories).not.toBe(mifflin.calories);
  });
});

describe('validateProteinValues', () => {
  it('accepts a complete US and a complete metric entry', () => {
    expect(validateProteinValues(us())).toEqual({ ok: true });
    expect(validateProteinValues(metric())).toEqual({ ok: true });
  });

  it('reports every missing field at once', () => {
    const r = validateProteinValues(metric({ age: '', heightCm: '', weightKg: '', activity: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors!.age).toBe(MSG.ageMissing);
      expect(r.fieldErrors!.heightCm).toBe(MSG.heightMissing);
      expect(r.fieldErrors!.weightKg).toBe(MSG.weightMissing);
      expect(r.fieldErrors!.activity).toBe(MSG.activityMissing);
    }
  });

  it('applies the shared imperial-height semantics', () => {
    const over = validateProteinValues(us({ heightIn: '12' }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fieldErrors!.height).toBe(MSG.heightInches);
    expect(validateProteinValues(us({ heightFt: '0', heightIn: '11' })).ok).toBe(true);
  });

  it('never reads the other tab’s boxes', () => {
    expect(validateProteinValues(us({ heightCm: '', weightKg: '' })).ok).toBe(true);
    expect(validateProteinValues(metric({ heightFt: '', heightIn: '', weightLb: '' })).ok).toBe(true);
  });
});

describe('completeProteinValue — the whole report or nothing', () => {
  it('is finite for a complete entry', () => {
    expect(Number.isFinite(completeProteinValue(computeProtein(us())))).toBe(true);
  });
  it('is NaN when anything is missing', () => {
    for (const bad of [us({ age: '' }), us({ weightLb: '' }), us({ heightFt: '', heightIn: '' })]) {
      expect(Number.isNaN(completeProteinValue(computeProtein(bad)))).toBe(true);
    }
  });
  it('is NaN for Katch-McArdle without a body fat percentage', () => {
    expect(Number.isNaN(completeProteinValue(computeProtein(us({ formula: 'katch-mcardle' }))))).toBe(true);
    expect(
      Number.isFinite(completeProteinValue(computeProtein(us({ formula: 'katch-mcardle', bodyFatPct: '20' })))),
    ).toBe(true);
  });
});

describe('formatting and speech', () => {
  it('never prints a non-number or a non-positive figure', () => {
    expect(formatGrams(Number.NaN)).toBe('—');
    expect(formatGrams(0)).toBe('—');
    expect(formatBasis(Number.NaN)).toBe('—');
    expect(formatBasis(58, Number.NaN)).toBe('—');
    expect(isUsableGrams(0)).toBe(false);
    expect(isUsableGrams(58)).toBe(true);
  });

  it('writes a single figure and a range differently', () => {
    expect(formatBasis(58)).toBe('58 grams/day');
    expect(formatBasis(58, 131)).toBe('58 - 131 grams/day');
  });

  it('announces the RDA only, never the whole table', () => {
    const s = describeProteinResult(computeProtein(us()));
    expect(s).toBe('You need at least 58 grams of protein a day.');
    expect(s).not.toMatch(/131|207|Calories/);
  });

  it('publishes the rate the dominant figure is built on', () => {
    expect(RDA_G_PER_KG).toBe(0.8);
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
    expect(PROTEIN_EXAMPLE_VALUES).toMatchObject({
      system: 'imperial',
      age: '25',
      heightFt: '5',
      heightIn: '10',
      weightLb: '160',
      activity: '1.375',
      formula: 'mifflin',
      bodyFatPct: '',
    });
    expect(validateProteinValues(PROTEIN_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(computeProtein(PROTEIN_EXAMPLE_VALUES).rda).toBe(58);
  });
});

describe('the binding wires the pure parts together', () => {
  it('gates the result on the complete-report guard', () => {
    expect(proteinBinding.resultValue).toBe(completeProteinValue);
    expect(proteinBinding.validate).toBe(validateProteinValues);
    expect(proteinBinding.compute).toBe(computeProtein);
  });
});

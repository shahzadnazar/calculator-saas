import { describe, it, expect } from 'vitest';
import {
  MSG,
  RESULT_UNITS,
  BMR_FORMULAS,
  ACTIVITY_BANDS,
  ACTIVITY_BAND_NOTES,
  ageError,
  bodyFatError,
  validateBmrValues,
  computeBmr,
  completeBmrValue,
  bmrActivityEstimates,
  describeBmrResult,
  bmrBinding,
  metricToImperial,
  imperialToMetric,
  resultUnitOf,
  BMR_EXAMPLE_VALUES,
  type BmrValues,
} from './bmr-form';

/**
 * The binding's pure surface. The three equations live in the reviewed pure `bmr.ts` and the
 * activity bands in the shared health module; here we pin what the binding adds — the age
 * and body-fat gates, the reference's two published reports, the table reconciling with its
 * own headline, the result-unit switch, and Metric/US conversion.
 */

const base: BmrValues = {
  system: 'imperial',
  sex: 'male',
  age: '25',
  heightCm: '',
  weightKg: '',
  heightFt: '5',
  heightIn: '10',
  weightLb: '160',
  formula: 'mifflin',
  bodyFatPct: '',
  resultUnit: 'kcal',
};
const us = (over: Partial<BmrValues> = {}): BmrValues => ({ ...base, ...over });
const metric = (over: Partial<BmrValues> = {}): BmrValues => ({
  ...base,
  system: 'metric',
  heightCm: '180',
  weightKg: '60',
  heightFt: '',
  heightIn: '',
  weightLb: '',
  ...over,
});

describe('the reference reports reproduce exactly', () => {
  it('US: 25, male, 5 ft 10 in, 160 lb', () => {
    const r = computeBmr(us());
    expect(r.bmr).toBe(1717);
    expect(r.activity.map((a) => a.kcal)).toEqual([2060, 2361, 2515, 2661, 2962, 3262]);
  });

  it('Metric: 25, male, 180 cm, 60 kg', () => {
    const r = computeBmr(metric());
    expect(r.bmr).toBe(1605);
    expect(r.activity.map((a) => a.kcal)).toEqual([1926, 2207, 2351, 2488, 2769, 3050]);
  });

  it('names the six activity bands and their footnotes the way the reference does', () => {
    expect(computeBmr(us()).activity.map((a) => a.label)).toEqual([
      'Sedentary: little or no exercise',
      'Exercise 1-3 times/week',
      'Exercise 4-5 times/week',
      'Daily exercise or intense exercise 3-4 times/week',
      'Intense exercise 6-7 times/week',
      'Very intense exercise daily, or physical job',
    ]);
    expect(ACTIVITY_BAND_NOTES[0]).toMatch(/^Exercise: 15-30 minutes/);
  });

  it('the table reconciles with the headline printed above it', () => {
    // Every row must be the DISPLAYED bmr times its multiplier, not an unrounded value.
    const r = computeBmr(us());
    for (const a of r.activity) expect(a.kcal).toBe(Math.round(r.bmr * a.value));
  });
});

describe('the settings', () => {
  it('offers the three equations in the reference’s order', () => {
    expect(BMR_FORMULAS.map((f) => f.label)).toEqual([
      'Mifflin St Jeor',
      'Revised Harris-Benedict',
      'Katch-McArdle',
    ]);
  });

  it('the equation actually changes the answer', () => {
    expect(computeBmr(metric({ formula: 'harris-benedict' })).bmr).toBe(1614);
    expect(computeBmr(metric({ formula: 'katch-mcardle', bodyFatPct: '20' })).bmr).toBe(1407);
  });

  it('answers in kilojoules when asked, and the table follows the headline', () => {
    const r = computeBmr(us({ resultUnit: 'kj' }));
    expect(r.bmr).toBe(7184); // 1716.998 kcal × 4.184
    expect(r.unit).toBe('kj');
    expect(r.activity[0].kcal).toBe(Math.round(7184 * 1.2));
    expect(resultUnitOf('kj').suffix).toBe('kJ/day');
    expect(resultUnitOf('kcal').suffix).toBe('Calories/day');
  });

  it('converts from the unrounded Calories, not from the rounded headline', () => {
    // 4 ft 10 in, 100 lb, 15 is 1304.34 Calories. Converting that gives 5457 kJ; rounding
    // to 1304 first and then converting gives 5456 — one kilojoule lost to a double round.
    const r = computeBmr(us({ heightFt: '4', heightIn: '10', weightLb: '100', age: '15', resultUnit: 'kj' }));
    expect(r.bmr).toBe(5457);
    expect(r.bmr).not.toBe(Math.round(1304 * 4.184));
  });

  it('offers exactly two result units', () => {
    expect(RESULT_UNITS.map((u) => u.label)).toEqual(['Calories', 'Kilojoules']);
  });
});

describe('age', () => {
  it('is required, whole, and inside the reference’s 15–80', () => {
    expect(ageError('')).toBe(MSG.ageMissing);
    expect(ageError('25.5')).toBe(MSG.ageWhole);
    expect(ageError('x')).toBe(MSG.ageWhole);
    expect(ageError('14')).toBe(MSG.ageRange);
    expect(ageError('81')).toBe(MSG.ageRange);
    expect(ageError('15')).toBe(null);
    expect(ageError('80')).toBe(null);
  });
});

describe('body fat', () => {
  it('is asked for only by the equation that reads it', () => {
    expect(bodyFatError('mifflin', '')).toBe(null);
    expect(bodyFatError('harris-benedict', '')).toBe(null);
    expect(bodyFatError('katch-mcardle', '')).toBe(MSG.bodyFatMissing);
  });

  it('must be a percentage of a body', () => {
    expect(bodyFatError('katch-mcardle', '-1')).toBe(MSG.bodyFatRange);
    expect(bodyFatError('katch-mcardle', '100')).toBe(MSG.bodyFatRange);
    expect(bodyFatError('katch-mcardle', 'x')).toBe(MSG.bodyFatRange);
    expect(bodyFatError('katch-mcardle', '0')).toBe(null);
    expect(bodyFatError('katch-mcardle', '20')).toBe(null);
  });

  it('is ignored by the other two equations even when filled in', () => {
    expect(computeBmr(metric({ bodyFatPct: '40' })).bmr).toBe(computeBmr(metric()).bmr);
  });
});

describe('validateBmrValues', () => {
  it('accepts a complete US and a complete metric entry', () => {
    expect(validateBmrValues(us())).toEqual({ ok: true });
    expect(validateBmrValues(metric())).toEqual({ ok: true });
  });

  it('reports every missing field at once', () => {
    const r = validateBmrValues(metric({ age: '', heightCm: '', weightKg: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors!.age).toBe(MSG.ageMissing);
      expect(r.fieldErrors!.heightCm).toBe(MSG.heightMissing);
      expect(r.fieldErrors!.weightKg).toBe(MSG.weightMissing);
    }
  });

  it('applies the shared imperial-height semantics', () => {
    const over = validateBmrValues(us({ heightIn: '12' }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fieldErrors!.height).toBe(MSG.heightInches);
    expect(validateBmrValues(us({ heightFt: '0', heightIn: '11' })).ok).toBe(true);
  });

  it('never reads the other tab’s boxes', () => {
    expect(validateBmrValues(us({ heightCm: '', weightKg: '' })).ok).toBe(true);
    expect(validateBmrValues(metric({ heightFt: '', heightIn: '', weightLb: '' })).ok).toBe(true);
  });

  it('still asks for height and age under Katch-McArdle, which ignores them', () => {
    // Switching equations must not leave the visitor with a form that has quietly forgotten
    // what it will need again the moment they switch back.
    const r = validateBmrValues(us({ formula: 'katch-mcardle', bodyFatPct: '20', heightFt: '', heightIn: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors!.height).toBe(MSG.heightMissing);
  });
});

describe('completeBmrValue — the whole report or nothing', () => {
  it('is finite for a complete entry', () => {
    expect(Number.isFinite(completeBmrValue(computeBmr(us())))).toBe(true);
  });
  it('is NaN when anything is missing', () => {
    for (const bad of [us({ age: '' }), us({ weightLb: '' }), us({ heightFt: '', heightIn: '' })]) {
      expect(Number.isNaN(completeBmrValue(computeBmr(bad)))).toBe(true);
    }
  });
  it('is NaN for Katch-McArdle without a body-fat percentage, rather than a fabricated number', () => {
    expect(Number.isNaN(completeBmrValue(computeBmr(us({ formula: 'katch-mcardle' }))))).toBe(true);
  });
  it('never yields a table that does not match the bands', () => {
    expect(bmrActivityEstimates(Number.NaN)).toEqual([]);
    expect(bmrActivityEstimates(1717)).toHaveLength(ACTIVITY_BANDS.length);
  });
});

describe('describeBmrResult', () => {
  it('speaks the headline only, never the table', () => {
    expect(describeBmrResult(computeBmr(us()))).toBe('Your basal metabolic rate is 1,717 Calories per day.');
    expect(describeBmrResult(computeBmr(us()))).not.toMatch(/sedentary|exercise/i);
  });
  it('names kilojoules when that is the answer given', () => {
    expect(describeBmrResult(computeBmr(us({ resultUnit: 'kj' })))).toBe(
      'Your basal metabolic rate is 7,184 kilojoules per day.',
    );
  });
});

describe('conversion between the tabs', () => {
  it('metric → US', () => {
    expect(metricToImperial({ heightCm: 180, weightKg: 60 })).toEqual({ heightFt: 5, heightIn: 11, weightLb: 132.3 });
  });
  it('US → metric', () => {
    const m = imperialToMetric({ heightFt: 5, heightIn: 10, weightLb: 160 });
    expect(m.heightCm).toBeCloseTo(177.8, 1);
    expect(m.weightKg).toBeCloseTo(72.6, 1);
  });
  it('empty stays empty — a blank box is never turned into a zero', () => {
    expect(metricToImperial({ heightCm: null, weightKg: null })).toEqual({ heightFt: null, heightIn: null, weightLb: null });
    expect(imperialToMetric({ heightFt: null, heightIn: null, weightLb: null })).toEqual({ heightCm: null, weightKg: null });
  });
});

describe('the labelled example', () => {
  it('is the reference’s published US case, in the system the tabs open on', () => {
    expect(BMR_EXAMPLE_VALUES).toMatchObject({ system: 'imperial', age: '25', heightFt: '5', heightIn: '10', weightLb: '160' });
    expect(validateBmrValues(BMR_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(computeBmr(BMR_EXAMPLE_VALUES).bmr).toBe(1717);
  });
  it('uses the default equation and unit, so it shows the calculator as it opens', () => {
    expect(BMR_EXAMPLE_VALUES.formula).toBe('mifflin');
    expect(BMR_EXAMPLE_VALUES.resultUnit).toBe('kcal');
    expect(BMR_EXAMPLE_VALUES.bodyFatPct).toBe('');
  });
});

describe('the binding wires the pure parts together', () => {
  it('gates the result on the complete-report guard', () => {
    expect(bmrBinding.resultValue).toBe(completeBmrValue);
    expect(bmrBinding.validate).toBe(validateBmrValues);
    expect(bmrBinding.compute).toBe(computeBmr);
  });
});

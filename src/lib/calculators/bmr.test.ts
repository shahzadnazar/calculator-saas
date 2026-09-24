import { describe, it, expect } from 'vitest';
import {
  calculateBmr,
  mifflinStJeorBMR,
  revisedHarrisBenedictBMR,
  katchMcArdleBMR,
  bmrFor,
  toResultUnit,
  needsBodyFat,
  BMR_FORMULAS,
  BMR_AGE_MIN,
  BMR_AGE_MAX,
  KJ_PER_KCAL,
} from './bmr';

describe('BMR (Mifflin-St Jeor)', () => {
  it('computes the raw formula', () => {
    expect(mifflinStJeorBMR('male', 80, 180, 30)).toBe(1780);
    expect(mifflinStJeorBMR('female', 60, 165, 30)).toBeCloseTo(1320.25, 2);
  });

  it('computes metric BMR', () => {
    expect(calculateBmr({ sex: 'male', age: 30, system: 'metric', heightCm: 180, weightKg: 80 }).bmr).toBe(1780);
  });

  it('computes imperial BMR', () => {
    const r = calculateBmr({ sex: 'female', age: 40, system: 'imperial', heightFt: 5, heightIn: 5, weightLb: 140 });
    expect(r.bmr).toBeGreaterThan(1200);
  });

  it('guards invalid input', () => {
    expect(Number.isNaN(calculateBmr({ sex: 'male', age: 0, system: 'metric', heightCm: 0, weightKg: 0 }).bmr)).toBe(true);
  });
});

describe('the reference reports reproduce exactly', () => {
  it('US: 25, male, 5 ft 10 in, 160 lb → 1,717', () => {
    expect(calculateBmr({ sex: 'male', age: 25, system: 'imperial', heightFt: 5, heightIn: 10, weightLb: 160 }).bmr).toBe(1717);
  });
  it('Metric: 25, male, 180 cm, 60 kg → 1,605', () => {
    expect(calculateBmr({ sex: 'male', age: 25, system: 'metric', heightCm: 180, weightKg: 60 }).bmr).toBe(1605);
  });
});

describe('the other two equations', () => {
  it('Revised Harris-Benedict, both sexes', () => {
    // 88.362 + 13.397·60 + 4.799·180 − 5.677·25
    expect(revisedHarrisBenedictBMR('male', 60, 180, 25)).toBeCloseTo(1614.077, 3);
    // 447.593 + 9.247·60 + 3.098·180 − 4.330·25
    expect(revisedHarrisBenedictBMR('female', 60, 180, 25)).toBeCloseTo(1451.803, 3);
  });

  it('Katch-McArdle works from lean mass, not height or age', () => {
    // 370 + 21.6 × (60 × 0.80)
    expect(katchMcArdleBMR(60, 20)).toBeCloseTo(1406.8, 3);
    // Changing height or age cannot move it, because neither appears in the equation.
    expect(bmrFor('katch-mcardle', 'male', 60, 180, 25, 20)).toBe(bmrFor('katch-mcardle', 'female', 60, 150, 70, 20));
  });

  it('refuses Katch-McArdle without a usable body-fat percentage rather than inventing one', () => {
    for (const bf of [undefined, Number.NaN, -1, 100, 140]) {
      expect(Number.isNaN(bmrFor('katch-mcardle', 'male', 60, 180, 25, bf))).toBe(true);
    }
    expect(Number.isNaN(calculateBmr({ sex: 'male', age: 25, system: 'metric', heightCm: 180, weightKg: 60, formula: 'katch-mcardle' }).bmr)).toBe(true);
  });

  it('defaults to Mifflin-St Jeor, so the calorie calculator’s shared engine is untouched', () => {
    const withoutFormula = calculateBmr({ sex: 'male', age: 25, system: 'metric', heightCm: 180, weightKg: 60 }).bmr;
    const explicit = calculateBmr({ sex: 'male', age: 25, system: 'metric', heightCm: 180, weightKg: 60, formula: 'mifflin' }).bmr;
    expect(withoutFormula).toBe(explicit);
    expect(withoutFormula).toBe(1605);
  });

  it('the three equations genuinely disagree on the same body', () => {
    const args = ['male', 60, 180, 25, 20] as const;
    const values = BMR_FORMULAS.map((f) => bmrFor(f.value, ...args));
    expect(new Set(values.map((v) => Math.round(v))).size).toBe(3);
  });

  it('publishes which equation needs a body-fat percentage', () => {
    expect(needsBodyFat('katch-mcardle')).toBe(true);
    expect(needsBodyFat('mifflin')).toBe(false);
    expect(needsBodyFat('harris-benedict')).toBe(false);
  });
});

describe('result units', () => {
  it('leaves Calories alone and converts kilojoules at 4.184', () => {
    expect(KJ_PER_KCAL).toBe(4.184);
    expect(toResultUnit(1717, 'kcal')).toBe(1717);
    expect(toResultUnit(1717, 'kj')).toBeCloseTo(7183.928, 3);
  });
});

describe('the accepted age span', () => {
  it('is the reference’s 15 to 80', () => {
    expect([BMR_AGE_MIN, BMR_AGE_MAX]).toEqual([15, 80]);
  });
});

import { describe, it, expect } from 'vitest';
import { calculateBodyFat } from './body-fat';

describe('body fat (U.S. Navy method)', () => {
  it('computes male body fat', () => {
    const r = calculateBodyFat({ sex: 'male', system: 'metric', heightCm: 180, neckCm: 38, waistCm: 85 });
    expect(r.bodyFatPct).toBeCloseTo(16.1, 0); // within 0.5
    expect(r.category).toBe('Fitness');
  });

  it('computes female body fat (uses hip)', () => {
    const r = calculateBodyFat({ sex: 'female', system: 'metric', heightCm: 165, neckCm: 34, waistCm: 74, hipCm: 96 });
    expect(r.bodyFatPct).toBeCloseTo(26.4, 0);
    expect(r.category).toBe('Average');
  });

  it('returns NaN for impossible measurements', () => {
    const r = calculateBodyFat({ sex: 'male', system: 'metric', heightCm: 180, neckCm: 40, waistCm: 40 });
    expect(Number.isNaN(r.bodyFatPct)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The full report                                                     */
/* ------------------------------------------------------------------ */

import {
  CATEGORY_BANDS,
  bodyFatFromBmi,
  bodyFatReport,
  idealBodyFatPct,
  navyBodyFatPct,
  type BodyFatReportInput,
} from './body-fat';

/**
 * Frozen against the two published reference reports: the same 25-year-old man measured
 * metrically (70 kg, 178/50/96 cm) and in US units (152 lb, 70.5/19.5/37.5 in).
 */
const LB = 0.45359237;
const IN = 2.54;
const METRIC: BodyFatReportInput = { sex: 'male', age: 25, weightKg: 70, heightCm: 178, neckCm: 50, waistCm: 96 };
const US: BodyFatReportInput = {
  sex: 'male', age: 25, weightKg: 152 * LB, heightCm: 70.5 * IN, neckCm: 19.5 * IN, waistCm: 37.5 * IN,
};
const one = (n: number) => Math.round(n * 10) / 10;
const toLb = (kg: number) => kg / LB;

describe('the published metric report', () => {
  const r = bodyFatReport(METRIC);

  it('reproduces every published row', () => {
    expect(one(r.bodyFatPct)).toBe(15.7);
    expect(r.category).toBe('Fitness');
    expect(one(r.fatMassKg)).toBe(11);
    expect(one(r.leanMassKg)).toBe(59);
    expect(one(r.idealPct)).toBe(10.5);
    expect(one(r.fatToLoseKg)).toBe(3.6);
    expect(one(r.bmiBodyFatPct)).toBe(16.1);
    expect(r.unsolvable).toBe(false);
  });

  it('fat and lean mass account for the whole body', () => {
    expect(one(r.fatMassKg + r.leanMassKg)).toBe(70);
  });
});

describe('the published US report', () => {
  const r = bodyFatReport(US);

  it('reproduces every published row', () => {
    expect(one(r.bodyFatPct)).toBe(15.3);
    expect(r.category).toBe('Fitness');
    expect(one(toLb(r.fatMassKg))).toBe(23.2);
    expect(one(toLb(r.leanMassKg))).toBe(128.8);
    expect(one(r.idealPct)).toBe(10.5);
    expect(one(toLb(r.fatToLoseKg))).toBe(7.2);
    expect(one(r.bmiBodyFatPct)).toBe(15.4);
  });

  it('would miss the published masses if the percentage were rounded first', () => {
    // The guard this documents: 152 lb x 15.3% is 23.3 lb, not the published 23.2 lb.
    expect(one(152 * 0.153)).toBe(23.3);
    expect(one(toLb(r.fatMassKg))).toBe(23.2);
  });
});

describe('the ideal-percentage table', () => {
  it('matches Jackson & Pollock at every anchor age', () => {
    const male: [number, number][] = [[20, 8.5], [25, 10.5], [30, 12.7], [35, 13.7], [40, 15.3], [45, 16.4], [50, 18.9], [55, 20.9]];
    for (const [age, pct] of male) expect(one(idealBodyFatPct('male', age))).toBe(pct);
    const female: [number, number][] = [[20, 17.7], [25, 18.4], [30, 19.3], [35, 21.5], [40, 22.2], [45, 22.9], [50, 25.2], [55, 26.3]];
    for (const [age, pct] of female) expect(one(idealBodyFatPct('female', age))).toBe(pct);
  });

  it('interpolates between anchors and holds at the ends', () => {
    expect(idealBodyFatPct('male', 22.5)).toBeCloseTo(9.5, 6);
    expect(idealBodyFatPct('male', 5)).toBe(8.5);
    expect(idealBodyFatPct('male', 90)).toBe(20.9);
  });

  it('rises with age for both', () => {
    for (const sex of ['male', 'female'] as const) {
      for (let age = 21; age <= 55; age += 1) {
        expect(idealBodyFatPct(sex, age)).toBeGreaterThanOrEqual(idealBodyFatPct(sex, age - 1));
      }
    }
  });
});

describe('the BMI method', () => {
  it('reproduces the published second estimate', () => {
    expect(one(bodyFatFromBmi('male', 70 / 1.78 ** 2, 25))).toBe(16.1);
  });

  it('uses different constants for a child', () => {
    expect(bodyFatFromBmi('male', 20, 15)).not.toBe(bodyFatFromBmi('male', 20, 18));
  });

  it('reads higher for a woman at the same BMI and age', () => {
    expect(bodyFatFromBmi('female', 22, 30)).toBeGreaterThan(bodyFatFromBmi('male', 22, 30));
  });
});

describe('the category bands', () => {
  it('draws the gauge from the edges the reference marks', () => {
    expect(CATEGORY_BANDS.male.edges).toEqual([2, 6, 14, 18, 25]);
    expect(CATEGORY_BANDS.male.labels).toEqual(['Essential fat', 'Athletes', 'Fitness', 'Average', 'Obese']);
    expect(CATEGORY_BANDS.female.edges).toEqual([10, 14, 21, 25, 32]);
  });

  it('places a man in each band as his waist grows', () => {
    expect(bodyFatReport({ ...METRIC, waistCm: 88 }).category).toBe('Athletes');
    expect(bodyFatReport({ ...METRIC, waistCm: 96 }).category).toBe('Fitness');
    expect(bodyFatReport({ ...METRIC, waistCm: 105 }).category).toBe('Average');
    expect(bodyFatReport({ ...METRIC, waistCm: 125 }).category).toBe('Obese');
  });
});

describe('a woman needs a hip measurement', () => {
  const female: BodyFatReportInput = {
    sex: 'female', age: 30, weightKg: 62, heightCm: 165, neckCm: 32, waistCm: 74, hipCm: 96,
  };

  it('computes a report from all five measurements', () => {
    const r = bodyFatReport(female);
    expect(r.unsolvable).toBe(false);
    expect(r.bodyFatPct).toBeGreaterThan(0);
    expect(one(r.fatMassKg + r.leanMassKg)).toBe(62);
  });

  it('refuses without the hip', () => {
    expect(bodyFatReport({ ...female, hipCm: undefined }).unsolvable).toBe(true);
    expect(bodyFatReport({ ...female, hipCm: 0 }).unsolvable).toBe(true);
  });

  it('a man needs no hip measurement', () => {
    expect(bodyFatReport({ ...METRIC, hipCm: undefined }).unsolvable).toBe(false);
  });
});

describe('measurements that produce no answer', () => {
  it('refuses a waist no bigger than the neck', () => {
    expect(bodyFatReport({ ...METRIC, waistCm: 50 }).unsolvable).toBe(true);
    expect(Number.isNaN(navyBodyFatPct('male', 178, 50, 50))).toBe(true);
  });

  it('refuses a weight or height of nothing', () => {
    expect(bodyFatReport({ ...METRIC, weightKg: 0 }).unsolvable).toBe(true);
    expect(bodyFatReport({ ...METRIC, heightCm: 0 }).unsolvable).toBe(true);
  });

  it('refuses a non-finite measurement', () => {
    expect(bodyFatReport({ ...METRIC, waistCm: Number.NaN }).unsolvable).toBe(true);
    expect(bodyFatReport({ ...METRIC, age: Number.POSITIVE_INFINITY }).unsolvable).toBe(true);
  });

  it('carries no figures to print when unsolvable', () => {
    const r = bodyFatReport({ ...METRIC, waistCm: 50 });
    for (const v of [r.bodyFatPct, r.fatMassKg, r.leanMassKg, r.bmiBodyFatPct, r.idealPct, r.fatToLoseKg]) {
      expect(Number.isNaN(v)).toBe(true);
    }
  });

  it('someone already below the ideal has a negative amount to lose', () => {
    const lean = bodyFatReport({ ...METRIC, waistCm: 88 });
    expect(lean.bodyFatPct).toBeLessThan(lean.idealPct);
    expect(lean.fatToLoseKg).toBeLessThan(0);
  });

  it('refuses measurements that drive the formula below zero per cent', () => {
    // A 78cm waist against a 50cm neck returns -1.7% — not a very lean man, but the fit
    // being asked a question it cannot answer.
    expect(bodyFatReport({ ...METRIC, waistCm: 78 }).unsolvable).toBe(true);
    expect(Number.isNaN(navyBodyFatPct('male', 178, 50, 78))).toBe(true);
    // 80cm still yields a positive 0.6%, so it stays a (barely) real answer.
    expect(navyBodyFatPct('male', 178, 50, 80)).toBeGreaterThan(0);
  });
});

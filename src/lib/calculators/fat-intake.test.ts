import { describe, it, expect } from 'vitest';
import {
  calculateFatIntake,
  gramsFromCalories,
  FAT_AGE_MIN,
  FAT_AGE_MAX,
  KCAL_PER_GRAM_FAT,
  AMDR_MIN_PCT,
  AMDR_MAX_PCT,
  SATURATED_GUIDELINES_PCT,
  SATURATED_AHA_PCT,
  type FatIntakeInput,
} from './fat-intake';

/** The reference's case: 25, male, 5 ft 10 in, 160 lb, Light (1.375). */
const us = (over: Partial<FatIntakeInput> = {}): FatIntakeInput => ({
  sex: 'male',
  age: 25,
  system: 'imperial',
  heightFt: 5,
  heightIn: 10,
  weightLb: 160,
  activity: 1.375,
  ...over,
});
const metric = (over: Partial<FatIntakeInput> = {}): FatIntakeInput => ({
  sex: 'male',
  age: 25,
  system: 'metric',
  heightCm: 180,
  weightKg: 60,
  activity: 1.375,
  ...over,
});
const row = (r: ReturnType<typeof calculateFatIntake>, key: string) => r.bases.find((b) => b.key === key)!;

describe('everything is a share of the calorie figure', () => {
  const result = calculateFatIntake(us());

  it('anchors on the calorie figure the same activity produces elsewhere', () => {
    expect(result.bmr).toBe(1717);
    expect(result.calories).toBe(2361); // 1717 × 1.375, the calorie calculator's own number
  });

  it('reports the total-fat range from the AMDR', () => {
    expect(row(result, 'total')).toMatchObject({ basis: '20 - 35% of Calories', low: 52, high: 92, ceiling: false });
    expect([result.totalLow, result.totalHigh]).toEqual([52, 92]);
  });

  it('reports both published caps on saturated fat as ceilings, not ranges', () => {
    expect(row(result, 'saturated-guidelines')).toMatchObject({ basis: 'under 10% of Calories', low: 26, ceiling: true });
    expect(row(result, 'saturated-aha')).toMatchObject({ basis: 'under 6% of Calories', low: 16, ceiling: true });
    for (const key of ['saturated-guidelines', 'saturated-aha']) {
      expect(row(result, key).high).toBeUndefined();
    }
  });

  it('the tighter cap is the smaller number, which is the point of showing both', () => {
    expect(row(result, 'saturated-aha').low).toBeLessThan(row(result, 'saturated-guidelines').low);
  });

  it('the same body in metric', () => {
    const m = calculateFatIntake(metric());
    expect(m.calories).toBe(2207);
    expect(row(m, 'total')).toMatchObject({ low: 49, high: 86 });
    expect(row(m, 'saturated-guidelines').low).toBe(25);
    expect(row(m, 'saturated-aha').low).toBe(15);
  });

  it('publishes the shares and the energy density it is built on', () => {
    expect(KCAL_PER_GRAM_FAT).toBe(9);
    expect([AMDR_MIN_PCT, AMDR_MAX_PCT]).toEqual([20, 35]);
    expect([SATURATED_GUIDELINES_PCT, SATURATED_AHA_PCT]).toEqual([10, 6]);
    expect([FAT_AGE_MIN, FAT_AGE_MAX]).toEqual([18, 80]);
  });
});

describe('every row moves with the calorie figure, because every row IS the calorie figure', () => {
  it('activity moves all three', () => {
    const light = calculateFatIntake(us({ activity: 1.375 }));
    const extra = calculateFatIntake(us({ activity: 1.9 }));
    expect(extra.calories).toBeGreaterThan(light.calories);
    for (const key of ['total', 'saturated-guidelines', 'saturated-aha']) {
      expect(row(extra, key).low).toBeGreaterThan(row(light, key).low);
    }
  });

  it('so do height, age and the equation', () => {
    expect(calculateFatIntake(us({ heightFt: 6, heightIn: 4 })).calories).toBeGreaterThan(2361);
    expect(calculateFatIntake(us({ age: 60 })).calories).toBeLessThan(2361);
    expect(calculateFatIntake(us({ formula: 'harris-benedict' })).calories).not.toBe(2361);
  });

  it('the total range always runs low to high', () => {
    for (const a of [1.2, 1.375, 1.465, 1.55, 1.725, 1.9]) {
      const r = calculateFatIntake(us({ activity: a }));
      expect(r.totalHigh).toBeGreaterThan(r.totalLow);
    }
  });
});

describe('the primitive', () => {
  it('grams from calories, at 9 per gram', () => {
    expect(gramsFromCalories(2361, 20)).toBe(52);
    expect(gramsFromCalories(2361, 35)).toBe(92);
    expect(gramsFromCalories(1800, 10)).toBe(20);
  });

  it('rounds a figure sitting exactly on the boundary up, not down', () => {
    // 2610 × 35% ÷ 9 is 101.5 exactly. Computing `percent / 100` first makes it
    // 101.49999999999999 and loses the half.
    expect(gramsFromCalories(2610, 35)).toBe(102);
  });
});

describe('guards', () => {
  it('returns nothing usable when a measurement is missing', () => {
    for (const bad of [us({ weightLb: 0 }), us({ heightFt: 0, heightIn: 0 }), us({ age: 0 })]) {
      const r = calculateFatIntake(bad);
      expect(Number.isNaN(r.calories)).toBe(true);
      expect(r.bases).toEqual([]);
    }
  });

  it('returns nothing usable for Katch-McArdle without a body fat percentage', () => {
    expect(calculateFatIntake(us({ formula: 'katch-mcardle' })).bases).toEqual([]);
    expect(calculateFatIntake(us({ formula: 'katch-mcardle', bodyFatPct: 20 })).bases).toHaveLength(3);
  });

  it('falls back to the default band rather than trusting an unlisted multiplier', () => {
    expect(calculateFatIntake(us({ activity: 99 })).calories).toBe(calculateFatIntake(us({ activity: 1.465 })).calories);
  });
});

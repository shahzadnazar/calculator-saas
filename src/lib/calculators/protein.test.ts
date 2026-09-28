import { describe, it, expect } from 'vitest';
import {
  calculateProtein,
  gramsFromWeight,
  gramsFromCalories,
  PROTEIN_AGE_MIN,
  PROTEIN_AGE_MAX,
  RDA_G_PER_KG,
  AMDR_MIN_PCT,
  AMDR_MAX_PCT,
  KCAL_PER_GRAM_PROTEIN,
  type ProteinInput,
} from './protein';

/** The reference's US case: 25, male, 5 ft 10 in, 160 lb, Light (1.375). */
const us = (over: Partial<ProteinInput> = {}): ProteinInput => ({
  sex: 'male',
  age: 25,
  system: 'imperial',
  heightFt: 5,
  heightIn: 10,
  weightLb: 160,
  activity: 1.375,
  ...over,
});
const metric = (over: Partial<ProteinInput> = {}): ProteinInput => ({
  sex: 'male',
  age: 25,
  system: 'metric',
  heightCm: 180,
  weightKg: 60,
  activity: 1.375,
  ...over,
});
const row = (r: ReturnType<typeof calculateProtein>, key: string) => r.bases.find((b) => b.key === key)!;

describe('the two bases the reference reports on', () => {
  const r = us();
  const result = calculateProtein(r);

  it('anchors on the calorie figure the same activity produces elsewhere', () => {
    expect(result.bmr).toBe(1717);
    expect(result.calories).toBe(2361); // 1717 × 1.375, the calorie calculator's own number
  });

  it('reports the RDA, the recommended range and the highly-active range from body weight', () => {
    expect(row(result, 'rda')).toMatchObject({ basis: '0.8 g/kg', low: 58 });
    expect(row(result, 'range')).toMatchObject({ basis: '0.8 - 1.8 g/kg', low: 58, high: 131 });
    expect(row(result, 'highly-active')).toMatchObject({ basis: '1.8 - 2 g/kg', low: 131, high: 145 });
  });

  it('reports the AMDR share from total Calories, at 4 Calories per gram', () => {
    expect(row(result, 'amdr')).toMatchObject({ basis: '10 - 35% of Calories', low: 59, high: 207 });
    expect(KCAL_PER_GRAM_PROTEIN).toBe(4);
  });

  it('the same body in metric', () => {
    const m = calculateProtein(metric());
    expect(m.calories).toBe(2207);
    expect(row(m, 'rda').low).toBe(48);
    expect(row(m, 'range')).toMatchObject({ low: 48, high: 108 });
    expect(row(m, 'highly-active')).toMatchObject({ low: 108, high: 120 });
    expect(row(m, 'amdr')).toMatchObject({ low: 55, high: 193 });
  });

  it('publishes the constants it is built on', () => {
    expect(RDA_G_PER_KG).toBe(0.8);
    expect([AMDR_MIN_PCT, AMDR_MAX_PCT]).toEqual([10, 35]);
    expect([PROTEIN_AGE_MIN, PROTEIN_AGE_MAX]).toEqual([18, 80]);
  });
});

describe('the two bases behave differently, which is the point of showing both', () => {
  it('the weight rows ignore activity; the calorie row does not', () => {
    const sedentary = calculateProtein(us({ activity: 1.2 }));
    const extra = calculateProtein(us({ activity: 1.9 }));
    expect(row(sedentary, 'rda').low).toBe(row(extra, 'rda').low);
    expect(row(sedentary, 'range')).toMatchObject(row(extra, 'range'));
    expect(row(extra, 'amdr').low).toBeGreaterThan(row(sedentary, 'amdr').low);
  });

  it('the weight rows ignore height and the equation; the calorie row does not', () => {
    const taller = calculateProtein(us({ heightFt: 6, heightIn: 4 }));
    expect(row(taller, 'rda').low).toBe(58);
    expect(taller.calories).toBeGreaterThan(2361);

    const hb = calculateProtein(us({ formula: 'harris-benedict' }));
    expect(row(hb, 'rda').low).toBe(58);
    expect(hb.calories).not.toBe(2361);
  });

  it('every range runs low to high', () => {
    for (const b of calculateProtein(us()).bases) {
      if (b.high !== undefined) expect(b.high).toBeGreaterThan(b.low);
    }
  });
});

describe('the primitives', () => {
  it('grams from body weight', () => {
    expect(gramsFromWeight(60, 0.8)).toBe(48);
    expect(gramsFromWeight(72.5748, 1.8)).toBe(131);
  });
  it('grams from calories, at 4 per gram', () => {
    expect(gramsFromCalories(2000, 10)).toBe(50);
    expect(gramsFromCalories(2361, 35)).toBe(207);
  });
});

describe('guards', () => {
  it('returns nothing usable when a measurement is missing', () => {
    for (const bad of [us({ weightLb: 0 }), us({ heightFt: 0, heightIn: 0 }), us({ age: 0 })]) {
      const r = calculateProtein(bad);
      expect(Number.isNaN(r.calories)).toBe(true);
      expect(r.bases).toEqual([]);
    }
  });

  it('returns nothing usable for Katch-McArdle without a body fat percentage', () => {
    expect(calculateProtein(us({ formula: 'katch-mcardle' })).bases).toEqual([]);
    expect(calculateProtein(us({ formula: 'katch-mcardle', bodyFatPct: 20 })).bases).toHaveLength(4);
  });

  it('falls back to the default band rather than trusting an unlisted multiplier', () => {
    expect(calculateProtein(us({ activity: 99 })).calories).toBe(calculateProtein(us({ activity: 1.465 })).calories);
  });
});

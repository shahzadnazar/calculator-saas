import { describe, it, expect } from 'vitest';
import { calculateIdealWeight, HEALTHY_BMI_MIN, HEALTHY_BMI_MAX, ADULT_MIN_AGE, AGE_MIN, AGE_MAX } from './ideal-weight';

describe('ideal weight', () => {
  it('computes metric (kg) for a 180cm male', () => {
    const r = calculateIdealWeight({ sex: 'male', system: 'metric', heightCm: 180 });
    expect(r.unit).toBe('kg');
    // Devine male: 50 + 2.3 * (70.87 - 60) ≈ 75.0
    expect(r.devine).toBeCloseTo(75.0, 0);
    expect(r.robinson).toBeGreaterThan(70);
    expect(r.bmiMin).toBeGreaterThan(0);
    expect(r.bmiMax).toBeGreaterThan(r.bmiMin);
  });

  it('returns pounds for imperial input', () => {
    const r = calculateIdealWeight({ sex: 'male', system: 'imperial', heightFt: 5, heightIn: 10 });
    expect(r.unit).toBe('lb');
    // Devine male at 70in: 50 + 2.3*10 = 73 kg ≈ 160.9 lb
    expect(r.devine).toBeCloseTo(160.9, 0);
  });

  it('differs by sex', () => {
    const male = calculateIdealWeight({ sex: 'male', system: 'metric', heightCm: 170 });
    const female = calculateIdealWeight({ sex: 'female', system: 'metric', heightCm: 170 });
    expect(female.devine).toBeLessThan(male.devine);
  });

  it('reproduces the reference report in US units (5 ft 10 in, male)', () => {
    const r = calculateIdealWeight({ sex: 'male', system: 'imperial', heightFt: 5, heightIn: 10 });
    expect(r).toMatchObject({ robinson: 156.5, miller: 155, devine: 160.9, hamwi: 165.3, bmiMin: 128.9, bmiMax: 174.2 });
  });

  it('reproduces the reference report in metric (180 cm, male)', () => {
    const r = calculateIdealWeight({ sex: 'male', system: 'metric', heightCm: 180 });
    expect(r).toMatchObject({ robinson: 72.6, miller: 71.5, devine: 75, hamwi: 77.3, bmiMin: 59.9, bmiMax: 81 });
  });

  it('draws the healthy range from BMI 18.5-25', () => {
    // The band the reference uses. At 24.9 the top of the 180 cm range would be 80.7 kg,
    // not the 81.0 kg the reference publishes.
    expect(HEALTHY_BMI_MIN).toBe(18.5);
    expect(HEALTHY_BMI_MAX).toBe(25);
    const r = calculateIdealWeight({ sex: 'male', system: 'metric', heightCm: 180 });
    expect(r.bmiMin).toBeCloseTo(18.5 * 1.8 * 1.8, 1);
    expect(r.bmiMax).toBeCloseTo(25 * 1.8 * 1.8, 1);
  });

  it('publishes the age span the calculator accepts, and where the adult formulas start', () => {
    expect([AGE_MIN, AGE_MAX]).toEqual([2, 80]);
    expect(ADULT_MIN_AGE).toBe(18);
  });

  it('falls back to each base weight below 5 ft rather than going negative', () => {
    const r = calculateIdealWeight({ sex: 'female', system: 'imperial', heightFt: 4, heightIn: 6 });
    expect(r.devine).toBeCloseTo(45.5 * 2.2046226218, 1);
    for (const v of [r.robinson, r.miller, r.devine, r.hamwi]) expect(v).toBeGreaterThan(0);
  });
});

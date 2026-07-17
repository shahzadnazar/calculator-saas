import { describe, it, expect } from 'vitest';
import { calculateBmr, mifflinStJeorBMR } from './bmr';

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

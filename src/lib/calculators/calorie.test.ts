import { describe, it, expect } from 'vitest';
import { calculateCalories } from './calorie';

describe('calorie / TDEE calculator', () => {
  it('computes BMR and maintenance for men (Mifflin-St Jeor)', () => {
    const r = calculateCalories({
      sex: 'male',
      age: 30,
      system: 'metric',
      heightCm: 180,
      weightKg: 80,
      activity: 1.2,
    });
    expect(r.bmr).toBe(1780);
    expect(r.maintenance).toBe(2136);
    expect(r.loss).toBe(1636);
    expect(r.gain).toBe(2636);
  });

  it('computes BMR for women', () => {
    const r = calculateCalories({
      sex: 'female',
      age: 30,
      system: 'metric',
      heightCm: 165,
      weightKg: 60,
      activity: 1.55,
    });
    expect(r.bmr).toBe(1320); // 600 + 1031.25 - 150 - 161 = 1320.25
  });

  it('supports imperial units', () => {
    const r = calculateCalories({
      sex: 'male',
      age: 25,
      system: 'imperial',
      heightFt: 5,
      heightIn: 11,
      weightLb: 176,
      activity: 1.375,
    });
    expect(r.bmr).toBeGreaterThan(1600);
    expect(r.maintenance).toBeGreaterThan(r.bmr);
  });

  it('guards invalid input', () => {
    const r = calculateCalories({ sex: 'male', age: 0, system: 'metric', heightCm: 0, weightKg: 0, activity: 1.2 });
    expect(Number.isNaN(r.bmr)).toBe(true);
  });
});

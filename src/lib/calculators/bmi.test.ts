import { describe, it, expect } from 'vitest';
import { calculateBmi, classifyBmi } from './bmi';

describe('bmi calculator', () => {
  it('computes metric BMI', () => {
    const r = calculateBmi({ system: 'metric', heightCm: 180, weightKg: 75 });
    expect(r.bmi).toBeCloseTo(23.1, 1);
    expect(r.category).toBe('Normal weight');
  });

  it('computes imperial BMI', () => {
    const r = calculateBmi({ system: 'imperial', heightFt: 5, heightIn: 11, weightLb: 160 });
    expect(r.bmi).toBeCloseTo(22.3, 1);
    expect(r.category).toBe('Normal weight');
    expect(r.unitLabel).toBe('lb');
  });

  it('classifies WHO categories at the boundaries', () => {
    expect(classifyBmi(18.4).category).toBe('Underweight');
    expect(classifyBmi(18.5).category).toBe('Normal weight');
    expect(classifyBmi(24.9).category).toBe('Normal weight');
    expect(classifyBmi(25).category).toBe('Overweight');
    expect(classifyBmi(30).category).toBe('Obesity');
  });

  it('returns a healthy weight range for the height', () => {
    const r = calculateBmi({ system: 'metric', heightCm: 170, weightKg: 80 });
    // 18.5..24.9 * 1.7^2
    expect(r.healthyMin).toBeCloseTo(53.5, 0);
    expect(r.healthyMax).toBeCloseTo(71.9, 0);
    expect(r.category).toBe('Overweight');
  });

  it('guards against invalid input', () => {
    const r = calculateBmi({ system: 'metric', heightCm: 0, weightKg: 0 });
    expect(Number.isNaN(r.bmi)).toBe(true);
  });
});

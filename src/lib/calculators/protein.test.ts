import { describe, it, expect } from 'vitest';
import { calculateProtein } from './protein';

describe('protein calculator', () => {
  it('computes grams for the selected goal (metric)', () => {
    const r = calculateProtein({ system: 'metric', weightKg: 80, goalKey: 'strength' });
    expect(r.grams).toBe(Math.round(80 * 1.8)); // 144
  });

  it('supports imperial weight', () => {
    const r = calculateProtein({ system: 'imperial', weightLb: 176, goalKey: 'sedentary' });
    // 176 lb ≈ 79.83 kg × 0.8 ≈ 64
    expect(r.grams).toBeCloseTo(64, 0);
  });

  it('returns all goals for comparison', () => {
    const r = calculateProtein({ system: 'metric', weightKg: 70, goalKey: 'active' });
    expect(r.perGoal.length).toBe(5);
    expect(r.perGoal.find((g) => g.key === 'active')?.grams).toBe(Math.round(70 * 1.2));
  });

  it('guards invalid weight', () => {
    const r = calculateProtein({ system: 'metric', weightKg: 0, goalKey: 'active' });
    expect(Number.isNaN(r.grams)).toBe(true);
  });
});

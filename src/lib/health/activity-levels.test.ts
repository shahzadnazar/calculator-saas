import { describe, it, expect } from 'vitest';
import { ACTIVITY_LEVELS } from './activity-levels';

/**
 * The shared activity multipliers are consumed by BOTH the Calorie and BMR
 * calculators, so their exact values/labels are pinned here directly (not only
 * indirectly through a calculator). Changing any value or label changes both
 * calculators — this test makes that intentional.
 */
describe('ACTIVITY_LEVELS (shared health-domain constant)', () => {
  it('defines the five Mifflin-St Jeor activity bands, 1.2 … 1.9 ascending', () => {
    expect(ACTIVITY_LEVELS.map((l) => l.value)).toEqual([1.2, 1.375, 1.55, 1.725, 1.9]);
  });

  it('pins the canonical labels', () => {
    expect(ACTIVITY_LEVELS.map((l) => l.label)).toEqual([
      'Sedentary (little or no exercise)',
      'Light (exercise 1–3 days/week)',
      'Moderate (exercise 3–5 days/week)',
      'Active (exercise 6–7 days/week)',
      'Very active (hard exercise / physical job)',
    ]);
  });

  it('is strictly ascending and every multiplier is a positive finite number', () => {
    for (let i = 0; i < ACTIVITY_LEVELS.length; i++) {
      expect(Number.isFinite(ACTIVITY_LEVELS[i].value)).toBe(true);
      expect(ACTIVITY_LEVELS[i].value).toBeGreaterThan(1);
      if (i > 0) expect(ACTIVITY_LEVELS[i].value).toBeGreaterThan(ACTIVITY_LEVELS[i - 1].value);
      expect(ACTIVITY_LEVELS[i].label.length).toBeGreaterThan(0);
    }
  });
});

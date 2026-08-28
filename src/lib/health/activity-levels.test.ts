import { describe, it, expect } from 'vitest';
import { ACTIVITY_LEVELS, ACTIVITY_BANDS, ACTIVITY_BAND_NOTES } from './activity-levels';

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

describe('ACTIVITY_BANDS (the six-row table)', () => {
  it('carries the reference’s six multipliers, in order', () => {
    expect(ACTIVITY_BANDS.map((b) => b.value)).toEqual([1.2, 1.375, 1.465, 1.55, 1.725, 1.9]);
  });

  it('carries the reference’s own wording', () => {
    expect(ACTIVITY_BANDS.map((b) => b.label)).toEqual([
      'Sedentary: little or no exercise',
      'Exercise 1-3 times/week',
      'Exercise 4-5 times/week',
      'Daily exercise or intense exercise 3-4 times/week',
      'Intense exercise 6-7 times/week',
      'Very intense exercise daily, or physical job',
    ]);
  });

  it('rises monotonically and never drops to or below 1', () => {
    for (let i = 0; i < ACTIVITY_BANDS.length; i++) {
      expect(ACTIVITY_BANDS[i].value).toBeGreaterThan(1);
      if (i > 0) expect(ACTIVITY_BANDS[i].value).toBeGreaterThan(ACTIVITY_BANDS[i - 1].value);
    }
  });

  it('never disagrees with the select about a multiplier they both carry', () => {
    // The table adds 1.465; everything else must be identical, or the same activity would
    // mean two different numbers depending on which calculator you opened.
    const shared = ACTIVITY_BANDS.map((b) => b.value).filter((v) => v !== 1.465);
    expect(shared).toEqual(ACTIVITY_LEVELS.map((l) => l.value));
  });

  it('defines its own terms in footnotes', () => {
    expect(ACTIVITY_BAND_NOTES).toHaveLength(3);
    for (const n of ACTIVITY_BAND_NOTES) expect(n.length).toBeGreaterThan(10);
  });
});

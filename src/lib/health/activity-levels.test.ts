import { describe, it, expect } from 'vitest';
import {
  ACTIVITY_BANDS,
  ACTIVITY_BAND_NOTES,
  DEFAULT_ACTIVITY,
  activityBand,
} from './activity-levels';

describe('ACTIVITY_BANDS (the one shared table)', () => {
  it('carries the reference’s six multipliers, in order', () => {
    expect(ACTIVITY_BANDS.map((b) => b.value)).toEqual([1.2, 1.375, 1.465, 1.55, 1.725, 1.9]);
  });

  it('carries the row wording the BMR table prints', () => {
    expect(ACTIVITY_BANDS.map((b) => b.label)).toEqual([
      'Sedentary: little or no exercise',
      'Exercise 1-3 times/week',
      'Exercise 4-5 times/week',
      'Daily exercise or intense exercise 3-4 times/week',
      'Intense exercise 6-7 times/week',
      'Very intense exercise daily, or physical job',
    ]);
  });

  it('carries the option wording the calorie dropdown shows, which names each band', () => {
    expect(ACTIVITY_BANDS.map((b) => b.selectLabel)).toEqual([
      'Sedentary: little or no exercise',
      'Light: exercise 1-3 times/week',
      'Moderate: exercise 4-5 times/week',
      'Active: daily exercise or intense exercise 3-4 times/week',
      'Very Active: intense exercise 6-7 times/week',
      'Extra Active: very intense exercise daily, or physical job',
    ]);
  });

  it('rises monotonically and never drops to or below 1', () => {
    for (let i = 0; i < ACTIVITY_BANDS.length; i++) {
      expect(ACTIVITY_BANDS[i].value).toBeGreaterThan(1);
      if (i > 0) expect(ACTIVITY_BANDS[i].value).toBeGreaterThan(ACTIVITY_BANDS[i - 1].value);
    }
  });

  it('defaults to Moderate', () => {
    expect(DEFAULT_ACTIVITY).toBe(1.465);
    expect(activityBand(DEFAULT_ACTIVITY)?.selectLabel).toBe('Moderate: exercise 4-5 times/week');
  });

  it('does not pretend an unlisted multiplier is a band', () => {
    expect(activityBand(1.3)).toBeUndefined();
  });

  it('defines its own terms in footnotes', () => {
    expect(ACTIVITY_BAND_NOTES).toHaveLength(3);
    expect(ACTIVITY_BAND_NOTES[0]).toMatch(/^Exercise: 15-30 minutes/);
  });
});

import { describe, it, expect } from 'vitest';
import {
  calculateCalories,
  zigzagSchedules,
  CALORIE_GOAL_ROWS,
  WEEKDAYS,
  MINIMUM_DAILY_CALORIES,
  type CalorieInput,
} from './calorie';

/** The reference's metric case: 25, male, 180 cm, 65 kg, Moderate (1.465). */
const metric = (over: Partial<CalorieInput> = {}): CalorieInput => ({
  sex: 'male',
  age: 25,
  system: 'metric',
  heightCm: 180,
  weightKg: 65,
  activity: 1.465,
  ...over,
});

const by = (r: ReturnType<typeof calculateCalories>, key: string) => r.goals.find((g) => g.key === key)!;

describe('the reference report reproduces exactly', () => {
  const r = calculateCalories(metric());

  it('maintains at 2,425 — a BMR of 1,655 at the Moderate band', () => {
    expect(r.bmr).toBe(1655);
    expect(r.maintenance).toBe(2425);
  });

  it('prints the three loss rows and their percentages', () => {
    expect(by(r, 'mild-loss')).toMatchObject({ calories: 2175, percent: 90, rateMetric: '0.25 kg/week' });
    expect(by(r, 'loss')).toMatchObject({ calories: 1925, percent: 79, rateMetric: '0.5 kg/week' });
    expect(by(r, 'extreme-loss')).toMatchObject({ calories: 1425, percent: 59, rateMetric: '1 kg/week' });
  });

  it('prints the three gain rows and their percentages', () => {
    expect(by(r, 'mild-gain')).toMatchObject({ calories: 2675, percent: 110 });
    expect(by(r, 'gain')).toMatchObject({ calories: 2925, percent: 121 });
    expect(by(r, 'fast-gain')).toMatchObject({ calories: 3425, percent: 141 });
  });

  it('maintenance is the 100% row', () => {
    expect(by(r, 'maintain')).toMatchObject({ calories: 2425, percent: 100 });
  });

  it('warns because the extreme rate falls under the minimum', () => {
    expect(r.belowMinimum).toBe(true);
    expect(by(r, 'extreme-loss').calories).toBeLessThan(MINIMUM_DAILY_CALORIES);
  });
});

describe('the goal rows', () => {
  it('are the reference’s seven, in its order', () => {
    expect(CALORIE_GOAL_ROWS.map((g) => g.label)).toEqual([
      'Maintain weight',
      'Mild weight loss',
      'Weight loss',
      'Extreme weight loss',
      'Mild weight gain',
      'Weight gain',
      'Fast weight gain',
    ]);
  });

  it('label the SAME three deltas in each unit system', () => {
    // 0.25 kg/week and 0.5 lb/week are one 250 kcal/day delta wearing two labels.
    for (const row of CALORIE_GOAL_ROWS) {
      if (row.direction === 'maintain') {
        expect(row.delta).toBe(0);
        continue;
      }
      const mirror = CALORIE_GOAL_ROWS.find(
        (r) => r.key !== row.key && r.rateMetric === row.rateMetric && r.direction !== row.direction,
      );
      expect(mirror!.delta).toBe(-row.delta);
    }
  });

  it('use the three conventional deltas and nothing else', () => {
    expect(new Set(CALORIE_GOAL_ROWS.map((g) => Math.abs(g.delta)))).toEqual(new Set([0, 250, 500, 1000]));
  });
});

describe('zigzag schedules', () => {
  const [weekend, gradual] = zigzagSchedules(2425);

  it('offers two schedules over a Sunday-first week', () => {
    expect(zigzagSchedules(2425)).toHaveLength(2);
    expect(weekend.days.map((d) => d.day)).toEqual([...WEEKDAYS]);
  });

  it('both weeks total EXACTLY seven days at the target — cycling never changes the total', () => {
    for (const schedule of zigzagSchedules(2425)) {
      const total = schedule.days.reduce((sum, d) => sum + d.calories, 0);
      expect(total).toBe(2425 * 7);
    }
  });

  it('the first has two higher days and five lower', () => {
    const higher = weekend.days.filter((d) => d.calories > 2425);
    const lower = weekend.days.filter((d) => d.calories < 2425);
    expect(higher).toHaveLength(2);
    expect(lower).toHaveLength(5);
    expect(higher.map((d) => d.day)).toEqual(['Sunday', 'Saturday']);
  });

  it('the second moves gradually, never jumping more than 150 between adjacent days', () => {
    const values = gradual.days.map((d) => d.calories);
    for (let i = 1; i < values.length; i++) {
      expect(Math.abs(values[i] - values[i - 1])).toBeLessThanOrEqual(150);
    }
  });

  it('keeps the high-to-low gap in the 200–300 calorie band the method is described with', () => {
    for (const schedule of zigzagSchedules(2425)) {
      const values = schedule.days.map((d) => d.calories);
      const gap = Math.max(...values) - Math.min(...values);
      expect(gap).toBeGreaterThanOrEqual(200);
      expect(gap).toBeLessThanOrEqual(300);
    }
  });

  it('is empty rather than fabricated when there is no target', () => {
    expect(zigzagSchedules(Number.NaN)).toEqual([]);
  });
});

describe('guards', () => {
  it('returns nothing usable when a measurement is missing', () => {
    for (const bad of [metric({ weightKg: 0 }), metric({ heightCm: 0 }), metric({ age: 0 })]) {
      const r = calculateCalories(bad);
      expect(Number.isNaN(r.bmr)).toBe(true);
      expect(r.goals).toEqual([]);
      expect(r.zigzag).toEqual([]);
    }
  });

  it('returns nothing usable for Katch-McArdle without a body fat percentage', () => {
    const r = calculateCalories(metric({ formula: 'katch-mcardle' }));
    expect(Number.isNaN(r.maintenance)).toBe(true);
  });

  it('honours the other two equations', () => {
    expect(calculateCalories(metric({ formula: 'harris-benedict' })).bmr).toBe(1681);
    expect(calculateCalories(metric({ formula: 'katch-mcardle', bodyFatPct: 20 })).bmr).toBe(1493);
  });

  it('falls back to the default band rather than trusting an unlisted multiplier', () => {
    expect(calculateCalories(metric({ activity: 99 })).maintenance).toBe(calculateCalories(metric()).maintenance);
  });
});

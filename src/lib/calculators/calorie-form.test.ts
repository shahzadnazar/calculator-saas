import { describe, it, expect } from 'vitest';
import { calculateCalories, ACTIVITY_LEVELS } from './calorie';
import {
  validateCalorieValues,
  computeCalorie,
  describeCalorieResult,
  formatCalories,
  isUsableCalories,
  CALORIE_GOALS,
  DEFAULT_ACTIVITY,
  DEFAULT_GOAL_KEY,
  calorieBinding,
  type CalorieValues,
} from './calorie-form';

/**
 * Calorie binding — pure surface. Mifflin-St Jeor BMR × activity + the goal deltas
 * stay in the reviewed pure `calorie.ts`; here we pin the personal-input
 * validation, the PRESERVED figures (delegated verbatim to `calculateCalories`),
 * the goal SELECTOR that only picks an existing value as the headline, the
 * finite+positive guards, and the concise description.
 */

const mMetric = (o: Partial<Record<string, string>> = {}): CalorieValues =>
  ({ sex: 'male', system: 'metric', age: '30', heightCm: '180', weightKg: '80', activity: '1.55', goalKey: 'maintain', ...o } as CalorieValues);
const fMetric = (o: Partial<Record<string, string>> = {}): CalorieValues =>
  ({ sex: 'female', system: 'metric', age: '30', heightCm: '165', weightKg: '60', activity: '1.55', goalKey: 'maintain', ...o } as CalorieValues);
const mImperial = (o: Partial<Record<string, string>> = {}): CalorieValues =>
  ({ sex: 'male', system: 'imperial', age: '25', heightFt: '5', heightIn: '11', weightLb: '176', activity: '1.375', goalKey: 'maintain', ...o } as CalorieValues);

describe('validateCalorieValues', () => {
  it('accepts valid metric + imperial personal inputs', () => {
    expect(validateCalorieValues(mMetric())).toEqual({ ok: true });
    expect(validateCalorieValues(fMetric())).toEqual({ ok: true });
    expect(validateCalorieValues(mImperial())).toEqual({ ok: true });
  });
  it('flags missing age / height / weight (never Number()||0)', () => {
    const r = validateCalorieValues(mMetric({ age: '', heightCm: '', weightKg: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors!.age).toBe('Enter your age.');
      expect(r.fieldErrors!.heightCm).toBe('Enter your height.');
      expect(r.fieldErrors!.weightKg).toBe('Enter your weight.');
    }
  });
  it('rejects zero / negative personal inputs', () => {
    for (const bad of ['0', '-5']) {
      expect(validateCalorieValues(mMetric({ weightKg: bad })).ok).toBe(false);
    }
  });
  it('applies the shared imperial-height semantics (0–11 inches)', () => {
    const over = validateCalorieValues(mImperial({ heightIn: '12' }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fieldErrors!.height).toMatch(/0 to 11/);
  });
  it('never validates activity or goal (both are selects with valid options)', () => {
    expect(validateCalorieValues(mMetric({ activity: 'nonsense', goalKey: 'nonsense' })).ok).toBe(true);
  });
  it('rejects a non-usable selected target with plain guidance (no internals)', () => {
    // Tiny valid inputs → a large loss goal drops the target below zero.
    const r = validateCalorieValues(mMetric({ goalKey: 'loss', age: '1', heightCm: '1', weightKg: '1' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.formError).toBe('These details do not produce a usable calorie estimate. Check your entries and try again.');
      expect(r.formError).not.toMatch(/NaN|Infinity|BMR formula|internal/i);
    }
  });
});

describe('computeCalorie — preserved figures, goal picks an existing value', () => {
  it('delegates every figure verbatim to calculateCalories (metric)', () => {
    const values = mMetric({ activity: '1.2' });
    const mine = computeCalorie(values);
    const pure = calculateCalories({ sex: 'male', age: 30, system: 'metric', heightCm: 180, weightKg: 80, activity: 1.2 });
    expect(mine.bmr).toBe(pure.bmr); // 1780
    expect(mine.maintenance).toBe(pure.maintenance); // 2136
    expect(mine.loss).toBe(pure.loss); // 1636
    expect(mine.gain).toBe(pure.gain); // 2636
    expect(mine.mildLoss).toBe(pure.mildLoss);
    expect(mine.mildGain).toBe(pure.mildGain);
  });

  it('the selected goal maps to the matching preserved field', () => {
    const cases: Array<[string, keyof ReturnType<typeof calculateCalories>]> = [
      ['maintain', 'maintenance'],
      ['mild-loss', 'mildLoss'],
      ['loss', 'loss'],
      ['mild-gain', 'mildGain'],
      ['gain', 'gain'],
    ];
    for (const [goalKey, field] of cases) {
      const r = computeCalorie(mMetric({ goalKey }));
      expect(r.target).toBe(r[field]);
    }
  });

  it('maintenance = round(BMR × activity) for every shared activity level', () => {
    for (const level of ACTIVITY_LEVELS) {
      const r = computeCalorie(mMetric({ activity: String(level.value) }));
      expect(Number.isFinite(r.maintenance)).toBe(true);
      expect(r.maintenance).toBe(Math.round(r.bmr * level.value));
    }
  });

  it('supports imperial and echoes the goal metadata', () => {
    const r = computeCalorie(mImperial({ goalKey: 'loss' }));
    expect(Number.isFinite(r.target)).toBe(true);
    expect(r.target).toBeGreaterThan(0);
    expect(r.goalLabel).toBe('Weight loss (−500 kcal/day)');
    expect(r.goalAnnounce).toBe('for weight loss');
  });

  it('fabricates no range/average field — only the reviewed figures + goal metadata', () => {
    const keys = Object.keys(computeCalorie(mMetric())).sort();
    expect(keys).toEqual(
      ['bmr', 'gain', 'goalAnnounce', 'goalKey', 'goalLabel', 'goalNote', 'loss', 'maintenance', 'mildGain', 'mildLoss', 'target'].sort(),
    );
    expect(keys).not.toContain('average');
    expect(keys).not.toContain('range');
    expect(keys).not.toContain('min');
  });

  it('guards invalid personal input (all figures NaN)', () => {
    const r = computeCalorie(mMetric({ age: '0', heightCm: '0', weightKg: '0' }));
    for (const v of [r.bmr, r.maintenance, r.loss, r.gain, r.target]) expect(Number.isNaN(v)).toBe(true);
  });
});

describe('resultValue + formatting guards', () => {
  it('passes a usable target through, gates a non-usable one to NaN', () => {
    expect(calorieBinding.resultValue(computeCalorie(mMetric()))).toBeGreaterThan(0);
    const bad = computeCalorie(mMetric({ goalKey: 'loss', age: '1', heightCm: '1', weightKg: '1' }));
    expect(bad.target).toBeLessThan(0);
    expect(Number.isNaN(calorieBinding.resultValue(bad))).toBe(true);
  });
  it('isUsableCalories rejects ≤ 0 and non-finite', () => {
    for (const ok of [1, 2136, 5000]) expect(isUsableCalories(ok)).toBe(true);
    for (const bad of [0, -1, NaN, Infinity]) expect(isUsableCalories(bad)).toBe(false);
  });
  it('formatCalories renders thousands separators and dashes non-usable values', () => {
    expect(formatCalories(2136)).toBe('2,136');
    expect(formatCalories(-5)).toBe('—');
    expect(formatCalories(0)).toBe('—');
    expect(formatCalories(NaN)).toBe('—');
  });
});

describe('describeCalorieResult', () => {
  it('announces the selected goal target only, never the comparison', () => {
    const s = describeCalorieResult(computeCalorie(mMetric({ activity: '1.2', goalKey: 'maintain' })));
    expect(s).toBe('Your estimated daily calorie target for maintaining weight is 2,136 kilocalories per day.');
    expect(s).not.toMatch(/mild|loss|gain|bmr/i);
  });
});

describe('CALORIE_GOALS defaults + scenario labels (R7C-2B.1)', () => {
  it('has five goals, defaults to maintain, and the default activity is Moderate (1.55)', () => {
    expect(CALORIE_GOALS.map((g) => g.key)).toEqual(['maintain', 'mild-loss', 'loss', 'mild-gain', 'gain']);
    expect(DEFAULT_GOAL_KEY).toBe('maintain');
    expect(DEFAULT_ACTIVITY).toBe(1.55);
    expect(ACTIVITY_LEVELS.some((a) => a.value === DEFAULT_ACTIVITY)).toBe(true);
  });
  it('labels the loss/gain scenarios with their exact kcal adjustments', () => {
    expect(CALORIE_GOALS.map((g) => g.label)).toEqual([
      'Maintain weight',
      'Mild weight loss (−250 kcal/day)',
      'Weight loss (−500 kcal/day)',
      'Mild weight gain (+250 kcal/day)',
      'Weight gain (+500 kcal/day)',
    ]);
    // Every interpretation frames the result as a calculation scenario.
    for (const g of CALORIE_GOALS) expect(g.note).toMatch(/selected calculation scenario/i);
  });
});

describe('non-positive comparison handling (R7C-2B.1)', () => {
  // Tiny-but-valid inputs: maintenance is positive but the −500 loss goal is negative.
  const edge = (goalKey = 'maintain') => mMetric({ age: '80', heightCm: '100', weightKg: '10', activity: '1.2', goalKey });

  it('produces a positive maintenance while an unselected goal is non-positive', () => {
    const r = computeCalorie(edge('maintain'));
    expect(r.maintenance).toBeGreaterThan(0);
    expect(r.loss).toBeLessThanOrEqual(0); // −500 goal underwater for these inputs
    expect(isUsableCalories(r.target)).toBe(true); // selected (maintain) is fine
  });

  it('selecting the non-positive goal makes the result invalid (not another goal shown as selected)', () => {
    const r = validateCalorieValues(edge('loss'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.formError).toContain('usable calorie estimate');
    expect(Number.isNaN(calorieBinding.resultValue(computeCalorie(edge('loss'))))).toBe(true);
  });
});

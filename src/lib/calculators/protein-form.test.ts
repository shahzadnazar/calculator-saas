import { describe, it, expect } from 'vitest';
import { calculateProtein } from './protein';
import {
  validateProteinValues,
  computeProtein,
  describeProteinResult,
  metricWeightToImperial,
  imperialWeightToMetric,
  DEFAULT_GOAL_KEY,
  type ProteinValues,
} from './protein-form';

/**
 * Protein binding — pure surface. The grams-per-kg factors + the rounding stay in
 * the reviewed pure `protein.ts`; here we pin the binding's weight validation, the
 * PRESERVED per-goal output (delegated verbatim to `calculateProtein`, no invented
 * range), the concise primary-only description, and weight conversion.
 */

const metric = (weightKg = '75', goalKey = DEFAULT_GOAL_KEY): ProteinValues => ({ system: 'metric', weightKg, goalKey });
const imperial = (weightLb = '165', goalKey = DEFAULT_GOAL_KEY): ProteinValues => ({
  system: 'imperial',
  weightLb,
  goalKey,
});

describe('validateProteinValues', () => {
  it('accepts valid metric + imperial weight', () => {
    expect(validateProteinValues(metric())).toEqual({ ok: true });
    expect(validateProteinValues(imperial())).toEqual({ ok: true });
  });
  it('rejects missing / zero / negative / non-finite weight (metric)', () => {
    for (const weightKg of ['', '0', '-5', 'x']) {
      const r = validateProteinValues(metric(weightKg));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors!.weightKg).toBeTruthy();
    }
  });
  it('rejects missing / non-positive weight (imperial)', () => {
    for (const weightLb of ['', '0', '-1']) {
      const r = validateProteinValues(imperial(weightLb));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors!.weightLb).toBeTruthy();
    }
  });
  it('never validates the goal (a select always holds a valid option)', () => {
    // An unknown goal key still validates — validation only guards the weight.
    expect(validateProteinValues(metric('75', 'nonsense'))).toEqual({ ok: true });
  });
});

describe('computeProtein — preserved factors, single value per goal (no invented range)', () => {
  it('delegates grams verbatim to the reviewed calculateProtein', () => {
    const values = metric('80', 'strength');
    const mine = computeProtein(values);
    const pure = calculateProtein({ system: 'metric', weightKg: 80, goalKey: 'strength' });
    expect(mine.grams).toBe(pure.grams); // 144
    expect(mine.grams).toBe(Math.round(80 * 1.8));
    expect(mine.perGoal.map((g) => g.grams)).toEqual(pure.perGoal.map((g) => g.grams));
  });

  it('returns every goal with its g/kg factor for comparison', () => {
    const r = computeProtein(metric('75'));
    expect(r.perGoal.length).toBe(5);
    expect(r.perGoal.map((g) => g.key)).toEqual(['sedentary', 'active', 'endurance', 'strength', 'cutting']);
    expect(r.perGoal.map((g) => g.factor)).toEqual([0.8, 1.2, 1.4, 1.8, 2.2]);
    // Each goal's grams is a single finite value, distinct across goals (a real spread).
    for (const g of r.perGoal) expect(Number.isFinite(g.grams)).toBe(true);
    expect(new Set(r.perGoal.map((g) => g.grams)).size).toBe(5);
  });

  it('surfaces the selected goal as the primary, agreeing with its row', () => {
    const r = computeProtein(metric('75', 'endurance'));
    expect(r.goalKey).toBe('endurance');
    expect(r.factor).toBe(1.4);
    expect(r.grams).toBe(Math.round(75 * 1.4)); // 105
    expect(r.perGoal.find((g) => g.key === 'endurance')!.grams).toBe(r.grams);
  });

  it('does NOT fabricate a range/min-max headline field', () => {
    const keys = Object.keys(computeProtein(metric('75'))).sort();
    expect(keys).toEqual(['factor', 'goalKey', 'grams', 'label', 'perGoal']);
    expect(keys).not.toContain('min');
    expect(keys).not.toContain('max');
    expect(keys).not.toContain('range');
  });

  it('converts imperial weight before applying the factor', () => {
    const r = computeProtein(imperial('176', 'sedentary'));
    // 176 lb ≈ 79.83 kg × 0.8 ≈ 64
    expect(r.grams).toBeCloseTo(64, 0);
  });

  it('guards a non-positive weight — grams stay NaN, never 0', () => {
    const r = computeProtein(metric('0'));
    expect(Number.isNaN(r.grams)).toBe(true);
    for (const g of r.perGoal) expect(Number.isNaN(g.grams)).toBe(true);
  });

  it('falls back to the first goal when the key is unknown (matches the pure module)', () => {
    const r = computeProtein(metric('75', 'nonsense'));
    expect(r.goalKey).toBe('sedentary');
    expect(r.grams).toBe(Math.round(75 * 0.8)); // 60
  });
});

describe('describeProteinResult', () => {
  it('announces only the primary daily amount + unit (never the goal table)', () => {
    const s = describeProteinResult(computeProtein(metric('75', 'active')));
    expect(s).toBe('Your estimated daily protein target is about 90 grams per day.');
    expect(s).not.toMatch(/sedentary|endurance|strength|cutting|g\/kg|table/i);
  });
});

describe('weight conversion', () => {
  it('metric ↔ imperial round-trips within a rounding tolerance', () => {
    const lb = metricWeightToImperial(75);
    expect(lb!).toBeGreaterThan(165);
    expect(lb!).toBeLessThan(166);
    const kg = imperialWeightToMetric(165);
    expect(kg!).toBeGreaterThan(74);
    expect(kg!).toBeLessThan(76);
  });
  it('empty / non-positive weight stays null (never fabricated)', () => {
    expect(metricWeightToImperial(null)).toBe(null);
    expect(metricWeightToImperial(0)).toBe(null);
    expect(imperialWeightToMetric(null)).toBe(null);
    expect(imperialWeightToMetric(-3)).toBe(null);
  });
});

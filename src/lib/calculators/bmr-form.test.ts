import { describe, it, expect } from 'vitest';
import {
  validateBmrValues,
  computeBmr,
  bmrActivityEstimates,
  describeBmrResult,
  metricToImperial,
  imperialToMetric,
  type BmrValues,
} from './bmr-form';
import { ACTIVITY_LEVELS } from './calorie';

/**
 * BMR binding — pure surface. The runtime + DOM behaviour (first-calc gate,
 * live-after-first, focus, announcement, reset, unit switching) is covered by
 * the form-runtime unit tests and the BMR E2E; here we pin the BMR-specific
 * parsing, validation, computation, activity estimates, conversion and the
 * accessible description. BMR maths itself stays in the reviewed pure `bmr.ts`.
 */

const metric = (over: Partial<Extract<BmrValues, { system: 'metric' }>> = {}): BmrValues => ({
  sex: 'male',
  system: 'metric',
  age: '30',
  heightCm: '180',
  weightKg: '80',
  ...over,
});
const imperial = (over: Partial<Extract<BmrValues, { system: 'imperial' }>> = {}): BmrValues => ({
  sex: 'female',
  system: 'imperial',
  age: '40',
  heightFt: '5',
  heightIn: '5',
  weightLb: '140',
  ...over,
});

/* ---- Validation: presence + finiteness (never Number()||0) -------------- */

describe('validateBmrValues', () => {
  it('accepts complete valid metric + imperial values', () => {
    expect(validateBmrValues(metric())).toEqual({ ok: true });
    expect(validateBmrValues(imperial())).toEqual({ ok: true });
  });

  it('flags every empty field (not silently zeroed)', () => {
    const r = validateBmrValues(metric({ age: '', heightCm: '', weightKg: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors!)).toEqual(['age', 'heightCm', 'weightKg']);
  });

  it('rejects age missing / zero / non-finite', () => {
    for (const age of ['', '0', '-3', 'abc']) {
      const r = validateBmrValues(metric({ age }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors!.age).toBeTruthy();
    }
  });

  it('rejects height missing / zero / non-finite', () => {
    for (const heightCm of ['', '0', '-1', 'x']) {
      const r = validateBmrValues(metric({ heightCm }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors!.heightCm).toBeTruthy();
    }
  });

  it('rejects weight missing / zero / non-finite', () => {
    for (const weightKg of ['', '0', '-2', 'y']) {
      const r = validateBmrValues(metric({ weightKg }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors!.weightKg).toBeTruthy();
    }
  });

  it('applies the accepted BMI imperial-height semantics', () => {
    // inches must be 0–11 (12+ is an error, never normalized)
    const over = validateBmrValues(imperial({ heightIn: '12' }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fieldErrors!.height).toMatch(/0 to 11/);
    // feet must be a whole number
    const frac = validateBmrValues(imperial({ heightFt: '5.5', heightIn: '' }));
    expect(frac.ok).toBe(false);
    if (!frac.ok) expect(frac.fieldErrors!.height).toMatch(/whole number/);
    // both empty → required
    const none = validateBmrValues(imperial({ heightFt: '', heightIn: '' }));
    expect(none.ok).toBe(false);
    // 0 ft 11 in is a valid positive height
    expect(validateBmrValues(imperial({ heightFt: '0', heightIn: '11' })).ok).toBe(true);
  });

  it('imposes no restrictive medical range (unusual but positive values pass)', () => {
    expect(validateBmrValues(metric({ age: '5', heightCm: '95', weightKg: '15' })).ok).toBe(true);
    expect(validateBmrValues(metric({ age: '119', heightCm: '210', weightKg: '200' })).ok).toBe(true);
  });
});

/* ---- Computation + activity outputs + no non-finite --------------------- */

describe('computeBmr', () => {
  it('computes metric BMR via the reviewed pure formula', () => {
    expect(computeBmr(metric()).bmr).toBe(1780); // 10·80 + 6.25·180 − 5·30 + 5
  });
  it('computes imperial BMR', () => {
    const r = computeBmr(imperial());
    expect(r.bmr).toBeGreaterThan(1200);
    expect(Number.isFinite(r.bmr)).toBe(true);
  });
  it('returns a non-finite BMR and NO activity rows for invalid values (guarded)', () => {
    const r = computeBmr(metric({ heightCm: '', weightKg: '', age: '' }));
    expect(Number.isFinite(r.bmr)).toBe(false);
    expect(r.activity).toEqual([]);
  });
});

describe('bmrActivityEstimates', () => {
  it('produces one estimate per canonical activity level = round(BMR × factor)', () => {
    const est = bmrActivityEstimates(1780);
    expect(est).toHaveLength(ACTIVITY_LEVELS.length);
    expect(est[0]).toMatchObject({ value: 1.2, kcal: Math.round(1780 * 1.2) });
    expect(est.at(-1)).toMatchObject({ value: 1.9, kcal: Math.round(1780 * 1.9) });
    // every estimate is a finite integer
    for (const e of est) expect(Number.isInteger(e.kcal)).toBe(true);
  });
  it('is empty for a non-finite BMR', () => {
    expect(bmrActivityEstimates(NaN)).toEqual([]);
    expect(bmrActivityEstimates(Infinity)).toEqual([]);
  });
});

/* ---- Accessible description: concise, BMR only, never the table ---------- */

describe('describeBmrResult', () => {
  it('announces the BMR concisely in words (never the activity table)', () => {
    const s = describeBmrResult({ bmr: 1650, activity: bmrActivityEstimates(1650) });
    expect(s).toBe('Your estimated basal metabolic rate is 1,650 kilocalories per day.');
    expect(s).not.toMatch(/sedentary|active|activity/i);
  });
});

/* ---- Unit conversion (empty stays empty; round-trip tolerance) ---------- */

describe('unit conversion', () => {
  it('metric → imperial and back is within rounding tolerance', () => {
    const imp = metricToImperial({ heightCm: 180, weightKg: 80 });
    expect(imp.heightFt).toBe(5);
    expect(imp.heightIn).toBe(11);
    expect(imp.weightLb).toBeCloseTo(176.4, 1);
    const back = imperialToMetric(imp);
    expect(back.heightCm!).toBeGreaterThan(178);
    expect(back.heightCm!).toBeLessThan(182);
    expect(back.weightKg!).toBeCloseTo(80, 0);
  });
  it('empty or non-positive values stay null (never fabricates a default)', () => {
    expect(metricToImperial({ heightCm: null, weightKg: null })).toEqual({ heightFt: null, heightIn: null, weightLb: null });
    expect(metricToImperial({ heightCm: 0, weightKg: -5 })).toEqual({ heightFt: null, heightIn: null, weightLb: null });
    expect(imperialToMetric({ heightFt: null, heightIn: null, weightLb: null })).toEqual({ heightCm: null, weightKg: null });
  });
});

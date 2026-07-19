import { describe, it, expect } from 'vitest';
import {
  validateIdealWeightValues,
  computeIdealWeight,
  idealWeightAnnouncement,
  metricHeightToImperial,
  imperialHeightToMetric,
  type IdealWeightValues,
} from './ideal-weight-form';

/**
 * Ideal-weight binding — pure surface. BMR maths + the four classic formulas stay
 * in the reviewed pure `ideal-weight.ts`; here we pin the binding's height
 * validation, the preserved multi-formula output (no invented average), the
 * concise range description, and height conversion.
 */

const metric = (heightCm = '175', sex: 'male' | 'female' = 'male'): IdealWeightValues => ({ sex, system: 'metric', heightCm });
const imperial = (heightFt = '5', heightIn = '9', sex: 'male' | 'female' = 'male'): IdealWeightValues => ({
  sex,
  system: 'imperial',
  heightFt,
  heightIn,
});

describe('validateIdealWeightValues', () => {
  it('accepts valid metric + imperial height', () => {
    expect(validateIdealWeightValues(metric())).toEqual({ ok: true });
    expect(validateIdealWeightValues(imperial())).toEqual({ ok: true });
  });
  it('rejects missing / zero / non-finite height', () => {
    for (const heightCm of ['', '0', '-5', 'x']) {
      const r = validateIdealWeightValues(metric(heightCm));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors!.heightCm).toBeTruthy();
    }
  });
  it('applies the shared imperial-height semantics (0–11 inches, whole feet)', () => {
    const over = validateIdealWeightValues(imperial('5', '12'));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fieldErrors!.height).toMatch(/0 to 11/);
    expect(validateIdealWeightValues(imperial('', '')).ok).toBe(false);
    expect(validateIdealWeightValues(imperial('0', '11')).ok).toBe(true);
  });
});

describe('computeIdealWeight — preserved formulas, no invented average', () => {
  it('returns the four named formula estimates + the healthy-BMI range (metric)', () => {
    const r = computeIdealWeight(metric('175'));
    expect(r.unit).toBe('kg');
    expect(r.robinson).toBeCloseTo(68.9, 1);
    expect(r.devine).toBeCloseTo(70.5, 1);
    expect(r.bmiMin).toBeCloseTo(56.7, 1);
    expect(r.bmiMax).toBeCloseTo(76.3, 1);
    // Every named formula is finite and they are genuinely distinct (a comparison).
    for (const v of [r.robinson, r.miller, r.devine, r.hamwi]) expect(Number.isFinite(v)).toBe(true);
    expect(new Set([r.robinson, r.miller, r.devine, r.hamwi]).size).toBeGreaterThan(1);
  });
  it('echoes the selected sex but fabricates no average/single-headline field', () => {
    const keys = Object.keys(computeIdealWeight(metric('175'))).sort();
    expect(keys).toEqual(['bmiMax', 'bmiMin', 'devine', 'hamwi', 'miller', 'robinson', 'sex', 'unit']);
    expect(keys).not.toContain('average');
    expect(computeIdealWeight(metric('175', 'female')).sex).toBe('female');
  });
  it('reports pounds in imperial and differs by sex', () => {
    expect(computeIdealWeight(imperial('5', '9')).unit).toBe('lb');
    expect(computeIdealWeight(metric('175', 'female')).devine).not.toBe(computeIdealWeight(metric('175', 'male')).devine);
  });
  it('changing sex moves the named formulas but leaves the healthy-BMI range identical + correct', () => {
    const male = computeIdealWeight(metric('175', 'male'));
    const female = computeIdealWeight(metric('175', 'female'));
    // Named formulas are sex-dependent…
    expect(female.robinson).not.toBe(male.robinson);
    expect(female.devine).not.toBe(male.devine);
    // …but the healthy-BMI range is height-only, so it is unchanged and still correct.
    expect(female.bmiMin).toBe(male.bmiMin);
    expect(female.bmiMax).toBe(male.bmiMax);
    expect(male.bmiMin).toBeCloseTo(56.7, 1); // 18.5 × 1.75²
    expect(male.bmiMax).toBeCloseTo(76.3, 1); // 24.9 × 1.75²
  });
  it('is non-finite (guarded) for an empty height', () => {
    const r = computeIdealWeight(metric(''));
    for (const v of [r.robinson, r.miller, r.devine, r.hamwi, r.bmiMin, r.bmiMax]) expect(Number.isFinite(v)).toBe(false);
  });
});

describe('idealWeightAnnouncement', () => {
  const male = computeIdealWeight(metric('175', 'male'));
  const female = computeIdealWeight(metric('175', 'female'));
  const taller = computeIdealWeight(metric('185', 'male'));

  it('announces the RANGE concisely on the first result (no previous range)', () => {
    const s = idealWeightAnnouncement(male, null);
    expect(s).toBe('Your healthy-weight range is approximately 56.7 to 76.3 kilograms.');
    expect(s).not.toMatch(/robinson|miller|devine|hamwi|formula estimates/i);
  });

  it('names the sex when only the formulas change (displayed range unchanged)', () => {
    const s = idealWeightAnnouncement(female, { bmiMin: male.bmiMin, bmiMax: male.bmiMax });
    expect(s).toBe('Healthy-weight range: 56.7 to 76.3 kilograms. Formula estimates updated for female.');
    // The formula rows are never spoken — only the primary range + the sex.
    expect(s).not.toMatch(/robinson|miller|devine|hamwi/i);
  });

  it('falls back to the plain range when the range itself changes', () => {
    const s = idealWeightAnnouncement(taller, { bmiMin: male.bmiMin, bmiMax: male.bmiMax });
    expect(s).toMatch(/^Your healthy-weight range is approximately /);
    expect(s).not.toMatch(/formula estimates updated/i);
  });

  it('never includes formula-table values, in either shape', () => {
    for (const prev of [null, { bmiMin: male.bmiMin, bmiMax: male.bmiMax }]) {
      const s = idealWeightAnnouncement(female, prev);
      expect(s).not.toMatch(/robinson|miller|devine|hamwi/i);
    }
  });
});

describe('height conversion', () => {
  it('metric ↔ imperial round-trips within a rounding tolerance', () => {
    expect(metricHeightToImperial(175)).toEqual({ heightFt: 5, heightIn: 9 });
    const cm = imperialHeightToMetric(5, 9);
    expect(cm!).toBeGreaterThan(173);
    expect(cm!).toBeLessThan(177);
  });
  it('empty / non-positive height stays null (never fabricated)', () => {
    expect(metricHeightToImperial(null)).toEqual({ heightFt: null, heightIn: null });
    expect(metricHeightToImperial(0)).toEqual({ heightFt: null, heightIn: null });
    expect(imperialHeightToMetric(null, null)).toBe(null);
  });
});

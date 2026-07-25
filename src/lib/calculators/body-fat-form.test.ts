import { describe, it, expect } from 'vitest';
import { calculateBodyFat } from './body-fat';
import {
  validateBodyFatValues,
  computeBodyFat,
  describeBodyFatResult,
  requiredFields,
  isRealisticBodyFat,
  bodyFatBinding,
  CATEGORY_BANDS,
  type BodyFatValues,
} from './body-fat-form';

/**
 * Body-fat binding — pure surface. The U.S. Navy formula + classification stay in
 * the reviewed pure `body-fat.ts`; here we pin the CONDITIONAL required-field set
 * (hip only for women), the plain-language formula-domain checks, the preserved
 * output, the finiteness/positivity gate, and the concise description.
 */

const maleMetric = (heightCm = '180', neckCm = '38', waistCm = '85', hipCm = ''): BodyFatValues => ({
  sex: 'male',
  system: 'metric',
  heightCm,
  neckCm,
  waistCm,
  hipCm,
});
const femaleMetric = (heightCm = '165', neckCm = '34', waistCm = '74', hipCm = '96'): BodyFatValues => ({
  sex: 'female',
  system: 'metric',
  heightCm,
  neckCm,
  waistCm,
  hipCm,
});
const maleImperial = (heightIn = '71', neckIn = '15', waistIn = '34', hipIn = ''): BodyFatValues => ({
  sex: 'male',
  system: 'imperial',
  heightIn,
  neckIn,
  waistIn,
  hipIn,
});

describe('requiredFields — hip is conditional on sex', () => {
  it('excludes hip for men, includes it for women (per unit system)', () => {
    expect(requiredFields('metric', 'male')).toEqual(['heightCm', 'neckCm', 'waistCm']);
    expect(requiredFields('metric', 'female')).toEqual(['heightCm', 'neckCm', 'waistCm', 'hipCm']);
    expect(requiredFields('imperial', 'male')).toEqual(['heightIn', 'neckIn', 'waistIn']);
    expect(requiredFields('imperial', 'female')).toEqual(['heightIn', 'neckIn', 'waistIn', 'hipIn']);
  });
});

describe('validateBodyFatValues', () => {
  it('accepts valid male (hip empty) and valid female (hip present)', () => {
    expect(validateBodyFatValues(maleMetric())).toEqual({ ok: true });
    expect(validateBodyFatValues(femaleMetric())).toEqual({ ok: true });
    expect(validateBodyFatValues(maleImperial())).toEqual({ ok: true });
  });

  it('flags every missing required field on an empty male form (hip NOT required)', () => {
    const r = validateBodyFatValues(maleMetric('', '', '', ''));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors!.heightCm).toBeTruthy();
      expect(r.fieldErrors!.neckCm).toBeTruthy();
      expect(r.fieldErrors!.waistCm).toBeTruthy();
      expect(r.fieldErrors!.hipCm).toBeUndefined(); // hip is not in the male required set
    }
  });

  it('requires hip ONLY for women (a hidden male hip is excluded)', () => {
    expect(validateBodyFatValues(maleMetric('180', '38', '85', '')).ok).toBe(true); // male, hip empty → fine
    const f = validateBodyFatValues(femaleMetric('165', '34', '74', '')); // female, hip empty → error
    expect(f.ok).toBe(false);
    if (!f.ok) expect(f.fieldErrors!.hipCm).toBe('Enter your hip measurement.');
  });

  it('rejects zero / negative / non-finite measurements', () => {
    for (const bad of ['0', '-5', 'x']) {
      const r = validateBodyFatValues(maleMetric('180', '38', bad));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors!.waistCm).toBeTruthy();
    }
  });

  it('enforces the formula domain in PLAIN language (men: waist > neck)', () => {
    const r = validateBodyFatValues(maleMetric('180', '40', '40')); // waist == neck
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors!.waistCm).toBe('Your waist should be larger than your neck for this method.');
      expect(r.fieldErrors!.waistCm).not.toMatch(/logarithm|log10|argument|domain|NaN/i);
    }
  });

  it('enforces the female formula domain (waist + hip > neck) in plain language', () => {
    const r = validateBodyFatValues(femaleMetric('165', '200', '10', '10')); // waist+hip < neck
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors!.waistCm).toMatch(/waist and hip/i);
      expect(r.fieldErrors!.waistCm).not.toMatch(/logarithm|log10|argument/i);
    }
  });
});

describe('computeBodyFat — preserved formula + classification', () => {
  it('matches the reviewed pure module and echoes the sex (male)', () => {
    const r = computeBodyFat(maleMetric('180', '38', '85'));
    const pure = calculateBodyFat({ sex: 'male', system: 'metric', heightCm: 180, neckCm: 38, waistCm: 85 });
    expect(r.bodyFatPct).toBe(pure.bodyFatPct);
    expect(r.category).toBe(pure.category);
    expect(r.bodyFatPct).toBeCloseTo(16.1, 1);
    expect(r.category).toBe('Fitness');
    expect(r.sex).toBe('male');
  });

  it('uses hip for women and preserves the category', () => {
    const r = computeBodyFat(femaleMetric('165', '34', '74', '96'));
    expect(r.bodyFatPct).toBeCloseTo(26.4, 1);
    expect(r.category).toBe('Average');
    expect(r.sex).toBe('female');
  });

  it('produces a finite result from imperial inches', () => {
    const r = computeBodyFat(maleImperial('71', '15', '34'));
    expect(Number.isFinite(r.bodyFatPct)).toBe(true);
    expect(r.bodyFatPct).toBeGreaterThan(10);
    expect(r.bodyFatPct).toBeLessThan(25);
  });
});

describe('isRealisticBodyFat — result sanity boundary (0 < pct < 100)', () => {
  it('accepts a finite estimate strictly between 0 and 100', () => {
    for (const ok of [0.1, 5, 16.1, 50, 99.9]) expect(isRealisticBodyFat(ok)).toBe(true);
  });
  it('rejects every boundary: ≤ 0, = 100, > 100, NaN, ±Infinity', () => {
    for (const bad of [-91.6, -0.1, 0, 100, 100.1, 150, NaN, Infinity, -Infinity]) {
      expect(isRealisticBodyFat(bad)).toBe(false);
    }
  });
});

describe('resultValue + validate — sanity gate', () => {
  it('passes a normal realistic estimate through', () => {
    expect(bodyFatBinding.resultValue(computeBodyFat(maleMetric('180', '38', '85')))).toBeCloseTo(16.1, 1);
  });
  it('gates a non-positive (finite) estimate to NaN so the invalid state shows', () => {
    // waist barely above neck yields a large NEGATIVE percentage from the Navy formula.
    const r = computeBodyFat(maleMetric('180', '38', '39'));
    expect(r.bodyFatPct).toBeLessThan(0); // reviewed formula really returns this
    expect(Number.isNaN(bodyFatBinding.resultValue(r))).toBe(true);
  });
  it('gates a NaN estimate to NaN', () => {
    const r = computeBodyFat(maleMetric('180', '40', '38')); // waist < neck → NaN from the module
    expect(Number.isNaN(bodyFatBinding.resultValue(r))).toBe(true);
  });
  it('validate rejects a realizable out-of-range estimate with the sanity message (no field error, no jargon)', () => {
    const r = validateBodyFatValues(maleMetric('180', '38', '39')); // in-domain, but negative %
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.formError).toBe(
        'These measurements do not produce a realistic estimate. Check your measurements and try again.',
      );
      expect(r.fieldErrors).toBeUndefined();
      expect(r.formError).not.toMatch(/logarithm|NaN|Infinity|clamp/i);
    }
  });
});

describe('describeBodyFatResult', () => {
  it('announces the percentage + classification, never the scale', () => {
    const s = describeBodyFatResult(computeBodyFat(maleMetric('180', '38', '85')));
    expect(s).toBe('Your estimated body-fat percentage is 16.1 percent, classified as Fitness.');
    expect(s).not.toMatch(/essential|athletes|average|obese|under \d/i);
  });
});

describe('CATEGORY_BANDS', () => {
  it('has five bands per sex in low→high order matching the reviewed classify', () => {
    for (const sex of ['male', 'female'] as const) {
      expect(CATEGORY_BANDS[sex].map((b) => b.category)).toEqual([
        'Essential fat',
        'Athletes',
        'Fitness',
        'Average',
        'Obese',
      ]);
    }
    // The band chosen for a computed result equals the reviewed category.
    const r = computeBodyFat(femaleMetric('165', '34', '74', '96'));
    expect(CATEGORY_BANDS.female.some((b) => b.category === r.category)).toBe(true);
  });
});

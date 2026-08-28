import { describe, it, expect } from 'vitest';
import {
  MSG,
  UNIT_TABS,
  FORMULA_ROWS,
  ageError,
  validateIdealWeightValues,
  computeIdealWeight,
  completeIdealWeightValue,
  formulaSpread,
  formatWeight,
  formatRange,
  displayUnit,
  idealWeightAnnouncement,
  idealWeightBinding,
  metricHeightToImperial,
  imperialHeightToMetric,
  IDEAL_WEIGHT_EXAMPLE_VALUES,
  type IdealWeightValues,
} from './ideal-weight-form';

/**
 * The binding's pure surface. The four formulas live in the reviewed pure
 * `ideal-weight.ts`; here we pin what the binding adds — the age gate, the reference's
 * five result rows, the dominant spread, and height conversion between the two tabs.
 */

const base: IdealWeightValues = {
  system: 'metric',
  sex: 'male',
  age: '25',
  heightCm: '180',
  heightFt: '',
  heightIn: '',
};
const metric = (over: Partial<IdealWeightValues> = {}): IdealWeightValues => ({ ...base, ...over });
const us = (over: Partial<IdealWeightValues> = {}): IdealWeightValues => ({
  ...base,
  system: 'imperial',
  heightCm: '',
  heightFt: '5',
  heightIn: '10',
  ...over,
});

describe('the reference fields', () => {
  it('offers exactly the two real unit systems, US first', () => {
    expect(UNIT_TABS.map((t) => t.label)).toEqual(['US Units', 'Metric Units']);
    expect(UNIT_TABS.map((t) => t.value)).toEqual(['imperial', 'metric']);
  });
  it('names the four formulas the way the reference does, in its order', () => {
    expect(FORMULA_ROWS.map((r) => r.label)).toEqual([
      'Robinson (1983)',
      'Miller (1983)',
      'Devine (1974)',
      'Hamwi (1964)',
    ]);
  });
});

describe('the reference report reproduces exactly', () => {
  it('US: a 25-year-old man of 5 ft 10 in', () => {
    const r = computeIdealWeight(us());
    expect(formatWeight(r.robinson, r.system)).toBe('156.5 lbs');
    expect(formatWeight(r.miller, r.system)).toBe('155.0 lbs');
    expect(formatWeight(r.devine, r.system)).toBe('160.9 lbs');
    expect(formatWeight(r.hamwi, r.system)).toBe('165.3 lbs');
    expect(formatRange(r.bmiMin, r.bmiMax, r.system)).toBe('128.9 - 174.2 lbs');
  });

  it('Metric: a 25-year-old man of 180 cm', () => {
    const r = computeIdealWeight(metric());
    expect(formatWeight(r.robinson, r.system)).toBe('72.6 kg');
    expect(formatWeight(r.miller, r.system)).toBe('71.5 kg');
    expect(formatWeight(r.devine, r.system)).toBe('75.0 kg');
    expect(formatWeight(r.hamwi, r.system)).toBe('77.3 kg');
    expect(formatRange(r.bmiMin, r.bmiMax, r.system)).toBe('59.9 - 81.0 kg');
  });

  it('writes the unit the way the reference does', () => {
    expect(displayUnit('imperial')).toBe('lbs');
    expect(displayUnit('metric')).toBe('kg');
  });

  it('the healthy range is drawn from BMI 18.5–25, not 18.5–24.9', () => {
    // 24.9 would put the top of the US range at 173.5 lbs; the reference says 174.2.
    expect(formatRange(computeIdealWeight(us()).bmiMin, computeIdealWeight(us()).bmiMax, 'imperial')).toContain('174.2');
  });
});

describe('age', () => {
  it('is required, whole, and inside the accepted span', () => {
    expect(ageError('')).toBe(MSG.ageMissing);
    expect(ageError('  ')).toBe(MSG.ageMissing);
    expect(ageError('25.5')).toBe(MSG.ageWhole);
    expect(ageError('x')).toBe(MSG.ageWhole);
    expect(ageError('1')).toBe(MSG.ageRange);
    expect(ageError('81')).toBe(MSG.ageRange);
    expect(ageError('2')).toBe(null);
    expect(ageError('80')).toBe(null);
  });

  it('changes no formula — it only decides whether they apply', () => {
    const young = computeIdealWeight(metric({ age: '18' }));
    const old = computeIdealWeight(metric({ age: '80' }));
    for (const k of ['robinson', 'miller', 'devine', 'hamwi', 'bmiMin', 'bmiMax'] as const) {
      expect(young[k]).toBe(old[k]);
    }
    expect(young.adult).toBe(true);
    expect(old.adult).toBe(true);
  });

  it('turns the adult formulas off below 18', () => {
    expect(computeIdealWeight(metric({ age: '17' })).adult).toBe(false);
    expect(computeIdealWeight(metric({ age: '18' })).adult).toBe(true);
  });
});

describe('validateIdealWeightValues', () => {
  it('accepts a complete metric and a complete US entry', () => {
    expect(validateIdealWeightValues(metric())).toEqual({ ok: true });
    expect(validateIdealWeightValues(us())).toEqual({ ok: true });
  });

  it('reports a missing age and a missing height together', () => {
    const r = validateIdealWeightValues(metric({ age: '', heightCm: '' }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors!.age).toBe(MSG.ageMissing);
      expect(r.fieldErrors!.heightCm).toBe(MSG.heightMissing);
    }
  });

  it('rejects missing / zero / non-finite metric height', () => {
    for (const heightCm of ['', '0', '-5', 'x']) {
      const r = validateIdealWeightValues(metric({ heightCm }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors!.heightCm).toBeTruthy();
    }
  });

  it('applies the shared imperial-height semantics (0–11 inches, whole feet)', () => {
    const over = validateIdealWeightValues(us({ heightIn: '12' }));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.fieldErrors!.height).toBe(MSG.heightInches);
    expect(validateIdealWeightValues(us({ heightFt: '', heightIn: '' })).ok).toBe(false);
    expect(validateIdealWeightValues(us({ heightFt: '0', heightIn: '11' })).ok).toBe(true);
  });

  it('never reads the other tab’s height boxes', () => {
    // A blank metric box must not fail a US entry, and vice versa.
    expect(validateIdealWeightValues(us({ heightCm: '' })).ok).toBe(true);
    expect(validateIdealWeightValues(metric({ heightFt: '', heightIn: '' })).ok).toBe(true);
  });
});

describe('completeIdealWeightValue — the whole report or nothing', () => {
  it('is finite for a complete adult entry', () => {
    expect(Number.isFinite(completeIdealWeightValue(computeIdealWeight(metric())))).toBe(true);
  });
  it('is finite for a child — the informational answer is a real result', () => {
    expect(Number.isFinite(completeIdealWeightValue(computeIdealWeight(metric({ age: '10' }))))).toBe(true);
  });
  it('is NaN when the age is missing', () => {
    expect(Number.isNaN(completeIdealWeightValue(computeIdealWeight(metric({ age: '' }))))).toBe(true);
  });
  it('is NaN when the height is missing, so no partial table can reach the panel', () => {
    expect(Number.isNaN(completeIdealWeightValue(computeIdealWeight(metric({ heightCm: '' }))))).toBe(true);
  });
});

describe('formulaSpread — the dominant band', () => {
  it('is the lowest and highest of the four, never an invented average', () => {
    const r = computeIdealWeight(us());
    expect(formulaSpread(r)).toEqual({ low: 155, high: 165.3 });
    expect(Object.keys(r)).not.toContain('average');
  });
  it('moves with sex', () => {
    const f = formulaSpread(computeIdealWeight(metric({ sex: 'female' })));
    expect(f).toEqual({ low: 67.5, high: 70.5 });
  });
});

describe('formatting never leaks a non-number', () => {
  it('renders an em dash rather than NaN', () => {
    expect(formatWeight(Number.NaN, 'metric')).toBe('—');
    expect(formatRange(Number.NaN, 10, 'metric')).toBe('—');
    expect(formatRange(10, Number.POSITIVE_INFINITY, 'metric')).toBe('—');
  });
});

describe('idealWeightAnnouncement', () => {
  const male = computeIdealWeight(metric());
  const female = computeIdealWeight(metric({ sex: 'female' }));
  const taller = computeIdealWeight(metric({ heightCm: '190' }));

  it('speaks the band on a first result', () => {
    expect(idealWeightAnnouncement(male, null)).toBe(
      'Your ideal weight is approximately 71.5 to 77.3 kilograms.',
    );
  });

  it('names the sex when the spoken band would be identical', () => {
    const same = { low: 67.5, high: 70.5 };
    expect(idealWeightAnnouncement(female, same)).toBe(
      'Ideal weight: 67.5 to 70.5 kilograms. Estimates updated for female.',
    );
  });

  it('falls back to the plain band when the band itself changes', () => {
    expect(idealWeightAnnouncement(taller, formulaSpread(male))).toMatch(
      /^Your ideal weight is approximately /,
    );
  });

  it('tells a child why the formulas do not apply, and speaks no weight', () => {
    const s = idealWeightAnnouncement(computeIdealWeight(metric({ age: '10' })), null);
    expect(s).toBe(
      'Ideal-weight formulas apply from age 18. At 10, healthy weight is judged from BMI-for-age percentiles instead.',
    );
    expect(s).not.toMatch(/kilograms|pounds/);
  });

  it('never speaks a formula name', () => {
    for (const prev of [null, formulaSpread(male)]) {
      expect(idealWeightAnnouncement(female, prev)).not.toMatch(/robinson|miller|devine|hamwi/i);
    }
  });
});

describe('describeResult uses per-instance context (no module state)', () => {
  const b = idealWeightBinding;
  const male = computeIdealWeight(metric());
  const female = computeIdealWeight(metric({ sex: 'female' }));

  it('a first-result context speaks the plain band', () => {
    expect(b.describeResult(male, { phase: 'first-result' })).toBe(
      'Your ideal weight is approximately 71.5 to 77.3 kilograms.',
    );
  });

  it('is stateless — an interleaved call never drifts the output', () => {
    const first = b.describeResult(male, { phase: 'first-result' });
    b.describeResult(female, { phase: 'live-update', previousResult: male });
    expect(b.describeResult(male, { phase: 'first-result' })).toBe(first);
  });
});

describe('height conversion between the tabs', () => {
  it('metric ↔ US round-trips within a rounding tolerance', () => {
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

describe('the labelled example', () => {
  it('is the reference’s own published case, in the system the tabs open on', () => {
    // The tabs open on US Units, so a metric example would print kilograms under a tab
    // that says US Units.
    expect(IDEAL_WEIGHT_EXAMPLE_VALUES.system).toBe(UNIT_TABS[0].value);
    expect(IDEAL_WEIGHT_EXAMPLE_VALUES).toMatchObject({ system: 'imperial', sex: 'male', age: '25', heightFt: '5', heightIn: '10' });
    expect(validateIdealWeightValues(IDEAL_WEIGHT_EXAMPLE_VALUES)).toEqual({ ok: true });
    expect(formatWeight(computeIdealWeight(IDEAL_WEIGHT_EXAMPLE_VALUES).devine, 'imperial')).toBe('160.9 lbs');
  });
});

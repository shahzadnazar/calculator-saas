import { describe, it, expect } from 'vitest';
import {
  BODY_FAT_EXAMPLE_VALUES,
  CM_PER_IN,
  KG_PER_LB,
  MSG,
  REPORT_ROWS,
  UNIT_TABS,
  bodyFatBinding,
  cmToTab,
  completeBodyFatValue,
  computeBodyFat,
  convertMeasurements,
  describeBodyFatResult,
  formatMass,
  formatPct,
  gaugePosition,
  heightToCm,
  interpretBodyFat,
  kgToTab,
  massUnit,
  needsHip,
  parseAge,
  toCm,
  validateBodyFatValues,
  weightToKg,
  type BodyFatValues,
} from './body-fat-form';

/**
 * The two published reference reports, on the same 25-year-old man: metric (70 kg,
 * 178/50/96 cm) and US (152 lb, 5'10.5", neck 1'7.5", waist 3'1.5").
 */
const BLANK: BodyFatValues = {
  unitTab: 'us', sex: 'male', age: '25', weight: '', weightLb: '', height: '', heightIn: '',
  neck: '', neckIn: '', waist: '', waistIn: '', hip: '', hipIn: '',
};
const METRIC = BODY_FAT_EXAMPLE_VALUES;
const US: BodyFatValues = {
  ...BLANK, unitTab: 'us', weight: '152', height: '5', heightIn: '10.5',
  neck: '1', neckIn: '7.5', waist: '3', waistIn: '1.5',
};
const row = (v: BodyFatValues, key: string) => {
  const r = computeBodyFat(v);
  return REPORT_ROWS.find((x) => x.key === key)!.value(r);
};
const errs = (v: BodyFatValues) =>
  (validateBodyFatValues(v) as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};

/* ------------------------------------------------------------------ */
/* The three tabs                                                      */
/* ------------------------------------------------------------------ */

describe('the three unit tabs', () => {
  it('offers the two systems the boxes can be in', () => {
    // "Other Units" is the converter panel, not a third set of boxes; it is the island's.
    expect(UNIT_TABS.map((t) => t.label)).toEqual(['US Units', 'Metric Units']);
  });

  it('converts lengths into centimetres from each tab', () => {
    expect(toCm('metric', 96, 0)).toBe(96);
    expect(toCm('us', 3, 1.5)).toBeCloseTo(37.5 * CM_PER_IN, 9);
  });

  it('reads a height in each system', () => {
    expect(heightToCm('metric', 178, 0)).toBe(178);
    expect(heightToCm('us', 5, 10.5)).toBeCloseTo(70.5 * CM_PER_IN, 9);
  });

  it('converts weight into kilograms from each tab', () => {
    expect(weightToKg('metric', 70, 0)).toBe(70);
    expect(weightToKg('us', 152, 0)).toBeCloseTo(152 * KG_PER_LB, 9);
  });
});

/* ------------------------------------------------------------------ */
/* The published reports                                               */
/* ------------------------------------------------------------------ */

describe('the published metric report', () => {
  it('reproduces every row', () => {
    expect(row(METRIC, 'navy')).toBe('15.7%');
    expect(row(METRIC, 'category')).toBe('Fitness');
    expect(row(METRIC, 'fatMass')).toBe('11.0 kg');
    expect(row(METRIC, 'leanMass')).toBe('59.0 kg');
    expect(row(METRIC, 'ideal')).toBe('10.5%');
    expect(row(METRIC, 'toLose')).toBe('3.6 kg');
    expect(row(METRIC, 'bmi')).toBe('16.1%');
  });

  it('validates, and the guard returns the percentage', () => {
    expect(validateBodyFatValues(METRIC)).toEqual({ ok: true });
    expect(Math.round(bodyFatBinding.resultValue(computeBodyFat(METRIC)) * 10) / 10).toBe(15.7);
  });
});

describe('the published US report', () => {
  it('reproduces every row, in pounds', () => {
    expect(row(US, 'navy')).toBe('15.3%');
    expect(row(US, 'category')).toBe('Fitness');
    expect(row(US, 'fatMass')).toBe('23.2 lbs');
    expect(row(US, 'leanMass')).toBe('128.8 lbs');
    expect(row(US, 'ideal')).toBe('10.5%');
    expect(row(US, 'toLose')).toBe('7.2 lbs');
    expect(row(US, 'bmi')).toBe('15.4%');
  });

  it('names the seven rows the reference names, in its order', () => {
    expect(REPORT_ROWS.map((r) => r.label)).toEqual([
      'Body Fat (U.S. Navy Method)',
      'Body Fat Category',
      'Body Fat Mass',
      'Lean Body Mass',
      'Ideal Body Fat for Given Age (Jackson & Pollock)',
      'Body Fat to Lose to Reach Ideal',
      'Body Fat (BMI method)',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Converting between tabs                                             */
/* ------------------------------------------------------------------ */

describe('switching tabs converts rather than clearing', () => {
  it('metric to US gives the same body in feet and inches', () => {
    const us = convertMeasurements(METRIC, 'metric', 'us');
    expect(us.unitTab).toBe('us');
    expect(us.height).toBe('5');
    expect(Number(us.heightIn)).toBeCloseTo(10.1, 1);
    expect(Number(us.weight)).toBeCloseTo(154.3, 1);
  });

  it('round-trips back to about where it started', () => {
    const back = convertMeasurements(convertMeasurements(METRIC, 'metric', 'us'), 'us', 'metric');
    expect(Number(back.weight)).toBeCloseTo(70, 0);
    expect(Number(back.waist)).toBeCloseTo(96, 0);
  });

  it('gives about the same body fat whichever system it is entered in', () => {
    const a = computeBodyFat(METRIC).bodyFatPct;
    const b = computeBodyFat(convertMeasurements(METRIC, 'metric', 'us')).bodyFatPct;
    expect(b).toBeCloseTo(a, 1);
  });

  it('leaves a blank box blank rather than filling it with a zero', () => {
    const partial = convertMeasurements({ ...BLANK, unitTab: 'metric', waist: '96' }, 'metric', 'us');
    expect(partial.waist).not.toBe('');
    expect(partial.height).toBe('');
    expect(partial.weight).toBe('');
  });

  it('is a no-op onto the same tab', () => {
    expect(convertMeasurements(METRIC, 'metric', 'metric')).toEqual(METRIC);
  });

  it('writes a length the way each tab wants it', () => {
    expect(cmToTab('metric', 178, true)).toEqual(['178', '']);
    expect(cmToTab('us', 178, true)[0]).toBe('5');
    expect(kgToTab('us', 70)[0]).toBe('154.3');
    expect(kgToTab('metric', 70)).toEqual(['70', '']);
  });
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('validation', () => {
  it('requires an age in a plausible range', () => {
    expect(parseAge('')).toBe('empty');
    expect(parseAge('1')).toBe('invalid');
    expect(parseAge('130')).toBe('invalid');
    expect(parseAge('25')).toBe(25);
    expect(errs({ ...METRIC, age: '' }).age).toBe(MSG.age);
  });

  it('requires every measurement', () => {
    const e = errs({ ...BLANK, unitTab: 'metric' });
    expect(e.weight).toBe(MSG.weight);
    expect(e.height).toBe(MSG.height);
    expect(e.neck).toBe(MSG.neck);
    expect(e.waist).toBe(MSG.waist);
  });

  it('asks a woman for a hip measurement and a man for none', () => {
    expect(needsHip('female')).toBe(true);
    expect(needsHip('male')).toBe(false);
    expect(errs({ ...METRIC, sex: 'female' }).hip).toBe(MSG.hip);
    expect(errs(METRIC).hip).toBeUndefined();
  });

  it('accepts a US height of zero feet when the inches carry it', () => {
    const shortNeck = { ...US, neck: '0', neckIn: '19.5' };
    expect(validateBodyFatValues(shortNeck)).toEqual({ ok: true });
  });

  it('explains measurements the formula cannot answer', () => {
    const impossible = { ...METRIC, waist: '50' };
    expect((validateBodyFatValues(impossible) as { formError?: string }).formError).toBe(MSG.impossible);
  });

  it('refuses measurements that drive the percentage below zero', () => {
    expect((validateBodyFatValues({ ...METRIC, waist: '78' }) as { formError?: string }).formError).toBe(MSG.impossible);
  });
});

/* ------------------------------------------------------------------ */
/* The guard and presentation                                          */
/* ------------------------------------------------------------------ */

describe('the complete-result guard', () => {
  const base = computeBodyFat(METRIC);
  const broken = (mutate: (r: typeof base) => void) => {
    const copy = { ...base };
    mutate(copy);
    return copy;
  };

  it('rejects an unsolvable report', () => {
    expect(Number.isNaN(completeBodyFatValue(computeBodyFat({ ...METRIC, waist: '50' })))).toBe(true);
  });

  it('rejects a single broken figure', () => {
    for (const key of ['fatMassKg', 'leanMassKg', 'bmi', 'bmiBodyFatPct', 'idealPct', 'fatToLoseKg'] as const) {
      expect(Number.isNaN(completeBodyFatValue(broken((c) => ((c as unknown as Record<string, unknown>)[key] = Number.NaN))))).toBe(true);
    }
  });

  it('rejects masses that do not add up to the body', () => {
    expect(Number.isNaN(completeBodyFatValue(broken((c) => (c.fatMassKg = c.fatMassKg + 1))))).toBe(true);
  });

  it('rejects a percentage outside nought to a hundred', () => {
    expect(Number.isNaN(completeBodyFatValue(broken((c) => (c.bodyFatPct = 0))))).toBe(true);
    expect(Number.isNaN(completeBodyFatValue(broken((c) => (c.bodyFatPct = 120))))).toBe(true);
  });
});

describe('presentation', () => {
  const r = computeBodyFat(METRIC);

  it('formats percentages and masses to one decimal', () => {
    expect(formatPct(15.6607)).toBe('15.7%');
    expect(formatMass(10.962, 'metric')).toBe('11.0 kg');
    expect(formatMass(10.962, 'us')).toBe('24.2 lbs');
    expect(formatPct(Number.NaN)).toBe('—');
    expect(formatMass(Number.NaN, 'metric')).toBe('—');
  });

  it('announces the percentage and the category', () => {
    expect(describeBodyFatResult(r)).toBe('Body fat 15.7%, in the Fitness range.');
  });

  it('says where the reading stands against the ideal for that age', () => {
    expect(interpretBodyFat(r)).toBe(
      '15.7% puts you in the Fitness range — 5.2% above the 10.5% typical for 25. That is 11.0 kg of fat and 59.0 kg of lean mass.',
    );
  });

  it('places the pointer inside the gauge, always', () => {
    expect(gaugePosition('male', 15.7)).toBeGreaterThan(0);
    expect(gaugePosition('male', 15.7)).toBeLessThan(100);
    expect(gaugePosition('male', 500)).toBe(100);
    expect(gaugePosition('male', Number.NaN)).toBe(0);
  });
});

describe('the example and the binding', () => {
  it('the example is the reference metric case', () => {
    expect(BODY_FAT_EXAMPLE_VALUES.unitTab).toBe('metric');
    expect(validateBodyFatValues(BODY_FAT_EXAMPLE_VALUES)).toEqual({ ok: true });
  });

  it('has no isUsableResult — the guard is resultValue', () => {
    expect(bodyFatBinding.isUsableResult).toBeUndefined();
  });
});

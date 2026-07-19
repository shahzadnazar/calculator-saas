import { describe, it, expect } from 'vitest';
import {
  validateBmiValues,
  metricToImperial,
  imperialToMetric,
  describeBmiResult,
  severityPhrase,
  bmiBinding,
  type BmiValues,
} from './bmi-form';
import { calculateBmi } from './bmi';

/**
 * BMI-specific binding logic. The numeric core (`calculateBmi`) is tested in
 * bmi.test.ts; here we pin the form-facing behaviour the runtime relies on:
 * validation messages (empty vs non-positive), safe unit conversion (empty
 * stays empty), the accessible announcement, and that compute wires through to
 * the reviewed calculator.
 */

const metric = (heightCm: string, weightKg: string): BmiValues => ({ system: 'metric', heightCm, weightKg });
const imperial = (heightFt: string, heightIn: string, weightLb: string): BmiValues => ({
  system: 'imperial',
  heightFt,
  heightIn,
  weightLb,
});

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

describe('validateBmiValues — metric', () => {
  it('accepts a valid height and weight', () => {
    expect(validateBmiValues(metric('175', '70'))).toEqual({ ok: true });
  });
  it('distinguishes empty ("enter") from non-positive ("greater than zero")', () => {
    expect(validateBmiValues(metric('', ''))).toEqual({
      ok: false,
      fieldErrors: { heightCm: 'Enter your height.', weightKg: 'Enter your weight.' },
    });
    const zero = validateBmiValues(metric('0', '70'));
    expect(zero.ok).toBe(false);
    expect(zero).toMatchObject({ fieldErrors: { heightCm: 'Enter a height greater than zero.' } });
  });
  it('treats negative and non-numeric input as non-positive', () => {
    expect(validateBmiValues(metric('-5', '70'))).toMatchObject({
      fieldErrors: { heightCm: 'Enter a height greater than zero.' },
    });
    expect(validateBmiValues(metric('abc', '70'))).toMatchObject({
      fieldErrors: { heightCm: 'Enter a height greater than zero.' },
    });
  });
});

describe('validateBmiValues — imperial', () => {
  it('accepts feet + inches', () => {
    expect(validateBmiValues(imperial('5', '9', '154'))).toEqual({ ok: true });
  });
  it('accepts inches-only (empty feet counts as zero feet)', () => {
    expect(validateBmiValues(imperial('', '9', '154'))).toEqual({ ok: true });
  });
  it('flags an empty height and a zero total height differently', () => {
    expect(validateBmiValues(imperial('', '', '154'))).toMatchObject({
      fieldErrors: { height: 'Enter your height.' },
    });
    expect(validateBmiValues(imperial('0', '0', '154'))).toMatchObject({
      fieldErrors: { height: 'Enter a height greater than zero.' },
    });
  });
  it('flags a negative part as non-positive height', () => {
    expect(validateBmiValues(imperial('5', '-3', '154'))).toMatchObject({
      fieldErrors: { height: 'Enter a height greater than zero.' },
    });
  });
  it('flags a missing weight', () => {
    expect(validateBmiValues(imperial('5', '9', ''))).toMatchObject({
      fieldErrors: { weightLb: 'Enter your weight.' },
    });
  });
});

/* ------------------------------------------------------------------ */
/* Compute (wires to the reviewed calculator)                          */
/* ------------------------------------------------------------------ */

describe('bmiBinding.compute', () => {
  it('computes metric BMI', () => {
    const r = bmiBinding.compute(metric('180', '75'));
    expect(r.bmi).toBeCloseTo(23.1, 1);
    expect(r.category).toBe('Normal weight');
    expect(bmiBinding.resultValue(r)).toBe(r.bmi);
  });
  it('computes imperial BMI with the correct unit label', () => {
    const r = bmiBinding.compute(imperial('5', '11', '160'));
    expect(r.bmi).toBeCloseTo(22.3, 1);
    expect(r.unitLabel).toBe('lb');
  });
  it('surfaces higher categories', () => {
    expect(bmiBinding.compute(metric('170', '95')).category).toBe('Obesity');
  });
});

/* ------------------------------------------------------------------ */
/* Unit conversion (empty stays empty; no fabricated defaults)         */
/* ------------------------------------------------------------------ */

describe('metricToImperial', () => {
  it('converts height to whole feet/inches and weight to pounds', () => {
    const out = metricToImperial({ heightCm: 175, weightKg: 70 });
    expect(out).toEqual({ heightFt: 5, heightIn: 9, weightLb: 154.3 });
  });
  it('leaves empty or non-positive values null (never fabricated)', () => {
    expect(metricToImperial({ heightCm: null, weightKg: null })).toEqual({
      heightFt: null,
      heightIn: null,
      weightLb: null,
    });
    expect(metricToImperial({ heightCm: 0, weightKg: 70 }).heightFt).toBeNull();
  });
});

describe('imperialToMetric', () => {
  it('converts feet/inches to centimetres and pounds to kilograms', () => {
    const out = imperialToMetric({ heightFt: 5, heightIn: 9, weightLb: 154 });
    expect(out.heightCm).toBeCloseTo(175.3, 1);
    expect(out.weightKg).toBeCloseTo(69.9, 1);
  });
  it('treats a fully empty height as null but converts inches-only', () => {
    expect(imperialToMetric({ heightFt: null, heightIn: null, weightLb: 154 }).heightCm).toBeNull();
    expect(imperialToMetric({ heightFt: null, heightIn: 9, weightLb: null }).heightCm).toBeCloseTo(22.9, 1);
  });
  it('round-trips a metric height within rounding tolerance', () => {
    const imp = metricToImperial({ heightCm: 180, weightKg: 75 });
    const back = imperialToMetric(imp);
    expect(back.heightCm).toBeCloseTo(180, 0);
    expect(back.weightKg).toBeCloseTo(75, 0);
  });
});

/* ------------------------------------------------------------------ */
/* Accessible description                                              */
/* ------------------------------------------------------------------ */

describe('describeBmiResult', () => {
  it('speaks the value, the spoken unit and the category', () => {
    const r = calculateBmi({ system: 'metric', heightCm: 175, weightKg: 70 });
    expect(describeBmiResult(r)).toBe(
      'Your BMI is 22.9 kilograms per square metre, classified as normal weight.',
    );
  });
});

describe('severityPhrase', () => {
  it('maps each severity to plain-language guidance', () => {
    expect(severityPhrase('normal')).toMatch(/healthy weight/i);
    expect(severityPhrase('low')).toMatch(/below/i);
    expect(severityPhrase('high')).toMatch(/above/i);
    expect(severityPhrase('danger')).toMatch(/well above/i);
  });
});

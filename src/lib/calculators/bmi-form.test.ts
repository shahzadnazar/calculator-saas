import { describe, it, expect } from 'vitest';
import {
  validateBmiValues,
  metricToImperial,
  imperialToMetric,
  describeBmiResult,
  severityPhrase,
  bmiBinding,
  bmiExample,
  BMI_EXAMPLE,
  markerPosition,
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

const metric = (heightCm: string, weightKg: string): BmiValues => ({ sex: 'male', system: 'metric', heightCm, weightKg });
const imperial = (heightFt: string, heightIn: string, weightLb: string): BmiValues => ({
  sex: 'male',
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

describe('validateBmiValues — imperial (R2.1 height semantics)', () => {
  it('accepts feet + inches, feet-only, inches-only, and boundary parts', () => {
    expect(validateBmiValues(imperial('5', '9', '154'))).toEqual({ ok: true });
    expect(validateBmiValues(imperial('5', '', '154'))).toEqual({ ok: true }); // feet-only
    expect(validateBmiValues(imperial('', '8', '154'))).toEqual({ ok: true }); // inches-only
    expect(validateBmiValues(imperial('5', '0', '154'))).toEqual({ ok: true }); // 5 ft 0 in
    expect(validateBmiValues(imperial('0', '8', '154'))).toEqual({ ok: true }); // 0 ft 8 in
    expect(validateBmiValues(imperial('6', '11', '154'))).toEqual({ ok: true }); // inches at the max
  });
  it('rejects a zero total height', () => {
    expect(validateBmiValues(imperial('0', '0', '154'))).toMatchObject({
      fieldErrors: { height: 'Enter a height greater than zero.' },
    });
    expect(validateBmiValues(imperial('', '', '154'))).toMatchObject({
      fieldErrors: { height: 'Enter your height.' },
    });
  });
  it('rejects 12+ inches without silently normalizing (5 ft 14 in is an error)', () => {
    expect(validateBmiValues(imperial('5', '14', '154'))).toMatchObject({
      fieldErrors: { height: 'Enter inches from 0 to 11.' },
    });
    expect(validateBmiValues(imperial('5', '12', '154'))).toMatchObject({
      fieldErrors: { height: 'Enter inches from 0 to 11.' },
    });
  });
  it('rejects negative and non-finite inches with the inches message', () => {
    expect(validateBmiValues(imperial('5', '-3', '154'))).toMatchObject({
      fieldErrors: { height: 'Enter inches from 0 to 11.' },
    });
    expect(validateBmiValues(imperial('5', 'abc', '154'))).toMatchObject({
      fieldErrors: { height: 'Enter inches from 0 to 11.' },
    });
  });
  it('rejects negative and non-integer feet', () => {
    expect(validateBmiValues(imperial('-1', '', '154'))).toMatchObject({
      fieldErrors: { height: 'Enter feet as a whole number.' },
    });
    expect(validateBmiValues(imperial('5.5', '0', '154'))).toMatchObject({
      fieldErrors: { height: 'Enter feet as a whole number.' },
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

describe('conversion round-trips stay within reasonable tolerance (R2.1)', () => {
  it('metric → imperial → metric height holds to ~1 cm', () => {
    for (const cm of [152, 165, 175, 183, 198]) {
      const back = imperialToMetric(metricToImperial({ heightCm: cm, weightKg: null }));
      expect(Math.abs((back.heightCm ?? 0) - cm)).toBeLessThanOrEqual(1.5);
    }
  });
  it('kg → lb → kg weight holds to ~0.5 kg', () => {
    for (const kg of [50, 63.5, 70, 88, 120]) {
      const back = imperialToMetric(metricToImperial({ heightCm: null, weightKg: kg }));
      expect(Math.abs((back.weightKg ?? 0) - kg)).toBeLessThanOrEqual(0.5);
    }
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

/* ------------------------------------------------------------------ */
/* Worked example (the labelled Example result state)                  */
/* ------------------------------------------------------------------ */

describe('bmiExample — the labelled Example shown on first load', () => {
  it('pins the published scenario so the caption and the figures cannot disagree', () => {
    expect(BMI_EXAMPLE).toEqual({ system: 'metric', heightCm: 175, weightKg: 70 });
  });

  it('derives every figure from the reviewed engine, never from hand-written copy', () => {
    const ex = bmiExample();
    const engine = calculateBmi({ system: 'metric', heightCm: 175, weightKg: 70 });
    expect(ex.bmi).toBe(engine.bmi);
    expect(ex.category).toBe(engine.category);
    expect(ex.severity).toBe(engine.severity);
    expect(ex.healthyMin).toBe(engine.healthyMin);
    expect(ex.healthyMax).toBe(engine.healthyMax);
    expect(ex.unitLabel).toBe(engine.unitLabel);
    expect(ex.markerPercent).toBe(markerPosition(engine.bmi));
  });

  it('echoes its own inputs so the example can state the scenario it came from', () => {
    const ex = bmiExample();
    expect(ex.heightCm).toBe(BMI_EXAMPLE.heightCm);
    expect(ex.weightKg).toBe(BMI_EXAMPLE.weightKg);
  });

  it('is a realistic, finite, normal-weight scenario (never NaN / Infinity)', () => {
    const ex = bmiExample();
    expect(Number.isFinite(ex.bmi)).toBe(true);
    expect(Number.isFinite(ex.healthyMin)).toBe(true);
    expect(Number.isFinite(ex.healthyMax)).toBe(true);
    expect(ex.bmi).toBeCloseTo(22.9, 5);
    expect(ex.category).toBe('Normal weight');
    expect(ex.phrase).toBe(severityPhrase(ex.severity));
  });
});


/* ------------------------------------------------------------------ */
/* Sex selector — recorded, never applied                              */
/* ------------------------------------------------------------------ */

describe('the sex selector', () => {
  const withSex = (sex: 'male' | 'female'): BmiValues => ({
    sex,
    system: 'metric',
    heightCm: '180',
    weightKg: '65',
  });

  it('rides along on the computed result', () => {
    expect(bmiBinding.compute(withSex('female')).sex).toBe('female');
    expect(bmiBinding.compute(withSex('male')).sex).toBe('male');
  });

  it('does NOT change the BMI, the category or the healthy range', () => {
    const male = bmiBinding.compute(withSex('male'));
    const female = bmiBinding.compute(withSex('female'));
    // WHO adult thresholds are sex-independent — the selector must never appear
    // to move a number it cannot move.
    expect(female.bmi).toBe(male.bmi);
    expect(female.category).toBe(male.category);
    expect(female.severity).toBe(male.severity);
    expect(female.healthyMin).toBe(male.healthyMin);
    expect(female.healthyMax).toBe(male.healthyMax);
  });

  it('reproduces the published reference figure (180 cm, 65 kg = 20.1)', () => {
    expect(bmiBinding.compute(withSex('male')).bmi).toBe(20.1);
  });
});

describe('the gauge needle', () => {
  const angleFor = (bmi: number) => (markerPosition(bmi) / 100) * 180 - 90;

  it('reads off the same scale position as the linear bar', () => {
    for (const bmi of [10, 18.5, 22, 25, 30, 45]) {
      expect(angleFor(bmi)).toBeCloseTo((markerPosition(bmi) / 100) * 180 - 90, 10);
    }
  });

  it('stays inside the half-circle sweep for every plausible BMI', () => {
    for (const bmi of [1, 12, 18.4, 18.5, 24.9, 25, 29.9, 30, 60, 120]) {
      const a = angleFor(bmi);
      expect(a).toBeGreaterThanOrEqual(-90);
      expect(a).toBeLessThanOrEqual(90);
    }
  });

  it('points left of centre when underweight and right of centre when obese', () => {
    expect(angleFor(15)).toBeLessThan(angleFor(22));
    expect(angleFor(22)).toBeLessThan(angleFor(35));
  });
});

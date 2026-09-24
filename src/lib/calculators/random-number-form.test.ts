import { describe, it, expect } from 'vitest';
import {
  validateSimple,
  validateFull,
  generate,
  describeOutput,
  toRequest,
  precisionOf,
  countOf,
  isDecimal,
  SIMPLE_DEFAULTS,
  FULL_DEFAULTS,
  MSG,
  LIMITS,
  type RngSettings,
} from './random-number-form';
import type { ValidationResult } from '@lib/result/form-runtime';

const settings = (o: Partial<RngSettings> = {}): RngSettings => ({
  lower: '1',
  upper: '100',
  count: '1',
  type: 'integer',
  precision: '0',
  allowDuplicates: true,
  sort: false,
  ...o,
});

const errors = (r: ValidationResult) => (r.ok ? {} : (r.fieldErrors ?? {}));

/* ---- Defaults ------------------------------------------------------ */

describe('the reference defaults', () => {
  it('opens the simple generator on 1 to 100', () => {
    expect(SIMPLE_DEFAULTS).toEqual({ lower: '1', upper: '100' });
  });

  it('opens the comprehensive one on the reference example', () => {
    expect(FULL_DEFAULTS).toEqual({
      lower: '0.2',
      upper: '112.5',
      count: '1',
      type: 'decimal',
      precision: '50',
    });
  });
});

/* ---- Reading settings ---------------------------------------------- */

describe('reading the settings', () => {
  it('knows an integer draw from a decimal one', () => {
    expect(isDecimal(settings({ type: 'decimal' }))).toBe(true);
    expect(isDecimal(settings({ type: 'integer' }))).toBe(false);
  });

  it('works to zero decimal places for an integer, whatever the precision field says', () => {
    expect(precisionOf(settings({ type: 'integer', precision: '50' }))).toBe(0);
    expect(precisionOf(settings({ type: 'decimal', precision: '50' }))).toBe(50);
  });

  it('reads a count strictly', () => {
    expect(countOf(settings({ count: '6' }))).toBe(6);
    expect(countOf(settings({ count: '1.5' }))).toBeNaN();
    expect(countOf(settings({ count: 'x' }))).toBeNaN();
  });
});

/* ---- Validation ---------------------------------------------------- */

describe('the simple generator', () => {
  it('accepts two whole numbers', () => {
    expect(validateSimple(settings()).ok).toBe(true);
    expect(validateSimple(settings({ lower: '-50', upper: '50' })).ok).toBe(true);
  });

  it('asks for both limits', () => {
    const r = errors(validateSimple(settings({ lower: '', upper: '' })));
    expect(r).toEqual({ lower: MSG.required, upper: MSG.required });
  });

  it('refuses a decimal, because this version draws an integer', () => {
    expect(errors(validateSimple(settings({ lower: '1.5' }))).lower).toBe(MSG.integerRequired);
  });

  it('refuses a limit longer than the page promises', () => {
    const enormous = '9'.repeat(LIMITS.maxDigits + 1);
    expect(errors(validateSimple(settings({ upper: enormous }))).upper).toBe(MSG.tooManyDigits);
    expect(validateSimple(settings({ upper: '9'.repeat(LIMITS.maxDigits) })).ok).toBe(true);
  });
});

describe('the comprehensive generator', () => {
  const full = (o: Partial<RngSettings> = {}) =>
    settings({ lower: '0.2', upper: '112.5', count: '1', type: 'decimal', precision: '50', ...o });

  it('accepts the reference example', () => {
    expect(validateFull(full()).ok).toBe(true);
  });

  it('accepts a decimal limit only when drawing decimals', () => {
    expect(validateFull(full({ lower: '0.2' })).ok).toBe(true);
    expect(errors(validateFull(full({ type: 'integer', lower: '0.2' }))).lower).toBe(MSG.integerRequired);
  });

  it('holds the count to a usable range', () => {
    expect(errors(validateFull(full({ count: '0' }))).count).toBe(MSG.countRange);
    expect(errors(validateFull(full({ count: String(LIMITS.maxCount + 1) }))).count).toBe(MSG.countRange);
    expect(errors(validateFull(full({ count: '' }))).count).toBe(MSG.required);
    expect(validateFull(full({ count: String(LIMITS.maxCount) })).ok).toBe(true);
  });

  it('holds the precision to what the page promises, and only asks for it for decimals', () => {
    expect(errors(validateFull(full({ precision: '1000' }))).precision).toBe(MSG.precisionRange);
    expect(errors(validateFull(full({ precision: '' }))).precision).toBe(MSG.required);
    expect(validateFull(full({ precision: String(LIMITS.maxPrecision) })).ok).toBe(true);
    // An integer draw does not care what the precision box holds.
    expect(validateFull(full({ type: 'integer', lower: '1', upper: '10', precision: 'x' })).ok).toBe(true);
  });

  it('refuses to draw more distinct values than the range holds', () => {
    const r = errors(validateFull(full({ type: 'integer', lower: '1', upper: '5', count: '20', allowDuplicates: false })));
    expect(r.count).toBe(MSG.notEnoughValues);
    // With duplicates allowed the same request is fine.
    expect(validateFull(full({ type: 'integer', lower: '1', upper: '5', count: '20', allowDuplicates: true })).ok).toBe(true);
  });

  it('judges the range only once every field is sound', () => {
    const r = errors(validateFull(full({ lower: '', count: '20', allowDuplicates: false })));
    expect(r.lower).toBe(MSG.required);
    expect(r.count).toBeUndefined(); // no range verdict on a range it cannot read
  });
});

/* ---- Generating ---------------------------------------------------- */

describe('generating', () => {
  it('turns the settings into a request the engine understands', () => {
    expect(toRequest(settings({ lower: ' 1 ', upper: ' 10 ', count: '5', sort: true }))).toEqual({
      lower: '1',
      upper: '10',
      count: 5,
      precision: 0,
      allowDuplicates: true,
      sort: true,
    });
  });

  it('joins the draw into one block of copyable text, one number per line', () => {
    const output = generate(settings({ lower: '1', upper: '10', count: '4' }));
    expect(output.count).toBe(4);
    expect(output.text.split('\n')).toHaveLength(4);
    expect(output.text.split('\n')).toEqual(output.draw.values);
  });

  it('marks a decimal draw as decimal, and an integer one as not', () => {
    expect(generate(settings({ type: 'decimal', precision: '3', lower: '0', upper: '1' })).decimal).toBe(true);
    expect(generate(settings({ type: 'integer' })).decimal).toBe(false);
    // Decimal with zero places is really an integer draw.
    expect(generate(settings({ type: 'decimal', precision: '0' })).decimal).toBe(false);
  });

  it('reproduces the reference example shape: one decimal to fifty places in range', () => {
    const output = generate(settings({ lower: '0.2', upper: '112.5', count: '1', type: 'decimal', precision: '50' }));
    expect(output.count).toBe(1);
    expect(output.draw.values[0].split('.')[1]).toHaveLength(50);
    expect(Number(output.draw.values[0])).toBeGreaterThanOrEqual(0.2);
    expect(Number(output.draw.values[0])).toBeLessThanOrEqual(112.5);
  });
});

/* ---- Announcement --------------------------------------------------- */

describe('the announcement', () => {
  it('says that numbers were generated, never what they are', () => {
    const one = generate(settings({ count: '1' }));
    const many = generate(settings({ count: '5' }));
    expect(describeOutput(one)).toBe('Number generated.');
    expect(describeOutput(many)).toBe('5 numbers generated.');
    // Drawn from six digits, so no value can coincide with the count in the sentence.
    const wide = generate(settings({ lower: '100000', upper: '999999', count: '5' }));
    const sentence = describeOutput(wide);
    for (const value of wide.draw.values) expect(sentence).not.toContain(value);
  });

  it('says nothing when nothing was drawn', () => {
    expect(describeOutput(generate(settings({ count: '0' })))).toBe('');
  });
});

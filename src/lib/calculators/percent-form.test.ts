import { describe, it, expect } from 'vitest';
import {
  validatePercentOf,
  validateWhatPercent,
  validatePercentChange,
  describeAmount,
  describePercentage,
  describePercentChange,
  changeDirection,
  percentOfBinding,
  whatPercentBinding,
  percentChangeBinding,
} from './percent-form';

/**
 * Percentage equation bindings. The numeric core (percentOf/whatPercent/
 * percentChange) is tested in percent.test.ts; here we pin the form-facing
 * behaviour: explicit presence/finiteness validation (no `Number(v) || 0`),
 * the zero-denominator / zero-start guards, preserved negative semantics, and
 * the accessible result descriptions.
 */

/* ---- Validation --------------------------------------------------------- */

describe('validatePercentOf ("What is X% of Y?")', () => {
  it('accepts finite X and Y, including zero and negatives', () => {
    expect(validatePercentOf({ percent: '15', value: '200' })).toEqual({ ok: true });
    expect(validatePercentOf({ percent: '0', value: '200' })).toEqual({ ok: true });
    expect(validatePercentOf({ percent: '-5', value: '200' })).toEqual({ ok: true });
  });
  it('flags empty or non-finite operands', () => {
    expect(validatePercentOf({ percent: '', value: '200' })).toMatchObject({
      fieldErrors: { percent: 'Enter the percentage.' },
    });
    expect(validatePercentOf({ percent: '15', value: '' })).toMatchObject({
      fieldErrors: { value: 'Enter the value.' },
    });
    expect(validatePercentOf({ percent: 'abc', value: '200' })).toMatchObject({
      fieldErrors: { percent: 'Enter the percentage.' },
    });
  });
});

describe('validateWhatPercent ("X is what % of Y?")', () => {
  it('accepts finite X and non-zero Y', () => {
    expect(validateWhatPercent({ part: '50', whole: '200' })).toEqual({ ok: true });
    expect(validateWhatPercent({ part: '0', whole: '200' })).toEqual({ ok: true });
  });
  it('rejects a zero total (denominator)', () => {
    expect(validateWhatPercent({ part: '50', whole: '0' })).toMatchObject({
      fieldErrors: { whole: 'The total value must not be zero.' },
    });
  });
  it('flags empty operands with distinct messages', () => {
    expect(validateWhatPercent({ part: '', whole: '200' })).toMatchObject({
      fieldErrors: { part: 'Enter the value.' },
    });
    expect(validateWhatPercent({ part: '50', whole: '' })).toMatchObject({
      fieldErrors: { whole: 'Enter the total value.' },
    });
  });
});

describe('validatePercentChange ("Change from X to Y?")', () => {
  it('accepts finite X and Y, including negatives', () => {
    expect(validatePercentChange({ from: '80', to: '100' })).toEqual({ ok: true });
    expect(validatePercentChange({ from: '-80', to: '-100' })).toEqual({ ok: true });
  });
  it('rejects a zero starting value', () => {
    expect(validatePercentChange({ from: '0', to: '100' })).toMatchObject({
      fieldErrors: { from: 'The starting value must not be zero.' },
    });
  });
  it('flags empty operands with distinct messages', () => {
    expect(validatePercentChange({ from: '', to: '100' })).toMatchObject({
      fieldErrors: { from: 'Enter the starting value.' },
    });
    expect(validatePercentChange({ from: '80', to: '' })).toMatchObject({
      fieldErrors: { to: 'Enter the ending value.' },
    });
  });
});

/* ---- Compute (through the bindings) ------------------------------------- */

describe('binding.compute', () => {
  it('computes a percentage of a value, with decimals, negatives and large values', () => {
    expect(percentOfBinding.compute({ percent: '15', value: '200' })).toBe(30);
    expect(percentOfBinding.compute({ percent: '12.5', value: '80' })).toBe(10);
    expect(percentOfBinding.compute({ percent: '-10', value: '200' })).toBe(-20);
    expect(percentOfBinding.compute({ percent: '50', value: '1000000' })).toBe(500000);
  });
  it('computes what percentage one number is of another', () => {
    expect(whatPercentBinding.compute({ part: '50', whole: '200' })).toBe(25);
    expect(whatPercentBinding.compute({ part: '1', whole: '3' })).toBeCloseTo(33.333, 2);
  });
  it('computes percentage increase and decrease with correct sign', () => {
    expect(percentChangeBinding.compute({ from: '80', to: '100' })).toBe(25); // increase
    expect(percentChangeBinding.compute({ from: '100', to: '80' })).toBe(-20); // decrease
    expect(percentChangeBinding.compute({ from: '200', to: '200' })).toBe(0); // no change
  });
  it('exposes the primary value for the non-finite guard', () => {
    expect(percentOfBinding.resultValue(30)).toBe(30);
    expect(percentChangeBinding.resultValue(-20)).toBe(-20);
  });
});

/* ---- Accessible descriptions -------------------------------------------- */

describe('descriptions', () => {
  it('describes an amount as a bare number', () => {
    expect(describeAmount(30)).toBe('30');
    expect(describeAmount(33.333)).toBe('33.33');
  });
  it('describes a percentage with the spoken unit', () => {
    expect(describePercentage(25)).toBe('25 percent');
  });
  it('describes a change with direction as words, not symbols', () => {
    expect(describePercentChange(25)).toBe('25 percent increase');
    expect(describePercentChange(-20)).toBe('20 percent decrease');
    expect(describePercentChange(0)).toBe('No change');
  });
  it('maps a signed change to a direction', () => {
    expect(changeDirection(5)).toBe('increase');
    expect(changeDirection(-5)).toBe('decrease');
    expect(changeDirection(0)).toBe('no change');
  });
});

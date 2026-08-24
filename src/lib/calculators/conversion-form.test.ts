import { describe, it, expect } from 'vitest';
import {
  conversionBinding,
  validateConversion,
  computeConversion,
  completeConversionValue,
  describeConversionResult,
  conversionEquation,
  parseValue,
  defaultUnits,
  DEFAULT_CATEGORY,
  MSG,
  type ConversionValues,
  type ConversionComputed,
} from './conversion-form';
import { convert } from './conversion';

/**
 * Conversion binding unit tests (R18C3). Validation, the strict numeric domain, computation
 * (delegating to the FROZEN convert — whose full matrix stays conversion.test.ts's authority), the
 * complete-result guard (tamper + source reconciliation), description/announcement, and the DOM
 * read/reset helpers via a mock root. No conversion math is reimplemented here.
 */

const vals = (v: Partial<ConversionValues> = {}): ConversionValues => ({
  category: 'length',
  from: 'km',
  to: 'mi',
  value: '1',
  ...v,
});

function mockRoot(v: Partial<Record<'category' | 'from' | 'to' | 'value', string>> = {}) {
  const store: Record<string, { value: string }> = {
    category: { value: v.category ?? DEFAULT_CATEGORY },
    from: { value: v.from ?? '' },
    to: { value: v.to ?? '' },
    value: { value: v.value ?? '' },
  };
  const root = {
    querySelector(sel: string) {
      const m = sel.match(/\[name="(\w+)"\]/);
      return m && store[m[1]] ? store[m[1]] : null;
    },
  } as unknown as HTMLElement;
  return { root, store };
}

describe('conversion binding — contract', () => {
  it('does NOT implement isUsableResult (the guard lives in resultValue)', () => {
    expect(conversionBinding.isUsableResult).toBeUndefined();
  });

  it('default category is length; default units are its first two distinct units', () => {
    expect(DEFAULT_CATEGORY).toBe('length');
    expect(defaultUnits('length')).toEqual({ from: 'mm', to: 'cm' });
  });

  it('defaultUnits gives a deterministic pair for every category (incl. temperature)', () => {
    expect(defaultUnits('mass')).toEqual({ from: 'mg', to: 'g' });
    expect(defaultUnits('temperature')).toEqual({ from: 'C', to: 'F' });
    expect(defaultUnits('data')).toEqual({ from: 'B', to: 'KB' });
  });

  it('resultValue is the complete-result guard: the converted output when coherent', () => {
    const c = computeConversion(vals());
    expect(conversionBinding.resultValue(c)).toBe(c.output);
  });
});

describe('conversion binding — strict numeric domain', () => {
  it('parseValue: empty vs invalid vs a finite number (zero, decimals, scientific, negatives ok)', () => {
    expect(parseValue('')).toBe('empty');
    expect(parseValue('   ')).toBe('empty');
    expect(parseValue('0')).toBe(0);
    expect(parseValue('2.5')).toBe(2.5);
    expect(parseValue('1e3')).toBe(1000);
    expect(parseValue('-40')).toBe(-40);
    expect(parseValue('abc')).toBe('invalid');
    expect(parseValue('1abc')).toBe('invalid');
    expect(parseValue('Infinity')).toBe('invalid');
  });

  it('validate requires a value and rejects a malformed one; zero and negatives are valid', () => {
    expect(validateConversion(vals()).ok).toBe(true);
    expect(validateConversion(vals({ value: '0' })).ok).toBe(true);
    expect(validateConversion(vals({ category: 'temperature', from: 'C', to: 'F', value: '-40' })).ok).toBe(true);
    const empty = validateConversion(vals({ value: '' }));
    if (!empty.ok) expect(empty.fieldErrors?.value).toBe(MSG.valueRequired);
    const bad = validateConversion(vals({ value: 'abc' }));
    if (!bad.ok) expect(bad.fieldErrors?.value).toBe(MSG.valueInvalid);
  });
});

describe('conversion binding — computation + guard (delegating to the frozen convert)', () => {
  it('a forward conversion echoes the frozen output and labels', () => {
    const c = computeConversion(vals());
    expect(c.output).toBe(convert(1, 'km', 'mi', 'length'));
    expect(c.fromLabel).toBe('Kilometres');
    expect(c.toLabel).toBe('Miles');
    expect(completeConversionValue(c)).toBe(c.output);
  });

  it('a representative conversion in each category passes the guard', () => {
    const cases: ConversionValues[] = [
      vals({ category: 'length', from: 'm', to: 'ft', value: '2' }),
      vals({ category: 'mass', from: 'kg', to: 'lb', value: '3' }),
      vals({ category: 'volume', from: 'l', to: 'gal', value: '4' }),
      vals({ category: 'area', from: 'm2', to: 'ft2', value: '5' }),
      vals({ category: 'speed', from: 'kmh', to: 'mph', value: '6' }),
      vals({ category: 'data', from: 'GiB', to: 'MiB', value: '7' }),
      vals({ category: 'temperature', from: 'C', to: 'F', value: '20' }),
    ];
    for (const v of cases) {
      const c = computeConversion(v);
      expect(Number.isNaN(completeConversionValue(c))).toBe(false);
      expect(completeConversionValue(c)).toBe(convert(c.input, c.from, c.to, c.category));
    }
  });

  it('same-unit is a valid identity; a zero output is a valid finite result', () => {
    const same = computeConversion(vals({ from: 'm', to: 'm', value: '7', category: 'length' }));
    expect(same.output).toBe(7);
    expect(completeConversionValue(same)).toBe(7);
    const zero = computeConversion(vals({ from: 'km', to: 'mi', value: '0' }));
    expect(zero.output).toBe(0);
    expect(completeConversionValue(zero)).toBe(0);
    expect(Number.isNaN(completeConversionValue(zero))).toBe(false);
  });

  it('the affine temperature category is guarded like any other (0 °C → 32 °F is valid)', () => {
    const c = computeConversion(vals({ category: 'temperature', from: 'C', to: 'F', value: '0' }));
    expect(c.output).toBeCloseTo(32, 10);
    expect(completeConversionValue(c)).toBe(c.output);
  });

  it('rejects tampered / incoherent results (guard reconciles via a convert recompute)', () => {
    const c = computeConversion(vals());
    expect(Number.isNaN(completeConversionValue({ ...c, output: c.output + 1 }))).toBe(true); // wrong output
    expect(Number.isNaN(completeConversionValue({ ...c, from: 'kg' }))).toBe(true); // unit not in the category
    expect(Number.isNaN(completeConversionValue({ ...c, category: 'nope' }))).toBe(true); // unknown category
    expect(Number.isNaN(completeConversionValue({ ...c, output: Number.POSITIVE_INFINITY }))).toBe(true); // non-finite
    expect(Number.isNaN(completeConversionValue({ ...c, input: Number.NaN } as ConversionComputed))).toBe(true);
  });
});

describe('conversion binding — description + equation', () => {
  it('announces the dominant converted value with the target-unit label', () => {
    const c = computeConversion(vals({ category: 'mass', from: 'kg', to: 'lb', value: '1' }));
    expect(describeConversionResult(c)).toBe(`Converted value: ${conversionEquation(c).split(' = ')[1]}.`);
    expect(describeConversionResult(c)).toContain('Pounds');
  });

  it('the equation states both sides', () => {
    const c = computeConversion(vals({ category: 'length', from: 'mi', to: 'km', value: '1' }));
    expect(conversionEquation(c)).toContain('Miles');
    expect(conversionEquation(c)).toContain('Kilometres');
    expect(conversionEquation(c)).toContain('=');
  });

  it('a zero result announces normally', () => {
    const c = computeConversion(vals({ from: 'km', to: 'mi', value: '0' }));
    expect(describeConversionResult(c)).toBe('Converted value: 0 Miles.');
  });
});

describe('conversion binding — DOM read / reset (mock root)', () => {
  it('readValues reads the category, units and value', () => {
    const { root } = mockRoot({ category: 'temperature', from: 'C', to: 'K', value: '-273.15' });
    expect(conversionBinding.readValues(root)).toEqual({ category: 'temperature', from: 'C', to: 'K', value: '-273.15' });
  });

  it('resetValues restores the default category and the neutral value 1 (the island rebuilds units)', () => {
    const { root, store } = mockRoot({ category: 'mass', from: 'oz', to: 'g', value: '42' });
    conversionBinding.resetValues(root, 'personal');
    expect(store.category.value).toBe('length');
    expect(store.value.value).toBe('1');
  });
});

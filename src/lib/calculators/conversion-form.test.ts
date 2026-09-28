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
  allUnitRows,
  formatValue,
} from './conversion-form';
import { convert, CATEGORIES, formatConverted } from './conversion';

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

  it('opens on the conversion people come for, not on the first two units listed', () => {
    expect(DEFAULT_CATEGORY).toBe('length');
    // Micrometres to millimetres is nobody's question; metres to feet is.
    expect(defaultUnits('length')).toEqual({ from: 'm', to: 'ft' });
  });

  it('gives every category a sensible, deterministic default pair', () => {
    expect(defaultUnits('mass')).toEqual({ from: 'kg', to: 'lb' });
    expect(defaultUnits('temperature')).toEqual({ from: 'C', to: 'F' });
    expect(defaultUnits('data')).toEqual({ from: 'GB', to: 'GiB' });
    expect(defaultUnits('volume')).toEqual({ from: 'l', to: 'gal' });
    for (const c of CATEGORIES) {
      const { from, to } = defaultUnits(c.key);
      const keys = new Set(c.units.map((u) => u.key));
      expect(keys.has(from) && keys.has(to)).toBe(true);
      expect(from).not.toBe(to);
    }
  });

  it('falls back to the first two units for an unknown category', () => {
    expect(defaultUnits('nope')).toEqual(defaultUnits('length'));
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

describe('the whole category in the result', () => {
  const rows = (over = {}) => allUnitRows(computeConversion(vals(over)));

  it('gives one row per unit of the category, in its order', () => {
    const got = rows();
    const cat = CATEGORIES.find((c) => c.key === 'length')!;
    expect(got.map((r) => r.key)).toEqual(cat.units.map((u) => u.key));
    expect(got.map((r) => r.label)).toEqual(cat.units.map((u) => u.label));
  });

  it('marks the unit asked for and the unit started from', () => {
    const got = rows({ category: 'length', from: 'm', to: 'ft', value: '1' });
    expect(got.filter((r) => r.isTarget).map((r) => r.key)).toEqual(['ft']);
    expect(got.filter((r) => r.isSource).map((r) => r.key)).toEqual(['m']);
  });

  it('agrees with the headline answer for the requested unit', () => {
    const computed = computeConversion(vals({ category: 'mass', from: 'kg', to: 'lb', value: '70' }));
    const target = allUnitRows(computed).find((r) => r.isTarget)!;
    expect(target.value).toBe(formatValue(computed.output));
  });

  it('carries the note that disambiguates a unit', () => {
    const got = rows({ category: 'time', from: 'h', to: 'min', value: '1' });
    expect(got.find((r) => r.key === 'year')!.note).toContain('365.25');
    expect(got.find((r) => r.key === 'min')!.note).toBeUndefined();
  });

  it('never renders a placeholder or a non-finite figure, in any category', () => {
    for (const c of CATEGORIES) {
      const got = allUnitRows(
        computeConversion({ category: c.key, from: c.units[0].key, to: c.units[1].key, value: '1' }),
      );
      for (const r of got) {
        expect(r.value).not.toBe('—');
        expect(r.value).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });
});

describe('the displayed value survives the range a converter covers', () => {
  it('no longer rounds a tiny conversion to zero', () => {
    const c = computeConversion({ category: 'data', from: 'B', to: 'GB', value: '1' });
    expect(formatValue(c.output)).toBe('0.000000001');
    expect(formatValue(c.output)).not.toBe('0');
  });

  it('keeps an exact whole number whole', () => {
    const c = computeConversion({ category: 'data', from: 'TiB', to: 'B', value: '1' });
    expect(formatValue(c.output)).toBe('1,099,511,627,776');
  });

  it('matches the engine formatter exactly', () => {
    expect(formatValue(1234.5)).toBe(formatConverted(1234.5));
  });

  it('shows the definitional identities exactly, through the form', () => {
    for (const [category, from, to, want] of [
      ['volume', 'cup', 'tbsp', '16'],
      ['volume', 'gal', 'floz', '128'],
      ['mass', 'st', 'lb', '14'],
      ['area', 'ac', 'ft2', '43,560'],
    ] as const) {
      const c = computeConversion({ category, from, to, value: '1' });
      expect(formatValue(c.output)).toBe(want);
      expect(convert(1, from, to, category)).toBe(c.output);
    }
  });
});

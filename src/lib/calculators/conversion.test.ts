import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  convert,
  convertToAll,
  formatConverted,
  getCategory,
  getUnit,
} from './conversion';

/**
 * Unit conversion.
 *
 * The DEFINITIONAL IDENTITIES are the load-bearing part. Most of these units are defined exactly in
 * terms of one another — sixteen tablespoons to a cup, fourteen pounds to a stone, 43,560 square
 * feet to an acre — and those are the relationships a reader already knows. A converter that answers
 * 15.999946 tablespoons is not slightly imprecise; it looks broken. Every one is asserted here on
 * the DISPLAYED value, which is what a visitor actually sees.
 */

describe('the catalogue', () => {
  it('covers twelve categories', () => {
    expect(CATEGORIES.map((c) => c.key)).toEqual([
      'length', 'mass', 'volume', 'area', 'speed', 'time',
      'energy', 'pressure', 'power', 'angle', 'data', 'temperature',
    ]);
  });

  it('gives every category a base, a default pair and at least three units', () => {
    for (const c of CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.base.length).toBeGreaterThan(0);
      expect(c.units.length).toBeGreaterThanOrEqual(3);
      expect(c.defaults).toHaveLength(2);
    }
  });

  it('points every default pair at units the category actually has, and never at itself', () => {
    for (const c of CATEGORIES) {
      const keys = new Set(c.units.map((u) => u.key));
      const [from, to] = c.defaults;
      expect(keys.has(from)).toBe(true);
      expect(keys.has(to)).toBe(true);
      expect(from).not.toBe(to);
    }
  });

  it('keeps unit keys unique within a category and gives each exactly one base unit', () => {
    for (const c of CATEGORIES) {
      const keys = c.units.map((u) => u.key);
      expect(new Set(keys).size).toBe(keys.length);
      if (c.key === 'temperature') continue; // all three are scale-1 with offsets
      expect(c.units.filter((u) => u.toBase === 1)).toHaveLength(1);
    }
  });

  it('gives every unit a positive finite factor', () => {
    for (const c of CATEGORIES) {
      for (const u of c.units) {
        expect(Number.isFinite(u.toBase)).toBe(true);
        expect(u.toBase).toBeGreaterThan(0);
      }
    }
  });

  it('finds a category and a unit by key, and nothing by a bad one', () => {
    expect(getCategory('length')?.label).toBe('Length');
    expect(getCategory('nope')).toBeUndefined();
    expect(getUnit('mass', 'lb')?.label).toBe('Pounds');
    expect(getUnit('mass', 'nope')).toBeUndefined();
  });
});

describe('the definitional identities', () => {
  /** What the visitor sees, which is what has to be exact. */
  const shown = (value: number, from: string, to: string, cat: string) =>
    formatConverted(convert(value, from, to, cat));

  it.each([
    ['length', 'ft', 'in', 12],
    ['length', 'yd', 'ft', 3],
    ['length', 'mi', 'ft', 5280],
    ['length', 'mi', 'yd', 1760],
    ['length', 'km', 'm', 1000],
    ['length', 'nmi', 'm', 1852],
    ['mass', 'lb', 'oz', 16],
    ['mass', 'st', 'lb', 14],
    ['mass', 'ton_us', 'lb', 2000],
    ['mass', 'ton_uk', 'lb', 2240],
    ['mass', 'kg', 'g', 1000],
    ['volume', 'tbsp', 'tsp', 3],
    ['volume', 'cup', 'tbsp', 16],
    ['volume', 'cup', 'floz', 8],
    ['volume', 'pt', 'cup', 2],
    ['volume', 'qt', 'pt', 2],
    ['volume', 'gal', 'qt', 4],
    ['volume', 'gal', 'floz', 128],
    ['volume', 'gal_uk', 'floz_uk', 160],
    ['volume', 'gal_uk', 'pt_uk', 8],
    ['volume', 'm3', 'l', 1000],
    ['area', 'ft2', 'in2', 144],
    ['area', 'yd2', 'ft2', 9],
    ['area', 'ac', 'ft2', 43560],
    ['area', 'mi2', 'ac', 640],
    ['area', 'ha', 'm2', 10000],
    ['time', 'min', 's', 60],
    ['time', 'h', 'min', 60],
    ['time', 'day', 'h', 24],
    ['time', 'week', 'day', 7],
    ['energy', 'kcal', 'cal', 1000],
    ['energy', 'kWh', 'Wh', 1000],
    ['energy', 'kWh', 'J', 3_600_000],
    ['angle', 'turn', 'deg', 360],
    ['angle', 'deg', 'arcmin', 60],
    ['angle', 'deg', 'arcsec', 3600],
    ['data', 'KiB', 'B', 1024],
    ['data', 'GiB', 'MiB', 1024],
    ['data', 'TiB', 'B', 1_099_511_627_776],
    ['data', 'GB', 'MB', 1000],
    ['pressure', 'bar', 'Pa', 100000],
  ])('1 %s %s is exactly %s %s', (cat, from, to, expected) => {
    expect(shown(1, from as string, to as string, cat as string)).toBe(
      (expected as number).toLocaleString('en-US'),
    );
  });

  it('a UK pint is a fifth larger than a US one, and both are offered', () => {
    const us = convert(1, 'pt', 'ml', 'volume');
    const uk = convert(1, 'pt_uk', 'ml', 'volume');
    expect(uk).toBeGreaterThan(us);
    expect(uk / us).toBeCloseTo(1.2009, 4);
  });
});

describe('conversion', () => {
  it('is its own inverse', () => {
    for (const c of CATEGORIES) {
      for (const u of c.units) {
        const there = convert(7.25, c.units[0].key, u.key, c.key);
        const back = convert(there, u.key, c.units[0].key, c.key);
        expect(back).toBeCloseTo(7.25, 8);
      }
    }
  });

  it('returns the value unchanged between identical units', () => {
    for (const c of CATEGORIES) {
      for (const u of c.units) expect(convert(3.5, u.key, u.key, c.key)).toBe(3.5);
    }
  });

  it('scales linearly', () => {
    expect(convert(2, 'km', 'mi', 'length')).toBeCloseTo(2 * convert(1, 'km', 'mi', 'length'), 12);
    expect(convert(0, 'km', 'mi', 'length')).toBe(0);
  });

  it('refuses an unknown category or unit rather than guessing', () => {
    expect(convert(1, 'km', 'mi', 'nope')).toBeNaN();
    expect(convert(1, 'nope', 'mi', 'length')).toBeNaN();
    expect(convert(1, 'km', 'nope', 'length')).toBeNaN();
    expect(convert(1, 'kg', 'mi', 'length')).toBeNaN();
  });

  it('never turns a non-finite input into a rendered infinity', () => {
    expect(convert(Number.NaN, 'km', 'mi', 'length')).toBeNaN();
    expect(convert(Number.POSITIVE_INFINITY, 'km', 'mi', 'length')).toBeNaN();
    expect(convert(Number.NEGATIVE_INFINITY, 'C', 'F', 'temperature')).toBeNaN();
  });
});

describe('temperature, the one category with an offset', () => {
  it('converts the fixed points', () => {
    expect(convert(0, 'C', 'F', 'temperature')).toBe(32);
    expect(convert(100, 'C', 'F', 'temperature')).toBe(212);
    expect(convert(0, 'C', 'K', 'temperature')).toBe(273.15);
    expect(convert(212, 'F', 'C', 'temperature')).toBeCloseTo(100, 12);
    expect(convert(273.15, 'K', 'C', 'temperature')).toBeCloseTo(0, 12);
  });

  it('meets itself at minus forty', () => {
    expect(convert(-40, 'C', 'F', 'temperature')).toBeCloseTo(-40, 12);
  });

  it('handles negatives, which no other category needs', () => {
    expect(convert(-273.15, 'C', 'K', 'temperature')).toBeCloseTo(0, 12);
    expect(convert(-10, 'C', 'F', 'temperature')).toBeCloseTo(14, 12);
  });

  it('refuses an unknown temperature unit', () => {
    expect(convert(1, 'C', 'R', 'temperature')).toBeNaN();
    expect(convert(1, 'R', 'C', 'temperature')).toBeNaN();
  });
});

describe('the whole category at once', () => {
  it('returns one row per unit, in the category order', () => {
    const rows = convertToAll(1, 'm', 'length');
    expect(rows.map((r) => r.unit.key)).toEqual(getCategory('length')!.units.map((u) => u.key));
    expect(rows.find((r) => r.unit.key === 'm')!.value).toBe(1);
    expect(rows.find((r) => r.unit.key === 'cm')!.value).toBeCloseTo(100, 9);
  });

  it('agrees with converting each unit one at a time', () => {
    for (const c of CATEGORIES) {
      for (const row of convertToAll(2.5, c.units[0].key, c.key)) {
        expect(row.value).toBe(convert(2.5, c.units[0].key, row.unit.key, c.key));
      }
    }
  });

  it('gives nothing for an unknown category', () => {
    expect(convertToAll(1, 'm', 'nope')).toEqual([]);
  });
});

describe('formatting across the range a converter has to cover', () => {
  it('keeps a tiny value instead of rounding it to zero', () => {
    // Six fixed decimals used to turn every one of these into "0".
    expect(formatConverted(convert(1, 'B', 'GB', 'data'))).toBe('0.000000001');
    expect(formatConverted(convert(1, 'mg', 't', 'mass'))).toBe('1e-9');
    expect(formatConverted(convert(1, 's', 'year', 'time'))).not.toBe('0');
    expect(formatConverted(convert(1, 'mm', 'mi', 'length'))).not.toBe('0');
  });

  it('prints an exact whole number in full rather than rounding it', () => {
    expect(formatConverted(1_099_511_627_776)).toBe('1,099,511,627,776');
    expect(formatConverted(1_609_344)).toBe('1,609,344');
  });

  it('groups thousands and trims noise', () => {
    expect(formatConverted(1234567.891)).toBe('1,234,567.891');
    expect(formatConverted(12.000000000000002)).toBe('12');
    expect(formatConverted(0.5)).toBe('0.5');
  });

  it('drops to exponent notation only at the extremes', () => {
    expect(formatConverted(1e-12)).toMatch(/e-12$/);
    expect(formatConverted(1e20)).toMatch(/e\+?20$/);
    expect(formatConverted(0.000001)).toBe('0.000001');
  });

  it('never prints a non-finite figure', () => {
    expect(formatConverted(Number.NaN)).toBe('—');
    expect(formatConverted(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatConverted(0)).toBe('0');
  });

  it('renders every unit of every category without a placeholder', () => {
    for (const c of CATEGORIES) {
      for (const row of convertToAll(1, c.units[0].key, c.key)) {
        const text = formatConverted(row.value);
        expect(text).not.toBe('—');
        expect(text).not.toMatch(/NaN|Infinity|undefined/);
      }
    }
  });
});

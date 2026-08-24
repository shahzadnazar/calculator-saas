import { describe, it, expect } from 'vitest';
import { convert, CATEGORIES } from './conversion';

/**
 * R18C3 Commit 1 — dedicated, expanded characterization of the Conversion calculator's source
 * (conversion.ts), FROZEN before the task-first migration. Test-only: conversion.ts is UNCHANGED.
 * Consolidated out of batch-e.test.ts (which held unit-conversion coverage only and is removed).
 *
 * conversion.ts is factor-based: every unit stores a multiplier to its category's base unit, and a
 * conversion is (value × from.toBase) / to.toBase. Temperature is the one AFFINE category — it routes
 * through Celsius via dedicated formulas, so its zero is NOT preserved and a "× factor" model does not
 * apply. convert() returns NaN for an unknown category or unit and does not otherwise guard its input.
 */

const catByKey = new Map(CATEGORIES.map((c) => [c.key, c]));
const unitKeys = (key: string) => catByKey.get(key)!.units.map((u) => u.key);

describe('conversion: category inventory (frozen)', () => {
  it('exposes exactly the seven categories in order', () => {
    expect(CATEGORIES.map((c) => c.key)).toEqual(['length', 'mass', 'volume', 'area', 'speed', 'data', 'temperature']);
  });

  it('carries the public category labels', () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual([
      'Length', 'Weight / Mass', 'Volume', 'Area', 'Speed', 'Digital storage', 'Temperature',
    ]);
  });

  it('carries the exact unit keys per category (ordering is contract-significant — the UI defaults to units[0] → units[1])', () => {
    expect(unitKeys('length')).toEqual(['mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi']);
    expect(unitKeys('mass')).toEqual(['mg', 'g', 'kg', 't', 'oz', 'lb', 'st']);
    expect(unitKeys('volume')).toEqual(['ml', 'l', 'm3', 'tsp', 'tbsp', 'floz', 'cup', 'pt', 'qt', 'gal']);
    expect(unitKeys('area')).toEqual(['cm2', 'm2', 'ha', 'km2', 'ft2', 'ac', 'mi2']);
    expect(unitKeys('speed')).toEqual(['mps', 'kmh', 'mph', 'knot', 'fps']);
    expect(unitKeys('data')).toEqual(['B', 'KB', 'MB', 'GB', 'TB', 'KiB', 'MiB', 'GiB']);
    expect(unitKeys('temperature')).toEqual(['C', 'F', 'K']);
  });

  it('every unit carries a non-empty label', () => {
    for (const c of CATEGORIES) for (const u of c.units) expect(u.label.length).toBeGreaterThan(0);
  });
});

describe('conversion: same-unit identity', () => {
  it('a value converted to its own unit is unchanged (multiplicative categories)', () => {
    expect(convert(7, 'm', 'm', 'length')).toBe(7);
    expect(convert(3.5, 'kg', 'kg', 'mass')).toBe(3.5);
    expect(convert(0, 'l', 'l', 'volume')).toBe(0);
  });

  it('temperature same-unit is an identity (within floating point)', () => {
    expect(convert(7, 'C', 'C', 'temperature')).toBe(7);
    expect(convert(98.6, 'F', 'F', 'temperature')).toBeCloseTo(98.6, 10);
    expect(convert(300, 'K', 'K', 'temperature')).toBeCloseTo(300, 10);
  });
});

describe('conversion: forward / reverse / round-trip (multiplicative categories)', () => {
  it('length', () => {
    expect(convert(1, 'km', 'm', 'length')).toBeCloseTo(1000, 6);
    expect(convert(1, 'km', 'mi', 'length')).toBeCloseTo(0.621371, 6);
    expect(convert(1, 'mi', 'km', 'length')).toBeCloseTo(1.609344, 6);
    expect(convert(1, 'in', 'cm', 'length')).toBeCloseTo(2.54, 6);
    expect(convert(100, 'cm', 'm', 'length')).toBeCloseTo(1, 6);
  });

  it('mass', () => {
    expect(convert(1, 'lb', 'kg', 'mass')).toBeCloseTo(0.453592, 6);
    expect(convert(1, 'kg', 'lb', 'mass')).toBeCloseTo(2.204624, 6);
    expect(convert(1, 'st', 'lb', 'mass')).toBeCloseTo(14.000004, 5); // 6.35029 factor is not exactly 14 lb
    expect(convert(1, 'oz', 'g', 'mass')).toBeCloseTo(28.3495, 4);
  });

  it('volume', () => {
    expect(convert(1, 'gal', 'l', 'volume')).toBeCloseTo(3.78541, 5);
    expect(convert(1, 'l', 'gal', 'volume')).toBeCloseTo(0.264172, 6);
    expect(convert(1, 'cup', 'ml', 'volume')).toBeCloseTo(236.588, 3);
  });

  it('area', () => {
    expect(convert(1, 'ha', 'm2', 'area')).toBeCloseTo(10000, 6);
    expect(convert(1, 'ac', 'm2', 'area')).toBeCloseTo(4046.86, 2);
    expect(convert(1, 'mi2', 'km2', 'area')).toBeCloseTo(2.589988, 6);
  });

  it('speed', () => {
    expect(convert(1, 'mph', 'kmh', 'speed')).toBeCloseTo(1.609343, 5);
    expect(convert(1, 'knot', 'kmh', 'speed')).toBeCloseTo(1.851997, 5);
    expect(convert(1, 'mps', 'kmh', 'speed')).toBeCloseTo(3.599997, 5);
  });

  it('digital storage — decimal and binary', () => {
    expect(convert(1, 'MB', 'KB', 'data')).toBe(1000);
    expect(convert(1, 'KiB', 'B', 'data')).toBe(1024);
    expect(convert(1, 'GiB', 'MiB', 'data')).toBeCloseTo(1024, 6);
    expect(convert(5, 'TB', 'B', 'data')).toBe(5_000_000_000_000);
  });

  it('reverse conversion round-trips back to the original within source precision', () => {
    for (const [v, f, t, c] of [
      [1, 'km', 'mi', 'length'],
      [5, 'lb', 'kg', 'mass'],
      [2, 'gal', 'l', 'volume'],
      [3, 'GiB', 'MiB', 'data'],
    ] as const) {
      expect(convert(convert(v, f, t, c), t, f, c)).toBeCloseTo(v, 9);
    }
  });
});

describe('conversion: zero and decimals', () => {
  it('zero stays zero for multiplicative categories', () => {
    expect(convert(0, 'km', 'mi', 'length')).toBe(0);
    expect(convert(0, 'kg', 'lb', 'mass')).toBe(0);
    expect(convert(0, 'GiB', 'B', 'data')).toBe(0);
  });

  it('a decimal input converts proportionally', () => {
    expect(convert(2.5, 'kg', 'lb', 'mass')).toBeCloseTo(5.511561, 6);
    expect(convert(0.5, 'm', 'cm', 'length')).toBeCloseTo(50, 6);
  });

  it('a very small and a very large finite value stay finite', () => {
    expect(convert(1, 'mm', 'km', 'length')).toBeCloseTo(0.000001, 12);
    expect(Number.isFinite(convert(1e9, 'mm', 'km', 'length'))).toBe(true);
  });
});

describe('conversion: negative inputs (source computes them, no guard)', () => {
  it('a negative multiplicative input scales negatively', () => {
    expect(convert(-5, 'km', 'm', 'length')).toBe(-5000);
  });

  it('a negative temperature converts through the affine formula', () => {
    expect(convert(-10, 'C', 'F', 'temperature')).toBeCloseTo(14, 10);
    expect(convert(-40, 'C', 'F', 'temperature')).toBeCloseTo(-40, 10); // the crossover point
  });
});

describe('conversion: temperature — the AFFINE category (special formulas)', () => {
  it('Celsius ↔ Fahrenheit', () => {
    expect(convert(0, 'C', 'F', 'temperature')).toBeCloseTo(32, 10);
    expect(convert(100, 'C', 'F', 'temperature')).toBeCloseTo(212, 10);
    expect(convert(32, 'F', 'C', 'temperature')).toBeCloseTo(0, 10);
    expect(convert(98.6, 'F', 'C', 'temperature')).toBeCloseTo(37, 10);
  });

  it('Celsius ↔ Kelvin', () => {
    expect(convert(0, 'C', 'K', 'temperature')).toBeCloseTo(273.15, 10);
    expect(convert(273.15, 'K', 'C', 'temperature')).toBeCloseTo(0, 10);
    expect(convert(-273.15, 'C', 'K', 'temperature')).toBeCloseTo(0, 10); // absolute zero
  });

  it('zero is NOT preserved (affine) — 0 °C is 32 °F, not 0', () => {
    expect(convert(0, 'C', 'F', 'temperature')).not.toBe(0);
    expect(convert(0, 'C', 'F', 'temperature')).toBeCloseTo(32, 10);
  });
});

describe('conversion: invalid inputs (exact source API)', () => {
  it('an unknown category / from unit / to unit returns NaN', () => {
    expect(Number.isNaN(convert(1, 'km', 'mi', 'nope'))).toBe(true);
    expect(Number.isNaN(convert(1, 'foo', 'mi', 'length'))).toBe(true);
    expect(Number.isNaN(convert(1, 'km', 'foo', 'length'))).toBe(true);
    // a unit from the WRONG category is unknown within the requested category
    expect(Number.isNaN(convert(1, 'kg', 'mi', 'length'))).toBe(true);
  });

  it('NaN in yields NaN out; Infinity in yields Infinity out (no input guard)', () => {
    expect(Number.isNaN(convert(Number.NaN, 'km', 'mi', 'length'))).toBe(true);
    expect(convert(Number.POSITIVE_INFINITY, 'km', 'mi', 'length')).toBe(Number.POSITIVE_INFINITY);
  });
});

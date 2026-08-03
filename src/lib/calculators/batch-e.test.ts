import { describe, it, expect } from 'vitest';
import { convert } from './conversion';

// GPA coverage now lives in `gpa.test.ts` (R16B1) and Grade coverage in
// `grade.test.ts` (R16B2); batch-e now holds unit-conversion coverage only.

describe('unit conversion', () => {
  it('converts length', () => {
    expect(convert(1, 'km', 'm', 'length')).toBeCloseTo(1000, 6);
    expect(convert(100, 'cm', 'm', 'length')).toBeCloseTo(1, 6);
    expect(convert(1, 'mi', 'km', 'length')).toBeCloseTo(1.609344, 5);
  });
  it('converts mass and volume', () => {
    expect(convert(1, 'lb', 'kg', 'mass')).toBeCloseTo(0.453592, 5);
    expect(convert(1, 'gal', 'l', 'volume')).toBeCloseTo(3.78541, 4);
  });
  it('converts temperature with the special formulas', () => {
    expect(convert(0, 'C', 'F', 'temperature')).toBeCloseTo(32, 6);
    expect(convert(100, 'C', 'F', 'temperature')).toBeCloseTo(212, 6);
    expect(convert(32, 'F', 'C', 'temperature')).toBeCloseTo(0, 6);
    expect(convert(0, 'C', 'K', 'temperature')).toBeCloseTo(273.15, 6);
  });
  it('converts digital storage (binary)', () => {
    expect(convert(1, 'KiB', 'B', 'data')).toBe(1024);
    expect(convert(1, 'GiB', 'MiB', 'data')).toBeCloseTo(1024, 6);
  });
});

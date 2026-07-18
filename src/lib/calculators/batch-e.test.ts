import { describe, it, expect } from 'vitest';
import { calculateGPA } from './gpa';
import { weightedGrade, finalScoreNeeded } from './grade';
import { convert } from './conversion';

describe('GPA', () => {
  it('computes weighted GPA', () => {
    const r = calculateGPA([
      { gradePoints: 4.0, credits: 3 },
      { gradePoints: 3.0, credits: 4 },
      { gradePoints: 3.7, credits: 3 },
    ]);
    expect(r.totalCredits).toBe(10);
    expect(r.gpa).toBeCloseTo(3.51, 2);
  });
  it('returns NaN with no credits', () => {
    expect(Number.isNaN(calculateGPA([]).gpa)).toBe(true);
  });
});

describe('grade', () => {
  it('computes a weighted average', () => {
    expect(weightedGrade([{ score: 90, weight: 50 }, { score: 80, weight: 50 }]).grade).toBeCloseTo(85, 6);
    expect(weightedGrade([{ score: 100, weight: 20 }, { score: 60, weight: 80 }]).grade).toBeCloseTo(68, 6);
  });
  it('computes the score needed on a final', () => {
    expect(finalScoreNeeded(85, 30, 90)).toBeCloseTo(101.67, 1); // unreachable
    expect(finalScoreNeeded(80, 40, 85)).toBeCloseTo(92.5, 1);
  });
});

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

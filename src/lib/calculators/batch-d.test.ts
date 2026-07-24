import { describe, it, expect } from 'vitest';
import { solveTriangleSSS } from './triangle';
import { randomIntegers } from './random-number';
import { toSeconds, combineDurations, breakdownDuration } from './time';

// NOTE: Concrete cases moved to the dedicated `concrete.test.ts` (R10C1 characterization).

describe('triangle (SSS)', () => {
  it('solves a 3-4-5 right triangle', () => {
    const r = solveTriangleSSS(3, 4, 5);
    expect(r.valid).toBe(true);
    expect(r.angleC).toBeCloseTo(90, 2);
    expect(r.area).toBeCloseTo(6, 3);
    expect(r.perimeter).toBe(12);
    expect(r.sideType).toBe('Scalene');
    expect(r.angleType).toBe('Right');
  });
  it('classifies an equilateral triangle', () => {
    const r = solveTriangleSSS(5, 5, 5);
    expect(r.angleA).toBeCloseTo(60, 2);
    expect(r.sideType).toBe('Equilateral');
    expect(r.angleType).toBe('Acute');
  });
  it('rejects an impossible triangle', () => {
    expect(solveTriangleSSS(1, 1, 5).valid).toBe(false);
  });
});

describe('random integers', () => {
  it('is deterministic with an injected RNG', () => {
    expect(randomIntegers({ min: 1, max: 10, count: 3, unique: false }, () => 0)).toEqual([1, 1, 1]);
    expect(randomIntegers({ min: 1, max: 10, count: 3, unique: true }, () => 0)).toEqual([1, 2, 3]);
  });
  it('keeps values in range and honours count', () => {
    const out = randomIntegers({ min: 5, max: 8, count: 20, unique: false });
    expect(out.length).toBe(20);
    expect(out.every((n) => n >= 5 && n <= 8)).toBe(true);
  });
  it('caps unique draws at the range size and yields distinct values', () => {
    const out = randomIntegers({ min: 1, max: 5, count: 100, unique: true });
    expect(out.length).toBe(5);
    expect(new Set(out).size).toBe(5);
  });
});

describe('time arithmetic', () => {
  it('adds durations', () => {
    const a = toSeconds({ hours: 2, minutes: 30 });
    const b = toSeconds({ hours: 1, minutes: 45 });
    const total = combineDurations(a, 'add', b);
    const d = breakdownDuration(total);
    expect(d).toMatchObject({ hours: 4, minutes: 15, negative: false });
  });
  it('handles negative results', () => {
    const d = breakdownDuration(combineDurations(60, 'subtract', 150));
    expect(d.negative).toBe(true);
    expect(d).toMatchObject({ minutes: 1, seconds: 30 });
  });
});

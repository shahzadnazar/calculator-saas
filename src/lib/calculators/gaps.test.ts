import { describe, it, expect } from 'vitest';
import { calculateArea } from './area';
import { calculateVolume } from './volume';

// NOTE: Tip cases moved to the dedicated `tip.test.ts` (R9B1 characterization).
// NOTE: Square-footage cases moved to the dedicated `square-footage.test.ts` (R10B1 characterization).

describe('area', () => {
  it('computes shape areas', () => {
    expect(calculateArea('rectangle', { length: 4, width: 5 })).toBe(20);
    expect(calculateArea('square', { side: 5 })).toBe(25);
    expect(calculateArea('triangle', { base: 6, height: 4 })).toBe(12);
    expect(calculateArea('circle', { radius: 2 })).toBeCloseTo(12.566, 3);
    expect(calculateArea('trapezoid', { a: 3, b: 5, height: 4 })).toBe(16);
  });
});

describe('volume', () => {
  it('computes shape volumes', () => {
    expect(calculateVolume('cube', { side: 3 })).toBe(27);
    expect(calculateVolume('box', { length: 2, width: 3, height: 4 })).toBe(24);
    expect(calculateVolume('sphere', { radius: 3 })).toBeCloseTo(113.097, 2);
    expect(calculateVolume('cylinder', { radius: 2, height: 5 })).toBeCloseTo(62.832, 2);
    expect(calculateVolume('cone', { radius: 3, height: 6 })).toBeCloseTo(56.549, 2);
  });
});

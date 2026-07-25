import { describe, it, expect } from 'vitest';
import { calculateVolume } from './volume';

// NOTE: Tip cases moved to the dedicated `tip.test.ts` (R9B1 characterization).
// NOTE: Square-footage cases moved to the dedicated `square-footage.test.ts` (R10B1 characterization).
// NOTE: Area cases moved to the dedicated `area.test.ts` (R12B1 characterization; expanded to all 7 shapes).

describe('volume', () => {
  it('computes shape volumes', () => {
    expect(calculateVolume('cube', { side: 3 })).toBe(27);
    expect(calculateVolume('box', { length: 2, width: 3, height: 4 })).toBe(24);
    expect(calculateVolume('sphere', { radius: 3 })).toBeCloseTo(113.097, 2);
    expect(calculateVolume('cylinder', { radius: 2, height: 5 })).toBeCloseTo(62.832, 2);
    expect(calculateVolume('cone', { radius: 3, height: 6 })).toBeCloseTo(56.549, 2);
  });
});

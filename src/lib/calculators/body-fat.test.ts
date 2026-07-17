import { describe, it, expect } from 'vitest';
import { calculateBodyFat } from './body-fat';

describe('body fat (U.S. Navy method)', () => {
  it('computes male body fat', () => {
    const r = calculateBodyFat({ sex: 'male', system: 'metric', heightCm: 180, neckCm: 38, waistCm: 85 });
    expect(r.bodyFatPct).toBeCloseTo(16.1, 0); // within 0.5
    expect(r.category).toBe('Fitness');
  });

  it('computes female body fat (uses hip)', () => {
    const r = calculateBodyFat({ sex: 'female', system: 'metric', heightCm: 165, neckCm: 34, waistCm: 74, hipCm: 96 });
    expect(r.bodyFatPct).toBeCloseTo(26.4, 0);
    expect(r.category).toBe('Average');
  });

  it('returns NaN for impossible measurements', () => {
    const r = calculateBodyFat({ sex: 'male', system: 'metric', heightCm: 180, neckCm: 40, waistCm: 40 });
    expect(Number.isNaN(r.bodyFatPct)).toBe(true);
  });
});

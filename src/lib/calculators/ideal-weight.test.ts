import { describe, it, expect } from 'vitest';
import { calculateIdealWeight } from './ideal-weight';

describe('ideal weight', () => {
  it('computes metric (kg) for a 180cm male', () => {
    const r = calculateIdealWeight({ sex: 'male', system: 'metric', heightCm: 180 });
    expect(r.unit).toBe('kg');
    // Devine male: 50 + 2.3 * (70.87 - 60) ≈ 75.0
    expect(r.devine).toBeCloseTo(75.0, 0);
    expect(r.robinson).toBeGreaterThan(70);
    expect(r.bmiMin).toBeGreaterThan(0);
    expect(r.bmiMax).toBeGreaterThan(r.bmiMin);
  });

  it('returns pounds for imperial input', () => {
    const r = calculateIdealWeight({ sex: 'male', system: 'imperial', heightFt: 5, heightIn: 10 });
    expect(r.unit).toBe('lb');
    // Devine male at 70in: 50 + 2.3*10 = 73 kg ≈ 160.9 lb
    expect(r.devine).toBeCloseTo(160.9, 0);
  });

  it('differs by sex', () => {
    const male = calculateIdealWeight({ sex: 'male', system: 'metric', heightCm: 170 });
    const female = calculateIdealWeight({ sex: 'female', system: 'metric', heightCm: 170 });
    expect(female.devine).toBeLessThan(male.devine);
  });
});
